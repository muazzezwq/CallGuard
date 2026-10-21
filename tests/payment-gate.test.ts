import { beforeEach, describe, expect, test } from "bun:test";
import {
  checkPaymentStart,
  clearPending,
  markerIsUntrusted,
  pendingMemory,
  readPending,
  recordSubmittedTx,
  resetPaymentGateState,
  resolvePendingTx,
  writePending,
  beginOperation,
  endOperation,
  PENDING_TX_KEY,
} from "../src/lib/paymentGate";
import {
  FACILITATOR_GUARD_KEY,
  addFacilitatorGuard,
  type GuardStorage,
} from "../src/lib/facilitatorGuard";
import { CCTP_OPERATION_KEY, startCctpOperation } from "../src/lib/cctpOperation";

const HASH_A = `0x${"aa".repeat(32)}`;
const HASH_B = `0x${"bb".repeat(32)}`;
const ATTEMPT = { providerId: 1, requestHash: HASH_A };

type Store = {
  storage: GuardStorage;
  backing: Map<string, string>;
  fail: { get: boolean; set: boolean; remove: boolean; silentWrite: boolean };
};

function makeStore(backing = new Map<string, string>()): Store {
  const fail = { get: false, set: false, remove: false, silentWrite: false };
  const storage: GuardStorage = {
    getItem: (key) => {
      if (fail.get) throw new Error("read failed");
      return backing.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (fail.set) throw new Error("write failed");
      /* `silentWrite` accepts the call but stores something else: the read-back
         must catch it. */
      backing.set(key, fail.silentWrite ? `${value}-tampered` : value);
    },
    removeItem: (key) => {
      if (fail.remove) throw new Error("remove failed");
      backing.delete(key);
    },
  };
  return { storage, backing, fail };
}

beforeEach(() => {
  resetPaymentGateState();
});

describe("pending marker storage", () => {
  test("round-trips a hash and rejects a mismatched read-back", () => {
    const { storage, backing, fail } = makeStore();
    expect(readPending(storage)).toEqual({ ok: true, hash: null });
    expect(writePending(HASH_A, storage)).toBe(true);
    expect(readPending(storage)).toEqual({ ok: true, hash: HASH_A });

    fail.silentWrite = true;
    expect(writePending(HASH_B, storage)).toBe(false);
    expect(backing.get(PENDING_TX_KEY)).not.toBe(HASH_B);
  });

  test("a corrupt value is a failure, not an empty marker", () => {
    const { storage, backing } = makeStore();
    backing.set(PENDING_TX_KEY, "0xnot-a-hash");
    const read = readPending(storage);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("marker-corrupt");
  });

  test("a read or write failure is reported", () => {
    const { storage, fail } = makeStore();
    fail.get = true;
    expect(readPending(storage).ok).toBe(false);
    expect(writePending(HASH_A, storage)).toBe(false);

    fail.get = false;
    fail.set = true;
    expect(writePending(HASH_A, storage)).toBe(false);
    expect(clearPending(storage)).toBe(true);
  });
});

