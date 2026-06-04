import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { makeFacilitator } from "./facilitator.js";

dotenv.config();
const env = process.env;
const app = express();
app.use(cors());
app.use(express.json());

const fac = makeFacilitator(env);
console.log("Facilitator cuzdani:", fac.facilitatorAddress);

// Bu ornek "korunan kaynak" — gercekte ArcSLA provider endpoint'i olur
const PRICE = "1000000"; // 1 USDC (6 ondalik)
const PAY_TO = fac.facilitatorAddress; // demo: facilitator kendine alir

function paymentRequirements() {
  return {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: PRICE,
    asset: env.USDC_ADDRESS,
    payTo: PAY_TO,
    resource: "/api/service",
    description: "ArcSLA korumali servis cagrisi",
    maxTimeoutSeconds: 120,
  };
}

// ---- Korunan kaynak: X-PAYMENT yoksa 402 doner ----
app.get("/api/service", async (req, res) => {
  const header = req.headers["x-payment"];
  if (!header) {
    return res.status(402).json({
      x402Version: 1,
      accepts: [paymentRequirements()],
      error: "Payment Required",
    });
  }
  try {
    const payment = JSON.parse(Buffer.from(header, "base64").toString());
    const v = await fac.verify(payment, paymentRequirements());
    if (!v.isValid) return res.status(402).json({ error: v.reason });

    const s = await fac.settle(payment);
    res.setHeader("X-PAYMENT-RESPONSE",
      Buffer.from(JSON.stringify(s)).toString("base64"));
    return res.json({ ok: true, data: "pong", payment: s });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Facilitator API (baska servisler de kullanabilir) ----
app.post("/verify", async (req, res) => {
  try {
    res.json(await fac.verify(req.body.payment, req.body.requirements));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/settle", async (req, res) => {
  try {
    res.json(await fac.settle(req.body.payment));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- /callService : facilitator tx'i gonderir, kullanici gas odemez ----
app.post("/callService", async (req, res) => {
  try {
    const { providerId, requestHash, from, validAfter, validBefore, authNonce, v, r, s: sig } = req.body;
    if (!providerId || !requestHash || !from || !v || !r || !sig) {
      return res.status(400).json({ error: "Eksik parametre" });
    }
    const result = await fac.callService({
      providerId: BigInt(providerId),
      requestHash,
      from,
      validAfter: Number(validAfter),
      validBefore: Number(validBefore),
      authNonce,
      v: Number(v),
      r,
      s: sig,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (_, res) => res.json({
  service: "ArcSLA x402 facilitator",
  status: "live",
  network: "arc-testnet",
  endpoints: ["/health", "/api/service", "/verify", "/settle", "/callService"],
}));

app.get("/health", (_, res) =>
  res.json({ ok: true, facilitator: fac.facilitatorAddress }));

app.listen(env.PORT || 4021, () =>
  console.log(`x402 facilitator :${env.PORT || 4021}`));

// ============================================
app.get("/nano/service", async (req, res) => {
  try {
    const amountAtomic = "1000"; // 0.001 USDC in atomic
    const payTo = env.FACILITATOR_ADDRESS || fac.facilitatorAddress;
    
    res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "USDC",
        network: "base",
        maxAmountRequired: amountAtomic,
        resource: "/nano/service",
        description: "Nano service call",
        payTo: payTo,
        maxTimeoutSeconds: 30,
        asset: "USDC",
        extra: { verifyingContract: env.USDC_ADDRESS }
      }]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/nano/service", async (req, res) => {
  try {
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) {
      return res.status(402).json({ error: "No payment signature" });
    }
    
    const payment = JSON.parse(atob(paymentSig));
    const verifyResult = await fac.verify(payment);
    if (!verifyResult.isValid) {
      return res.status(402).json({ error: "Invalid payment", reason: verifyResult.reason });
    }
    
    const settleResult = await fac.settle(payment);
    const payer = payment.authorization.from;
    
    console.log(`[nano] Payment settled: 0.001 USDC from ${payer}`);
        res.json({
      ok: true,
      data: "pong",
      payer,
      tx: settleResult.txHash
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
app.get("/api/premium/report", async (req, res) => {
  try {
    const amountAtomic = "1000";
    const payTo = env.FACILITATOR_ADDRESS || fac.facilitatorAddress;
    
    res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "USDC",
        network: "base",
        maxAmountRequired: amountAtomic,
        resource: "/api/premium/report",
        description: "Premium Analytics Report",
        payTo: payTo,
        maxTimeoutSeconds: 30,
        asset: "USDC",
        extra: { verifyingContract: env.USDC_ADDRESS }
      }]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/premium/report", async (req, res) => {
  try {
    const paymentSig = req.headers["payment-signature"];
    if (!paymentSig) {
      return res.status(402).json({ error: "No payment signature" });
    }
    
    const payment = JSON.parse(atob(paymentSig));
    const verifyResult = await fac.verify(payment);
    if (!verifyResult.isValid) {
      return res.status(402).json({ error: "Invalid payment", reason: verifyResult.reason });    }
    
    // CoinGecko'dan veri al
    console.log("[premium] CoinGecko API çağrısı başlıyor...");
    const coingeckoRes = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,usd-coin"
    );
    console.log("[premium] CoinGecko response status:", coingeckoRes.status);
    
    let marketData = [];
    if (coingeckoRes.ok) {
      marketData = await coingeckoRes.json();
    }
    
    // BTC ATH
    const btcRes = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false");
    let btcATH = null, btcATHDate = null;
    if (btcRes.ok) {
      const btcData = await btcRes.json();
      btcATH = btcData.market_data?.ath?.usd;
      btcATHDate = btcData.market_data?.ath_date?.usd;
    }
    
    const toMarketObj = (id) => {
      const d = marketData.find(c => c.id === id);
      if (!d) return null;
      return {
        price: d.current_price,
        marketCap: d.market_cap,
        volume24h: d.total_volume,
        priceChange24h: d.price_change_percentage_24h || 0
      };
    };
    
    const report = {
      generatedAt: new Date().toISOString(),
      requestedBy: payment.authorization.from,
      dataSource: "CoinGecko API",
      marketOverview: {
        bitcoin: toMarketObj("bitcoin"),
        ethereum: toMarketObj("ethereum"),
        solana: toMarketObj("solana"),
        usdc: toMarketObj("usd-coin")
      },
      bitcoinATH: btcATH ? { price: btcATH, date: btcATHDate } : null,
      insights: [
        "Real-time market data from CoinGecko",
        "Data fetched on-demand via nanopayment",
        "Powered by ArcSLA + Circle Gateway"
      ],      txHash: "pending"
    };
    
    // Ödeme işle
    const settleResult = await fac.settle(payment);
    report.txHash = settleResult.txHash;
    
    console.log(`[premium] Report generated for ${payment.authorization.from} — TX: ${settleResult.txHash}`);
    
    res.json(report);
  } catch (e) {
    console.error("[premium] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});


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
    console.log(`[nano] Payment settled: 0.001 USDC from ${payment.authorization.from}`);
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

    console.log(`[premium] Report for ${payment.authorization.from} — TX: ${settleResult.txHash}`);
    res.json(report);
  } catch (e) { console.error("[premium] Error:", e.message); res.status(500).json({ error: e.message }); }
});
