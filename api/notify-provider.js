// api/notify-provider.js — Serverless function
// When a call is opened, this endpoint notifies the provider's webhook URL
// with the call details so they can respond and submit a receipt automatically.

import { ethers } from "ethers";
import { ACTIVE, V8_ACTIVE } from "./_contracts.js";
import { timingSafeEqual, createHash } from "node:crypto";
import { getRpcUrl } from "./_rpc.js";
import { errorSummary, logError } from "./_redact.js";

// Constant-time secret comparison (hash first so lengths always match).
function secretEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// One resolver for every documented public RPC alias and the optional proxy.
const RPC_URL = getRpcUrl();

const SERVICE_REGISTRY = ACTIVE.SERVICE_REGISTRY;
const PAY_PER_CALL = ACTIVE.PAY_PER_CALL;

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

// FIXED: ABI must match the actual ServiceRegistry.ProviderView (9 fields)
// including maxConcurrentCalls and zkTier, and PayPerCall.Call struct.
const registryAbi = V8_ACTIVE
  ? [
      "function getProvider(uint256 providerId) view returns (tuple(address owner,address signer,uint256 stake,uint256 pricePerCall,uint32 latestTermsVersion,bool active,uint32 pendingCalls,uint64 completedCalls,uint64 slashedCalls,uint32 maxConcurrentCalls,uint8 zkTier))",
      "function getTerms(uint256 providerId, uint32 version) view returns (tuple(uint32 version,uint32 maxResponseTime,uint16 slashBps,uint16 availabilityTargetBps,bytes32 termsHash,string termsUri,uint64 effectiveAt,bool active))",
    ]
  : [
      "function getProvider(uint256 providerId) view returns (tuple(address owner,address signer,uint256 stake,uint256 pricePerCall,uint32 maxResponseTime,uint32 slashBps,bool active,uint32 maxConcurrentCalls,uint8 zkTier))",
    ];

