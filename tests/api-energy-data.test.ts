import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";

const FROM = "0x1111111111111111111111111111111111111111";
const FACILITATOR = "0x0e515aed287a7b3d2d9f7911321d99826653fbd8";
const MINER = "0x3333333333333333333333333333333333333333";

mock.module("../api/_settle.js", () => ({
  settleEip3009: async () => ({ ok: true, txHash: `0x${"44".repeat(32)}` }),
}));

mock.module("ethers", () => ({
  ethers: {
    verifyTypedData: (_domain: unknown, _types: unknown, auth: { from: string }) => auth.from,
  },
}));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;

function paymentHeader() {
  const payment = {
    authorization: {
      from: FROM,
      to: FACILITATOR,
      value: "10000",
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 600),
      nonce: `0x${"11".repeat(32)}`,
    },
    signature: `0x${"22".repeat(65)}`,
  };
  return Buffer.from(JSON.stringify(payment)).toString("base64");
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
  process.env.USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  process.env.FACILITATOR_ADDRESS = FACILITATOR;
  process.env.SELLER_ADDRESS = "0x2222222222222222222222222222222222222222";
  process.env.PAY_PER_CALL = "0x5555555555555555555555555555555555555555";
  process.env.ARC_RPC_URL = "https://rpc.invalid";
  process.env.ARKREEN_API_URL = "https://arkreen.invalid/?token=SECRET";
  handler = (await import("../api/energy-data.js")).default as Handler;
});

afterAll(() => {
  mock.restore();
});

describe("energy-data logging", () => {
  test("does not log the request payload or an upstream token-bearing URL", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect failed https://arkreen.invalid/?token=SECRET");
    }) as typeof fetch;

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const errorSpy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const res = makeRes();
    await handler(
      {
        method: "GET",
        headers: {
          "x-payment": paymentHeader(),
          "x-machine-id": "machine\n[FORGED]",
        },
        query: { payload: "secret-payload\n[FORGED]", miner: MINER },
      },
      res,
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();

    const joined = logs.join("\n");
    expect(joined).not.toContain("secret-payload");
    expect(joined).not.toContain("token=SECRET");
    expect(joined).not.toContain("\n[FORGED]");
    expect(res.statusCode).toBe(200);
  });
});
