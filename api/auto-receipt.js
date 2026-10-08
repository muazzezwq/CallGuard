// api/auto-receipt.js
// Serverless function: receives call.opened webhook, auto-submits receipt on-chain
// Set PROVIDER_1_WEBHOOK=https://arcsla.vercel.app/api/auto-receipt in Vercel env

import { ethers } from "ethers";

// HIGH-08 fix: fallback chain for multiple RPC env var names
const RPC_URL = process.env.ARC_RPC_URL || process.env.ARC_TESTNET_RPC_URL || process.env.RPC_URL;
// LOW-02: prefer unprefixed env vars on the server side; VITE_* as fallback
const PAY_PER_CALL_ADDR = process.env.PAY_PER_CALL || process.env.VITE_PAY_PER_CALL;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || "5042002");

// Per-provider keys: PROVIDER_1_KEY, PROVIDER_2_KEY, ...
// Fallback: SELLER_PRIVATE_KEY (legacy, used when no per-provider key set)
function getProviderKey(providerId) {
  if (providerId) {
    const k = process.env[`PROVIDER_${providerId}_KEY`];
    if (k) return k;
  }
  return process.env.SELLER_PRIVATE_KEY || null;
}

if (!RPC_URL) console.warn("[auto-receipt] ARC_RPC_URL not set");
if (!PAY_PER_CALL_ADDR) console.warn("[auto-receipt] VITE_PAY_PER_CALL not set");

const ABI = [
  "function submitReceipt(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes sig) external",
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
  const contract = new ethers.Contract(PAY_PER_CALL_ADDR, ABI, wallet);

  const response = `pong:${payload || "ok"}:${Date.now()}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(response));
  const respondedAt = BigInt(Math.floor(Date.now() / 1000));

  const sig = await wallet.signTypedData(
    receiptDomain(CHAIN_ID, PAY_PER_CALL_ADDR),
    RECEIPT_TYPES,
    { callId, responseHash, respondedAt }
  );

  console.log(`[auto-receipt] attempt ${attempt} submitting for callId=${callId}`);

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
      console.warn(`[auto-receipt] retrying (${attempt}/${MAX_RETRIES}): ${msg}`);
      await new Promise(r => setTimeout(r, 1500 * attempt)); // backoff
      return autoSubmitReceipt({ callId, payload, providerId }, attempt + 1);
    }
    console.error(`[auto-receipt] failed after ${attempt} attempt(s):`, msg);
    return { ok: false, error: msg, attempts: attempt };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const _key = process.env.SELLER_PRIVATE_KEY;
    const addr = _key ? new ethers.Wallet(_key).address : "not configured";
    return res.json({ ok: true, service: "CallGuard auto-receipt", seller: addr });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { event, callId, payload, providerId } = req.body || {};

  if (event === "call.opened" && callId) {
    // Await the receipt submission BEFORE responding so Vercel keeps function alive
    const result = await autoSubmitReceipt({ callId, payload, providerId });
    return res.json({ received: true, callId, event, providerId, result });
  }

  return res.json({ received: true, callId, event });
}
