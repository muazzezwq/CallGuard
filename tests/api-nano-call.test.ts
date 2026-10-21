import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

/* The handler spends a server-side key. These tests replace the `ethers`
   boundary and the Gateway fetch boundary so they can prove *which* payment
   rail was invoked without sending a payment. */

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const USDC = "0x3600000000000000000000000000000000000000";
const TX_HASH = `0x${"ab".repeat(32)}`;
const API_KEY = "test-nano-key";

const state: {
  balance: bigint;
  transferError: Error | null;
  waitError: Error | null;
  receiptStatus: number;
} = {
  balance: 5_000_000n,
  transferError: null,
  waitError: null,
  receiptStatus: 1,
};

const calls: string[] = [];
const fetchCalls: unknown[][] = [];

class FakeProvider {
  constructor(_url: string) {}
}

class FakeWallet {
  address = BUYER;
  constructor(_key: string, _provider: unknown) {}
}

class FakeContract {
  constructor(_address: string, _abi: readonly string[], _signer: unknown) {}

  async balanceOf(_address: string) {
    calls.push("balanceOf");
    return state.balance;
  }

  async transfer(_to: string, _amount: bigint) {
    calls.push("transfer");
    if (state.transferError) throw state.transferError;
    return {
      hash: TX_HASH,
      wait: async () => {
        calls.push("wait");
        if (state.waitError) throw state.waitError;
        return { status: state.receiptStatus, hash: TX_HASH };
      },
    };
  }
}

const fakeEthers = {
  JsonRpcProvider: FakeProvider,
  Wallet: FakeWallet,
  Contract: FakeContract,
  isAddress: () => true,
  formatUnits: (value: bigint) => (Number(value) / 1_000_000).toString(),
  parseUnits: () => 1_000n,
};

mock.module("ethers", () => ({ ethers: fakeEthers }));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type HandlerFactory = (options: {
  env: Record<string, string | undefined>;
  fetchImpl?: (input: unknown, init?: unknown) => Promise<unknown>;
}) => Handler;

type GatewayResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function gatewayResponse(status: number, body: unknown): GatewayResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

let createHandler: HandlerFactory;
let fetchImpl: (input: unknown, init?: unknown) => Promise<unknown>;

const baseEnv: Record<string, string | undefined> = {
  NANO_API_KEY: API_KEY,
  BUYER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  SELLER_ADDRESS: SELLER,
  ARC_RPC_URL: "https://rpc.invalid",
  USDC_ADDRESS: USDC,
  GATEWAY_BATCH_URL: "https://gateway.invalid/v1/batch",
  GATEWAY_BATCH_API_KEY: "gateway-api-key",
};

let ipCounter = 0;

function makeHandler(overrides: Record<string, string | undefined> = {}): Handler {
  return createHandler({
    env: { ...baseEnv, ...overrides },
    fetchImpl: async (input, init) => {
      fetchCalls.push([input, init]);
      return fetchImpl(input, init);
    },
  });
}

