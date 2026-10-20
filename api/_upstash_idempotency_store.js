// Stage 2 Upstash REST EVAL adapter for idempotency records.
//
// This module is server-only and deliberately not wired into any route. It
// stores JSON records through the existing Upstash REST credentials named
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. It does not read them at
// module load; callers must opt in with createUpstashIdempotencyStoreFromEnv().
//
// Contract:
//   create(record)
//     -> { created: true, record } | { created: false, record }
//   get(id)
//     -> record | null
//   transition(id, expectedState, expectedRevision, nextState, patch)
//     -> { ok: true, record } | { ok: false, record: null | record }
//
// The five-argument transition is intentional. Stage 1 requires revision CAS;
// the older three-argument state-only shape is not implemented because it
// cannot distinguish two writers that observed the same state. The adapter
// owns state, revision, and updatedAt. Callers may not patch identity, lease,
// nonce, or reservation fields through transition.
//
// Atomicity boundary:
//   - create and transition are each one EVAL command. /pipeline is never used.
//   - create is create-if-absent. A race loser receives the winner's record.
//   - transition is a state + revision compare-and-set. It never performs a
//     read-modify-write across two REST commands.
//   - get is a single GET. It is not a substitute for CAS.
//   - No in-memory fallback exists. Transport, HTTP, and response errors throw.
//
// This adapter does not allocate sender nonces, sign transactions, persist raw
// signed transactions, claim recovery leases, or wire production idempotency.
// Those remain later-stage decisions. Local mock tests cannot prove Upstash's
// distributed atomicity; only an isolated real Upstash integration can.

import { redact } from "./_redact.js";

const DEFAULT_TIMEOUT_MS = 5_000;

const CREATE_SCRIPT = `
-- create-if-absent
local existing = redis.call("GET", KEYS[1])
if existing then
  return {0, existing}
end
redis.call("SET", KEYS[1], ARGV[1])
return {1, ARGV[1]}
`;

const TRANSITION_SCRIPT = `
-- transition-cas
local existing = redis.call("GET", KEYS[1])
if not existing then
  return {0, false}
end
local record = cjson.decode(existing)
if record["state"] ~= ARGV[1] then
  return {0, existing}
end
if tonumber(record["revision"]) ~= tonumber(ARGV[2]) then
  return {0, existing}
end
local patch = cjson.decode(ARGV[4])
for key, value in pairs(patch) do
  record[key] = value
end
record["state"] = ARGV[3]
record["revision"] = tonumber(ARGV[2]) + 1
record["updatedAt"] = tonumber(ARGV[5])
local updated = cjson.encode(record)
redis.call("SET", KEYS[1], updated)
return {1, updated}
`;

const PROTECTED_PATCH_FIELDS = new Set([
  "version",
  "kind",
  "operationId",
  "authId",
  "aliasId",
  "fingerprint",
  "explicitKey",
  "reservationId",
  "sender",
  "nonce",
  "state",
  "revision",
  "lease",
  "createdAt",
  "updatedAt",
  "__proto__",
  "constructor",
  "prototype",
]);

export class UpstashIdempotencyStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "UpstashIdempotencyStoreError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function fail(code, message, options) {
  throw new UpstashIdempotencyStoreError(code, message, options);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isTimestamp(value) {
  return Number.isInteger(value) && value >= 0;
}

function normalizeBaseUrl(raw) {
  if (!isNonEmptyString(raw)) {
    fail("UPSTASH_INVALID_CONFIG", "Upstash URL is required");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("UPSTASH_INVALID_CONFIG", "Upstash URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    fail("UPSTASH_INVALID_CONFIG", "Upstash URL must be HTTP(S)");
  }
  if (url.username || url.password) {
    fail("UPSTASH_INVALID_CONFIG", "Upstash URL must not contain credentials");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function assertToken(token) {
  if (!isNonEmptyString(token) || /[\r\n]/.test(token)) {
    fail("UPSTASH_INVALID_CONFIG", "Upstash token is required");
  }
}

function assertId(id) {
  if (!isNonEmptyString(id)) fail("INVALID_ARGUMENT", "record id is required");
}

function parseStoredRecord(raw) {
  if (raw === null || raw === undefined || raw === false || raw === "") return null;
  if (typeof raw !== "string") {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash returned a non-string record");
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash returned invalid record JSON");
  }
  if (!isPlainObject(record)) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash returned a non-object record");
  }
  return record;
}

function parseCreateResult(result) {
  if (!Array.isArray(result) || result.length < 2) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash create result is invalid");
  }
  if (result[0] !== 0 && result[0] !== 1) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash create flag is invalid");
  }
  const record = parseStoredRecord(result[1]);
  if (!record) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash create result has no record");
  }
  return { created: result[0] === 1, record };
}

function parseTransitionResult(result) {
  if (!Array.isArray(result) || result.length < 2) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash transition result is invalid");
  }
  if (result[0] !== 0 && result[0] !== 1) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash transition flag is invalid");
  }
  const record = parseStoredRecord(result[1]);
  if (result[0] === 1 && !record) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash transition result has no record");
  }
  return { ok: result[0] === 1, record };
}

