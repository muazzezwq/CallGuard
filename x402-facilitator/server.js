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

const PRICE = "1000000";
const PAY_TO = fac.facilitatorAddress;

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

// ---- x402 EIP-3009 endpoint ----
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
    res.setHeader("X-PAYMENT-RESPONSE", Buffer.from(JSON.stringify(s)).toString("base64"));
    return res.json({ ok: true, data: "pong", payment: s });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Facilitator API ----
app.post("/verify", async (req, res) => {
  try { res.json(await fac.verify(req.body.payment, req.body.requirements)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/settle", async (req, res) => {
  try { res.json(await fac.settle(req.body.payment)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- callServiceWithAuthorization ----
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

// ---- Circle Gateway Nanopayments ----
const ARC_TESTNET_NETWORK = "eip155:14601";
const ARC_TESTNET_USDC = "0x0ba304580ee7c9a980cf72e55f5ed2e9fd30bc51";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

function buildNanoRequirements(priceUsdc = "0.001") {
  const amount = Math.round(parseFloat(priceUsdc) * 1_000_000).toString();
  return {
    scheme: "exact",
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount,
    payTo: env.SELLER_ADDRESS,
    maxTimeoutSeconds: 604800,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

app.get("/nano/service", async (req, res) => {
  const paymentSig = req.headers["payment-signature"];
  const requirements = buildNanoRequirements("0.001");

  if (!paymentSig) {
    return res.status(402).json({
      x402Version: 2,
      resource: {
        url: "/nano/service",
        description: "ArcSLA nanopayment — 0.001 USDC per call",
        mimeType: "application/json",
      },
      accepts: [requirements],
    });
  }

  try {
    const { BatchFacilitatorClient } = await import("@circle-fin/x402-batching/server");
    const facilitator = new BatchFacilitatorClient({ url: "https://gateway-api-testnet.circle.com" });
    const paymentPayload = JSON.parse(Buffer.from(paymentSig, "base64").toString("utf-8"));

    console.log('[nano] paymentPayload:', JSON.stringify(paymentPayload, null, 2));
    console.log('[nano] requirements:', JSON.stringify(requirements, null, 2));
    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    console.log('[nano] verifyResult:', JSON.stringify(verifyResult));
    if (!verifyResult.isValid) {
      console.log('[nano] verify failed:', verifyResult.invalidReason);
      return res.status(402).json({ error: "Payment verification failed", reason: verifyResult.invalidReason });
    }

    const settleResult = await facilitator.settle(paymentPayload, requirements);
    if (!settleResult.success) {
      return res.status(402).json({ error: "Settlement failed", reason: settleResult.errorReason });
    }

    const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
    console.log(`[nano] Settled: 0.001 USDC from ${payer}`);

    res.setHeader("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({
      success: true,
      transaction: settleResult.transaction,
      network: ARC_TESTNET_NETWORK,
      payer,
    })).toString("base64"));

    return res.json({ ok: true, data: "pong", payer, tx: settleResult.transaction });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Root & Health ----
app.get("/", (_, res) => res.json({
  service: "ArcSLA x402 facilitator",
  status: "live",
  network: "arc-testnet",
  endpoints: ["/health", "/api/service", "/verify", "/settle", "/callService", "/nano/service"],
}));

app.get("/health", (_, res) =>
  res.json({ ok: true, facilitator: fac.facilitatorAddress }));

app.listen(env.PORT || 4021, () =>
  console.log(`x402 facilitator :${env.PORT || 4021}`));
