import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// Eski endpoint'leri sil (nano/service ve api/premium/report)
s = s.replace(/\/\/ =+\n\/\/ 💰 NANOPAYMENT ENDPOINT[\s\S]*?(?=\/\/ =+|$)/g, '');
s = s.replace(/\/\/ =+\n\/\/ 📊 PREMIUM ANALYTICS API[\s\S]*?(?=\/\/ =+|$)/g, '');

// Yeni endpoint'leri ekle
const newEndpoints = `
// ============================================
// 💰 NANOPAYMENT ENDPOINT
// ============================================
app.get("/nano/service", async (req, res) => {
  try {
    const amountAtomic = "1000";
    const payTo = env.FACILITATOR_ADDRESS || fac.facilitatorAddress;
    res.status(402).json({
      status: 402, error: "Payment Required",
      accepts: [{ scheme: "USDC", network: "base", maxAmountRequired: amountAtomic,
        resource: "/nano/service", description: "Nano service call", payTo,
        maxTimeoutSeconds: 30, asset: "USDC", extra: { verifyingContract: env.USDC_ADDRESS } }]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/nano/service", async (req, res) => {
  try {
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) return res.status(402).json({ error: "No payment signature" });
    const payment = JSON.parse(atob(paymentSig));
    const verifyResult = await fac.verify(payment);
    if (!verifyResult.isValid) return res.status(402).json({ error: "Invalid payment", reason: verifyResult.reason });
    const settleResult = await fac.settle(payment);
    console.log(\`[nano] Payment settled: 0.001 USDC from \${payment.authorization.from}\`);
    res.json({ ok: true, data: "pong", payer: payment.authorization.from, tx: settleResult.txHash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// 📊 PREMIUM ANALYTICS API
// ============================================
app.get("/api/premium/report", async (req, res) => {
  try {
    const amountAtomic = "1000";
    const payTo = env.FACILITATOR_ADDRESS || fac.facilitatorAddress;
    res.status(402).json({      status: 402, error: "Payment Required",
      accepts: [{ scheme: "USDC", network: "base", maxAmountRequired: amountAtomic,
        resource: "/api/premium/report", description: "Premium Analytics Report", payTo,
        maxTimeoutSeconds: 30, asset: "USDC", extra: { verifyingContract: env.USDC_ADDRESS } }]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/premium/report", async (req, res) => {
  try {
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) return res.status(402).json({ error: "No payment signature" });
    const payment = JSON.parse(atob(paymentSig));
    const verifyResult = await fac.verify(payment);
    if (!verifyResult.isValid) return res.status(402).json({ error: "Invalid payment", reason: verifyResult.reason });

    console.log("[premium] Fetching CoinGecko data...");
    const coingeckoRes = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana");
    let marketData = coingeckoRes.ok ? await coingeckoRes.json() : [];

    const toMarketObj = (id) => {
      const d = marketData.find(c => c.id === id);
      if (!d) return null;
      return { price: d.current_price, marketCap: d.market_cap, volume24h: d.total_volume, priceChange24h: d.price_change_percentage_24h || 0 };
    };

    const settleResult = await fac.settle(payment);
    const report = {
      generatedAt: new Date().toISOString(),
      requestedBy: payment.authorization.from,
      dataSource: "CoinGecko API",
      marketOverview: { bitcoin: toMarketObj("bitcoin"), ethereum: toMarketObj("ethereum"), solana: toMarketObj("solana") },
      txHash: settleResult.txHash
    };

    console.log(\`[premium] Report for \${payment.authorization.from} — TX: \${settleResult.txHash}\`);
    res.json(report);
  } catch (e) { console.error("[premium] Error:", e.message); res.status(500).json({ error: e.message }); }
});
`;

s = s.trim() + '\n\n' + newEndpoints;
writeFileSync("server.js", s);
console.log("✅ Endpoint'ler temizlendi ve yeniden yazıldı");
