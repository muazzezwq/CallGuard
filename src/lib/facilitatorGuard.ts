/* Session-scoped, fail-closed guard for an x402 payment attempt.

   `api/call-service.js` can broadcast `callServiceWithAuthorization`, wait for
   the receipt, and then fail (for example an RPC error inside `tx.wait()`) and
   answer HTTP 500. It then returns neither a transaction hash nor an
   authoritative outcome, so the client cannot tell whether USDC moved.

   The guard is written *before* the facilitator request, read back and
   validated. Stored values are never interpreted as an empty list when storage
   is unreadable or corrupt: every read returns a discriminated result, and
   callers must block the risky operation instead of assuming safety.

   A marker has no expiry. It is removed only after independent evidence
   (a receipt for the transaction hash the facilitator returned, read by this
   client) or after the user's explicit acknowledgment. A facilitator response
   body is not evidence: `PRE_SETTLEMENT`, `demo` and `settled:false` are
   unauthenticated claims and never clear a marker on their own.
   Acknowledgment is not proof that payment failed.

   `sessionStorage` is per tab and can be unavailable. When it cannot be read,
   written or validated, the caller must block x402 payments. An in-memory flag
   cannot protect against a reload. This is not a global no-duplicate-payment
   guarantee: another tab, another browser, cleared session storage, or a
   direct contract call does not see this marker. No server-side idempotency
   store exists in this build. */

/** Existing sessionStorage naming convention (`cg_*`). */
export const FACILITATOR_GUARD_KEY = "cg_facilitator_unsettled";

export type GuardStage = "prepared" | "uncertain" | "submitted";

export type FacilitatorGuard = {
  providerId: number;
  /** keccak256 of the request payload; identifies the payment attempt. */
  requestHash: string;
  /** Epoch milliseconds when the marker was last written. Informational only. */
  at: number;
  /** prepared: request not sent yet; uncertain: outcome unknown; submitted: hash known. */
  stage: GuardStage;
  /** Present once the facilitator returned a transaction hash. */
  txHash?: string;
};

/** Minimal storage surface, so the rules are testable without a browser. */
export type GuardStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type GuardFailure =
  | "storage-unavailable"
  | "guard-corrupt"
  | "write-failed"
  | "readback-failed"
  /** A write tried to move an existing marker backwards or drop its hash. */
  | "downgrade-refused";

export type GuardRead =
  | { ok: true; guards: FacilitatorGuard[] }
  | { ok: false; reason: GuardFailure };

export type GuardLookup =
  | { ok: true; guard: FacilitatorGuard | null }
  | { ok: false; reason: GuardFailure };

/** One decision shared by every payment-starting action. */
export type GuardGate =
  | { ok: true }
  | { ok: false; reason: "guard-active"; guard: FacilitatorGuard }
  | { ok: false; reason: GuardFailure };

export type GuardWrite =
  | { ok: true; guard: FacilitatorGuard }
  | { ok: false; reason: GuardFailure };

export type GuardClear =
  | { ok: true }
  | { ok: false; reason: GuardFailure };

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const STAGES: readonly GuardStage[] = ["prepared", "uncertain", "submitted"];
/* A marker may only move forward. `submitted` is the most informative state and
   must never be replaced by `prepared`, which would let a retry start again. */
const STAGE_RANK: Record<GuardStage, number> = { prepared: 0, uncertain: 1, submitted: 2 };

/** Accepts markers written by the previous version (no stage) as `uncertain`. */
function normalizeGuard(value: unknown): FacilitatorGuard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<FacilitatorGuard>;
  if (typeof raw.providerId !== "number" || !Number.isInteger(raw.providerId) || raw.providerId <= 0) return null;
  if (typeof raw.requestHash !== "string" || !HASH_RE.test(raw.requestHash)) return null;
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at)) return null;
  const stage: GuardStage = raw.stage === undefined ? "uncertain" : raw.stage;
  if (!STAGES.includes(stage)) return null;
  if (raw.txHash !== undefined && (typeof raw.txHash !== "string" || !HASH_RE.test(raw.txHash))) return null;
  return {
    providerId: raw.providerId,
    requestHash: raw.requestHash,
    at: raw.at,
    stage,
    ...(raw.txHash === undefined ? {} : { txHash: raw.txHash }),
  };
}

