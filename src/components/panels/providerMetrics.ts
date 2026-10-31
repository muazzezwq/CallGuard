/* Provider metrics, filters and sorting — the single definition of each metric
   shared by the Marketplace, Rankings and Provider details panels.

   Before this module there were three answers to one question:
   `fetchProviders` rounded a Bayesian score, `Leaderboard.tsx` returned a raw
   honor rate and a free 100 when a provider had no calls, and
   `ProviderProfile.tsx` returned 0 for the same case.

   The score below is the registry's own definition, copied from
   `contracts/ServiceRegistry.sol:572-580`:

       ((completedCalls + 2) * 100) / (completedCalls + slashedCalls + 3)

   integer division, alpha = 2, beta = 1. A provider with no calls scores 66 and
   can never score 100 on an empty record. The subgraph's `reputation` field
   rounds the same formula, so it can differ from the contract by one point; the
   panels use this function so what a user sees matches the chain.

   Pure functions only: no React, no fetching, no side effects. */

import type { Provider } from "../../lib/subgraph";
import { parseUsdc6 } from "./registerRules";

export const USDC_DECIMALS = 6;

/** Counts and money read from the subgraph, plus the on-chain fields the
 *  subgraph does not index (read separately with a batched multicall). The
 *  legacy optional fields are re-declared because they may be `null` here:
 *  "the read failed" is not the same as "the field is absent". */
export type ProviderRow = Omit<Provider, "maxResponseTime" | "slashBps"> & {
  maxResponseTime?: number | null;
  slashBps?: number | null;
};

/* ── metrics ───────────────────────────────────────────────────────────── */

/** App-side score, 0-100: the formula v7's `getReputationScore` used.
 *  v8 exposes no score view, so every caller computes it from the counters. */
export function reputationScore(completed: number, slashed: number): number {
  const c = Math.max(0, Math.trunc(completed) || 0);
  const s = Math.max(0, Math.trunc(slashed) || 0);
  return Math.floor(((c + 2) * 100) / (c + s + 3));
}

/** Raw completed / (completed + slashed), or null when there is no denominator.
 *  A provider with no calls has an unknown honor rate, not a perfect one. */
export function honorRate(completed: number, slashed: number): number | null {
  const { completed: c, total } = callOutcomes(completed, slashed);
  return total > 0 ? Math.round((c / total) * 100) : null;
}

/** Call counts as one value, so no caller invents its own denominator. */
export function callOutcomes(completed: number, slashed: number): {
  completed: number; slashed: number; total: number;
} {
  const c = Math.max(0, Math.trunc(completed) || 0);
  const s = Math.max(0, Math.trunc(slashed) || 0);
  return { completed: c, slashed: s, total: c + s };
}

/** Reputation bands used by the card and the table. Plain boundaries, no
 *  qualitative claim the protocol does not make. */
export function reputationBand(score: number): { key: "high" | "mid" | "low"; label: string } {
  if (score >= 90) return { key: "high", label: "90-100" };
  if (score >= 70) return { key: "mid", label: "70-89" };
  return { key: "low", label: "below 70" };
}

/* ── USDC, 6 decimals ──────────────────────────────────────────────────── */

function toBig(raw: string | number | bigint | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? BigInt(Math.trunc(raw)) : null;
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  return BigInt(t);
}

/** Exact string for a 6-decimal USDC amount. Trailing zeros are dropped, so
 *  0.000001 stays 0.000001. Null when the value is unreadable. */
export function usdcExact(raw: string | number | bigint | null | undefined): string | null {
  const v = toBig(raw);
  if (v === null || v < 0n) return null;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Display string for compact places (stake totals). Rounds half up to `dp`
 *  decimals, so never use it for a price the user is about to pay. */
export function usdcCompact(raw: string | number | bigint | null | undefined, dp = 2): string | null {
  const v = toBig(raw);
  if (v === null || v < 0n) return null;
  const d = Math.min(6, Math.max(0, Math.trunc(dp)));
  const factor = 10n ** BigInt(6 - d);
  const rounded = ((v + factor / 2n) / factor) * factor;
  return usdcExact(rounded);
}

/** Decimal USDC typed by a user → 6-decimal base units. Reuses the form's
 *  parser so a filter and the register form agree on what is valid. */
export function usdcFromInput(raw: string): bigint | null {
  return parseUsdc6(raw);
}

/** Grouped integer for call counts. */
export function countLabel(n: number): string {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)).toLocaleString("en-US") : "—";
}

/* ── sorting ───────────────────────────────────────────────────────────── */

