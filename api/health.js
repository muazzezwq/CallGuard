export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  res.status(200).json({
    ok: true,
    facilitator: "Vercel Functions",
    version: "1.0.0",
    ts: Date.now(),
    rpc: !!process.env.ARC_RPC_URL,
    signer: !!process.env.SELLER_PRIVATE_KEY,
    contract: process.env.VITE_PAY_PER_CALL || null
  });
}
