import { CCTP_CONFIG } from "./cctp";

/** Source chains the Bridge panel can burn from. All of them use CCTP v2. */
export type BridgeSourceChain = {
  id: number;
  name: string;
  symbol: string;
  usdcAddr: `0x${string}`;
  domain: number;
  tokenMessenger: `0x${string}`;
};

const SOURCE_DEFS = [
  { key: "sepolia", name: "Ethereum Sepolia", symbol: "ETH" },
  { key: "base", name: "Base Sepolia", symbol: "ETH" },
  { key: "amoy", name: "Polygon Amoy", symbol: "MATIC" },
] as const;

export const BRIDGE_SOURCE_CHAINS: readonly BridgeSourceChain[] = SOURCE_DEFS.map(({ key, name, symbol }) => ({
  id: CCTP_CONFIG.chains[key].chainId,
  name,
  symbol,
  usdcAddr: CCTP_CONFIG.usdc[key] as `0x${string}`,
  domain: CCTP_CONFIG.domains[key],
  tokenMessenger: CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`,
}));
