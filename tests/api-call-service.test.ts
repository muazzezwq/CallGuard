import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

/* The handler depends on a live Arc RPC. These tests replace only the `ethers`
   boundary, so the request ordering and the 402 response policy under test are
   the handler's real code. */

const FROM = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const CONTRACT = "0x5fb41dd22c44e1de08f37d98c2995a62d6220540";
const USDC = "0x3600000000000000000000000000000000000000";
const REGISTRY = "0x9ca97010464e8e6de6e27cf25eae9b939fbd7333";
const LEGACY_CONTRACT = "0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a";
const LEGACY_REGISTRY = "0xdb73903c904f83251bc345e591a769e0a4ca32d9";
const REQUEST_HASH = `0x${"aa".repeat(32)}`;
const NONCE = `0x${"bb".repeat(32)}`;
const SIGNATURE = `0x${"11".repeat(65)}`;

const state: {
  nonceUsed: boolean;
  nonceError: boolean;
  recovered: string;
  active: boolean;
  price: bigint;
} = {
  nonceUsed: false,
  nonceError: false,
  recovered: FROM,
  active: true,
  price: 1_000_000n,
};

const calls: string[] = [];

function resetState() {
  state.nonceUsed = false;
  state.nonceError = false;
  state.recovered = FROM;
  state.active = true;
  state.price = 1_000_000n;
  calls.length = 0;
}

class FakeProvider {
  constructor(_url: string) {}
}

class FakeContract {
  kind: "registry" | "usdc";

  constructor(_address: string, abi: readonly string[]) {
    this.kind = abi.some(item => item.includes("getProvider")) ? "registry" : "usdc";
  }

  async authorizationState() {
    calls.push("authorizationState");
    if (state.nonceError) throw new Error("rpc failed");
    return state.nonceUsed;
  }

  async getProvider() {
    calls.push("getProvider");
    return { active: state.active, pricePerCall: state.price };
  }
}

const fakeEthers = {
  JsonRpcProvider: FakeProvider,
  Contract: FakeContract,
  verifyTypedData: () => {
    calls.push("verifyTypedData");
    return state.recovered;
  },
  keccak256: () => `0x${"cc".repeat(32)}`,
  toUtf8Bytes: () => new Uint8Array(),
  Wallet: class {},
  Signature: { from: () => ({ v: 27, r: `0x${"00".repeat(32)}`, s: `0x${"00".repeat(32)}` }) },
  Interface: class {
    parseLog() {
      return null;
    }
  },
};

mock.module("ethers", () => ({ ethers: fakeEthers }));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;

function makeReq(overrides: {
  authorization?: Record<string, unknown>;
  signature?: string;
  providerId?: unknown;
  requestHash?: unknown;
} = {}) {
  return {
    method: "POST",
    body: {
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: {
        from: FROM,
        to: CONTRACT,
        value: "1000000",
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 120),
        nonce: NONCE,
        ...overrides.authorization,
      },
      signature: overrides.signature ?? SIGNATURE,
      ...(overrides.providerId === undefined ? {} : { providerId: overrides.providerId }),
      ...(overrides.requestHash === undefined ? {} : { requestHash: overrides.requestHash }),
    },
  };
}

