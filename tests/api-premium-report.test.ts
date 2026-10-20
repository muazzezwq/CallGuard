import { beforeAll, describe, expect, test } from "bun:test";

const FACILITATOR = "0x0e515aed287a7b3d2d9f7911321d99826653fbd8";
const FROM = "0x1111111111111111111111111111111111111111";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;

function paymentHeader(overrides: { from?: string; signature?: string } = {}) {
  const payment = {
    authorization: {
      from: overrides.from ?? FROM,
      to: FACILITATOR,
      value: "1000",
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 600),
      nonce: `0x${"11".repeat(32)}`,
    },
    signature: overrides.signature ?? `0x${"22".repeat(65)}`,
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
  handler = (await import("../api/premium-report.js")).default as Handler;
});

describe("premium-report malformed payment handling", () => {
  test("returns 402, not 500, when the signature bytes are malformed", async () => {
    const res = makeRes();
    await handler(
      { method: "POST", headers: { "payment-signature": paymentHeader({ signature: "0x1234" }) } },
      res,
    );

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ error: "Malformed payment signature" });
  });

  test("returns 402, not 500, when authorization fields are malformed", async () => {
    const res = makeRes();
    await handler(
      { method: "POST", headers: { "payment-signature": paymentHeader({ from: "not-an-address" }) } },
      res,
    );

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ error: "Malformed payment authorization" });
  });
});
