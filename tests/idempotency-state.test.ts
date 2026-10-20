import { describe, expect, test } from "bun:test";
import { createOperationRecord as createLegacyOperationRecord } from "../api/_idempotency";
import {
  NONCE_RESERVATION_RECORD_VERSION,
  OPERATION_RECORD_VERSION,
  StateMachineError,
  canClaimLease,
  classifyOperationRecord,
  createNonceReservationRecord,
  createRecoveryLease,
  createVersionedOperationRecord,
  hasActiveLease,
  isAmbiguousLegacyPreparedRecord,
  isCleanupEligible,
  isLeaseExpired,
  isLegacyOperationRecord,
  isUnresolvedRecord,
  planLeaseClaim,
  planLeaseRelease,
  planNonceReservationTransition,
  planOperationTransition,
  validateNonceReservationRecord,
  validateOperationRecord,
  validateRecoveryLease,
} from "../api/_idempotency_state";

const OP_ID = "call-service:auth:0x1111111111111111111111111111111111111111:0xbb";
const AUTH_ID = OP_ID;
const FINGERPRINT = "f".repeat(64);
const SENDER = `0x${"11".repeat(20)}`;
const TX_HASH = `0x${"22".repeat(32)}`;
const RAW_TX = "0xdeadbeef";
const LEASE_TTL_MS = 1_000;

function operation(overrides: Record<string, unknown> = {}) {
  return {
    ...createVersionedOperationRecord({
      operationId: OP_ID,
      fingerprint: FINGERPRINT,
      now: 1,
    }),
    ...overrides,
  };
}

function nonce(overrides: Record<string, unknown> = {}) {
  return {
    ...createNonceReservationRecord({
      reservationId: `${SENDER}:0`,
      sender: SENDER,
      nonce: 0,
      operationId: OP_ID,
      now: 1,
    }),
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StateMachineError);
  expect((caught as StateMachineError).code).toBe(code);
}

function advanceOperation(
  record: Record<string, unknown>,
  states: string[],
  patches: Record<string, Record<string, unknown>> = {},
) {
  let current = record;
  for (const state of states) {
    current = {
      ...current,
      ...planOperationTransition(current, state, {
        now: Number(current.updatedAt) + 1,
        patch: patches[state] ?? {},
      }),
    };
  }
  return current;
}

function advanceNonce(
  record: Record<string, unknown>,
  states: string[],
  patches: Record<string, Record<string, unknown>> = {},
) {
  let current = record;
  for (const state of states) {
    current = {
      ...current,
      ...planNonceReservationTransition(current, state, {
        now: Number(current.updatedAt) + 1,
        patch: patches[state] ?? {},
      }),
    };
  }
  return current;
}

function signedOperation() {
  return advanceOperation(operation(), ["nonce_reserved", "signed"], {
    signed: { signedTransaction: RAW_TX, txHash: TX_HASH },
  });
}

function broadcastOperation() {
  return advanceOperation(signedOperation(), ["broadcast"]);
}

describe("versioned operation records", () => {
  test("a new operation is version 2, starts prepared, and has revision zero", () => {
    const record = operation();

    expect(record).toMatchObject({
      version: OPERATION_RECORD_VERSION,
      kind: "operation",
      operationId: OP_ID,
      authId: AUTH_ID,
      fingerprint: FINGERPRINT,
      state: "prepared",
      revision: 0,
      attempts: 0,
      lease: null,
      txHash: null,
      signedTransaction: null,
    });
    expect(validateOperationRecord(record)).toEqual({ ok: true, errors: [] });
    expect(classifyOperationRecord(record)).toBe("current");
  });

  test("schema validation rejects missing identity, bad state, negative revision, and bad lease", () => {
    const missingId = validateOperationRecord({ ...operation(), operationId: "" });
    expect(missingId.ok).toBe(false);
    expect(missingId.errors).toContain("operationId is required");

    const badState = validateOperationRecord({ ...operation(), state: "submitted" });
    expect(badState.ok).toBe(false);
    expect(badState.errors).toContain("state is not an operation state");

    const badRevision = validateOperationRecord({ ...operation(), revision: -1 });
    expect(badRevision.ok).toBe(false);
    expect(badRevision.errors).toContain("revision must be a non-negative integer");

    const badLease = validateOperationRecord({
      ...operation(),
      lease: { version: 1, ownerId: "", token: "", expiresAt: -1 },
    });
    expect(badLease.ok).toBe(false);
    expect(badLease.errors).toContain("lease.ownerId is required");
    expect(badLease.errors).toContain("lease.token is required");
    expect(badLease.errors).toContain("lease.expiresAt must be a non-negative integer");
  });

  test("schema validation is structural and does not certify Stage 3 submission readiness", () => {
    const reserved = advanceOperation(operation(), ["nonce_reserved"]);
    const signed = { ...reserved, ...planOperationTransition(reserved, "signed", { now: 3 }) };

    expect(signed.state).toBe("signed");
    expect(signed.signedTransaction).toBeNull();
    expect(signed.txHash).toBeNull();
    expect(validateOperationRecord(signed).ok).toBe(true);
    // Stage 3 must reject this logical transition until the exact raw signed
    // transaction and its verified hash are atomically persisted and read back.
  });

  test("schema validation rejects malformed transaction fields", () => {
    const badHash = validateOperationRecord({ ...operation(), txHash: "0x1234" });
    expect(badHash.ok).toBe(false);
    expect(badHash.errors).toContain("txHash must be a 32-byte hexadecimal string");

    const badRaw = validateOperationRecord({ ...operation(), signedTransaction: "not-hex" });
    expect(badRaw.ok).toBe(false);
    expect(badRaw.errors).toContain("signedTransaction must be a hexadecimal string");
  });
});

