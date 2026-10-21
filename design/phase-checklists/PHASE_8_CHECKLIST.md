# Phase 8 — Evidence Checklist

Statuses: `PASS` (implemented and exercised), `PARTIAL` (implemented, evidence incomplete),
`FAIL` (defect demonstrated), `BLOCKED` (environment/external dependency), `UNVERIFIED`
(not exercised yet). This file is updated only with evidence gathered in this phase.

## Baseline (before Phase 8 edits)

| Item | Status | Evidence |
|---|---|---|
| Working tree preserved | PASS | HEAD `3d858a2`; `git status --short` showed 15 modified + 15 untracked entries, matching the audit; nothing staged. |
| Current-tree gates | UNVERIFIED | The audit did not rerun `bun run check`, `bun test tests/` or `bun run build`; previous Phase 7 results are not reused as proof. |
| Phase 6/7 implementation present | PASS | `CallBuilder.tsx`, `activity.ts`, `callCosts.ts`, `txLifecycle.ts`, History/Notifications/Requests/Receipts/Overview and their tests exist in the working tree. |

## A. Transaction and call recovery

| Item | Status | Evidence / gap |
|---|---|---|
| Exact USDC escrow, gas and budget maths | PASS | `src/lib/callCosts.ts`; `tests/call-costs.test.ts` covers integer cost maths and blockers. Existing Phase 6 evidence. |
| Wallet rejection separated from failure | PASS | `classifyWalletError` in `txLifecycle.ts`; unit tests. Call Builder renders rejection without a hash. |
| Submitted vs confirmed vs reverted | PARTIAL | Call Builder classifies receipts; `Verify.tsx` and `Requests.tsx` use `useWaitForTransactionReceipt().isSuccess`, which is true for a mined transaction even when receipt status is reverted. |
| Unread/uncertain receipt keeps the pending marker | FAIL | `CallBuilder.runCall`, the x402 path and the approval path call `clearPendingTx()` on an unknown receipt, allowing a second financial write. `handleClaimTimeout` and `handleSubmitReceipt` do not set or check the pending marker at all. Batch calls never set it. |
| Pending recovery without resubmission | FAIL | There is no UI to inspect the hash already stored in `sessionStorage`; the only options are wait or manually clear storage. |
| Insufficient USDC blocks a call | PASS | `assessCall` returns `insufficient-balance`; Call Builder disables the CTA. |
| Insufficient native gas blocks a call | FAIL | The panel displays an estimated gas cost but `assessCall` has no native-balance input, so a call with enough USDC and too little gas can be offered. |
| Wrong network handled before writes | PARTIAL | Call Builder switches via `ensureArc` before call/claim/receipt; `Verify.tsx` and `Requests.tsx` send without a chain guard or `chainId`. |
| Timeout claim respects contract timing | PARTIAL | UI copy mentions the SLA window plus grace, but the claim writes immediately and only reports a revert after gas is spent. No simulation/preflight. |
| Claim and receipt writes are pending-guarded | FAIL | `handleClaimTimeout`, `handleSubmitReceipt` and `Requests`' claim do not check/set the pending marker. |
| Receipt copy matches contract settlement | FAIL | `CallBuilder` says the receipt "released escrow to the provider"; the contract makes escrow claimable, not transferred. `Verify.tsx` says "Escrow Released". |
| Verify reports the real contract/API verdict | FAIL | The API returns `verdict` (`HONORED`/`VIOLATED`/`PENDING`), but `Verify.tsx` reads `status` and defaults to `VERIFIED`; any `d.ok` response (including `PENDING`) is shown as "Receipt Verified". |
| Transaction-hash lookup is not called receipt verification | FAIL | `Verify.tsx` labels any successful transaction lookup "Receipt Verified" and builds a `/tx/<callId>` explorer link. |

## B. State consistency

