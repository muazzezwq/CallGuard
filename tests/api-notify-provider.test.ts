import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";

const CALL_ID = `0x${"11".repeat(32)}`;
const SECRET = "notify-secret";

class FakeProvider {
  constructor(_url: string) {}
}

class FakeContract {
  constructor(_address: string, _abi: readonly string[], _provider: unknown) {}
  async getProvider() {
    return { active: true, maxResponseTime: 30, pricePerCall: 1n };
  }
  async getCall() {
    throw new Error("call not indexed yet");
  }
}

mock.module("ethers", () => ({
  ethers: {
    JsonRpcProvider: FakeProvider,
    Contract: FakeContract,
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
  process.env.SERVICE_REGISTRY = "0x5555555555555555555555555555555555555555";
  process.env.PAY_PER_CALL = "0x3333333333333333333333333333333333333333";
  process.env.PROVIDER_1_WEBHOOK = "https://provider.invalid/hook?token=SECRET";
  delete process.env.VITE_SERVICE_REGISTRY;
  handler = (await import("../api/notify-provider.js")).default as Handler;
});

afterAll(() => {
  mock.restore();
});

describe("notify-provider validation and redaction", () => {
  test("uses the documented unprefixed SERVICE_REGISTRY and redacts delivery errors", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect failed https://provider.invalid/hook?token=SECRET");
    }) as typeof fetch;

    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const res = makeRes();
    await handler(makeReq({ callId: CALL_ID, providerId: "1" }), res);
    spy.mockRestore();

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("SECRET");
    expect(errors.join("\n")).not.toContain("SECRET");
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ notified: false, reason: "Webhook delivery failed" });
  });

  test("rejects a malformed callId instead of attempting delivery", async () => {
    globalThis.fetch = (async () => {
      throw new Error("must not be called");
    }) as typeof fetch;

    const res = makeRes();
    await handler(makeReq({ callId: "not-a-bytes32", providerId: "1" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid callId" });
  });

  test("rejects a malformed providerId before building an env var name", async () => {
    const res = makeRes();
    await handler(makeReq({ callId: CALL_ID, providerId: "../1" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid providerId" });
  });
});
