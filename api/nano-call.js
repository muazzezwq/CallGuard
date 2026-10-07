/**
 * POST /api/nano-call
 * CRITICAL-07 fix: added rate limiting (5 req/min per IP) and API key auth.
 * BUYER_PRIVATE_KEY funds demo nano transfers — requires NANO_API_KEY in env.
 */
import { ethers } from "ethers";

const BUYER_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER    = process.env.SELLER_ADDRESS;
// Required API key — callers must send X-Api-Key: <value> header
const NANO_API_KEY = process.env.NANO_API_KEY;

// In-memory rate limiter: max 5 calls per IP per 60 seconds
const rateLimiter = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT  = 5;
const RATE_WINDOW = 60_000; // ms

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");

  if (req.method === "OPTIONS") return res.status(200).end();
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

    const usdc     = new ethers.Contract(usdcAddr, usdcAbi, buyer);
    const transferAmount = ethers.parseUnits("0.001", 6);

    // Balance check before sending
    const bal = await usdc.balanceOf(buyer.address);
    if (bal < transferAmount) {
      return res.status(402).json({ ok: false, error: "Insufficient demo wallet balance" });
    }

    const tx = await usdc.transfer(SELLER, transferAmount);
    await tx.wait();
    return res.json({ ok: true, amount: "0.001", txHash: tx.hash });
  } catch (e) {
    console.error("[nano-call] error:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
