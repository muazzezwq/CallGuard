import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  callServiceFingerprint,
  createAliasRecord,
  createOperationRecord,
  deriveAliasId,
  deriveAuthorizationId,
} from "../api/_idempotency";
import { classifyFacilitatorResult, type FacilitatorBody } from "../src/lib/facilitatorOutcome";

/* These tests exercise the factory path only. The default export stays on the
   current production behavior: no idempotency store is injected, so no
   idempotency decision is made. The store below is an in-memory fake, not a
   distributed Redis integration test. */

const FROM = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0x5fb41dd22c44e1de08f37d98c2995a62d6220540";
const USDC = "0x3600000000000000000000000000000000000000";
const OTHER_USDC = "0x6666666666666666666666666666666666666666";
const REGISTRY = "0x9ca97010464e8e6de6e27cf25eae9b939fbd7333";
const LEGACY_CONTRACT = "0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a";
const LEGACY_REGISTRY = "0xdb73903c904f83251bc345e591a769e0a4ca32d9";
const OPERATION = "call-service";
const REQUEST_HASH = `0x${"aa".repeat(32)}`;
const NONCE = `0x${"bb".repeat(32)}`;
const SIGNATURE = `0x${"11".repeat(65)}`;
const TX_HASH = `0x${"44".repeat(32)}`;
const CALL_ID = `0x${"55".repeat(32)}`;

type Receipt = { status: number; blockNumber: number; logs: unknown[] };

const state: {
  submitCount: number;
  submitError: Error | null;
  waitError: Error | null;
  waitReceipt: Receipt | null;
  receiptForRead: Receipt | null;
  receiptError: Error | null;
  parseCallId: boolean;
  nonceUsed: boolean;
  nonceReads: number;
  verifyCalls: number;
  recovered: string;
  verifyError: boolean;
} = {
  submitCount: 0,
  submitError: null,
  waitError: null,
  waitReceipt: null,
  receiptForRead: null,
  receiptError: null,
  parseCallId: true,
  nonceUsed: false,
  nonceReads: 0,
  verifyCalls: 0,
  recovered: FROM,
  verifyError: false,
};

function receipt(status: number): Receipt {
  return { status, blockNumber: 42, logs: [{}] };
}

class FakeProvider {
  constructor(_url: string) {}
}

class FakeContract {
  kind: "registry" | "usdc" | "call";

  constructor(_address: string, abi: readonly string[]) {
    if (abi.some(item => item.includes("getProvider"))) this.kind = "registry";
    else if (abi.some(item => item.includes("callServiceWithAuthorization"))) this.kind = "call";
    else this.kind = "usdc";
  }

  async authorizationState() {
    state.nonceReads++;
    return state.nonceUsed;
  }

  async getProvider() {
    return { active: true, pricePerCall: 1_000_000n };
  }

  async callServiceWithAuthorization() {
    state.submitCount++;
    if (state.submitError) throw state.submitError;
    return {
      hash: TX_HASH,
      wait: async () => {
        if (state.waitError) throw state.waitError;
        return state.waitReceipt ?? receipt(1);
      },
    };
  }
}

const fakeEthers = {
  JsonRpcProvider: FakeProvider,
  Contract: FakeContract,
  verifyTypedData: () => {
    state.verifyCalls++;
    if (state.verifyError) throw new Error("signature parse failed");
    return state.recovered;
  },
  keccak256: () => `0x${"cc".repeat(32)}`,
  toUtf8Bytes: () => new Uint8Array(),
  Wallet: class {},
  Signature: {
    from: () => ({
      v: 27,
      r: `0x${"00".repeat(32)}`,
      s: `0x${"00".repeat(32)}`,
    }),
  },
  Interface: class {
    parseLog() {
      return state.parseCallId
        ? { name: "CallStarted", args: { callId: CALL_ID } }
        : null;
    }
  },
};

mock.module("ethers", () => ({ ethers: fakeEthers }));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Factory = (options: {
  idempotencyStore?: unknown;
  readReceipt?: (txHash: string) => Promise<Receipt | null>;
}) => Handler;

let createCallServiceHandler: Factory;

