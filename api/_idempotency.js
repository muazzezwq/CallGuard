// Shared idempotency primitives for payment routes.
//
// This module deliberately contains no Redis client. A durable store must be
// injected by the caller; the in-memory test store lives in tests/. The default
// call-service handler does not inject a store, so this file does not change
// production payment behavior on its own.
//
// Store contract (must be atomic across processes/instances):
//   create(record)  -> { created: true, record } | { created: false, record }
//   get(id)         -> record | null
//   transition(id, expectedState, patch)
//                   -> { ok: true, record } | { ok: false, record }
//
// Per-key invariants the store must enforce atomically:
//   1. `create` is create-if-absent. It never overwrites. On a race every loser
//      receives the winner's record (`created: false`).
//   2. `get` observes every completed `create`/`transition` in the same
//      consistency domain; it must not report an absent record after a
//      successful create that the same client is allowed to observe.
//   3. `transition` is a compare-and-set on `state`. Two writers given the same
//      expected state cannot both receive `ok: true`.
//   4. Alias records are immutable: alias key, authId, and fingerprint never
//      change after creation.
//
// No atomic multi-key transaction is required for payment safety:
//   - The canonical operation `create` is the single submission gate.
//   - An alias is a secondary index; it never authorises submission.
//   - An orphan alias (alias written, operation create failed or the process
//     crashed) cannot create a second operation. A retry with the same signed
//     authorization repairs it by creating the operation.
//   - A key reused for a different authorization or fingerprint is rejected by
//     the alias before any operation lookup or submission.
// The store still needs orphan-alias TTL/cleanup before production activation.
// The in-memory test fake is not evidence of distributed atomicity.
//
// Two record kinds share this contract:
//   operation: keyed by <operation>:auth:<from>:<nonce>; owns the payment.
//   alias:     keyed by <operation>:key:<explicit key>; points at an operation.
// call-service passes the explicit scope "call-service" for both.
//
// An explicit key is written as an alias first, then the signed authorization
// writes the canonical operation.

import { createHash } from "node:crypto";

const EXPLICIT_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/** Stable JSON so equal values produce equal fingerprints. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  const fields = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${fields.join(",")}}`;
}

/** Explicit keys are opaque, but must be bounded and safe to embed in a Redis key. */
export function normalizeExplicitKey(raw) {
  if (typeof raw !== "string") return null;
  return EXPLICIT_KEY_RE.test(raw) ? raw : null;
}

function normalized(value) {
  return typeof value === "string" ? value.toLowerCase() : String(value);
}

/**
 * Every id and fingerprint carries an explicit operation scope. There is no
 * implicit default: a new payment route must name its own scope so records from
 * different endpoints can never be mistaken for the same operation.
 */
function requireScope(operation) {
  if (typeof operation !== "string" || operation.length === 0) {
    throw new TypeError("operation scope is required");
  }
  return normalized(operation);
}

function requireText(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

/**
 * The signed authorization is always the canonical operation identity. A retry
 * of the same signed authorization is the same operation, while a new
 * authorization (new nonce) is a new payment attempt. This deliberately avoids
 * treating providerId + requestHash + payer as a permanent unique purchase and
 * prevents an explicit key from creating a second operation for one signature.
 */
export function deriveAuthorizationId({ operation, authorization }) {
  return `${requireScope(operation)}:auth:${normalized(authorization?.from)}:${normalized(authorization?.nonce)}`;
}

/** An explicit key is a secondary index, never the canonical operation id. */
export function deriveAliasId({ operation, explicitKey }) {
  const scope = requireScope(operation);
  return explicitKey ? `${scope}:key:${explicitKey}` : null;
}

/** Canonical fingerprint of every payment field the operation depends on. */
export function callServiceFingerprint({
  operation,
  chainId,
  contract,
  asset,
  providerId,
  requestHash,
  authorization,
}) {
  const payload = {
    fingerprintVersion: 2,
    operation: requireScope(operation),
    chainId: String(chainId),
    contract: normalized(requireText(contract, "contract")),
    asset: normalized(requireText(asset, "asset")),
    providerId: String(providerId),
    requestHash: normalized(requestHash),
    authorization: {
      from: normalized(authorization?.from),
      to: normalized(authorization?.to),
      value: String(authorization?.value),
      validAfter: String(authorization?.validAfter),
      validBefore: String(authorization?.validBefore),
      nonce: normalized(authorization?.nonce),
    },
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function createOperationRecord({
  operationId,
  authId = operationId,
  fingerprint,
  explicitKey = null,
  now = Date.now(),
}) {
  return {
    version: 1,
    kind: "operation",
    operationId,
    authId,
    ...(explicitKey ? { explicitKey } : {}),
    fingerprint,
    state: "prepared",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
}

/** Secondary index: one explicit key -> one canonical authorization operation. */
export function createAliasRecord({ aliasId, authId, fingerprint, now = Date.now() }) {
  return {
    version: 1,
    kind: "alias",
    operationId: aliasId,
    aliasId,
    authId,
    fingerprint,
    createdAt: now,
    updatedAt: now,
  };
}
