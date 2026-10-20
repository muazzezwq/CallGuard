// Pure Stage 1 payment state machine.
//
// This module has no store, signer, Redis client, route, or environment access.
// It defines the versioned operation and nonce-reservation records, their legal
// transitions, revision rules, and recovery-lease semantics. Nothing here is
// wired into the production default handler.
//
// Legacy version-1 operation records are read-only here. In particular, a
// version-1 `prepared` record is ambiguous: it may or may not own a signed
// transaction. It must never be abandoned or expired automatically.

// Transition semantics are forward-only. `signed -> broadcast` is valid forward
// progress. After `signed`, a record may not return to `prepared`,
// `nonce_reserved`, or `signed`; after `broadcast`, it may not return to any of
// those states or `broadcast`; after `unknown`, it may not return to any
// submission state. `signed -> unknown` and `broadcast -> unknown` are valid
// uncertain outcomes.
//
// Validation layers:
//   * validate*Record: structural schema only (types, identities, state names,
//     revisions, lease shape, and transaction field format).
//   * plan*Transition: pure legality and compare-and-set intent. It does not
//     perform durable persistence, atomic cross-record writes, or read-back.
//     It compares expectedRevision when supplied, but it is not itself a CAS.
//     The future store must always perform an atomic revision compare-and-set.
//   * Future store adapter: atomic create, revision CAS, lease claim, and
//     fail-closed behavior.
//   * Stage 3 submission protocol: signed-transaction persistence and read-back.
//
// Stage 3 requirement (not implemented here): a `nonce_reserved -> signed`
// transition must not be accepted unless the exact raw signed transaction and
// its verified hash can be durably persisted atomically with the nonce
// reservation. The caller must read back both records and verify them before
// any `signed -> broadcast` transition.

export const OPERATION_RECORD_VERSION = 2;
export const NONCE_RESERVATION_RECORD_VERSION = 2;
export const LEGACY_OPERATION_RECORD_VERSION = 1;
export const RECOVERY_LEASE_VERSION = 1;

export const OPERATION_STATES = Object.freeze([
  "prepared",
  "nonce_reserved",
  "signed",
  "broadcast",
  "unknown",
  "confirmed",
  "reverted",
  "abandoned",
]);

export const NONCE_RESERVATION_STATES = Object.freeze([
  "reserved",
  "signed",
  "broadcast",
  "unknown",
  "confirmed",
  "reverted",
  "released",
]);

export const TERMINAL_OPERATION_STATES = Object.freeze([
  "confirmed",
  "reverted",
  "abandoned",
]);

export const TERMINAL_NONCE_RESERVATION_STATES = Object.freeze([
  "confirmed",
  "reverted",
  "released",
]);

export const RECOVERABLE_OPERATION_STATES = Object.freeze([
  "nonce_reserved",
  "signed",
  "broadcast",
  "unknown",
]);

export const RECOVERABLE_NONCE_RESERVATION_STATES = Object.freeze([
  "reserved",
  "signed",
  "broadcast",
  "unknown",
]);

const OPERATION_TRANSITIONS = Object.freeze({
  prepared: Object.freeze(["nonce_reserved", "abandoned"]),
  nonce_reserved: Object.freeze(["signed", "abandoned"]),
  signed: Object.freeze(["broadcast", "unknown"]),
  broadcast: Object.freeze(["unknown", "confirmed", "reverted"]),
  unknown: Object.freeze(["confirmed", "reverted"]),
  confirmed: Object.freeze([]),
  reverted: Object.freeze([]),
  abandoned: Object.freeze([]),
});

const NONCE_RESERVATION_TRANSITIONS = Object.freeze({
  reserved: Object.freeze(["signed", "released"]),
  signed: Object.freeze(["broadcast", "unknown"]),
  broadcast: Object.freeze(["unknown", "confirmed", "reverted"]),
  unknown: Object.freeze(["confirmed", "reverted"]),
  confirmed: Object.freeze([]),
  reverted: Object.freeze([]),
  released: Object.freeze([]),
});

const OPERATION_PROTECTED_PATCH_FIELDS = Object.freeze([
  "version",
  "kind",
  "operationId",
  "authId",
  "fingerprint",
  "createdAt",
  "updatedAt",
  "state",
  "revision",
  "lease",
]);

const NONCE_PROTECTED_PATCH_FIELDS = Object.freeze([
  "version",
  "kind",
  "reservationId",
  "sender",
  "nonce",
  "operationId",
  "createdAt",
  "updatedAt",
  "state",
  "revision",
  "lease",
]);

