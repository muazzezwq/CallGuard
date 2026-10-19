/* Executed with `bun test` (bun's built-in runner — no new dependency).
   Scope: the pure provider metrics/filters/sort shared by the Marketplace,
   Rankings and Provider details panels. The panels themselves are exercised in
   a browser; see design/phase-checklists/PHASE_5_CHECKLIST.md. */
import { describe, expect, test } from "bun:test";
import {
  callOutcomes, countLabel, filterProviders, honorRate, isFilterActive,
  reputationBand, reputationScore, sortProviders, usdcCompact, usdcExact,
  usdcFromInput, type ProviderRow,
} from "../src/components/panels/providerMetrics";

/* Minimal row builder: only the fields the helpers read. */
function row(over: Partial<ProviderRow> & { id: string }): ProviderRow {
  return {
    owner: "0x0000000000000000000000000000000000000001",
    signer: "0x0000000000000000000000000000000000000002",
    stake: "10000000",
    pricePerCall: "100000",
    active: true,
    completedCalls: 0,
    slashedCalls: 0,
    totalSlashed: "0",
    totalUnstaked: "0",
    nftBound: false,
    createdAt: "0",
    updatedAt: "0",
    reputation: 66,
    ...over,
  } as ProviderRow;
}

describe("reputationScore — the registry's own formula", () => {
  test("matches getReputationScore for the boundary cases", () => {
    /* ((c + 2) * 100) / (c + s + 3), integer division. */
    expect(reputationScore(0, 0)).toBe(66);   // 200/3 = 66.67 → 66, never 100
    expect(reputationScore(1, 0)).toBe(75);   // 300/4
    expect(reputationScore(2, 1)).toBe(66);   // 400/6 = 66.67 → 66 (round() would say 67)
    expect(reputationScore(0, 1)).toBe(50);   // 200/4
    expect(reputationScore(5, 5)).toBe(53);   // 700/13 = 53.8 → 53
    expect(reputationScore(100, 0)).toBe(99); // 10200/103 = 99.03 → 99
  });
  test("an empty record can never score 100", () => {
    expect(reputationScore(0, 0)).toBeLessThan(100);
  });
  test("nonsense counts collapse to zero instead of producing NaN", () => {
    expect(reputationScore(NaN, NaN)).toBe(66);
    expect(reputationScore(-5, -5)).toBe(66);
  });
});

describe("honorRate — raw rate with an explicit denominator", () => {
  test("has no value without calls", () => {
    expect(honorRate(0, 0)).toBeNull();   // not 100, not 0
  });
  test("is the completed share otherwise", () => {
    expect(honorRate(1, 1)).toBe(50);
    expect(honorRate(3, 0)).toBe(100);
    expect(honorRate(2, 1)).toBe(67);
  });
});

describe("callOutcomes", () => {
  test("reports the denominator the panels must show", () => {
    expect(callOutcomes(4, 2)).toEqual({ completed: 4, slashed: 2, total: 6 });
    expect(callOutcomes(0, 0)).toEqual({ completed: 0, slashed: 0, total: 0 });
  });
});

describe("USDC formatting — 6 decimals, no silent rounding", () => {
  test("usdcExact keeps every significant digit", () => {
    expect(usdcExact("250000")).toBe("0.25");
    expect(usdcExact("1000000")).toBe("1");
    expect(usdcExact("1")).toBe("0.000001");
    expect(usdcExact("0")).toBe("0");
    expect(usdcExact(1234567n)).toBe("1.234567");
  });
  test("usdcExact survives values a Number would corrupt", () => {
    /* 1e12 USDC plus one base unit — Number() cannot represent this. */
    expect(usdcExact("1000000000000000001")).toBe("1000000000000.000001");
  });
  test("usdcExact refuses unreadable input instead of inventing a number", () => {
    expect(usdcExact("abc")).toBeNull();
    expect(usdcExact("-1")).toBeNull();
    expect(usdcExact(undefined)).toBeNull();
  });
  test("usdcCompact rounds half up, and only for display", () => {
    expect(usdcCompact("1250000")).toBe("1.25");
    expect(usdcCompact("1255000")).toBe("1.26");
    expect(usdcCompact("999999")).toBe("1");
    expect(usdcCompact("10000001", 0)).toBe("10");
  });
  test("usdcFromInput is the same parser the register form uses", () => {
    expect(usdcFromInput("0.5")).toBe(500000n);
    expect(usdcFromInput("0.0000001")).toBeNull(); // 7 decimals
    expect(usdcFromInput("")).toBeNull();
  });
  test("countLabel groups call counts", () => {
    expect(countLabel(1234)).toBe("1,234");
    expect(countLabel(NaN)).toBe("—");
  });
});

