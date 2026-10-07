import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "connectkit";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  // Arc Testnet: USDC is the native gas token — 6 decimals, NOT 18
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
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
  // Core contracts (v5 — admin=owner cüzdan, 7 Oct 2026)
  registry: "0xc3ff2169ed44129b9fc06011a5a432f92ef2f0c4",
  registryAddress: "0xc3ff2169ed44129b9fc06011a5a432f92ef2f0c4" as `0x${string}`,
  payPerCall: "0x389b44b7ad68c9e661a9ef2625f958840c31b601",
  ppcAddress: "0x389b44b7ad68c9e661a9ef2625f958840c31b601" as `0x${string}`,
  disputeQuality: "0x7e2771df71c30307a95f038c93077d5350e7789d",
  disputeQualityAddress: "0x7e2771df71c30307a95f038c93077d5350e7789d" as `0x${string}`,
  slaFutures: "0x19d03ff147816c97aad88f1275ad80855dcac9b2",
  slaFuturesAddress: "0x19d03ff147816c97aad88f1275ad80855dcac9b2" as `0x${string}`,
  reputationLoan: "0x5a2f5455560ff9957db7fc208f9c819655c3a2d4",
  reputationLoanAddress: "0x5a2f5455560ff9957db7fc208f9c819655c3a2d4" as `0x${string}`,
  slaAttestationBridge: "0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7",
  agentWallet: "0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6",
  // Auxiliary contracts
  crossChainReceiver: "0x760326de3cba39994dfd81d2b71b072c0265601c",
  crossChainReceiverAddress: "0x760326de3cba39994dfd81d2b71b072c0265601c" as `0x${string}`,
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
  // callService returns bytes32 callId (not uint256)
  { name: "callService", type: "function", stateMutability: "nonpayable", inputs: [{name:"providerId",type:"uint256"},{name:"requestHash",type:"bytes32"}], outputs: [{name:"callId",type:"bytes32"}] },
  // CRITICAL-02 fix also in PPC_ABI: callId=bytes32, respondedAt=uint64 (not uint256)
  { name: "submitReceipt", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"callId",type:"bytes32"},{name:"responseHash",type:"bytes32"},{name:"respondedAt",type:"uint64"},{name:"signature",type:"bytes"}],
    outputs: [] },
  // MEDIUM-01: claimTimeout takes bytes32 callId (not uint256)
  { name: "claimTimeout", type: "function", stateMutability: "nonpayable", inputs: [{name:"callId",type:"bytes32"}], outputs: [] },
  // MEDIUM-02: calls() output matches struct Call exactly (no respondedAt field in struct)
  { name: "calls", type: "function", stateMutability: "view",
    inputs: [{name:"callId",type:"bytes32"}],
    outputs: [
      {name:"providerId",type:"uint256"},
      {name:"caller",type:"address"},
      {name:"amount",type:"uint256"},
      {name:"startedAt",type:"uint32"},
      {name:"deadline",type:"uint32"},
      {name:"requestHash",type:"bytes32"},
      {name:"responseHash",type:"bytes32"},
      {name:"status",type:"uint8"}
    ] },
  // Events (needed for log decoding)
  { name: "CallStarted", type: "event",
    inputs: [
      {name:"callId",type:"bytes32",indexed:true},
      {name:"providerId",type:"uint256",indexed:true},
      {name:"caller",type:"address",indexed:true},
      {name:"amount",type:"uint256",indexed:false},
      {name:"requestHash",type:"bytes32",indexed:false},
      {name:"deadline",type:"uint32",indexed:false}
    ] },
  { name: "ReceiptSubmitted", type: "event",
    inputs: [
      {name:"callId",type:"bytes32",indexed:true},
      {name:"responseHash",type:"bytes32",indexed:false},
      {name:"respondedAt",type:"uint64",indexed:false}
    ] },
  // HLB-01: callServiceFor — sets caller=beneficiary (cross-chain support)
  { name: "callServiceFor", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"},{name:"requestHash",type:"bytes32"},{name:"beneficiary",type:"address"}],
    outputs: [{name:"callId",type:"bytes32"}] },
  // HLB-03: pull settlement — claimable balance + claim()
  { name: "claimable", type: "function", stateMutability: "view",
    inputs: [{name:"account",type:"address"}], outputs: [{type:"uint256"}] },
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;