export class StateMachineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StateMachineError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StateMachineError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isTimestamp(value) {
  return Number.isInteger(value) && value >= 0;
}

function assertTimestamp(value, name) {
  if (!isTimestamp(value)) fail("INVALID_TIMESTAMP", `${name} must be a non-negative integer`);
}

function assertPatchAllowed(patch, protectedFields) {
  if (!isPlainObject(patch)) fail("INVALID_PATCH", "patch must be an object");
  for (const field of Object.keys(patch)) {
    if (protectedFields.includes(field)) {
      fail("PROTECTED_FIELD", `patch cannot change ${field}`);
    }
  }
}

function assertExpectedRevision(record, expectedRevision) {
  if (!isNonNegativeInteger(expectedRevision)) {
    fail("INVALID_REVISION", "expectedRevision must be a non-negative integer");
  }
  if (record.revision !== expectedRevision) {
    fail("STALE_REVISION", `expected revision ${expectedRevision}, found ${record.revision}`);
  }
}

function assertValid(validation) {
  if (!validation.ok) fail("INVALID_RECORD", validation.errors.join("; "));
}

export function validateRecoveryLease(lease) {
  if (!isPlainObject(lease)) {
    return { ok: false, errors: ["lease must be an object"] };
  }
  const errors = [];
  if (lease.version !== RECOVERY_LEASE_VERSION) {
    errors.push(`lease.version must be ${RECOVERY_LEASE_VERSION}`);
  }
  if (!isNonEmptyString(lease.ownerId)) errors.push("lease.ownerId is required");
  if (!isNonEmptyString(lease.token)) errors.push("lease.token is required");
  if (!isTimestamp(lease.expiresAt)) {
    errors.push("lease.expiresAt must be a non-negative integer");
  }
  return { ok: errors.length === 0, errors };
}

export function validateOperationRecord(record) {
  if (!isPlainObject(record)) {
    return { ok: false, errors: ["record must be an object"] };
  }
  const errors = [];
  if (record.version !== OPERATION_RECORD_VERSION) {
    errors.push(`version must be ${OPERATION_RECORD_VERSION}`);
  }
  if (record.kind !== "operation") errors.push("kind must be operation");
  if (!isNonEmptyString(record.operationId)) errors.push("operationId is required");
  if (!isNonEmptyString(record.authId)) errors.push("authId is required");
  if (!isNonEmptyString(record.fingerprint) || !/^[0-9a-f]{64}$/i.test(record.fingerprint)) {
    errors.push("fingerprint must be 64 hexadecimal characters");
  }
  if (!OPERATION_STATES.includes(record.state)) errors.push("state is not an operation state");
  if (!isNonNegativeInteger(record.revision)) {
    errors.push("revision must be a non-negative integer");
  }
  if (!isTimestamp(record.createdAt)) errors.push("createdAt must be a non-negative integer");
  if (!isTimestamp(record.updatedAt)) errors.push("updatedAt must be a non-negative integer");
  if (!isNonNegativeInteger(record.attempts)) {
    errors.push("attempts must be a non-negative integer");
  }
  if (record.explicitKey !== undefined && !isNonEmptyString(record.explicitKey)) {
    errors.push("explicitKey must be a non-empty string when present");
  }
  if (record.txHash !== undefined && record.txHash !== null
    && (typeof record.txHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(record.txHash))) {
    errors.push("txHash must be a 32-byte hexadecimal string");
  }
  if (record.signedTransaction !== undefined && record.signedTransaction !== null
    && (typeof record.signedTransaction !== "string" || !/^0x[0-9a-f]+$/i.test(record.signedTransaction))) {
    errors.push("signedTransaction must be a hexadecimal string");
  }
  if (record.lastError !== undefined && !isNonEmptyString(record.lastError)) {
    errors.push("lastError must be a non-empty string when present");
  }
  if (record.lease === null) {
    // Explicitly unlocked.
  } else if (record.lease === undefined) {
    errors.push("lease must be null or a lease object");
  } else {
    const leaseValidation = validateRecoveryLease(record.lease);
    for (const error of leaseValidation.errors) errors.push(error);
  }
  return { ok: errors.length === 0, errors };
}