describe("operation transitions", () => {
  test("forward transitions increment revision exactly once and do not mutate the input", () => {
    const prepared = operation();
    const patch = planOperationTransition(prepared, "nonce_reserved", { now: 10 });

    expect(patch).toEqual({ state: "nonce_reserved", revision: 1, updatedAt: 10 });
    expect(prepared.state).toBe("prepared");
    expect(prepared.revision).toBe(0);
    expect(prepared.updatedAt).toBe(1);
  });

  test("all legal forward operation transitions are accepted", () => {
    expect(planOperationTransition(operation(), "abandoned", { now: 2 }).state).toBe("abandoned");

    const reserved = advanceOperation(operation(), ["nonce_reserved"]);
    expect(planOperationTransition(reserved, "abandoned", { now: 3 }).state).toBe("abandoned");

    const signed = advanceOperation(reserved, ["signed"], {
      signed: { signedTransaction: RAW_TX, txHash: TX_HASH },
    });
    expect(planOperationTransition(signed, "broadcast", { now: 4 }).state).toBe("broadcast");
    expect(planOperationTransition(signed, "unknown", { now: 4 }).state).toBe("unknown");

    const broadcast = advanceOperation(signed, ["broadcast"]);
    expect(planOperationTransition(broadcast, "unknown", { now: 5 }).state).toBe("unknown");
    expect(planOperationTransition(broadcast, "confirmed", { now: 5 }).state).toBe("confirmed");
    expect(planOperationTransition(broadcast, "reverted", { now: 5 }).state).toBe("reverted");

    const unknown = advanceOperation(signed, ["unknown"]);
    expect(planOperationTransition(unknown, "confirmed", { now: 5 }).state).toBe("confirmed");
    expect(planOperationTransition(unknown, "reverted", { now: 5 }).state).toBe("reverted");
  });

  test("signed and later states cannot move backward or repeat a state", () => {
    const signed = signedOperation();
    // signed -> broadcast is valid forward progress. Only earlier states and
    // the current state fail.
    expect(planOperationTransition(signed, "broadcast", { now: 10 }).state).toBe("broadcast");
    for (const target of ["prepared", "nonce_reserved", "signed"]) {
      expectCode(() => planOperationTransition(signed, target, { now: 10 }), "ILLEGAL_TRANSITION");
    }

    const broadcast = broadcastOperation();
    for (const target of ["prepared", "nonce_reserved", "signed", "broadcast"]) {
      expectCode(() => planOperationTransition(broadcast, target, { now: 10 }), "ILLEGAL_TRANSITION");
    }

    const unknown = advanceOperation(signed, ["unknown"]);
    for (const target of ["prepared", "nonce_reserved", "signed", "broadcast", "unknown"]) {
      expectCode(() => planOperationTransition(unknown, target, { now: 10 }), "ILLEGAL_TRANSITION");
    }
  });

  test("terminal operation states have no outgoing transitions", () => {
    const confirmed = advanceOperation(broadcastOperation(), ["confirmed"]);
    const reverted = advanceOperation(broadcastOperation(), ["reverted"]);
    const abandoned = advanceOperation(operation(), ["abandoned"]);

    for (const record of [confirmed, reverted, abandoned]) {
      for (const target of ["prepared", "nonce_reserved", "signed", "broadcast", "unknown", "confirmed", "reverted", "abandoned"]) {
        expectCode(() => planOperationTransition(record, target, { now: 10 }), "ILLEGAL_TRANSITION");
      }
    }
  });

  test("an operation with a signed transaction cannot be abandoned", () => {
    const reservedWithSignedTx = {
      ...operation(),
      ...planOperationTransition(operation(), "nonce_reserved", { now: 2 }),
      signedTransaction: RAW_TX,
      txHash: TX_HASH,
    };

    expectCode(
      () => planOperationTransition(reservedWithSignedTx, "abandoned", { now: 3 }),
      "SIGNED_TRANSACTION_EXISTS",
    );
  });

  test("skipping a submission state is rejected", () => {
    expectCode(
      () => planOperationTransition(operation(), "signed", {
        now: 2,
        patch: { signedTransaction: RAW_TX, txHash: TX_HASH },
      }),
      "ILLEGAL_TRANSITION",
    );
    expectCode(
      () => planOperationTransition(operation(), "confirmed", { now: 2 }),
      "ILLEGAL_TRANSITION",
    );
  });

  test("stale revisions, state mismatches, invalid states, and protected patches are rejected", () => {
    const reserved = advanceOperation(operation(), ["nonce_reserved"]);

    expectCode(
      () => planOperationTransition(reserved, "signed", {
        now: 3,
        expectedRevision: 0,
        patch: { signedTransaction: RAW_TX, txHash: TX_HASH },
      }),
      "STALE_REVISION",
    );
    expectCode(
      () => planOperationTransition(operation(), "nonce_reserved", {
        now: 2,
        expectedState: "signed",
      }),
      "STATE_MISMATCH",
    );
    expectCode(
      () => planOperationTransition(operation(), "not-a-state", { now: 2 }),
      "INVALID_STATE",
    );
    expectCode(
      () => planOperationTransition(operation(), "nonce_reserved", {
        now: 2,
        patch: { state: "signed" },
      }),
      "PROTECTED_FIELD",
    );
  });
});

