import { ethers } from "ethers";
import { settleEip3009 } from "./_settle.js";
import { getRpcUrl } from "./_rpc.js";
import { logError } from "./_redact.js";

const USDC_ADDR = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || "5042002");

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

function isAtomicValue(value) {
  return (
    (typeof value === "string" && DECIMAL_RE.test(value)) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Payment-Signature,X-Payment");
  if (req.method === "OPTIONS") return res.status(200).end();

  const amountAtomic = "1000";
  const payTo = process.env.FACILITATOR_ADDRESS || "0x0e515aed287a7b3d2d9f7911321d99826653fbd8";

  if (req.method === "GET") {
    return res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "eip155:5042002",
        maxAmountRequired: amountAtomic,
        resource: "/api/premium-report",
        description: "Premium Analytics Report",
        payTo,
        maxTimeoutSeconds: 120,
        asset: USDC_ADDR,
        extra: { verifyingContract: USDC_ADDR }
      }]
    });
  }

  if (req.method === "POST") {
    try {
      const sig = req.headers["payment-signature"];
      if (!sig) return res.status(402).json({ error: "No payment signature" });

      let payment;
      try {
        payment = JSON.parse(Buffer.from(sig, "base64").toString());
      } catch {
        return res.status(402).json({ error: "Malformed payment signature" });
      }
      const auth = payment.authorization || payment;
      if (
        !auth ||
        typeof auth !== "object" ||
        typeof auth.from !== "string" ||
        typeof auth.to !== "string" ||
        typeof auth.nonce !== "string" ||
        !ADDRESS_RE.test(auth.from) ||
        !ADDRESS_RE.test(auth.to) ||
        !BYTES32_RE.test(auth.nonce) ||
        !isAtomicValue(auth.value) ||
        !isAtomicValue(auth.validAfter) ||
        !isAtomicValue(auth.validBefore)
      ) {
        return res.status(402).json({ error: "Malformed payment authorization" });
      }

      // Real EIP-3009 verification: signature, recipient, amount, expiry.
      const paymentSig = payment.signature;
      if (typeof paymentSig !== "string" || !SIGNATURE_RE.test(paymentSig)) {
        return res.status(402).json({ error: "Malformed payment signature" });
      }
      const domain = { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC_ADDR };
      const types = { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" },
        { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ]};
      let recovered;
      try {
        recovered = ethers.verifyTypedData(domain, types, auth, paymentSig);
      } catch {
        return res.status(402).json({ error: "Signature mismatch" });
      }
      if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
        return res.status(402).json({ error: "Signature mismatch" });
      }
      if (auth.to.toLowerCase() !== payTo.toLowerCase()) {
        return res.status(402).json({ error: "Payment recipient mismatch" });
      }
      if (BigInt(auth.value) < BigInt(amountAtomic)) {
        return res.status(402).json({ error: "Payment amount too low" });
      }
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (BigInt(auth.validAfter) > now || BigInt(auth.validBefore) < now) {
        return res.status(402).json({ error: "Authorization not currently valid" });
      }
      // Consume the nonce by settling on-chain. Without this a single signed
      // authorization could be replayed for unlimited reports.
      const rpcUrl = getRpcUrl();
      const settlement = await settleEip3009({ auth, signature: paymentSig, usdcAddress: USDC_ADDR, rpcUrl });
      if (!settlement.ok) {
        logError("[premium] settlement failed", { message: settlement.error });
        return res.status(503).json({ error: "Payment settlement unavailable" });
      }

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

      const report = {
        generatedAt: new Date().toISOString(),
        requestedBy: auth.from,
        dataSource: "CoinGecko API",
        marketOverview: {
          bitcoin: toM("bitcoin"),
          ethereum: toM("ethereum"),
          solana: toM("solana")
        },
        payment: { from: auth.from, to: auth.to, value: String(auth.value), settled: "on-chain", txHash: settlement.txHash }
      };

      console.log("[premium] Report generated for:", auth.from);
      return res.json(report);
    } catch(e) {
      // Never leak provider error messages (may embed the RPC URL + token).
      logError("[premium] Error", e);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  res.status(405).end();
}
