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
  payPerCall: "0x51bbd776d01bbb99b5425c701f00b2c516215e2e",
  disputeQuality: "0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725",
  slaFutures: "0xa6f194c621eE67559aDcA883824e01F1828e887c",
  reputationLoan: "0xE656dF6512e9d10e555518b7342fd8c81c42B8c0",
  slaAttestationBridge: "0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7",
  agentWallet: "0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6",
  subgraphUrl: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn",
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
