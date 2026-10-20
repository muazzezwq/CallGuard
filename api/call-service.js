/**
 * POST /api/call-service
 *
 * x402 full flow: EIP-3009 signed payment → on-chain callServiceWithAuthorization
 * Body: { providerId, requestHash, authorization, signature }
 *
 * If FACILITATOR_PRIVATE_KEY is set: real on-chain settlement.
 * Otherwise: demo mode (sig verified, returns mock txHash).
 */

import { ethers } from "ethers";
import { V7 } from "./_contracts.js";
import { getRpcUrl } from "./_rpc.js";
import { logError } from "./_redact.js";
import {
  callServiceFingerprint,
  createAliasRecord,
  createOperationRecord,
  deriveAliasId,
  deriveAuthorizationId,
  normalizeExplicitKey,
} from "./_idempotency.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Payment",
};

// Explicit idempotency scope for this endpoint. Never rely on a default in the
// shared idempotency helpers: another route with the same payer/nonce must not
// collide with call-service records.
const IDEMPOTENCY_SCOPE = "call-service";

// Structured 402 codes. Keep in sync with src/lib/facilitatorOutcome.ts.
// PRE_SETTLEMENT is returned only after the authorization nonce has been
// checked and found unused, so a replayed authorization can never receive it.
const PRE_SETTLEMENT_CODE = "PRE_SETTLEMENT";
const AUTHORIZATION_ALREADY_USED_CODE = "AUTHORIZATION_ALREADY_USED";
const PAYMENT_REQUIRED_CODE = "PAYMENT_REQUIRED";
const INVALID_REQUEST_CODE = "INVALID_REQUEST";
const INVALID_PROVIDER_ID_CODE = "INVALID_PROVIDER_ID";
const PROVIDER_NOT_ACTIVE_CODE = "PROVIDER_NOT_ACTIVE";
const INVALID_IDEMPOTENCY_KEY_CODE = "INVALID_IDEMPOTENCY_KEY";
const IDEMPOTENCY_KEY_REUSED_CODE = "IDEMPOTENCY_KEY_REUSED";
const IDEMPOTENCY_UNAVAILABLE_CODE = "IDEMPOTENCY_UNAVAILABLE";
const OPERATION_IN_PROGRESS_CODE = "OPERATION_IN_PROGRESS";
const SETTLEMENT_OUTCOME_UNKNOWN_CODE = "SETTLEMENT_OUTCOME_UNKNOWN";
const SUBMISSION_OUTCOME_UNKNOWN_CODE = "SUBMISSION_OUTCOME_UNKNOWN";
const SETTLEMENT_REVERTED_CODE = "SETTLEMENT_REVERTED";

const {
  USDC: USDC_ADDR,
  PAY_PER_CALL: CONTRACT,
  SERVICE_REGISTRY: REGISTRY,
  CHAIN_ID,
  NETWORK: ARC_TESTNET_CHAIN_ID,
} = V7;

const PAY_ABI = [
  "function callServiceWithAuthorization(uint256 providerId, bytes32 requestHash, address from, uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) external returns (bytes32)",
  "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline)",
];

const USDC_ABI = [
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const REGISTRY_ABI = [
  "function getProvider(uint256 providerId) view returns (address owner, address signer, uint256 stake, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, bool active, uint32 maxConcurrentCalls, uint8 zkTier)",
];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const ATOMIC_RE = /^(0|[1-9][0-9]*)$/;

// Arc Testnet chain constants.
const X402_VERSION = 1;
const MAX_TIMEOUT_SECONDS = 120;

// Interoperability note, verified against @x402/evm 2.14.0:
// the v1 exact client uses a fixed legacy-network map that does not include
// Arc, and both v1 and v2 clients send their payment in a PAYMENT-SIGNATURE
// header. This endpoint keeps its existing JSON `authorization` + `signature`
// body, so a stock x402 client needs a CallGuard-aware adapter (or a proxy
// that maps the header into this body). The terms below are otherwise valid
// x402 v1 PaymentRequirements.

function baseUrl(req) {
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "arcsla.vercel.app";
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function normalizeProviderId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === "string" && ATOMIC_RE.test(value)) return value;
  return null;
}

