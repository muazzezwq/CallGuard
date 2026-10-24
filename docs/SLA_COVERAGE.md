# SLA coverage — what the system actually enforces (24 Oct 2026)

Scope: the v8 stack on Arc Testnet (`ServiceRegistryV8` `0x793028B6…12A3`,
`PayPerCallV8` `0xedce61eF…a7EF`, `SLAKeeper` `0xBe897043…CB7`,
`DisputeV2` `0xe5D993E0…0900`).

Three axes:

- **A — Availability.** Did the provider answer inside the deadline it published?
- **B — Quality.** Was the answer correct, and can a caller prove it was not?
- **C — Financial.** Is there money behind both promises, and does it actually move?

Status vocabulary:

- `PASS` — enforced on-chain, covered by a test, and proven on the deployed v8 contracts.
- `PARTIAL` — enforced on-chain, but one of the three proofs is missing (test, prod run, or UI path).
- `GAP` — not enforced at all, or enforced in a way a provider can escape.

## A — Availability

| # | Behaviour | Where | Proof | Status |
|---|---|---|---|---|
| A1 | Each call snapshots `maxResponseTime`, `slashBps`, `termsVersion` at open, so a later terms update cannot change the rules mid-call | `PayPerCallV8._createCall`, `test_PayPerCallV8.test_callService_escrowsAndSnapshotsTerms` | prod: provider `1` runs `120 s`, every call stores it | PASS |
| A2 | A receipt is rejected when the provider claims a `respondedAt` past the deadline, or submits after `deadline + SUBMIT_GRACE (5 s)` | `submitReceipt`, `test_submitReceipt_respondedAfterDeadline_reverts`, `test_submitReceipt_afterGrace_reverts` | prod: timeout drill `0xc4e2245e…` | PASS |
| A3 | A missed deadline refunds the caller and slashes the stake; keeper earns a bounty | `claimTimeout`, `test_claimTimeout_refundsSlashesAndPaysBounty` | prod: call `0xc4e2245e…` → refund `1.0`, slashed `1.9`, bounty `0.1` | PASS |
| A4 | A keeper claims timeouts without human action | `SLAKeeper.claim/claimBatch`, `test/SLAKeeper.t.sol` (9 tests) | 7-day soak running since 24 Oct 15:33 UTC, ends 31 Oct 15:33 UTC | PARTIAL |
| A5 | Concurrent calls per caller are capped (`maxConcurrentCalls`, doubled for `zkTier >= 2`) | `PayPerCallV8._createCall` | tests exist only in the **v7** suite (`test/PayPerCall.t.sol:585`); no v8 test | PARTIAL |
| A6 | A call cannot open unless the stake still covers this terms version's slash (`expectedSlash >= pricePerCall`) | `PayPerCallV8._createCall`, `test_callService_insufficientStake_reverts` | prod: stake `5.76`, price `1.0`, slash `20 %` | PASS |
| A7 | A provider cannot withdraw stake while it has open calls, and must wait a cooldown after deactivating | `ServiceRegistryV8.unstake` (`PendingCalls`, `UNSTAKE_COOLDOWN = 1 h`) | v7 retirement followed the same path | PASS |
| A8 | The published `availabilityTargetBps` (e.g. `9950` = 99.5 %) is enforced against rolling uptime | stored and displayed only; no contract path reads it for a verdict | — | **GAP** |

## B — Quality

