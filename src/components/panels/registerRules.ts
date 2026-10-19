/* Pure registration rules for the provider form.
   Kept out of Register.tsx so they can be exercised without the app's
   browser-only modules (wagmi providers, import.meta.env). Nothing here reads
   the chain or the DOM: `Limits` is filled from the on-chain `minStake` /
   `MIN_RESPONSE_TIME` / `MAX_SLASH_BPS` before the rules run. */
import { isAddress, isAddressEqual, parseUnits, zeroAddress } from "viem";
import { formatUsdc } from "../../lib/utils";

// ── Validation ────────────────────────────────────────────────────────────
// Every rule below is justified by the ServiceRegistry source, except the three
// UI-only rules flagged in the report (price > 0, endpoint scheme, slash >= 1%).
export type FieldKey = "signerAddr" | "endpoint" | "stake" | "price" | "slaWindow" | "slashPct" | "maxConcurrent";
export const FIELD_KEYS: FieldKey[] = ["signerAddr","endpoint","stake","price","slaWindow","slashPct","maxConcurrent"];

export const UINT32_MAX = 4_294_967_295; // uint32, the on-chain type of maxResponseTime / slashBps / maxConcurrentCalls

export type Limits = { minStake: bigint | undefined; minResponseTime: number; maxSlashBps: number };

// USDC is 6-decimal. Reject anything viem would round, so the typed value is
// never silently rewritten (viem's parseUnits rounds fractions past 6 dp).
export function parseUsdc6(raw: string): bigint | null {
  const v = raw.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(v)) return null;
  try { return parseUnits(v, 6); } catch { return null; }
}

export function validateField(key: FieldKey, raw: string, limits: Limits): string | null {
  const v = raw.trim();
  if (!v) return "Required.";
  switch (key) {
    case "signerAddr": {
      if (!isAddress(v)) return "Enter a valid EVM address (0x + 40 hex chars).";
      if (isAddressEqual(v, zeroAddress)) return "The registry rejects the zero address as signer (InvalidSigner).";
      return null;
    }
    case "endpoint": {
      if (!/^(https?|wss?):\/\//i.test(v)) return "Must start with http://, https://, ws:// or wss://.";
      return null;
    }
    case "stake": {
      const a = parseUsdc6(v);
      if (a === null) return "Enter a USDC amount with up to 6 decimals (no value is rounded).";
      if (limits.minStake !== undefined && a < limits.minStake)
        return `Must be at least ${formatUsdc(limits.minStake)} USDC — the registry's on-chain minStake.`;
      return null;
    }
    case "price": {
      const a = parseUsdc6(v);
      if (a === null) return "Enter a USDC amount with up to 6 decimals (no value is rounded).";
      if (a <= 0n) return "Price per call must be greater than 0 USDC.";
      return null;
    }
    case "slaWindow": {
      if (!/^\d+$/.test(v)) return "Enter a whole number of seconds.";
      const n = Number(v);
      if (n < limits.minResponseTime) return `Must be at least ${limits.minResponseTime}s — the registry's MIN_RESPONSE_TIME.`;
      if (n > UINT32_MAX) return "Exceeds the contract's uint32 limit (4,294,967,295 seconds).";
      return null;
    }
    case "slashPct": {
      if (!/^\d+(\.\d{1,2})?$/.test(v)) return "Enter a percentage with up to 2 decimals.";
      const n = Number(v);
      if (n < 1 || n > limits.maxSlashBps / 100) return `Must be between 1% and ${limits.maxSlashBps / 100}% (MAX_SLASH_BPS = ${limits.maxSlashBps}).`;
      return null;
    }
    case "maxConcurrent": {
      if (!/^\d+$/.test(v)) return "Enter a whole number of calls (0 or more).";
      if (Number(v) > UINT32_MAX) return "Exceeds the contract's uint32 limit (4,294,967,295).";
      return null;
    }
  }
}

export function collectErrors(values: Record<FieldKey, string>, limits: Limits): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const k of FIELD_KEYS) { const m = validateField(k, values[k], limits); if (m) out[k] = m; }
  return out;
}