describe("shared payment-start gate", () => {
  test("allows a start with no markers", () => {
    const { storage } = makeStore();
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" })).toEqual({ ok: true });
  });

  test("blocks when the durable pending marker exists", () => {
    const { storage, backing } = makeStore();
    backing.set(PENDING_TX_KEY, HASH_A);
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("pending-transaction");
  });

  test("blocks when the marker cannot be read", () => {
    const { storage, fail } = makeStore();
    fail.get = true;
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("storage-unavailable");
  });

  test("blocks when the marker is corrupt", () => {
    const { storage, backing } = makeStore();
    backing.set(PENDING_TX_KEY, "garbage");
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("marker-corrupt");
  });

  test("blocks when there is no storage at all", () => {
    const decision = checkPaymentStart({ storage: null, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("storage-unavailable");
  });

  test("an unresolved facilitator guard blocks only its own attempt", () => {
    const { storage, backing } = makeStore();
    expect(addFacilitatorGuard(storage, ATTEMPT).ok).toBe(true);
    expect(backing.has(FACILITATOR_GUARD_KEY)).toBe(true);

    const same = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(same.ok).toBe(false);
    if (!same.ok) {
      expect(same.code).toBe("guard-active");
      expect(same.guard?.providerId).toBe(1);
    }

    expect(checkPaymentStart({ storage, attempt: { providerId: 2, requestHash: HASH_A }, operation: "call" })).toEqual({ ok: true });
    expect(checkPaymentStart({ storage, attempt: { providerId: 1, requestHash: HASH_B }, operation: "call" })).toEqual({ ok: true });
  });

  test("a readable guard storage failure is a block, not an empty list", () => {
    const { storage, backing } = makeStore();
    backing.set(FACILITATOR_GUARD_KEY, "{not json");
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("guard-untrusted");
  });

  test("an unresolved CCTP operation blocks every operation", () => {
    const { storage } = makeStore();
    expect(startCctpOperation(storage, { chain: "sepolia", amount: "1000" }).ok).toBe(true);
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("cctp-operation-active");
  });

  test("an unreadable CCTP marker blocks instead of assuming none", () => {
    const { storage, backing } = makeStore();
    backing.set(CCTP_OPERATION_KEY, "not json");
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("cctp-marker-untrusted");
  });
});

describe("failed pending-marker writes fail closed", () => {
  test("a submitted hash that cannot be persisted blocks the next start", () => {
    const { storage, fail } = makeStore();
    fail.set = true;
    const recorded = recordSubmittedTx(HASH_A, storage);
    expect(recorded.persisted).toBe(false);
    expect(markerIsUntrusted()).toBe(true);
    expect(pendingMemory()).toEqual({ kind: "untracked", hash: HASH_A });

    /* Storage looks empty because the write failed; the gate must not believe it. */
    fail.set = false;
    expect(readPending(storage)).toEqual({ ok: true, hash: null });
    const decision = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("pending-marker-untrusted");

    /* A different provider and request is blocked too: the untracked hash has no
       attempt identity that could be matched. */
    const other = checkPaymentStart({ storage, attempt: { providerId: 2, requestHash: HASH_B }, operation: "call" });
    expect(other.ok).toBe(false);
  });

  test("a tampered read-back is treated as an unpersisted write", () => {
    const { storage, fail } = makeStore();
    fail.silentWrite = true;
    expect(recordSubmittedTx(HASH_A, storage).persisted).toBe(false);
    expect(markerIsUntrusted()).toBe(true);
  });

  test("the block survives until a verified clear, then the gate reopens", () => {
    const { storage, backing, fail } = makeStore();
    fail.set = true;
    recordSubmittedTx(HASH_A, storage);
    fail.set = false;

    fail.remove = true;
    expect(resolvePendingTx(storage).cleared).toBe(false);
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" }).ok).toBe(false);

    fail.remove = false;
    expect(resolvePendingTx(storage).cleared).toBe(true);
    expect(backing.has(PENDING_TX_KEY)).toBe(false);
    expect(markerIsUntrusted()).toBe(false);
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" })).toEqual({ ok: true });
  });

  test("a clear that cannot be read back stays blocked", () => {
    const { storage, fail } = makeStore();
    recordSubmittedTx(HASH_A, storage);
    fail.get = true;
    expect(resolvePendingTx(storage).cleared).toBe(false);
    fail.get = false;
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" }).ok).toBe(false);
  });
});

describe("single operation lock", () => {
  test("refuses a second flow and allows a nested step of the same flow", () => {
    const { storage } = makeStore();
    expect(beginOperation("call")).toBe(true);
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "call" })).toEqual({ ok: true });
    const other = checkPaymentStart({ storage, attempt: ATTEMPT, operation: "batch" });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.code).toBe("operation-in-flight");
    expect(beginOperation("batch")).toBe(false);

    endOperation("batch"); // ignored: another flow owns the lock
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "batch" }).ok).toBe(false);

    endOperation("call");
    expect(checkPaymentStart({ storage, attempt: ATTEMPT, operation: "batch" })).toEqual({ ok: true });
  });
});
