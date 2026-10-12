/**
 * POST /api/call-service
 *
 * x402 full flow: EIP-3009 signed payment → on-chain callServiceWithAuthorization
 * Body: { providerId, requestHash, authorization, signature }
 *
 * If FACILITATOR_PRIVATE_KEY is set: real on-chain settlement.
 * Otherwise: demo mode (sig verified, returns mock txHash).
 */

import { ethers } from "ethers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Payment",
};

// HIGH-08 fix: VITE_* prefix is not available in Node.js serverless environments.
// Read from unprefixed vars first, then fall back to VITE_* for backward compat.
const USDC_ADDR = process.env.USDC_ADDRESS  || process.env.VITE_USDC_ADDRESS;
const CONTRACT  = process.env.PAY_PER_CALL  || process.env.VITE_PAY_PER_CALL;
const CHAIN_ID  = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || "5042002");

const PAY_ABI = [
  "function callServiceWithAuthorization(uint256 providerId, bytes32 requestHash, address from, uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) external returns (bytes32)",
  "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline)",
];

const USDC_ABI = [
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

function getRpcUrl() {
  const base = process.env.RPC_PROXY_BASE_URL;
  const token = process.env.RPC_PROXY_TOKEN;
  const chains = (process.env.RPC_PROXY_CHAINS || "").split(",");
  if (base && chains.includes("Arc_Testnet")) {
    return `${base}/api/rpc/Arc_Testnet?_rpc_token=${token}`;
  }
  return process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL;
}

// Arc Testnet chain constants.
const ARC_TESTNET_CHAIN_ID = "eip155:5042002";
const USDC_ARC = "0x3600000000000000000000000000000000000000";
const FACILITATOR = process.env.VITE_FACILITATOR_ADDRESS || process.env.FACILITATOR_ADDRESS;

/**
 * Returns a fully-formed x402 payment-required body.
 * Follows the Circle Agent Marketplace `accepts` array schema so that any
 * x402-aware agent can auto-pay without reading docs.
 */
function paymentRequired(priceUsdc = "1000000") {
  return {
    x402Version: 1,
    error: "X-Payment header required",
    accepts: [
      {
        scheme: "exact",
        network: ARC_TESTNET_CHAIN_ID,
        asset: USDC_ARC,
        maxAmountRequired: priceUsdc,
        payTo: FACILITATOR || "0x0000000000000000000000000000000000000000",
        description: "USDC on Arc Testnet — CallGuard SLA per-call fee",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          required: ["providerId", "requestHash", "authorization", "signature"],
          properties: {
            providerId:    { type: "integer" },
            requestHash:   { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            authorization: { type: "object" },
            signature:     { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
          },
        },
        outputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          required: ["success", "callId"],
          properties: {
            success:     { type: "boolean" },
            callId:      { type: "string" },
            txHash:      { type: ["string", "null"] },
            blockNumber: { type: ["integer", "null"] },
          },
        },
      },
    ],
  };
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { providerId, requestHash, authorization, signature } = req.body || {};
  if (!providerId || !requestHash || !authorization || !signature) {
    res.setHeader("Content-Type", "application/json");
    return res.status(402).json(paymentRequired());
  }

  try {
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) return res.status(500).json({ error: "No RPC URL configured" });
    const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);

    // Verify EIP-712 signature
    const domain = {
      name: "USDC", version: "2",
      chainId: CHAIN_ID,
      verifyingContract: USDC_ADDR,
    };
    const types = {
      TransferWithAuthorization: [
        { name: "from",        type: "address" },
        { name: "to",          type: "address" },
        { name: "value",       type: "uint256" },
        { name: "validAfter",  type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce",       type: "bytes32" },
      ],
    };

    const recovered = ethers.verifyTypedData(domain, types, authorization, signature);
    if (recovered.toLowerCase() !== authorization.from.toLowerCase())
      return res.status(402).json({ error: "Signature mismatch" });

    const now = Math.floor(Date.now() / 1000);
    if (Number(authorization.validBefore) < now)
      return res.status(402).json({ error: "Authorization expired" });

    const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, rpcProvider);
    const nonceUsed = await usdc.authorizationState(authorization.from, authorization.nonce);
    if (nonceUsed) return res.status(402).json({ error: "Nonce already used" });

    // Demo mode
    if (!process.env.FACILITATOR_PRIVATE_KEY) {
      const mockCallId = ethers.keccak256(ethers.toUtf8Bytes(requestHash + Date.now()));
      return res.json({ success: true, callId: mockCallId, txHash: null, demo: true,
        message: "Signature verified — demo mode (no on-chain call)" });
    }

    // Real settlement
    const wallet = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, rpcProvider);
    const contract = new ethers.Contract(CONTRACT, PAY_ABI, wallet);
    const { v, r, s } = ethers.Signature.from(signature);

    const tx = await contract.callServiceWithAuthorization(
      providerId, requestHash,
      authorization.from,
      authorization.validAfter, authorization.validBefore,
      authorization.nonce,
      v, r, s,
    );
    const receipt = await tx.wait();

    // Parse CallStarted event
    const iface = new ethers.Interface(PAY_ABI);
    let callId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "CallStarted") { callId = parsed.args.callId; break; }
      } catch { /* skip */ }
    }

    return res.json({ success: true, callId, txHash: receipt.hash, blockNumber: receipt.blockNumber });

  } catch (e) {
    console.error("[x402/call-service] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
