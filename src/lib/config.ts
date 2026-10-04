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
  usdcAddress: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  registry: "0xea00f898C0eA249de7226b283e93C13eFa7BbcFF",
  registryAddress: "0xea00f898C0eA249de7226b283e93C13eFa7BbcFF" as `0x${string}`,
  payPerCall: "0x51bbd776d01bbb99b5425c701f00b2c516215e2e",
  ppcAddress: "0x51bbd776d01bbb99b5425c701f00b2c516215e2e" as `0x${string}`,
  disputeQuality: "0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725",
  disputeQualityAddress: "0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725" as `0x${string}`,
  slaFutures: "0xa6f194c621eE67559aDcA883824e01F1828e887c",
  slaFuturesAddress: "0xa6f194c621eE67559aDcA883824e01F1828e887c" as `0x${string}`,
  reputationLoan: "0xE656dF6512e9d10e555518b7342fd8c81c42B8c0",
  reputationLoanAddress: "0xE656dF6512e9d10e555518b7342fd8c81c42B8c0" as `0x${string}`,
  slaAttestationBridge: "0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7",
  agentWallet: "0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6",
  subgraphUrl: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn",
  explorerTx: (hash: string) => `https://explorer.testnet.arc.io/tx/${hash}`,
  explorerAddr: (addr: string) => `https://explorer.testnet.arc.io/address/${addr}`,
  usdcDecimals: 6,
};

export const USDC_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{name:"account",type:"address"}], outputs: [{type:"uint256"}] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{name:"to",type:"address"},{name:"value",type:"uint256"}], outputs: [{type:"bool"}] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{name:"spender",type:"address"},{name:"value",type:"uint256"}], outputs: [{type:"bool"}] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs: [{type:"uint256"}] },
] as const;

export const PPC_ABI = [
  { name: "callService", type: "function", stateMutability: "nonpayable", inputs: [{name:"providerId",type:"uint256"},{name:"requestHash",type:"bytes32"}], outputs: [{name:"callId",type:"uint256"}] },
  { name: "submitReceipt", type: "function", stateMutability: "nonpayable", inputs: [{name:"callId",type:"uint256"},{name:"responseHash",type:"bytes32"},{name:"respondedAt",type:"uint256"},{name:"signature",type:"bytes"}], outputs: [] },
  { name: "claimTimeout", type: "function", stateMutability: "nonpayable", inputs: [{name:"callId",type:"uint256"}], outputs: [] },
  { name: "calls", type: "function", stateMutability: "view", inputs: [{name:"callId",type:"uint256"}], outputs: [{name:"providerId",type:"uint256"},{name:"caller",type:"address"},{name:"amount",type:"uint256"},{name:"requestHash",type:"bytes32"},{name:"deadline",type:"uint256"},{name:"status",type:"uint8"},{name:"respondedAt",type:"uint256"},{name:"responseHash",type:"bytes32"}] },
  { name: "nextCallId", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
] as const;



export const DISPUTE_QUALITY_ABI = [
  { name: "openDispute", type: "function", stateMutability: "nonpayable", inputs: [{name:"callId",type:"uint256"},{name:"evidenceHash",type:"bytes32"}], outputs: [] },
  { name: "voteOnDispute", type: "function", stateMutability: "nonpayable", inputs: [{name:"disputeId",type:"uint256"},{name:"vote",type:"bool"}], outputs: [] },
  { name: "disputeCount", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
] as const;

export const SLA_FUTURES_ABI = [
  { name: "mintCapacity", type: "function", stateMutability: "nonpayable", inputs: [{name:"providerId",type:"uint256"},{name:"callCount",type:"uint256"},{name:"price",type:"uint256"},{name:"deadline",type:"uint256"}], outputs: [{name:"batchId",type:"uint256"}] },
  { name: "redeemCapacity", type: "function", stateMutability: "nonpayable", inputs: [{name:"batchId",type:"uint256"},{name:"amount",type:"uint256"}], outputs: [] },
  { name: "nextBatchId", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "batches", type: "function", stateMutability: "view", inputs: [{name:"id",type:"uint256"}], outputs: [{name:"providerId",type:"uint256"},{name:"callCount",type:"uint256"},{name:"price",type:"uint256"},{name:"deadline",type:"uint256"},{name:"redeemed",type:"uint256"}] },
] as const;

export const REPUTATION_LOAN_ABI = [
  { name: "borrow", type: "function", stateMutability: "nonpayable", inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "repay", type: "function", stateMutability: "nonpayable", inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "totalShares", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
] as const;

export const AGENT_WALLET_ABI = [
  { name: "spentToday", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "dailyLimit", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "execute", type: "function", stateMutability: "nonpayable", inputs: [{name:"to",type:"address"},{name:"value",type:"uint256"},{name:"data",type:"bytes"}], outputs: [] },
] as const;

export const REGISTRY_ABI = [
  { name: "register", type: "function", stateMutability: "nonpayable", inputs: [{name:"signer",type:"address"},{name:"stakeAmount",type:"uint256"},{name:"pricePerCall",type:"uint256"},{name:"maxResponseTime",type:"uint32"},{name:"slashBps",type:"uint32"},{name:"metadata",type:"bytes"}], outputs: [{type:"uint256"}] },
  { name: "getProvider", type: "function", stateMutability: "view", inputs: [{name:"id",type:"uint256"}], outputs: [{name:"signer",type:"address"},{name:"stakeAmount",type:"uint256"},{name:"pricePerCall",type:"uint256"},{name:"maxResponseTime",type:"uint32"},{name:"slashBps",type:"uint32"},{name:"reputationScore",type:"uint256"},{name:"active",type:"bool"}] },
  { name: "getReputationScore", type: "function", stateMutability: "view", inputs: [{name:"id",type:"uint256"}], outputs: [{type:"uint256"}] },
  { name: "providerCount", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
] as const;

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
