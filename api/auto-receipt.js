// api/auto-receipt.js
// Serverless function: receives call.opened webhook, auto-submits receipt on-chain
// Set PROVIDER_1_WEBHOOK=https://arcsla.vercel.app/api/auto-receipt in Vercel env

import { ethers } from "ethers";
import { V7 } from "./_contracts.js";
import { timingSafeEqual, createHash } from "node:crypto";
import { getRpcUrl } from "./_rpc.js";
import { errorSummary, logError, safeLogValue } from "./_redact.js";

// Constant-time secret comparison (hash first so lengths always match).
function secretEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// One resolver for every documented public RPC alias and the optional proxy.
const RPC_URL = getRpcUrl();
const PAY_PER_CALL_ADDR = V7.PAY_PER_CALL;
const SERVICE_REGISTRY = V7.SERVICE_REGISTRY;
const CHAIN_ID = V7.CHAIN_ID;

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

function normalizeProviderId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!DECIMAL_RE.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? String(parsed) : null;
}

function normalizeAtomicAmount(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === "string" && DECIMAL_RE.test(value)) return value;
  return null;
}

// Per-provider keys: PROVIDER_1_KEY, PROVIDER_2_KEY, ...
// No seller fallback: an auto-receipt must be signed by the provider's
// registered signer, or it is not submitted.
function getProviderKey(providerId) {
  if (!providerId) return null;
  return process.env[`PROVIDER_${providerId}_KEY`] || null;
}

if (!RPC_URL) console.warn("[auto-receipt] ARC_RPC_URL not set");
if (!PAY_PER_CALL_ADDR) console.warn("[auto-receipt] canonical PayPerCall address missing");

const ABI = [
  "function submitReceipt(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes sig) external",
];

const REGISTRY_ABI = [
  "function getProvider(uint256 providerId) view returns (address owner, address signer, uint256 stake, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, bool active, uint32 maxConcurrentCalls, uint8 zkTier)",
];

// MEDIUM-07: domain name/version must match PayPerCall constructor EIP712("ArcSLA","1")
function receiptDomain(chainId, verifyingContract) {
  return { name: "ArcSLA", version: "1", chainId, verifyingContract };
}

const RECEIPT_TYPES = {
  Receipt: [
    { name: "callId", type: "bytes32" },
    { name: "responseHash", type: "bytes32" },
    { name: "respondedAt", type: "uint64" },
  ],
};

// Vercel max function duration: 25s (Hobby) / 60s (Pro)
// Arc Testnet block time ~2s, tx.wait() typically 3-8s, occasionally up to 15s
const TX_WAIT_TIMEOUT_MS = 22000; // 22s — safe margin under 25s limit
const MAX_RETRIES = 2;

