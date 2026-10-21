/**
 * POST /api/nano-call
 *
 * Sends a 0.001 USDC nano-payment on Arc Testnet via two rails:
 *
 *   1. Gateway Nanopayments (preferred) — Circle Gateway batching endpoint
 *      configured by GATEWAY_BATCH_URL. Uses Circle's off-chain batching
 *      service for sub-cent, sub-second transfers. Falls back to Rail 2 only
 *      when Gateway is not configured.
 *
 *   2. Standard ERC-20 transfer (fallback) — direct on-chain USDC.transfer()
 *      Used only when the Gateway rail is not configured. It is never used
 *      after a Gateway request may have reached submission.
 *
 * Failure policy:
 *   The installed Gateway integration has no documented idempotency key or
 *   request-status contract for this endpoint. Once fetch() is invoked, a
 *   timeout, connection reset, ambiguous 5xx, malformed success body, or any
 *   other non-verifiable response is an unknown payment outcome. It must not
 *   trigger a second payment. Such requests return a controlled pending result
 *   and require out-of-band reconciliation.
 *
 * Security:
 *   - Rate limit: 5 req/min per IP (Upstash Redis if configured, else in-memory)
 *   - API key auth: X-Api-Key header required (fail-closed; NANO_API_KEY must be set)
 *
 * Env vars:
 *   BUYER_PRIVATE_KEY       — wallet that funds the transfer (Rail 2)
 *   SELLER_ADDRESS          — recipient of the nano-payment
 *   NANO_API_KEY            — required, gates the endpoint with an API key (fail-closed)
 *   GATEWAY_BATCH_URL       — Circle Gateway batching endpoint (enables Rail 1)
 *   GATEWAY_BATCH_API_KEY   — API key for the Gateway batching endpoint
 *   USDC_ADDRESS / VITE_USDC_ADDRESS — USDC contract on Arc Testnet
 */
import { ethers } from "ethers";
import crypto from "node:crypto";
import { getRpcUrl } from "./_rpc.js";
import { logError } from "./_redact.js";

// Constant-time string compare (hash first so lengths always match).
function safeEqual(a, b) {
  const ab = crypto.createHash("sha256").update(String(a)).digest();
  const bb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ab, bb);
}

const RATE_LIMIT  = 5;
const RATE_WINDOW = 60; // seconds
const GATEWAY_TIMEOUT_MS = 12_000;
const CANONICAL_ARC_USDC = "0x3600000000000000000000000000000000000000";

// In-memory fallback (single-instance only — not reliable on serverless)
const _memStore = new Map();

