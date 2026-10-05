import { useReadContract, useWriteContract, useAccount, useBalance } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { CONFIG } from "../lib/config";

const REGISTRY_ABI = [
  { name: "nextProviderId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getProvider", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint32" }, { type: "uint32" }, { type: "bool" }] },
  { name: "getReputationScore", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "completedCalls", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "slashedCalls", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const PPC_ABI = [
  { name: "callCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "slashCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "receiptCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export function useProviderCount() {
  return useReadContract({ address: CONFIG.registry as `0x${string}`, abi: REGISTRY_ABI, functionName: "nextProviderId" });
}

export function useCallCount() {
  return useReadContract({ address: CONFIG.payPerCall as `0x${string}`, abi: PPC_ABI, functionName: "callCount" });
}

export function useSlashCount() {
  return useReadContract({ address: CONFIG.payPerCall as `0x${string}`, abi: PPC_ABI, functionName: "slashCount" });
}

export function useReceiptCount() {
  return useReadContract({ address: CONFIG.payPerCall as `0x${string}`, abi: PPC_ABI, functionName: "receiptCount" });
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
