/**
 * /api/attestation — Cross-Protocol SLA Attestation API (Öneri 5: SLA Bridge)
 *
 * GET  /api/attestation?callId=0x...            → peek call verdict (no tx)
 * GET  /api/attestation?providerId=1&type=score → peek provider score (no tx)
 * GET  /api/attestation?id=0x...                → fetch stored attestation
 *
 * POST /api/attestation
 *   body: { callId: "0x..." }                    → issue CALL_RECEIPT attestation
 *   body: { providerId: 1, type: "score" }       → issue PROVIDER_SCORE attestation
 *   body: { providerId: 1, type: "batch" }       → issue BATCH_SUMMARY attestation
 *
 * Required env vars (set in Vercel / .env):
 *   ARC_RPC_URL                — Arc Testnet RPC endpoint
 *   FACILITATOR_PRIVATE_KEY    — wallet that submits on-chain txs (POST only)
 *   VITE_SLA_ATTESTATION_BRIDGE — deployed SLAAttestationBridge address
 *   VITE_PAY_PER_CALL          — PayPerCall address (fallback peek when bridge not set)
 *   VITE_SERVICE_REGISTRY      — ServiceRegistry address (fallback peek when bridge not set)
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Chain — built from env, no literals
// ---------------------------------------------------------------------------
const rpcUrl = process.env.ARC_RPC_URL;
if (!rpcUrl) throw new Error("ARC_RPC_URL env var is required");

const ARC_TESTNET = {
  id: 5_042_002,
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

// ---------------------------------------------------------------------------
// Contract addresses — all from env
// ---------------------------------------------------------------------------
const BRIDGE_ADDRESS   = process.env.VITE_SLA_ATTESTATION_BRIDGE; // set after deploy
const PAY_PER_CALL     = process.env.VITE_PAY_PER_CALL;
const SERVICE_REGISTRY = process.env.VITE_SERVICE_REGISTRY;

// ---------------------------------------------------------------------------
// ABIs (minimal)
// ---------------------------------------------------------------------------
const BRIDGE_ABI = parseAbi([
  "function peekCallVerdict(bytes32 callId) view returns (uint8 verdict, bytes32 responseHash, uint32 deadline)",
  "function peekProviderScore(uint256 providerId) view returns (uint8 score, uint32 completed, uint32 slashed)",
  "function getAttestation(bytes32 attestationId) view returns (tuple(bytes32 attestationId, uint8 attType, uint32 issuedAt, uint32 blockNumber, bytes32 callId, uint256 providerId, address caller, uint256 amount, bytes32 responseHash, uint32 deadline, uint32 respondedAt, uint8 verdict, uint8 reputationScore, uint32 completedCalls, uint32 slashedCalls))",
  "function attestCall(bytes32 callId) returns (bytes32 attestationId)",
  "function attestProviderScore(uint256 providerId) returns (bytes32 attestationId)",
  "function attestBatchSummary(uint256 providerId) returns (bytes32 attestationId)",
]);

const REGISTRY_ABI = parseAbi([
  "function getReputationScore(uint256 providerId) view returns (uint8)",
  "function completedCalls(uint256 providerId) view returns (uint32)",
  "function slashedCalls(uint256 providerId) view returns (uint32)",
]);

const PAY_PER_CALL_ABI = parseAbi([
  "function getCall(bytes32 callId) view returns (tuple(uint256 providerId, address caller, uint256 amount, uint32 startedAt, uint32 deadline, bytes32 requestHash, bytes32 responseHash, uint8 status))",
]);

// ---------------------------------------------------------------------------
// Verdict / type maps
// ---------------------------------------------------------------------------
const VERDICTS  = ["UNKNOWN", "HONORED", "VIOLATED", "PENDING"];
const ATT_TYPES = ["CALL_RECEIPT", "PROVIDER_SCORE", "BATCH_SUMMARY"];

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
function pubClient() {
  return createPublicClient({ chain: ARC_TESTNET, transport: http(rpcUrl) });
}

function walClient() {
  const pk = process.env.FACILITATOR_PRIVATE_KEY;
  if (!pk) throw new Error("FACILITATOR_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  return createWalletClient({ account, chain: ARC_TESTNET, transport: http(rpcUrl) });
}

// ---------------------------------------------------------------------------
// Fallback: direct PayPerCall peek (no bridge deployed yet)
// ---------------------------------------------------------------------------
async function peekCallDirect(callId) {
  if (!PAY_PER_CALL) throw new Error("VITE_PAY_PER_CALL env var not set");
  const c = await pubClient().readContract({ address: PAY_PER_CALL, abi: PAY_PER_CALL_ABI, functionName: "getCall", args: [callId] });
  const statusMap = { 0: "UNKNOWN", 1: "PENDING", 2: "HONORED", 3: "VIOLATED" };
  return {
    ok: true, source: "direct-payperpcall", callId,
    providerId: Number(c.providerId), verdict: statusMap[c.status] ?? "UNKNOWN",
    responseHash: c.responseHash, deadline: Number(c.deadline), amount: Number(c.amount),
    attestedAt: Date.now(),
    proof: { contract: PAY_PER_CALL, chain: "Arc Testnet", chainId: ARC_TESTNET.id, blockNumber: null, txHash: null },
  };
}

async function peekScoreDirect(providerId) {
  if (!SERVICE_REGISTRY) throw new Error("VITE_SERVICE_REGISTRY env var not set");
  const client = pubClient();
  const [score, completed, slashed] = await Promise.all([
    client.readContract({ address: SERVICE_REGISTRY, abi: REGISTRY_ABI, functionName: "getReputationScore", args: [BigInt(providerId)] }),
    client.readContract({ address: SERVICE_REGISTRY, abi: REGISTRY_ABI, functionName: "completedCalls",     args: [BigInt(providerId)] }),
    client.readContract({ address: SERVICE_REGISTRY, abi: REGISTRY_ABI, functionName: "slashedCalls",       args: [BigInt(providerId)] }),
  ]);
  return {
    ok: true, source: "direct-registry", providerId: Number(providerId),
    score: Number(score), completedCalls: Number(completed), slashedCalls: Number(slashed),
    attestedAt: Date.now(),
    proof: { contract: SERVICE_REGISTRY, chain: "Arc Testnet", chainId: ARC_TESTNET.id, blockNumber: null, txHash: null },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // -----------------------------------------------------------------------
    // GET
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      const { callId, providerId, type: qtype, id: attId } = req.query;

      // Stored attestation by id
      if (attId) {
        if (!BRIDGE_ADDRESS) return res.status(503).json({ ok: false, error: "Bridge not deployed. Set VITE_SLA_ATTESTATION_BRIDGE." });
        const att = await pubClient().readContract({ address: BRIDGE_ADDRESS, abi: BRIDGE_ABI, functionName: "getAttestation", args: [attId] });
        return res.status(200).json({
          ok: true, source: "stored-attestation",
          attestationId: att.attestationId, type: ATT_TYPES[att.attType] ?? "UNKNOWN",
          issuedAt: Number(att.issuedAt), blockNumber: Number(att.blockNumber),
          callId: att.callId, providerId: Number(att.providerId), caller: att.caller,
          amount: Number(att.amount), responseHash: att.responseHash, deadline: Number(att.deadline),
          verdict: VERDICTS[att.verdict] ?? "UNKNOWN", reputationScore: Number(att.reputationScore),
          completedCalls: Number(att.completedCalls), slashedCalls: Number(att.slashedCalls),
          attestedAt: Date.now(),
          proof: { contract: BRIDGE_ADDRESS, chain: "Arc Testnet", chainId: ARC_TESTNET.id },
        });
      }

      // Peek call verdict
      if (callId) {
        if (!BRIDGE_ADDRESS) return res.status(200).json(await peekCallDirect(callId));
        const [verdict, responseHash, deadline] = await pubClient().readContract({
          address: BRIDGE_ADDRESS, abi: BRIDGE_ABI, functionName: "peekCallVerdict", args: [callId],
        });
        return res.status(200).json({
          ok: true, source: "bridge-peek", callId,
          verdict: VERDICTS[verdict] ?? "UNKNOWN", responseHash, deadline: Number(deadline),
          attestedAt: Date.now(),
          proof: { contract: BRIDGE_ADDRESS, chain: "Arc Testnet", chainId: ARC_TESTNET.id, blockNumber: null, txHash: null },
        });
      }

      // Peek provider score
      if (providerId) {
        if (!BRIDGE_ADDRESS) return res.status(200).json(await peekScoreDirect(Number(providerId)));
        const [score, completed, slashed] = await pubClient().readContract({
          address: BRIDGE_ADDRESS, abi: BRIDGE_ABI, functionName: "peekProviderScore", args: [BigInt(providerId)],
        });
        return res.status(200).json({
          ok: true, source: "bridge-peek", providerId: Number(providerId),
          score: Number(score), completedCalls: Number(completed), slashedCalls: Number(slashed),
          attestedAt: Date.now(),
          proof: { contract: BRIDGE_ADDRESS, chain: "Arc Testnet", chainId: ARC_TESTNET.id, blockNumber: null, txHash: null },
        });
      }

      return res.status(400).json({ ok: false, error: "Pass callId, providerId, or id query param." });
    }

    // -----------------------------------------------------------------------
    // POST — issue on-chain attestation
    // -----------------------------------------------------------------------
    if (req.method === "POST") {
      if (!BRIDGE_ADDRESS) return res.status(503).json({ ok: false, error: "Bridge not deployed. Set VITE_SLA_ATTESTATION_BRIDGE." });

      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const { callId, providerId, type: btype } = body;

      let fnName, args;
      if (callId) {
        fnName = "attestCall"; args = [callId];
      } else if (providerId && btype === "score") {
        fnName = "attestProviderScore"; args = [BigInt(providerId)];
      } else if (providerId && btype === "batch") {
        fnName = "attestBatchSummary"; args = [BigInt(providerId)];
      } else {
        return res.status(400).json({ ok: false, error: "Provide callId OR {providerId, type:'score'|'batch'}." });
      }

      const client = pubClient();
      const wc = walClient();
      const { request } = await client.simulateContract({ address: BRIDGE_ADDRESS, abi: BRIDGE_ABI, functionName: fnName, args, account: wc.account });
      const txHash = await wc.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

      return res.status(200).json({
        ok: true, source: "on-chain-issued", txHash,
        blockNumber: Number(receipt.blockNumber),
        attestedAt: Date.now(),
        proof: { contract: BRIDGE_ADDRESS, chain: "Arc Testnet", chainId: ARC_TESTNET.id, blockNumber: Number(receipt.blockNumber), txHash },
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });

  } catch (err) {
    console.error("[attestation api]", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
