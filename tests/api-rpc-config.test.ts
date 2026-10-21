import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { getRpcUrl } from "../api/_rpc.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SERVICE_REGISTRY;
  delete process.env.VITE_SERVICE_REGISTRY;
  delete process.env.ARC_RPC_URL;
});

describe("API RPC configuration", () => {
  test("resolves every documented public RPC alias", () => {
    expect(getRpcUrl({ ARC_RPC_URL: "https://primary" })).toBe("https://primary");
    expect(getRpcUrl({ ARC_TESTNET_RPC_URL: "https://alias" })).toBe("https://alias");
    expect(getRpcUrl({ RPC_URL: "https://last" })).toBe("https://last");
    expect(getRpcUrl({})).toBeNull();
  });

  test("encodes the proxy token and strips a trailing slash from the base", () => {
    const value = getRpcUrl({
      RPC_PROXY_BASE_URL: "https://proxy.example/",
      RPC_PROXY_TOKEN: "a b&c",
      RPC_PROXY_CHAINS: "Arc_Testnet",
    });
    expect(value).toBe("https://proxy.example/api/rpc/Arc_Testnet?_rpc_token=a%20b%26c");
  });

  test("does not name the dead Arc RPC host in docs, scripts, or facilitators", async () => {
    const files = [
      "DEPLOY.md",
      "src/lib/config.ts",
      "scripts/bridge-and-call.ts",
      "scripts/x402-provider.js",
      "x402-facilitator/mcp-server.js",
      "x402-facilitator/server.js",
    ];
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    for (const content of contents) {
      expect(content).not.toContain("rpc.testnet.arc.network");
    }
  });

  test("provider-page ignores legacy env and reads the canonical v7 registry", async () => {
    process.env.SERVICE_REGISTRY = "0x5555555555555555555555555555555555555555";
    process.env.VITE_SERVICE_REGISTRY = "0x6666666666666666666666666666666666666666";
    process.env.ARC_RPC_URL = "https://rpc.invalid";

    const rpcTargets: string[] = [];
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (body.method === "eth_call") {
        rpcTargets.push(String(body.params?.[0]?.to || ""));
        return { ok: true, json: async () => ({ result: "0x" }) } as Response;
      }
      return { ok: true, json: async () => ({ data: { providers: [] } }) } as Response;
    }) as typeof fetch;

    const { default: handler } = await import("../api/provider-page.js");
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
      send(body: unknown) {
        this.body = body;
        return this;
      },
    };

    await handler({ method: "GET", query: { id: "1" }, headers: {}, url: "/providers/1" }, res);

    expect(res.statusCode).toBe(200);
    expect(rpcTargets.length).toBeGreaterThan(0);
    expect(new Set(rpcTargets)).toEqual(new Set(["0x9ca97010464e8e6de6e27cf25eae9b939fbd7333"]));
  });
});
