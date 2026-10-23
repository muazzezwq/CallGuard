#!/usr/bin/env bun
/**
 * Keeper soak harness — PayPerCallV8 + SLAKeeper.
 *
 * Discovers STARTED calls from the v8 subgraph, re-checks claimability on-chain,
 * batches SLAKeeper.claimBatch, withdraws accrued bounty, and appends a JSONL
 * evidence log so the 7-day soak can be audited afterwards.
 *
 * Why 7 days: DisputeV2.resolutionWindow and DisputeV2.disputeWindow are both
 * 604800s (7 days) on the deployed instance. DisputeV2.resolve reverts with
 * ResolutionWindowOpen until openedAt + resolutionWindow has passed, so a
 * shorter soak cannot exercise the dispute resolution branch at all.
 *
 * Usage:
 *   ARC_RPC_URL=https://rpc.testnet.arc.io KEEPER_PK=0x... bun scripts/keeper-soak.js
 *
 * Env:
 *   ARC_RPC_URL          required, Arc Testnet RPC
 *   KEEPER_PK            required, keeper EOA private key (needs native USDC for gas)
 *   SERVICE_REGISTRY_V8  optional, defaults to the deployed v8 registry
 *   PAY_PER_CALL_V8      optional, defaults to the deployed v8 PPC
 *   SLA_KEEPER_V8        optional, defaults to the deployed SLAKeeper
 *   SUBGRAPH_URL         optional, defaults to VITE_SUBGRAPH_URL or the Studio v8 endpoint
 *   POLL_MS              optional, loop interval, default 60000
 *   BATCH_SIZE           optional, callIds per claimBatch tx, default 20
 *   MIN_BOUNTY_WITHDRAW  optional, withdraw when bountyClaimable >= this (6dp), default 1000000 (1 USDC)
 *   DURATION_DAYS        optional, stop after N days, default 7
 *   SOAK_LOG_DIR         optional, JSONL output directory, default /tmp/opencode/keeper-soak
 */
import { ethers } from "ethers";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RPC = process.env.ARC_RPC_URL;
if (!RPC) {
  console.error("ARC_RPC_URL not set");
  process.exit(1);
}
if (!process.env.KEEPER_PK) {
  console.error("KEEPER_PK not set");
  process.exit(1);
}

const REGISTRY = process.env.SERVICE_REGISTRY_V8 || "0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3";
const PPC = process.env.PAY_PER_CALL_V8 || "0xedce61eF5be31DC22cEfE342692622A26919a7EF";
const KEEPER = process.env.SLA_KEEPER_V8 || "0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7";
const SUBGRAPH =
  process.env.SUBGRAPH_URL ||
  process.env.VITE_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/1763627/onur/1.0.0";

const POLL_MS = Number(process.env.POLL_MS || 60_000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20);
const MIN_BOUNTY_WITHDRAW = BigInt(process.env.MIN_BOUNTY_WITHDRAW || "1000000"); // 1 USDC, 6dp
const DURATION_DAYS = Number(process.env.DURATION_DAYS || 7);
const LOG_DIR = process.env.SOAK_LOG_DIR || "/tmp/opencode/keeper-soak";

const KEEPER_ABI = [
  "function isClaimable(bytes32 callId) view returns (bool)",
  "function bountyClaimable(address keeper) view returns (uint256)",
  "function claim(bytes32 callId) returns (uint256 refunded, uint256 slashed, uint256 bounty)",
  "function claimBatch(bytes32[] callIds) returns (uint256[] refunded, uint256[] slashed, uint256[] bounties)",
  "function withdrawBounty()",
  "event BatchClaimed(address indexed keeper, uint256 claimed)",
  "event TimeoutClaimed(bytes32 indexed callId, address indexed keeper, uint256 refunded, uint256 slashed, uint256 bounty)",
  "event BountyWithdrawn(address indexed keeper, uint256 amount)",
];

const PPC_ABI = ["function SUBMIT_GRACE() view returns (uint32)"];

const provider = new ethers.JsonRpcProvider(RPC);
const keeper = new ethers.Wallet(process.env.KEEPER_PK, provider);
const keeperContract = new ethers.Contract(KEEPER, KEEPER_ABI, keeper);
const ppcContract = new ethers.Contract(PPC, PPC_ABI, provider);

mkdirSync(LOG_DIR, { recursive: true });
const logPath = join(LOG_DIR, `soak-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const state = {
  startedAt: Date.now(),
  cycles: 0,
  batches: 0,
  batchTxFailures: 0,
  callsClaimed: 0,
  refunded: 0n,
  slashed: 0n,
  bountyEarned: 0n,
  bountyWithdrawn: 0n,
  withdrawTxs: 0,
};

function log(level, message, extra = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...extra };
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
  const tail = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${entry.ts}] ${level} ${message}${tail}`);
}

const fmt = (v) => ethers.formatUnits(v, 6);