| Item | Status | Evidence / gap |
|---|---|---|
| Confirmed transaction invalidates relevant queries | FAIL | No `useQueryClient`/invalidation in Call Builder, Requests or Verify. Balances, open calls and subgraph panels stay stale after confirmation. |
| History dedupes and orders records | PASS | `src/lib/activity.ts`, `tests/activity.test.ts`; Phase 7 evidence. |
| Notifications dedupe by `txHash:logIndex:event` | PASS | Per-account store and dedupe key in `Notifications.tsx`; Phase 7 evidence. |
| Indexer delay distinguished from failure | PARTIAL | History/Requests copy distinguishes indexing, but the Call Builder does not surface "confirmed, not yet indexed" after a call. |
| Stale verification response cannot overwrite newer state | FAIL | `Verify.handleVerify` has no request sequence; a slow first response can overwrite a later result. |
| Missing data is not fabricated as zero/success | PASS | Phase 7 removed invented deadline/claimable values; `verify` default-to-VERIFIED is the remaining exception covered above. |
| Retry is bounded and safe | FAIL | The pending marker is cleared on unknown receipts; claim/receipt/batch retries are not bounded. |

## C. Accessibility and responsive behaviour

| Item | Status | Evidence / gap |
|---|---|---|
| Call Builder fields labelled | PARTIAL | Inputs/selects have labels; several SLA labels are `<label>` elements with no associated control, and field errors are only `aria-describedby`, not live/`role="alert"`. |
| Status/error announcements | PARTIAL | One status region uses `role="status"`; errors are not assertive and some panels have no live region. |
| Keyboard-only Call Builder | UNVERIFIED | Buttons/inputs are native controls; no browser keyboard run recorded this phase. |
| 834 px layout | FAIL | `.cg-split-rail` switches to one column only at `max-width: 768px`; at 834 px the main column keeps a 320 px rail and the three-column SLA row is cramped. Call Builder inline grids have no narrower breakpoint. |
| Light-theme contrast for small labels | FAIL | Call Builder labels/hints use `--text-faint` at 11 px; the Phase 17 light-theme note records this token as below AA for small text. |
| Screen-reader usability | UNVERIFIED | No screen-reader run available in this harness. |

## D. End-to-end verification

| Item | Status | Evidence / gap |
|---|---|---|
| Live happy path | BLOCKED | `ARC_RPC_URL`, `CALLER_PK`, `PROVIDER_PK` are absent from this environment; no `.env`; script is not wired into `package.json`. |
| Live timeout/recovery | BLOCKED | Same missing credentials; the script cannot advance chain time or prove a real timeout claim. |
| Unit/regression tests | PASS (baseline only) | Existing 6 test files are present; current-tree run still `UNVERIFIED` until the Phase 8 gate run. |
| Transaction-hash/explorer evidence | BLOCKED | The subgraph `Call` entity has no transaction hash; adding it is explicitly out of scope. |

## Verified Phase 8 gaps to implement

1. Native-gas readiness blocker and tests.
2. Pending marker retained on unknown outcomes; pending guard on claim, receipt, batch and approval; a check-status recovery action.
3. Targeted query invalidation/refetch after confirmed call, claim and receipt.
4. `Verify.tsx`: API verdict mapping, receipt-status classification, chain guard, exact amounts, correct transaction-vs-receipt wording, stale-response guard.
5. `Requests.tsx`: claim simulation, chain guard, pending guard, receipt-status classification, invalidation.
6. Call Builder claim simulation and corrected settlement wording.
7. Targeted a11y: live error/status announcements, associated labels.
8. 834 px stacking and light-theme label contrast in Call Builder.

## Phase 8 results (after edits)

Gates (run on the working tree after all Phase 8 edits):

| Check | Command | Status | Evidence |
|---|---|---|---|
| Typecheck | `bun run typecheck` | PASS | `tsc -p tsconfig.json --noEmit`, no output. |
| Lint | `bun run lint` | PASS | `eslint src --max-warnings=0`, no output. |
| Unit tests | `bun test tests/` | PASS | 101 pass, 0 fail, 261 expect() calls, 6 files at that stage (145 pass across 9 files after the follow-up fixes). |
| Production build | `bun run build` | PASS | Vite build completed; only the pre-existing dependency/chunk-size warnings. |
| Baseline preserved | `git status --short` | PASS | `src/App.tsx` restored exactly; only the expected Phase 6/7 plus Phase 8 files are modified/untracked; nothing staged, no commit/push/deploy. |

### A. Transaction and call recovery