function makeReq(overrides: { body?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  return {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "x-forwarded-for": `198.51.100.${++ipCounter}`,
      ...overrides.headers,
    },
    socket: { remoteAddress: "198.51.100.1" },
    body: {
      caller: BUYER,
      providerId: "1",
      payload: "nano-ping",
      amount: "0.001",
      ...overrides.body,
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

function resetState() {
  state.balance = 5_000_000n;
  state.transferError = null;
  state.waitError = null;
  state.receiptStatus = 1;
  calls.length = 0;
  fetchCalls.length = 0;
}

beforeAll(async () => {
  const mod = await import("../api/nano-call.js");
  createHandler = mod.createNanoCallHandler as HandlerFactory;
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetState();
  fetchImpl = async () => gatewayResponse(500, { error: "unexpected fetch" });
});

describe("nano-call Gateway fail-closed behavior", () => {
  test("missing Gateway configuration is the only pre-attempt path that may use ERC-20", async () => {
    const res = makeRes();
    await makeHandler({ GATEWAY_BATCH_URL: undefined })(makeReq(), res);

    expect(fetchCalls).toHaveLength(0);
    expect(calls.filter(call => call === "transfer")).toHaveLength(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, rail: "erc20", txHash: TX_HASH });
  });

  test("an invalid Gateway URL fails before submission and does not spend on-chain", async () => {
    const res = makeRes();
    await makeHandler({ GATEWAY_BATCH_URL: "not-a-url" })(makeReq(), res);

    expect(fetchCalls).toHaveLength(0);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ ok: false, code: "GATEWAY_CONFIG_INVALID" });
  });

  test("an accepted Gateway payment is reported only with provider evidence", async () => {
    fetchImpl = async () => gatewayResponse(200, { batchId: "batch-123" });

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, rail: "gateway", batchId: "batch-123" });
  });

  test("a malformed success body is uncertain and never invokes ERC-20", async () => {
    fetchImpl = async () => gatewayResponse(200, "{not-json");

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: false,
      pending: true,
      code: "PAYMENT_OUTCOME_UNKNOWN",
      rail: "gateway",
      retryable: false,
    });
  });

  test("a success response without a payment identifier is uncertain and never invokes ERC-20", async () => {
    fetchImpl = async () => gatewayResponse(200, { ok: true });

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: false,
      pending: true,
      code: "PAYMENT_OUTCOME_UNKNOWN",
      rail: "gateway",
    });
  });

  test("a timeout after submission cannot trigger an on-chain payment", async () => {
    fetchImpl = async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    };

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: false,
      pending: true,
      code: "PAYMENT_OUTCOME_UNKNOWN",
      rail: "gateway",
      retryable: false,
    });
  });

  test("a connection reset after submission cannot trigger an on-chain payment", async () => {
    fetchImpl = async () => {
      const error = new Error("socket hang up");
      (error as Error & { code?: string }).code = "ECONNRESET";
      throw error;
    };

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ code: "PAYMENT_OUTCOME_UNKNOWN", pending: true });
  });

  test("an ambiguous server error cannot trigger an on-chain payment", async () => {
    fetchImpl = async () => gatewayResponse(503, { error: "upstream unavailable" });

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ code: "PAYMENT_OUTCOME_UNKNOWN", pending: true });
  });

  test("a 4xx response is not treated as proof that no payment occurred", async () => {
    fetchImpl = async () => gatewayResponse(400, { error: "bad request" });

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ code: "PAYMENT_OUTCOME_UNKNOWN", pending: true });
  });

  test("one uncertain Gateway request issues exactly one attempt and no retry", async () => {
    fetchImpl = async () => {
      throw new Error("network unavailable");
    };

    const res = makeRes();
    await makeHandler()(makeReq(), res);

    expect(fetchCalls).toHaveLength(1);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.body).toMatchObject({ retryable: false });
  });

  test("an unknown ERC-20 receipt returns a pending result with its transaction hash", async () => {
    state.waitError = new Error("receipt lookup failed");

    const res = makeRes();
    await makeHandler({ GATEWAY_BATCH_URL: undefined })(makeReq(), res);

    expect(calls.filter(call => call === "transfer")).toHaveLength(1);
    expect(calls.filter(call => call === "wait")).toHaveLength(1);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: false,
      pending: true,
      code: "TRANSFER_OUTCOME_UNKNOWN",
      rail: "erc20",
      txHash: TX_HASH,
      retryable: false,
    });
  });

  test("a definite ERC-20 submission failure does not retry the transfer", async () => {
    state.transferError = new Error("insufficient funds");

    const res = makeRes();
    await makeHandler({ GATEWAY_BATCH_URL: undefined })(makeReq(), res);

    expect(calls.filter(call => call === "transfer")).toHaveLength(1);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: "TRANSFER_FAILED" });
  });

  test("missing buyer configuration prevents any Gateway attempt or fallback", async () => {
    const res = makeRes();
    await makeHandler({ BUYER_PRIVATE_KEY: undefined })(makeReq(), res);

    expect(fetchCalls).toHaveLength(0);
    expect(calls.filter(call => call === "transfer")).toHaveLength(0);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ ok: false });
  });
});
