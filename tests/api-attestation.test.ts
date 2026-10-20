import { afterEach, describe, expect, spyOn, test } from "bun:test";
import handler from "../api/attestation.js";

const REGISTRY = "0x5555555555555555555555555555555555555555";
const PPC = "0x3333333333333333333333333333333333333333";
const ZERO_WORD = "0".repeat(64);

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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.ARC_RPC_URL = "https://rpc.invalid";
  process.env.SERVICE_REGISTRY = REGISTRY;
  process.env.PAY_PER_CALL = PPC;
});

function configureEnv() {
  process.env.ARC_RPC_URL = "https://rpc.invalid";
  process.env.SERVICE_REGISTRY = REGISTRY;
  process.env.PAY_PER_CALL = PPC;
}

describe("attestation input validation", () => {
  test("rejects a non-numeric providerId with 400 instead of an RPC 500", async () => {
    configureEnv();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ result: `0x${ZERO_WORD}` }) } as Response;
    }) as typeof fetch;

    const res = makeRes();
    await handler({ method: "GET", query: { providerId: "abc" }, headers: {} }, res);

    expect(fetchCalls).toBe(0);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: "invalid providerId" });
  });

  test("rejects a malformed callId with 400 instead of an RPC 500", async () => {
    configureEnv();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ result: `0x${ZERO_WORD}` }) } as Response;
    }) as typeof fetch;

    const res = makeRes();
    await handler({ method: "GET", query: { callId: "not-a-bytes32" }, headers: {} }, res);

    expect(fetchCalls).toBe(0);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: "invalid callId" });
  });

  test("accepts the documented ARC_TESTNET_RPC_URL alias", async () => {
    delete process.env.ARC_RPC_URL;
    process.env.ARC_TESTNET_RPC_URL = "https://rpc.alias";
    process.env.SERVICE_REGISTRY = REGISTRY;
    process.env.PAY_PER_CALL = PPC;

    let rpcUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      rpcUrls.push(String(input));
      return { ok: true, json: async () => ({ result: `0x${ZERO_WORD}` }) } as Response;
    }) as typeof fetch;

    const res = makeRes();
    await handler({ method: "GET", query: { providerId: "1" }, headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(rpcUrls).toHaveLength(3);
    expect(rpcUrls.every((url) => url === "https://rpc.alias")).toBe(true);
    delete process.env.ARC_TESTNET_RPC_URL;
  });

  test("redacts an upstream error containing an RPC token", async () => {
    configureEnv();
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ error: { message: "upstream https://rpc.invalid/?_rpc_token=SECRET" } }),
      }) as Response) as typeof fetch;

    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const res = makeRes();
    await handler({ method: "GET", query: { providerId: "1" }, headers: {} }, res);
    spy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");
    expect(errors.join("\n")).not.toContain("SECRET");
  });
});