| Item | Status | Evidence |
|---|---|---|
| Native gas readiness in `assessCall` | PASS | `src/lib/callCosts.ts` adds a native-balance input, a `native-gas` blocker and a low-gas warning; `tests/call-costs.test.ts` covers both. |
| Pending marker retained on unknown outcome | PASS | Call/x402/approval/batch paths no longer clear the marker on an unread receipt; `readPendingTx()` in `src/lib/utils.ts` reads it on mount and `CallBuilder` shows the unresolved box. |
| Pending recovery UI, read-only | PASS | "Check receipt" runs `getTransactionReceipt` only. Browser with a confirmed hash: pending cleared, "The stored transaction is confirmed on-chain…". With a reverted hash: "The stored transaction reverted…". With an unknown hash: pending retained and "No receipt is available yet…". |
| Claim and receipt writes pending-guarded | PASS | `handleClaimTimeout` / `handleSubmitReceipt` / `Requests.handleClaimTimeout` check and set the marker; Call Builder advanced buttons disable while pending. Browser: "Create call" disabled with a pending hash. |
| Claim and receipt simulated before writing | PASS | `claimTimeout` and `submitReceipt` are `simulateContract`-ed first; a would-revert claim is reported before any gas is spent. |
| Wrong network guarded before writes | PASS | `Verify` receipt submission and `Requests` claim check `chainId` and call `ensureArc`; Call Builder already did. |
| Receipt copy matches contract settlement | PASS | Call Builder/Verify now say a confirmed receipt makes escrow claimable/claimable-on-chain, not transferred. |
| Verify reports the real API verdict | PASS | `classifyVerdict` in `src/lib/txLifecycle.ts` maps `HONORED`/`COMPLETED`/`PENDING`/`VIOLATED`/`SLASHED`/unknown; `tests/tx-lifecycle.test.ts` covers it. |
| API `UNKNOWN` reaches the RPC fallback | PASS | A 66-char hash where the API returns `ok:true` + `UNKNOWN` (or an HTML/non-JSON body) now falls through to `getCall` and the transaction lookup instead of a wrong verdict. Browser: non-JSON API body shows "No verified receipt was found…", not a parse error. |
| Transaction lookup is not called receipt verification | PASS | Browser: a confirmed tx renders "Transaction Confirmed" + "This confirms the transaction only. It does not prove a provider receipt or a completed call."; the explorer link is `/tx/<hash>`. |
| Receipt transaction status read from the receipt | PASS | Verify and Requests classify `receipt.status`, not `isSuccess` alone. |
| Timeout-claim amount has no fabrication | PASS | Requests and Call Builder only show refund/slash from a decoded `CallSlashed` event; a confirmed claim with no decoded event says the amounts are unavailable. |
| x402 fallback and payment starts are gated per provider + request | PARTIAL | `CallBuilder` falls back only when `classifyFacilitatorResult` returns `pre-settlement` for a structured `PRE_SETTLEMENT` response whose nonce state was checked and whose error is allowlisted (for example `Provider not active`). A valid hash plus `demo:true`/`settled:false`, malformed or contradictory fields, `Nonce already used`, unknown 402 errors, network failures, non-402 failures and success without a valid hash stay uncertain. The same `checkFacilitatorGuard` decision now blocks the direct call, batch and CCTP writes for the same attempt; see the fourth-review section for the remaining tab-scope limitation. |

### B. State consistency

| Item | Status | Evidence |
|---|---|---|
| Confirmed write invalidates relevant queries | PASS | `refreshAfterSettlement` invalidates `balances`, `allowance`, `openCalls`, `recentActivity`, `networkStats`, subgraph and providers; Call Builder, Requests and Verify call it on confirmation. |
| Stale verification response blocked | PASS | `verifySeq` in `Verify.tsx` discards a response that is no longer the newest request. |
| Retry is bounded and safe | PASS | Pending marker retained until a receipt proves confirmed/reverted; the recovery action is read-only. |
| Indexer delay vs failure | PASS | History/Requests copy still distinguishes indexing; a confirmed call shows the confirmed state and refreshes, without claiming indexed data. |

### C. Accessibility and responsive behaviour