function makeStore() {
  const records = new Map<string, Record<string, unknown>>();
  const store = {
    records,
    createCalls: 0,
    getCalls: 0,
    failCreate: false,
    failCreateFor: null as null | ((record: Record<string, unknown>) => boolean),
    failTransition: null as null | ((
      operationId: string,
      expected: string,
      patch: Record<string, unknown>,
    ) => boolean),
    beforeCreate: null as null | ((record: Record<string, unknown>) => Promise<void>),
    async create(record: Record<string, unknown>) {
      store.createCalls++;
      if (store.failCreate) throw new Error("redis unavailable");
      if (store.failCreateFor?.(record)) throw new Error("redis unavailable");
      if (store.beforeCreate) await store.beforeCreate(record);
      const existing = records.get(String(record.operationId));
      if (existing) return { created: false, record: { ...existing } };
      records.set(String(record.operationId), { ...record });
      return { created: true, record: { ...record } };
    },
    async get(operationId: string) {
      store.getCalls++;
      const record = records.get(operationId);
      return record ? { ...record } : null;
    },
    async transition(operationId: string, expected: string, patch: Record<string, unknown>) {
      if (store.failTransition?.(operationId, expected, patch)) {
        throw new Error("transition unavailable");
      }
      const record = records.get(operationId);
      if (!record || record.state !== expected) {
        return { ok: false, record: record ? { ...record } : null };
      }
      const next = { ...record, ...patch, updatedAt: Date.now() };
      records.set(operationId, next);
      return { ok: true, record: { ...next } };
    },
  };
  return store;
}

/* A real barrier: both callers must arrive before either can continue. This is
   stronger than Promise.all, which schedules work but proves no interleaving. */
function makeBarrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return async () => {
    arrived++;
    if (arrived === parties) release?.();
    await gate;
  };
}

function makeHandler(store = makeStore()): Handler {
  return createCallServiceHandler({
    idempotencyStore: store,
    readReceipt: async () => {
      if (state.receiptError) throw state.receiptError;
      return state.receiptForRead;
    },
  });
}