export function validateNonceReservationRecord(record) {
  if (!isPlainObject(record)) {
    return { ok: false, errors: ["record must be an object"] };
  }
  const errors = [];
  if (record.version !== NONCE_RESERVATION_RECORD_VERSION) {
    errors.push(`version must be ${NONCE_RESERVATION_RECORD_VERSION}`);
  }
  if (record.kind !== "nonce_reservation") errors.push("kind must be nonce_reservation");
  if (!isNonEmptyString(record.reservationId)) errors.push("reservationId is required");
  if (typeof record.sender !== "string" || !/^0x[0-9a-f]{40}$/i.test(record.sender)) {
    errors.push("sender must be an address");
  }
  if (!isNonNegativeInteger(record.nonce)) errors.push("nonce must be a non-negative integer");
  if (!isNonEmptyString(record.operationId)) errors.push("operationId is required");
  if (!NONCE_RESERVATION_STATES.includes(record.state)) {
    errors.push("state is not a nonce-reservation state");
  }
  if (!isNonNegativeInteger(record.revision)) {
    errors.push("revision must be a non-negative integer");
  }
  if (!isTimestamp(record.createdAt)) errors.push("createdAt must be a non-negative integer");
  if (!isTimestamp(record.updatedAt)) errors.push("updatedAt must be a non-negative integer");
  if (!isNonNegativeInteger(record.attempts)) {
    errors.push("attempts must be a non-negative integer");
  }
  if (record.txHash !== undefined && record.txHash !== null
    && (typeof record.txHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(record.txHash))) {
    errors.push("txHash must be a 32-byte hexadecimal string");
  }
  if (record.signedTransaction !== undefined && record.signedTransaction !== null
    && (typeof record.signedTransaction !== "string" || !/^0x[0-9a-f]+$/i.test(record.signedTransaction))) {
    errors.push("signedTransaction must be a hexadecimal string");
  }
  if (record.lease === null) {
    // Explicitly unlocked.
  } else if (record.lease === undefined) {
    errors.push("lease must be null or a lease object");
  } else {
    const leaseValidation = validateRecoveryLease(record.lease);
    for (const error of leaseValidation.errors) errors.push(error);
  }
  return { ok: errors.length === 0, errors };
}

export function createVersionedOperationRecord({
  operationId,
  authId = operationId,
  fingerprint,
  explicitKey = null,
  now = Date.now(),
}) {
  const record = {
    version: OPERATION_RECORD_VERSION,
    kind: "operation",
    operationId,
    authId,
    ...(explicitKey ? { explicitKey } : {}),
    fingerprint,
    state: "prepared",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lease: null,
    txHash: null,
    signedTransaction: null,
  };
  assertValid(validateOperationRecord(record));
  return record;
}

export function createNonceReservationRecord({
  reservationId,
  sender,
  nonce,
  operationId,
  now = Date.now(),
}) {
  const record = {
    version: NONCE_RESERVATION_RECORD_VERSION,
    kind: "nonce_reservation",
    reservationId,
    sender,
    nonce,
    operationId,
    state: "reserved",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lease: null,
    txHash: null,
    signedTransaction: null,
  };
  assertValid(validateNonceReservationRecord(record));
  return record;
}

export function classifyOperationRecord(record) {
  if (!isPlainObject(record) || record.kind !== "operation") return "invalid";
  if (record.version === OPERATION_RECORD_VERSION) return "current";
  if (record.version === LEGACY_OPERATION_RECORD_VERSION) return "legacy";
  return "unknown_version";
}

export function isLegacyOperationRecord(record) {
  return isPlainObject(record)
    && record.kind === "operation"
    && record.version === LEGACY_OPERATION_RECORD_VERSION;
}

export function isAmbiguousLegacyPreparedRecord(record) {
  return isLegacyOperationRecord(record) && record.state === "prepared";
}

export function isOperationState(state) {
  return OPERATION_STATES.includes(state);
}

export function isNonceReservationState(state) {
  return NONCE_RESERVATION_STATES.includes(state);
}

export function isTerminalState(kind, state) {
  if (kind === "operation") return TERMINAL_OPERATION_STATES.includes(state);
  if (kind === "nonce_reservation") return TERMINAL_NONCE_RESERVATION_STATES.includes(state);
  return false;
}

export function isUnresolvedState(kind, state) {
  if (kind === "operation") return isOperationState(state) && !isTerminalState(kind, state);
  if (kind === "nonce_reservation") {
    return isNonceReservationState(state) && !isTerminalState(kind, state);
  }
  return false;
}