| Item | Status | Evidence |
|---|---|---|
| Call Builder fields and associated labels | PASS | SLA value/readout blocks are `<div>`, not empty `<label>`; real inputs keep their labels; Requests claim input has `aria-label="Call ID to claim"`. |
| Status/error announcements | PASS | Error/status regions use live-region roles; claim/receipt buttons expose `aria-busy`; the "Check receipt" button reports busy. |
| Light-theme label contrast | PASS | Browser light theme: Call Builder SLA labels compute `rgb(9,22,54)` on `rgb(241,245,250)` = 16.26:1 (measured); axe `color-contrast` reports no violation (the single `region` violation is a pre-existing shell landmark issue, and colour checks were `incomplete`, not failing). |
| 834 px layout | PASS | CSS-inspected and browser-measured at a forced 834 px viewport: `.cg-split-rail` stacks (single 570 px column) and `document.scrollWidth === 834`, no horizontal overflow. |
| 411 px layout | PASS | Forced 411 px: Call Builder, Requests and Verify all have `scrollWidth === 411` and fields/terms stack to one column. |
| Keyboard-only Call Builder | UNVERIFIED | Controls are native buttons/inputs and disabled states are real; no full keyboard-only traversal recorded in this harness. |
| Screen-reader usability | UNVERIFIED | No screen-reader available in this harness. |
| Wallet-gated write flows in browser | BLOCKED | The harness has no browser wallet; the write paths (call, claim, receipt) were exercised through code/unit tests and the read-only recovery UI, not a signed browser transaction. |

### D. End-to-end verification

| Item | Status | Evidence |
|---|---|---|
| Live happy path | BLOCKED | `ARC_RPC_URL`, `CALLER_PK`, `PROVIDER_PK` absent; no `.env`; `scripts/e2e-lifecycle.js` is not wired into `package.json`. |
| Live timeout/recovery | BLOCKED | Same missing credentials; no chain-time control. |
| Transaction-hash/explorer evidence in History | BLOCKED | The subgraph `Call` entity has no transaction hash; out of scope. |
| Read-only recovery evidence | PASS | Browser exercised recovery against real Arc transactions: confirmed, reverted and unknown hashes. |

## Post-review fixes (2026-10-20, follow-up to the independent review)

The independent review found four issues. Fixes only; no new features and no dependency added.

| Fix | Status | Evidence |
|---|---|---|
| 1. Verify receipt submission is simulated first | PASS | `src/components/panels/Verify.tsx:117-140` runs `publicClient.simulateContract` with `CONFIG.payPerCall`, `SUBMIT_RECEIPT_ABI`, `[callId, responseHash, respondedAt, signature]`, `account: address`; failure reports "would revert … no gas was spent" and returns before `writeReceipt`. Existing wallet/network checks, duplicate-submission guard and error handling unchanged. |
| 2. Uncertain facilitator settlement is guarded | PASS | `src/lib/facilitatorGuard.ts` writes a marker *before* the facilitator request (`stage: "prepared"`), reads it back and validates it; every read returns a discriminated result, so unreadable or corrupt storage is never treated as an empty list. `CallBuilder.handleX402Call` refuses to send when the marker cannot be established. Only an explicitly allowlisted pre-settlement 402 error, a demo/no-settlement response, or a confirmed/reverted transaction removes it; removal is read-back verified. `src/lib/facilitatorOutcome.ts` decides whether fallback is permitted. |
| 2a. Guard tests | PASS | `tests/facilitator-guard.test.ts`: scoping, read-back verification, `setItem` throw, read-back mismatch and read-back throw, unreadable storage, corrupt values, legacy markers, no expiry, single-attempt acknowledgment, failed removal, settlement recording with both stores failing, nonce-used guard retention and known pre-settlement fallback permission. `tests/facilitator-outcome.test.ts`: unreachable, known/unknown HTTP 402, nonce-used 402, 402 claiming success/hash, HTTP 500, non-success 200, error status with `success:true`, missing/invalid hash, demo and settled outcomes. |
| 2b. Hash preservation when pending storage fails | PASS | `recordFacilitatorSettlement` returns the hash and an in-memory `submitted` guard even when both writes fail; the durable preflight marker remains, so a retry stays blocked. `CallBuilder` displays the hash with explorer link/copy and a warning that it was not persisted. `Verify` and `Requests` report a failed pending write instead of claiming success. |
| 2c. Fail-closed read/write paths | PASS | `readPendingTx`/`checkNoPendingTx` block writes when session storage cannot be read; `setPendingTx`/`clearPendingTx` verify read-back and return a boolean. `CallBuilder`, `Verify` and `Requests` use those results. |
| 2d. Request gate is tested, not only inspected | PASS | `beginGuardedFacilitatorRequest` persists and verifies the `prepared` marker, then calls the request callback. Tests prove the callback is not called when storage is unreadable, unwritable or fails read-back, and that the marker is already `prepared` when the callback starts. |
| 2e. HTTP 402 is not automatically pre-settlement | PASS | `src/lib/facilitatorOutcome.ts` permits fallback only for an explicit allowlist of errors emitted before `callServiceWithAuthorization` (`Provider not active`, signature/validity/target/value rejections). `Nonce already used` and unknown 402 errors return `uncertain`; `permitsOnChainFallback` is false, `CallBuilder` keeps the guard, and no `runCall` fallback starts. Tests cover both sides and a 402 that claims success/a hash. The guard card offers a read-only transaction-history link and explicit acknowledgment; neither sends a payment. |
| 3. Dropped/replaced pending marker recovery | PASS | `CallBuilder.tsx`: "Recover a stuck transaction…" requires a second explicit confirmation, explains the double-pay risk, sends nothing, and clears only `cg_pending_tx`. Marker is retained for genuine unknowns until the user chooses recovery; no time-based expiry. |
| 3a. Pending-helper tests | PASS | `tests/pending-tx.test.ts`: round-trip, blocking `checkNoPendingTx`, and two-way separation between the pending marker and the facilitator marker. |
| 4. Phase 8 documentation corrected | PASS | `design/PHASE_PROCESS.md` no longer claims Phases 6–8 have verbatim prompt files; `design/PHASE_8.md` records implementation complete with the review fixes as follow-up; this section records them. Phase numbering and the Phase 6/7 specs are untouched. |

