import { useReadContract, useWriteContract, useAccount, useBalance } from "wagmi";
import { formatUnits, parseUnits } from "viem";
// MEDIUM-09: use canonical ABIs from config — no local duplicates
import { CONFIG, REGISTRY_ABI } from "../lib/config";

// callCount/slashCount/receiptCount do NOT exist on PayPerCall.sol —
// use fetchNetworkStats() from subgraph.ts for aggregate counts instead.
// These stubs are kept for backward-compatible hook signature only and are disabled.
export function useCallCount() { return { data: undefined as bigint | undefined }; }
export function useSlashCount() { return { data: undefined as bigint | undefined }; }
export function useReceiptCount() { return { data: undefined as bigint | undefined }; }

export function useProviderCount() {
  return useReadContract({ address: CONFIG.registry as `0x${string}`, abi: REGISTRY_ABI, functionName: "nextProviderId" });
}

export function useProvider(id: number) {
  return useReadContract({ address: CONFIG.registry as `0x${string}`, abi: REGISTRY_ABI, functionName: "getProvider", args: [BigInt(id)] });
}

export function useProviderScore(id: number) {
  return useReadContract({ address: CONFIG.registry as `0x${string}`, abi: REGISTRY_ABI, functionName: "getReputationScore", args: [BigInt(id)] });
}

export function useUsdcBalance(address?: `0x${string}`) {
  return useBalance({ address, token: CONFIG.usdc as `0x${string}` });
}

export function useEurcBalance(address?: `0x${string}`) {
  return useBalance({ address, token: CONFIG.eurcAddress });
}

export function useUsycBalance(address?: `0x${string}`) {
  return useBalance({ address, token: CONFIG.usycAddress });
}

// Band Protocol oracle ABI (standard reference data)
const BAND_ABI = [
  {
    name: "getReferenceData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "base", type: "string" }, { name: "quote", type: "string" }],
    outputs: [
      { name: "rate", type: "uint256" },
      { name: "lastUpdatedBase", type: "uint256" },
      { name: "lastUpdatedQuote", type: "uint256" },
    ],
  },
] as const;

// Returns USDC/USD rate as a number (e.g. 1.0002)
// Only call after wallet connect — NOT on page load (rate limit rule)
export function useBandUsdcRate(enabled = false) {
  return useReadContract({
    address: CONFIG.bandOracleAddress,
    abi: BAND_ABI,
    functionName: "getReferenceData",
    args: ["USDC", "USD"],
    query: { enabled },
  });
}

export { formatUnits, parseUnits };