async function waitWithTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function autoSubmitReceipt({ callId, payload, providerId }, attempt = 1) {
  const privateKey = getProviderKey(providerId);
  if (!privateKey || !RPC_URL || !PAY_PER_CALL_ADDR) {
    return { ok: false, error: `missing env vars (key for provider ${providerId || "?"}: ${!!privateKey}, rpc: ${!!RPC_URL}, contract: ${!!PAY_PER_CALL_ADDR})` };
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);

  const registry = new ethers.Contract(SERVICE_REGISTRY, REGISTRY_ABI, provider);
  let providerInfo;
  try {
    providerInfo = await registry.getProvider(providerId);
  } catch (err) {
    console.error("[auto-receipt] provider lookup failed:", errorSummary(err));
    return { ok: false, error: "provider signer lookup failed" };
  }
  if (!providerInfo?.active) {
    return { ok: false, error: `provider ${providerId} is not active` };
  }
  const registeredSigner = String(providerInfo.signer || "");
  if (registeredSigner.toLowerCase() !== wallet.address.toLowerCase()) {
    return { ok: false, error: `provider ${providerId} signer mismatch` };
  }

  const contract = new ethers.Contract(PAY_PER_CALL_ADDR, ABI, wallet);

  const response = `pong:${payload || "ok"}:${Date.now()}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(response));
  const respondedAt = BigInt(Math.floor(Date.now() / 1000));

  const sig = await wallet.signTypedData(
    receiptDomain(CHAIN_ID, PAY_PER_CALL_ADDR),
    RECEIPT_TYPES,
    { callId, responseHash, respondedAt }
  );

  console.log(`[auto-receipt] attempt ${attempt} submitting for callId=${safeLogValue(callId, 80)}`);

  try {
    const tx = await contract.submitReceipt(callId, responseHash, respondedAt, sig, { gasLimit: 200000 });
    // Wait with timeout — prevents Vercel from killing before confirmation
    const receipt = await waitWithTimeout(tx.wait(), TX_WAIT_TIMEOUT_MS);
    console.log(`[auto-receipt] confirmed tx=${tx.hash} block=${receipt?.blockNumber}`);
    return { ok: true, txHash: tx.hash, block: receipt?.blockNumber };
  } catch (err) {
    const msg = err.message || "";
    // Retry on timeout or transient RPC errors, not on contract reverts
    const isRetryable = msg.includes("timeout") || msg.includes("network") || msg.includes("ECONNRESET");
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(`[auto-receipt] retrying (${attempt}/${MAX_RETRIES}):`, errorSummary(err));
      await new Promise(r => setTimeout(r, 1500 * attempt)); // backoff
      return autoSubmitReceipt({ callId, payload, providerId }, attempt + 1);
    }
    console.error(`[auto-receipt] failed after ${attempt} attempt(s):`, errorSummary(err));
    return { ok: false, error: "receipt submission failed", attempts: attempt };
  }
}

// ---------------------------------------------------------------------------
// Circle Refund Protocol — initiated when DisputeQuality emits
// CircleRefundInitiated(disputeId, callId, caller, amount).
// The relayer (Vercel webhook or off-chain indexer) calls POST /api/auto-receipt
// with event="circle.refund.initiate" to trigger the Circle Refund API.
// ---------------------------------------------------------------------------
const CIRCLE_REFUND_API = "https://api.circle.com/v2/transfers/refunds";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || "";

// Format 6-decimal USDC atomic units as a decimal string without float loss.
function formatUsdc6(amount) {
  const v = BigInt(amount || 0);
  const whole = v / 1000000n;
  const frac = (v % 1000000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

async function initiateCircleRefund({ disputeId, callId, caller, amount }) {
  if (!CIRCLE_API_KEY) {
    console.warn("[auto-receipt] CIRCLE_API_KEY not set — skipping Circle Refund API call");
    return { ok: false, error: "CIRCLE_API_KEY not configured" };
  }

  // Circle Refund Protocol payload (Circle Transfers API v2 spec).
  // amount is in USDC 6-decimal units; format via BigInt to avoid float precision loss.
  const body = {
    idempotencyKey: `callguard-refund-${callId}-${disputeId}`,
    source: { type: "blockchain", callId, disputeId },
    destination: { type: "blockchain", address: caller, chain: "ARC-TESTNET" },
    amount: { amount: formatUsdc6(amount), currency: "USD" },
    metadata: { reason: "DisputeQuality:CallerWins", callId, disputeId },
  };

  try {
    const resp = await fetch(CIRCLE_REFUND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    console.log(`[auto-receipt] Circle Refund API status: ${resp.status}`);
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    logError("[auto-receipt] Circle Refund API error", err);
    return { ok: false, error: "refund relay failed" };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    let addr = "not configured";
    if (process.env.SELLER_PRIVATE_KEY) {
      try {
        addr = new ethers.Wallet(process.env.SELLER_PRIVATE_KEY).address;
      } catch {
        addr = "not available";
      }
    }
    return res.json({
      ok: true,
      service: "CallGuard auto-receipt",
      seller: addr,
      circleRefundEnabled: !!CIRCLE_API_KEY,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  // Webhook auth — fail closed. Set PROVIDER_WEBHOOK_SECRET (or
  // AUTO_RECEIPT_SECRET) in Vercel env and configure the provider backend to
  // send it as x-webhook-secret. Without a configured secret, this endpoint
  // would let anyone trigger gas-spending receipt submissions, so we refuse.
  const WEBHOOK_SECRET = process.env.PROVIDER_WEBHOOK_SECRET || process.env.AUTO_RECEIPT_SECRET || "";
  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ error: "webhook authentication not configured" });
  }
  const got = req.headers["x-webhook-secret"] || "";
  if (!secretEquals(got, WEBHOOK_SECRET)) return res.status(401).json({ error: "unauthorized webhook" });

  const { event, callId, payload, providerId, disputeId, caller, amount } = req.body || {};

  try {
    // ERC-8004 / Circle Refund Protocol: dispute resolved CallerWins.
    // Financial action — requires webhook secret to be configured AND valid.
    if (event === "circle.refund.initiate") {
      if (typeof callId !== "string" || !BYTES32_RE.test(callId)) {
        return res.status(400).json({ error: "invalid callId" });
      }
      if (typeof caller !== "string" || !ADDRESS_RE.test(caller)) {
        return res.status(400).json({ error: "invalid caller" });
      }
      if (disputeId != null && (typeof disputeId !== "string" || disputeId.length > 128)) {
        return res.status(400).json({ error: "invalid disputeId" });
      }
      const atomicAmount = normalizeAtomicAmount(amount);
      if (atomicAmount === null) return res.status(400).json({ error: "invalid amount" });

      const result = await initiateCircleRefund({ disputeId, callId, caller, amount: atomicAmount });
      // Never log the full upstream response (may contain sensitive metadata).
      return res.json({ received: true, event, callId, disputeId, result: { ok: result.ok, status: result.status } });
    }

    if (event === "call.opened") {
      if (typeof callId !== "string" || !BYTES32_RE.test(callId)) {
        return res.status(400).json({ error: "invalid callId" });
      }
      let normalizedProviderId;
      if (providerId != null) {
        normalizedProviderId = normalizeProviderId(providerId);
        if (normalizedProviderId === null) return res.status(400).json({ error: "invalid providerId" });
      }

      // Await the receipt submission BEFORE responding so Vercel keeps function alive
      const result = await autoSubmitReceipt({ callId, payload, providerId: normalizedProviderId });
      return res.json({ received: true, callId, event, providerId: normalizedProviderId, result });
    }

    return res.json({ received: true, callId, event });
  } catch (err) {
    logError("[auto-receipt] webhook processing failed", err);
    return res.status(500).json({ error: "webhook processing failed" });
  }
}
