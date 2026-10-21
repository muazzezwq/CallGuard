import { describe, expect, test } from "bun:test";
import {
  FACILITATOR_GUARD_KEY,
  ackFacilitatorGuard,
  addFacilitatorGuard,
  beginGuardedFacilitatorRequest,
  checkFacilitatorGuard,
  findFacilitatorGuard,
  readFacilitatorGuards,
  recordFacilitatorSettlement,
  removeFacilitatorGuard,
  upsertFacilitatorGuard,
  type GuardStorage,
} from "../src/lib/facilitatorGuard";
import {
  classifyFacilitatorResult,
  permitsOnChainFallback,
} from "../src/lib/facilitatorOutcome";
import {
  recordSubmittedTx,
  resetPaymentGateState,
  resolvePendingTx,
} from "../src/lib/paymentGate";

/* A storage that survives "reloads": the Map is the store, each instance is a
   fresh session wrapper over it. Failure switches let the tests exercise the
   fail-closed paths without a browser. */
type StoreState = {
  failGet: boolean;
  failSet: boolean;
  failGetAfterSet: boolean;
  storedOverride: string | null;
};

function makeStorage(backing = new Map<string, string>()) {
  const state: StoreState = {
    failGet: false,
    failSet: false,
    failGetAfterSet: false,
    storedOverride: null,
  };
  let writes = 0;
  const storage: GuardStorage = {
    getItem: (key) => {
      if (state.failGet || (state.failGetAfterSet && writes > 0)) throw new Error("storage read failed");
      return backing.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (state.failSet) throw new Error("storage write failed");
      writes += 1;
      backing.set(key, state.storedOverride ?? value);
    },
    removeItem: (key) => { backing.delete(key); },
  };
  return { storage, backing, state };
}

const HASH_A = `0x${"aa".repeat(32)}`;
const HASH_B = `0x${"bb".repeat(32)}`;
const TX_A = `0x${"11".repeat(32)}`;

