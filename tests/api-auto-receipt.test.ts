import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const CALL_ID = `0x${"11".repeat(32)}`;
const CALLER = "0x2222222222222222222222222222222222222222";
const SECRET = "auto-receipt-secret";
const RPC_TOKEN = "SECRET_RPC_TOKEN";

const state: {
  submitError: Error | null;
  calls: string[];
  providerSigner: string;
  providerActive: boolean;
  providerLookupError: Error | null;
} = {
  submitError: null,
  calls: [],
  providerSigner: "0x1111111111111111111111111111111111111111",
  providerActive: true,
  providerLookupError: null,
};

class FakeProvider {
  constructor(_url: string) {}
}

class FakeWallet {
  address = "0x1111111111111111111111111111111111111111";
  constructor(_key?: string, _provider?: unknown) {}
  async signTypedData() {
    return `0x${"33".repeat(65)}`;
  }
}

class FakeContract {
  constructor(_address: string, _abi: readonly string[], _signer: unknown) {}
  async getProvider() {
    state.calls.push("getProvider");
    if (state.providerLookupError) throw state.providerLookupError;
    return { signer: state.providerSigner, active: state.providerActive };
  }
  async submitReceipt() {
    state.calls.push("submitReceipt");
    if (state.submitError) throw state.submitError;
    return {
      hash: `0x${"44".repeat(32)}`,
      wait: async () => ({ blockNumber: 1 }),
    };
  }
}

mock.module("ethers", () => ({
  ethers: {
    JsonRpcProvider: FakeProvider,
    Wallet: FakeWallet,
    Contract: FakeContract,
    keccak256: () => `0x${"55".repeat(32)}`,
    toUtf8Bytes: () => new Uint8Array(),
  },
}));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;

function makeReq(body: Record<string, unknown>) {
  return {
    method: "POST",
    headers: { "x-webhook-secret": SECRET },
    body,
  };
}

function makeRes() {
  return {
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
}

beforeAll(async () => {
  process.env.PROVIDER_WEBHOOK_SECRET = SECRET;
  process.env.ARC_RPC_URL = "https://rpc.invalid";
  process.env.CIRCLE_API_KEY = "circle-key";
  process.env.PAY_PER_CALL = "0x3333333333333333333333333333333333333333";
  process.env.PROVIDER_1_KEY = `0x${"11".repeat(32)}`;
  handler = (await import("../api/auto-receipt.js")).default as Handler;
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  state.submitError = null;
  state.calls.length = 0;
  state.providerSigner = "0x1111111111111111111111111111111111111111";
  state.providerActive = true;
  state.providerLookupError = null;
  process.env.PROVIDER_1_KEY = `0x${"11".repeat(32)}`;
});

describe("auto-receipt error handling", () => {
  test("a receipt submission error is redacted before it reaches the webhook caller or logs", async () => {
    state.submitError = new Error(`could not coalesce error url=https://rpc.invalid/?_rpc_token=${RPC_TOKEN}`);
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const res = makeRes();
    await handler(makeReq({ event: "call.opened", callId: CALL_ID, providerId: "1", payload: "ping" }), res);
    spy.mockRestore();

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(RPC_TOKEN);
    expect(serialized).not.toContain("_rpc_token");
    expect(errors.join("\n")).not.toContain(RPC_TOKEN);
    expect(res.body).toMatchObject({
      received: true,
      result: { ok: false, error: "receipt submission failed" },
    });
  });

  test("an invalid refund amount is rejected instead of rejecting the handler", async () => {
    let thrown: unknown = null;
    const res = makeRes();

    try {
      await handler(
        makeReq({
          event: "circle.refund.initiate",
          callId: CALL_ID,
          disputeId: "dispute-1",
          caller: CALLER,
          amount: "not-an-amount",
        }),
        res,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid amount" });
  });

  test("does not fall back to the seller key when PROVIDER_1_KEY is absent", async () => {
    delete process.env.PROVIDER_1_KEY;
    process.env.SELLER_PRIVATE_KEY = `0x${"77".repeat(32)}`;
    try {
      const res = makeRes();
      await handler(makeReq({ event: "call.opened", callId: CALL_ID, providerId: "1", payload: "ping" }), res);

      expect(state.calls).not.toContain("getProvider");
      expect(state.calls).not.toContain("submitReceipt");
      expect(res.body).toMatchObject({
        received: true,
        result: { ok: false },
      });
      expect(JSON.stringify(res.body)).toContain("missing env vars");
    } finally {
      delete process.env.SELLER_PRIVATE_KEY;
    }
  });

  test("does not submit when the per-provider key is not the registered signer", async () => {
    state.providerSigner = "0x9999999999999999999999999999999999999999";
    const res = makeRes();
    await handler(makeReq({ event: "call.opened", callId: CALL_ID, providerId: "1", payload: "ping" }), res);

    expect(state.calls).toContain("getProvider");
    expect(state.calls).not.toContain("submitReceipt");
    expect(res.body).toMatchObject({
      received: true,
      result: { ok: false, error: "provider 1 signer mismatch" },
    });
  });

  test("a malformed callId is rejected before it reaches ethers", async () => {
    const res = makeRes();
    await handler(makeReq({ event: "call.opened", callId: "not-a-bytes32", providerId: "1" }), res);

    expect(state.calls).toHaveLength(0);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid callId" });
  });
});
