# Step 7 — API and settlement pass

**Scope:** every file in `api/`, `vercel.json` routing/CORS/CSP, and the settlement helper chain.
**Mode:** static read of the deployed source at commit `3e279bd`; no live requests, no credentials used.

## Endpoint inventory

| Route | File | Auth | Money side effect | Evidence |
|---|---|---|---|---|
| `POST /api/call-service` | `api/call-service.js` | EIP-3009 signature + provider lookup | Submits `callServiceWithAuthorization`, moves USDC | `api/call-service.js:866-1295` |
| `POST /callService` (rewrite) | `vercel.json:24` | same | same | `vercel.json:24` |
| `GET /api/idempotency-recovery` | `api/call-service.js:809` | `CRON_SECRET` bearer or `x-recovery-secret` | Resumes pending settlements | `api/call-service.js:809-838` |
| `GET/POST /api/nano-call` | `api/nano-call.js` | `NANO_API_KEY` (fail-closed) | Spends `BUYER_PRIVATE_KEY` | `api/nano-call.js:202-216` |
| `GET /api/attestation` | `api/attestation.js` | none (read-only) | none | `api/attestation.js:175-227` |
| `POST /api/attestation` | `api/attestation.js` | — | **disabled**, always `503` | `api/attestation.js:230-235` |
| `GET /api/evidence` (rewrite to `attestation?evidence=1`) | `api/_evidence.js` | none (read-only) | none | `api/_evidence.js:204-296` |
| `GET/POST /api/energy-data` | `api/energy-data.js` | EIP-3009 `X-Payment` header | `transferWithAuthorization` | `api/energy-data.js:80-146` |
| `GET/POST /api/premium-report` | `api/premium-report.js` | EIP-3009 `X-Payment` header | `transferWithAuthorization` | `api/premium-report.js:59-109` |
| `GET /api/marketplace`, `unified-balance`, `ping-provider`, `notify-provider`, `provider-page`, `widget`, `auto-receipt` | various | none or HMAC | read-only / outbound notify | `vercel.json:6-19` |

## What is correctly enforced

- `/api/call-service` rejects a demo response unless `CALL_SERVICE_DEMO=1`, and answers `503 SETTLEMENT_UNCONFIGURED` otherwise (`api/call-service.js:1105-1117`).
- Replay is checked against `authorizationState` before any later validation can mask it (`api/call-service.js:1041-1048`).
- `authorization.to` must equal the settlement contract and `authorization.value` must equal the provider's `pricePerCall` exactly (`api/call-service.js:1067-1086`).
- `energy-data` checks recipient, minimum value, and validity window before settling (`api/energy-data.js:99-104`); `premium-report` checks recipient and minimum value (`api/premium-report.js:96-100`).
- `nano-call` compares the API key with `timingSafeEqual` and fails closed when `NANO_API_KEY` is unset (`api/nano-call.js:202-211`, `:44`).
- `POST /api/attestation` is hard-disabled, so the read-only surface cannot be turned into a write path (`api/attestation.js:230-235`).

## Findings

### CG-API-01 — an API deployment silently falls back to the retired v7 contracts
- Severity: Medium
- Confidence: High
- Evidence: `api/_contracts.js:23-29`, `:31`
- Precondition: `SERVICE_REGISTRY_V8` or `PAY_PER_CALL_V8` missing (or misspelled) in a deployment environment.
- Impact: `V8_ACTIVE` is false, `ACTIVE` becomes the v7 pair, and `/api/call-service` builds its settlement contract from `CONTRACT = ACTIVE.PAY_PER_CALL`. Requests then target the retired v7 `PayPerCall` (`0x5fb41dd2…`) instead of `PayPerCallV8`. Because v7 is read-only since the cutover, the practical result is reverted settlements after the caller has already signed a payment authorization — a silent misconfiguration rather than a fund loss, but the endpoint answers `502/500` shapes instead of a clear `503` and the operator gets no signal.
- Existing mitigation: none; the module-level `ACTIVE` is computed at import and never re-checked against a health signal.
- Required fix: treat a missing v8 pair as a configuration error on money routes — `503` instead of a legacy fallback — and keep the v7 fallback only for explicitly read-only routes.
- Verification: `tests/api-rpc-config.test.ts`, `tests/active-contracts.test.ts`; a new test asserting `503` when the v8 pair is absent.

### CG-API-02 — `/api/call-service` has no request-level abuse control
- Severity: Medium
- Confidence: High
- Evidence: `api/call-service.js:866-905`, `:1035-1050`; `vercel.json:5-20`
- Precondition: an unauthenticated client can POST arbitrary bodies.
- Impact: every POST that reaches the payment branch performs at least two RPC reads (`getProvider`, `authorizationState`) against the shared Arc RPC, plus a `JsonRpcProvider` construction. A trivially forged authorization (well-formed addresses, random nonce, random signature) is rejected only after those reads, so a loop of cheap requests consumes the shared RPC quota and the function's 25 s budget. There is no IP or account rate limit on this route; `nano-call` has one (`api/nano-call.js:213-217`), `call-service` does not.
- Existing mitigation: Vercel platform-level concurrency limits only.
- Required fix: add the same Upstash-backed limiter used by `nano-call`, keyed by IP, with a fail-open-but-logged behavior so a limiter outage cannot block payments.
- Verification: a test that a burst above the limit answers `429` and that a missing Upstash config degrades to allow-with-log rather than block.

