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
  delete process.env.SERVICE_REGISTRY_V8;
  delete process.env.PAY_PER_CALL_V8;
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

  test("answers the score from the active v8 provider, not the retired v7 registry", async () => {
    // The provider panel is labelled "Provider reputation score + proof". It read
    // `getReputationScore` on the v7 registry, which answers for provider 1 with
    // score 66 and counters 0/0 — the state of a contract that was retired on 24 Oct.
    // The live v8 provider 1 has completed 6 and slashed 9, so the panel showed
    // numbers about a different deployment. One tuple read replaces three calls.
    configureEnv();
    const V8_REGISTRY = "0x7777777777777777777777777777777777777777";
    process.env.SERVICE_REGISTRY_V8 = V8_REGISTRY;
    process.env.PAY_PER_CALL_V8 = PPC;

    const seen: string[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      seen.push(`${body.params[0].to}:${body.params[0].data.slice(0, 10)}`);
      return { ok: true, json: async () => ({ result: providerViewHex(6, 9) }) } as Response;
    }) as typeof fetch;

    const res = makeRes();
    await handler({ method: "GET", query: { providerId: "1" }, headers: {} }, res);

    expect(seen).toEqual([`${V8_REGISTRY}:0x5c42d079`]); // getProvider(uint256)
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      completedCalls: 6,
      slashedCalls: 9,
      score: 44, // (6 + 2) * 100 / (6 + 9 + 3)
      proof: { contract: V8_REGISTRY },
    });
  });
});

/** `ProviderView` on ServiceRegistryV8, 11 static words. */
function providerViewHex(completed: number, slashed: number): string {
  const words = [
    0, // owner
    0, // signer
    7485694, // stake
    1000000, // pricePerCall
    1, // latestTermsVersion
    1, // active
    0, // pendingCalls
    completed,
    slashed,
    10, // maxConcurrentCalls
    0, // zkTier
  ];
  return `0x${words.map((w) => BigInt(w).toString(16).padStart(64, "0")).join("")}`;
}