describe("facilitator uncertainty guard", () => {
  test("a marker is scoped to its provider and request", () => {
    const { storage } = makeStorage();
    expect(upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" }).ok).toBe(true);

    const same = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.guard?.stage).toBe("prepared");

    const upper = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A.toUpperCase() });
    expect(upper.ok && upper.guard !== null).toBe(true);

    const otherProvider = findFacilitatorGuard(storage, { providerId: 2, requestHash: HASH_A });
    expect(otherProvider.ok && otherProvider.guard === null).toBe(true);
    const otherRequest = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_B });
    expect(otherRequest.ok && otherRequest.guard === null).toBe(true);
  });

  test("the payment gate blocks only the guarded provider and request", () => {
    const { storage } = makeStorage();
    expect(checkFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);

    addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    const blocked = checkFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.reason === "guard-active") {
      expect(blocked.guard.stage).toBe("uncertain");
      expect(blocked.guard.providerId).toBe(1);
    } else {
      throw new Error("expected an active guard");
    }

    expect(checkFacilitatorGuard(storage, { providerId: 2, requestHash: HASH_A }).ok).toBe(true);
    expect(checkFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_B }).ok).toBe(true);
  });

  test("the payment gate fails closed when the guard cannot be read", () => {
    const unreadable = makeStorage();
    unreadable.state.failGet = true;
    const readFailure = checkFacilitatorGuard(unreadable.storage, { providerId: 1, requestHash: HASH_A });
    expect(readFailure.ok).toBe(false);
    if (!readFailure.ok && readFailure.reason !== "guard-active") {
      expect(readFailure.reason).toBe("storage-unavailable");
    }

    const corrupt = makeStorage();
    corrupt.backing.set(FACILITATOR_GUARD_KEY, "{not json");
    const corruptResult = checkFacilitatorGuard(corrupt.storage, { providerId: 1, requestHash: HASH_A });
    expect(corruptResult.ok).toBe(false);
    if (!corruptResult.ok && corruptResult.reason !== "guard-active") {
      expect(corruptResult.reason).toBe("guard-corrupt");
    }
  });

  test("acknowledging the facilitator guard does not clear the pending marker", () => {
    const { storage, backing } = makeStorage();
    addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    backing.set("cg_pending_tx", TX_A);

    expect(ackFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
    expect(backing.get("cg_pending_tx")).toBe(TX_A);
    expect(checkFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
  });

  test("a write is verified by read-back", () => {
    const { storage, backing } = makeStorage();
    const written = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "uncertain" });
    expect(written.ok).toBe(true);
    expect(backing.has(FACILITATOR_GUARD_KEY)).toBe(true);
  });

  test("a throwing setItem is reported, never treated as persisted", () => {
    const { storage, backing, state } = makeStorage();
    state.failSet = true;

    const result = addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("write-failed");
    expect(backing.has(FACILITATOR_GUARD_KEY)).toBe(false);

    // Without a durable marker the preflight cannot be established.
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard === null).toBe(true);
  });

  test("a stored value that does not match the write is a readback failure", () => {
    const { storage, state } = makeStorage();
    state.storedOverride = JSON.stringify([{ providerId: 1, requestHash: HASH_B, at: 0, stage: "uncertain" }]);

    const result = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("readback-failed");
  });

  test("a facilitator request is never started without a durable marker", async () => {
    const attempt = { providerId: 1, requestHash: HASH_A };

    const unreadable = makeStorage();
    unreadable.state.failGet = true;
    let calls = 0;
    const noRead = await beginGuardedFacilitatorRequest({
      storage: unreadable.storage,
      attempt,
      request: async () => { calls += 1; return "response"; },
    });
    expect(noRead.ok).toBe(false);
    if (!noRead.ok) {
      expect(noRead.reason).toBe("storage-unavailable");
      expect(noRead.requestStarted).toBe(false);
    }
    expect(calls).toBe(0);

    const unwritable = makeStorage();
    unwritable.state.failSet = true;
    const noWrite = await beginGuardedFacilitatorRequest({
      storage: unwritable.storage,
      attempt,
      request: async () => { calls += 1; return "response"; },
    });
    expect(noWrite.ok).toBe(false);
    if (!noWrite.ok) {
      expect(noWrite.reason).toBe("write-failed");
      expect(noWrite.requestStarted).toBe(false);
    }
    expect(calls).toBe(0);

    const unverifiable = makeStorage();
    unverifiable.state.storedOverride = "[]";
    const noReadback = await beginGuardedFacilitatorRequest({
      storage: unverifiable.storage,
      attempt,
      request: async () => { calls += 1; return "response"; },
    });
    expect(noReadback.ok).toBe(false);
    if (!noReadback.ok) expect(noReadback.reason).toBe("readback-failed");
    expect(calls).toBe(0);
  });

  test("the prepared marker is durable before the request starts", async () => {
    const { storage } = makeStorage();
    let stageAtRequest: string | undefined;
    const result = await beginGuardedFacilitatorRequest({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      request: async () => {
        const found = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
        stageAtRequest = found.ok ? found.guard?.stage : undefined;
        return "response";
      },
    });

    expect(result.ok).toBe(true);
    expect(stageAtRequest).toBe("prepared");
    if (result.ok) expect(result.guard.stage).toBe("prepared");
  });

  test("a read failure after the write is a readback failure", () => {
    const { storage, state } = makeStorage();
    state.failGetAfterSet = true;

    const result = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("readback-failed");
  });

  test("unreadable storage cannot be mistaken for an empty guard list", () => {
    const { storage, state } = makeStorage();
    state.failGet = true;

    const read = readFacilitatorGuards(storage);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("storage-unavailable");

    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok).toBe(false);

    const write = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.reason).toBe("storage-unavailable");
  });

  test("corrupt storage is a failure, not an empty list", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ guards: [] }),
      JSON.stringify([{ providerId: 0, requestHash: HASH_A, at: 1, stage: "uncertain" }]),
      JSON.stringify([{ providerId: 1, requestHash: "nope", at: 1, stage: "uncertain" }]),
      JSON.stringify([{ providerId: 1, requestHash: HASH_A, at: 1, stage: "unknown" }]),
      JSON.stringify([{ providerId: 1, requestHash: HASH_A, at: 1, stage: "submitted", txHash: "0xbad" }]),
    ]) {
      const { backing } = makeStorage();
      backing.set(FACILITATOR_GUARD_KEY, raw);
      const read = readFacilitatorGuards(makeStorage(backing).storage);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.reason).toBe("guard-corrupt");
    }
  });

  test("a legacy marker without a stage is treated as uncertain", () => {
    const { backing } = makeStorage();
    backing.set(FACILITATOR_GUARD_KEY, JSON.stringify([{ providerId: 1, requestHash: HASH_A, at: 5 }]));

    const read = readFacilitatorGuards(makeStorage(backing).storage);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.guards[0].stage).toBe("uncertain");
  });

  test("markers have no time-based expiry", () => {
    const { backing } = makeStorage();
    backing.set(FACILITATOR_GUARD_KEY, JSON.stringify([
      { providerId: 1, requestHash: HASH_A, at: 0, stage: "uncertain" },
    ]));
    const read = readFacilitatorGuards(makeStorage(backing).storage);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.guards).toHaveLength(1);
      expect(read.guards[0].at).toBe(0);
    }
  });

  test("a submitted marker keeps its hash", () => {
    const { storage } = makeStorage();
    const written = upsertFacilitatorGuard(storage, {
      providerId: 1, requestHash: HASH_A, stage: "submitted", txHash: TX_A,
    });
    expect(written.ok).toBe(true);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard?.txHash).toBe(TX_A);
    expect(lookup.ok && lookup.guard?.stage).toBe("submitted");
  });

  test("acknowledgment removes only the acknowledged attempt", () => {
    const { storage } = makeStorage();
    addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    addFacilitatorGuard(storage, { providerId: 2, requestHash: HASH_B });

    const cleared = ackFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(cleared.ok).toBe(true);

    const first = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    const second = findFacilitatorGuard(storage, { providerId: 2, requestHash: HASH_B });
    expect(first.ok && first.guard === null).toBe(true);
    expect(second.ok && second.guard !== null).toBe(true);
  });

  test("removing the last marker leaves no guard for the attempt", () => {
    const { storage, backing } = makeStorage();
    addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(backing.has(FACILITATOR_GUARD_KEY)).toBe(true);

    expect(removeFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard === null).toBe(true);
    const read = readFacilitatorGuards(storage);
    expect(read.ok && read.guards.length === 0).toBe(true);
  });

  test("an acknowledgment cannot clear a marker whose removal cannot be verified", () => {
    const { storage, state, backing } = makeStorage();
    addFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    state.failGetAfterSet = true;

    const cleared = removeFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(cleared.ok).toBe(false);
    expect(backing.has(FACILITATOR_GUARD_KEY)).toBe(true);
  });

  test("a settlement hash is returned even when both markers cannot be saved", () => {
    const { storage, state } = makeStorage();
    const begun = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    state.failSet = true; // pending and guard updates now fail
    const tracked = recordFacilitatorSettlement({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      existing: begun.guard,
      hash: TX_A,
      persistPending: () => { throw new Error("pending storage failed"); },
    });

    expect(tracked.hash).toBe(TX_A);
    expect(tracked.guard.txHash).toBe(TX_A);
    expect(tracked.guard.stage).toBe("submitted");
    expect(tracked.guardPersisted).toBe(false);
    expect(tracked.pendingPersisted).toBe(false);
  });

  test("the durable preflight marker survives a failed settlement update", () => {
    const { storage, state } = makeStorage();
    const begun = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    state.failSet = true;
    recordFacilitatorSettlement({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      existing: begun.guard,
      hash: TX_A,
      persistPending: () => true,
    });

    // The earlier marker is still in storage, so a retry remains blocked.
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard !== null).toBe(true);
  });

  test("a settlement marker records a pending write result honestly", () => {
    const { storage } = makeStorage();
    const begun = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    const tracked = recordFacilitatorSettlement({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      existing: begun.guard,
      hash: TX_A,
      persistPending: () => false,
    });

    expect(tracked.pendingPersisted).toBe(false);
    expect(tracked.guardPersisted).toBe(true);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard?.txHash).toBe(TX_A);
  });

  test("a confirmed replay records pending and clears both client markers", async () => {
    const { storage, backing } = makeStorage();
    resetPaymentGateState();
    try {
      const outcome = classifyFacilitatorResult({
        reached: true,
        status: 200,
        body: {
          success: true,
          callId: `0x${"cc".repeat(32)}`,
          txHash: TX_A,
          blockNumber: 42,
        },
      });
      expect(outcome.kind).toBe("settled");

      const begun = await beginGuardedFacilitatorRequest({
        storage,
        attempt: { providerId: 1, requestHash: HASH_A },
        request: async () => outcome,
      });
      expect(begun.ok).toBe(true);
      if (!begun.ok || begun.response.kind !== "settled") return;

      const tracked = recordFacilitatorSettlement({
        storage,
        attempt: { providerId: 1, requestHash: HASH_A },
        existing: begun.guard,
        hash: begun.response.txHash,
        persistPending: (hash) => recordSubmittedTx(hash, storage).persisted,
      });
      expect(tracked.guardPersisted).toBe(true);
      expect(tracked.pendingPersisted).toBe(true);
      expect(backing.get("cg_pending_tx")).toBe(TX_A);
      const submitted = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
      expect(submitted.ok && submitted.guard?.stage).toBe("submitted");
      expect(submitted.ok && submitted.guard?.txHash).toBe(TX_A);

      expect(resolvePendingTx(storage).cleared).toBe(true);
      expect(removeFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
      expect(backing.has("cg_pending_tx")).toBe(false);
      const cleared = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
      expect(cleared.ok && cleared.guard === null).toBe(true);
    } finally {
      resetPaymentGateState();
    }
  });

  test("nonce-used 402 keeps the guard and grants no fallback", async () => {
    const { storage } = makeStorage();
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Nonce already used", code: "AUTHORIZATION_ALREADY_USED" },
    });

    const begun = await beginGuardedFacilitatorRequest({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      request: async () => outcome,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    expect(begun.response.kind).toBe("uncertain");
    expect(permitsOnChainFallback(begun.response)).toBe(false);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard?.stage).toBe("prepared");
  });

  test("a pre-settlement 402 keeps the guard and grants no fallback", async () => {
    const { storage } = makeStorage();
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Provider not active", code: "PRE_SETTLEMENT" },
    });

    const begun = await beginGuardedFacilitatorRequest({
      storage,
      attempt: { providerId: 1, requestHash: HASH_A },
      request: async () => outcome,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    expect(begun.response.kind).toBe("uncertain");
    expect(permitsOnChainFallback(begun.response)).toBe(false);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard?.stage).toBe("prepared");
  });
});