describe("versioned nonce-reservation records", () => {
  test("a new nonce reservation is version 2, starts reserved, and validates", () => {
    const record = nonce();

    expect(record).toMatchObject({
      version: NONCE_RESERVATION_RECORD_VERSION,
      kind: "nonce_reservation",
      reservationId: `${SENDER}:0`,
      sender: SENDER,
      nonce: 0,
      operationId: OP_ID,
      state: "reserved",
      revision: 0,
      attempts: 0,
      lease: null,
    });
    expect(validateNonceReservationRecord(record)).toEqual({ ok: true, errors: [] });
  });

  test("nonce schema validation rejects bad sender, nonce, state, and revision", () => {
    expect(validateNonceReservationRecord({ ...nonce(), sender: "0x1234" }).errors)
      .toContain("sender must be an address");
    expect(validateNonceReservationRecord({ ...nonce(), nonce: -1 }).errors)
      .toContain("nonce must be a non-negative integer");
    expect(validateNonceReservationRecord({ ...nonce(), state: "prepared" }).errors)
      .toContain("state is not a nonce-reservation state");
    expect(validateNonceReservationRecord({ ...nonce(), revision: 1.5 }).errors)
      .toContain("revision must be a non-negative integer");
  });

  test("nonce reservations only move forward and may be released only before signing", () => {
    const reserved = nonce();
    const released = advanceNonce(reserved, ["released"]);
    expect(released.state).toBe("released");

    const signed = advanceNonce(reserved, ["signed"], {
      signed: { signedTransaction: RAW_TX, txHash: TX_HASH },
    });
    expect(planNonceReservationTransition(signed, "broadcast", { now: 4 }).state).toBe("broadcast");
    expect(planNonceReservationTransition(signed, "unknown", { now: 4 }).state).toBe("unknown");

    const broadcast = advanceNonce(signed, ["broadcast"]);
    expect(planNonceReservationTransition(broadcast, "unknown", { now: 5 }).state).toBe("unknown");
    expect(planNonceReservationTransition(broadcast, "confirmed", { now: 5 }).state).toBe("confirmed");
    expect(planNonceReservationTransition(broadcast, "reverted", { now: 5 }).state).toBe("reverted");

    expectCode(
      () => planNonceReservationTransition(signed, "released", { now: 4 }),
      "ILLEGAL_TRANSITION",
    );

    const reservedWithSignedTx = { ...reserved, signedTransaction: RAW_TX, txHash: TX_HASH };
    expectCode(
      () => planNonceReservationTransition(reservedWithSignedTx, "released", { now: 2 }),
      "SIGNED_TRANSACTION_EXISTS",
    );
  });

  test("nonce transitions enforce revision and state compare-and-set", () => {
    const reserved = nonce();

    expectCode(
      () => planNonceReservationTransition(reserved, "broadcast", { now: 2 }),
      "ILLEGAL_TRANSITION",
    );
    expectCode(
      () => planNonceReservationTransition(reserved, "signed", {
        now: 2,
        expectedRevision: 1,
        patch: { signedTransaction: RAW_TX, txHash: TX_HASH },
      }),
      "STALE_REVISION",
    );
    expectCode(
      () => planNonceReservationTransition(reserved, "signed", {
        now: 2,
        expectedState: "broadcast",
        patch: { signedTransaction: RAW_TX, txHash: TX_HASH },
      }),
      "STATE_MISMATCH",
    );
    expectCode(
      () => planNonceReservationTransition(reserved, "signed", {
        now: 2,
        patch: { nonce: 1 },
      }),
      "PROTECTED_FIELD",
    );
  });
});

