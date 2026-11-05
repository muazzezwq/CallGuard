/**
 * POST /api/call-service
 *
 * x402 full flow: EIP-3009 signed payment → on-chain callServiceWithAuthorization
 * Body: { providerId, requestHash } (+ { authorization, signature } for the legacy body path)
 * Payment may also arrive in the standard `PAYMENT-SIGNATURE` header: base64 JSON with
 * `{authorization, signature}` or the `{payload: {authorization}, signature}` shape.
 * Sending both carriers with different values is rejected with 400.
 *
 * A settled call answers with the x402 `PAYMENT-RESPONSE` header (base64 JSON:
 * `{success, transaction, network}`) in addition to the JSON body. Demo mode never
 * emits it, because nothing settled.
 *
 * If FACILITATOR_PRIVATE_KEY is set: real on-chain settlement.
 * Otherwise: fail closed with 503 unless `CALL_SERVICE_DEMO=1` explicitly asks for
 * the local demo response, which never settles and never emits PAYMENT-RESPONSE.
 */

import { ethers } from "ethers";
import { ACTIVE, V8_ACTIVE } from "./_contracts.js";
import { getRpcUrl } from "./_rpc.js";
import { logError } from "./_redact.js";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  callServiceFingerprint,
  createAliasRecord,
  createOperationRecord,
  deriveAliasId,
  deriveAuthorizationId,
  normalizeExplicitKey,
} from "./_idempotency.js";
import { createUpstashIdempotencyStoreFromEnv } from "./_upstash_idempotency_store.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Payment,PAYMENT-SIGNATURE,Payment-Signature,Idempotency-Key",
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
const OPERATION_ABANDONED_CODE = "OPERATION_ABANDONED";
const PREPARED_TTL_MS = 120_000;
// A recorded transaction hash is not proof of settlement. If the receipt never
// appears, the record would otherwise answer 202 forever.
const SUBMITTED_TTL_MS = 15 * 60_000;

const {
  USDC: USDC_ADDR,
  PAY_PER_CALL: CONTRACT,
  SERVICE_REGISTRY: REGISTRY,
  CHAIN_ID,
  NETWORK: ARC_TESTNET_CHAIN_ID,
} = ACTIVE;

const PAY_ABI = V8_ACTIVE
  ? [
      "function callServiceWithAuthorization(uint256 providerId, bytes32 requestHash, address from, uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) external returns (bytes32)",
      "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, uint32 termsVersion, bytes32 termsHash, bytes32 requestHash, uint32 deadline)",
    ]
  : [
      "function callServiceWithAuthorization(uint256 providerId, bytes32 requestHash, address from, uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) external returns (bytes32)",
      "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline)",
    ];