// CRITICAL-04 fix: synced with DisputeQuality.sol actual signatures
export const DISPUTE_QUALITY_ABI = [
  // openDispute(bytes32 callId, uint256 providerId, uint64 settledAt, string evidenceUri)
  { name: "openDispute", type: "function", stateMutability: "nonpayable",
    inputs: [
      {name:"callId",type:"bytes32"},
      {name:"providerId",type:"uint256"},
      {name:"settledAt",type:"uint64"},
      {name:"evidenceUri",type:"string"},
    ], outputs: [] },
  // vote(uint256 disputeId, Vote choice) — Vote enum: 1=ForCaller, 2=ForProvider
  { name: "vote", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"disputeId",type:"uint256"},{name:"choice",type:"uint8"}], outputs: [] },
  // submitResponseEvidence(uint256 disputeId, string responseUri)
  { name: "submitResponseEvidence", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"disputeId",type:"uint256"},{name:"responseUri",type:"string"}], outputs: [] },
  // finalize(uint256 disputeId)
  { name: "finalize", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"disputeId",type:"uint256"}], outputs: [] },
  { name: "disputeCount", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "disputeBond",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "voterBond",    type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  // LOW-01: votingWindow readable from contract
  { name: "votingWindow", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint32"}] },
  // HLB-05: pull payout accounting
  { name: "pendingWithdrawals", type: "function", stateMutability: "view",
    inputs: [{name:"account",type:"address"}], outputs: [{type:"uint256"}] },
  { name: "withdrawPayout", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "disputeIdByCallId", type: "function", stateMutability: "view",
    inputs: [{name:"callId",type:"bytes32"}], outputs: [{type:"uint256"}] },
  { name: "disputes", type: "function", stateMutability: "view",
    inputs: [{name:"disputeId",type:"uint256"}],
    outputs: [{name:"callId",type:"bytes32"},{name:"caller",type:"address"},{name:"providerId",type:"uint256"},
              {name:"openedAt",type:"uint64"},{name:"votingEndsAt",type:"uint64"},{name:"bond",type:"uint256"},
              {name:"evidenceUri",type:"string"},{name:"responseUri",type:"string"},
              {name:"votesForCaller",type:"uint256"},{name:"votesForProvider",type:"uint256"},
              {name:"outcome",type:"uint8"},{name:"finalized",type:"bool"}] },
] as const;

// HIGH-09 fix: synced with SLAFutures.sol — mintCapacity(providerId, pricePerCall, totalSlots, deadline)
export const SLA_FUTURES_ABI = [
  { name: "mintCapacity", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"},{name:"pricePerCall",type:"uint256"},{name:"totalSlots",type:"uint256"},{name:"deadline",type:"uint64"}],
    outputs: [{name:"batchId",type:"uint256"}] },
  { name: "buySlots", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"batchId",type:"uint256"},{name:"amount",type:"uint256"}], outputs: [] },
  { name: "burnSlot", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"batchId",type:"uint256"}], outputs: [] },
  { name: "cancelBatch", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"batchId",type:"uint256"}], outputs: [] },
  { name: "claimRefund", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"batchId",type:"uint256"}], outputs: [] },
  { name: "nextBatchId", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "batches", type: "function", stateMutability: "view",
    inputs: [{name:"id",type:"uint256"}],
    outputs: [{name:"providerId",type:"uint256"},{name:"pricePerCall",type:"uint256"},
              {name:"totalSlots",type:"uint256"},{name:"soldSlots",type:"uint256"},
              {name:"usedSlots",type:"uint256"},{name:"deadline",type:"uint64"},
              {name:"active",type:"bool"},{name:"provider",type:"address"}] },
  // HLB-02: provider pull settlement
  { name: "providerClaimable", type: "function", stateMutability: "view",
    inputs: [{name:"batchId",type:"uint256"}], outputs: [{type:"uint256"}] },
  { name: "claimProceeds", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"batchId",type:"uint256"}], outputs: [] },
] as const;

// HIGH-10 fix: synced with ReputationLoan.sol — borrow(providerId, amount), repay(loanId, amount), etc.
export const REPUTATION_LOAN_ABI = [
  // LP functions
  { name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"shares",type:"uint256"}], outputs: [] },
  // Borrower functions — borrow(providerId, amount) returns loanId
  { name: "borrow", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"},{name:"amount",type:"uint256"}],
    outputs: [{name:"loanId",type:"uint256"}] },
  { name: "repay", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"loanId",type:"uint256"},{name:"amount",type:"uint256"}], outputs: [] },
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"loanId",type:"uint256"}], outputs: [] },
  // Views
  { name: "totalShares",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "totalAssets",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "totalLoaned",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "loanCount",    type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "activeLoan",   type: "function", stateMutability: "view",
    inputs: [{name:"providerId",type:"uint256"}], outputs: [{type:"uint256"}] },
  { name: "loans", type: "function", stateMutability: "view",
    inputs: [{name:"loanId",type:"uint256"}],
    outputs: [{name:"providerId",type:"uint256"},{name:"borrower",type:"address"},
              {name:"principal",type:"uint256"},{name:"startTime",type:"uint256"},
              {name:"duration",type:"uint256"},{name:"repaid",type:"uint256"},
              {name:"active",type:"bool"}] },
  { name: "lpPositions", type: "function", stateMutability: "view",
    inputs: [{name:"lp",type:"address"}],
    outputs: [{name:"shares",type:"uint256"},{name:"depositTime",type:"uint256"}] },
] as const;

