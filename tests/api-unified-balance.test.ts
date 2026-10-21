import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const SECRET = "SECRET_RPC_TOKEN";

mock.module("@circle-fin/unified-balance-kit", () => ({
  UnifiedBalanceKit: class {
    async getBalances() {
      throw new Error(`upstream https://rpc.example/?_rpc_token=${SECRET} failed`);
    }
  },
}));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

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

afterAll(() => {
  mock.restore();
});

describe("unified-balance error handling", () => {
  test("does not return or log the upstream URL token", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const handler = (await import("../api/unified-balance.js")).default as Handler;
    const res = makeRes();
    await handler({ query: { address: ADDRESS } }, res);
    spy.mockRestore();

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SECRET);
    expect(errors.join("\n")).not.toContain(SECRET);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: "balance lookup failed" });
  });
});
