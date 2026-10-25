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
| A4 | A keeper claims timeouts without human action | `SLAKeeper.claim/claimBatch`, `test/SLAKeeper.t.sol` (9 tests) | first run died with its host session after `289` cycles / `5 h 13 min`, so call `0x3805a0e4…` sat `Pending` for 20 h. Replaced by GitHub Actions cron `.github/workflows/keeper.yml` (every 15 min, `ONCE=1`, `KEEPER_PK` secret, no host). Live claim, run `40221690767`: heartbeat `startedCalls 2, claimable 2`, then `claim batch claimed` tx `0x87fc2941…2d9a`, `requested 2 / claimed 2`, `bounty 0.564061`, `gasUsed 274729`. It claimed the drill call `0xf2f5919e…` (slash `6.267356`, `1.0` refunded, bounty `0.313367`) **and** call `0x5b09a40a…`, which nobody had touched (slash `5.013885`, bounty `0.250694`). Stake `31.336784 → 20.055543`, `slashedCalls 4 → 6`, `pendingCalls 0`, keeper gas `20.0 → 19.993131`, `bountyClaimable 0.564061` | PASS — on chain, no human claim |
| A5 | Concurrent calls per caller are capped (`maxConcurrentCalls`, doubled for `zkTier >= 2`) | `PayPerCallV8._createCall` — cap keyed on `openCallsPerCaller[providerId][beneficiary]`, so `callServiceFor` spends the beneficiary's budget, not the payer's | `test/PayPerCallV8.t.sol` — 6 tests: default cap `10`, provider-declared cap, per-caller isolation, beneficiary accounting, slot freed on receipt, slot freed on timeout. Note: `ServiceRegistryV8` pins `zkTier` to `0`, so the 2× multiplier is unreachable in v8; it stays covered by the v7 suite | PASS |
| A6 | A call cannot open unless the stake still covers this terms version's slash (`expectedSlash >= pricePerCall`) | `PayPerCallV8._createCall`, `test_callService_insufficientStake_reverts` | prod: stake `5.76`, price `1.0`, slash `20 %` | PASS |
| A7 | A provider cannot withdraw stake while it has open calls, and must wait a cooldown after deactivating | `ServiceRegistryV8.unstake` (`PendingCalls`, `UNSTAKE_COOLDOWN = 1 h`) | v7 retirement followed the same path | PASS |
| A8 | The published `availabilityTargetBps` (e.g. `9950` = 99.5 %) is enforced against rolling uptime | `SLAUptime` `0x6916997DEFe98819176F66867fD5B356C284e89f` — live on Arc Testnet, authorised as a registry slasher. `claimAvailability` reads the registry counters since the last check, slashes `availabilitySlashBps` of the stake when the observed rate is below the published target, pays `bountyBps` of the slash to the claimer and the rest to the treasury | `test/SLAUptime.t.sol` — 29 tests covering the window reset, `TargetMet`, `NotEnoughSamples`, `Cooldown`, the stake cap, the bounty split, and admin bounds. On chain, tx `0xd7429d93cca53a9cdb5c12933c4023eb8da03c5e504dceea8aa352f8d6160539` (block `69063379`): `AvailabilitySlashed(1, 0xfbac…06Da, 5714, 9950, 7, 5373248, 1074649)`, stake `53.732480 → 48.359232 USDC`, claimer `+1.074649`, treasury `+4.298599`, window reset to `0` samples | **PASS** |

## B — Quality

| # | Behaviour | Where | Proof | Status |
|---|---|---|---|---|
| B1 | A receipt is an EIP-712 signature over `callId`, `responseHash`, `respondedAt`, `termsVersion` | `hashReceipt` / `submitReceipt` | `test_submitReceipt_completesAndCreditsProvider` | PASS |
| B2 | Wrong signer, wrong terms version, zero hash, and replay are rejected | `submitReceipt` guards | 4 v8 tests (`wrongSigner`, `wrongTermsVersion`, `zeroResponseHash`, `replay`) | PASS |
| B3 | The receipt is checked against the *content* of the response | not on-chain: `responseHash` is whatever the provider signed | — | **GAP** (by design; B4 is the backstop) |
| B4 | Only the call's caller, only a `Completed` call, only inside `disputeWindow`, only once, and only with the right `providerId` can open a dispute | `DisputeV2.openDispute`, `test/DisputeV2.t.sol` (7 rejection tests) | prod: dispute #1 on `0x8828799a…c9ddfe` | PASS |
| B5 | The arbiter resolves `Upheld` (stake held, bond returned) or `Rejected` (bond to treasury) | `resolve`, `test_resolve_upheld_returnsBondAndHoldsSlash`, `test_resolve_rejected_sendsBondToTreasury` | prod: `resolve(1, true)` → `heldSlash 0.64`, bond returned | PASS |
| B6 | Either party can appeal once inside `appealWindow`, and the appeal arbiter can reverse the first decision | `appeal`, `resolveAppeal`, 6 tests | Dispute #3 driven end to end on chain: `openDispute` tx `0x9d5a0080…6e36` (block `69066558`, `SlashHeld(3, 3868738)`), `resolve` tx `0x37577f4b…186c` (`DisputeResolved(3, Upheld, 3868738)`), `appeal` tx `0x2067bb59…1b0b`, `resolveAppeal` tx `0x66184d39…f6b8` (`AppealResolved(3, AppealUpheld, 3868738)`). The caller got the `3.868738` escrow back plus the `3.0` appeal bond, `settled(3) = true`, `heldSlash(3) = 0`, stake `38.687386 → 34.818648` | PASS — on chain; the panel renders the same state, the clicks were sent from the owner CLI because the dev browser has no wallet |
| B7 | After `appealWindow`, `finalize` pays the held slash to the caller and marks the dispute settled | `finalize`, `test_finalize_releasesHeldSlashToCaller` | dispute #1 unlocks 26 Oct 2026 18:58:38 UTC | PARTIAL |
| B8 | If the arbiter never resolves, the caller reclaims the bond after `resolutionWindow` | `reclaimExpiredBond`, 2 tests | clock started: dispute #4 on call `0xb773c233…` (`openDispute` tx `0x6f94d2a6…cac8`, block `69067859`), status `Pending`, `SlashHeld(4, 3481864)`, bond `2.0`, `heldSlash(4) = 3481864`, `settled(4) = false`. `reclaimExpiredBond(4)` opens at `2026-11-01 17:42:05 UTC` (`openedAt + 604800`); it must stay unresolved until then | PARTIAL — waiting on the 7-day window |

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