// HIGH-11 fix: synced with AgentWallet.sol — agentCall() not execute()
export const AGENT_WALLET_ABI = [
  { name: "deposit",   type: "function", stateMutability: "nonpayable",
    inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "withdraw",  type: "function", stateMutability: "nonpayable",
    inputs: [{name:"amount",type:"uint256"}], outputs: [] },
  { name: "agentCall", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"},{name:"requestHash",type:"bytes32"},
             {name:"amount",type:"uint256"},{name:"extraData",type:"bytes"}],
    outputs: [{name:"callId",type:"bytes32"}] },
  { name: "pause",   type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "unpause", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "addToWhitelist",      type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"}], outputs: [] },
  { name: "removeFromWhitelist", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"providerId",type:"uint256"}], outputs: [] },
  { name: "setLimits", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"dailyLimit",type:"uint256"},{name:"maxPerCall",type:"uint256"}], outputs: [] },
  // Views
  { name: "spentToday",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "dailyLimit",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "maxPerCall",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "totalSpent",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "totalCalls",  type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "paused",      type: "function", stateMutability: "view", inputs: [], outputs: [{type:"bool"}] },
  { name: "owner",       type: "function", stateMutability: "view", inputs: [], outputs: [{type:"address"}] },
  { name: "agent",       type: "function", stateMutability: "view", inputs: [], outputs: [{type:"address"}] },
  { name: "whitelistedProviders", type: "function", stateMutability: "view",
    inputs: [{name:"providerId",type:"uint256"}], outputs: [{type:"bool"}] },
] as const;

// HIGH-02 fix: providerCount→nextProviderId; HIGH-03: getProvider tuple corrected to 7 fields matching ServiceRegistry.sol
export const REGISTRY_ABI = [
  { name: "register", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"signer",type:"address"},{name:"stakeAmount",type:"uint256"},
             {name:"pricePerCall",type:"uint256"},{name:"maxResponseTime",type:"uint32"},
             {name:"slashBps",type:"uint32"},{name:"endpoint",type:"string"}],
    outputs: [{type:"uint256"}] },
  // getProvider returns a ProviderView tuple — 7 fields (owner,signer,stake,pricePerCall,maxResponseTime,slashBps,active)
  { name: "getProvider", type: "function", stateMutability: "view",
    inputs: [{name:"id",type:"uint256"}],
    outputs: [{name:"", type:"tuple", components: [
      {name:"owner",type:"address"}, {name:"signer",type:"address"},
      {name:"stake",type:"uint256"}, {name:"pricePerCall",type:"uint256"},
      {name:"maxResponseTime",type:"uint32"}, {name:"slashBps",type:"uint32"},
      {name:"active",type:"bool"},
    ]}] },
  { name: "getReputationScore", type: "function", stateMutability: "view",
    inputs: [{name:"id",type:"uint256"}], outputs: [{type:"uint256"}] },
  // HIGH-02: correct function name is nextProviderId, not providerCount
  { name: "nextProviderId", type: "function", stateMutability: "view", inputs: [], outputs: [{type:"uint256"}] },
  { name: "providerIdOf", type: "function", stateMutability: "view",
    inputs: [{name:"owner",type:"address"}], outputs: [{type:"uint256"}] },
  // HLB-07: widened to uint64
  { name: "completedCalls", type: "function", stateMutability: "view",
    inputs: [{name:"id",type:"uint256"}], outputs: [{type:"uint64"}] },
  { name: "slashedCalls", type: "function", stateMutability: "view",
    inputs: [{name:"id",type:"uint256"}], outputs: [{type:"uint64"}] },
  // HLB-06: timelock for payPerCall updates
  { name: "proposePayPerCall", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"_new",type:"address"}], outputs: [] },
  { name: "executePayPerCall", type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "pendingPayPerCall", type: "function", stateMutability: "view",
    inputs: [], outputs: [{type:"address"}] },
  { name: "payPerCallChangeAt", type: "function", stateMutability: "view",
    inputs: [], outputs: [{type:"uint256"}] },
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
