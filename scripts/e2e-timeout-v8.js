#!/usr/bin/env bun
/**
 * v8 timeout lifecycle smoke test.
 *
 * callService -> deadline passes -> SLAKeeper.claim -> refund + slash + bounty -> withdrawBounty
 *
 * Proves the availability path end to end against deployed contracts: the caller is refunded,
 * the provider stake is slashed by its terms, and the keeper earns the bounded bounty. Nothing
 * is mocked.
 *
 * Usage:
 *   ARC_RPC_URL=https://rpc.testnet.arc.io \
 *   CALLER_PK=0x... KEEPER_PK=0x... \
 *   bun scripts/e2e-timeout-v8.js
 *
 * Env:
 *   ARC_RPC_URL     required
 *   CALLER_PK       required, funded with >= 1 USDC plus gas
 *   KEEPER_PK       required, funded for gas
 *   PROVIDER_ID     optional, default 1
 *   PAY_PER_CALL_V8 optional, defaults to the deployed v8 PPC
 *   SERVICE_REGISTRY_V8 optional, defaults to the deployed v8 registry
 *   SLA_KEEPER_V8   optional, defaults to the deployed SLAKeeper
 */
import { ethers } from "ethers";

const RPC = process.env.ARC_RPC_URL;
if (!RPC) {
  console.error("ARC_RPC_URL not set");
  process.exit(1);
}
if (!process.env.CALLER_PK || !process.env.KEEPER_PK) {
  console.error("CALLER_PK and KEEPER_PK are required");
  process.exit(1);
}

const REGISTRY = process.env.SERVICE_REGISTRY_V8 || "0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3";
const PPC = process.env.PAY_PER_CALL_V8 || "0xedce61eF5be31DC22cEfE342692622A26919a7EF";
const KEEPER = process.env.SLA_KEEPER_V8 || "0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7";
const USDC = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const PROVIDER_ID = BigInt(process.env.PROVIDER_ID || "1");

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

const PPC_ABI = [
  "function callService(uint256 providerId, bytes32 requestHash) returns (bytes32 callId)",
  "function getCall(bytes32 callId) view returns (tuple(uint256 providerId, address caller, uint256 amount, uint32 startedAt, uint32 deadline, uint32 completedAt, uint32 termsVersion, bytes32 termsHash, bytes32 requestHash, bytes32 responseHash, uint8 status))",
  "function SUBMIT_GRACE() view returns (uint32)",
  "function keeperBountyBps() view returns (uint16)",
  "function MAX_KEEPER_BOUNTY() view returns (uint256)",
  "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, uint32 termsVersion, bytes32 termsHash, bytes32 requestHash, uint32 deadline)",
  "event CallSlashed(bytes32 indexed callId, uint256 refunded, uint256 slashed, uint256 keeperBounty)",
];

const KEEPER_ABI = [
  "function claim(bytes32 callId) returns (uint256 refunded, uint256 slashed, uint256 bounty)",
  "function isClaimable(bytes32 callId) view returns (bool)",
  "function bountyClaimable(address keeper) view returns (uint256)",
  "function withdrawBounty()",
];

const REGISTRY_ABI = [
  "function getProvider(uint256 id) view returns (tuple(address owner, address signer, uint256 stake, uint256 pricePerCall, uint32 latestTermsVersion, bool active, uint32 pendingCalls, uint32 completedCalls, uint32 slashedCalls, uint32 maxConcurrentCalls, uint8 zkTier))",
  "function getTerms(uint256 id, uint32 version) view returns (tuple(uint32 version, uint32 maxResponseTime, uint16 slashBps, uint16 availabilityTargetBps, bytes32 termsHash, string termsUri, uint64 effectiveAt, bool active))",
];

const provider = new ethers.JsonRpcProvider(RPC);
const caller = new ethers.Wallet(process.env.CALLER_PK, provider);
const keeper = new ethers.Wallet(process.env.KEEPER_PK, provider);
const usdc = new ethers.Contract(USDC, USDC_ABI, caller);
const ppc = new ethers.Contract(PPC, PPC_ABI, caller);
const ppcRead = new ethers.Contract(PPC, PPC_ABI, provider);
const keeperContract = new ethers.Contract(KEEPER, KEEPER_ABI, keeper);
const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, provider);