describe("legacy operation records", () => {
  test("version-1 records are classified as legacy and ambiguous prepared records are never auto-abandoned", () => {
    const legacy = createLegacyOperationRecord({
      operationId: OP_ID,
      fingerprint: FINGERPRINT,
      now: 1,
    });

    expect(legacy.version).toBe(1);
    expect(classifyOperationRecord(legacy)).toBe("legacy");
    expect(isLegacyOperationRecord(legacy)).toBe(true);
    expect(isAmbiguousLegacyPreparedRecord(legacy)).toBe(true);
    expect(isUnresolvedRecord(legacy)).toBe(true);
    expect(isCleanupEligible(legacy, Number.MAX_SAFE_INTEGER)).toBe(false);

    expectCode(
      () => planOperationTransition(legacy, "abandoned", { now: 2 }),
      "LEGACY_RECORD_READ_ONLY",
    );
    expectCode(
      () => planLeaseClaim(legacy, {
        ownerId: "worker-1",
        token: "token-1",
        now: 2,
        ttlMs: LEASE_TTL_MS,
      }),
      "LEGACY_RECORD_READ_ONLY",
    );
  });

  test("legacy submitted records are read-only and unresolved, but not ambiguous prepared records", () => {
    const legacySubmitted = {
      ...createLegacyOperationRecord({ operationId: OP_ID, fingerprint: FINGERPRINT, now: 1 }),
      state: "submitted",
      txHash: TX_HASH,
    };

    expect(isLegacyOperationRecord(legacySubmitted)).toBe(true);
    expect(isAmbiguousLegacyPreparedRecord(legacySubmitted)).toBe(false);
    expect(isUnresolvedRecord(legacySubmitted)).toBe(true);
    expect(isCleanupEligible(legacySubmitted, Number.MAX_SAFE_INTEGER)).toBe(false);
    expectCode(
      () => planOperationTransition(legacySubmitted, "confirmed", { now: 2 }),
      "LEGACY_RECORD_READ_ONLY",
    );
  });
});