function makeReq(overrides: {
  key?: string;
  providerId?: string;
  requestHash?: string;
  nonce?: string;
  authorization?: Record<string, unknown>;
} = {}) {
  const headers: Record<string, string> = {};
  if (overrides.key !== undefined) headers["idempotency-key"] = overrides.key;
  return {
    method: "POST",
    headers,
    body: {
      providerId: overrides.providerId ?? "1",
      requestHash: overrides.requestHash ?? REQUEST_HASH,
      authorization: {
        from: FROM,
        to: CONTRACT,
        value: "1000000",
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 120),
        nonce: overrides.nonce ?? NONCE,
        ...overrides.authorization,
      },
      signature: SIGNATURE,
    },
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

function seedRecord(
  store: ReturnType<typeof makeStore>,
  recordState: "prepared" | "submitted",
  txHash: string | null = TX_HASH,
  { key = "seed-key", nonce = NONCE }: { key?: string | null; nonce?: string } = {},
) {
  const req = makeReq({ ...(key === null ? {} : { key }), nonce });
  const authorization = (req.body as { authorization: Record<string, unknown> }).authorization;
  const authId = deriveAuthorizationId({ operation: OPERATION, authorization });
  const aliasId = key === null ? null : deriveAliasId({ operation: OPERATION, explicitKey: key });
  const fingerprint = callServiceFingerprint({
    operation: OPERATION,
    chainId: 5042002,
    contract: CONTRACT,
    asset: USDC,
    providerId: "1",
    requestHash: REQUEST_HASH,
    authorization,
  });
  if (aliasId) {
    store.records.set(aliasId, createAliasRecord({ aliasId, authId, fingerprint, now: 1 }));
  }
  store.records.set(authId, {
    ...createOperationRecord({
      operationId: authId,
      authId,
      fingerprint,
      explicitKey: key,
      now: 1,
    }),
    state: recordState,
    ...(txHash ? { txHash } : {}),
    attempts: recordState === "submitted" ? 1 : 0,
  });
  return { req, operationId: authId, aliasId };
}

function seedSubmitted(store: ReturnType<typeof makeStore>, txHash = TX_HASH) {
  return seedRecord(store, "submitted", txHash);
}

function seedPrepared(store: ReturnType<typeof makeStore>) {
  return seedRecord(store, "prepared", null);
}

beforeAll(async () => {
  process.env.ARC_RPC_URL = "http://rpc.invalid";
  process.env.USDC_ADDRESS = USDC;
  process.env.PAY_PER_CALL = LEGACY_CONTRACT;
  process.env.SERVICE_REGISTRY = LEGACY_REGISTRY;
  process.env.FACILITATOR_PRIVATE_KEY = `0x${"22".repeat(32)}`;

  const mod = await import("../api/call-service.js");
  createCallServiceHandler = mod.createCallServiceHandler as Factory;
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  state.submitCount = 0;
  state.submitError = null;
  state.waitError = null;
  state.waitReceipt = null;
  state.receiptForRead = null;
  state.receiptError = null;
  state.parseCallId = true;
  state.nonceUsed = false;
  state.nonceReads = 0;
  state.verifyCalls = 0;
  state.recovered = FROM;
  state.verifyError = false;
});

describe("call-service idempotency foundation", () => {
  test("same key and same fingerprint submits once and replays the stored result", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "same-op" });

    const first = makeRes();
    await handler(req, first);
    const second = makeRes();
    await handler(req, second);

    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({ success: true, txHash: TX_HASH, callId: CALL_ID, blockNumber: 42 });
    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual({ success: true, txHash: TX_HASH, callId: CALL_ID, blockNumber: 42 });
    expect(state.submitCount).toBe(1);
  });

  test("a confirmed retry after the nonce is used returns the stored success without another submission", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "confirmed-retry" });

    const first = makeRes();
    await handler(req, first);
    expect(first.statusCode).toBe(200);
    expect(state.submitCount).toBe(1);

    state.nonceReads = 0;
    state.nonceUsed = true;
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(state.nonceReads).toBe(0);
    expect(state.submitCount).toBe(1);
  });

  test("the same signed authorization under different explicit keys creates one operation", async () => {
    const store = makeStore();
    const gate = makeBarrier(2);
    store.beforeCreate = async (record) => {
      if (record.kind === "operation") await gate();
    };
    const handler = makeHandler(store);

    const first = makeRes();
    const second = makeRes();
    await Promise.all([
      handler(makeReq({ key: "alias-race-a" }), first),
      handler(makeReq({ key: "alias-race-b" }), second),
    ]);

    expect(state.submitCount).toBe(1);
    expect([first.statusCode, second.statusCode]).not.toContain(500);
    const operations = [...store.records.values()].filter(record => record.kind === "operation");
    const aliases = [...store.records.values()].filter(record => record.kind === "alias");
    expect(operations).toHaveLength(1);
    expect(aliases).toHaveLength(2);
    expect(new Set(aliases.map(record => String(record.authId))))
      .toEqual(new Set([String(operations[0]?.authId)]));
  });

  test("a signature failure cannot obtain a stored success replay", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "signature-replay" });

    const first = makeRes();
    await handler(req, first);
    expect(first.statusCode).toBe(200);

    store.getCalls = 0;
    state.verifyCalls = 0;
    state.recovered = "0x2222222222222222222222222222222222222222";
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(402);
    expect(second.body).toMatchObject({ error: "Signature mismatch", code: "PRE_SETTLEMENT" });
    expect(store.getCalls).toBe(0);
    expect(state.verifyCalls).toBe(1);
    expect(state.submitCount).toBe(1);
  });

  test("an HTTP success replay is classified as settled", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "classifier-replay" });

    await handler(req, makeRes());
    const replay = makeRes();
    await handler(req, replay);

    const outcome = classifyFacilitatorResult({
      reached: true,
      status: replay.statusCode,
      body: replay.body as FacilitatorBody,
    });
    expect(outcome.kind).toBe("settled");
    if (outcome.kind === "settled") expect(outcome.txHash).toBe(TX_HASH);
  });

  test("same key with different payment parameters conflicts and submits nothing new", async () => {
    const store = makeStore();
    const handler = makeHandler(store);

    const first = makeRes();
    await handler(makeReq({ key: "conflict-key", providerId: "1" }), first);
    state.nonceReads = 0;
    state.nonceUsed = true;
    const second = makeRes();
    await handler(makeReq({ key: "conflict-key", providerId: "2" }), second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(state.nonceReads).toBe(0);
    expect(state.submitCount).toBe(1);
  });

  test("concurrent duplicates produce one submit and no 500", async () => {
    const store = makeStore();
    const gate = makeBarrier(2);
    store.beforeCreate = async (record) => {
      if (record.kind === "operation") await gate();
    };
    const handler = makeHandler(store);
    const req = makeReq({ key: "concurrent-key" });

    const first = makeRes();
    const second = makeRes();
    await Promise.all([handler(req, first), handler(req, second)]);

    expect(state.submitCount).toBe(1);
    expect([first.statusCode, second.statusCode]).not.toContain(500);
    expect([first.statusCode, second.statusCode].some(code => code === 200 || code === 202)).toBe(true);
  });

  test("an existing prepared operation reports in-progress and does not submit", async () => {
    const store = makeStore();
    const { req, operationId } = seedPrepared(store);
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      pending: true,
      code: "OPERATION_IN_PROGRESS",
      retryable: false,
    });
    expect(state.submitCount).toBe(0);
    expect(store.records.get(operationId)?.state).toBe("prepared");
  });

  test("a known hash with a pending receipt stays unresolved and does not submit", async () => {
    const store = makeStore();
    const { req } = seedSubmitted(store);
    state.receiptForRead = null;
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      pending: true,
      code: "SETTLEMENT_OUTCOME_UNKNOWN",
      txHash: TX_HASH,
      retryable: false,
    });
    expect(state.submitCount).toBe(0);
  });

  test("a known hash with a confirmed receipt resolves to success without submitting", async () => {
    const store = makeStore();
    const { req, operationId } = seedSubmitted(store);
    state.receiptForRead = receipt(1);
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, txHash: TX_HASH, callId: CALL_ID });
    expect(state.submitCount).toBe(0);
    expect(store.records.get(operationId)?.state).toBe("confirmed");
  });

  test("a known hash with a reverted receipt returns a terminal failure without submitting", async () => {
    const store = makeStore();
    const { req, operationId } = seedSubmitted(store);
    state.receiptForRead = receipt(0);
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "SETTLEMENT_REVERTED", txHash: TX_HASH });
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: res.statusCode,
      body: res.body as FacilitatorBody,
    });
    expect(outcome.kind).toBe("reverted");
    if (outcome.kind === "reverted") expect(outcome.txHash).toBe(TX_HASH);
    expect(state.submitCount).toBe(0);
    expect(store.records.get(operationId)?.state).toBe("reverted");
  });

  test("a timeout after broadcast retains the hash and never creates a fresh transaction", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "timeout-key" });
    state.waitError = new Error("timeout");

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(202);
    expect(first.body).toMatchObject({
      pending: true,
      code: "SETTLEMENT_OUTCOME_UNKNOWN",
      txHash: TX_HASH,
      retryable: false,
    });
    expect(state.submitCount).toBe(1);
    const record = [...store.records.values()].find(item => item.kind === "operation");
    expect(record).toMatchObject({ state: "unknown", txHash: TX_HASH });

    state.waitError = null;
    state.receiptForRead = null;
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(202);
    expect(second.body).toMatchObject({ txHash: TX_HASH });
    expect(state.submitCount).toBe(1);
  });

  test("an unknown submission with no hash stays unresolved and never resubmits", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "no-hash-key" });
    state.submitError = new Error("network reset");

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(202);
    expect(first.body).toMatchObject({
      pending: true,
      code: "SUBMISSION_OUTCOME_UNKNOWN",
      retryable: false,
    });
    expect(first.body).not.toHaveProperty("txHash");
    expect(state.submitCount).toBe(1);
    const record = [...store.records.values()].find(item => item.kind === "operation");
    expect(record).toMatchObject({ state: "unknown" });
    expect(record).not.toHaveProperty("txHash");

    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(202);
    expect(second.body).toMatchObject({ code: "SUBMISSION_OUTCOME_UNKNOWN" });
    expect(state.submitCount).toBe(1);
  });

  test("store unavailability fails closed with no in-memory fallback and no submit", async () => {
    const store = makeStore();
    store.failCreate = true;
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(makeReq({ key: "store-down" }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: "IDEMPOTENCY_UNAVAILABLE" });
    expect(state.submitCount).toBe(0);
  });

  test("a new signed authorization is a new operation, not a permanent provider/request/payer lock", async () => {
    const store = makeStore();
    const handler = makeHandler(store);

    const first = makeRes();
    await handler(makeReq({ nonce: NONCE }), first);
    const second = makeRes();
    await handler(makeReq({ nonce: `0x${"dd".repeat(32)}` }), second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(state.submitCount).toBe(2);
  });

  test("an explicit key cannot hide a changed authorization nonce", async () => {
    const store = makeStore();
    const handler = makeHandler(store);

    const first = makeRes();
    await handler(makeReq({ key: "nonce-key", nonce: NONCE }), first);
    const second = makeRes();
    await handler(makeReq({ key: "nonce-key", nonce: `0x${"ee".repeat(32)}` }), second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(state.submitCount).toBe(1);
  });

  test("a stored operation for a different payment asset cannot replay", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq();
    const authorization = (req.body as { authorization: Record<string, unknown> }).authorization;
    const authId = deriveAuthorizationId({ operation: OPERATION, authorization });
    const otherAssetFingerprint = callServiceFingerprint({
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      asset: OTHER_USDC,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization,
    });
    store.records.set(authId, {
      ...createOperationRecord({
        operationId: authId,
        authId,
        fingerprint: otherAssetFingerprint,
        now: 1,
      }),
      state: "confirmed",
      callId: CALL_ID,
      txHash: TX_HASH,
      blockNumber: 42,
    });

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(state.nonceReads).toBe(0);
    expect(state.submitCount).toBe(0);
  });

  test("a failed submitted transition after broadcast returns unknown with the hash and never resubmits", async () => {
    const store = makeStore();
    store.failTransition = (_operationId, _expected, patch) => patch.state === "submitted";
    const handler = makeHandler(store);
    const req = makeReq({ key: "transition-after-broadcast" });

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(202);
    expect(first.body).toMatchObject({
      pending: true,
      code: "SETTLEMENT_OUTCOME_UNKNOWN",
      txHash: TX_HASH,
      retryable: false,
    });
    expect(first.headers["X-Idempotency-Persisted"]).toBe("false");
    expect(state.submitCount).toBe(1);
    const record = [...store.records.values()].find(item => item.kind === "operation");
    expect(record?.state).toBe("prepared");

    store.failTransition = null;
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(202);
    expect(second.body).toMatchObject({ code: "OPERATION_IN_PROGRESS" });
    expect(state.submitCount).toBe(1);
  });

  test("a failed transition after a confirmed receipt is not returned as durable success", async () => {
    const store = makeStore();
    store.failTransition = (_operationId, _expected, patch) => patch.state === "confirmed";
    const handler = makeHandler(store);
    const req = makeReq({ key: "transition-after-confirmation" });

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(202);
    expect(first.body).toMatchObject({
      pending: true,
      code: "SETTLEMENT_OUTCOME_UNKNOWN",
      txHash: TX_HASH,
      retryable: false,
    });
    expect(first.body).not.toMatchObject({ success: true });
    expect(first.headers["X-Idempotency-Persisted"]).toBe("false");
    expect(state.submitCount).toBe(1);
    expect([...store.records.values()].find(item => item.kind === "operation")?.state)
      .toBe("submitted");

    store.failTransition = null;
    state.receiptForRead = receipt(1);
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ success: true, txHash: TX_HASH, callId: CALL_ID });
    expect(state.submitCount).toBe(1);
    expect([...store.records.values()].find(item => item.kind === "operation")?.state)
      .toBe("confirmed");
  });

  test("a failed transition after a reverted receipt is not returned as durable reverted", async () => {
    const store = makeStore();
    store.failTransition = (_operationId, _expected, patch) => patch.state === "reverted";
    const handler = makeHandler(store);
    const req = makeReq({ key: "transition-after-revert" });
    state.waitReceipt = receipt(0);

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(202);
    expect(first.body).toMatchObject({
      pending: true,
      code: "SETTLEMENT_OUTCOME_UNKNOWN",
      txHash: TX_HASH,
      retryable: false,
    });
    expect(first.headers["X-Idempotency-Persisted"]).toBe("false");
    expect(state.submitCount).toBe(1);
    expect([...store.records.values()].find(item => item.kind === "operation")?.state)
      .toBe("submitted");

    store.failTransition = null;
    state.receiptForRead = receipt(0);
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ code: "SETTLEMENT_REVERTED", txHash: TX_HASH });
    expect(state.submitCount).toBe(1);
    expect([...store.records.values()].find(item => item.kind === "operation")?.state)
      .toBe("reverted");
  });

  test("a CAS failure after confirmation resolves from the latest persisted operation", async () => {
    const store = makeStore();
    store.failTransition = (operationId, _expected, patch) => {
      if (patch.state !== "confirmed") return false;
      const current = store.records.get(operationId);
      if (current) store.records.set(operationId, { ...current, ...patch });
      return true;
    };
    const handler = makeHandler(store);

    const res = makeRes();
    await handler(makeReq({ key: "cas-confirmation" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, txHash: TX_HASH, callId: CALL_ID });
    expect(res.headers["X-Idempotency-Persisted"]).toBeUndefined();
    expect(state.submitCount).toBe(1);
  });

  test("a store failure between alias creation and operation creation leaves a recoverable orphan alias", async () => {
    const store = makeStore();
    store.failCreateFor = record => record.kind === "operation";
    const handler = makeHandler(store);
    const req = makeReq({ key: "orphan-key" });
    const authorization = (req.body as { authorization: Record<string, unknown> }).authorization;
    const authId = deriveAuthorizationId({ operation: OPERATION, authorization });
    const aliasId = deriveAliasId({ operation: OPERATION, explicitKey: "orphan-key" });

    const first = makeRes();
    await handler(req, first);

    expect(first.statusCode).toBe(503);
    expect(first.body).toMatchObject({ code: "IDEMPOTENCY_UNAVAILABLE" });
    expect(state.submitCount).toBe(0);
    expect(store.records.has(String(aliasId))).toBe(true);
    expect(store.records.has(authId)).toBe(false);

    store.failCreateFor = null;
    const second = makeRes();
    await handler(req, second);

    expect(second.statusCode).toBe(200);
    expect(state.submitCount).toBe(1);
    expect(store.records.has(String(aliasId))).toBe(true);
    expect(store.records.get(authId)).toMatchObject({ state: "confirmed" });
  });

  test("an alias pointing at another authorization cannot replay its operation", async () => {
    const store = makeStore();
    const handler = makeHandler(store);
    const req = makeReq({ key: "redirect-key" });
    const authorization = (req.body as { authorization: Record<string, unknown> }).authorization;
    const authId = deriveAuthorizationId({ operation: OPERATION, authorization });
    const aliasId = deriveAliasId({ operation: OPERATION, explicitKey: "redirect-key" });
    const fingerprint = callServiceFingerprint({
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      asset: USDC,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization,
    });
    store.records.set(authId, {
      ...createOperationRecord({ operationId: authId, authId, fingerprint, now: 1 }),
      state: "confirmed",
      callId: CALL_ID,
      txHash: TX_HASH,
      blockNumber: 42,
    });
    store.records.set(String(aliasId), createAliasRecord({
      aliasId: String(aliasId),
      authId: "call-service:auth:0x9999999999999999999999999999999999999999:0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      fingerprint: "f".repeat(64),
      now: 1,
    }));

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(state.nonceReads).toBe(0);
    expect(state.submitCount).toBe(0);
  });

  test("concurrent different authorizations with one key create one operation and one conflict", async () => {
    const store = makeStore();
    const gate = makeBarrier(2);
    store.beforeCreate = async (record) => {
      if (record.kind === "alias") await gate();
    };
    const handler = makeHandler(store);

    const first = makeRes();
    const second = makeRes();
    await Promise.all([
      handler(makeReq({ key: "shared-race-key", nonce: NONCE }), first),
      handler(makeReq({ key: "shared-race-key", nonce: `0x${"dd".repeat(32)}` }), second),
    ]);

    expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([200, 409]);
    expect(state.submitCount).toBe(1);
    const operations = [...store.records.values()].filter(record => record.kind === "operation");
    const aliases = [...store.records.values()].filter(record => record.kind === "alias");
    expect(operations).toHaveLength(1);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.authId).toBe(operations[0]?.authId);
  });
});
