import { afterEach, describe, expect, test } from "bun:test";
import handler from "../api/ping-provider.js";

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
});

describe("ping-provider SSRF guard", () => {
  for (const url of [
    "http://[::ffff:7f00:1]/",
    "http://[0:0:0:0:0:ffff:7f00:1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
  ]) {
    test(`rejects private IPv6 target ${url}`, async () => {
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return { ok: true, status: 200 } as Response;
      }) as typeof fetch;

      const res = makeRes();
      await handler({ method: "GET", query: { url }, headers: {} }, res);

      expect(fetchCalls).toBe(0);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ ok: false, error: "private addresses not allowed" });
    });
  }

  test("does not echo upstream connection details back to the caller", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect failed https://rpc.example/?_rpc_token=SECRET");
    }) as typeof fetch;

    const res = makeRes();
    await handler({ method: "GET", query: { url: "http://93.184.216.34/" }, headers: {} }, res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("_rpc_token");
    expect(res.body).toMatchObject({ ok: false, error: "request failed" });
  });
});
