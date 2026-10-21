# Phase 8 — Reliability, Error Recovery & End-to-End Verification

Status: implementation complete for the reviewed high-priority findings on 2026-10-20, with
documented residual limitations. This file records the scope and acceptance criteria; it does
not replace the Phase 6 or Phase 7 plans. It has no verbatim prompt markers because the prompt
arrived in chat (see `design/PHASE_PROCESS.md` §1). An independent review followed the
implementation; its four fixes are recorded in
`design/phase-checklists/PHASE_8_CHECKLIST.md` under "Post-review fixes" as follow-up work.
A second read-only review found fail-open payment-storage handling. The follow-up hardening —
preflight persistence and read-back, fail-closed reads, and hash preservation when pending
storage fails — is recorded in the same checklist section and in `docs/progress.md`.
A third read-only review found that HTTP 402 was treated as unconditionally pre-settlement. The
follow-up permits fallback only for an explicit allowlist of pre-settlement errors; `Nonce
already used` and unknown 402 errors keep the guard and block fallback.
A fourth review found that the guard did not block the direct call/batch paths and that a valid
hash could be overridden by contradictory demo/settled flags. The remediation is recorded in the
checklist's "Fourth review remediation" section. The remaining limitations are explicit: no
component-level test runner, no live E2E/wallet-signed verification, and `sessionStorage` is
tab-scoped, so this is not a global no-duplicate-payment guarantee.

## Objective

Make the existing transaction, history and notification surfaces safe when something goes
wrong: a wallet rejection, a reverted receipt, an unread receipt, a wrong network, a
delayed indexer, a stale refresh, or a retry after an uncertain outcome. Verify the
existing Call Builder recovery flow and add end-to-end coverage where the environment
allows it.

## In scope

1. **Transaction and call recovery**
   - Insufficient USDC **and** insufficient native gas block a call before submission.
   - Wrong network is handled before every financial write.
   - A user rejection is `rejected`, not `failed` or success.
   - Submitted, confirmed, reverted and unread-receipt outcomes are distinct.
   - A retry is never offered as safe when the previous outcome is unknown; pending
     transactions can be checked without sending a second transaction.
   - Timeout claims are simulated against the contract before a transaction is sent, so
     `InvalidStatus` and `DeadlineNotReached` are reported without spending gas on a
     guaranteed revert.
   - Receipt submission reports the transaction result and the contract meaning:
     the escrow becomes claimable by the provider, not transferred by the receipt.
2. **State consistency**
   - A confirmed call, claim or receipt invalidates the relevant subgraph queries and
     refetches caller-side balances/limits.
   - History and notifications keep their existing dedupe and deterministic ordering.
   - Indexer delay is shown as delay, not failure; an empty indexer response is not
     evidence that a transaction failed.
   - Stale verification responses cannot overwrite a newer verification result.
3. **Accessibility and responsive behaviour**
   - The Call Builder, My Requests claim form and Verify Receipt form remain keyboard
     usable, labelled and announced.
   - Errors are announced; status changes do not depend on colour alone.
   - The Call Builder stacks before the 834 px breakpoint and its small labels meet
     light-theme contrast.
4. **End-to-end verification**
   - Inspect `scripts/e2e-lifecycle.js`; run it only if the required variables are already
     present in the environment.
   - If the live environment is absent, mark live E2E `BLOCKED` and cover the pure
     boundaries with unit tests. Do not print or request secrets.

## Out of scope

- Adding a transaction hash to the subgraph (schema/mapping plus a Goldsky deployment).
- Contract changes, deployment, chain/address/economic changes.
- New product features, a new state manager, a test framework or new dependencies.
- Rewriting Phase 6/7 or broad panel redesigns.
- Historical phase renumbering; `design/SPEC_8_HARDENING.md` is a different, older spec.

## Acceptance criteria

- `bun run check`, `bun test tests/` and `bun run build` pass on the current working tree.
- Pure rules added or changed this phase have regression tests.
- No financial write can be started while an earlier transaction is pending, and an
  unknown receipt leaves the pending marker in place until it is checked.
- A confirmed transaction triggers targeted invalidation/refetch, not a global reload.
- Claim and receipt paths do not claim settlement that the transaction does not prove.
- Browser checks cover 1280 px and 411 px, dark and light where the panel renders; the
  834 px breakpoint is verified by CSS inspection because the available harness exposes
  only 1280 and 411.
- The evidence checklist records PASS/PARTIAL/FAIL/BLOCKED/UNVERIFIED per item.
