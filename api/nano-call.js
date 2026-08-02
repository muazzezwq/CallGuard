import { ethers } from "ethers";

const RPC_URL = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const BUYER_KEY = process.env.BUYER_PRIVATE_KEY;
const SELLER = process.env.SELLER_ADDRESS;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "POST required" });

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const buyer = new ethers.Wallet(BUYER_KEY, provider);
    
    const usdcAbi = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address) view returns (uint256)"
    ];
    const usdc = new ethers.Contract(USDC, usdcAbi, buyer);
    
    const amount = ethers.parseUnits("0.001", 6);
    const tx = await usdc.transfer(SELLER, amount);
    await tx.wait();
    
    res.json({ ok: true, amount: "0.001", txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