function parseAtomic(value) {
  if (typeof value === "string" && ATOMIC_RE.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function providerPrice(provider) {
  const raw = provider?.pricePerCall;
  if (typeof raw === "bigint" && raw >= 0n) return raw.toString();
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) return String(raw);
  if (typeof raw === "string" && ATOMIC_RE.test(raw)) return raw;
  return null;
}

function missingPaymentConfig() {
  if (!USDC_ADDR) return "USDC_ADDRESS";
  if (!CONTRACT) return "PAY_PER_CALL";
  if (!REGISTRY) return "SERVICE_REGISTRY";
  return null;
}

// A stored replay needs the signature domain and the fingerprint inputs, but
// not the registry/RPC. Those are only needed to validate a new operation.
function missingSignatureConfig() {
  if (!USDC_ADDR) return "USDC_ADDRESS";
  if (!CONTRACT) return "PAY_PER_CALL";
  return null;
}

function missingSettlementConfig() {
  if (!REGISTRY) return "SERVICE_REGISTRY";
  return null;
}

/**
 * Returns a fully-formed x402 payment-required body.
 *
 * `maxAmountRequired` is the selected provider's on-chain pricePerCall, and
 * `payTo` is PayPerCall itself. The authorization is consumed by
 * callServiceWithAuthorization, which pulls USDC into the contract; an
 * authorization made out to the facilitator cannot settle this endpoint.
 */
function paymentRequired(priceAtomic, req) {
  return {
    x402Version: X402_VERSION,
    error: "Payment authorization required",
    code: PAYMENT_REQUIRED_CODE,
    accepts: [
      {
        scheme: "exact",
        network: ARC_TESTNET_CHAIN_ID,
        asset: USDC_ADDR,
        maxAmountRequired: priceAtomic,
        payTo: CONTRACT,
        resource: `${baseUrl(req)}/api/call-service`,
        description: "USDC on Arc Testnet — CallGuard SLA per-call fee",
        mimeType: "application/json",
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        // Verified against @x402/evm 2.14.0: the exact scheme reads the USDC
        // EIP-712 domain from these fields before asking the client to sign.
        extra: { name: "USDC", version: "2" },
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          required: ["providerId", "requestHash", "authorization", "signature"],
          properties: {
            providerId:    { type: "integer" },
            requestHash:   { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            authorization: { type: "object" },
            signature:     { type: "string", pattern: "^0x[0-9a-fA-F]{130}$" },
          },
        },
        outputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          required: ["success", "callId"],
          properties: {
            success:     { type: "boolean" },
            callId:      { type: "string" },
            txHash:      { type: ["string", "null"] },
            blockNumber: { type: ["integer", "null"] },
          },
        },
      },
    ],
  };
}

function sendPaymentRequired(res, req, priceAtomic) {
  res.setHeader("Content-Type", "application/json");
  return res.status(402).json(paymentRequired(priceAtomic, req));
}

function pendingMessage(code) {
  if (code === OPERATION_IN_PROGRESS_CODE) {
    return "Operation is already in progress; do not submit another payment";
  }
  if (code === SUBMISSION_OUTCOME_UNKNOWN_CODE) {
    return "Submission outcome is unknown; do not submit another payment without checking authorization state";
  }
  return "Settlement outcome is unknown; check the transaction hash before retrying";
}

function sendPending(res, { code, operationId, txHash }) {
  const body = {
    success: false,
    pending: true,
    code,
    error: pendingMessage(code),
    retryable: false,
    operationId,
  };
  if (txHash) body.txHash = txHash;
  return res.status(202).json(body);
}

function sendReverted(res, { txHash, operationId }) {
  return res.status(409).json({
    success: false,
    code: SETTLEMENT_REVERTED_CODE,
    error: "Settlement transaction reverted",
    txHash: txHash || null,
    operationId,
  });
}

function parseCallStarted(receipt) {
  const iface = new ethers.Interface(PAY_ABI);
  for (const log of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "CallStarted") return parsed.args.callId;
    } catch { /* skip unrelated log */ }
  }
  return null;
}

async function transitionOperation(store, operationId, expected, patch) {
  try {
    return await store.transition(operationId, expected, patch);
  } catch (e) {
    logError("[x402/call-service] idempotency transition failed", e);
    return null;
  }
}

function sendIdempotencyUnavailable(res) {
  return res.status(503).json({
    error: "Payment safety state is unavailable",
    code: IDEMPOTENCY_UNAVAILABLE_CODE,
  });
}

