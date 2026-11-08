# Step 8 — Frontend pass

**Scope:** `src/` — wallet connection, transaction construction, approvals, displayed trust state, secret exposure, client-side trust.
**Mode:** static read at commit `3e279bd` (includes the local AM-05 fix).

## Surface inventory

| Surface | File | Moves funds | Trust-sensitive display |
|---|---|---|---|
| Call builder | `src/components/panels/CallBuilder.tsx` | approve + `callService` + CCTP bridge | call phases, receipt auto-submit |
| Disputes v8 | `src/components/panels/DisputesV8.tsx` | bond approve + `openDispute`, `resolve`, `finalize` | evidence snapshot, `heldSlash` |
| Register / stake | `Register.tsx`, `StakeTopUp.tsx` | `register`, `stake` | terms timelock |
| Payments | `Payments.tsx` | USDC `transfer`, `approve` | — |
| Verify | `Verify.tsx` | none | anchored claim, v1/v2 registry merge, mode read |
| Nano | `Nano.tsx` | drives `/api/nano-call` | endpoint config |
| Providers | `Providers.tsx` | none (code samples) | sample snippets |
| Agent wallet | `Agent.tsx` | `setDailyLimit`, `setMaxPerCall`, spend | limits |
| Shared | `src/lib/config.ts`, `utils.ts`, `subgraph.ts`, `cctp.ts`, `cctpOperation.ts`, `paymentGate.ts` | address resolution, tx guards | — |
| Passkey wallet | `src/hooks/usePasskeyWallet.ts` | optional gasless MSCA | — |

## What is correctly enforced

- Every v8 write path resolves through `V8_CONFIG` / `ACTIVE_PPC_ADDRESS` (`DisputesV8.tsx:757`, `:775`, `Uptime.tsx:120`, `:306`); the only v7 addresses in the UI are explicit read-only labels (`AdminPanel.tsx:139-140`) and the `V7Cleanup` write path.
- No unlimited approval remains anywhere in `src/` or `api/` (`grep maxUint256` → no match); PPC, CCTP, and dispute bond approvals are all bounded to the amount of the next transaction (`CallBuilder.tsx` `args: [ACTIVE_PPC_ADDRESS, amount]`, `DisputesV8.tsx:952-960`).
- `Verify.tsx` does not assert a match it cannot read: the v1/v2 merge prefers the v2 row (`Verify.tsx:209`), a mirror failure is distinguished from "nothing anchored" (`:250`), and a wiring read failure leaves the row without a today-claim (`:202`).
- `src/lib/subgraph.ts` checks `res.ok` and logs GraphQL `errors` instead of rendering partial data as complete (`subgraph.ts:66-68`).
- `parseUnits` is always called with `6` in this codebase (18 call sites); no panel uses the native 18-decimal scale for token amounts.

## Findings

### CG-FE-01 — a dead function would accept a raw provider private key from `sessionStorage`
- Severity: Low
- Confidence: High
- Evidence: `src/lib/utils.ts:110-140`, `:121`, `:125`
- Precondition: a future change calls `tryClientAutoReceipt`.
- Impact: the exported helper reads `sessionStorage["cg_ar_key_<providerId>"]` as a hex private key and signs a receipt with `privateKeyToAccount`. No code path currently calls it (`grep tryClientAutoReceipt` finds only the definition), so nothing is exposed today. It is the shape of a key-in-the-browser design left in place: any later caller turns a stolen XSS-adjacent storage read into provider signing authority.
- Existing mitigation: no call site.
- Required fix: delete the helper, or convert it to a wallet-signer path (`signTypedData` through the connected account) before it is used again.
- Verification: `grep -rn "tryClientAutoReceipt" src` returns only a definition today; the fix makes it return zero rows.

### CG-FE-02 — the API-key sample prints `process.env.PRIVATE_KEY` in a browser page
- Severity: Info
- Confidence: High
- Evidence: `src/components/panels/Providers.tsx:82`, `:110`; `src/components/panels/Nano.tsx:287`, `:312`
- Precondition: —
- Impact: the snippets are rendered as text, not executed, and one is explicitly labelled "keep this key off the client" (`Providers.tsx:82`). The residual risk is that a reader copies a server-key pattern into a client example, and that a support answer pointing at `process.env.PRIVATE_KEY` sounds like the browser has one.
- Existing mitigation: the inline warning; `Nano.tsx:312` states the gate is server-side `NANO_API_KEY`.
- Required fix: none required; make the warning a visible callout rather than a trailing comment.
- Verification: —

### CG-FE-03 — the client cannot tell an unreachable indexer from a chain with no providers
- Severity: Low
- Confidence: Medium
- Evidence: `src/lib/subgraph.ts:61-68`, `:73-109`; `src/hooks/useSubgraph.ts`
- Precondition: the Studio endpoint is rate-limited, cold, or returns GraphQL `errors` with an empty `data`.
- Impact: `fetchProviders`/`fetchNetworkStats` throw on a non-2xx response, which the hook turns into an empty list. Panels then render "no providers" rather than "indexer unavailable", so an operator can read an outage as an empty marketplace. This is the same class of confusion the API's `rpc-error` note was added to avoid.
- Existing mitigation: a thrown error the caller may surface; `console.warn` on GraphQL errors.
- Required fix: return a discriminated result (`{ok:false, reason}`) so the panels can say "indexer unavailable" and keep the last good values.
- Verification: a unit test that a 429 produces the unavailable state, not an empty list.

### CG-FE-04 — passkey wallet is an optional peer dependency behind a bundle-visible client key
- Severity: Info
- Confidence: High
- Evidence: `src/hooks/usePasskeyWallet.ts:44-60`, `:63-65`
- Precondition: `VITE_CLIENT_KEY` set in the deployment environment.
- Impact: `VITE_CLIENT_KEY` ships in the browser bundle by design (a Circle client key, not a secret), and the hook throws a clear error when it is absent. No fund-moving path depends on it today because no panel consumes `sendGaslessCall`. The risk is only that a future reader treats `VITE_*` as safe for secrets generally.
- Existing mitigation: lack of a consumer; the key is documented as a client key.
- Required fix: none required; keep it out of the "secrets" checklist and inside the "public identifiers" one.
- Verification: —

## Notes on what was not found

- `nothing found` for a client-side trust decision on dispute money: `heldSlash`, `bond`, and `resolvedAt` are all read from chain (`DisputesV8.tsx:417-436`, `:682-694`, `:744`), and the panel states the snapshot is recorded at open time rather than recomputed (`:286`).
- `nothing found` for a receipt/bridge double-submit: `cctpOperation.ts` persists a stage guard and `paymentGate.ts` blocks a second start (`tests/cctp-operation.test.ts` covers the stage machine).
- `nothing found` for a client-held settlement key: the only key-shaped read in `src/` is CG-FE-01, and it has no caller.
