/**
 * GET  /api/service  → HTTP 402 + payment requirements (x402 protocol)
 * POST /api/service  → verify EIP-3009 signature + settle on-chain
 *
 * Environment variables required:
 *   VITE_USDC_ADDRESS         — USDC contract on Arc Testnet
 *   VITE_FACILITATOR_ADDRESS  — address that receives payment (payTo)
 *   VITE_CHAIN_ID             — Arc Testnet chain id
 *   VITE_SERVICE_PRICE_ATOMIC — price in USDC atomic units (6 decimals)
 *   RPC_PROXY_BASE_URL / RPC_PROXY_TOKEN / RPC_PROXY_CHAINS — RPC proxy
 *   FACILITATOR_PRIVATE_KEY   — (optional) private key for on-chain settlement
 *                               omit for demo/verified-only mode
 */

import { ethers } from "ethers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Payment,Authorization",
};

// ── Config from env ───────────────────────────────────────────────────────────
const USDC_ADDR = process.env.VITE_USDC_ADDRESS;
const PAY_TO    = process.env.VITE_FACILITATOR_ADDRESS;
const CHAIN_ID  = Number(process.env.VITE_CHAIN_ID || "5042002");
const PRICE     = process.env.VITE_SERVICE_PRICE_ATOMIC || "1000000";

// RPC: prefer proxy, fall back to public endpoint
function getRpcUrl() {
  const proxyBase   = process.env.RPC_PROXY_BASE_URL;
  const proxyToken  = process.env.RPC_PROXY_TOKEN;
  const proxyChains = (process.env.RPC_PROXY_CHAINS || "").split(",");
  const compassKey  = "Arc_Testnet";
  if (proxyBase && proxyChains.includes(compassKey)) {
    return `${proxyBase}/api/rpc/${compassKey}?_rpc_token=${proxyToken}`;
  }
  // public fallback — rate limit unknown
  return process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL;
}

const USDC_ABI = [
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external",
  "function authorizationState(address authorizer,bytes32 nonce) external view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

function paymentRequirements() {
  return {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: PRICE,
    resource: "/api/service",
    description: "CallGuard protected service call",
    mimeType: "application/json",
    payTo: PAY_TO,
    maxTimeoutSeconds: 120,
    asset: USDC_ADDR,
    extra: { name: "USD Coin", version: "2", chainId: CHAIN_ID },
  };
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET → 402 ─────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    return res.status(402).json({
      x402Version: 1,
      accepts: [paymentRequirements()],
      error: "Payment Required",
    });
  }

  // ── POST → verify + settle ────────────────────────────────────────────────
  if (req.method === "POST") {
    const header = req.headers["x-payment"];
    if (!header) {
      return res.status(402).json({
        x402Version: 1, accepts: [paymentRequirements()], error: "X-Payment header missing",
      });
    }

    let payment;
    try {
      payment = JSON.parse(Buffer.from(header, "base64").toString());
    } catch {
      return res.status(400).json({ error: "X-Payment header is not valid base64 JSON" });
    }

    const { authorization, signature } = payment;
    if (!authorization || !signature)
      return res.status(400).json({ error: "authorization or signature missing" });

    try {
      const rpcUrl = getRpcUrl();
      if (!rpcUrl) return res.status(500).json({ error: "No RPC URL configured" });
      const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);

      // ── EIP-712 / EIP-3009 signature verify ────────────────────────────────
      const domain = {
        name: "USD Coin", version: "2",
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
      if (Number(authorization.validAfter) > now)
        return res.status(402).json({ error: "Authorization not yet valid" });
      if (Number(authorization.validBefore) < now)
        return res.status(402).json({ error: "Authorization expired" });
      if (BigInt(authorization.value) < BigInt(PRICE))
        return res.status(402).json({ error: `Insufficient: need ${PRICE} got ${authorization.value}` });
      if (authorization.to.toLowerCase() !== PAY_TO.toLowerCase())
        return res.status(402).json({ error: "Wrong payTo address" });

      const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, rpcProvider);
      const nonceUsed = await usdc.authorizationState(authorization.from, authorization.nonce);
      if (nonceUsed) return res.status(402).json({ error: "Nonce already used" });

      const bal = await usdc.balanceOf(authorization.from);
      if (BigInt(bal) < BigInt(authorization.value))
        return res.status(402).json({ error: "Insufficient USDC balance" });

      // ── Settle ─────────────────────────────────────────────────────────────
      if (!process.env.FACILITATOR_PRIVATE_KEY) {
        // Demo mode: signature verified but not settled on-chain
        const mockTx = ethers.keccak256(ethers.toUtf8Bytes(header + Date.now()));
        const response = { txHash: mockTx, settled: false, demo: true };
        res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(response)).toString("base64"));
        return res.json({ ok: true, data: "signature verified — demo mode (no on-chain settlement)", payment: response });
      }

      const wallet = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, rpcProvider);
      const { v, r, s } = ethers.Signature.from(signature);
      const tx = await usdc.connect(wallet).transferWithAuthorization(
        authorization.from, authorization.to, authorization.value,
        authorization.validAfter, authorization.validBefore, authorization.nonce,
        v, r, s,
      );
      const receipt = await tx.wait();
      const response = { txHash: receipt.hash, settled: true, blockNumber: receipt.blockNumber };
      res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(response)).toString("base64"));
      return res.json({ ok: true, data: "payment settled on-chain", payment: response });

    } catch (e) {
      console.error("[x402/service] error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
