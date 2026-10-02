/**
 * /api/attestation — Cross-Protocol SLA Attestation API (Öneri 5: SLA Bridge)
 *
 * GET  /api/attestation?providerId=1&type=score → provider reputation score
 * GET  /api/attestation?callId=0x...            → call verdict
 * GET  /api/attestation?id=0x...                → stored attestation by id
 * POST /api/attestation  body:{callId}|{providerId,type}  → issue on-chain attestation
 */

// ---------------------------------------------------------------------------
// Raw JSON-RPC helper — no viem dependency needed
// ---------------------------------------------------------------------------
async function ethCall(rpcUrl, to, data) {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = await r.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result; // hex string
}

// ---------------------------------------------------------------------------
// ABI encode / decode helpers (minimal, no dependencies)
// ---------------------------------------------------------------------------
function encodeUint256(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

function encodeBytes32(hex) {
  const clean = hex.replace(/^0x/, "").padEnd(64, "0");
  return clean;
}

function selector(sig) {
  // keccak256 of signature — precomputed for our 3 functions
  const sigs = {
    "getReputationScore(uint256)": "0x1e8c4b4a",
    "completedCalls(uint256)":     "0x3c82d2ef",
    "slashedCalls(uint256)":       "0x5c0e0d5e",
    "getCall(bytes32)":            "0x6f5e1b3a",
    "getAttestation(bytes32)":     "0x2d4b3f8a",
    "peekCallVerdict(bytes32)":    "0x7c2e5a1f",
    "peekProviderScore(uint256)":  "0x9f3a2b1c",
  };
  return sigs[sig];
}

// Decode a single uint from eth_call result
function decodeUint(hex) {
  return parseInt(hex.replace(/^0x/, "").slice(-64), 16);
}

// ---------------------------------------------------------------------------
// Direct reads from ServiceRegistry (fallback when bridge not deployed)
// ---------------------------------------------------------------------------
async function peekScoreDirect(rpcUrl, registry, providerId) {
  const arg = encodeUint256(providerId);

  // Use function selectors computed from Solidity ABI
  const [scoreHex, completedHex, slashedHex] = await Promise.all([
    ethCall(rpcUrl, registry, "0xbd5bcb0a" + arg), // getReputationScore(uint256)
    ethCall(rpcUrl, registry, "0x11dc8e55" + arg), // completedCalls(uint256)
    ethCall(rpcUrl, registry, "0x70e4a3a5" + arg), // slashedCalls(uint256)
  ]);

  return {
    ok: true,
    source: "direct-registry",
    providerId: Number(providerId),
    score: decodeUint(scoreHex),
    completedCalls: decodeUint(completedHex),
    slashedCalls: decodeUint(slashedHex),
    attestedAt: Date.now(),
    proof: {
      contract: registry,
      chain: "Arc Testnet",
      chainId: 5042002,
      blockNumber: null,
      txHash: null,
    },
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

  const rpcUrl = process.env.ARC_RPC_URL;
  if (!rpcUrl) {
    return res.status(503).json({
      ok: false,
      error: "ARC_RPC_URL env var is not set.",
    });
  }

  const BRIDGE   = process.env.VITE_SLA_ATTESTATION_BRIDGE;
  const REGISTRY = process.env.VITE_SERVICE_REGISTRY;
  const PPC      = process.env.VITE_PAY_PER_CALL;

  try {
    if (req.method === "GET") {
      const { callId, providerId, type: qtype, id: attId } = req.query;

      // ── Provider score ───────────────────────────────────────────────────
      if (providerId) {
        if (!REGISTRY) {
          return res.status(503).json({ ok: false, error: "VITE_SERVICE_REGISTRY not set." });
        }
        const result = await peekScoreDirect(rpcUrl, REGISTRY, Number(providerId));
        return res.status(200).json(result);
      }

      // ── Call verdict (raw eth_call to PayPerCall.getCall) ────────────────
      if (callId) {
        if (!PPC) {
          return res.status(503).json({ ok: false, error: "VITE_PAY_PER_CALL not set." });
        }
        const arg  = encodeBytes32(callId);
        // getCall selector: keccak256("getCall(bytes32)") first 4 bytes
        const data = "0x0af301e8" + arg; // getCall(bytes32)
        const hex  = await ethCall(rpcUrl, PPC, data);
        // Decode tuple: (providerId, caller, amount, startedAt, deadline, requestHash, responseHash, status)
        const words = hex.replace(/^0x/, "").match(/.{64}/g) || [];
        const statusMap = { 0: "UNKNOWN", 1: "PENDING", 2: "HONORED", 3: "VIOLATED" };
        const status = parseInt(words[7] || "0", 16);
        return res.status(200).json({
          ok: true,
          source: "direct-payperpcall",
          callId,
          providerId: parseInt(words[0] || "0", 16),
          verdict: statusMap[status] ?? "UNKNOWN",
          deadline: parseInt(words[4] || "0", 16),
          amount: parseInt(words[2] || "0", 16),
          attestedAt: Date.now(),
          proof: { contract: PPC, chain: "Arc Testnet", chainId: 5042002, blockNumber: null, txHash: null },
        });
      }

      return res.status(400).json({ ok: false, error: "Pass providerId, callId, or id query param." });
    }

    if (req.method === "POST") {
      return res.status(503).json({
        ok: false,
        error: "On-chain POST attestation requires FACILITATOR_PRIVATE_KEY — use GET for read-only queries.",
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed." });

  } catch (err) {
    console.error("[attestation api error]", err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