const payPerCallAbi = V8_ACTIVE
  ? [
      "function getCall(bytes32 callId) view returns (tuple(uint256 providerId,address caller,uint256 amount,uint32 startedAt,uint32 deadline,uint32 completedAt,uint32 termsVersion,bytes32 termsHash,bytes32 requestHash,bytes32 responseHash,uint8 status))",
    ]
  : [
      "function getCall(bytes32 callId) view returns (tuple(uint256 providerId,address caller,uint256 amount,uint32 startedAt,uint32 deadline,bytes32 requestHash,bytes32 responseHash,uint8 status))",
    ];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Webhook auth — fail closed. Without a configured secret this endpoint
  // could be used to drain gas via the auto-receipt fallback, so refuse.
  const WEBHOOK_SECRET = process.env.PROVIDER_WEBHOOK_SECRET || process.env.AUTO_RECEIPT_SECRET || "";
  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ error: "webhook authentication not configured" });
  }
  const got = req.headers["x-webhook-secret"] || "";
  if (!secretEquals(got, WEBHOOK_SECRET)) return res.status(401).json({ error: "unauthorized webhook" });

  if (!RPC_URL) return res.status(500).json({ error: "RPC URL not configured" });
  if (!SERVICE_REGISTRY) return res.status(500).json({ error: "SERVICE_REGISTRY not configured" });
  if (!PAY_PER_CALL) return res.status(500).json({ error: "PAY_PER_CALL not configured" });

  try {
    const { callId, providerId: rawProviderId, requestHash, payload, caller } = req.body || {};
    if (typeof callId !== "string" || !BYTES32_RE.test(callId)) {
      return res.status(400).json({ error: "invalid callId" });
    }
    const providerId = normalizeProviderId(rawProviderId);
    if (providerId === null) {
      return res.status(400).json({ error: "invalid providerId" });
    }
    if (requestHash != null && (typeof requestHash !== "string" || !BYTES32_RE.test(requestHash))) {
      return res.status(400).json({ error: "invalid requestHash" });
    }
    if (caller != null && (typeof caller !== "string" || !ADDRESS_RE.test(caller))) {
      return res.status(400).json({ error: "invalid caller" });
    }

    const rpc = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(SERVICE_REGISTRY, registryAbi, rpc);
    const payPerCall = new ethers.Contract(PAY_PER_CALL, payPerCallAbi, rpc);

    // Fetch provider info
    let providerInfo;
    try {
      providerInfo = await registry.getProvider(providerId);
    } catch (e) {
      logError("[notify-provider] getProvider failed", e);
      return res.status(404).json({ error: "Provider not found" });
    }

    if (!providerInfo.active) {
      return res.status(400).json({ error: "Provider is not active" });
    }

    // Fetch call details
    let responseWindow = 0;
    if (V8_ACTIVE) {
      try {
        const terms = await registry.getTerms(providerId, providerInfo.latestTermsVersion);
        responseWindow = Number(terms.maxResponseTime);
      } catch { /* fall back to the call deadline below */ }
    } else {
      responseWindow = Number(providerInfo.maxResponseTime);
    }
    let callDeadline = Math.floor(Date.now() / 1000) + responseWindow;
    let callCaller = caller || "";
    let termsVersion = V8_ACTIVE ? Number(providerInfo.latestTermsVersion) : 0;
    try {
      const callInfo = await payPerCall.getCall(callId);
      callDeadline = Number(callInfo.deadline);
      callCaller = callInfo.caller || caller || "";
      if (V8_ACTIVE) termsVersion = Number(callInfo.termsVersion);
    } catch (_) {
      // Call may not be indexed yet — use estimated deadline
    }

    // Webhook URL: PROVIDER_{id}_WEBHOOK env var (set in Vercel per provider)
    const webhookEnvKey = `PROVIDER_${providerId}_WEBHOOK`;
    const webhookUrl = process.env[webhookEnvKey];

    if (!webhookUrl) {
      // Fallback: auto-receipt endpoint — kendi signer varsa direkt submit et
      const selfBase = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://arcsla.vercel.app";
      const autoReceiptUrl = `${selfBase}/api/auto-receipt`;
      try {
        const r = await fetch(autoReceiptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Forward the webhook secret so the auto-receipt leg passes its own check.
            ...(WEBHOOK_SECRET ? { "x-webhook-secret": WEBHOOK_SECRET } : {}),
          },
          body: JSON.stringify({ event: "call.opened", callId, payload: payload || "", providerId }),
        });
        const d = await r.json().catch(() => ({}));
        return res.status(200).json({
          notified: true,
          via: "auto-receipt-fallback",
          callId,
          providerId,
          result: d,
        });
      } catch (e) {
        logError("[notify-provider] auto-receipt fallback failed", e);
        return res.status(200).json({
          notified: false,
          reason: "No webhook + auto-receipt failed",
          callId,
          hint: `Add env var ${webhookEnvKey} or PROVIDER_${providerId}_KEY in Vercel`,
        });
      }
    }

    // Build notification payload
    const notifyPayload = {
      event: "call.opened",
      callId,
      providerId,
      requestHash,
      payload: payload || "",
      caller: callCaller,
      deadline: callDeadline,
      pricePerCall: providerInfo.pricePerCall?.toString() || "",
      maxResponseTime: String(responseWindow || ""),
      ...(V8_ACTIVE ? { termsVersion } : {}),
      contractAddress: PAY_PER_CALL,
      network: "arc-testnet",
      chainId: "5042002",
      timestamp: Date.now(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let webhookResponse;
    try {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CallGuard-Event": "call.opened",
          "X-CallGuard-CallId": callId,
        },
        body: JSON.stringify(notifyPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      webhookResponse = { status: r.status, ok: r.ok };
    } catch (e) {
      clearTimeout(timeout);
      logError("[notify-provider] webhook delivery failed", e);
      return res.status(200).json({
        notified: false,
        reason: "Webhook delivery failed",
        callId,
        providerId,
      });
    }

    return res.status(200).json({
      notified: true,
      webhookStatus: webhookResponse.status,
      callId,
      providerId,
    });
  } catch (e) {
    logError("[notify-provider] error", e);
    return res.status(500).json({ error: "notify failed" });
  }
}

// ── Email helper (same endpoint, POST with type=email) ──────────────────────
async function sendEmail(email, type, data) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { sent: false, reason: 'not_configured' };
  const subjects = {
    welcome: '🛡 Welcome to CallGuard — Your provider is live',
    slash:   '⚠️ CallGuard — Your stake was slashed',
    receipt: '✅ CallGuard — Receipt submitted',
    timeout: '⏱ CallGuard — SLA deadline approaching'
  };
  const bodies = {
    welcome: `<h2>Provider #${data.providerId||'?'} is now live</h2><p>Price: ${data.price||'?'} USDC/call · SLA: ${data.slaWindow||'?'}s · Stake: ${data.stake||'?'} USDC</p><p><a href="https://arcsla.vercel.app/">Open dashboard →</a></p>`,
    slash:   `<h2>Slash notification</h2><p>Call <code>${data.callId||'?'}</code> — slashed ${data.amount||'?'} USDC</p><p><a href="https://arcsla.vercel.app/">View dashboard →</a></p>`,
    receipt: `<h2>Receipt confirmed</h2><p>Call <code>${data.callId||'?'}</code> — ${data.amount||'?'} USDC released</p>`,
    timeout: `<h2>SLA window closing</h2><p>Call <code>${data.callId||'?'}</code> — ${data.remaining||'?'}s remaining. <a href="https://arcsla.vercel.app/">Submit receipt →</a></p>`
  };
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{'Authorization':`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({ from:'CallGuard <noreply@arcsla.vercel.app>', to:[email], subject: subjects[type]||subjects.welcome, html: bodies[type]||bodies.welcome })
  });
  const result = await r.json();
  return r.ok ? { sent:true, id:result.id } : { sent:false, error:result.message };
}
export { sendEmail };