function sendIdempotencyConflict(res) {
  return res.status(409).json({
    error: "Idempotency key was already used with different payment parameters",
    code: IDEMPOTENCY_KEY_REUSED_CODE,
  });
}

async function readStoreRecord(store, operationId) {
  try {
    return { ok: true, record: await store.get(operationId) };
  } catch (e) {
    logError("[x402/call-service] idempotency read failed", e);
    return { ok: false };
  }
}

function sendConfirmed(res, record) {
  return res.json({
    success: true,
    callId: record.callId ?? null,
    txHash: record.txHash ?? null,
    blockNumber: record.blockNumber ?? null,
  });
}

/**
 * A failed transition must never be reported as a terminal result that the
 * durable record does not contain. Re-read the operation and answer from its
 * actual state. If that state is still unresolved, return an explicit pending
 * response that keeps the known hash and forbids an automatic resubmit.
 */
async function resolveTransitionFailure({ store, operationId, fingerprint, txHash, res }) {
  const latest = await readStoreRecord(store, operationId);
  const record = latest.ok ? latest.record : null;
  const matches = Boolean(
    record
    && record.kind === "operation"
    && record.operationId === operationId
    && record.authId === operationId
    && record.fingerprint === fingerprint,
  );

  if (matches) {
    if (record.state === "confirmed") return sendConfirmed(res, record);
    if (record.state === "reverted") {
      const storedHash = typeof record.txHash === "string" ? record.txHash : txHash;
      return sendReverted(res, { txHash: storedHash, operationId });
    }
  }

  res.setHeader("X-Idempotency-Persisted", "false");
  const durableHash = matches && typeof record.txHash === "string" ? record.txHash : txHash;
  return sendPending(res, {
    code: SETTLEMENT_OUTCOME_UNKNOWN_CODE,
    operationId,
    txHash: durableHash || null,
  });
}

function aliasRecordStatus(record, { aliasId, authId, fingerprint }) {
  if (!record || record.kind !== "alias" || record.operationId !== aliasId || record.aliasId !== aliasId) {
    return "malformed";
  }
  if (record.authId !== authId || record.fingerprint !== fingerprint) return "conflict";
  return "ok";
}

function operationRecordStatus(record, { authId, fingerprint }) {
  if (!record || record.kind !== "operation" || record.operationId !== authId || record.authId !== authId) {
    return "malformed";
  }
  if (record.fingerprint !== fingerprint) return "conflict";
  return "ok";
}

async function createAliasAtomic(store, record) {
  let created;
  try {
    created = await store.create(record);
  } catch (e) {
    logError("[x402/call-service] idempotency alias write failed", e);
    return { ok: false, unavailable: true };
  }
  if (!created || !created.record) return { ok: false, unavailable: true };
  const status = aliasRecordStatus(created.record, {
    aliasId: record.operationId,
    authId: record.authId,
    fingerprint: record.fingerprint,
  });
  if (status === "malformed") return { ok: false, unavailable: true };
  if (status === "conflict") return { ok: false, conflict: true };
  return { ok: true, created: created.created === true, record: created.record };
}

async function createOperationAtomic(store, record) {
  let created;
  try {
    created = await store.create(record);
  } catch (e) {
    logError("[x402/call-service] idempotency operation write failed", e);
    return { ok: false, unavailable: true };
  }
  if (!created || !created.record) return { ok: false, unavailable: true };
  const status = operationRecordStatus(created.record, {
    authId: record.operationId,
    fingerprint: record.fingerprint,
  });
  if (status === "malformed") return { ok: false, unavailable: true };
  if (status === "conflict") return { ok: false, conflict: true };
  return { ok: true, created: created.created === true, record: created.record };
}

function verifyAuthorization(authorization, signature) {
  const domain = {
    name: "USDC", version: "2",
    chainId: CHAIN_ID,
    verifyingContract: USDC_ADDR,
  };
  const types = {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  };
  try {
    const recovered = ethers.verifyTypedData(domain, types, authorization, signature);
    return recovered.toLowerCase() === authorization.from.toLowerCase();
  } catch {
    return false;
  }
}

