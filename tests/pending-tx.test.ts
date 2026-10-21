import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  FACILITATOR_GUARD_KEY,
  ackFacilitatorGuard,
  addFacilitatorGuard,
  findFacilitatorGuard,
  type GuardStorage,
} from "../src/lib/facilitatorGuard";

/* `src/lib/utils.ts` reads the ambient `sessionStorage`, so the tests provide a
   minimal fake with failure switches for the fail-closed paths. */

const store = new Map<string, string>();
const flags = { failGet: false, failSet: false, failRemove: false };

const fakeStorage: GuardStorage = {
  getItem: (key) => {
    if (flags.failGet) throw new Error("storage read failed");
    return store.get(key) ?? null;
  },
  setItem: (key, value) => {
    if (flags.failSet) throw new Error("storage write failed");
    store.set(key, value);
  },
  removeItem: (key) => {
    if (flags.failRemove) throw new Error("storage remove failed");
    store.delete(key);
  },
};

const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", {
  value: fakeStorage,
  configurable: true,
  writable: true,
});

const { setPendingTx, readPendingTx, clearPendingTx, checkNoPendingTx } = await import("../src/lib/utils");

const HASH_A = `0x${"aa".repeat(32)}`;

beforeEach(() => {
  store.clear();
  flags.failGet = false;
  flags.failSet = false;
  flags.failRemove = false;
});

afterAll(() => {
  if (originalSessionStorage) Object.defineProperty(globalThis, "sessionStorage", originalSessionStorage);
  else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe("pending transaction marker", () => {
  test("round-trips a hash through the session store", () => {
    expect(readPendingTx()).toEqual({ ok: true, hash: null });
    expect(setPendingTx(HASH_A)).toBe(true);
    expect(readPendingTx()).toEqual({ ok: true, hash: HASH_A });
    expect(clearPendingTx()).toBe(true);
    expect(readPendingTx()).toEqual({ ok: true, hash: null });
  });

  test("a failed write is reported and leaves no marker", () => {
    flags.failSet = true;
    expect(setPendingTx(HASH_A)).toBe(false);
    expect(store.has("cg_pending_tx")).toBe(false);
  });

  test("an unreadable store is a failure, not an empty marker", () => {
    flags.failGet = true;
    expect(readPendingTx()).toEqual({ ok: false, reason: "storage-unavailable" });
  });

  test("a failed removal is reported", () => {
    expect(setPendingTx(HASH_A)).toBe(true);
    flags.failRemove = true;
    expect(clearPendingTx()).toBe(false);
    expect(store.get("cg_pending_tx")).toBe(HASH_A);
  });

  test("an unverifiable removal is reported conservatively", () => {
    expect(setPendingTx(HASH_A)).toBe(true);
    flags.failGet = true; // removal succeeds, but read-back cannot prove it
    expect(clearPendingTx()).toBe(false);
  });

  test("blocking check refuses a second write while a marker exists", () => {
    const calls: string[] = [];
    const toastFn = (opts: { kind: string; title: string }) => { calls.push(`${opts.kind}:${opts.title}`); };

    expect(checkNoPendingTx(toastFn)).toBe(true);
    expect(calls).toHaveLength(0);

    expect(setPendingTx(HASH_A)).toBe(true);
    expect(checkNoPendingTx(toastFn)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("pending");
  });

  test("blocking check fails closed when the store cannot be read", () => {
    const calls: string[] = [];
    const toastFn = (opts: { kind: string; title: string }) => { calls.push(`${opts.kind}:${opts.title}`); };
    flags.failGet = true;

    expect(checkNoPendingTx(toastFn)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("Cannot verify pending transactions");
  });

  test("clearing the pending marker does not clear a facilitator uncertainty marker", () => {
    expect(addFacilitatorGuard(fakeStorage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
    expect(setPendingTx(HASH_A)).toBe(true);

    expect(clearPendingTx()).toBe(true);

    expect(readPendingTx()).toEqual({ ok: true, hash: null });
    const guard = findFacilitatorGuard(fakeStorage, { providerId: 1, requestHash: HASH_A });
    expect(guard.ok && guard.guard !== null).toBe(true);
    expect(store.has(FACILITATOR_GUARD_KEY)).toBe(true);
  });

  test("acknowledging a facilitator marker does not clear the pending marker", () => {
    expect(addFacilitatorGuard(fakeStorage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);
    expect(setPendingTx(HASH_A)).toBe(true);

    expect(ackFacilitatorGuard(fakeStorage, { providerId: 1, requestHash: HASH_A }).ok).toBe(true);

    expect(readPendingTx()).toEqual({ ok: true, hash: HASH_A });
    const guard = findFacilitatorGuard(fakeStorage, { providerId: 1, requestHash: HASH_A });
    expect(guard.ok && guard.guard === null).toBe(true);
  });
});