describe("recovery leases", () => {
  test("a lease expires at its boundary and can then be claimed without changing state", () => {
    const signed = signedOperation();
    const claimed = planLeaseClaim(signed, {
      ownerId: "worker-1",
      token: "token-1",
      now: 10,
      ttlMs: LEASE_TTL_MS,
    });

    expect(claimed).toEqual({
      lease: {
        version: 1,
        ownerId: "worker-1",
        token: "token-1",
        expiresAt: 1_010,
      },
      revision: 3,
      updatedAt: 10,
    });
    expect(claimed).not.toHaveProperty("state");

    const leased = { ...signed, ...claimed };
    expect(isLeaseExpired(leased.lease, 1_009)).toBe(false);
    expect(isLeaseExpired(leased.lease, 1_010)).toBe(true);
    expect(hasActiveLease(leased, 1_009)).toBe(true);
    expect(canClaimLease(leased, 1_009)).toBe(false);
    expectCode(
      () => planLeaseClaim(leased, {
        ownerId: "worker-2",
        token: "token-2",
        now: 1_009,
        ttlMs: LEASE_TTL_MS,
      }),
      "LEASE_ACTIVE",
    );

    const reclaimed = planLeaseClaim(leased, {
      ownerId: "worker-2",
      token: "token-2",
      now: 1_010,
      ttlMs: LEASE_TTL_MS,
      expectedRevision: 3,
    });
    const reclaimedRecord = { ...leased, ...reclaimed };
    expect(reclaimedRecord.state).toBe("signed");
    expect(reclaimedRecord.revision).toBe(4);
    expect(reclaimedRecord.lease).toMatchObject({
      ownerId: "worker-2",
      token: "token-2",
      expiresAt: 2_010,
    });
  });

  test("lease claims enforce revision and ownership, and are rejected for terminal or non-recoverable states", () => {
    const signed = signedOperation();
    const leased = {
      ...signed,
      ...planLeaseClaim(signed, {
        ownerId: "worker-1",
        token: "token-1",
        now: 10,
        ttlMs: LEASE_TTL_MS,
      }),
    };

    expectCode(
      () => planLeaseClaim(signed, {
        ownerId: "worker-1",
        token: "token-1",
        now: 10,
        ttlMs: LEASE_TTL_MS,
        expectedRevision: 0,
      }),
      "STALE_REVISION",
    );
    expectCode(
      () => planLeaseRelease(leased, {
        ownerId: "worker-2",
        token: "token-1",
        now: 20,
      }),
      "LEASE_OWNERSHIP_MISMATCH",
    );
    expectCode(
      () => planLeaseClaim(operation(), {
        ownerId: "worker-1",
        token: "token-1",
        now: 10,
        ttlMs: LEASE_TTL_MS,
      }),
      "NOT_RECOVERABLE",
    );

    const confirmed = advanceOperation(broadcastOperation(), ["confirmed"]);
    expectCode(
      () => planLeaseClaim(confirmed, {
        ownerId: "worker-1",
        token: "token-1",
        now: 10,
        ttlMs: LEASE_TTL_MS,
      }),
      "NOT_RECOVERABLE",
    );

    const released = planLeaseRelease(leased, {
      ownerId: "worker-1",
      token: "token-1",
      now: 20,
      expectedRevision: 3,
    });
    expect(released).toEqual({ lease: null, revision: 4, updatedAt: 20 });
  });

  test("lease validation rejects bad owners, tokens, expiry, and TTL", () => {
    expect(validateRecoveryLease({ version: 1, ownerId: "", token: "", expiresAt: -1 }).ok)
      .toBe(false);
    expect(validateRecoveryLease({ version: 2, ownerId: "worker", token: "token", expiresAt: 1 }).errors)
      .toContain("lease.version must be 1");
    expectCode(
      () => createRecoveryLease({ ownerId: "worker", token: "token", now: 1, ttlMs: 0 }),
      "INVALID_LEASE",
    );
    expect(isLeaseExpired(null)).toBe(true);
  });
});

describe("cleanup safety", () => {
  test("unresolved records are never cleanup-eligible, regardless of age", () => {
    const records = [
      operation(),
      advanceOperation(operation(), ["nonce_reserved"]),
      signedOperation(),
      broadcastOperation(),
      advanceOperation(signedOperation(), ["unknown"]),
    ];

    for (const record of records) {
      expect(isUnresolvedRecord(record)).toBe(true);
      expect(isCleanupEligible(record, Number.MAX_SAFE_INTEGER)).toBe(false);
    }
  });

  test("terminal current records are cleanup-eligible, but an active lease still blocks cleanup", () => {
    const confirmed = advanceOperation(broadcastOperation(), ["confirmed"]);
    const reverted = advanceOperation(broadcastOperation(), ["reverted"]);
    const abandoned = advanceOperation(operation(), ["abandoned"]);

    expect(isUnresolvedRecord(confirmed)).toBe(false);
    expect(isCleanupEligible(confirmed)).toBe(true);
    expect(isCleanupEligible(reverted)).toBe(true);
    expect(isCleanupEligible(abandoned)).toBe(true);

    const leasedConfirmed = {
      ...confirmed,
      lease: createRecoveryLease({
        ownerId: "worker-1",
        token: "token-1",
        now: 1,
        ttlMs: LEASE_TTL_MS,
      }),
    };
    expect(isCleanupEligible(leasedConfirmed, 500)).toBe(false);
    expect(isCleanupEligible(leasedConfirmed, 1_001)).toBe(true);
  });
});