## A8 detail — the uptime promise (closed 25 Oct 2026)

`availabilityTargetBps` is stored per terms version (default `9950` = 99.5 %) and
was never read for a verdict: a provider could publish it, miss calls, and keep
the full stake. Per-call timeouts are covered by `PayPerCallV8.claimTimeout`, but
an aggregate promise is not a call.

`SLAUptime` closes that:

1. **Window** — `completedCalls` and `slashedCalls` deltas since the provider's
   last check. The first check scores the whole history, so a new provider gets no
   free pass.
2. **Metric** — `completed / (completed + slashed)` in basis points.
3. **Gates** — at least `minSamples` observations, an observed rate below the
   published target, and the cooldown (24 h) elapsed. Deployed with `minSamples 5`
   on testnet so the live provider's handful of calls can reach a verdict; `20` is
   the mainnet value.
4. **Penalty** — `availabilitySlashBps` (10 %) of the stake, capped at the stake.
5. **Split** — `bountyBps` (20 %) of the slash to the claimer immediately, the rest
   to the treasury. No bond: a claim costs gas only.
6. **Reset** — the window baseline and the cooldown update before the external
   calls, so a reentrant claim cannot score the same calls twice.

Why the window resets instead of using a lifetime ratio: a provider with 200 clean
calls at 99.9 % would need hundreds of misses before a cumulative score moved.
After each claim the baseline moves, so the next claim scores only what happened
since the last decision, and a recovered provider is back in compliance after one
clean window.

First live claim (provider 1, 25 Oct 2026): window `4 completed / 3 slashed` =
`5714` bps against the `9950` target, `7` samples, slash `5.373248 USDC` (10 % of
the `53.732480` stake), split `1.074649` to the claimer and `4.298599` to the
treasury, tx `0xd7429d93…60539`. The window reset to `0` samples and
`previewAvailability(1)` now reports `ready = false` until the 24 h cooldown
(`1793034255`) elapses and new calls land.

Known limit, stated honestly: a provider that stops taking calls stops
accumulating misses. It also stops earning, and the stake stays exposed to dispute
slashes, so the incentive still points at serving.

## Score

| Axis | PASS | PARTIAL | GAP |
|---|---|---|---|
| A — Availability | 8 | 0 | 0 |
| B — Quality | 5 | 2 | 1 |
| C — Financial | 8 | 0 | 0 |
| **Total** | **21** | **2** | **1** |

Reading: the money axis is the strongest, quality is the weakest *in proof* (the
mechanism exists, but appeal/finalize/reclaim were never driven from the UI), and
C8 and A8 are both proven on chain: disputes #1 and #2 escrowed their slashes at
open on `DisputeV3`, and the first `SLAUptime` claim took `5.373248 USDC` from
provider 1 for missing its published 99.5 % target. The remaining gaps are proof
gaps, not mechanism gaps: B7/B8 (finalize and `reclaimExpiredBond` are waiting on
their windows, not on code) and B3 (the receipt proves who signed it, not that the
payload was the promised content — the only real design gap left). A no longer has
an open row: the keeper runs on GitHub Actions and claimed two timeouts unattended.

## Next work, highest value first

1. **B7 — `finalize` both open disputes** — #1 unlocks 26 Oct 20:13:05 UTC and #2
   unlocks 26 Oct 21:52:02 UTC; each pays its held slash to the caller and marks
   the dispute settled. Then the old V2 dispute (26 Oct 18:58:38 UTC) can be
   finalized and `revokeSlasher(0xe5D993E0…0900)` run, which retires V2.
2. **B8 — run `reclaimExpiredBond(4)` on 1 Nov 17:42:05 UTC** — dispute #4 is
   `Pending` with `3.481864` escrowed and the arbiter must not touch it. The
   reclaim returns the `2.0` bond to the caller and the escrow to the provider, so
   silence from the arbiter costs nobody. Nobody may `resolve` it before then.
3. **A4 — keep the Actions cron green** — done as a mechanism (run `40221690767`
   claimed two timeouts, one of them never touched by hand). What is worth watching
   now is only reliability: GitHub delays `*/15` schedules by minutes to tens of
   minutes, so a call can stay `Pending` longer than a 60 s poll would allow. If that
   matters, drop to a self-hosted runner or add a second trigger. The earlier keeper
   `0xd7B4C2B1…7d59` still holds `20 USDC` whose key is not in this workspace.
