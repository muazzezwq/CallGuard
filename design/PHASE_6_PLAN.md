# Phase 6 — Call Builder & transaction UX plan

Spec: delivered in chat (no `design/PHASE_6.md` exists). Constraints: no contract,
address, chain, or economic changes; no new dependencies; no commit/push/deploy.

## Findings from the repository (preflight, 2026-10-20)

- `CallBuilder.tsx:157` sends `callService` directly; `waitForTransactionReceipt` resolves
  into "✅ Confirmed" without inspecting `receipt.status`, and `useWaitForTransactionReceipt`
  is bound to the shared `writeContractAsync` hash, so an `approve` hash can produce
  "Confirmed" for the approval, not the call.
- `CallBuilder.tsx:357` prints "✅ Receipt submitted — escrow released." immediately after the
  hash returns, before confirmation.
- `CallBuilder.tsx:307` `claimTimeout` never waits for a receipt and leaves `isLoading` true.
- `CallBuilder.tsx:427` x402 fallback claims "Fallback call sent" without confirmation and
  without the USDC approval `callService` needs (approve path lives only in `handleCall`).
- `CallBuilder.tsx:124` fabricates a 100 % honor rate when a provider has no settled calls,
  and `RiskBadge` turns it into "High chance of timeout" (`docs/audit.md` already flags this).
- `CallBuilder.tsx:44` says "Slash may be partial" for `stake < price`; the contract actually
  reverts the call with `InsufficientProviderStake` unless
  `stake * slashBps / 10_000 >= pricePerCall` (`contracts/PayPerCall.sol:348`).
- `CallBuilder.tsx:493` says "No gas required" and the header pill says "Gas-free · EIP-3009",
  while the green "Gas-free call" button calls the on-chain `callService` (gas required).
- `CallBuilder.tsx:671` gas row uses float maths and mixes units; batch cost falls back to a
  hard-coded 1 USDC price when the real price is unknown (`:708`).
- `callService` escrows exactly `pricePerCall`; there is no protocol fee. `claimTimeout`
  refunds the escrow and slashes `stake * slashBps / 10_000` after `deadline + SUBMIT_GRACE`.
- `openCallsPerCaller` is a public mapping; the per-call rate limit rejects with
  `TooManyConcurrentCalls` when `open >= cap` (`cap = maxConcurrentCalls || 10`, tier 2 ×2).

## Files

| File | Responsibility |
|---|---|
| `src/lib/callCosts.ts` (new) | exact integer cost maths and readiness/blocker evaluation |
| `src/lib/txLifecycle.ts` (new) | wallet/receipt classification and status copy for every phase |
| `tests/call-costs.test.ts` (new) | cost units, missing price, slash coverage, balance, cap, batch |
| `tests/tx-lifecycle.test.ts` (new) | rejection, hash≠confirm, revert, RPC error, copy |
| `src/components/panels/CallBuilder.tsx` (modify) | wire the modules; explicit lifecycle; accurate copy; a11y |
| `src/index.css` (modify only if a class is missing) | status/state styles that do not exist yet |
| `docs/progress.md`, `docs/audit.md`, `docs/panel-inventory.md` | record what changed and what remains |
| `design/phase-checklists/PHASE_6_CHECKLIST.md` | row-per-requirement evidence |

## Tasks

1. **Cost module (TDD).** `formatUsdc`, `gasCostUsdc` (18 → 6 decimals, truncating, labelled
   estimate), `callCost` (`escrow`, `gas`, `total`, `null` when gas unknown), `batchCost`
   (exact bigint, `null` when the price is unknown), `assessCall` blockers:
   `no-provider`, `loading`, `not-found`, `inactive`, `slash-underfunded`,
   `insufficient-usdc`, `rate-limited`; warnings: `approval-needed`, `gas-unknown`,
   `gas-balance-unknown`.
2. **Lifecycle module (TDD).** `classifyWalletError` (4001 / `ACTION_REJECTED` → `rejected`,
   else `failed` with friendly text), `classifyReceipt` (`success` → `confirmed`,
   `reverted` → `reverted`), `txStatus` copy with explicit "submitted ≠ confirmed" wording,
   `canSubmit` guard (submitting or blockers or no wallet).
3. **Provider selection and stale data.** Draft kept in `sessionStorage` (`callbuilder_draft`)
   but the Marketplace/Providers/Details hand-off key wins. Record loading, not-found,
   inactive, and unstaked providers disable submission with the reason shown. Add the
   registry endpoint read (gated on a loaded record) using `classifyEndpoint`.
4. **Cost transparency.** Replace the fixed cost rows with: provider payment (escrow, exact),
   network fee (estimate, native-token unit, "unavailable" when the estimate fails), total
   (or "price + fee, fee unavailable"), USDC balance and native balance, approval state.
   Remove the 1 USDC batch fallback and the float totals.
5. **Lifecycle wiring.** Approve → wait → call → wait, each phase surfaced; receipt status
   checked; explorer link only from the confirmed hash; CallStarted callId shown as
   "call created", with a sentence that execution and settlement are separate and not yet
   known. `claimTimeout` and `submitReceipt` wait for their receipts and report the result.
   x402 fallback reuses the approve+call helper.
6. **Copy and safety.** Remove "No gas required"/"Gas-free" claims from the on-chain path;
   fix the honor-rate fabrication and the "slash may be partial" claim; duplicate-submit
   guards on every write; keep payload/provider on failure.
7. **A11y.** `role="status"` live region for phases, `aria-invalid`/`aria-describedby` on
   payload and call-id, native buttons/selects, visible focus via existing tokens, no
   keyboard trap. Verify with keyboard in the browser.
8. **Verification.** `bun run check`, `bun test tests/`, `bun run build`; browser walkthrough
   on a mocked wallet worktree (1280 / 834 / 411, dark + light), plus the existing real
   Arc read for provider data.
