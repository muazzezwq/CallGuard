/* Executed with `bun test`. Scope: the exact integer cost maths and the readiness
   rules the Call Builder uses before it offers a transaction. The panel itself is
   exercised in a browser; see design/phase-checklists/PHASE_6_CHECKLIST.md. */
import { describe, expect, test } from "bun:test";
import {
  assessCall, batchCost, callCost, formatUsdc, gasToUsdcMicro,
} from "../src/lib/callCosts";

describe("formatUsdc", () => {
  test("uses the token's 6 decimals exactly", () => {
    expect(formatUsdc(1_000_000n)).toBe("1");
    expect(formatUsdc(1_500_000n)).toBe("1.5");
    expect(formatUsdc(1n)).toBe("0.000001");
    expect(formatUsdc(0n)).toBe("0");
  });
});

describe("gasToUsdcMicro", () => {
  test("converts 18-decimal native wei to 6-decimal micro USDC by truncation", () => {
    expect(gasToUsdcMicro(1_000_000_000_000_000_000n)).toBe(1_000_000n);
    expect(gasToUsdcMicro(21_000_000_000_000n)).toBe(21n);
    expect(gasToUsdcMicro(999_999_999_999n)).toBe(0n);
  });
});

describe("callCost", () => {
  test("escrow is the provider price, with no invented protocol fee", () => {
    expect(callCost({ price: 2_000_000n, gasWei: null })).toEqual({
      escrow: 2_000_000n, gasMicro: null, totalMicro: null,
    });
  });

  test("total is exact and only exists when the gas estimate exists", () => {
    expect(callCost({ price: 1_000_000n, gasWei: 21_000_000_000_000n })).toEqual({
      escrow: 1_000_000n, gasMicro: 21n, totalMicro: 1_000_021n,
    });
  });

  test("an unknown price stays unknown instead of becoming zero", () => {
    expect(callCost({ price: null, gasWei: 21_000_000_000_000n })).toEqual({
      escrow: null, gasMicro: 21n, totalMicro: null,
    });
  });
});

describe("batchCost", () => {
  test("multiplies the real price exactly", () => {
    expect(batchCost(1_500_000n, 4)).toBe(6_000_000n);
    expect(batchCost(0n, 3)).toBe(0n);
  });

  test("an unknown price has no estimate", () => {
    expect(batchCost(null, 5)).toBeNull();
  });
});

const base = {
  providerId: 1,
  recordLoaded: true,
  notFound: false,
  active: true,
  price: 1_000_000n,
  stake: 10_000_000n,
  slashBps: 2_000,
  usdcBalance: 50_000_000n,
  allowance: 50_000_000n,
  openCalls: 0,
  maxConcurrentCalls: 10,
  zkTier: 0,
  gasWei: 21_000_000_000_000n,
};

describe("assessCall", () => {
  test("a healthy provider has no blockers", () => {
    expect(assessCall(base).blockers).toEqual([]);
  });

  test("no provider id is a blocker", () => {
    expect(assessCall({ ...base, providerId: 0 }).blockers).toContain("no-provider");
  });

  test("an unloaded record blocks submission instead of using stale data", () => {
    expect(assessCall({ ...base, recordLoaded: false }).blockers).toContain("loading");
  });

  test("a missing provider is a blocker", () => {
    expect(assessCall({ ...base, notFound: true }).blockers).toContain("not-found");
  });

  test("an inactive provider is a blocker", () => {
    expect(assessCall({ ...base, active: false }).blockers).toContain("inactive");
  });

  test("the contract rejects calls whose slashable stake cannot cover the price", () => {
    // stake 10 USDC * 2000 bps = 2 USDC >= 1 USDC price -> allowed
    expect(assessCall(base).blockers).not.toContain("slash-underfunded");
    // stake 4 USDC * 2000 bps = 0.8 USDC < 1 USDC price -> InsufficientProviderStake
    expect(assessCall({ ...base, stake: 4_000_000n }).blockers).toContain("slash-underfunded");
  });

  test("an insufficient USDC balance is a blocker and a missing balance is not zero", () => {
    expect(assessCall({ ...base, usdcBalance: 999_999n }).blockers).toContain("insufficient-usdc");
    expect(assessCall({ ...base, usdcBalance: null }).blockers).not.toContain("insufficient-usdc");
  });

  test("an insufficient native gas balance is a blocker, not a warning", () => {
    expect(assessCall({ ...base, nativeBalance: 20_999_999_999_999n }).blockers)
      .toContain("insufficient-gas");
    expect(assessCall({ ...base, nativeBalance: 21_000_000_000_000n }).blockers)
      .not.toContain("insufficient-gas");
  });

  test("an unreadable native balance is surfaced, never assumed sufficient", () => {
    const result = assessCall({ ...base, nativeBalance: null });
    expect(result.warnings).toContain("native-balance-unknown");
    expect(result.blockers).not.toContain("insufficient-gas");
  });

  test("a used-up concurrency slot is a blocker", () => {
    expect(assessCall({ ...base, openCalls: 10 }).blockers).toContain("rate-limited");
    expect(assessCall({ ...base, maxConcurrentCalls: 0, openCalls: 10 }).blockers).toContain("rate-limited");
    // zk tier 2 doubles the cap
    expect(assessCall({ ...base, maxConcurrentCalls: 10, zkTier: 2, openCalls: 10 }).blockers)
      .not.toContain("rate-limited");
  });

  test("a missing allowance is a warning, not a blocker", () => {
    const result = assessCall({ ...base, allowance: 0n });
    expect(result.warnings).toContain("approval-needed");
    expect(result.blockers).toEqual([]);
  });

  test("a missing gas estimate is surfaced, never assumed free", () => {
    expect(assessCall({ ...base, gasWei: null }).warnings).toContain("gas-unknown");
  });
});