async function resolveExistingOperation({ record, fingerprint, res, readReceipt, operationId, store }) {
  if (record.fingerprint !== fingerprint) {
    return res.status(409).json({
      error: "Idempotency key was already used with different payment parameters",
      code: IDEMPOTENCY_KEY_REUSED_CODE,
    });
  }

  if (record.state === "confirmed") {
    return sendConfirmed(res, record);
  }
  if (record.state === "reverted") {
    return sendReverted(res, { txHash: record.txHash, operationId });
  }
  if (record.state === "prepared") {
    return sendPending(res, { code: OPERATION_IN_PROGRESS_CODE, operationId });
  }

  const txHash = typeof record.txHash === "string" ? record.txHash : null;
  if (!txHash) {
    return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
  }
  if (typeof readReceipt === "function") {
    let receipt;
    try {
      receipt = await readReceipt(txHash);
    } catch (e) {
      logError("[x402/call-service] receipt read failed", e);
      return sendPending(res, { code: SETTLEMENT_OUTCOME_UNKNOWN_CODE, operationId, txHash });
    }
    if (receipt && Number(receipt.status) === 0) {
      const updated = await transitionOperation(store, operationId, record.state, {
        state: "reverted",
        txHash,
        blockNumber: receipt.blockNumber ?? null,
        updatedAt: Date.now(),
      });
      if (updated?.ok !== true) {
        return resolveTransitionFailure({ store, operationId, fingerprint, txHash, res });
      }
      return sendReverted(res, { txHash, operationId });
    }
    if (receipt && Number(receipt.status) === 1) {
      const callId = parseCallStarted(receipt);
      const receiptHash = typeof receipt.hash === "string" ? receipt.hash : txHash;
      const updated = await transitionOperation(store, operationId, record.state, {
        state: "confirmed",
        txHash: receiptHash,
        callId,
        blockNumber: receipt.blockNumber ?? null,
        updatedAt: Date.now(),
      });
      if (updated?.ok !== true) {
        return resolveTransitionFailure({
          store,
          operationId,
          fingerprint,
          txHash: receiptHash,
          res,
        });
      }
      return sendConfirmed(res, {
        callId,
        txHash: receiptHash,
        blockNumber: receipt.blockNumber ?? null,
      });
    }
  }
  return sendPending(res, { code: SETTLEMENT_OUTCOME_UNKNOWN_CODE, operationId, txHash });
}

export function createCallServiceHandler(options = {}) {
  return (req, res) => handler(req, res, options);
}

export default function defaultHandler(req, res) {
  return handler(req, res);
}

