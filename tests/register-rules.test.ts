/* Executed with `bun test` (bun's built-in runner — no new dependency).
   Scope: the pure rules behind the provider form and the call-history labels.
   The wallet lifecycle (rejection / revert / confirmed success) needs a wallet,
   so it is exercised separately in the browser against a scripted transport; see
   design/phase-checklists/PHASE_4_CHECKLIST.md row 6 for that evidence. */
import { describe, expect, test } from "bun:test";
import { collectErrors, parseUsdc6, validateField, type FieldKey, type Limits } from "../src/components/panels/registerRules";
import { refundedAmount } from "../src/components/panels/History";
import { slaStages } from "../src/components/viz/SLACanvas";
import { friendlyError } from "../src/lib/utils";

/* Bounds as the registry reports them on Arc: minStake read from chain,
   MIN_RESPONSE_TIME = 5, MAX_SLASH_BPS = 10_000. */
const limits: Limits = { minStake: 10_000_000n, minResponseTime: 5, maxSlashBps: 10_000 };
const err = (k: FieldKey, v: string, l: Limits = limits) => validateField(k, v, l);

describe("parseUsdc6 — never rounds a typed value", () => {
  test("accepts whole and 1..6 decimal amounts", () => {
    expect(parseUsdc6("1")).toBe(1_000_000n);
    expect(parseUsdc6("0.000001")).toBe(1n);
    expect(parseUsdc6("12.345678")).toBe(12_345_678n);
    expect(parseUsdc6("  2.5  ")).toBe(2_500_000n);
  });
  test("rejects anything viem would round or misread", () => {
    expect(parseUsdc6("0.0000001")).toBeNull(); // 7 decimals
    expect(parseUsdc6("1e6")).toBeNull();
    expect(parseUsdc6("-1")).toBeNull();
    expect(parseUsdc6("1,5")).toBeNull();
    expect(parseUsdc6("")).toBeNull();
  });
  test("a trailing dot is the half-typed state of a decimal, and still rounds nothing", () => {
    expect(parseUsdc6("1.")).toBe(1_000_000n);
  });
});

describe("signer address", () => {
  test("accepts a well-formed address, flags the zero address the registry rejects", () => {
    expect(err("signerAddr", "0x9adEDa85604C205791B98B4C239b5625688a4ba5")).toBeNull();
    expect(err("signerAddr", "0x0000000000000000000000000000000000000000")).toContain("zero address");
    expect(err("signerAddr", "0x123")).toContain("0x + 40 hex chars");
    expect(err("signerAddr", "")).toBe("Required.");
  });
});

describe("endpoint scheme", () => {
  test("http/https/ws/wss pass, anything else fails", () => {
    for (const ok of ["https://x.dev/p", "http://x.dev", "ws://x.dev", "wss://x.dev/p"]) {
      expect(err("endpoint", ok)).toBeNull();
    }
    expect(err("endpoint", "ftp://x.dev")).toContain("Must start with");
    expect(err("endpoint", "x.dev")).toContain("Must start with");
  });
});

describe("stake against the on-chain minimum", () => {
  test("exactly the minimum passes, one micro-USDC below fails", () => {
    expect(err("stake", "10")).toBeNull();
    expect(err("stake", "9.999999")).toContain("on-chain minStake");
  });
  test("an unread minimum does not block the form", () => {
    expect(err("stake", "0.000001", { ...limits, minStake: undefined })).toBeNull();
  });
  test("more than 6 decimals is refused, never rounded", () => {
    expect(err("stake", "10.1234567")).toContain("up to 6 decimals");
  });
});

describe("price per call (UI-only rule: > 0)", () => {
  test("zero is refused, the smallest unit is accepted", () => {
    expect(err("price", "0")).toContain("greater than 0");
    expect(err("price", "0.000001")).toBeNull();
  });
});

describe("SLA window against MIN_RESPONSE_TIME", () => {
  test("boundary 5s, 4s, and the uint32 ceiling", () => {
    expect(err("slaWindow", "5")).toBeNull();
    expect(err("slaWindow", "4")).toContain("at least 5s");
    expect(err("slaWindow", "4294967295")).toBeNull();
    expect(err("slaWindow", "4294967296")).toContain("uint32");
    expect(err("slaWindow", "5.5")).toContain("whole number");
  });
});

