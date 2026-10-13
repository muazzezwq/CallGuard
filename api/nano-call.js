/**
 * POST /api/nano-call
 *
 * Sends a 0.001 USDC nano-payment on Arc Testnet via two rails:
 *
 *   1. Gateway Nanopayments (preferred) — @circle-fin/x402-batching
 *      Uses Circle's off-chain batching service for sub-cent, sub-second
 *      transfers. Activated when GATEWAY_BATCH_URL env var is set.
 *      Falls back to Rail 2 if the Gateway call fails.
 *
 *   2. Standard ERC-20 transfer (fallback) — direct on-chain USDC.transfer()
 *      Always available. Used when Gateway is unconfigured or unreachable.
 *
 * Security:
 *   - Rate limit: 5 req/min per IP (Upstash Redis if configured, else in-memory)
 *   - API key auth: X-Api-Key header required when NANO_API_KEY is set
 *
 * Env vars:
 *   BUYER_PRIVATE_KEY       — wallet that funds the transfer (Rail 2)
 *   SELLER_ADDRESS          — recipient of the nano-payment
 *   NANO_API_KEY            — optional, gates the endpoint with an API key
 *   GATEWAY_BATCH_URL       — Circle Gateway batching endpoint (enables Rail 1)
 *   GATEWAY_BATCH_API_KEY   — API key for the Gateway batching endpoint
 *   USDC_ADDRESS / VITE_USDC_ADDRESS — USDC contract on Arc Testnet
 */
import { ethers } from "ethers";

const BUYER_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER    = process.env.SELLER_ADDRESS;
// Required API key — callers must send X-Api-Key: <value> header
const NANO_API_KEY = process.env.NANO_API_KEY;

// Gateway Nanopayments (Rail 1) config.
// Set GATEWAY_BATCH_URL to enable — Circle Gateway batching endpoint.
const GATEWAY_BATCH_URL     = process.env.GATEWAY_BATCH_URL;
const GATEWAY_BATCH_API_KEY = process.env.GATEWAY_BATCH_API_KEY;

// Persistent rate limiter via Upstash Redis REST API (serverless-safe).
// Falls back to in-memory if UPSTASH_REDIS_REST_URL is not set.
const RATE_LIMIT  = 5;
const RATE_WINDOW = 60; // seconds

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory fallback (single-instance only — not reliable on serverless)
const _memStore = new Map();

