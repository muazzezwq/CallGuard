import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "connectkit";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arc-testnet.com"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
});

export const CONFIG = {
  usdc: "0x3600000000000000000000000000000000000000",
  registry: "0x10387347678d9f7106D5625bE0BD6C915158B130",
  payPerCall: "0xB9E08E1A9a72F17F67db6d13BBCb53252aF4Ca7b",
  subgraphUrl: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.4.2/gn",
  explorerTx: (hash: string) => `https://testnet.arcscan.app/tx/${hash}`,
  explorerAddr: (addr: string) => `https://testnet.arcscan.app/address/${addr}`,
  usdcDecimals: 6,
};

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [arcTestnet],
    transports: { [arcTestnet.id]: http("https://rpc.arc-testnet.com") },
    walletConnectProjectId: "2f05ae7f1116030fde2d36508f472bfb",
    appName: "CallGuard",
    appDescription: "On-chain SLA marketplace · Arc Testnet",
    appUrl: "https://callguard.vercel.app",
  })
);
