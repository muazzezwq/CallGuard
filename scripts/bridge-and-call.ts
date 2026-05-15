#!/usr/bin/env ts-node
/**
 * ArcSLA — Cross-Chain Bridge & Call Helper
 * 
 * Usage:
 *   npx ts-node scripts/bridge-and-call.ts \
 *     --source Ethereum_Sepolia \
 *     --provider-id 42 \
 *     --amount 5.5 \
 *     --request-hash 0xabc123...
 */

import { BridgeKit, ChainName, TransferStep, TransferState } from "@circle-fin/bridge-kit";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, createWalletClient, http, parseUnits, parseAbi, Hash, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, sepolia, baseSepolia, polygonAmoy } from "viem/chains";
import * as dotenv from "dotenv";
import { argv } from "process";

dotenv.config();

const PAY_PER_CALL_ADDRESS = "0xde0BeeF72976040eDa3F4f3E06B45c441CB2761B" as const;
const USDC_DECIMALS = 6;
export const ARC_MESSAGE_TRANSMITTER = "0x8EF77B696afF6BfDe78F9D6780C1Ade2B4b7e58";

const PAY_PER_CALL_ABI = parseAbi([
  "function callService(uint256 providerId, bytes32 requestHash) external returns (bytes32 callId)",
  "function usdc() external view returns (address)",
  "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline)",
]);

const CHAIN_MAP: Record<string, typeof arcTestnet | typeof sepolia | typeof baseSepolia | typeof polygonAmoy> = {
  "Arc_Testnet": arcTestnet,
  "Ethereum_Sepolia": sepolia,
  "Base_Sepolia": baseSepolia,
  "Polygon_Amoy": polygonAmoy,
};

function getViemChain(chainName: string) {
  const chain = CHAIN_MAP[chainName];
  if (!chain) throw new Error(`Unsupported chain: ${chainName}`);
  return chain;
}

function logStep(step: TransferStep, txHash?: Hash) {
  const status = step.state === TransferState.Complete ? "✅" : step.state === TransferState.Error ? "❌" : "⏳";
  console.log(`${status} [${step.type}] ${step.message}${txHash ? ` | Tx: ${txHash}` : ""}`);
}

export async function bridgeAndCall({
  sourceChain,
  providerId,
  amountUsdc,
  requestHash,
  callerPrivateKey,
  onStep,
}: {
  sourceChain: string;
  providerId: bigint;
  amountUsdc: number;
  requestHash: `0x${string}`;
  callerPrivateKey: `0x${string}`;
  onStep?: (step: TransferStep, txHash?: Hash) => void;
}): Promise<{ callId: `0x${string}`; bridgeTxHash: Hash; arcTxHash: Hash }> {

  const account = privateKeyToAccount(callerPrivateKey);
  const sourceViemChain = getViemChain(sourceChain);
  const destinationChain = "Arc_Testnet";
  const destinationViemChain = getViemChain(destinationChain);

  const adapter = new ViemAdapter({
    chains: [sourceViemChain, destinationViemChain],
  });

  const kit = new BridgeKit({
    adapter,
    sourceChain,
    destinationChain,
    token: "USDC",
    useForwarder: true,
    forwarderDestinationAddress: PAY_PER_CALL_ADDRESS,
    forwarderHookData: `0x${BigInt(providerId).toString(16).padStart(64, "0")}${requestHash.slice(2)}`,
  });

  const amountRaw = parseUnits(amountUsdc.toString(), USDC_DECIMALS);

  console.log(`🚀 ${amountUsdc} USDC: ${sourceChain} → Arc Testnet`);
  console.log(`   Provider: ${providerId} | Request: ${requestHash}`);

  const approval = await kit.approve(amountRaw);
  if (approval.txHash) {
    onStep?.(approval, approval.txHash);
  }

  const transfer = await kit.transfer(amountRaw);
  onStep?.(transfer, transfer.txHash);
  console.log(`   Burn: ${transfer.txHash}`);

  const result = await transfer.wait();

  if (result.state !== TransferState.Complete) {
    console.warn(`⚠️ Retrying...`);
    const retry = await kit.retry();
    if (retry?.state !== TransferState.Com
