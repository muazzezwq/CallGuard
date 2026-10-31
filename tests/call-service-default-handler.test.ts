import { describe, expect, test } from "bun:test";
import defaultHandler, { resolveDefaultIdempotencyStore } from "../api/call-service.js";

/* The default export is what Vercel deploys; the factory path is covered by
   tests/api-call-service-idempotency.test.ts. These tests pin the three
   environment outcomes, because the difference between "not configured" and
   "configured but broken" is a payment-safety decision, not a detail. */

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    end() {
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

const ENABLED = { CALL_SERVICE_IDEMPOTENCY: "enabled" };
const URL_ONLY = { ...ENABLED, UPSTASH_REDIS_REST_URL: "https://example.upstash.io" };
const CONFIGURED = { ...URL_ONLY, UPSTASH_REDIS_REST_TOKEN: "token" };

describe("resolveDefaultIdempotencyStore", () => {
  test("returns null when the store is not configured", () => {
    expect(resolveDefaultIdempotencyStore({})).toBeNull();
  });

  test("stays off while the switch is absent, even with Upstash configured", () => {
    expect(resolveDefaultIdempotencyStore({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    })).toBeNull();
  });

  test("builds a store when both variables are set", () => {
    const store = resolveDefaultIdempotencyStore(CONFIGURED);
    expect(store).not.toBeNull();
    expect(typeof store.create).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.transition).toBe("function");
  });

  test("reports failure when only part of the configuration is present", () => {
    const store = resolveDefaultIdempotencyStore(URL_ONLY);
    expect(store).not.toBeNull();
    expect(typeof store).toBe("symbol");
  });
});

describe("defaultHandler", () => {
  test("fails closed with 503 when the store is configured but unusable", async () => {
    const res = fakeRes();
    await defaultHandler({ method: "POST", headers: {}, body: {} }, res, URL_ONLY);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "Payment safety state is unavailable",
      code: "IDEMPOTENCY_UNAVAILABLE",
    });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  test("keeps the no-store path when nothing is configured", async () => {
    const res = fakeRes();
    await defaultHandler({ method: "OPTIONS", headers: {} }, res, {});
    expect(res.statusCode).toBe(200);

    const get = fakeRes();
    await defaultHandler({ method: "GET", headers: {} }, get, {});
    expect(get.statusCode).toBe(405);
  });
});