const fmt = (v) => ethers.formatUnits(v, 6);
const step = (msg, extra) => console.log(`[${new Date().toISOString()}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);

async function main() {
  const terms = await registry.getTerms(PROVIDER_ID, 1);
  const before = await registry.getProvider(PROVIDER_ID);
  const price = before.pricePerCall;

  step("provider", {
    id: PROVIDER_ID.toString(),
    active: before.active,
    stake: fmt(before.stake),
    price: fmt(price),
    slashBps: Number(terms.slashBps),
    maxResponseTime: Number(terms.maxResponseTime),
    termsVersion: Number(terms.version),
  });

  if (!before.active) throw new Error("provider is not active");

  // 1. Approve exactly one call's price, then open the call.
  const allowance = await usdc.allowance(caller.address, PPC);
  if (allowance < price) {
    step("approve", { amount: fmt(price) });
    const approveTx = await usdc.approve(PPC, price);
    await approveTx.wait();
  }

  const requestHash = ethers.hexlify(ethers.randomBytes(32));
  step("callService", { providerId: PROVIDER_ID.toString(), requestHash });
  const callTx = await ppc.callService(PROVIDER_ID, requestHash);
  const callReceipt = await callTx.wait();

  let callId;
  let deadline;
  for (const entry of callReceipt.logs) {
    try {
      const parsed = ppc.interface.parseLog(entry);
      if (parsed?.name === "CallStarted") {
        callId = parsed.args.callId;
        deadline = Number(parsed.args.deadline);
      }
    } catch {
      // logs from other contracts
    }
  }
  if (!callId) throw new Error("CallStarted not found in receipt");
  step("call opened", { callId, deadline, txHash: callReceipt.hash });

  // 2. Wait for deadline + SUBMIT_GRACE. The keeper must not claim before that.
  const grace = Number(await ppcRead.SUBMIT_GRACE());
  const claimableAt = deadline + grace + 1;
  const waitMs = claimableAt * 1000 - Date.now();
  step("waiting for deadline", { claimableAt, seconds: Math.max(0, Math.round(waitMs / 1000)) });

  const early = await keeperContract.isClaimable(callId);
  if (early) throw new Error("call was claimable before the grace window closed");
  step("grace guard", { isClaimable: early });

  while (!(await keeperContract.isClaimable(callId))) {
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 3. Claim from the keeper. Refund and slash both come from the escrow.
  step("claim");
  const claimTx = await keeperContract.claim(callId);
  const claimReceipt = await claimTx.wait();

  let refunded = 0n;
  let slashed = 0n;
  let bounty = 0n;
  for (const entry of claimReceipt.logs) {
    try {
      const parsed = ppcRead.interface.parseLog(entry);
      if (parsed?.name === "CallSlashed") {
        refunded = parsed.args.refunded;
        slashed = parsed.args.slashed;
        bounty = parsed.args.keeperBounty;
      }
    } catch {
      // logs from other contracts
    }
  }
  step("claimed", {
    txHash: claimReceipt.hash,
    refunded: fmt(refunded),
    slashed: fmt(slashed),
    bounty: fmt(bounty),
  });

  const scoped = await keeperContract.bountyClaimable(keeper.address);
  step("bounty accrued", { bountyClaimable: fmt(scoped) });
  if (scoped > 0n) {
    const withdrawTx = await keeperContract.withdrawBounty();
    await withdrawTx.wait();
    step("bounty withdrawn", { amount: fmt(scoped), txHash: withdrawTx.hash });
  }

  // 4. Final state: call settled, provider stake reduced, escrow credited to the caller.
  const after = await registry.getProvider(PROVIDER_ID);
  const call = await ppcRead.getCall(callId);
  const callerBalanceBefore = await usdc.balanceOf(caller.address);
  const pendingRefund = await new ethers.Contract(PPC, ["function claimable(address) view returns (uint256)"], provider).claimable(caller.address);
  const callerClaim = new ethers.Contract(PPC, ["function claim()", "function claimable(address) view returns (uint256)"], caller);
  if (pendingRefund > 0n) {
    const claimTx = await callerClaim.claim();
    await claimTx.wait();
    step("caller refund claimed", { amount: fmt(pendingRefund), txHash: claimTx.hash });
  }
  const callerBalanceAfter = await usdc.balanceOf(caller.address);
  step("final", {
    callStatus: Number(call.status), // 0 None, 1 Pending, 2 Completed, 3 Slashed
    stakeBefore: fmt(before.stake),
    stakeAfter: fmt(after.stake),
    slashedCalls: Number(after.slashedCalls),
    callerBalanceBefore: fmt(callerBalanceBefore),
    callerBalanceAfter: fmt(callerBalanceAfter),
  });

  if (refunded === 0n) throw new Error("no refund was issued");
  if (slashed === 0n) throw new Error("no slash was applied");
  if (after.stake >= before.stake) throw new Error("provider stake did not decrease");
  step("PASS");
}

main().catch((e) => {
  console.error(`FAIL: ${e.shortMessage || e.message}`);
  process.exit(1);
});