function parseUpstashPayload(payload) {
  if (!isPlainObject(payload)) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash returned an invalid response");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "error")) {
    const text = typeof payload.error === "string" ? redact(payload.error) : "Upstash returned an error";
    fail("UPSTASH_RESPONSE_ERROR", text || "Upstash returned an error");
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "result")) {
    fail("UPSTASH_INVALID_RESPONSE", "Upstash response has no result");
  }
  return payload.result;
}

export function createUpstashIdempotencyStore({
  url,
  token,
  keyPrefix,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  if (!isNonEmptyString(keyPrefix)) {
    fail("UPSTASH_INVALID_CONFIG", "keyPrefix is required");
  }
  if (typeof fetchImpl !== "function") {
    fail("UPSTASH_INVALID_CONFIG", "fetch implementation is required");
  }
  if (!isPositiveInteger(timeoutMs)) {
    fail("UPSTASH_INVALID_CONFIG", "timeoutMs must be a positive integer");
  }
  if (typeof now !== "function") {
    fail("UPSTASH_INVALID_CONFIG", "now must be a function");
  }
  assertToken(token);
  const baseUrl = normalizeBaseUrl(url);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  function keyFor(id) {
    assertId(id);
    return `${keyPrefix}${id}`;
  }

  async function request(command) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new UpstashIdempotencyStoreError(
          "UPSTASH_UNAVAILABLE",
          "Upstash request timed out",
        ));
      }, timeoutMs);
    });

    try {
      let response;
      try {
        response = await Promise.race([
          Promise.resolve().then(() => fetchImpl(baseUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(command),
            signal: controller.signal,
          })),
          timeout,
        ]);
      } catch (error) {
        if (error instanceof UpstashIdempotencyStoreError) throw error;
        throw new UpstashIdempotencyStoreError(
          "UPSTASH_UNAVAILABLE",
          "Upstash request failed",
          { cause: error },
        );
      }

      if (!response || typeof response.text !== "function") {
        fail("UPSTASH_INVALID_RESPONSE", "Upstash returned an invalid HTTP response");
      }
      if (!response.ok) {
        fail(
          "UPSTASH_HTTP_ERROR",
          `Upstash HTTP ${response.status}`,
          { status: response.status },
        );
      }

      let text;
      try {
        text = await response.text();
      } catch (error) {
        throw new UpstashIdempotencyStoreError(
          "UPSTASH_UNAVAILABLE",
          "Upstash response could not be read",
          { cause: error },
        );
      }
      if (typeof text !== "string" || !text) {
        fail("UPSTASH_INVALID_RESPONSE", "Upstash returned an empty response");
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        fail("UPSTASH_INVALID_RESPONSE", "Upstash returned invalid JSON");
      }
      return parseUpstashPayload(payload);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function create(record) {
    if (!isPlainObject(record)) {
      fail("INVALID_ARGUMENT", "record must be an object");
    }
    if (!isNonEmptyString(record.operationId)) {
      fail("INVALID_ARGUMENT", "record.operationId is required");
    }
    let encoded;
    try {
      encoded = JSON.stringify(record);
    } catch {
      fail("INVALID_ARGUMENT", "record is not JSON serializable");
    }
    if (typeof encoded !== "string") {
      fail("INVALID_ARGUMENT", "record is not JSON serializable");
    }
    const key = keyFor(record.operationId);
    return parseCreateResult(await request(["EVAL", CREATE_SCRIPT, "1", key, encoded]));
  }

  async function get(id) {
    const result = await request(["GET", keyFor(id)]);
    return parseStoredRecord(result);
  }

  async function transition(id, expectedState, expectedRevision, nextState, patch = {}) {
    if (!isNonEmptyString(expectedState)) {
      fail("INVALID_ARGUMENT", "expectedState is required");
    }
    if (!isNonNegativeInteger(expectedRevision)) {
      fail("INVALID_ARGUMENT", "expectedRevision must be a non-negative integer");
    }
    if (!isNonEmptyString(nextState)) {
      fail("INVALID_ARGUMENT", "nextState is required");
    }
    if (!isPlainObject(patch)) {
      fail("INVALID_PATCH", "patch must be an object");
    }
    for (const field of Object.keys(patch)) {
      if (PROTECTED_PATCH_FIELDS.has(field)) {
        fail("INVALID_PATCH", `patch cannot change ${field}`);
      }
    }
    const updatedAt = now();
    if (!isTimestamp(updatedAt)) {
      fail("INVALID_ARGUMENT", "now must return a non-negative integer");
    }
    let encoded;
    try {
      encoded = JSON.stringify(patch);
    } catch {
      fail("INVALID_PATCH", "patch is not JSON serializable");
    }
    if (typeof encoded !== "string") {
      fail("INVALID_PATCH", "patch is not JSON serializable");
    }

    const result = await request([
      "EVAL",
      TRANSITION_SCRIPT,
      "1",
      keyFor(id),
      expectedState,
      String(expectedRevision),
      nextState,
      encoded,
      String(updatedAt),
    ]);
    return parseTransitionResult(result);
  }

  return { create, get, transition };
}

export function createUpstashIdempotencyStoreFromEnv({
  env = process.env,
  ...options
} = {}) {
  const url = env?.UPSTASH_REDIS_REST_URL;
  const token = env?.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    fail(
      "UPSTASH_NOT_CONFIGURED",
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required",
    );
  }
  return createUpstashIdempotencyStore({ ...options, url, token });
}
