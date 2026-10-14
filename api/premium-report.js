import { ethers } from "ethers";

const USDC_ADDR = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || "5042002");

function getRpcUrl() {
  return process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL || null;
}

const USDC_ABI = [
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
];

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
        network: "arc-testnet",
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
      if (!auth?.from || !auth?.to || !auth?.value || !auth?.nonce) {
        return res.status(402).json({ error: "Incomplete payment authorization" });
      }

      // Real EIP-3009 verification: signature, recipient, amount, expiry.
      const paymentSig = payment.signature;
      if (!paymentSig) return res.status(402).json({ error: "Missing payment signature bytes" });
      const domain = { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC_ADDR };
      const types = { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" },
        { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ]};
      const recovered = ethers.verifyTypedData(domain, types, auth, paymentSig);
      if (recovered.toLowerCase() !== String(auth.from).toLowerCase()) {
        return res.status(402).json({ error: "Signature mismatch" });
      }
      if (String(auth.to).toLowerCase() !== payTo.toLowerCase()) {
        return res.status(402).json({ error: "Payment recipient mismatch" });
      }
      if (BigInt(auth.value) < BigInt(amountAtomic)) {
        return res.status(402).json({ error: "Payment amount too low" });
      }
      const now = Math.floor(Date.now() / 1000);
      if (Number(auth.validAfter) > now || Number(auth.validBefore) < now) {
        return res.status(402).json({ error: "Authorization not currently valid" });
      }
      const rpcUrl = getRpcUrl();
      if (rpcUrl) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, provider);
          if (await usdc.authorizationState(auth.from, auth.nonce)) {
            return res.status(402).json({ error: "Nonce already used" });
          }
        } catch (e) {
          console.warn("[premium] nonce check skipped:", e.message);
        }
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
        // NOTE: settlement for this endpoint is off-chain (x402 to facilitator).
        // No on-chain txHash is produced here — callers must not treat this
        // report as an on-chain settlement receipt.
        payment: { from: auth.from, to: auth.to, value: String(auth.value), settled: "off-chain" }
      };

      console.log("[premium] Report generated for:", auth.from);
      return res.json(report);
    } catch(e) {
      console.error("[premium] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
