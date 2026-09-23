/**
 * GET /api/nano-balance?address=0x...
 * Returns USDC balance for the given address on Arc Testnet
 */

import { ethers } from "ethers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Arc Testnet USDC address from env (set VITE_USDC_ADDRESS in Vercel)
const USDC_ADDR =
  process.env.VITE_USDC_ADDRESS ||
  process.env.USDC_ADDRESS;

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

function getRpcUrl() {
  const base = process.env.RPC_PROXY_BASE_URL;
  const token = process.env.RPC_PROXY_TOKEN;
  const chains = (process.env.RPC_PROXY_CHAINS || "").split(",");
  if (base && chains.includes("Arc_Testnet")) {
    return `${base}/api/rpc/Arc_Testnet?_rpc_token=${token}`;
  }
  // Fallback to env-configured public RPC — no typed literal
  return (
    process.env.ARC_TESTNET_RPC_URL ||
    process.env.ARC_RPC_URL ||
    process.env.RPC_URL
  );
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();

  const address = req.query?.address;
  if (!address || !ethers.isAddress(address))
    return res.status(400).json({ error: "?address=0x... required" });

  const rpcUrl = getRpcUrl();
  if (!rpcUrl)
    return res.status(500).json({ error: "No RPC URL configured. Set ARC_RPC_URL or RPC_URL in env." });

  if (!USDC_ADDR)
    return res.status(500).json({ error: "No USDC address configured. Set VITE_USDC_ADDRESS in env." });

  try {
    const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
    const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, rpcProvider);
    const raw = await usdc.balanceOf(address);
    const formatted = ethers.formatUnits(raw, 6);
    return res.json({ address, raw: raw.toString(), formatted, symbol: "USDC" });
  } catch (e) {
    console.error("[nano-balance] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
