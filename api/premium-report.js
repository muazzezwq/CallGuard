import { makeFacilitator } from "../x402-facilitator/facilitator.js";

const env = process.env;
let fac;
try { fac = makeFacilitator(env); } catch(e) { fac = null; }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const amountAtomic = "1000";
  const payTo = env.FACILITATOR_ADDRESS || (fac ? fac.facilitatorAddress : "0x0");

  if (req.method === "GET") {
    return res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "USDC",
        network: "base",
        maxAmountRequired: amountAtomic,
        resource: "/api/premium-report",
        description: "Premium Analytics Report",
        payTo,
        maxTimeoutSeconds: 30,
        asset: "USDC",
        extra: { verifyingContract: env.USDC_ADDRESS }
      }]
    });
  }

  if (req.method === "POST") {
    try {
      const sig = req.headers["payment-signature"];
      if (!sig) return res.status(402).json({ error: "No payment signature" });

      const payment = JSON.parse(Buffer.from(sig, "base64").toString());
      const verify = await fac.verify(payment);      if (!verify.isValid) return res.status(402).json({ error: verify.reason });

      // CoinGecko'dan veri
      const cgRes = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana");
      let marketData = cgRes.ok ? await cgRes.json() : [];

      const toM = (id) => {
        const d = marketData.find(c => c.id === id);
        return d ? { price: d.current_price, marketCap: d.market_cap, volume24h: d.total_volume, priceChange24h: d.price_change_percentage_24h || 0 } : null;
      };

      const settle = await fac.settle(payment);

      const report = {
        generatedAt: new Date().toISOString(),
        requestedBy: payment.authorization.from,
        marketOverview: { bitcoin: toM("bitcoin"), ethereum: toM("ethereum"), solana: toM("solana") },
        txHash: settle.txHash
      };

      return res.json(report);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