/// Page through the v8 subgraph for calls still in STARTED state. The subgraph
/// can lag, so every candidate is re-verified with SLAKeeper.isClaimable.
async function discoverStartedCalls() {
  const ids = [];
  const page = 1000;
  let skip = 0;
  for (;;) {
    const query = `{
      calls(first: ${page}, skip: ${skip}, where: { status: STARTED }, orderBy: createdAt, orderDirection: asc) {
        id
        deadline
      }
    }`;
    const res = await fetch(SUBGRAPH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors) throw new Error(`subgraph error: ${JSON.stringify(body.errors[0])}`);
    const rows = body.data?.calls ?? [];
    for (const row of rows) ids.push(row.id);
    if (rows.length < page) break;
    skip += page;
    if (skip >= 10_000) break; // safety cap
  }
  return ids;
}

async function claimableIds(candidates) {
  const ready = [];
  for (const id of candidates) {
    try {
      if (await keeperContract.isClaimable(id)) {
        ready.push(id);
      }
    } catch {
      // A subgraph row without an on-chain call is stale; skip it.
    }
  }
  return ready;
}

async function runBatch(ids) {
  const before = await keeperContract.bountyClaimable(keeper.address);
  const tx = await keeperContract.claimBatch(ids);
  const receipt = await tx.wait();
  const after = await keeperContract.bountyClaimable(keeper.address);

  let claimed = 0;
  for (const entry of receipt.logs) {
    try {
      const parsed = keeperContract.interface.parseLog(entry);
      if (parsed?.name === "BatchClaimed") claimed += Number(parsed.args.claimed);
      if (parsed?.name === "TimeoutClaimed") {
        state.refunded += parsed.args.refunded;
        state.slashed += parsed.args.slashed;
      }
    } catch {
      // Logs from other contracts in the same tx are not ours.
    }
  }

  state.batches += 1;
  state.callsClaimed += claimed;
  state.bountyEarned += after - before;
  log("claim", "batch claimed", {
    txHash: receipt.hash,
    requested: ids.length,
    claimed,
    bounty: fmt(after - before),
    gasUsed: receipt.gasUsed.toString(),
  });
}

async function maybeWithdraw() {
  const accrued = await keeperContract.bountyClaimable(keeper.address);
  if (accrued < MIN_BOUNTY_WITHDRAW) return;
  const tx = await keeperContract.withdrawBounty();
  const receipt = await tx.wait();
  state.bountyWithdrawn += accrued;
  state.withdrawTxs += 1;
  log("withdraw", "bounty withdrawn", { txHash: receipt.hash, amount: fmt(accrued) });
}

async function cycle(graceSeconds) {
  state.cycles += 1;
  const startedIds = await discoverStartedCalls();
  const ready = await claimableIds(startedIds);
  const gas = await provider.getBalance(keeper.address);

  log("heartbeat", "cycle", {
    keeper: keeper.address,
    startedCalls: startedIds.length,
    claimable: ready.length,
    gasNative: ethers.formatUnits(gas, 18),
    cycles: state.cycles,
    totalClaimed: state.callsClaimed,
  });

  if (gas === 0n) log("warn", "keeper has no native USDC for gas");

  for (let i = 0; i < ready.length; i += BATCH_SIZE) {
    const chunk = ready.slice(i, i + BATCH_SIZE);
    try {
      await runBatch(chunk);
    } catch (error) {
      // One bad call must not stall the loop: retry the chunk one call at a time.
      state.batchTxFailures += 1;
      log("error", "batch failed, retrying individually", {
        count: chunk.length,
        reason: error.shortMessage || error.message,
      });
      for (const id of chunk) {
        try {
          await runBatch([id]);
        } catch (inner) {
          log("error", "single claim failed", {
            callId: id,
            reason: inner.shortMessage || inner.message,
          });
        }
      }
    }
  }

  await maybeWithdraw();
}

function summary() {
  return {
    logPath,
    uptimeHours: Number(((Date.now() - state.startedAt) / 3_600_000).toFixed(2)),
    cycles: state.cycles,
    batches: state.batches,
    batchTxFailures: state.batchTxFailures,
    callsClaimed: state.callsClaimed,
    refunded: fmt(state.refunded),
    slashed: fmt(state.slashed),
    bountyEarned: fmt(state.bountyEarned),
    bountyWithdrawn: fmt(state.bountyWithdrawn),
    withdrawTxs: state.withdrawTxs,
  };
}

async function main() {
  const graceSeconds = Number(await ppcContract.SUBMIT_GRACE());
  const deadline = state.startedAt + DURATION_DAYS * 86_400_000;

  log("start", "soak started", {
    rpc: RPC,
    keeper: keeper.address,
    registry: REGISTRY,
    payPerCall: PPC,
    slaKeeper: KEEPER,
    subgraph: SUBGRAPH,
    pollMs: POLL_MS,
    batchSize: BATCH_SIZE,
    submitGrace: graceSeconds,
    durationDays: DURATION_DAYS,
  });

  while (Date.now() < deadline) {
    try {
      await cycle(graceSeconds);
    } catch (error) {
      log("error", "cycle failed", { reason: error.shortMessage || error.message });
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_MS, remaining)));
  }

  log("stop", "soak finished", summary());
  console.log(JSON.stringify(summary(), null, 2));
}

process.on("SIGINT", () => {
  log("stop", "soak interrupted", summary());
  process.exit(0);
});
process.on("SIGTERM", () => {
  log("stop", "soak terminated", summary());
  process.exit(0);
});

main().catch((error) => {
  log("error", "soak crashed", { reason: error.shortMessage || error.message, stack: error.stack });
  process.exit(1);
});
