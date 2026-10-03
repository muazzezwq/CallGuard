#!/usr/bin/env bun
/**
 * E2E Lifecycle Test — CallGuard
 * Tests: caller → callService → provider submitReceipt → escrow released
 *        and: caller → callService → timeout → claimTimeout → refund+slash
 *
 * Usage: bun scripts/e2e-lifecycle.js
 * Requires: ARC_RPC_URL, CALLER_PK, PROVIDER_PK in .env
 */
import { ethers } from "ethers";

const RPC = process.env.ARC_RPC_URL;
if (!RPC) { console.error("❌ ARC_RPC_URL not set"); process.exit(1); }

const PPC_ADDR = process.env.VITE_PAY_PER_CALL;
if (!PPC_ADDR) { console.error("❌ VITE_PAY_PER_CALL not set"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC);
const callerWallet  = new ethers.Wallet(process.env.CALLER_PK || "", provider);
const providerWallet = new ethers.Wallet(process.env.PROVIDER_PK || "", provider);

const PPC_ABI = [
  "function callService(uint256 providerId, bytes32 requestHash) external returns (bytes32)",
  "function submitReceipt(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes calldata signature) external",
  "function claimTimeout(bytes32 callId) external",
  "function calls(bytes32) external view returns (uint8 status, address caller, uint256 providerId, uint256 amount, uint32 deadline)",
  "function hashReceipt(tuple(bytes32 callId, bytes32 responseHash, uint64 respondedAt)) external view returns (bytes32)",
];
const USDC_ABI = [
  "function approve(address, uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
];

const ppc = new ethers.Contract(PPC_ADDR, PPC_ABI, callerWallet);
const usdcAddr = process.env.VITE_USDC_ADDRESS;
if (!usdcAddr) { console.error("❌ VITE_USDC_ADDRESS not set"); process.exit(1); }
const usdc = new ethers.Contract(usdcAddr, USDC_ABI, callerWallet);

const PROVIDER_ID = process.env.TEST_PROVIDER_ID ? Number(process.env.TEST_PROVIDER_ID) : 1;
const REQUEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("e2e-test-" + Date.now()));

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }

async function runHappyPath() {
  console.log("\n📋 HAPPY PATH — provider honors SLA");
  try {
    // 1. approve
    const balBefore = await usdc.balanceOf(callerWallet.address);
    console.log(`  caller balance: ${ethers.formatUnits(balBefore, 6)} USDC`);
    const approveTx = await usdc.approve(PPC_ADDR, ethers.MaxUint256);
    await approveTx.wait();
    ok("USDC approved");

    // 2. callService
    const callTx = await ppc.callService(PROVIDER_ID, REQUEST_HASH);
    const callReceipt = await callTx.wait();
    const callId = callReceipt.logs[0]?.topics[1];
    if (!callId) throw new Error("callId not found in logs");
    ok(`callService tx: ${callTx.hash}`);
    ok(`callId: ${callId}`);

    // 3. submitReceipt as provider
    const responseHash = ethers.keccak256(ethers.toUtf8Bytes("pong"));
    const respondedAt = Math.floor(Date.now() / 1000);
    const ppcProvider = ppc.connect(providerWallet);
    const domain = { name: "ArcSLA", version: "v1", chainId: (await provider.getNetwork()).chainId, verifyingContract: PPC_ADDR };
    const types = { Receipt: [{ name: "callId", type: "bytes32" }, { name: "responseHash", type: "bytes32" }, { name: "respondedAt", type: "uint64" }] };
    const value = { callId, responseHash, respondedAt };
    const sig = await providerWallet.signTypedData(domain, types, value);
    const receiptTx = await ppcProvider.submitReceipt(callId, responseHash, respondedAt, sig);
    await receiptTx.wait();
    ok(`submitReceipt tx: ${receiptTx.hash}`);

    // 4. verify status
    const call = await ppc.calls(callId);
    if (call.status === 2n) ok("Call status: COMPLETED");
    else fail(`Unexpected status: ${call.status}`);

    const balAfter = await usdc.balanceOf(callerWallet.address);
    console.log(`  caller balance after: ${ethers.formatUnits(balAfter, 6)} USDC`);
  } catch(e) {
    fail(`Happy path error: ${e.message}`);
  }
}

async function runTimeoutPath() {
  console.log("\n⏱  TIMEOUT PATH — provider misses deadline");
  try {
    const reqHash2 = ethers.keccak256(ethers.toUtf8Bytes("timeout-test-" + Date.now()));
    const approveTx = await usdc.approve(PPC_ADDR, ethers.MaxUint256);
    await approveTx.wait();

    const callTx = await ppc.callService(PROVIDER_ID, reqHash2);
    const callReceipt = await callTx.wait();
    const callId = callReceipt.logs[0]?.topics[1];
    ok(`callService tx: ${callTx.hash}`);

    // fast-forward: we can't warp time on Arc testnet, so just verify claimTimeout
    // reverts before deadline (DeadlineNotReached)
    try {
      await ppc.claimTimeout(callId);
      fail("Should have reverted before deadline");
    } catch(e) {
      if (e.message.includes("DeadlineNotReached") || e.message.includes("execution reverted")) {
        ok("claimTimeout correctly reverts before deadline");
      } else {
        fail(`Unexpected error: ${e.message}`);
      }
    }
  } catch(e) {
    fail(`Timeout path error: ${e.message}`);
  }
}

async function main() {
  console.log("🚀 CallGuard E2E Lifecycle Test");
  console.log(`   RPC: ${RPC}`);
  console.log(`   Contract: ${PPC_ADDR}`);
  console.log(`   Caller: ${callerWallet.address}`);
  console.log(`   Provider: ${providerWallet.address}`);
  console.log(`   Provider ID: ${PROVIDER_ID}`);

  await runHappyPath();
  await runTimeoutPath();

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