export type ProviderSortKey = "reputation" | "price" | "completed" | "stake" | "response";
export type SortDir = "asc" | "desc";

/** A sort key as a BigInt, plus whether the provider has that value at all.
 *  Money is compared as BigInt, so values above 2^53 keep their order — a
 *  Number() comparison collapses adjacent wei amounts into one value. */
function rankOf(p: ProviderRow, key: ProviderSortKey): { has: boolean; v: bigint } {
  switch (key) {
    case "price": {
      const v = toBig(p.pricePerCall);
      return v === null ? { has: false, v: 0n } : { has: true, v };
    }
    case "stake": {
      const v = toBig(p.stake);
      return v === null ? { has: false, v: 0n } : { has: true, v };
    }
    case "reputation":
      return { has: true, v: BigInt(reputationScore(p.completedCalls, p.slashedCalls)) };
    case "completed":
      return { has: true, v: BigInt(Math.max(0, Math.trunc(p.completedCalls) || 0)) };
    case "response": {
      const v = p.maxResponseTime;
      return typeof v === "number" && Number.isFinite(v)
        ? { has: true, v: BigInt(Math.max(0, Math.trunc(v))) }
        : { has: false, v: 0n };
    }
  }
}

/** Rows with no value for the sort key always come last, in either direction:
 *  a provider whose response window is not indexed is not "the fastest". Ties
 *  break on the lower provider id, so the order is stable between renders. */
export function sortProviders<T extends ProviderRow>(
  rows: readonly T[], key: ProviderSortKey, dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ra = rankOf(a, key), rb = rankOf(b, key);
    if (ra.has !== rb.has) return ra.has ? -1 : 1;
    const cmp = ra.v === rb.v ? 0 : ra.v > rb.v ? 1 : -1;
    if (cmp !== 0) return cmp * sign;
    const ia = toBig(a.id) ?? 0n, ib = toBig(b.id) ?? 0n;
    return ia === ib ? 0 : ia > ib ? 1 : -1;
  });
}

/* ── filtering ─────────────────────────────────────────────────────────── */

export interface ProviderFilters {
  /** Free text over provider id, owner address and signer address. */
  search?: string;
  activeOnly?: boolean;
  /** Maximum price per call, decimal USDC as typed. */
  maxPrice?: string;
  /** Minimum stake, decimal USDC as typed. */
  minStake?: string;
  /** Minimum registry score, 0-100. */
  minReputation?: number | null;
  /** Maximum response window in seconds; providers without an indexed value are excluded. */
  maxResponseTime?: number | null;
}

/** Does anything narrow the list? Drives the reset control and the empty copy. */
export function isFilterActive(f: ProviderFilters): boolean {
  return Boolean(
    (f.search && f.search.trim()) ||
    f.activeOnly ||
    (f.maxPrice && f.maxPrice.trim()) ||
    (f.minStake && f.minStake.trim()) ||
    (f.minReputation != null) ||
    (f.maxResponseTime != null),
  );
}

/** The list actually shown. An unparseable amount is ignored here; the field
 *  that owns it reports the error, so the helper never throws. */
export function filterProviders<T extends ProviderRow>(rows: readonly T[], f: ProviderFilters): T[] {
  const terms = (f.search ?? "").trim().toLowerCase();
  const maxPrice = f.maxPrice ? usdcFromInput(f.maxPrice) : null;
  const minStake = f.minStake ? usdcFromInput(f.minStake) : null;
  const minRep = typeof f.minReputation === "number" && Number.isFinite(f.minReputation)
    ? f.minReputation : null;
  const maxResp = typeof f.maxResponseTime === "number" && Number.isFinite(f.maxResponseTime)
    ? f.maxResponseTime : null;

  return rows.filter(p => {
    if (f.activeOnly && !p.active) return false;
    if (maxPrice !== null) {
      const price = toBig(p.pricePerCall);
      if (price === null || price > maxPrice) return false;
    }
    if (minStake !== null) {
      const stake = toBig(p.stake);
      if (stake === null || stake < minStake) return false;
    }
    if (minRep !== null && reputationScore(p.completedCalls, p.slashedCalls) < minRep) return false;
    if (maxResp !== null) {
      if (typeof p.maxResponseTime !== "number") return false; // unknown ≠ fast enough
      if (p.maxResponseTime > maxResp) return false;
    }
    if (terms) {
      const hay = `${p.id} ${p.owner ?? ""} ${p.signer ?? ""}`.toLowerCase();
      if (!hay.includes(terms)) return false;
    }
    return true;
  });
}