async function handler(req, res, { idempotencyStore = null, readReceipt = null } = {}) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (idempotencyStore) {
    res.setHeader("Access-Control-Allow-Headers", `${CORS_HEADERS["Access-Control-Allow-Headers"]},Idempotency-Key`);
  }
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { providerId: rawProviderId, requestHash, authorization, signature } = req.body || {};
  const providerId = normalizeProviderId(rawProviderId);
  if (providerId === null) {
    return res.status(400).json({ error: "Invalid providerId", code: INVALID_PROVIDER_ID_CODE });
  }

  // No payment payload at all: advertise the exact terms for this provider.
  if (!authorization && !signature) {
    const missing = missingPaymentConfig();
    if (missing) return res.status(503).json({ error: `${missing} not configured` });
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) return res.status(503).json({ error: "No RPC URL configured" });

    try {
      const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      const reg = new ethers.Contract(REGISTRY, REGISTRY_ABI, rpcProvider);
      const provider = await reg.getProvider(providerId);
      if (!provider.active) {
        return res.status(409).json({ error: "Provider not active", code: PROVIDER_NOT_ACTIVE_CODE });
      }
      const price = providerPrice(provider);
      if (price === null) {
        console.error("[x402/call-service] invalid provider price");
        return res.status(502).json({ error: "Unable to verify provider price — try again later" });
      }
      return sendPaymentRequired(res, req, price);
    } catch (e) {
      logError("[x402/call-service] registry read failed", e);
      return res.status(502).json({ error: "Unable to verify provider — try again later" });
    }
  }

  const value = parseAtomic(authorization?.value);
  const validAfter = parseAtomic(authorization?.validAfter);
  const validBefore = parseAtomic(authorization?.validBefore);
  const validAuth = authorization
    && ADDRESS_RE.test(authorization.from || "")
    && ADDRESS_RE.test(authorization.to || "")
    && BYTES32_RE.test(authorization.nonce || "")
    && value !== null
    && validAfter !== null
    && validBefore !== null;
  if (!validAuth ||
      typeof requestHash !== "string" || !BYTES32_RE.test(requestHash) ||
      typeof signature !== "string" || !SIGNATURE_RE.test(signature)) {
    return res.status(400).json({ error: "Malformed payment request", code: INVALID_REQUEST_CODE });
  }

  const missingSignature = missingSignatureConfig();
  if (missingSignature) return res.status(503).json({ error: `${missingSignature} not configured` });
  if (!idempotencyStore) {
    const missing = missingPaymentConfig();
    if (missing) return res.status(503).json({ error: `${missing} not configured` });
  }

  try {
    let rpcProvider = null;
    let idempotencyContext = null;

    if (idempotencyStore) {
      // The signature is verified before any stored record is trusted. A
      // malformed or forged authorization must not receive a stored success.
      if (!verifyAuthorization(authorization, signature)) {
        return res.status(402).json({ error: "Signature mismatch", code: PRE_SETTLEMENT_CODE });
      }

      const rawKey = req.headers?.["idempotency-key"] ?? req.headers?.["Idempotency-Key"];
      let explicitKey = null;
      if (rawKey !== undefined) {
        explicitKey = normalizeExplicitKey(rawKey);
        if (explicitKey === null) {
          return res.status(400).json({
            error: "Invalid Idempotency-Key",
            code: INVALID_IDEMPOTENCY_KEY_CODE,
          });
        }
      }

      const authId = deriveAuthorizationId({ operation: IDEMPOTENCY_SCOPE, authorization });
      const aliasId = deriveAliasId({ operation: IDEMPOTENCY_SCOPE, explicitKey });
      const fingerprint = callServiceFingerprint({
        operation: IDEMPOTENCY_SCOPE,
        chainId: CHAIN_ID,
        contract: CONTRACT,
        asset: USDC_ADDR,
        providerId,
        requestHash,
        authorization,
      });
      idempotencyContext = { explicitKey, aliasId, authId, fingerprint };

      // An explicit key is only an alias. It must never create a second
      // operation for the same signed authorization, and it must not point at
      // a different authorization or payment intent.
      let aliasRecord = null;
      if (aliasId) {
        const aliasRead = await readStoreRecord(idempotencyStore, aliasId);
        if (!aliasRead.ok) return sendIdempotencyUnavailable(res);
        aliasRecord = aliasRead.record;
        if (aliasRecord) {
          const status = aliasRecordStatus(aliasRecord, { aliasId, authId, fingerprint });
          if (status === "malformed") return sendIdempotencyUnavailable(res);
          if (status === "conflict") return sendIdempotencyConflict(res);
        }
      }

      // The canonical operation is always keyed by the signed authorization.
      // Look it up before nonce/time/provider checks: those checks naturally
      // fail after an earlier request settled.
      const operationRead = await readStoreRecord(idempotencyStore, authId);
      if (!operationRead.ok) return sendIdempotencyUnavailable(res);
      const operationRecord = operationRead.record;
      if (operationRecord) {
        const status = operationRecordStatus(operationRecord, { authId, fingerprint });
        if (status === "malformed") return sendIdempotencyUnavailable(res);
        if (status === "conflict") return sendIdempotencyConflict(res);

        // Record a new explicit key as an alias even on replay, so reusing it
        // later for a different authorization cannot bypass the key check.
        if (aliasId && !aliasRecord) {
          const aliasCreated = await createAliasAtomic(
            idempotencyStore,
            createAliasRecord({ aliasId, authId, fingerprint }),
          );
          if (!aliasCreated.ok) {
            return aliasCreated.conflict
              ? sendIdempotencyConflict(res)
              : sendIdempotencyUnavailable(res);
          }
        }
        return resolveExistingOperation({
          record: operationRecord,
          fingerprint,
          res,
          readReceipt,
          operationId: authId,
          store: idempotencyStore,
        });
      }

      const missingSettlement = missingSettlementConfig();
      if (missingSettlement) return res.status(503).json({ error: `${missingSettlement} not configured` });
      const rpcUrl = getRpcUrl();
      if (!rpcUrl) return res.status(503).json({ error: "No RPC URL configured" });
      rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
    } else {
      // Default production path: preserve the existing nonce-first ordering.
      const rpcUrl = getRpcUrl();
      if (!rpcUrl) return res.status(503).json({ error: "No RPC URL configured" });
      rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
    }

    // Replay check. Every later validation can fail for an authorization that
    // already settled in an earlier request, so none of those errors may be
    // reported as pre-settlement before this nonce state is known.
    const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, rpcProvider);
    const nonceUsed = await usdc.authorizationState(authorization.from, authorization.nonce);
    if (nonceUsed) {
      return res.status(402).json({
        error: "Nonce already used",
        code: AUTHORIZATION_ALREADY_USED_CODE,
      });
    }

    // The no-store path keeps its original nonce-before-signature ordering. The
    // store path already verified the signature before trusting any record.
    if (!idempotencyStore && !verifyAuthorization(authorization, signature)) {
      return res.status(402).json({ error: "Signature mismatch", code: PRE_SETTLEMENT_CODE });
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (BigInt(validAfter) > now)
      return res.status(402).json({ error: "Authorization not yet valid", code: PRE_SETTLEMENT_CODE });
    if (BigInt(validBefore) < now)
      return res.status(402).json({ error: "Authorization expired", code: PRE_SETTLEMENT_CODE });

    // to/value checks — authorization must target this settlement contract
    // for exactly the provider's price. Prevents underpayment / misdirected auths.
    if (authorization.to.toLowerCase() !== CONTRACT.toLowerCase())
      return res.status(402).json({ error: "Authorization 'to' must be the PayPerCall contract", code: PRE_SETTLEMENT_CODE });

    let provider;
    try {
      const reg = new ethers.Contract(REGISTRY, REGISTRY_ABI, rpcProvider);
      provider = await reg.getProvider(providerId);
    } catch (e) {
      logError("[x402/call-service] registry read failed", e);
      return res.status(502).json({ error: "Unable to verify provider — try again later" });
    }
    if (!provider.active) return res.status(402).json({ error: "Provider not active", code: PRE_SETTLEMENT_CODE });
    const price = providerPrice(provider);
    if (price === null) {
      console.error("[x402/call-service] invalid provider price");
      return res.status(502).json({ error: "Unable to verify provider price — try again later" });
    }
    if (BigInt(value) !== BigInt(price))
      return res.status(402).json({ error: "Authorization value must equal provider pricePerCall", code: PRE_SETTLEMENT_CODE });

    // Demo mode — NO on-chain settlement. Explicit flags so callers
    // cannot mistake this for a paid call.
    if (!process.env.FACILITATOR_PRIVATE_KEY) {
      const mockCallId = ethers.keccak256(ethers.toUtf8Bytes(requestHash + Date.now()));
      return res.json({ success: true, callId: mockCallId, txHash: null, demo: true, settled: false,
        message: "Signature verified — demo mode (NO on-chain call was made)" });
    }

    // Real settlement
    const wallet = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY, rpcProvider);
    const contract = new ethers.Contract(CONTRACT, PAY_ABI, wallet);
    let v, r, s;
    try {
      ({ v, r, s } = ethers.Signature.from(signature));
    } catch {
      return res.status(402).json({ error: "Signature mismatch", code: PRE_SETTLEMENT_CODE });
    }

    // Idempotency is opt-in through the store injected by the caller. The
    // default handler injects no store, so this block is inert in production
    // until a verified durable store is wired in.
    let operationId = null;
    let operationFingerprint = null;
    if (idempotencyStore && idempotencyContext) {
      const { explicitKey, aliasId, authId, fingerprint } = idempotencyContext;
      operationId = authId;
      operationFingerprint = fingerprint;

      // Reserve the explicit key first. If this conflicts, no operation is
      // created and nothing is submitted.
      if (aliasId) {
        const aliasCreated = await createAliasAtomic(
          idempotencyStore,
          createAliasRecord({ aliasId, authId, fingerprint }),
        );
        if (!aliasCreated.ok) {
          return aliasCreated.conflict
            ? sendIdempotencyConflict(res)
            : sendIdempotencyUnavailable(res);
        }
      }

      // The canonical operation create is the single-submitter gate. Two
      // requests with the same authorization can race here; only the caller
      // that receives created:true may submit.
      const created = await createOperationAtomic(
        idempotencyStore,
        createOperationRecord({
          operationId: authId,
          authId,
          fingerprint,
          explicitKey,
        }),
      );
      if (!created.ok) {
        return created.conflict
          ? sendIdempotencyConflict(res)
          : sendIdempotencyUnavailable(res);
      }
      if (!created.created) {
        return resolveExistingOperation({
          record: created.record,
          fingerprint,
          res,
          readReceipt,
          operationId: authId,
          store: idempotencyStore,
        });
      }
    }

    let tx;
    try {
      tx = await contract.callServiceWithAuthorization(
        providerId, requestHash,
        authorization.from,
        validAfter, validBefore,
        authorization.nonce,
        v, r, s,
      );
    } catch (e) {
      if (!idempotencyStore || !operationId) throw e;
      await transitionOperation(idempotencyStore, operationId, "prepared", {
        state: "unknown",
        updatedAt: Date.now(),
      });
      logError("[x402/call-service] settlement submission failed", e);
      return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
    }

    const txHash = typeof tx?.hash === "string" ? tx.hash : null;
    if (idempotencyStore && operationId) {
      if (!txHash) {
        await transitionOperation(idempotencyStore, operationId, "prepared", {
          state: "unknown",
          updatedAt: Date.now(),
        });
        return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
      }
      const submitted = await transitionOperation(idempotencyStore, operationId, "prepared", {
        state: "submitted",
        txHash,
        attempts: 1,
        updatedAt: Date.now(),
      });
      if (submitted?.ok !== true) {
        return resolveTransitionFailure({
          store: idempotencyStore,
          operationId,
          fingerprint: operationFingerprint,
          txHash,
          res,
        });
      }
    }

    let receipt;
    try {
      receipt = await tx.wait();
    } catch (e) {
      if (!idempotencyStore || !operationId || !txHash) throw e;
      const markedUnknown = await transitionOperation(idempotencyStore, operationId, "submitted", {
        state: "unknown",
        txHash,
        updatedAt: Date.now(),
      });
      logError("[x402/call-service] settlement wait failed", e);
      if (markedUnknown?.ok !== true) {
        return resolveTransitionFailure({
          store: idempotencyStore,
          operationId,
          fingerprint: operationFingerprint,
          txHash,
          res,
        });
      }
      return sendPending(res, {
        code: SETTLEMENT_OUTCOME_UNKNOWN_CODE,
        operationId,
        txHash,
      });
    }

    if (idempotencyStore && operationId) {
      const status = Number(receipt?.status);
      if (status === 0) {
        const updated = await transitionOperation(idempotencyStore, operationId, "submitted", {
          state: "reverted",
          txHash,
          blockNumber: receipt.blockNumber ?? null,
          updatedAt: Date.now(),
        });
        if (updated?.ok !== true) {
          return resolveTransitionFailure({
            store: idempotencyStore,
            operationId,
            fingerprint: operationFingerprint,
            txHash,
            res,
          });
        }
        return sendReverted(res, { txHash, operationId });
      }
      if (status !== 1) {
        const markedUnknown = await transitionOperation(idempotencyStore, operationId, "submitted", {
          state: "unknown",
          txHash,
          updatedAt: Date.now(),
        });
        if (markedUnknown?.ok !== true) {
          return resolveTransitionFailure({
            store: idempotencyStore,
            operationId,
            fingerprint: operationFingerprint,
            txHash,
            res,
          });
        }
        return sendPending(res, {
          code: SETTLEMENT_OUTCOME_UNKNOWN_CODE,
          operationId,
          txHash,
        });
      }
    }

    const callId = parseCallStarted(receipt);
    if (idempotencyStore && operationId) {
      const receiptHash = typeof receipt.hash === "string" ? receipt.hash : txHash;
      const updated = await transitionOperation(idempotencyStore, operationId, "submitted", {
        state: "confirmed",
        txHash: receiptHash,
        callId,
        blockNumber: receipt.blockNumber ?? null,
        updatedAt: Date.now(),
      });
      if (updated?.ok !== true) {
        return resolveTransitionFailure({
          store: idempotencyStore,
          operationId,
          fingerprint: operationFingerprint,
          txHash: receiptHash,
          res,
        });
      }
      return sendConfirmed(res, {
        callId,
        txHash: receiptHash,
        blockNumber: receipt.blockNumber ?? null,
      });
    }

    return res.json({ success: true, callId, txHash: receipt.hash, blockNumber: receipt.blockNumber });

  } catch (e) {
    // Log only non-sensitive fields — e.message may embed the RPC URL + token.
    logError("[x402/call-service] error", e);
    return res.status(500).json({ error: "Internal settlement error" });
  }
}