function makeChallengeReq(providerId: unknown = "1") {
  return {
    method: "POST",
    headers: { host: "callguard.test", "x-forwarded-proto": "https" },
    body: { providerId },
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

beforeAll(async () => {
  process.env.ARC_RPC_URL = "http://rpc.invalid";
  process.env.USDC_ADDRESS = USDC;
  process.env.PAY_PER_CALL = LEGACY_CONTRACT;
  process.env.SERVICE_REGISTRY = LEGACY_REGISTRY;
  process.env.FACILITATOR_ADDRESS = FROM;
  delete process.env.FACILITATOR_PRIVATE_KEY;

  const mod = await import("../api/call-service.js");
  handler = mod.default as Handler;
});

afterAll(() => {
  mock.restore();
});

describe("call-service authorization replay ordering", () => {
  test("a replayed authorization is rejected before every validation failure", async () => {
    const failures = [
      {
        name: "signature mismatch",
        setup: () => { state.recovered = OTHER; },
        overrides: {},
      },
      {
        name: "authorization not yet valid",
        setup: () => {},
        overrides: {
          authorization: {
            validAfter: String(Math.floor(Date.now() / 1000) + 600),
            validBefore: String(Math.floor(Date.now() / 1000) + 1200),
          },
        },
      },
      {
        name: "authorization expired",
        setup: () => {},
        overrides: { authorization: { validBefore: "1" } },
      },
      {
        name: "wrong target",
        setup: () => {},
        overrides: { authorization: { to: OTHER } },
      },
      {
        name: "provider inactive",
        setup: () => { state.active = false; },
        overrides: {},
      },
      {
        name: "value mismatch",
        setup: () => { state.price = 2_000_000n; },
        overrides: {},
      },
    ];

    for (const failure of failures) {
      resetState();
      state.nonceUsed = true;
      failure.setup();

      const res = makeRes();
      await handler(makeReq(failure.overrides), res);

      expect({ failure: failure.name, status: res.statusCode }).toEqual({ failure: failure.name, status: 402 });
      expect(res.body).toMatchObject({
        error: "Nonce already used",
        code: "AUTHORIZATION_ALREADY_USED",
      });
      expect(calls).toEqual(["authorizationState"]);
    }
  });

  test("a fresh authorization gets only a structured pre-settlement rejection", async () => {
    const failures = [
      {
        name: "signature mismatch",
        setup: () => { state.recovered = OTHER; },
        overrides: {},
        error: "Signature mismatch",
      },
      {
        name: "authorization not yet valid",
        setup: () => {},
        overrides: {
          authorization: {
            validAfter: String(Math.floor(Date.now() / 1000) + 600),
            validBefore: String(Math.floor(Date.now() / 1000) + 1200),
          },
        },
        error: "Authorization not yet valid",
      },
      {
        name: "authorization expired",
        setup: () => {},
        overrides: { authorization: { validBefore: "1" } },
        error: "Authorization expired",
      },
      {
        name: "wrong target",
        setup: () => {},
        overrides: { authorization: { to: OTHER } },
        error: "Authorization 'to' must be the PayPerCall contract",
      },
      {
        name: "provider inactive",
        setup: () => { state.active = false; },
        overrides: {},
        error: "Provider not active",
      },
      {
        name: "value mismatch",
        setup: () => { state.price = 2_000_000n; },
        overrides: {},
        error: "Authorization value must equal provider pricePerCall",
      },
    ];

    for (const failure of failures) {
      resetState();
      failure.setup();

      const res = makeRes();
      await handler(makeReq(failure.overrides), res);

      expect({ failure: failure.name, status: res.statusCode }).toEqual({ failure: failure.name, status: 402 });
      expect(res.body).toMatchObject({ error: failure.error, code: "PRE_SETTLEMENT" });
      expect(calls[0]).toBe("authorizationState");
    }
  });

  test("a replayed authorization never returns the pre-settlement code", async () => {
    resetState();
    state.nonceUsed = true;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ code: "AUTHORIZATION_ALREADY_USED" });
    expect((res.body as { code?: string }).code).not.toBe("PRE_SETTLEMENT");
  });

  test("a nonce-state read failure is uncertain, not pre-settlement", async () => {
    resetState();
    state.nonceError = true;

    const originalError = console.error;
    console.error = () => {};
    try {
      const res = makeRes();
      await handler(makeReq(), res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ error: "Internal settlement error" });
    } finally {
      console.error = originalError;
    }
  });

  test("a malformed payment request carries a non-fallback code without touching the nonce", async () => {
    resetState();

    const res = makeRes();
    await handler(makeReq({ signature: "0xbad" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Malformed payment request", code: "INVALID_REQUEST" });
    expect(calls).toEqual([]);
  });
});

describe("call-service payment terms", () => {
  test("the 402 challenge targets PayPerCall for the selected provider's price", async () => {
    resetState();
    state.price = 2_500_000n;

    const res = makeRes();
    await handler(makeChallengeReq("1"), res);

    expect(res.statusCode).toBe(402);
    expect(calls).toEqual(["getProvider"]);
    expect(res.body).toMatchObject({
      x402Version: 1,
      code: "PAYMENT_REQUIRED",
      accepts: [{
        scheme: "exact",
        network: "eip155:5042002",
        asset: USDC,
        maxAmountRequired: "2500000",
        payTo: CONTRACT,
        resource: "https://callguard.test/api/call-service",
        extra: { name: "USDC", version: "2" },
      }],
    });
  });

  test("a valid authorization for the advertised provider price stays compatible", async () => {
    resetState();
    state.price = 2_500_000n;

    const res = makeRes();
    await handler(makeReq({ authorization: { value: "2500000" } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, demo: true, settled: false });
  });

  test("invalid provider identifiers are controlled client errors", async () => {
    for (const providerId of [null, "", "abc", "-1", "1.5", "01", 1.5, -1]) {
      resetState();
      const res = makeRes();
      await handler(makeChallengeReq(providerId), res);

      expect({ providerId, status: res.statusCode }).toEqual({ providerId, status: 400 });
      expect(res.body).toMatchObject({ code: "INVALID_PROVIDER_ID" });
      expect(calls).toEqual([]);
    }

    resetState();
    const res = makeRes();
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_PROVIDER_ID" });
    expect(calls).toEqual([]);
  });

  test("malformed payment amounts are controlled client errors", async () => {
    for (const value of ["", "abc", "-1", "1e6", "01", "1.0", null]) {
      resetState();
      const res = makeRes();
      await handler(makeReq({ authorization: { value } }), res);

      expect({ value, status: res.statusCode }).toEqual({ value, status: 400 });
      expect(res.body).toMatchObject({ code: "INVALID_REQUEST" });
      expect(calls).toEqual([]);
    }
  });

  test("an inactive provider cannot advertise payable terms", async () => {
    resetState();
    state.active = false;

    const res = makeRes();
    await handler(makeChallengeReq(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "PROVIDER_NOT_ACTIVE" });
  });
});
