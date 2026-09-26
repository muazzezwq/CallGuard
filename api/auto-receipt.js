// api/auto-receipt.js
// Serverless function: receives call.opened webhook, auto-submits receipt on-chain
// Set PROVIDER_1_WEBHOOK=https://arcsla.vercel.app/api/auto-receipt in Vercel env

import { ethers } from "ethers";

const RPC_URL = process.env.ARC_RPC_URL;
const SELLER_PRIVATE_KEY = process.env.SELLER_PRIVATE_KEY;
const PAY_PER_CALL_ADDR = process.env.VITE_PAY_PER_CALL;
const CHAIN_ID = parseInt(process.env.VITE_CHAIN_ID || "5042002");

if (!RPC_URL) console.warn("[auto-receipt] ARC_RPC_URL not set");
if (!PAY_PER_CALL_ADDR) console.warn("[auto-receipt] VITE_PAY_PER_CALL not set");

const ABI = [
  "function submitReceipt(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes sig) external",
];

function receiptDomain(chainId, verifyingContract) {
  return { name: "CallGuard", version: "2", chainId, verifyingContract };
}

const RECEIPT_TYPES = {
  Receipt: [
    { name: "callId", type: "bytes32" },
    { name: "responseHash", type: "bytes32" },
    { name: "respondedAt", type: "uint64" },
  ],
};

async function autoSubmitReceipt({ callId, payload }) {
  if (!SELLER_PRIVATE_KEY || !RPC_URL || !PAY_PER_CALL_ADDR) {
    return { ok: false, error: "missing env vars" };
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(SELLER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(PAY_PER_CALL_ADDR, ABI, wallet);

  const response = `pong:${payload || "ok"}:${Date.now()}`;
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(response));
  const respondedAt = BigInt(Math.floor(Date.now() / 1000));

  const sig = await wallet.signTypedData(
    receiptDomain(CHAIN_ID, PAY_PER_CALL_ADDR),
    RECEIPT_TYPES,
    { callId, responseHash, respondedAt }
  );

  console.log(`[auto-receipt] submitting for callId=${callId}`);

  try {
    const tx = await contract.submitReceipt(callId, responseHash, respondedAt, sig, { gasLimit: 200000 });
    await tx.wait();
    console.log(`[auto-receipt] tx=${tx.hash}`);
    return { ok: true, txHash: tx.hash };
  } catch (err) {
    console.error("[auto-receipt] failed:", err.message);
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const addr = SELLER_PRIVATE_KEY
      ? new ethers.Wallet(SELLER_PRIVATE_KEY).address
      : "not configured";
    return res.json({ ok: true, service: "CallGuard auto-receipt", seller: addr });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { event, callId, payload } = req.body || {};
  res.json({ received: true, callId, event });

  if (event === "call.opened" && callId) {
    autoSubmitReceipt({ callId, payload }).then(r =>
      console.log("[auto-receipt] result:", JSON.stringify(r))
    );
  }
}
