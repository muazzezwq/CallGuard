import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "connectkit";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
});

export const CONFIG = {
  // Core tokens
  usdc: "0x3600000000000000000000000000000000000000",
  usdcAddress: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`,
  usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
  usycAddress: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C" as `0x${string}`,
  // Core contracts
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
  // Auxiliary contracts
  crossChainReceiver: "0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c",
  crossChainReceiverAddress: "0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c" as `0x${string}`,
  multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
  multicall3FromAddress: "0x522fAf9A91c41c443c66765030741e4AaCe147D0" as `0x${string}`,
  bandOracle: "0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68",
  bandOracleAddress: "0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68" as `0x${string}`,
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  memoAddress: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as `0x${string}`,
  // ERC-8004 AgentIdentity NFT registry (for registerV2)
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  identityRegistryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
  // ERC-8183 Jobs contract
  agenticCommerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  agenticCommerceAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583" as `0x${string}`,
  subgraphUrl: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn",
  explorerBase: "https://testnet.arcscan.app",
  explorerTx: (hash: string) => `https://testnet.arcscan.app/tx/${hash}`,
  explorerAddr: (addr: string) => `https://testnet.arcscan.app/address/${addr}`,
  rpcUrl: "https://rpc.testnet.arc.network",
  chainId: 5042002,
  chainName: "Arc Testnet",
  usdcDecimals: 6,
  facilitatorUrl: typeof window !== "undefined" ? window.location.origin : "https://callguard.vercel.app",
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
    transports: { [arcTestnet.id]: http("https://rpc.testnet.arc.network") },
    walletConnectProjectId: "2f05ae7f1116030fde2d36508f472bfb",
    appName: "CallGuard",
    appDescription: "On-chain SLA marketplace · Arc Testnet",
    appUrl: "https://callguard.vercel.app",
  })
);
