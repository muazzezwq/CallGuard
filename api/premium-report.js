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
        resource: "/api/premium-report",
        description: "Premium Analytics Report",
        payTo,
        maxTimeoutSeconds: 120,
        asset: process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000",
        extra: { verifyingContract: process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000" }
      }]
    });
  }

  if (req.method === "POST") {
    try {
      const sig = req.headers["payment-signature"];      if (!sig) return res.status(402).json({ error: "No payment signature" });

      const payment = JSON.parse(Buffer.from(sig, "base64").toString());
      
      // CoinGecko'dan veri al
      console.log("[premium] Fetching CoinGecko data...");
      const cgRes = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana");
      let marketData = cgRes.ok ? await cgRes.json() : [];

      const toM = (id) => {
        const d = marketData.find(c => c.id === id);
        return d ? { 
          price: d.current_price, 
          marketCap: d.market_cap, 
          volume24h: d.total_volume, 
          priceChange24h: d.price_change_percentage_24h || 0 
        } : null;
      };

      const fakeTxHash = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");

      const report = {
        generatedAt: new Date().toISOString(),
        requestedBy: payment.authorization?.from || "unknown",
        dataSource: "CoinGecko API",
        marketOverview: { 
          bitcoin: toM("bitcoin"), 
          ethereum: toM("ethereum"), 
          solana: toM("solana") 
        },
        txHash: fakeTxHash
      };

      console.log("[premium] Report generated for:", payment.authorization?.from);
      return res.json(report);
    } catch(e) {
      console.error("[premium] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