export function isUnresolvedRecord(record) {
  if (!isPlainObject(record)) return false;
  if (isLegacyOperationRecord(record)) {
    return record.state !== "confirmed" && record.state !== "reverted";
  }
  return isUnresolvedState(record.kind, record.state);
}

export function isRecoverableState(kind, state) {
  if (kind === "operation") return RECOVERABLE_OPERATION_STATES.includes(state);
  if (kind === "nonce_reservation") {
    return RECOVERABLE_NONCE_RESERVATION_STATES.includes(state);
  }
  return false;
}

export function isOperationTransitionAllowed(from, to) {
  return isOperationState(from) && OPERATION_TRANSITIONS[from].includes(to);
}

export function isNonceReservationTransitionAllowed(from, to) {
  return isNonceReservationState(from) && NONCE_RESERVATION_TRANSITIONS[from].includes(to);
}

export function hasSignedTransaction(record) {
  if (!isPlainObject(record)) return false;
  return (typeof record.signedTransaction === "string" && record.signedTransaction.length > 0)
    || (typeof record.txHash === "string" && record.txHash.length > 0);
}

function validateRecordForKind(record) {
  if (isLegacyOperationRecord(record)) {
    fail("LEGACY_RECORD_READ_ONLY", "legacy operation records require explicit reconciliation");
  }
  if (!isPlainObject(record)) fail("INVALID_RECORD", "record must be an object");
  if (record.kind === "operation") {
    assertValid(validateOperationRecord(record));
    return "operation";
  }
  if (record.kind === "nonce_reservation") {
    assertValid(validateNonceReservationRecord(record));
    return "nonce_reservation";
  }
  fail("INVALID_RECORD", "record kind must be operation or nonce_reservation");
}

export function planOperationTransition(record, nextState, options = {}) {
  if (isLegacyOperationRecord(record)) {
    fail("LEGACY_RECORD_READ_ONLY", "legacy operation records require explicit reconciliation");
  }
  assertValid(validateOperationRecord(record));
  if (!isOperationState(nextState)) fail("INVALID_STATE", `unknown operation state ${nextState}`);

  const expectedState = options.expectedState === undefined ? record.state : options.expectedState;
  if (expectedState !== record.state) {
    fail("STATE_MISMATCH", `expected state ${expectedState}, found ${record.state}`);
  }
  const expectedRevision = options.expectedRevision === undefined
    ? record.revision
    : options.expectedRevision;
  assertExpectedRevision(record, expectedRevision);

  if (!isOperationTransitionAllowed(record.state, nextState)) {
    fail("ILLEGAL_TRANSITION", `${record.state} cannot transition to ${nextState}`);
  }
  if (nextState === "abandoned" && hasSignedTransaction(record)) {
    fail("SIGNED_TRANSACTION_EXISTS", "an operation with a signed transaction cannot be abandoned");
  }

  const now = options.now === undefined ? Date.now() : options.now;
  assertTimestamp(now, "now");
  const patch = options.patch === undefined ? {} : options.patch;
  assertPatchAllowed(patch, OPERATION_PROTECTED_PATCH_FIELDS);

  const next = {
    ...record,
    ...patch,
    state: nextState,
    revision: record.revision + 1,
    updatedAt: now,
  };
  assertValid(validateOperationRecord(next));
  return { ...patch, state: nextState, revision: record.revision + 1, updatedAt: now };
}

export function planNonceReservationTransition(record, nextState, options = {}) {
  assertValid(validateNonceReservationRecord(record));
  if (!isNonceReservationState(nextState)) {
    fail("INVALID_STATE", `unknown nonce-reservation state ${nextState}`);
  }

  const expectedState = options.expectedState === undefined ? record.state : options.expectedState;
  if (expectedState !== record.state) {
    fail("STATE_MISMATCH", `expected state ${expectedState}, found ${record.state}`);
  }
  const expectedRevision = options.expectedRevision === undefined
    ? record.revision
    : options.expectedRevision;
  assertExpectedRevision(record, expectedRevision);

  if (!isNonceReservationTransitionAllowed(record.state, nextState)) {
    fail("ILLEGAL_TRANSITION", `${record.state} cannot transition to ${nextState}`);
  }
  if (nextState === "released" && hasSignedTransaction(record)) {
    fail("SIGNED_TRANSACTION_EXISTS", "a signed nonce cannot be released");
  }

  const now = options.now === undefined ? Date.now() : options.now;
  assertTimestamp(now, "now");
  const patch = options.patch === undefined ? {} : options.patch;
  assertPatchAllowed(patch, NONCE_PROTECTED_PATCH_FIELDS);

  const next = {
    ...record,
    ...patch,
    state: nextState,
    revision: record.revision + 1,
    updatedAt: now,
  };
  assertValid(validateNonceReservationRecord(next));
  return { ...patch, state: nextState, revision: record.revision + 1, updatedAt: now };
}

