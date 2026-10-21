/* Cost and readiness rules for the Call Builder.
   Every amount is an integer in the unit named by its field:
   - `price`, `stake`, `usdcBalance`, `allowance`, `escrow`, `gasMicro`, `totalMicro`
     are USDC micro-units (6 decimals), the same shape `ServiceRegistry.getProvider`
     and the USDC contract return.
   - `gasWei` is the native-token wei amount (18 decimals) an `eth_estimateGas`
     result multiplied by the gas price produces on Arc.
   Nothing here invents a fee: `PayPerCall.callService` escrows exactly
   `pricePerCall`, and the only other cost is the network fee the chain charges. */
import { formatUnits } from "viem";

export const USDC_DECIMALS = 6;
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);
const NATIVE_SCALE = 10n ** 18n;

/** Exact USDC text; no floating point and no rounding beyond the token's own 6 decimals. */
export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

/** Native-token wei -> USDC micro-units, truncating (an estimate, never a charge). */
export function gasToUsdcMicro(wei: bigint): bigint {
  if (wei <= 0n) return 0n;
  return wei / (NATIVE_SCALE / USDC_SCALE);
}

export type CallCost = {
  /** Escrow the caller pays into PayPerCall; null when the provider price is unknown. */
  escrow: bigint | null;
  /** Estimated network fee in USDC micro-units; null when the estimate is unavailable. */
  gasMicro: bigint | null;
  /** escrow + gasMicro; null while either part is unknown. */
  totalMicro: bigint | null;
};

export function callCost(input: { price: bigint | null; gasWei?: bigint | null }): CallCost {
  const escrow = input.price;
  const gasMicro = input.gasWei == null ? null : gasToUsdcMicro(input.gasWei);
  return {
    escrow,
    gasMicro,
    totalMicro: escrow == null || gasMicro == null ? null : escrow + gasMicro,
  };
}

/** Exact batch total; null when the unit price is unknown (no 1 USDC fallback). */
export function batchCost(price: bigint | null, count: number): bigint | null {
  if (price == null) return null;
  if (!Number.isInteger(count) || count < 0) return null;
  return price * BigInt(count);
}

export type Blocker =
  | "no-provider"
  | "loading"
  | "not-found"
  | "inactive"
  | "slash-underfunded"
  | "insufficient-usdc"
  | "insufficient-gas"
  | "rate-limited";

export type Warning = "approval-needed" | "gas-unknown" | "native-balance-unknown" | "usdc-balance-unknown";

export type CallAssessment = { blockers: Blocker[]; warnings: Warning[] };

/** The default per-caller cap the contract applies when `maxConcurrentCalls` is 0. */
export const DEFAULT_MAX_CONCURRENT = 10;

export const BLOCKER_TEXT: Record<Blocker, string> = {
  "no-provider": "Choose a provider before preparing a call.",
  loading: "Reading the provider record. The call stays disabled until it loads.",
  "not-found": "No provider is registered under this id on Arc Testnet.",
  inactive: "This provider is inactive. ServiceRegistry rejects calls to it (ProviderNotActive).",
  "slash-underfunded":
    "The provider's slashable stake cannot cover the call price, so PayPerCall would revert with InsufficientProviderStake.",
  "insufficient-usdc": "Your USDC balance is below the call price. The escrow transfer would fail.",
  "insufficient-gas": "Your native gas balance is below the estimated network fee. The call would fail before it is broadcast.",
  "rate-limited":
    "You already hold the maximum number of open calls with this provider (TooManyConcurrentCalls). Wait for one to settle.",
};

export const WARNING_TEXT: Record<Warning, string> = {
  "approval-needed": "The first call needs a USDC approval before the escrow transfer.",
  "gas-unknown": "The network fee estimate is unavailable right now.",
  "native-balance-unknown": "Your native gas balance could not be read.",
  "usdc-balance-unknown": "Your USDC balance could not be read.",
};

/** Evaluates the same preconditions `PayPerCall.callService` enforces, plus the
    caller-side ones the wallet can prove. Missing data produces no verdict. */
export function assessCall(input: {
  providerId: number;
  recordLoaded: boolean;
  notFound: boolean;
  active: boolean;
  price: bigint | null;
  stake: bigint | null;
  slashBps: number | null;
  usdcBalance: bigint | null;
  allowance: bigint | null;
  openCalls: number | null;
  maxConcurrentCalls: number | null;
  zkTier: number;
  gasWei: bigint | null;
  /** Native-token wei. Omit when the caller does not want a readiness verdict. */
  nativeBalance?: bigint | null;
}): CallAssessment {
  const blockers: Blocker[] = [];
  const warnings: Warning[] = [];

  if (!Number.isInteger(input.providerId) || input.providerId <= 0) blockers.push("no-provider");
  else if (input.notFound) blockers.push("not-found");
  else if (!input.recordLoaded) blockers.push("loading");
  else if (!input.active) blockers.push("inactive");

  if (input.recordLoaded && !input.notFound && input.price != null) {
    if (input.stake != null && input.slashBps != null) {
      const slashable = (input.stake * BigInt(Math.max(0, Math.trunc(input.slashBps)))) / 10_000n;
      if (slashable < input.price) blockers.push("slash-underfunded");
    }
    if (input.usdcBalance != null && input.usdcBalance < input.price) {
      blockers.push("insufficient-usdc");
    }
    if (input.allowance != null && input.allowance < input.price) {
      warnings.push("approval-needed");
    }
    if (input.gasWei != null && input.nativeBalance != null && input.nativeBalance < input.gasWei) {
      blockers.push("insufficient-gas");
    }
    if (input.nativeBalance === null) warnings.push("native-balance-unknown");
    const baseCap = input.maxConcurrentCalls && input.maxConcurrentCalls > 0
      ? input.maxConcurrentCalls
      : DEFAULT_MAX_CONCURRENT;
    const cap = input.zkTier >= 2 ? baseCap * 2 : baseCap;
    if (input.openCalls != null && input.openCalls >= cap) blockers.push("rate-limited");
  }

  if (input.usdcBalance == null) warnings.push("usdc-balance-unknown");
  if (input.gasWei == null) warnings.push("gas-unknown");

  return { blockers, warnings };
}
