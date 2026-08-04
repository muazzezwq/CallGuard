import { slh_dsa_sha2_128s } from "@noble/post-quantum/slh-dsa.js";
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

// Facilitator wallet for Memo transactions
import { ethers } from "ethers";
const _rpcProvider = new ethers.JsonRpcProvider(env.RPC_URL || "https://rpc.testnet.arc.network");
const facilitatorWallet = new ethers.Wallet(env.FACILITATOR_PRIVATE_KEY, _rpcProvider);

// Post-quantum SLH-DSA-SHA2-128s (Arc 0x1800..0004 precompile compatible)
const _pqSeed = new Uint8Array(48);
const _seedBytes = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes("callguard-pq-seed-v1")));
_pqSeed.set(_seedBytes.slice(0, 32));
_pqSeed.set(_seedBytes.slice(0, 16), 32);
const PQ_KEYS = slh_dsa_sha2_128s.keygen(_pqSeed);
const PQ_PUBLIC_KEY = Buffer.from(PQ_KEYS.publicKey).toString("hex");
console.log("[PQ] SLH-DSA public key:", PQ_PUBLIC_KEY);
function pqSign(data) {
  const msg = new TextEncoder().encode(typeof data === "string" ? data : JSON.stringify(data));
  const sig = slh_dsa_sha2_128s.sign(msg, PQ_KEYS.secretKey);
  return Buffer.from(sig).toString("base64");
}

const PRICE = "1000000";
const PAY_TO = env.SELLER_ADDRESS || fac.facilitatorAddress;

function paymentRequirements() {
  return {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: PRICE,
    asset: env.USDC_ADDRESS,
    payTo: PAY_TO,
    resource: "/api/service",
    description: "CallGuard korumali servis cagrisi",
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

    // Attach Arc Memo to the call for on-chain reconciliation
    try {
      const MEMO_CONTRACT = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
      const USDC_ADDR = env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
      const memoAbi = ["function memo(address target, bytes data, bytes32 memoId, bytes memoData) external"];
      const memoContract = new ethers.Contract(MEMO_CONTRACT, memoAbi, facilitatorWallet);
      const memoId = ethers.keccak256(ethers.toUtf8Bytes("callguard-" + (result.callId || requestHash)));
      const memoText = "CallGuard payment — Provider #" + providerId;
      const memoData = ethers.toUtf8Bytes(memoText);
      const usdcIface = new ethers.Interface(["function transfer(address to, uint256 amount) returns (bool)"]);
      const dummyData = usdcIface.encodeFunctionData("transfer", [from, 0n]);
      const memoTx = await memoContract.memo(USDC_ADDR, dummyData, memoId, memoData);
      result.memoTx = memoTx.hash;
      console.log("[memo] Attached:", memoText, "tx:", memoTx.hash);
    } catch(e) {
      console.warn("[memo] Failed:", e.message);
    }

    // Add PQ signature to result
    if (result && typeof result === "object") {
      const payload = JSON.stringify({ callId: result.callId, providerId, from, timestamp: Date.now() });
      result.pqSignature = pqSign(payload);
      result.pqPublicKey = PQ_PUBLIC_KEY;
      result.pqAlgorithm = "SLH-DSA-SHA2-128s";
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Circle Gateway Nanopayments ----
const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
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
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: "/nano/service",
        description: "CallGuard nanopayment — 0.001 USDC per call",
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(paymentRequired)).toString("base64"));
    return res.status(402).json(paymentRequired);
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
      return res.status(402).json({ error: "Payment verification failed", reason: verifyResult.invalidReason });
    }

    const settleResult = await facilitator.settle(paymentPayload, requirements);
    if (!settleResult.success) {
      return res.status(402).json({ error: "Settlement failed", reason: settleResult.errorReason });
    }

    const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";

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

app.post("/nano/service", async (req, res) => {
  const paymentSig = req.headers["payment-signature"] || req.headers["Payment-Signature"];
  if (!paymentSig) {
    return res.status(402).json({ error: "Payment Required" });
  }
  try {
    const { BatchFacilitatorClient } = await import("@circle-fin/x402-batching/server");
    const facilitator = new BatchFacilitatorClient({ url: "https://gateway-api-testnet.circle.com" });
    const requirements = buildNanoRequirements("0.001");
    const paymentPayload = JSON.parse(Buffer.from(paymentSig, "base64").toString("utf-8"));
    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    console.log("[nano POST] verify:", JSON.stringify(verifyResult));
    if (!verifyResult.isValid) {
      return res.status(402).json({ error: "Payment verification failed", reason: verifyResult.invalidReason });
    }
    const settleResult = await facilitator.settle(paymentPayload, requirements);
    console.log("[nano POST] settle FULL:", JSON.stringify(settleResult, null, 2));
    if (!settleResult.success) {
      return res.status(402).json({ error: "Settlement failed", reason: settleResult.errorReason, full: settleResult });
    }
    res.setHeader("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({
      success: true,
      transaction: settleResult.transaction,
      network: ARC_TESTNET_NETWORK,
      payer: settleResult.payer,
    })).toString("base64"));
    return res.json({ ok: true, data: "pong", payer: settleResult.payer, tx: settleResult.transaction });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Root & Health ----