### CG-API-03 — a settled response can carry `callId: null`
- Severity: Low
- Confidence: High
- Evidence: `api/call-service.js:318-327`, `:274-283`, `:1268-1270`
- Precondition: the settlement transaction succeeds but the `CallStarted` log is absent or shaped unexpectedly (different contract, renamed event, provider-constructed receipt).
- Impact: `sendSettled` returns `success: true` with `callId: null`. A client that keys its follow-up (submit receipt, dispute) on `callId` cannot proceed, and the response does not distinguish "settled but unparsed" from "settled and identified".
- Existing mitigation: none.
- Required fix: return an explicit field (for example `callIdParse: "missing"`) or a non-2xx status when a settlement is confirmed but the call id cannot be recovered, so the caller knows to reconcile by transaction hash.
- Verification: a unit test with a receipt carrying no `CallStarted` log.

### CG-API-04 — `settleEip3009` trusts its callers for recipient, amount, and expiry
- Severity: Low
- Confidence: High
- Evidence: `api/_settle.js:22-52`
- Precondition: a future endpoint calls `settleEip3009` without its own validation.
- Impact: the helper settles whatever authorization it is handed. Both current callers validate first (`api/energy-data.js:99-104`, `api/premium-report.js:96-100`), so there is no live exploit; the risk is that the shared helper looks like the security boundary when it is not.
- Existing mitigation: caller-side validation in both endpoints.
- Required fix: move the recipient/minimum-value/window checks into `settleEip3009` as required parameters, so a new caller cannot omit them.
- Verification: a test that `settleEip3009` refuses an authorization whose `to` is not the configured payee.

### CG-API-05 — the idempotency store has no orphan-alias cleanup in production
- Severity: Low
- Confidence: High
- Evidence: `api/_idempotency.js:29-30` ("The store still needs orphan-alias TTL/cleanup before production activation"), `api/call-service.js:660-680`, `:1099-1150`
- Precondition: production now defaults the store on, and a request that writes an alias can fail before writing the canonical operation.
- Impact: orphan alias keys accumulate in Upstash with no TTL. Volume is bounded by request count, but the code's own comment marks this as an activation prerequisite that the default-on change skipped.
- Existing mitigation: aliases are only written when the client sends `Idempotency-Key`.
- Required fix: set a TTL on alias records (and a longer one on operations), or add a sweep to the existing `/api/idempotency-recovery` cron.
- Verification: a store test asserting the TTL argument on alias create.

### CG-API-06 — `DISPUTE_V2` names the `DisputeV4` address
- Severity: Low
- Confidence: High
- Evidence: `api/_contracts.js:21` (`DISPUTE: process.env.DISPUTE_V2 || ""`), `.env.example:26`
- Precondition: an operator rotates or audits the dispute address by variable name.
- Impact: the variable name states a retired contract version while holding the live one, so a future rotation can point the app at the contract the name suggests. Nothing in the code prevents that.
- Existing mitigation: documented in `AGENTS.md`.
- Required fix: add `DISPUTE_V4` and prefer it, keeping `DISPUTE_V2` as a deprecated alias with a startup warning.
- Verification: a config test asserting the resolved address matches the documented `DisputeV4`.

### CG-API-07 — CORS is `*` on every money-adjacent route
- Severity: Info
- Confidence: High
- Evidence: `vercel.json:21-36`, `api/attestation.js:142-144`, `api/_evidence.js:277-279`, `api/energy-data.js:113-115`
- Precondition: —
- Impact: any origin can call the endpoints. This is required for x402 clients and does not by itself move funds, because every money path needs a wallet-signed EIP-3009 authorization. It does mean a hostile page can drive a paying request from a browser that already holds an authorization.
- Existing mitigation: the signature requirement; exact `to`/`value` binding on `call-service`.
- Required fix: none required; consider documenting the trust model, since a reader may assume CORS is an access control here.
- Verification: —

### CG-API-08 — `/api/evidence` reports `rpc-error` on a cold start
- Severity: Info
- Confidence: High
- Evidence: `api/_evidence.js:174-200`, `docs/decisions.md` (evidence cold-start entry)
- Precondition: first call from a fresh function instance against a slow DNS/TLS path.
- Impact: a 3 s `AbortSignal.timeout` is spent on connection setup, so a row that exists reads as `note: "rpc-error"` instead of `anchored: true`. The response does distinguish the case, so it is not a false "no evidence".
- Existing mitigation: the explicit `rpc-error` note.
- Required fix: raise the timeout for the first call, or warm the connection.
- Verification: already covered by `tests/api-evidence.test.ts`.

## Notes on what was not found

- `nothing found` for a missing signature check on `/api/call-service`: the store path verifies the signature before trusting a record (`api/call-service.js:930-935`), and the no-store path verifies it after the nonce read but before any settlement (`api/call-service.js:1051-1054`).
- `nothing found` for a secret exposed to the browser: the API reads unprefixed env vars, and no `VITE_*` name in `.env.example` carries a `*_PRIVATE_KEY`.
- `nothing found` for an unauthenticated write route: the only write paths are `call-service`, `nano-call`, and the two paid data endpoints, each with a signature or key gate.
