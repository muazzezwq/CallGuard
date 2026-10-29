import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The health route must list the providers the registry actually holds. It used to
// read them from `/api/energy-data`, which is an x402-gated route: the internal fetch
// got a 402, so the list was always empty while the chain held active providers.
const REGISTRY_V8 = "0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3";
const PAY_PER_CALL_V8 = "0xedce61eF5be31DC22cEfE342692622A26919a7EF";

// Set per test, not at module scope: a module-scope assignment stayed in
// `process.env` for every later file in the same test process, so a clean checkout
// failed on tests that expect the retired v7 pair while a warm one passed.
function configureEnv() {
  process.env.SERVICE_REGISTRY_V8 = REGISTRY_V8;
  process.env.PAY_PER_CALL_V8 = PAY_PER_CALL_V8;
  process.env.ARC_RPC_URL = "https://rpc.invalid";
  delete process.env.RPC_PROXY_BASE_URL;
}

const originalFetch = globalThis.fetch;

beforeEach(configureEnv);

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SERVICE_REGISTRY_V8;
  delete process.env.PAY_PER_CALL_V8;
  delete process.env.ARC_RPC_URL;
});

function word(value: number | bigint | string): string {
  const n = typeof value === "string" && value.startsWith("0x") ? BigInt(value) : BigInt(value);
  return n.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

// v8 ProviderView: 0 owner, 1 signer, 2 stake, 3 pricePerCall, 4 termsVersion,
// 5 active, 6 pendingCalls, 7 completedCalls, 8 slashedCalls, 9 maxConcurrent, 10 zkTier.
function providerWords({ active, stake = 1_000_000, price = 1_000_000 }: { active: boolean; stake?: number; price?: number }): string {
  return "0x" + [
    addressWord("0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da"),
    addressWord("0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da"),
    word(stake),
    word(price),
    word(1),
    word(active ? 1 : 0),
    word(0),
    word(4),
    word(6),
    word(10),
    word(0),
  ].join("");
}

function encodedString(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  const head = [
    word(32),
    word(bytes.length),
  ].join("");
  const padded = bytes.toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64 || 0, "0");
  return "0x" + head + padded;
}

function selectorOf(data: string | undefined): string {
  return (data || "").slice(0, 10);
}

const SELECTOR_GET_PROVIDER = "0x5c42d079";
const SELECTOR_NEXT_PROVIDER_ID = "0x51a8dbcf";
const SELECTOR_GET_ENDPOINT = "0x937bbc4a";

type Route = { id: number; endpoint: string; active: boolean };

function stubFetch(routes: Route[], ping: (url: string) => Response | Promise<Response>) {
  const calls: { kind: string; target: string; to?: string; path?: string }[] = [];
  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    const target = String(input);
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (body?.method === "eth_call") {
      const data = String(body.params?.[0]?.data || "");
      const to = String(body.params?.[0]?.to || "");
      const selector = selectorOf(data);
      if (selector === SELECTOR_NEXT_PROVIDER_ID) {
        calls.push({ kind: "nextProviderId", target, to });
        const next = routes.length === 0 ? 1 : Math.max(...routes.map((r) => r.id)) + 1;
        return { ok: true, json: async () => ({ result: "0x" + word(next) }) } as Response;
      }
      const id = Number(BigInt("0x" + data.slice(10)));
      const route = routes.find((r) => r.id === id);
      if (selector === SELECTOR_GET_PROVIDER) {
        calls.push({ kind: "getProvider", target, to, path: id.toString() });
        return {
          ok: true,
          json: async () => ({ result: route ? providerWords({ active: route.active }) : "0x" }),
        } as Response;
      }
      if (selector === SELECTOR_GET_ENDPOINT) {
        calls.push({ kind: "getEndpoint", target, to, path: id.toString() });
        return {
          ok: true,
          json: async () => ({ result: encodedString(route ? route.endpoint : "") }),
        } as Response;
      }
      throw new Error(`unexpected selector ${selector}`);
    }

    calls.push({ kind: "ping", target });
    return ping(target);
  }) as typeof fetch;
  return calls;
}

function res() {
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
    send(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("marketplace health", () => {
  test("lists active providers from the registry and pings their endpoints", async () => {
    const calls = stubFetch(
      [
        { id: 1, endpoint: "https://arcsla.vercel.app/api/auto-receipt", active: true },
        { id: 2, endpoint: "https://your-provider-endpoint.com/api", active: true },
        { id: 3, endpoint: "https://retired.example.com", active: false },
      ],
      (url) => {
        if (url === "https://arcsla.vercel.app/api/auto-receipt/health") {
          return { ok: true, status: 200 } as Response;
        }
        return { ok: false, status: 503 } as Response;
      }
    );

    const { default: handler } = await import("../api/marketplace.js");
    const response = res();
    await handler(
      { method: "GET", headers: {}, url: "/api/marketplace/health", query: {} },
      response
    );

    const body = response.body as {
      status: string;
      registry: { address: string; activeProviders: number };
      providers: { id: string; endpoint: string; status: string }[];
      summary: { active: number; ok: number; degraded: number; unreachable: number };
    };

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.registry.address).toBe(REGISTRY_V8);
    expect(body.registry.activeProviders).toBe(2);
    expect(body.providers.map((p) => p.id)).toEqual(["1", "2"]);
    expect(body.providers[0].status).toBe("ok");
    expect(body.providers[1].status).toBe("degraded");
    expect(body.summary).toMatchObject({ active: 2, ok: 1, degraded: 1, unreachable: 0 });

    // The dead x402 sibling route must not be consulted at all.
    expect(calls.some((c) => c.target.includes("energy-data"))).toBe(false);
    // Registry reads go to the configured v8 registry, never a hardcoded v7 one.
    expect(new Set(calls.filter((c) => c.kind !== "ping").map((c) => c.to))).toEqual(
      new Set([REGISTRY_V8])
    );
    expect(calls.filter((c) => c.kind === "ping").map((c) => c.target).sort()).toEqual([
      "https://arcsla.vercel.app/api/auto-receipt/health",
      "https://your-provider-endpoint.com/api/health",
    ]);
  });

  test("reports an unreachable endpoint without claiming the service is down", async () => {
    stubFetch([{ id: 1, endpoint: "https://gone.example.com", active: true }], () => {
      throw new Error("ECONNREFUSED");
    });

    const { default: handler } = await import("../api/marketplace.js");
    const response = res();
    await handler(
      { method: "GET", headers: {}, url: "/api/marketplace/health", query: {} },
      response
    );

    const body = response.body as {
      status: string;
      providers: { id: string; status: string }[];
      summary: { unreachable: number };
    };
    expect(body.status).toBe("ok");
    expect(body.providers[0]).toMatchObject({ id: "1", status: "unreachable" });
    expect(body.summary.unreachable).toBe(1);
  });

  test("degrades when the registry cannot be read", async () => {
    globalThis.fetch = (async () => {
      throw new Error("rpc down");
    }) as unknown as typeof fetch;

    const { default: handler } = await import("../api/marketplace.js");
    const response = res();
    await handler(
      { method: "GET", headers: {}, url: "/api/marketplace/health", query: {} },
      response
    );

    const body = response.body as {
      status: string;
      registry: { error?: string };
      providers: unknown[];
    };
    expect(body.status).toBe("degraded");
    expect(body.registry.error).toBe("registry read failed");
    expect(body.providers).toEqual([]);
  });
});