describe("slash percentage against MAX_SLASH_BPS", () => {
  test("1%..100% inclusive, 2 decimals, nothing outside", () => {
    expect(err("slashPct", "1")).toBeNull();
    expect(err("slashPct", "100")).toBeNull();
    expect(err("slashPct", "0.99")).toContain("between 1% and 100%");
    expect(err("slashPct", "100.01")).toContain("between 1% and 100%");
    expect(err("slashPct", "1.234")).toContain("up to 2 decimals");
  });
});

describe("max concurrent calls (0 is legal: protocol default)", () => {
  test("0 and the uint32 ceiling pass, one above fails", () => {
    expect(err("maxConcurrent", "0")).toBeNull();
    expect(err("maxConcurrent", "4294967295")).toBeNull();
    expect(err("maxConcurrent", "4294967296")).toContain("uint32");
    expect(err("maxConcurrent", "2.5")).toContain("whole number");
  });
});

describe("collectErrors — the whole form at once", () => {
  const good: Record<FieldKey, string> = {
    signerAddr: "0x9adEDa85604C205791B98B4C239b5625688a4ba5", endpoint: "https://x.dev/p",
    stake: "10", price: "0.01", slaWindow: "30", slashPct: "25", maxConcurrent: "10",
  };
  test("a complete valid form yields no errors", () => {
    expect(collectErrors(good, limits)).toEqual({});
  });
  test("each broken field is named, valid neighbours are not", () => {
    const out = collectErrors({ ...good, signerAddr: "0x123", slaWindow: "1" }, limits);
    expect(Object.keys(out).sort()).toEqual(["signerAddr", "slaWindow"]);
  });
  test("an empty form reports every field as required", () => {
    const empty = Object.fromEntries(Object.keys(good).map((k) => [k, ""])) as Record<FieldKey, string>;
    expect(Object.keys(collectErrors(empty, limits)).length).toBe(7);
  });
});

describe("history labels read amounts, not flags", () => {
  test("refunded/slashed are USDC amounts (the old `=== \"true\"` test always failed)", () => {
    expect(refundedAmount("1000000")).toBe("1");
    expect(refundedAmount("0")).toBeNull();
    expect(refundedAmount(undefined)).toBeNull();
    expect(refundedAmount("true")).toBeNull();
  });
  test("a SLASHED call shows a failed receipt, and no timeout variant exists", () => {
    const withStrayOption = slaStages("SLASHED", { timedOut: true } as unknown as Parameters<typeof slaStages>[1]);
    expect(withStrayOption[2]?.sub).toBe("no valid receipt");
    expect(withStrayOption[3]?.sub).toBe("stake slashed");
  });
  test("a COMPLETED call shows a verified signature", () => {
    const stages = slaStages("COMPLETED", { amount: "1" });
    expect(stages[2]?.sub).toBe("signature verified");
    expect(stages[3]?.sub).toBe("paid to provider");
  });
});

describe("wallet failure copy (friendlyError, which the form's status line uses)", () => {
  test("user rejection (4001) is named as a rejection", () => {
    const rejected = Object.assign(new Error("User rejected the request."), { code: 4001 });
    expect(friendlyError(rejected)).toBe("Transaction rejected by user.");
    const rejectedWagmi = Object.assign(new Error("x"), { code: "ACTION_REJECTED" });
    expect(friendlyError(rejectedWagmi)).toBe("Transaction rejected by user.");
  });
  test("an unknown failure keeps the contract's own reason", () => {
    const reverted = new Error('execution reverted: ProviderAlreadyRegistered("0x1")');
    expect(friendlyError(reverted)).toContain("ProviderAlreadyRegistered");
  });
  test("a custom-error selector in the revert data maps to a plain sentence", () => {
    const withSelector = Object.assign(new Error("boom"), { data: "0x646cf55800" });
    expect(friendlyError(withSelector)).toBe("Provider not active.");
  });
  test("viem's `reason` wins over the raw message, and a bare message still returns text", () => {
    expect(friendlyError(Object.assign(new Error("raw"), { reason: "Stake below minStake" }))).toBe("Stake below minStake");
    const out = friendlyError(new Error("upstream is unreachable"));
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain("undefined");
  });
});
