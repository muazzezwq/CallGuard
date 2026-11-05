import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const callBuilder = readFileSync(
  new URL("../src/components/panels/CallBuilder.tsx", import.meta.url),
  "utf8",
);

describe("token approvals stay bounded", () => {
  test("never asks for an unlimited USDC allowance", () => {
    expect(callBuilder).not.toContain("maxUint256");
  });

  test("approves the call price on the settlement contract", () => {
    expect(callBuilder).toContain("args: [ACTIVE_PPC_ADDRESS, amount]");
  });

  test("approves the bridged amount on the CCTP messenger", () => {
    expect(callBuilder).toContain(
      "args: [CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`, amount]",
    );
  });
});
