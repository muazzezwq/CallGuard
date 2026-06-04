export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const amountAtomic = "1000";
  const payTo = process.env.FACILITATOR_ADDRESS || "0x0e515aed287a7b3d2d9f7911321d99826653fbd8";

  if (req.method === "GET") {
    return res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "arc-testnet",
        maxAmountRequired: amountAtomic,
        resource: "/api/nano-service",
        description: "Nano service call",
        payTo,
        maxTimeoutSeconds: 120,
        asset: process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000",
        extra: { verifyingContract: process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000" }
      }]
    });
  }

  if (req.method === "POST") {
    try {
      const sig = req.headers["payment-signature"];
      if (!sig) return res.status(402).json({ error: "No payment signature" });

      // Mock settlement (gerçek settlement için facilitator.js gerekli)
      const payment = JSON.parse(Buffer.from(sig, "base64").toString());      const fakeTxHash = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
      
      console.log("[nano] Payment received from:", payment.authorization?.from);
      
      return res.json({ 
        ok: true, 
        payer: payment.authorization?.from || "unknown",
        tx: fakeTxHash,
        message: "Payment settled (mock)"
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