Gates after the fixes: `bun run typecheck` clean, `bun run lint` clean, `bun test tests/`
**145 pass / 0 fail / 400 expect() calls / 9 files**, `bun run build` passed.

The fail-closed work has unit coverage for the storage and classification rules above. It does
not have component-level tests: the absence of `setItem`/read-back failure reaching the x402
button, the displayed hash, and the acknowledgment UI are verified by code inspection, not by an
automated component test.

Remaining limitations (unchanged): live E2E and wallet-signed writes are unverified
(no credentials, no browser wallet); keyboard-only and screen-reader testing are unverified
(no such harness); there is no component-level test runner, so the CallBuilder/Verify/Requests
UI behavior is covered by code inspection, the pure-rule tests, and the earlier read-only
browser run — not by automated component tests. `sessionStorage` is per tab: a different tab
does not share the guard. When storage is unavailable, all payment starts are blocked rather than
permitted, because an in-memory flag cannot protect against a reload.

## Fourth review remediation (2026-10-20)

The fourth strict review returned **NEEDS FIXES**. This section records the remediation; the
earlier sections remain as historical evidence and are not rewritten.

| Finding | Status | Evidence |
|---|---|---|
| P0-A: guard applied only to the x402 button, not the direct call/batch | PASS | `src/components/panels/CallBuilder.tsx`: `checkFacilitatorGuard` is the one decision. `paymentGuardBlock` is called in `handleCall`, `runCall`, `handleX402Call`, `handleBatch` and `handleCCTPCall` immediately before their write/allowance work. `canRun` also includes the `facilitator-guard` blocker, so all CTAs are disabled while the guard is active or unreadable. The earlier note that the guard "never [blocks] the on-chain path" was removed. |
| P0-A: clearing the pending marker bypasses the facilitator guard | PASS | `discardPendingMarker` still clears only `cg_pending_tx`; `refreshGuard`/`paymentGuardBlock` still read `cg_facilitator_unsettled`. `tests/facilitator-guard.test.ts` proves acknowledgment of one marker does not touch the other key. |
| P0-A: storage failure or corrupt guard is fail-closed | PASS | `checkFacilitatorGuard` returns `storage-unavailable`/`guard-corrupt`; handlers refuse before any write. Pure tests cover both. |
| P0-B: valid hash overridden by `demo:true`/`settled:false` | PASS | `src/lib/facilitatorOutcome.ts` checks a valid hash before demo/no-settlement and returns `uncertain` for the contradiction. `tests/facilitator-outcome.test.ts` covers both requested shapes. |
| P0-B: malformed/contradictory 402 and 200 bodies | PASS | Runtime key/type validation; `success:"true"`, `callId` on a 402, extra settlement fields, unknown success fields, malformed flags and `error` alongside success are uncertain. Tests cover each shape. |
| P0-C: replayed authorization could receive a fallback-eligible error first | PASS | `api/call-service.js` checks `authorizationState` before signature, validity, target, provider and value validation. Replay returns `AUTHORIZATION_ALREADY_USED`. `tests/api-call-service.test.ts` runs each validation failure with a replayed nonce and asserts the handler stops after `authorizationState`. |
| P0-C: malformed request still fallback-eligible | PASS | The shape-rejection response carries `PAYMENT_REQUIRED`, which `classifyFacilitatorResult` does not treat as pre-settlement. Tests cover the API code and the client classification. |
| P1: regression coverage | PARTIAL | `tests/facilitator-guard.test.ts` covers the shared gate, scoping, unreadable/corrupt storage and marker separation; `tests/facilitator-outcome.test.ts` covers the contradiction/malformed matrix; `tests/api-call-service.test.ts` covers nonce-first ordering and fresh pre-settlement rejections. No component-level test runner exists; handler wiring is verified by inspection, not by rendered-button tests. |
| P2: cross-tab/global guarantee | PARTIAL (documented limitation) | No server/facilitator idempotency store exists to reuse without a protocol/API change. The actual guarantee is tab-scoped: one `sessionStorage` marker blocks the same `providerId + requestHash` across x402, direct, batch and CCTP starts in that tab until a safe outcome or explicit acknowledgment. Another tab, cleared storage, another browser or a direct contract call is not covered. |
| Verification | PASS | `bun test tests/facilitator-outcome.test.ts tests/facilitator-guard.test.ts tests/api-call-service.test.ts` -> 58 pass, 0 fail, 187 expect() calls; full `bun test tests/` -> 168 pass, 0 fail, 481 expect() calls, 10 files; `bun run typecheck` and `bun run lint` clean; `bun run build` passed in 1m42s (8463 modules; only the existing large-chunk warnings); `git diff --check` clean. |
| Docs | PASS | This section, `docs/progress.md` (the overbroad double-charge claim is now `PARTIAL` with the exact scope) and `design/PHASE_8.md` status text were updated. |