function sameAttempt(
  a: { providerId: number; requestHash: string },
  b: { providerId: number; requestHash: string },
): boolean {
  return a.providerId === b.providerId
    && a.requestHash.toLowerCase() === b.requestHash.toLowerCase();
}

function sameGuard(a: FacilitatorGuard, b: FacilitatorGuard): boolean {
  return sameAttempt(a, b)
    && a.at === b.at
    && a.stage === b.stage
    && a.txHash === b.txHash;
}

function parseStored(raw: string | null): GuardRead {
  if (raw === null) return { ok: true, guards: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "guard-corrupt" };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: "guard-corrupt" };
  const guards: FacilitatorGuard[] = [];
  for (const item of parsed) {
    const guard = normalizeGuard(item);
    if (!guard) return { ok: false, reason: "guard-corrupt" };
    guards.push(guard);
  }
  return { ok: true, guards };
}

/** Reads every marker. Storage errors and corrupt values are failures, never [] . */
export function readFacilitatorGuards(storage: GuardStorage): GuardRead {
  let raw: string | null;
  try {
    raw = storage.getItem(FACILITATOR_GUARD_KEY);
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
  return parseStored(raw);
}

function persistGuards(storage: GuardStorage, guards: FacilitatorGuard[]): GuardFailure | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(guards);
  } catch {
    return "write-failed";
  }
  try {
    storage.setItem(FACILITATOR_GUARD_KEY, serialized);
  } catch {
    return "write-failed";
  }
  // A write is not durable until the stored value can be read back and validated.
  let stored: string | null;
  try {
    stored = storage.getItem(FACILITATOR_GUARD_KEY);
  } catch {
    return "readback-failed";
  }
  const readback = parseStored(stored);
  if (!readback.ok) return "readback-failed";
  if (readback.guards.length !== guards.length) return "readback-failed";
  for (let i = 0; i < guards.length; i++) {
    if (!sameGuard(readback.guards[i], guards[i])) return "readback-failed";
  }
  return null;
}

/** The marker for one provider + request attempt. */
export function findFacilitatorGuard(
  storage: GuardStorage,
  attempt: { providerId: number; requestHash: string },
): GuardLookup {
  const read = readFacilitatorGuards(storage);
  if (!read.ok) return { ok: false, reason: read.reason };
  return { ok: true, guard: read.guards.find(g => sameAttempt(g, attempt)) ?? null };
}

/** The guard decision used immediately before any payment write.
    Unreadable storage is a failure, never an implicit "no guard". */
export function checkFacilitatorGuard(
  storage: GuardStorage,
  attempt: { providerId: number; requestHash: string },
): GuardGate {
  const found = findFacilitatorGuard(storage, attempt);
  if (!found.ok) return { ok: false, reason: found.reason };
  if (found.guard) return { ok: false, reason: "guard-active", guard: found.guard };
  return { ok: true };
}

/** Persists a marker, then proves it with a validated read-back. */
export function upsertFacilitatorGuard(
  storage: GuardStorage,
  attempt: {
    providerId: number;
    requestHash: string;
    stage?: GuardStage;
    txHash?: string;
  },
): GuardWrite {
  const read = readFacilitatorGuards(storage);
  if (!read.ok) return { ok: false, reason: read.reason };

  const guard: FacilitatorGuard = {
    providerId: attempt.providerId,
    requestHash: attempt.requestHash,
    at: Date.now(),
    stage: attempt.stage ?? "uncertain",
    ...(attempt.txHash === undefined ? {} : { txHash: attempt.txHash }),
  };

  /* A same-attempt write may not downgrade the stage or drop a known hash.
     Carrying the hash forward is mandatory: losing it would hide the only
     pointer to a possibly settled transaction. */
  const existing = read.guards.find(g => sameAttempt(g, guard));
  if (existing) {
    if (STAGE_RANK[guard.stage] < STAGE_RANK[existing.stage]) {
      return { ok: false, reason: "downgrade-refused" };
    }
    if (existing.txHash && guard.txHash === undefined) guard.txHash = existing.txHash;
  }

  const next = read.guards.filter(g => !sameAttempt(g, guard));
  next.push(guard);

  const failure = persistGuards(storage, next);
  if (failure) return { ok: false, reason: failure };
  return { ok: true, guard };
}