| # | Behaviour | Where | Proof | Status |
|---|---|---|---|---|
| B1 | A receipt is an EIP-712 signature over `callId`, `responseHash`, `respondedAt`, `termsVersion` | `hashReceipt` / `submitReceipt` | `test_submitReceipt_completesAndCreditsProvider` | PASS |
| B2 | Wrong signer, wrong terms version, zero hash, and replay are rejected | `submitReceipt` guards | 4 v8 tests (`wrongSigner`, `wrongTermsVersion`, `zeroResponseHash`, `replay`) | PASS |
| B3 | The receipt is checked against the *content* of the response | not on-chain: `responseHash` is whatever the provider signed | — | **GAP** (by design; B4 is the backstop) |
| B4 | Only the call's caller, only a `Completed` call, only inside `disputeWindow`, only once, and only with the right `providerId` can open a dispute | `DisputeV2.openDispute`, `test/DisputeV2.t.sol` (7 rejection tests) | prod: dispute #1 on `0x8828799a…c9ddfe` | PASS |
| B5 | The arbiter resolves `Upheld` (stake held, bond returned) or `Rejected` (bond to treasury) | `resolve`, `test_resolve_upheld_returnsBondAndHoldsSlash`, `test_resolve_rejected_sendsBondToTreasury` | prod: `resolve(1, true)` → `heldSlash 0.64`, bond returned | PASS |
| B6 | Either party can appeal once inside `appealWindow`, and the appeal arbiter can reverse the first decision | `appeal`, `resolveAppeal`, 6 tests | never exercised from the panel | PARTIAL |
| B7 | After `appealWindow`, `finalize` pays the held slash to the caller and marks the dispute settled | `finalize`, `test_finalize_releasesHeldSlashToCaller` | dispute #1 unlocks 26 Oct 2026 18:58:38 UTC | PARTIAL |
| B8 | If the arbiter never resolves, the caller reclaims the bond after `resolutionWindow` | `reclaimExpiredBond`, 2 tests | no UI path | PARTIAL |

## C — Financial

| # | Behaviour | Where | Proof | Status |
|---|---|---|---|---|
| C1 | Call price is escrowed at open and refunded on timeout | `callService` / `claimTimeout`, `claimable` + `claim()` | prod: timeout drill refunded `1.0` | PASS |
| C2 | Timeout slash = `stake × terms.slashBps` (`2000` = 20 %) computed **at claim time** | `claimTimeout` | prod: `20 %` of `8.0` = `1.6`, leaving `6.4` | PASS |
| C3 | Keeper bounty = `slash × keeperBountyBps`, capped by `MAX_KEEPER_BOUNTY`; `slashAmount == 0` pays no bounty | `claimTimeout`, `test_SLAKeeper.test_bountyParamsMatchPayPerCall` | prod: bounty `0.1` on a `2.0` slash | PASS |
| C4 | Dispute slash is a separate parameter (`disputeSlashBps = 1000`) applied to the **current** stake | `DisputeV2._currentDisputeSlash` | prod: `10 %` of `6.4` = `0.64`, not `10 %` of the `8.0` the provider held earlier | PASS (behaviour), see C2/C4 note |
| C5 | Payouts are pull-based (`claim`, `withdrawBounty`) so one blocked recipient cannot stop the flow | `PayPerCallV8.claim`, `SLAKeeper.withdrawBounty` | tests + prod claims | PASS |
| C6 | Only the registry's authorised slashers and the configured PayPerCall can move money or counters | `onlySlasher`, `onlyPayPerCall`, `onlyArbiter`, `onlyAppealArbiter` | `test_transferAdmin_onlyAdmin`, `test_resolve_onlyArbiter`, `test_resolveAppeal_onlyAppealArbiter` | PASS |
| C7 | A rejected dispute sends the bond to the treasury, so spamming disputes costs money | `resolve(false)` | `test_resolve_rejected_sendsBondToTreasury` | PASS |
| C8 | A provider cannot escape a **quality** slash by unstaking between the receipt and the dispute resolution | fixed in `DisputeV3`: `openDispute` calls `registry.slash` immediately and escrows the money until `finalize` / `reclaimExpiredBond` | `test_unstakeBeforeResolve_stillPaysCaller` (V3) passes: stake `90e6 → 0`, caller still receives `10e6`; the old escape is pinned by `test_gap_unstakeBeforeResolveSkipsQualitySlash` on V2 | **PASS** — `DisputeV3` `0xEf9f…6Fec` escrows at open. Dispute #1 (tx `0x87864ca…5387ff`, block `68915026`): `heldSlash(1) = 576000` **before** `resolve`, provider stake `5.76 → 5.184`, dispute contract holds `2.576 USDC` (2.00 bond + 0.576 escrow), `SlashHeld(1, 576000)` emitted |

