import { afterEach, describe, expect, test } from "bun:test";
import {
  MONEY_ROUTES_DISABLED_CODE,
  disabledResponse,
  moneyRoutesDisabled,
} from "../api/_killswitch.js";
import premiumReport from "../api/premium-report.js";

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

const original = process.env.MONEY_ROUTES_DISABLED;

afterEach(() => {
  if (original === undefined) delete process.env.MONEY_ROUTES_DISABLED;
  else process.env.MONEY_ROUTES_DISABLED = original;
});

describe("money routes kill switch", () => {
  test("is off when the variable is absent or false", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(moneyRoutesDisabled(env)).toBe(false);
    expect(moneyRoutesDisabled({ MONEY_ROUTES_DISABLED: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(moneyRoutesDisabled({ MONEY_ROUTES_DISABLED: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  test("accepts the documented spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " 1 "]) {
      expect(moneyRoutesDisabled({ MONEY_ROUTES_DISABLED: value } as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  test("refuses a premium report with 503 and never settles", async () => {
    process.env.MONEY_ROUTES_DISABLED = "1";
    const res = makeRes();
    await (premiumReport as Handler)({ method: "GET" }, res);
    expect(res.statusCode).toBe(503);
    expect((res.body as { code?: string }).code).toBe(MONEY_ROUTES_DISABLED_CODE);
  });

  test("leaves a preflight alone so browsers still see CORS", async () => {
    process.env.MONEY_ROUTES_DISABLED = "1";
    const res = makeRes();
    await (premiumReport as Handler)({ method: "OPTIONS" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeUndefined();
  });

  test("the shared body names the switch", () => {
    const res = makeRes();
    disabledResponse(res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "Payments are disabled on this deployment",
      code: MONEY_ROUTES_DISABLED_CODE,
    });
  });
});