describe("guard state transitions cannot be downgraded", () => {
  test("a submitted marker cannot be replaced by prepared or uncertain", () => {
    const { storage } = makeStorage();
    expect(upsertFacilitatorGuard(storage, {
      providerId: 1, requestHash: HASH_A, stage: "submitted", txHash: TX_A,
    }).ok).toBe(true);

    for (const stage of ["prepared", "uncertain"] as const) {
      const result = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("downgrade-refused");
    }

    const still = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(still.ok && still.guard?.stage).toBe("submitted");
    expect(still.ok && still.guard?.txHash).toBe(TX_A);
  });

  test("an uncertain marker cannot be replaced by prepared", () => {
    const { storage } = makeStorage();
    expect(upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "uncertain" }).ok).toBe(true);
    const result = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "prepared" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("downgrade-refused");
  });

  test("a later write cannot drop an existing transaction hash", () => {
    const { storage } = makeStorage();
    expect(upsertFacilitatorGuard(storage, {
      providerId: 1, requestHash: HASH_A, stage: "submitted", txHash: TX_A,
    }).ok).toBe(true);

    const updated = upsertFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A, stage: "submitted" });
    expect(updated.ok).toBe(true);
    const lookup = findFacilitatorGuard(storage, { providerId: 1, requestHash: HASH_A });
    expect(lookup.ok && lookup.guard?.txHash).toBe(TX_A);
  });
});