### C2 / C4 note — the slash base is the current stake

Both `claimTimeout` and `resolve` compute the penalty from
`registry.getProvider(id).stake` **at settlement time**, not from the stake the
provider held when the call was opened. Consequence, observed live: the provider
held `8.0 USDC` in the morning, one timeout slash reduced it to `6.4`, and the
dispute then held `10 %` of `6.4` = `0.64 USDC` instead of `0.80`.

This is arguably the safer direction (a stake can never be slashed below zero,
and `registry.slash` reverts on `InsufficientStake`), but the published terms do
not say it, so a caller reading "10 % slash" expects the number at call time.

## C8 detail — the escape (closed in `DisputeV3`)

1. Provider serves a call, submits a receipt, call becomes `Completed`.
2. Provider calls `deactivate`, waits `1 h`, calls `unstake` — allowed, because
   `pendingCalls` only counts calls with status `Pending`.
3. Caller opens a dispute inside the 7-day `disputeWindow`.
4. Arbiter resolves `Upheld`: `DisputeV2` read `stake = 0` at that moment, so no
   slash happened and `heldSlash` stayed `0`. The caller's bond was returned, but
   the quality claim paid nothing.

Timeout risk is covered (`PendingCalls` blocks the unstake), quality risk was not.

**Fix (`DisputeV3` `0xEf9f…6Fec`, deployed 24 Oct 2026):** `openDispute` slashes the stake and
escrows the money in the dispute contract immediately, so step 2 can no longer
remove it. Outcomes:

- `resolve(true)` → `Upheld`, bond back to the caller, escrow stays held.
- `resolve(false)` → `Rejected`, bond to treasury, escrow stays held through the
  appeal window.
- `finalize` → escrow to the caller (`Upheld`) or back to the provider
  (`Rejected`).
- `reclaimExpiredBond` → bond to the caller and escrow back to the provider, so
  arbiter silence costs neither party.
- `resolveAppeal` → escrow follows the appeal verdict; the same escrow moves, no
  second slash is attempted.

Cost of the design: while a dispute is open the provider's stake is `10 %`
smaller and that money is locked in the dispute contract. A spam dispute costs
the caller the `2 USDC` bond when rejected.

## Score

| Axis | PASS | PARTIAL | GAP |
|---|---|---|---|
| A — Availability | 6 | 2 | 1 |
| B — Quality | 3 | 3 | 1 |
| C — Financial | 7 | 0 | 1 |
| **Total** | **16** | **5** | **3** |

Reading: the money axis is the strongest, quality is the weakest *in proof* (the
mechanism exists, but appeal/finalize/reclaim were never driven from the UI), and
the one real hole left is A8 (published uptime target is decorative); C8 is closed
and proven on chain by dispute #1 on `DisputeV3`.

## Next work, highest value first

1. **Retire `DisputeV2`** — dispute #1 on V3 is `Pending`; after the arbiter
   resolves it, run `finalize` once the appeal window closes. Then finalize the old
   V2 dispute (26 Oct 18:58 UTC) and `revokeSlasher(0xe5D993E0…0900)` so no stale
   slasher keeps authority over the registry.
2. **A8** — give `availabilityTargetBps` teeth: a rolling window of
   `Slashed / (Completed + Slashed)` per provider, claimable by anyone, with the
   same bounty pattern as `SLAKeeper`.
3. **B6/B7/B8** — drive appeal, finalize, and `reclaimExpiredBond` from
   `DisputesV8` so all three are proven end to end instead of test-only.
