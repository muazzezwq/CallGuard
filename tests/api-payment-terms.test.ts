import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const PAY_PER_CALL = "0x5fb41dd22c44e1de08f37d98c2995a62d6220540";
const SERVICE_REGISTRY = "0x9ca97010464e8e6de6e27cf25eae9b939fbd7333";
const FACILITATOR = "0x1111111111111111111111111111111111111111";
const LEGACY_PAY_PER_CALL = "0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a";
const LEGACY_SERVICE_REGISTRY = "0xdb73903c904f83251bc345e591a769e0a4ca32d9";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

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

function makeReq(url: string, query?: Record<string, string>) {
  return {
    method: "GET",
    url,
    ...(query ? { query } : {}),
    headers: {
      host: "callguard.test",
      "x-forwarded-host": "callguard.test",
      "x-forwarded-proto": "https",
    },
  };
}

let marketplace: Handler;
let premiumReport: Handler;

beforeAll(async () => {
  process.env.PAY_PER_CALL = LEGACY_PAY_PER_CALL;
  process.env.SERVICE_REGISTRY = LEGACY_SERVICE_REGISTRY;
  process.env.FACILITATOR_ADDRESS = FACILITATOR;
  process.env.USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  marketplace = (await import("../api/marketplace.js")).default as Handler;
  premiumReport = (await import("../api/premium-report.js")).default as Handler;
});

afterAll(() => {
  delete process.env.PAY_PER_CALL;
  delete process.env.SERVICE_REGISTRY;
  delete process.env.FACILITATOR_ADDRESS;
  delete process.env.USDC_ADDRESS;
});

describe("marketplace payment metadata", () => {
  test("advertises PayPerCall as payTo and never the facilitator", async () => {
    const res = makeRes();
    await marketplace(makeReq("/api/marketplace"), res);

    expect(res.statusCode).toBe(200);
    const service = (res.body as { services: Array<Record<string, unknown>> }).services[0];
    const accepts = service.accepts as Array<Record<string, unknown>>;

    expect(accepts[0].payTo).toBe(PAY_PER_CALL);
    expect(accepts[0].payTo).not.toBe(FACILITATOR);
    expect(accepts[0].network).toBe("eip155:5042002");
    expect(accepts[0].extra).toEqual({ name: "USDC", version: "2" });
  });

  test("uses canonical v7 contracts even when legacy server env is set", async () => {
    const res = makeRes();
    await marketplace(makeReq("/api/marketplace"), res);

    const service = (res.body as { services: Array<Record<string, unknown>> }).services[0];
    expect(service.contracts).toEqual({
      payPerCall: PAY_PER_CALL,
      serviceRegistry: SERVICE_REGISTRY,
      chain: "eip155:5042002",
    });
  });

  test("/api/marketplace/health returns JSON when routed with the health query", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ providers: [] }),
    })) as unknown as typeof fetch;
    try {
      const res = makeRes();
      await marketplace(makeReq("/api/marketplace", { health: "1" }), res);

      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toBe("application/json");
      expect(res.body).toMatchObject({
        status: "ok",
        contracts: {
          payPerCall: "configured",
          serviceRegistry: "configured",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("vercel rewrites /api/marketplace/health before the SPA catch-all", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const healthIndex = config.rewrites.findIndex((r) => r.source === "/api/marketplace/health");
    const catchAllIndex = config.rewrites.findIndex((r) => r.source === "/(.*)");

    expect(healthIndex).toBeGreaterThanOrEqual(0);
    expect(catchAllIndex).toBeGreaterThan(healthIndex);
    expect(config.rewrites[healthIndex].destination).toBe("/api/marketplace?health=1");
  });

  test("does not advertise a fixed amount for provider-specific pricing", async () => {
    const res = makeRes();
    await marketplace(makeReq("/api/marketplace"), res);

    const service = (res.body as { services: Array<Record<string, unknown>> }).services[0];
    const accepts = service.accepts as Array<Record<string, unknown>>;
    const serialized = JSON.stringify(service);

    expect(accepts[0]).not.toHaveProperty("maxAmountRequired");
    expect(accepts[0]).not.toHaveProperty("amount");
    expect(serialized).not.toContain("10000000");
    expect(service.pricing).toMatchObject({
      model: "provider-price",
      amountSource: "https://callguard.test/api/call-service",
    });
  });

  test("does not claim Circle Gateway support", async () => {
    const res = makeRes();
    await marketplace(makeReq("/api/marketplace"), res);

    const service = (res.body as { services: Array<Record<string, unknown>> }).services[0];
    expect(service.supportsVanillax402).toBe(true);
    expect(service.supportsCircleGateway).toBe(false);
  });
});

describe("premium-report payment metadata", () => {
  test("uses the CAIP-2 Arc Testnet network identifier", async () => {
    const res = makeRes();
    await premiumReport(makeReq("/api/premium-report"), res);

    expect(res.statusCode).toBe(402);
    const accepts = (res.body as { accepts: Array<Record<string, unknown>> }).accepts;
    expect(accepts[0].network).toBe("eip155:5042002");
    expect(accepts[0].network).not.toBe("arc-testnet");
  });
});