function readConfig(env) {
  return {
    buyerKey:      env.BUYER_PRIVATE_KEY,
    seller:        env.SELLER_ADDRESS,
    apiKey:        env.NANO_API_KEY,
    gatewayUrl:    env.GATEWAY_BATCH_URL,
    gatewayApiKey: env.GATEWAY_BATCH_API_KEY,
    usdcAddress:   env.USDC_ADDRESS || env.VITE_USDC_ADDRESS,
  };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function firstString(...values) {
  return values.find(value => typeof value === "string" && value.length > 0) || null;
}

function gatewayCorrelationId(payload) {
  if (!payload || typeof payload !== "object") return null;
  return firstString(payload.batchId, payload.txHash, payload.transferId, payload.id);
}

function gatewayEvidence(payload) {
  if (!payload || typeof payload !== "object") {
    return { accepted: false, batchId: null, txHash: null, correlationId: null };
  }
  const batchId = firstString(payload.batchId);
  const txHash = firstString(payload.txHash);
  const rejected = payload.ok === false || payload.success === false;
  return {
    accepted: !rejected && Boolean(batchId || txHash),
    batchId,
    txHash,
    correlationId: gatewayCorrelationId(payload),
  };
}

function pendingGateway(res, correlationId = null) {
  return res.status(202).json({
    ok: false,
    pending: true,
    status: "pending",
    code: "PAYMENT_OUTCOME_UNKNOWN",
    error: "Gateway payment outcome is unknown. Do not retry until the payment is verified.",
    rail: "gateway",
    correlationId,
    retryable: false,
  });
}

function timeoutSignal() {
  try {
    return AbortSignal.timeout(GATEWAY_TIMEOUT_MS);
  } catch {
    return undefined;
  }
}

async function readJsonBody(response) {
  try {
    const text = await response.text();
    if (!text) return { ok: true, payload: null };
    return { ok: true, payload: JSON.parse(text) };
  } catch {
    return { ok: false, payload: null };
  }
}

async function checkRateLimit(ip, env, fetchImpl) {
  const key = `rl:nano:${ip}`;
  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;

  // --- Upstash persistent path ---
  if (upstashUrl && upstashToken) {
    try {
      // INCR key
      const incrRes = await fetchImpl(`${upstashUrl}/incr/${key}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${upstashToken}` },
      });
      const { result: count } = await incrRes.json();
      // Set TTL only on first request (count === 1)
      if (count === 1) {
        await fetchImpl(`${upstashUrl}/expire/${key}/${RATE_WINDOW}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${upstashToken}` },
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

export function createNanoCallHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");

    if (req.method === "OPTIONS") return res.status(200).end();

    const cfg = readConfig(env);
    const rpcUrl = getRpcUrl(env);

    // GET /api/nano-call?balance=1&address=0x...  (merged from nano-balance to stay within Hobby 12-fn limit)
    if (req.method === "GET" && req.query.balance === "1") {
      const address = req.query.address;
      if (!address || !ethers.isAddress(address))
        return res.status(400).json({ error: "?address=0x... required" });
      if (!rpcUrl) return res.status(500).json({ error: "No RPC URL configured" });
      if (!cfg.usdcAddress) return res.status(500).json({ error: "VITE_USDC_ADDRESS not configured" });
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const usdc = new ethers.Contract(cfg.usdcAddress, ["function balanceOf(address) view returns (uint256)"], provider);
        const raw = await usdc.balanceOf(address);
        const formatted = ethers.formatUnits(raw, 6);
        return res.json({ address, raw: raw.toString(), formatted, symbol: "USDC" });
      } catch (e) {
        logError("[nano-call] balance error", e);
        return res.status(500).json({ error: "balance lookup failed" });
      }
    }

    if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

    // Auth check — fail CLOSED. This endpoint spends BUYER_PRIVATE_KEY funds,
    // so an unauthenticated POST is a direct drain. Set NANO_API_KEY in env.
    if (!cfg.apiKey) {
      return res.status(503).json({ ok: false, error: "NANO_API_KEY not configured — endpoint disabled" });
    }
    {
      const provided = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      if (!provided || !safeEqual(provided, cfg.apiKey)) {
        return res.status(401).json({ ok: false, error: "Unauthorized — X-Api-Key required" });
      }
    }

    // Rate limit by IP
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    if (!(await checkRateLimit(ip, env, fetchImpl))) {
      return res.status(429).json({ ok: false, error: "Rate limit exceeded — max 5 calls per minute" });
    }

    // Validate required env
    if (!cfg.buyerKey) return res.status(503).json({ ok: false, error: "BUYER_PRIVATE_KEY not configured" });
    if (!cfg.seller)   return res.status(503).json({ ok: false, error: "SELLER_ADDRESS not configured" });
    // FIX: validate SELLER is a well-formed EVM address
    if (!/^0x[0-9a-fA-F]{40}$/.test(cfg.seller)) {
      return res.status(503).json({ ok: false, error: "SELLER_ADDRESS is not a valid EVM address" });
    }

    if (!rpcUrl) return res.status(503).json({ ok: false, error: "No RPC URL configured" });

    // Amount validation — only 0.001 USDC allowed (must be positive)
    const { amount } = req.body || {};
    const parsedAmount = parseFloat(amount);
    if (amount !== undefined && (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 0.001)) {
      return res.status(400).json({ ok: false, error: "Amount exceeds max 0.001 USDC" });
    }

    // ── Rail 1: Gateway Nanopayments ─────────────────────────────────────────
    // Preferred path: Circle's off-chain batching service handles sub-cent
    // transfers without on-chain gas per call. The batch is settled to Arc
    // Testnet periodically by the Gateway relayer.
    if (cfg.gatewayUrl) {
      // Invalid configuration is caught before fetch(), so it cannot have
      // reached payment submission. Do not silently spend on-chain instead.
      if (!isHttpUrl(cfg.gatewayUrl)) {
        console.error("[nano-call] GATEWAY_BATCH_URL is not a valid HTTP(S) URL");
        return res.status(503).json({
          ok: false,
          code: "GATEWAY_CONFIG_INVALID",
          error: "Gateway payment is not configured correctly",
        });
      }

      const headers = { "Content-Type": "application/json" };
      if (cfg.gatewayApiKey) headers["Authorization"] = `Bearer ${cfg.gatewayApiKey}`;

      let gatewayRes;
      try {
        // The timeout is an HTTP client bound, not a Gateway idempotency field.
        gatewayRes = await fetchImpl(cfg.gatewayUrl, {
          method: "POST",
          headers,
          signal: timeoutSignal(),
          body: JSON.stringify({
            to:     cfg.seller,
            amount: "1000",        // 0.001 USDC in 6-decimal units
            asset:  cfg.usdcAddress || CANONICAL_ARC_USDC,
            chain:  "arc-testnet",
            memo:   "callguard-nano",
          }),
        });
      } catch (gatewayErr) {
        // fetch() was invoked. The request may have reached the provider.
        // Never fall through to a second, independent payment.
        console.warn("[nano-call] Gateway outcome unknown:", gatewayErr?.name || "request failed", gatewayErr?.code || "");
        return pendingGateway(res);
      }

      if (!gatewayRes || gatewayRes.ok !== true) {
        // The installed integration does not document that any post-submission
        // HTTP error proves the payment was not accepted. Treat it as unknown.
        console.warn("[nano-call] Gateway returned an ambiguous status:", gatewayRes?.status ?? "none");
        const parsed = gatewayRes ? await readJsonBody(gatewayRes) : { payload: null };
        return pendingGateway(res, gatewayCorrelationId(parsed.payload));
      }

      const parsed = await readJsonBody(gatewayRes);
      if (!parsed.ok) {
        console.warn("[nano-call] Gateway success response was not valid JSON");
        return pendingGateway(res);
      }

      const evidence = gatewayEvidence(parsed.payload);
      if (!evidence.accepted) {
        console.warn("[nano-call] Gateway success response had no payment evidence");
        return pendingGateway(res, evidence.correlationId);
      }

      console.log("[nano-call] Gateway rail succeeded:", evidence.batchId || evidence.txHash);
      return res.json({
        ok: true,
        amount: "0.001",
        rail: "gateway",
        batchId: evidence.batchId,
        txHash: evidence.txHash,
      });
    }

    // ── Rail 2: Standard ERC-20 transfer ─────────────────────────────────────
    // Direct on-chain USDC.transfer(). Only reached when Gateway is not
    // configured. It requires BUYER_PRIVATE_KEY.
    try {
      if (!cfg.usdcAddress) return res.status(503).json({ ok: false, error: "USDC_ADDRESS not configured" });

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const buyer    = new ethers.Wallet(cfg.buyerKey, provider);
      const usdcAbi  = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
      ];

      const usdc = new ethers.Contract(cfg.usdcAddress, usdcAbi, buyer);
      const transferAmount = ethers.parseUnits("0.001", 6);

      // Balance check before sending.
      const bal = await usdc.balanceOf(buyer.address);
      if (bal < transferAmount) {
        return res.status(402).json({ ok: false, error: "Insufficient demo wallet balance" });
      }

      let tx;
      try {
        tx = await usdc.transfer(cfg.seller, transferAmount);
      } catch (e) {
        console.error("[nano-call] ERC-20 submission failed:", e.name || "error");
        return res.status(500).json({ ok: false, code: "TRANSFER_FAILED", error: "nano transfer failed" });
      }

      try {
        const receipt = await tx.wait();
        if (receipt?.status === 0) {
          return res.status(500).json({ ok: false, code: "TRANSFER_FAILED", error: "nano transfer reverted" });
        }
        if (receipt?.status !== 1) {
          return res.status(202).json({
            ok: false,
            pending: true,
            status: "pending",
            code: "TRANSFER_OUTCOME_UNKNOWN",
            error: "Transfer outcome is unknown. Do not retry until the transaction is verified.",
            rail: "erc20",
            txHash: tx.hash,
            correlationId: tx.hash,
            retryable: false,
          });
        }
      } catch (e) {
        // The transaction hash exists, so the payment may have landed even
        // though the receipt could not be read. Never retry automatically.
        console.error("[nano-call] ERC-20 receipt unknown:", e.name || "error");
        return res.status(202).json({
          ok: false,
          pending: true,
          status: "pending",
          code: "TRANSFER_OUTCOME_UNKNOWN",
          error: "Transfer outcome is unknown. Do not retry until the transaction is verified.",
          rail: "erc20",
          txHash: tx.hash,
          correlationId: tx.hash,
          retryable: false,
        });
      }

      return res.json({ ok: true, amount: "0.001", rail: "erc20", txHash: tx.hash });
    } catch (e) {
      console.error("[nano-call] ERC-20 rail error:", e.name || "error");
      return res.status(500).json({ ok: false, code: "TRANSFER_FAILED", error: "nano transfer failed" });
    }
  };
}

export default createNanoCallHandler();