const USDC_ABI = [
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const REGISTRY_ABI = V8_ACTIVE
  ? [
      "function getProvider(uint256 providerId) view returns (address owner, address signer, uint256 stake, uint256 pricePerCall, uint32 latestTermsVersion, bool active, uint32 pendingCalls, uint64 completedCalls, uint64 slashedCalls, uint32 maxConcurrentCalls, uint8 zkTier)",
    ]
  : [
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
          required: ["providerId", "requestHash"],
          properties: {
            providerId:    { type: "integer" },
            requestHash:   { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
            authorization: { type: "object", description: "Legacy body carrier. Standard clients send this in the PAYMENT-SIGNATURE header instead." },
            signature:     { type: "string", pattern: "^0x[0-9a-fA-F]{130}$", description: "Legacy body carrier, see authorization." },
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

/**
 * The standard x402 client sends the payment in the `PAYMENT-SIGNATURE` header:
 * base64 JSON carrying the authorization and its signature. Two shapes exist in
 * the wild — `{authorization, signature}` and `{payload: {authorization}, signature}`
 * — and both are accepted. Returns `{ present: false }` when the header is absent,
 * so the body path keeps working unchanged.
 */
export function parsePaymentHeader(raw) {
  if (raw === undefined || raw === null || raw === "") return { present: false };
  if (typeof raw !== "string") return { present: true, error: "Malformed payment signature" };
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return { present: true, error: "Malformed payment signature" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { present: true, error: "Malformed payment signature" };
  }
  const inner = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : parsed;
  let authorization = inner.authorization;
  if (!authorization && typeof inner.from === "string") {
    // Bare authorization object beside the signature: drop the signature key so
    // the recovered struct is exactly the EIP-3009 fields.
    authorization = { ...inner };
    delete authorization.signature;
  }
  const signature = parsed.signature ?? inner.signature;
  if (!authorization || typeof authorization !== "object" || typeof signature !== "string") {
    return { present: true, error: "Malformed payment signature" };
  }
  return { present: true, authorization, signature };
}

/**
 * A request that carries the payment twice must not be resolved by guessing which
 * one the caller meant: identical copies are fine, different ones are rejected.
 */
export function mergePaymentSource(bodyAuthorization, bodySignature, header) {
  if (!header.present) return { authorization: bodyAuthorization, signature: bodySignature };
  if (!bodyAuthorization && !bodySignature) {
    return { authorization: header.authorization, signature: header.signature };
  }
  const same = JSON.stringify(bodyAuthorization) === JSON.stringify(header.authorization)
    && bodySignature === header.signature;
  if (!same) {
    return { error: "Payment supplied in both the PAYMENT-SIGNATURE header and the body" };
  }
  return { authorization: header.authorization, signature: header.signature };
}

/** Settlement succeeded: answer with the x402 `PAYMENT-RESPONSE` header as well. */
function sendSettled(res, { callId, txHash, blockNumber }) {
  if (txHash) {
    res.setHeader("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({
      success: true,
      transaction: txHash,
      network: ARC_TESTNET_CHAIN_ID,
    })).toString("base64"));
  }
  return res.json({ success: true, callId: callId ?? null, txHash: txHash ?? null, blockNumber: blockNumber ?? null });
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

/**
 * The store owns `state`, `revision` and `updatedAt`, and its transition is a
 * five-argument revision CAS. `handle` is this request's cursor into the record:
 * a successful transition advances it, so a later transition in the same request
 * cannot claim a revision it has already spent.
 */
function operationHandle(record) {
  return {
    operationId: record.operationId,
    state: record.state,
    revision: typeof record.revision === "number" ? record.revision : 0,
  };
}

async function transitionOperation(store, handle, nextState, patch) {
  try {
    const result = await store.transition(
      handle.operationId,
      handle.state,
      handle.revision,
      nextState,
      patch,
    );
    if (result?.ok === true && result.record) {
      handle.state = result.record.state;
      handle.revision = result.record.revision;
    }
    return result;
  } catch (e) {
    logError("[x402/call-service] idempotency transition failed", e);
    return null;
  }
}

function recordAge(record) {
  return typeof record.createdAt === "number" ? Date.now() - record.createdAt : 0;
}

/**
 * How long a record may sit in its current state before the caller is released.
 * `prepared` and a hash-less `unknown` are dead-request cases with nothing to
 * observe, so they expire on the short window. A record that did record a hash
 * waits on the longer one: a submitted transaction can legitimately take
 * minutes, but it cannot stay pending forever.
 */
function recordTtl(record) {
  const hasHash = typeof record.txHash === "string" && record.txHash.length > 0;
  return record.state === "prepared" || !hasHash ? PREPARED_TTL_MS : SUBMITTED_TTL_MS;
}

/**
 * A request that died between reserving the authorization and recording a
 * transaction would otherwise hold the key forever. Moving the record to
 * `abandoned` frees the caller but never resubmits: the process may have
 * broadcast before it died, so the answer tells the caller to check the chain
 * and lets the authorization nonce decide whether a retry can settle.
 */
async function abandonStale({ record, store, res, operationId }) {
  const updated = await transitionOperation(store, operationHandle(record), "abandoned", {});
  if (updated?.ok !== true) {
    return sendPending(res, {
      code: record.txHash ? SETTLEMENT_OUTCOME_UNKNOWN_CODE : SUBMISSION_OUTCOME_UNKNOWN_CODE,
      operationId,
      txHash: record.txHash,
    });
  }
  return sendAbandoned(res, { operationId, txHash: record.txHash });
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

function sendAbandoned(res, { operationId, txHash }) {
  const body = {
    success: false,
    code: OPERATION_ABANDONED_CODE,
    error:
      "The earlier attempt stopped before it recorded a transaction. Check the payment authorization on chain before retrying; this operation is never resubmitted automatically.",
    operationId,
  };
  if (txHash) body.txHash = txHash;
  return res.status(409).json(body);
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
  return sendSettled(res, {
    callId: record.callId,
    txHash: record.txHash,
    blockNumber: record.blockNumber,
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
  if (record.state === "abandoned") {
    return sendAbandoned(res, { operationId, txHash: record.txHash });
  }
  if (record.state === "prepared") {
    if (recordAge(record) >= recordTtl(record)) {
      return abandonStale({ record, store, res, operationId });
    }
    return sendPending(res, { code: OPERATION_IN_PROGRESS_CODE, operationId });
  }

  const txHash = typeof record.txHash === "string" ? record.txHash : null;
  if (!txHash) {
    // `unknown` with nothing to observe is the same dead-request case as
    // `prepared`: without the window the authorization stays locked.
    if (recordAge(record) >= recordTtl(record)) {
      return abandonStale({ record, store, res, operationId });
    }
    return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
  }
  let sawReceipt = false;
  if (typeof readReceipt === "function") {
    let receipt;
    try {
      receipt = await readReceipt(txHash);
    } catch (e) {
      logError("[x402/call-service] receipt read failed", e);
      return sendPending(res, { code: SETTLEMENT_OUTCOME_UNKNOWN_CODE, operationId, txHash });
    }
    sawReceipt = Boolean(receipt);
    if (receipt && Number(receipt.status) === 0) {
      const updated = await transitionOperation(store, operationHandle(record), "reverted", {
        txHash,
        blockNumber: receipt.blockNumber ?? null,
      });
      if (updated?.ok !== true) {
        return resolveTransitionFailure({ store, operationId, fingerprint, txHash, res });
      }
      return sendReverted(res, { txHash, operationId });
    }
    if (receipt && Number(receipt.status) === 1) {
      const callId = parseCallStarted(receipt);
      const receiptHash = typeof receipt.hash === "string" ? receipt.hash : txHash;
      const updated = await transitionOperation(store, operationHandle(record), "confirmed", {
        txHash: receiptHash,
        callId,
        blockNumber: receipt.blockNumber ?? null,
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
  // Nothing is mined yet. Before the window closes that is a normal pending
  // state; after it, the transaction hash is not going to settle and the caller
  // must be released instead of polling 202 forever.
  if (!sawReceipt && recordAge(record) >= recordTtl(record)) {
    return abandonStale({ record, store, res, operationId });
  }
  return sendPending(res, { code: SETTLEMENT_OUTCOME_UNKNOWN_CODE, operationId, txHash });
}

export function createCallServiceHandler(options = {}) {
  return (req, res) => handler(req, res, options);
}

/** Sentinel: the store was configured but could not be built. Fail closed. */
const IDEMPOTENCY_STORE_FAILED = Symbol("idempotency-store-failed");

export const DEFAULT_IDEMPOTENCY_KEY_PREFIX = "callguard:idempotency:call-service:";

/**
 * The store the default export uses, resolved per invocation from the environment.
 *
 * Activation is explicit in every other environment, and on by default in a
 * production deployment. `UPSTASH_REDIS_REST_URL` may already be set for rate
 * limiting, so presence alone must not flip payment behaviour outside production.
 *
 * Four outcomes, and the difference between the failure ones is the whole point:
 * - an object: the switch is enabled (or production defaulted it on) and both Upstash vars are set;
 * - `null`: explicitly disabled, or not production and not enabled. The endpoint keeps
 *   its no-store behaviour;
 * - `IDEMPOTENCY_STORE_FAILED`: enabled but unusable (one var missing, a bad
 *   token). Answering 503 is the only safe response: silently falling back to the
 *   no-store path would settle a second payment for the same authorization, which
 *   is the failure this store exists to prevent.
 */
export function resolveDefaultIdempotencyStore(env = process.env) {
  if (!isIdempotencyEnabled(env)) return null;
  try {
    return createUpstashIdempotencyStoreFromEnv({
      env,
      keyPrefix: env?.IDEMPOTENCY_KEY_PREFIX || DEFAULT_IDEMPOTENCY_KEY_PREFIX,
    });
  } catch (e) {
    logError("[x402/call-service] idempotency store unavailable", e);
    return IDEMPOTENCY_STORE_FAILED;
  }
}

function isIdempotencyEnabled(env) {
  const raw = typeof env?.CALL_SERVICE_IDEMPOTENCY === "string"
    ? env.CALL_SERVICE_IDEMPOTENCY.trim().toLowerCase()
    : "";
  if (["disabled", "off", "false", "0"].includes(raw)) return false;
  if (["enabled", "1", "true"].includes(raw)) return true;
  return env?.VERCEL_ENV === "production" || env?.NODE_ENV === "production";
}

/** Receipt reader for record recovery: `null` while the transaction is unmined. */
export async function readTransactionReceipt(txHash) {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) return null;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider.getTransactionReceipt(txHash);
}

/** How many records one sweep may inspect. See `recoverOperations`. */
export const RECOVERY_LIMIT = 200;

const TERMINAL_STATES = new Set(["confirmed", "reverted", "abandoned"]);

// Constant-time secret comparison (hash first so lengths always match).
function secretEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Advance one record without a caller in the loop.
 *
 * The retry path in `resolveExistingOperation` only helps a caller who asks
 * again with the same authorization. If the client gave up (or died), a record
 * that reached `submitted` stayed there forever, and its nonce stayed reserved.
 * This sweep resolves it from the chain alone.
 *
 * It never broadcasts: a hash is only ever observed, never submitted. A record
 * whose receipt is missing and whose window has not closed stays `pending` for
 * the next sweep, because a transaction can legitimately take minutes.
 */
async function recoverOne({ store, id, readReceipt = null }) {
  const record = await store.get(id);
  if (!record || record.kind !== "operation") return "skipped";
  if (TERMINAL_STATES.has(record.state)) return "skipped";
  const handle = operationHandle(record);
  const stale = recordAge(record) >= recordTtl(record);
  const txHash = typeof record.txHash === "string" && record.txHash ? record.txHash : null;

  if (!txHash) {
    if (!stale) return "pending";
    const updated = await transitionOperation(store, handle, "abandoned", {});
    return updated?.ok === true ? "abandoned" : "failed";
  }
  if (typeof readReceipt !== "function") return "pending";

  let receipt;
  try {
    receipt = await readReceipt(txHash);
  } catch (e) {
    logError("[x402/call-service] recovery receipt read failed", e);
    return "pending";
  }
  if (!receipt) {
    if (!stale) return "pending";
    const updated = await transitionOperation(store, handle, "abandoned", { txHash });
    return updated?.ok === true ? "abandoned" : "failed";
  }
  if (Number(receipt.status) === 0) {
    const updated = await transitionOperation(store, handle, "reverted", {
      txHash,
      blockNumber: receipt.blockNumber ?? null,
    });
    return updated?.ok === true ? "reverted" : "failed";
  }
  const receiptHash = typeof receipt.hash === "string" ? receipt.hash : txHash;
  const updated = await transitionOperation(store, handle, "confirmed", {
    txHash: receiptHash,
    callId: parseCallStarted(receipt),
    blockNumber: receipt.blockNumber ?? null,
  });
  return updated?.ok === true ? "confirmed" : "failed";
}

/**
 * One sweep pass over the store.
 *
 * Only one SCAN page is read per call, so the sweep is bounded by `limit` rather
 * than by the size of the keyspace. Records that are skipped or pending simply
 * wait for the next pass; the retention window on every write is what keeps the
 * keyspace finite, not this loop.
 */
export async function recoverOperations({ store, readReceipt = null, limit = RECOVERY_LIMIT } = {}) {
  const counts = {
    scanned: 0,
    confirmed: 0,
    reverted: 0,
    abandoned: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
  };
  if (!store || typeof store.scanIds !== "function") return counts;
  const page = await store.scanIds({ count: limit });
  for (const id of page.ids || []) {
    counts.scanned += 1;
    try {
      const outcome = await recoverOne({ store, id, readReceipt });
      if (outcome in counts) counts[outcome] += 1;
      else counts.skipped += 1;
    } catch (e) {
      logError("[x402/call-service] recovery step failed", e);
      counts.failed += 1;
    }
  }
  return counts;
}

function isRecoveryRequest(req) {
  if (req?.query?.recovery === "1") return true;
  try {
    const url = new URL(req?.url || "/", "http://localhost");
    return url.searchParams.get("recovery") === "1";
  } catch {
    return false;
  }
}

/**
 * `GET /api/idempotency-recovery` — reached through a `vercel.json` rewrite onto
 * `/api/call-service?recovery=1`, because the Hobby plan caps a deployment at
 * twelve serverless functions and the API already has twelve.
 *
 * Vercel cron sends `Authorization: Bearer $CRON_SECRET` on its own. Callers that
 * cannot set that header may use `x-recovery-secret` instead.
 */
async function recoveryHandler(req, res, env) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  const secret = env?.CRON_SECRET;
  if (typeof secret !== "string" || !secret) {
    return res.status(503).json({ error: "Recovery is not configured", code: "RECOVERY_NOT_CONFIGURED" });
  }
  const authorization = req.headers?.authorization;
  const bearer =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
  const provided = bearer || req.headers?.["x-recovery-secret"] || "";
  if (!secretEquals(provided, secret)) {
    return res.status(401).json({ error: "Unauthorized", code: "RECOVERY_UNAUTHORIZED" });
  }
  const store = resolveDefaultIdempotencyStore(env);
  if (store === IDEMPOTENCY_STORE_FAILED) return sendIdempotencyUnavailable(res);
  if (!store) {
    return res.status(503).json({ error: "Idempotency store is disabled", code: IDEMPOTENCY_UNAVAILABLE_CODE });
  }
  try {
    const counts = await recoverOperations({ store, readReceipt: readTransactionReceipt });
    return res.status(200).json({ ok: true, ...counts });
  } catch (e) {
    logError("[x402/call-service] recovery sweep failed", e);
    // A sweep failure is not a payment-safety failure: the payment path never
    // calls this code. Answering 503 here would make a broken sweep look like a
    // broken store, which is a different and much more urgent problem.
    return res.status(500).json({
      error: "Recovery sweep failed",
      code: "RECOVERY_FAILED",
      detail: typeof e?.code === "string" ? e.code : "UNKNOWN",
      status: typeof e?.status === "number" ? e.status : null,
      // The adapter's own messages are canned strings, and node's fetch failures
      // carry the useful signal in cause.code (ENOTFOUND, ECONNREFUSED, ...).
      // Without them a transport failure is indistinguishable from a timeout,
      // and the runtime logs are not readable from this deployment.
      reason: typeof e?.message === "string" ? e.message : null,
      cause: typeof e?.cause?.code === "string" ? e.cause.code : null,
    });
  }
}

export default function defaultHandler(req, res, env = process.env) {
  if (isRecoveryRequest(req)) return recoveryHandler(req, res, env);
  const store = resolveDefaultIdempotencyStore(env);
  if (store === IDEMPOTENCY_STORE_FAILED) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return sendIdempotencyUnavailable(res);
  }
  return handler(req, res, { idempotencyStore: store, readReceipt: readTransactionReceipt });
}

async function handler(req, res, { idempotencyStore = null, readReceipt = null } = {}) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body || {};
  const { providerId: rawProviderId, requestHash } = body;
  // `PAYMENT-SIGNATURE` is the standard x402 carrier. The body fields stay
  // supported so every existing client keeps working; supplying both with
  // different values is rejected rather than guessed.
  const headerPayment = parsePaymentHeader(req.headers?.["payment-signature"]);
  if (headerPayment.error) {
    return res.status(400).json({ error: headerPayment.error, code: INVALID_REQUEST_CODE });
  }
  const merged = mergePaymentSource(body.authorization, body.signature, headerPayment);
  if (merged.error) {
    return res.status(400).json({ error: merged.error, code: INVALID_REQUEST_CODE });
  }
  const authorization = merged.authorization;
  const signature = merged.signature;
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

    // Demo mode is opt-in. Production without a settlement key is a
    // configuration failure, not a successful call, so it must not answer 200.
    if (!process.env.FACILITATOR_PRIVATE_KEY) {
      if (process.env.CALL_SERVICE_DEMO !== "1") {
        console.error("[x402/call-service] FACILITATOR_PRIVATE_KEY is not set; refusing to settle");
        return res.status(503).json({
          error: "Settlement is not configured on this deployment",
          code: "SETTLEMENT_UNCONFIGURED",
        });
      }
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
    let operation = null;
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
      operation = operationHandle(created.record);
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
      await transitionOperation(idempotencyStore, operation, "unknown", {});
      logError("[x402/call-service] settlement submission failed", e);
      return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
    }

    const txHash = typeof tx?.hash === "string" ? tx.hash : null;
    if (idempotencyStore && operationId) {
      if (!txHash) {
        await transitionOperation(idempotencyStore, operation, "unknown", {});
        return sendPending(res, { code: SUBMISSION_OUTCOME_UNKNOWN_CODE, operationId });
      }
      const submitted = await transitionOperation(idempotencyStore, operation, "submitted", {
        txHash,
        attempts: 1,
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
      const markedUnknown = await transitionOperation(idempotencyStore, operation, "unknown", {
        txHash,
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
        const updated = await transitionOperation(idempotencyStore, operation, "reverted", {
          txHash,
          blockNumber: receipt.blockNumber ?? null,
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
        const markedUnknown = await transitionOperation(idempotencyStore, operation, "unknown", {
          txHash,
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
      const updated = await transitionOperation(idempotencyStore, operation, "confirmed", {
        txHash: receiptHash,
        callId,
        blockNumber: receipt.blockNumber ?? null,
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

    return sendSettled(res, { callId, txHash: receipt.hash, blockNumber: receipt.blockNumber });

  } catch (e) {
    // Log only non-sensitive fields — e.message may embed the RPC URL + token.
    logError("[x402/call-service] error", e);
    return res.status(500).json({ error: "Internal settlement error" });
  }
}