app.get("/", (_, res) => res.json({
  service: "CallGuard x402 facilitator",
  status: "live",
  network: "arc-testnet",
  endpoints: ["/health", "/api/service", "/verify", "/settle", "/callService", "/nano/service"],
}));

// ---- /nano/call — facilitator GatewayClient ile odemeyı yapar ----
app.post("/nano/call", async (req, res) => {
  try {
    const { GatewayClient } = await import("@circle-fin/x402-batching/client");
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: env.BUYER_PRIVATE_KEY,
    });
    gateway.chainConfig.chain.id = 14601;
    const paymentPayload = await gateway.createPaymentPayload(2, {
      scheme: "exact",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "1000",
      payTo: env.SELLER_ADDRESS,
      maxTimeoutSeconds: 604800,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
      },
    });
    const fullPayload = {
      ...paymentPayload,
      resource: {
        url: "http://localhost:4021/nano/service",
        description: "CallGuard nanopayment — 0.001 USDC per call",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: "eip155:5042002",
        asset: "0x3600000000000000000000000000000000000000",
        amount: "1000",
        payTo: env.SELLER_ADDRESS,
        maxTimeoutSeconds: 604800,
        extra: {
          name: "GatewayWalletBatched",
          version: "1",
          verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(fullPayload)).toString("base64");
    const paidRes = await fetch("http://localhost:4021/nano/service", {
      method: "POST",
      headers: { "Payment-Signature": paymentHeader },
    });
    const paidText = await paidRes.text();
    console.log("[nano/call raw status]", paidRes.status);
    console.log("[nano/call raw response]", paidText);

    const paidData = JSON.parse(paidText);
    console.log("[nano/call] Response:", JSON.stringify(paidData));
    if (!paidRes.ok) {
      throw new Error(JSON.stringify({
        error: paidData.error,
        reason: paidData.reason,
        full: paidData.full
      }));
    }
    const result = { formattedAmount: "0.001" };
    res.json({ ok: true, amount: result.formattedAmount, result });
  } catch (e) {
    res.status(500).json({ error: e.message, detail: e.stack });
  }
});

// ---- Gateway balance endpoint ----
app.get("/nano/balance", async (req, res) => {
  try {
    const result = await fetch("https://gateway-api-testnet.circle.com/v1/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "USDC",
        sources: [{ domain: 26, depositor: env.SELLER_ADDRESS }]
      })
    });
    const data = await result.json();
    const bal = data.balances?.[0] || {};
    res.json({
      seller: env.SELLER_ADDRESS,
      balance: bal.balance || "0",
      pendingBatch: bal.pendingBatch || "0",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/ping", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "url required" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const start = Date.now();
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    res.json({ ok: r.ok || r.status < 500, status: r.status, ms });
  } catch (e) {
    res.json({ ok: false, error: e.message, ms: null });
  }
});

app.get("/health", async (_, res) => {
  let buyerAddr = "not set";
  try {
    if (env.BUYER_PRIVATE_KEY) {
      const { privateKeyToAccount } = await import("viem/accounts");
      const acc = privateKeyToAccount(env.BUYER_PRIVATE_KEY);
      buyerAddr = acc.address;
    }
  } catch(e) { buyerAddr = "error: " + e.message; }
  res.json({ ok: true, facilitator: fac.facilitatorAddress, buyer: buyerAddr, pqPublicKey: PQ_PUBLIC_KEY, pqAlgorithm: "SLH-DSA-SHA2-128s" });
});

// MCP SSE endpoints
const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
const { default: createArcslaServer } = await import("./mcp-server-factory.js");
const mcpSessions = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  mcpSessions[transport.sessionId] = transport;
  res.on("close", () => delete mcpSessions[transport.sessionId]);
  const server = createArcslaServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const t = mcpSessions[req.query.sessionId];
  if (!t) return res.status(404).json({ error: "Session not found" });
  await t.handlePostMessage(req, res);
});

app.listen(env.PORT || 4021, () =>
  console.log(`x402 facilitator :${env.PORT || 4021}`));
