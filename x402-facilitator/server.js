import { slh_dsa_sha2_128s } from "@noble/post-quantum/slh-dsa.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { makeFacilitator } from "./facilitator.js";

dotenv.config();
const env = process.env;
const app = express();

// CORS: restrict to an explicit allowlist when ALLOWED_ORIGINS is set
// (comma-separated). Falls back to same-origin-only (no ACAO header) when
// unset, instead of the previous wide-open `cors()`.
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server / same-origin
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json());

// -------------------------------------------------------------------------
// Admin auth for endpoints that spend the server's own wallets or sign
// on its behalf. These were previously unauthenticated: anyone could drain
// the buyer wallet (/nano/call), make the facilitator settle (/settle), or
// forge provider receipts (/callguard-hook → SELLER_PRIVATE_KEY signing).
// Fail closed: if no token is configured the endpoints return 503.
// -------------------------------------------------------------------------
const ADMIN_TOKEN = env.FACILITATOR_ADMIN_TOKEN || env.ADMIN_TOKEN || "";

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ error: "Admin API disabled: FACILITATOR_ADMIN_TOKEN not configured" });
  }
  const provided = req.headers["x-admin-token"] || "";
  if (!safeEqual(provided, ADMIN_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// -------------------------------------------------------------------------
// SSRF guard for /ping — mirrors api/ping-provider.js.
// -------------------------------------------------------------------------
function ipToLong(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function isPrivateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipToLong(ip);
    if (n === null) return true;
    const inRange = (base, bits) => (n >>> (32 - bits)) === (ipToLong(base) >>> (32 - bits));
    return (
      inRange("0.0.0.0", 8) ||
      inRange("10.0.0.0", 8) ||
      inRange("100.64.0.0", 10) ||
      inRange("127.0.0.0", 8) ||
      inRange("169.254.0.0", 16) ||
      inRange("172.16.0.0", 12) ||
      inRange("192.0.0.0", 24) ||
      inRange("192.168.0.0", 16) ||
      inRange("198.18.0.0", 15) ||
      inRange("224.0.0.0", 4) ||
      inRange("240.0.0.0", 4)
    );
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true;
    if (low.startsWith("::ffff:")) {
      const mapped = low.slice(7);
      if (isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    return false;
  }
  return true;
}

async function isPublicHost(hostnameRaw) {
  let hostname = (hostnameRaw || "").toLowerCase();
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  if (!hostname) return false;
  if (isIP(hostname)) return !isPrivateIp(hostname);
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f.]+$/i.test(hostname) || /^(0\d+\.)+\d+$/.test(hostname)) {
    return false;
  }
  try {
    const addrs = await lookup(hostname, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

const fac = makeFacilitator(env);
console.log("Facilitator wallet:", fac.facilitatorAddress);

// Facilitator wallet for Memo transactions
import { ethers } from "ethers";
const _rpcProvider = new ethers.JsonRpcProvider(env.RPC_URL || "https://rpc.testnet.arc.io");
const facilitatorWallet = new ethers.Wallet(env.FACILITATOR_PRIVATE_KEY, _rpcProvider);

const SERVICE_REGISTRY = process.env.VITE_SERVICE_REGISTRY; // arc-studio-allow-onchain-literal
const registryAbi = [
  "function getProvider(uint256 providerId) view returns (tuple(address owner,address signer,uint256 stake,uint256 pricePerCall,uint32 maxResponseTime,uint32 slashBps,bool active,uint32 maxConcurrentCalls,uint8 zkTier))"
];
const registryContract = new ethers.Contract(SERVICE_REGISTRY, registryAbi, _rpcProvider);

// Post-quantum SLH-DSA-SHA2-128s — EXPERIMENTAL, NOT a trust anchor.
// The seed below is derived from a PUBLIC constant, so anyone can reproduce
// the same keypair. pqSign/pqSignature prove nothing about origin; they exist
// only for pipeline-format experimentation. Do NOT gate payments on them.
// To make PQ signatures meaningful, load the seed from a SECRET env var.
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
const PAY_TO = fac.facilitatorAddress;

function paymentRequirements() {
  return {
    scheme: "exact",
    network: "eip155:5042002",
    maxAmountRequired: PRICE,
    asset: env.USDC_ADDRESS,
    payTo: PAY_TO,
    resource: "/api/service",
    description: "CallGuard-protected service call",
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
    console.error("[/api/service]", e.message);
    return res.status(500).json({ error: "service failed" });
  }
});

// ---- Facilitator API ----
app.post("/verify", requireAdmin, async (req, res) => {
  try { res.json(await fac.verify(req.body.payment, req.body.requirements)); }
  catch (e) { console.error("[verify]", e.message); res.status(500).json({ error: "verify failed" }); }
});

app.post("/settle", requireAdmin, async (req, res) => {
  try { res.json(await fac.settle(req.body.payment)); }
  catch (e) { console.error("[settle]", e.message); res.status(500).json({ error: "settle failed" }); }
});

// ---- callServiceWithAuthorization ----
app.post("/callService", requireAdmin, async (req, res) => {
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
  } catch (e) { console.error("[callService]", e.message); res.status(500).json({ error: "callService failed" }); }
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
    payTo: PAY_TO,
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
    console.error("[nano/service GET]", e.message);
    return res.status(500).json({ error: "nano service failed" });
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
    console.error("[nano/service POST]", e.message);
    return res.status(500).json({ error: "nano service failed" });
  }
});

// ---- Root & Health ----
app.get("/", (_, res) => res.json({
  service: "CallGuard x402 facilitator",
  status: "live",
  network: "arc-testnet",
  endpoints: ["/health", "/api/service", "/verify", "/settle", "/callService", "/nano/service"],
}));

// ---- /nano/call — facilitator pays via GatewayClient ----
app.post("/nano/call", requireAdmin, async (req, res) => {
  try {
    const { providerId } = req.body;

    let providerOwner = env.SELLER_ADDRESS;

    if (providerId) {
      const provider = await registryContract.getProvider(providerId);
      providerOwner = provider.owner;
      console.log("[nano] provider", providerId, "owner:", providerOwner);
    }
    const { GatewayClient } = await import("@circle-fin/x402-batching/client");
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: env.BUYER_PRIVATE_KEY,
    });
    gateway.chainConfig.chain.id = 5042002; // Arc Testnet (was 14601 — wrong chain)
    const paymentPayload = await gateway.createPaymentPayload(2, {
      scheme: "exact",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "1000",
      payTo: providerOwner,
      maxTimeoutSeconds: 604800,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
      },
    });
    const nanoBase = env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 4021}`;
    const fullPayload = {
      ...paymentPayload,
      resource: {
        url: `${nanoBase}/nano/service`,
        description: "CallGuard nanopayment — 0.001 USDC per call",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: "eip155:5042002",
        asset: "0x3600000000000000000000000000000000000000",
        amount: "1000",
        payTo: providerOwner,
        maxTimeoutSeconds: 604800,
        extra: {
          name: "GatewayWalletBatched",
          version: "1",
          verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(fullPayload)).toString("base64");
    const paidRes = await fetch(`${nanoBase}/nano/service`, {
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
    console.error("[nano/call]", e.message);
    res.status(500).json({ error: "nano call failed" });
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
    console.error("[nano/balance]", e.message);
    res.status(500).json({ error: "balance lookup failed" });
  }
});

app.get("/ping", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "url required" });

  let target;
  try {
    target = new URL(String(url));
  } catch {
    return res.status(400).json({ ok: false, error: "invalid url" });
  }

  // SSRF guard: http/https only, host must resolve to a public IP, and
  // redirects are never followed (rebinding / redirect-to-internal defence).
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return res.status(400).json({ ok: false, error: "only http/https allowed" });
  }
  if (!(await isPublicHost(target.hostname))) {
    return res.status(400).json({ ok: false, error: "private addresses not allowed" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const start = Date.now();
    const r = await fetch(target.toString(), {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    res.json({ ok: r.ok || r.status < 500, status: r.status, ms });
  } catch (e) {
    res.json({ ok: false, error: e.name === "AbortError" ? "timeout" : "ping failed", ms: null });
  }
});

// ---- Auto-Receipt Provider Hook ----
// When CallGuard notifies this facilitator of a call, automatically
// process the request and submit a signed receipt on-chain.
const PAY_PER_CALL_ADDR = env.VITE_PAY_PER_CALL || env.PAY_PER_CALL;
const AUTO_RECEIPT_ABI = [
  "function submitReceipt(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes sig) external",
];

async function autoSubmitReceipt({ callId, requestHash, payload, providerId }) {
  if (!env.SELLER_PRIVATE_KEY || !PAY_PER_CALL_ADDR) return;
  try {
    const signerWallet = new ethers.Wallet(env.SELLER_PRIVATE_KEY, _rpcProvider);
    const contract = new ethers.Contract(PAY_PER_CALL_ADDR, AUTO_RECEIPT_ABI, signerWallet);

    // Process request — return a real response
    const responseData = { result: "pong", providerId, requestEcho: payload, timestamp: Date.now() };
    const responseHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(responseData)));
    const respondedAt = BigInt(Math.floor(Date.now() / 1000));

    // EIP-712 sign — domain MUST match PayPerCall constructor EIP712("ArcSLA","1")
    const chainId = env.VITE_CHAIN_ID ? parseInt(env.VITE_CHAIN_ID) : 5042002;
    const domain = { name: "ArcSLA", version: "1", chainId, verifyingContract: PAY_PER_CALL_ADDR };
    const types = {
      Receipt: [
        { name: "callId", type: "bytes32" },
        { name: "responseHash", type: "bytes32" },
        { name: "respondedAt", type: "uint64" },
      ],
    };
    const sig = await signerWallet.signTypedData(domain, types, { callId, responseHash, respondedAt });
    const tx = await contract.submitReceipt(callId, responseHash, respondedAt, sig);
    console.log(`[auto-receipt] callId=${callId} tx=${tx.hash}`);
    await tx.wait();
    console.log(`[auto-receipt] confirmed tx=${tx.hash}`);
    return { txHash: tx.hash, responseHash };
  } catch (e) {
    console.error("[auto-receipt] failed:", e.message);
  }
}

app.post("/callguard-hook", requireAdmin, async (req, res) => {
  const { event, callId, requestHash, payload, providerId, deadline } = req.body;
  console.log(`[hook] ${event} callId=${callId} provider=${providerId}`);
  res.json({ received: true, callId }); // respond immediately
  if (event === "call.opened" && callId) {
    setImmediate(() => autoSubmitReceipt({ callId, requestHash, payload, providerId }));
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
  } catch(e) { console.error("[health]", e.message); buyerAddr = "error"; }
  res.json({ ok: true, facilitator: fac.facilitatorAddress, buyer: buyerAddr, pqPublicKey: PQ_PUBLIC_KEY, pqAlgorithm: "SLH-DSA-SHA2-128s (experimental, untrusted)" });
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
