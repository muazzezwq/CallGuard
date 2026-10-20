import { describe, expect, test } from "bun:test";
import { errorSummary, redact, safeLogValue } from "../api/_redact.js";

describe("API log redaction", () => {
  test("redacts token-bearing URL query parameters", () => {
    const value = redact("request failed https://rpc.example/api?_rpc_token=SECRET&chain=5042002");
    expect(value).not.toContain("SECRET");
    expect(value).not.toContain("_rpc_token=SECRET");
    expect(value).toContain("chain=5042002");
  });

  test("redacts bearer tokens and key/value secrets", () => {
    const value = redact("Authorization: Bearer abc.def.ghi token=super-secret api_key=other");
    expect(value).not.toContain("abc.def.ghi");
    expect(value).not.toContain("super-secret");
    expect(value).not.toContain("other");
  });

  test("normalises control characters so callers cannot forge log lines", () => {
    expect(safeLogValue("machine\n[FORGED]\tvalue")).toBe("machine [FORGED] value");
  });

  test("errorSummary uses ethers shortMessage and never includes a URL token", () => {
    const error = Object.assign(new Error("full message https://rpc.example/?_rpc_token=SECRET"), {
      name: "ServerError",
      code: "SERVER_ERROR",
      shortMessage: "bad response https://rpc.example/?_rpc_token=SECRET",
    });
    const value = errorSummary(error);
    expect(value).not.toContain("SECRET");
    expect(value).toContain("ServerError");
    expect(value).toContain("SERVER_ERROR");
  });
});