describe("sortProviders — underlying values, not display strings", () => {
  test("price ascending compares BigInt, not Number", () => {
    /* These two differ by 1 base unit above 2^53: Number() sees them as equal
       and would fall through to the id tie-break (id 1 first). */
    const big = row({ id: "1", pricePerCall: "9007199254740993" });
    const small = row({ id: "2", pricePerCall: "9007199254740992" });
    expect(sortProviders([big, small], "price", "asc").map(r => r.id)).toEqual(["2", "1"]);
    expect(sortProviders([big, small], "price", "desc").map(r => r.id)).toEqual(["1", "2"]);
  });
  test("reputation uses the registry score", () => {
    const good = row({ id: "1", completedCalls: 100, slashedCalls: 0 });   // 99
    const fresh = row({ id: "2", completedCalls: 0, slashedCalls: 0 });    // 66
    expect(sortProviders([fresh, good], "reputation", "desc").map(r => r.id)).toEqual(["1", "2"]);
  });
  test("response time sorts missing values last in both directions", () => {
    const fast = row({ id: "1", maxResponseTime: 5 });
    const slow = row({ id: "2", maxResponseTime: 60 });
    const unknown = row({ id: "3" }); // not indexed
    expect(sortProviders([unknown, slow, fast], "response", "asc").map(r => r.id)).toEqual(["1", "2", "3"]);
    expect(sortProviders([unknown, fast, slow], "response", "desc").map(r => r.id)).toEqual(["2", "1", "3"]);
  });
  test("ties break on the lower provider id and the input is not mutated", () => {
    const a = row({ id: "7", completedCalls: 3 });
    const b = row({ id: "2", completedCalls: 3 });
    const input = [a, b];
    expect(sortProviders(input, "completed", "desc").map(r => r.id)).toEqual(["2", "7"]);
    expect(input.map(r => r.id)).toEqual(["7", "2"]);
  });
});

describe("filterProviders — filters narrow the real list", () => {
  const rows: ProviderRow[] = [
    row({ id: "1", active: true,  nftBound: true,  pricePerCall: "250000", stake: "10000000", completedCalls: 100, slashedCalls: 0, maxResponseTime: 5,
          owner: "0xaAaA000000000000000000000000000000000001", signer: "0xBbBb000000000000000000000000000000000002" }),
    row({ id: "2", active: false, nftBound: false, pricePerCall: "500000", stake: "20000000", completedCalls: 0,   slashedCalls: 0, maxResponseTime: 60,
          owner: "0xCcCc000000000000000000000000000000000002", signer: "0xDdDd000000000000000000000000000000000004" }),
    row({ id: "3", active: true,  nftBound: false, pricePerCall: "1000000", stake: "5000000", completedCalls: 2, slashedCalls: 1,
          owner: "0xEeEe000000000000000000000000000000000005", signer: "0xFfFf000000000000000000000000000000000006" }),
  ];
  const ids = (rs: ProviderRow[]) => rs.map(r => r.id);

  test("no filter returns everything", () => {
    expect(ids(filterProviders(rows, {}))).toEqual(["1", "2", "3"]);
    expect(isFilterActive({})).toBe(false);
  });
  test("active and NFT-bound filters", () => {
    expect(ids(filterProviders(rows, { activeOnly: true }))).toEqual(["1", "3"]);
    expect(ids(filterProviders(rows, { nftOnly: true }))).toEqual(["1"]);
  });
  test("max price and min stake compare the on-chain amounts", () => {
    expect(ids(filterProviders(rows, { maxPrice: "0.5" }))).toEqual(["1", "2"]);  // 0.5 included boundary
    expect(ids(filterProviders(rows, { minStake: "10" }))).toEqual(["1", "2"]);  // 10 included boundary
    expect(ids(filterProviders(rows, { minStake: "5", activeOnly: true }))).toEqual(["1", "3"]); // 5 included boundary
    expect(ids(filterProviders(rows, { minStake: "5.000001", activeOnly: true }))).toEqual(["1"]);
  });
  test("minimum reputation uses the registry score", () => {
    expect(ids(filterProviders(rows, { minReputation: 90 }))).toEqual(["1"]); // 99
    expect(ids(filterProviders(rows, { minReputation: 70 }))).toEqual(["1"]); // 66 and 66 fall out
  });
  test("max response time excludes providers with no indexed value", () => {
    expect(ids(filterProviders(rows, { maxResponseTime: 30 }))).toEqual(["1"]);
    expect(ids(filterProviders(rows, { maxResponseTime: 60 }))).toEqual(["1", "2"]);
  });
  test("search matches id, owner and signer, case-insensitively", () => {
    expect(ids(filterProviders(rows, { search: "3" }))).toEqual(["3"]);
    expect(ids(filterProviders(rows, { search: "aaaa" }))).toEqual(["1"]);
    expect(ids(filterProviders(rows, { search: "FF00" }))).toEqual(["3"]);
    expect(ids(filterProviders(rows, { search: "0xdd" }))).toEqual(["2"]);
    expect(ids(filterProviders(rows, { search: "nothing" }))).toEqual([]);
  });
  test("filters combine, and clearing them restores the list", () => {
    const f = { search: "0x", activeOnly: true, nftOnly: true, maxPrice: "1", minStake: "10", minReputation: 90, maxResponseTime: 10 };
    expect(ids(filterProviders(rows, f))).toEqual(["1"]);
    expect(isFilterActive(f)).toBe(true);
    expect(ids(filterProviders(rows, {}))).toEqual(["1", "2", "3"]);
  });
  test("an unparseable amount is ignored rather than emptied", () => {
    expect(ids(filterProviders(rows, { maxPrice: "abc" }))).toEqual(["1", "2", "3"]);
    expect(ids(filterProviders(rows, { minStake: "1.2345678" }))).toEqual(["1", "2", "3"]);
  });
});

describe("reputationBand", () => {
  test("uses plain boundaries", () => {
    expect(reputationBand(95).key).toBe("high");
    expect(reputationBand(90).key).toBe("high");
    expect(reputationBand(89).key).toBe("mid");
    expect(reputationBand(70).key).toBe("mid");
    expect(reputationBand(69).key).toBe("low");
  });
});