The Phase 8 verdict is **implemented with documented residual limitations**, not a global
"cannot double-charge" guarantee. The production build was rerun after this remediation; it
writes only ignored `dist/` output. The only build output beyond the file list was the existing
large-chunk warning.



## Fifth review remediation — P0 payment-safety round 2 (2026-10-20)

The strict read-only review returned **NEEDS FIXES** with three P0 findings and five related P1
races. This section supersedes the fallback/guard rows above where they disagree; the earlier
sections remain as historical evidence.

| Finding | Status | Evidence |
|---|---|---|
| P0-1: a failed `setPendingTx` left the hash only in React state, so `checkNoPendingTx` (storage-only) allowed a second programmatic payment | PASS | `src/lib/paymentGate.ts` keeps the submitted hash in module memory and sets a sticky untrusted flag when the write or its read-back fails. `checkPaymentStart` blocks on: running flow, in-memory hash, untrusted marker, unreadable/corrupt `cg_pending_tx`, an unresolved CCTP operation, or the facilitator guard. `CallBuilder` calls it in `handleCall`, `runCall`, `ensureAllowance`, `handleX402Call` (twice: before signing is not enough), `handleBatch` (every item), `handleCCTPCall`, `handleClaimTimeout`, `handleSubmitReceipt`; `Verify`, `Requests`, `BulkCall` (both loops, every item), `Overview` multi-call (every item), `Bridge` and `Payments` send call it immediately before their writes and resolve the marker from a receipt. |
| P0-1: storage/React/marker disagreement | PASS | `pendingMemory()`, `markerIsUntrusted()` and `recordSubmittedTx()` are the single source of truth; React `pendingHash`/`pendingPersisted` mirror them for display only. A failed write also shows a warning that recovery is not durable and that a reload forgets the hash. |
| P0-1: missing marker after a failed write must not read as "nothing pending" | PASS | The untrusted flag is sticky until `resolvePendingTx` proves a verified clear; `checkNoPendingTx` consults the same memory. Tests: `tests/payment-gate.test.ts` "a submitted hash that cannot be persisted blocks the next start", "a tampered read-back...", "the block survives until a verified clear". |
| P0-1: distinct states preserved | PASS | Unresolved transaction (marker), known revert (`resolvePendingTx` after a reverted receipt), confirmed (`resolvePendingTx` after confirmation), unknown (marker kept). `cg_pending_tx` and `cg_facilitator_unsettled` stay separate keys; clearing one never clears the other (`tests/pending-tx.test.ts`, `tests/facilitator-guard.test.ts`). |
| P0-2: CCTP had no pending protection and ignored receipt outcomes | PASS | `src/lib/cctpOperation.ts` adds a durable `cg_cctp_operation` marker with stages `started → approval-pending → approval-confirmed → burn-pending → burn-confirmed → mint-pending → mint-confirmed`. The marker is written and byte-verified before every write; hashes are never dropped; only forward transitions are accepted. `cctpStageDecision` maps confirmed/reverted/unknown per stage. |
| P0-2: approval receipt status | PASS | An approval `reverted` clears the operation only because nothing was burned; `unknown` keeps it. A burn cannot start until the approval stage advanced. |
| P0-2: unknown burn/mint | PASS | `cctpStageDecision(... "unknown")` returns `stop` for every stage: the marker and hash stay, the operation blocks all payment starts, and the UI states that manual recovery is required. A timeout or throw from `waitForAttestation` also keeps the `burn-confirmed` marker. |
| P0-2: programmatic invocation | PASS | The same gate and marker checks run inside `handleCCTPCall`, independent of the disabled CTA. `tests/cctp-operation.test.ts` covers start refusal, unreadable/corrupt markers, refused transitions, hash preservation, failed updates, verified/failed clears and the full stage/outcome matrix. |
| P0-3: unauthenticated `PRE_SETTLEMENT` / `demo` / `settled:false` cleared the guard or started a fallback | PASS | `src/lib/facilitatorOutcome.ts` now has only `settled` (a hash pointer) and `uncertain`. `permitsOnChainFallback` always returns false. The automatic fallback branch was removed from `handleX402Call`; no response body can clear the guard. Guard clearing now requires a receipt the client reads itself for the returned hash, or the user's explicit acknowledgment. Tests: `tests/facilitator-outcome.test.ts` ("no facilitator response permits an on-chain fallback", demo/settled:false as unverified claims) and `tests/facilitator-guard.test.ts` ("a pre-settlement 402 keeps the guard and grants no fallback"). |
| P0-3: nonce read is not proof | PASS (documented) | The client performs no nonce-only conclusion; it never uses a nonce read to clear the marker. The API's nonce-first ordering remains a replay check, not an idempotency guarantee; a concurrent second request with a different nonce is out of scope (see residual risks). |
| P1: batch guard checked once | PASS | `handleBatch` calls `paymentStartBlock("batch")` before every item and stops when it fails. A per-item hash goes through `rememberPending`; a failed write stops the batch immediately. |
| P1: discard callbacks during a live write | PASS | `discardPendingMarker` and `discardFacGuard` refuse while `submittingRef.current` is set or an operation lock is held, clear the confirmation state, and say why. |
| P1: same-attempt downgrade / hash loss | PASS | `upsertFacilitatorGuard` refuses a lower stage (`prepared < uncertain < submitted`) with `downgrade-refused` and carries an existing `txHash` forward. `tests/facilitator-guard.test.ts` covers both. |
| P1: acknowledgment is not settlement evidence | PASS | The acknowledgment path still removes only the marker, keeps the note "not proof of settlement", and does not touch `cg_pending_tx`. |
| Verification | PASS | `bun test tests/` → **207 pass / 0 fail / 640 expect() calls / 12 files**; `bun run typecheck` clean; `bun run lint` clean (`--max-warnings=0`); `git diff --check` clean. Build not rerun in this round. |
| Residual risks | PARTIAL (documented) | No server-side idempotency store or authenticated facilitator outcome exists; the guarantee is still per tab and per `providerId + requestHash`. A reload forgets an unpersisted hash (the warning says so). A single RPC nonce read is not used as proof. Direct contract calls bypass both markers. The `Agent` wallet writes and the `Lending` deposit still have no pending marker (value-moving operations outside the pay-per-call settlement path). CCTP source-chain receipts are now read from the source chain's RPC, but the Call Builder CTA remains disabled because its transfer carries no `hookData`. |
| Component-level UI behaviour | UNVERIFIED | No component test runner was added (no new dependency). Handler wiring is verified by inspection and the shared pure-rule tests; rendered-button behaviour, keyboard-only and screen-reader use remain unverified. |