async function checkRateLimit(ip) {
  const key = `rl:nano:${ip}`;

  // --- Upstash persistent path ---
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      // INCR key
      const incrRes = await fetch(`${UPSTASH_URL}/incr/${key}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
      const { result: count } = await incrRes.json();
      // Set TTL only on first request (count === 1)
      if (count === 1) {
        await fetch(`${UPSTASH_URL}/expire/${key}/${RATE_WINDOW}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
      }
      return count <= RATE_LIMIT;
    } catch {
      // Upstash unreachable — fall through to in-memory
    }
  }

  // --- In-memory fallback ---
  const now = Date.now();
  const entry = _memStore.get(key);
  if (!entry || now > entry.resetAt) {
    _memStore.set(key, { count: 1, resetAt: now + RATE_WINDOW * 1000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function getRpcUrl() {
  const base  = process.env.RPC_PROXY_BASE_URL;
  const token = process.env.RPC_PROXY_TOKEN;
  const chains = (process.env.RPC_PROXY_CHAINS || "").split(",");
  if (base && chains.includes("Arc_Testnet")) {
    return `${base}/api/rpc/Arc_Testnet?_rpc_token=${token}`;
  }
  return process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL;
}

const USDC_ABI_BALANCE = ["function balanceOf(address) view returns (uint256)"];
const USDC_ADDR = process.env.VITE_USDC_ADDRESS || process.env.USDC_ADDRESS;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET /api/nano-call?balance=1&address=0x...  (merged from nano-balance to stay within Hobby 12-fn limit)
  if (req.method === "GET" && req.query.balance === "1") {
    const address = req.query.address;
    if (!address || !ethers.isAddress(address))
      return res.status(400).json({ error: "?address=0x... required" });
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) return res.status(500).json({ error: "No RPC URL configured" });
    if (!USDC_ADDR) return res.status(500).json({ error: "VITE_USDC_ADDRESS not configured" });
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI_BALANCE, provider);
      const raw = await usdc.balanceOf(address);
      const formatted = ethers.formatUnits(raw, 6);
      return res.json({ address, raw: raw.toString(), formatted, symbol: "USDC" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // Auth check
  if (NANO_API_KEY) {
    const provided = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    if (!provided || provided !== NANO_API_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized — X-Api-Key required" });
    }
  }

  // Rate limit by IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: "Rate limit exceeded — max 5 calls per minute" });
  }

  // Validate required env
  if (!BUYER_KEY) return res.status(503).json({ ok: false, error: "BUYER_PRIVATE_KEY not configured" });
  if (!SELLER)   return res.status(503).json({ ok: false, error: "SELLER_ADDRESS not configured" });

  const rpcUrl = getRpcUrl();
  if (!rpcUrl) return res.status(503).json({ ok: false, error: "No RPC URL configured" });

  // Amount validation — only 0.001 USDC allowed
  const { amount } = req.body || {};
  const parsedAmount = parseFloat(amount);
  if (amount !== undefined && (isNaN(parsedAmount) || parsedAmount > 0.001)) {
    return res.status(400).json({ ok: false, error: "Amount exceeds max 0.001 USDC" });
  }

  // ── Rail 1: Gateway Nanopayments ─────────────────────────────────────────
  // Preferred path: Circle's off-chain batching service handles sub-cent
  // transfers without on-chain gas per call. The batch is settled to Arc
  // Testnet periodically by the Gateway relayer.
  if (GATEWAY_BATCH_URL && SELLER) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (GATEWAY_BATCH_API_KEY) headers["Authorization"] = `Bearer ${GATEWAY_BATCH_API_KEY}`;

      const gatewayRes = await fetch(GATEWAY_BATCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to:     SELLER,
          amount: "1000",        // 0.001 USDC in 6-decimal units
          asset:  process.env.USDC_ADDRESS || process.env.VITE_USDC_ADDRESS ||
                  "0x3600000000000000000000000000000000000000",
          chain:  "arc-testnet",
          memo:   "callguard-nano",
        }),
      });

      if (gatewayRes.ok) {
        const data = await gatewayRes.json();
        console.log("[nano-call] Gateway rail succeeded:", data?.batchId);
        return res.json({
          ok: true,
          amount: "0.001",
          rail: "gateway",
          batchId: data?.batchId || null,
          txHash:  data?.txHash  || null,
        });
      }

      // Gateway returned an error — log and fall through to Rail 2.
      const errText = await gatewayRes.text().catch(() => "(unreadable)");
      console.warn("[nano-call] Gateway rail failed, falling back to ERC-20:", gatewayRes.status, errText);
    } catch (gatewayErr) {
      console.warn("[nano-call] Gateway rail threw, falling back to ERC-20:", gatewayErr.message);
    }
  }

  // ── Rail 2: Standard ERC-20 transfer ─────────────────────────────────────
  // Direct on-chain USDC.transfer(). Always available; requires BUYER_PRIVATE_KEY.
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const buyer    = new ethers.Wallet(BUYER_KEY, provider);
    const usdcAbi  = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ];
    // USDC address from env (public value)
    const usdcAddr = process.env.USDC_ADDRESS || process.env.VITE_USDC_ADDRESS;
    if (!usdcAddr) return res.status(503).json({ ok: false, error: "USDC_ADDRESS not configured" });

    const usdc = new ethers.Contract(usdcAddr, usdcAbi, buyer);
    const transferAmount = ethers.parseUnits("0.001", 6);

    // Balance check before sending.
    const bal = await usdc.balanceOf(buyer.address);
    if (bal < transferAmount) {
      return res.status(402).json({ ok: false, error: "Insufficient demo wallet balance" });
    }

    const tx = await usdc.transfer(SELLER, transferAmount);
    await tx.wait();
    return res.json({ ok: true, amount: "0.001", rail: "erc20", txHash: tx.hash });
  } catch (e) {
    console.error("[nano-call] ERC-20 rail error:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