export function createRecoveryLease({ ownerId, token, now = Date.now(), ttlMs }) {
  if (!isNonEmptyString(ownerId)) fail("INVALID_LEASE", "ownerId is required");
  if (!isNonEmptyString(token)) fail("INVALID_LEASE", "token is required");
  assertTimestamp(now, "now");
  if (!isPositiveInteger(ttlMs)) fail("INVALID_LEASE", "ttlMs must be a positive integer");
  const lease = {
    version: RECOVERY_LEASE_VERSION,
    ownerId,
    token,
    expiresAt: now + ttlMs,
  };
  assertValid(validateRecoveryLease(lease));
  return lease;
}

export function isLeaseExpired(lease, now = Date.now()) {
  if (lease === null || lease === undefined) return true;
  assertValid(validateRecoveryLease(lease));
  assertTimestamp(now, "now");
  return lease.expiresAt <= now;
}

export function hasActiveLease(record, now = Date.now()) {
  if (!isPlainObject(record) || record.lease === null || record.lease === undefined) return false;
  return !isLeaseExpired(record.lease, now);
}

export function canClaimLease(record, now = Date.now()) {
  try {
    const kind = validateRecordForKind(record);
    if (isTerminalState(kind, record.state)) return false;
    if (!isRecoverableState(kind, record.state)) return false;
    return !hasActiveLease(record, now);
  } catch {
    return false;
  }
}

export function planLeaseClaim(record, options = {}) {
  const kind = validateRecordForKind(record);
  if (isTerminalState(kind, record.state)) {
    fail("NOT_RECOVERABLE", `${record.state} is terminal`);
  }
  if (!isRecoverableState(kind, record.state)) {
    fail("NOT_RECOVERABLE", `${record.state} is not recoverable`);
  }

  const now = options.now === undefined ? Date.now() : options.now;
  assertTimestamp(now, "now");
  if (hasActiveLease(record, now)) fail("LEASE_ACTIVE", "record already has an active lease");

  const expectedRevision = options.expectedRevision === undefined
    ? record.revision
    : options.expectedRevision;
  assertExpectedRevision(record, expectedRevision);

  const lease = createRecoveryLease({
    ownerId: options.ownerId,
    token: options.token,
    now,
    ttlMs: options.ttlMs,
  });
  const next = { ...record, lease, revision: record.revision + 1, updatedAt: now };
  if (kind === "operation") assertValid(validateOperationRecord(next));
  else assertValid(validateNonceReservationRecord(next));
  return { lease, revision: record.revision + 1, updatedAt: now };
}

export function planLeaseRelease(record, options = {}) {
  const kind = validateRecordForKind(record);
  if (record.lease === null || record.lease === undefined) {
    fail("LEASE_OWNERSHIP_MISMATCH", "record has no lease");
  }
  if (record.lease.ownerId !== options.ownerId || record.lease.token !== options.token) {
    fail("LEASE_OWNERSHIP_MISMATCH", "lease owner or token does not match");
  }

  const expectedRevision = options.expectedRevision === undefined
    ? record.revision
    : options.expectedRevision;
  assertExpectedRevision(record, expectedRevision);

  const now = options.now === undefined ? Date.now() : options.now;
  assertTimestamp(now, "now");
  const next = { ...record, lease: null, revision: record.revision + 1, updatedAt: now };
  if (kind === "operation") assertValid(validateOperationRecord(next));
  else assertValid(validateNonceReservationRecord(next));
  return { lease: null, revision: record.revision + 1, updatedAt: now };
}

/**
 * Application cleanup may only consider terminal, current-version records.
 * Unresolved records and every legacy record are never eligible. Lease expiry
 * alone never changes a state and never makes a record cleanup-eligible.
 */
export function isCleanupEligible(record, now = Date.now()) {
  try {
    const kind = validateRecordForKind(record);
    if (!isTerminalState(kind, record.state)) return false;
    return !hasActiveLease(record, now);
  } catch {
    return false;
  }
}