/** Legacy name: records an uncertain settlement. */
export function addFacilitatorGuard(
  storage: GuardStorage,
  attempt: { providerId: number; requestHash: string },
): GuardWrite {
  return upsertFacilitatorGuard(storage, { ...attempt, stage: "uncertain" });
}

/** Removes one attempt's marker and verifies the removal from storage.
    This is used both for a positively safe outcome and for an explicit
    user acknowledgment. It never removes an unreadable marker. */
export function removeFacilitatorGuard(
  storage: GuardStorage,
  attempt: { providerId: number; requestHash: string },
): GuardClear {
  const read = readFacilitatorGuards(storage);
  if (!read.ok) return { ok: false, reason: read.reason };

  const next = read.guards.filter(g => !sameAttempt(g, attempt));
  if (next.length === read.guards.length) return { ok: true };

  const failure = persistGuards(storage, next);
  return failure ? { ok: false, reason: failure } : { ok: true };
}

/** Explicit user acknowledgment. Same storage semantics as removal; the
    caller must state that this is not proof of settlement. */
export function ackFacilitatorGuard(
  storage: GuardStorage,
  attempt: { providerId: number; requestHash: string },
): GuardClear {
  return removeFacilitatorGuard(storage, attempt);
}

export type GuardedRequest<T> =
  | { ok: true; guard: FacilitatorGuard; response: T }
  | { ok: false; reason: GuardFailure; requestStarted: false };

/** Establishes and verifies the `prepared` marker, then starts the request.
    If the marker cannot be established, `request` is never called. */
export async function beginGuardedFacilitatorRequest<T>(args: {
  storage: GuardStorage;
  attempt: { providerId: number; requestHash: string };
  request: () => Promise<T>;
  /** Runs after the marker is durable and before `request` starts. */
  onPrepared?: (guard: FacilitatorGuard) => void;
}): Promise<GuardedRequest<T>> {
  const begun = upsertFacilitatorGuard(args.storage, { ...args.attempt, stage: "prepared" });
  if (!begun.ok) return { ok: false, reason: begun.reason, requestStarted: false };

  args.onPrepared?.(begun.guard);
  const response = await args.request();
  return { ok: true, guard: begun.guard, response };
}

export type SettlementTracking = {
  /** The facilitator's hash is returned even when persistence fails. */
  hash: string;
  /** In-memory guard with `stage: "submitted"` and the hash, for the UI. */
  guard: FacilitatorGuard;
  guardPersisted: boolean;
  pendingPersisted: boolean;
};

/** Records a facilitator hash. The pre-existing marker is never cleared here:
    if either store fails, the hash is still returned for display and the
    attempt stays blocked. */
export function recordFacilitatorSettlement(args: {
  storage: GuardStorage;
  attempt: { providerId: number; requestHash: string };
  existing: FacilitatorGuard;
  hash: string;
  persistPending: (hash: string) => boolean;
}): SettlementTracking {
  const updated = upsertFacilitatorGuard(args.storage, {
    ...args.attempt,
    stage: "submitted",
    txHash: args.hash,
  });
  const guard: FacilitatorGuard = updated.ok
    ? updated.guard
    : { ...args.existing, stage: "submitted", txHash: args.hash };

  let pendingPersisted = false;
  try {
    pendingPersisted = args.persistPending(args.hash) === true;
  } catch {
    pendingPersisted = false;
  }

  return {
    hash: args.hash,
    guard,
    guardPersisted: updated.ok,
    pendingPersisted,
  };
}
