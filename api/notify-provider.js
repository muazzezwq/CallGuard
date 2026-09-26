// api/notify-provider.js — Serverless function
// When a call is opened, this endpoint notifies the provider's webhook URL
// with the call details so they can respond and submit a receipt automatically.

import { ethers } from "ethers";

// RPC via proxy when available, else env-configured public endpoint
const proxyChains = (process.env.RPC_PROXY_CHAINS || "").split(",");
const RPC_URL =
  process.env.RPC_PROXY_BASE_URL && proxyChains.includes("Arc_Testnet")
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : process.env.ARC_RPC_URL; // set in Vercel env — no literal fallback

const SERVICE_REGISTRY = process.env.VITE_SERVICE_REGISTRY;
const PAY_PER_CALL = process.env.VITE_PAY_PER_CALL;

const registryAbi = [
  "function getProvider(uint256 providerId) view returns (tuple(address owner,address signer,uint256 stake,uint256 pricePerCall,uint32 maxResponseTime,uint32 slashBps,bool active))",
];

const payPerCallAbi = [
  "function getCall(bytes32 callId) view returns (tuple(address caller,uint256 providerId,bytes32 requestHash,uint256 escrow,uint32 deadline,bool settled,bool slashed))",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RPC_URL) return res.status(500).json({ error: "ARC_RPC_URL not configured" });
  if (!SERVICE_REGISTRY) return res.status(500).json({ error: "VITE_SERVICE_REGISTRY not configured" });
  if (!PAY_PER_CALL) return res.status(500).json({ error: "VITE_PAY_PER_CALL not configured" });

  try {
    const { callId, providerId, requestHash, payload, caller } = req.body;
    if (!callId || !providerId) {
      return res.status(400).json({ error: "callId and providerId required" });
    }

    const rpc = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(SERVICE_REGISTRY, registryAbi, rpc);
    const payPerCall = new ethers.Contract(PAY_PER_CALL, payPerCallAbi, rpc);

    // Fetch provider info
    let providerInfo;
    try {
      providerInfo = await registry.getProvider(providerId);
    } catch (e) {
      return res.status(404).json({ error: "Provider not found", detail: e.message });
    }

    if (!providerInfo.active) {
      return res.status(400).json({ error: "Provider is not active" });
    }

    // Fetch call details
    let callDeadline = Math.floor(Date.now() / 1000) + Number(providerInfo.maxResponseTime);
    let callCaller = caller || "";
    try {
      const callInfo = await payPerCall.getCall(callId);
      callDeadline = Number(callInfo.deadline);
      callCaller = callInfo.caller || caller || "";
    } catch (_) {
      // Call may not be indexed yet — use estimated deadline
    }

    // Webhook URL: PROVIDER_{id}_WEBHOOK env var (set in Vercel per provider)
    const webhookEnvKey = `PROVIDER_${providerId}_WEBHOOK`;
    const webhookUrl = process.env[webhookEnvKey];

    if (!webhookUrl) {
      return res.status(200).json({
        notified: false,
        reason: "No webhook URL configured for this provider",
        providerId,
        callId,
        hint: `Add env var ${webhookEnvKey}=https://your-provider.com/callguard-hook in Vercel`,
      });
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
      maxResponseTime: providerInfo.maxResponseTime?.toString() || "",
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
      return res.status(200).json({
        notified: false,
        reason: `Webhook delivery failed: ${e.message}`,
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
    console.error("[notify-provider] error:", e);
    return res.status(500).json({ error: e.message });
  }
}
