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
| A4 | A keeper claims timeouts without human action | `SLAKeeper.claim/claimBatch`, `test/SLAKeeper.t.sol` (9 tests) | first run died with its host session after `289` cycles / `5 h 13 min`, so call `0x3805a0e4…` sat `Pending` for 20 h. Replaced by GitHub Actions cron `.github/workflows/keeper.yml` (`ONCE=1`, `KEEPER_PK` secret, no host). **The cadence is not the 15 minutes the cron asks for.** Eight runs were observed in the 26 h to 26 Oct 2026 21:00 UTC (`01:31`, `07:01`, `14:18`, `20:04` and four earlier), roughly every 3-6 h, because GitHub throttles scheduled workflows in repositories without recent activity. The workflow now carries an offset second cron and also runs on every push to `main` (real activity, which is what the scheduler rewards); `docs/decisions.md` records why that is the free ceiling. A late claim costs the caller time, never funds: `claimTimeout` is permissionless and the Requests panel exposes it, so a stale call can be settled without waiting for the workflow. Live claim, run `40221690767`: heartbeat `startedCalls 2, claimable 2`, then `claim batch claimed` tx `0x87fc2941…2d9a`, `requested 2 / claimed 2`, `bounty 0.564061`, `gasUsed 274729`. It claimed the drill call `0xf2f5919e…` (slash `6.267356`, `1.0` refunded, bounty `0.313367`) **and** call `0x5b09a40a…`, which nobody had touched (slash `5.013885`, bounty `0.250694`). Stake `31.336784 → 20.055543`, `slashedCalls 4 → 6`, `pendingCalls 0`, keeper gas `20.0 → 19.993131`, `bountyClaimable 0.564061` | PASS — on chain, no human claim |
| A5 | Concurrent calls per caller are capped (`maxConcurrentCalls`, doubled for `zkTier >= 2`) | `PayPerCallV8._createCall` — cap keyed on `openCallsPerCaller[providerId][beneficiary]`, so `callServiceFor` spends the beneficiary's budget, not the payer's | `test/PayPerCallV8.t.sol` — 6 tests: default cap `10`, provider-declared cap, per-caller isolation, beneficiary accounting, slot freed on receipt, slot freed on timeout. Note: `ServiceRegistryV8` pins `zkTier` to `0`, so the 2× multiplier is unreachable in v8; it stays covered by the v7 suite | PASS |
| A6 | A call cannot open unless the stake still covers this terms version's slash (`expectedSlash >= pricePerCall`) | `PayPerCallV8._createCall`, `test_callService_insufficientStake_reverts` | prod: stake `5.76`, price `1.0`, slash `20 %` | PASS |
| A7 | A provider cannot withdraw stake while it has open calls, and must wait a cooldown after deactivating | `ServiceRegistryV8.unstake` (`PendingCalls`, `UNSTAKE_COOLDOWN = 1 h`) | v7 retirement followed the same path | PASS |
| A8 | The published `availabilityTargetBps` (e.g. `9950` = 99.5 %) is enforced against rolling uptime | `SLAUptime` `0x6916997DEFe98819176F66867fD5B356C284e89f` — live on Arc Testnet, authorised as a registry slasher. `claimAvailability` reads the registry counters since the last check, slashes `availabilitySlashBps` of the stake when the observed rate is below the published target, pays `bountyBps` of the slash to the claimer and the rest to the treasury | `test/SLAUptime.t.sol` — 29 tests covering the window reset, `TargetMet`, `NotEnoughSamples`, `Cooldown`, the stake cap, the bounty split, and admin bounds. On chain, tx `0xd7429d93cca53a9cdb5c12933c4023eb8da03c5e504dceea8aa352f8d6160539` (block `69063379`): `AvailabilitySlashed(1, 0xfbac…06Da, 5714, 9950, 7, 5373248, 1074649)`, stake `53.732480 → 48.359232 USDC`, claimer `+1.074649`, treasury `+4.298599`, window reset to `0` samples | **PASS** |

## B — Quality

| # | Behaviour | Where | Proof | Status |
|---|---|---|---|---|
| B1 | A receipt is an EIP-712 signature over `callId`, `responseHash`, `respondedAt`, `termsVersion` | `hashReceipt` / `submitReceipt` | `test_submitReceipt_completesAndCreditsProvider` | PASS |
| B2 | Wrong signer, wrong terms version, zero hash, and replay are rejected | `submitReceipt` guards | 4 v8 tests (`wrongSigner`, `wrongTermsVersion`, `zeroResponseHash`, `replay`) | PASS |
| B3a | The delivered payload is the payload the provider committed to (`responseHash`) | `src/lib/responseProof.ts`, `Verify Receipt` panel, 11 tests | `checkPayloadAgainstCommitment` hashes the body locally and compares it with `getCall().responseHash`; a mismatch is offered as dispute evidence (`buildPayloadEvidence`) and the `DisputesV8` form fills itself from it. Verified in the dev server on call `0x8cfa1821…` (committed `0x188fcd5c…`): payload `pong` → `MATCH`, payload `pongg` → `MISMATCH` with the dispute handoff prefilled | PASS — off-chain, no contract change |
| B3b | The payload was witnessed by someone the caller chose to trust, and the *correctness* of the answer is provable | mechanism: `SLAProvenance` `0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb` — an allowlisted attestor signs an EIP-712 digest over `(callId, payloadHash, originHash, observedAt)`; the contract recovers the signer and stores the record. Correctness of the answer is still not expressible on chain | `contracts/SLAProvenance.sol` + 19 tests in `test/SLAProvenance.t.sol` (wrong signer, replay, other call/origin/chain, malformed signature, empty hash, future timestamp, revocation). Live on Arc Testnet: tx `0x7cd975ab…fa76` (block `69078912`, gas `145459`) recorded call `0x8cfa1821…` with payload hash `0x188fcd5c…`, origin `arcsla.vercel.app`, attestor `0x528581fB…2F9c`; `verifyProvenance(callId, committedHash) = true`, and the Verify panel renders the record, the origin hash and the comparison. Verified in the dev server on both branches (recorded call → MATCH, unattested call → "no attestation") | **PARTIAL** — provenance is real and on chain, but the only allowlisted attestor is a key this repository holds, so the trust assumption is "trust CallGuard's witness", not independence. A correct-answer proof needs attested execution (TEE or zk-proof) and is not claimed |
| B3c | A claim about a call can be anchored together with the address that vouched for it, cannot be rewritten, and cannot be moved to another call | `SLAEvidenceRegistry` `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB` — one claim per `(callId, kind)`, two modes: `Signature` (EIP-712 `CallGuardEvidence`/`1` over the claim, for artifacts the EVM cannot check) and `Proof` (calls a verifier contract). The stored value is a digest of the off-chain envelope, never a verdict about truth | `contracts/SLAEvidenceRegistry.sol` + 21 tests in `test/SLAEvidenceRegistry.t.sol` (replay for the same call/kind, revoked verifier, signature for another call/response/chain, malleable `s`, zero hashes, verifier that reverts or refuses). Deployed on Arc Testnet in 6 txs (`RelationsLib` `0x0d478277…`, `ZKTranscriptLib` `0x01bd877f…`, `HonkVerifier` `0xC64341aB…4846`, `ZkClaimAdapter` `0x8bD4fB9F…664E`, registry `0xc311a817…`, wiring `0x8063a5ce…`; 8,699,831 gas total). `modeOf(zk-constraint) = 2`, `proofVerifier = adapter`, `owner = 0xfbac…06Da` read back from chain | **PASS** — mechanism live, and the Verify panel renders the record or says "No claim anchored for this call" |
| B3d | A zk proof that the committed response satisfies a stated output constraint verifies on chain and anchors with no trusted key in the loop | Noir/UltraHonk circuit: a private 4-byte body whose `keccak256` is the committed `responseHash` and whose first byte is a declared public value, bound to the call by a `call_id` public input. `ZkClaimAdapter` rebuilds `callId ‖ responseHash ‖ firstByte` as the 65 public inputs, so a proof for one call cannot be presented for another. Anchor gas is 3.8M, verify 2.9M | `test/HonkKeccakClaim.t.sol` (real proof verifies; tampered proof and a moved public input are rejected), `test/ZkClaimEvidence.t.sol` (another call, another response, unmet predicate, truncated blob → rejected; registry refuses a claim bound to another call), `tests/verification/fixture-envelope.test.ts` (the envelope digests to the anchored claim hash). Live: tx `0xe8f6b0c5…3732`, block `69092517`, gas `3,810,232`, `EvidenceAnchored(0x8cfa1821…, zk-constraint, 0x51323974…, 0x188fcd5c…, adapter)`; the Verify panel shows the row as `CHECKED ON CHAIN` and `MATCH` | **PASS** — with the scope stated in the claim itself: an output constraint, not correctness. The circuit says the committed hash has a preimage starting with `0x70`; it does not say the body came from the provider's endpoint or that the answer is right |
| B3e | A zk proof that a declared program ran and committed this call's request, response and handler verifies on chain, and anchors with no trusted key in the loop | RISC Zero zkVM: the guest commits `abi.encode(callId, requestHash, responseHash, handlerId)` as its journal, and a Groth16 seal is checked on chain by `RiscZeroGroth16Verifier` `0x8F0a67be…8f01` (vendored risc0-ethereum v3.0.1). `Risc0ExecutionAdapter` `0xD804F2E0…1a21` decodes the journal, requires `callId`/`responseHash`/`handlerId` to match, reads the call's `requestHash` from `PayPerCallV8.getCall`, then calls `verify(seal, imageId, sha256(journal))`. Image id, handler id and verifier are immutable. Proving runs on GitHub Actions, so it costs nothing | `test/Risc0ExecutionAdapter.t.sol` (14 tests: another call, another response, another handler, wrong image id, malformed blob, truncated journal, a verifier that reverts — all rejected), `test/Risc0Receipt.t.sol` (the committed seal verifies locally against the vendored verifier and is rejected against a misread image id), `tests/verification/risc0.test.ts` (15 tests: journal decode, binding, envelope reproduction). Live on Arc Testnet: verifier deployed block `69234491`, adapter `69236302`, anchor tx `0x21dbb04b…57cf` block `69236411` gas `404,917` → `EvidenceAnchored(0x8cfa1821…, zk-execution, 0xe3baff68…419c, 0x188fcd5c…6e8d, 0xD804F2E0…1a21)`, `isAnchored = true`; the Verify panel renders the row as `CHECKED ON CHAIN` with the guest image id, journal fields and seal size | **PASS** — the mechanism, with its scope stated: it proves the guest with the published image id executed and committed these four words, not that the guest's `ping`/`pong` handler is the code that produced the answer the provider actually sent, and not that the answer is correct |
| B4 | Only the call's caller, only a `Completed` call, only inside `disputeWindow`, only once, and only with the right `providerId` can open a dispute | `DisputeV2.openDispute`, `test/DisputeV2.t.sol` (7 rejection tests) | prod: dispute #1 on `0x8828799a…c9ddfe` | PASS |
| B5 | The arbiter resolves `Upheld` (stake held, bond returned) or `Rejected` (bond to treasury) | `resolve`, `test_resolve_upheld_returnsBondAndHoldsSlash`, `test_resolve_rejected_sendsBondToTreasury` | prod: `resolve(1, true)` → `heldSlash 0.64`, bond returned | PASS |
| B6 | Either party can appeal once inside `appealWindow`, and the appeal arbiter can reverse the first decision | `appeal`, `resolveAppeal`, 6 tests | Dispute #3 driven end to end on chain: `openDispute` tx `0x9d5a0080…6e36` (block `69066558`, `SlashHeld(3, 3868738)`), `resolve` tx `0x37577f4b…186c` (`DisputeResolved(3, Upheld, 3868738)`), `appeal` tx `0x2067bb59…1b0b`, `resolveAppeal` tx `0x66184d39…f6b8` (`AppealResolved(3, AppealUpheld, 3868738)`). The caller got the `3.868738` escrow back plus the `3.0` appeal bond, `settled(3) = true`, `heldSlash(3) = 0`, stake `38.687386 → 34.818648` | PASS — on chain; the panel renders the same state, the clicks were sent from the owner CLI because the dev browser has no wallet |
| B7 | After `appealWindow`, `finalize` pays the held slash to the caller and marks the dispute settled | `finalize`, `test_finalize_releasesHeldSlashToCaller` | all three open disputes were finalized on chain: `DisputeV2` #1 tx `0xa09b50b2…` (26 Oct `18:59:36`, `settled = true`, `heldSlash 0`), `DisputeV3` #1 tx `0x7fe6d6fa…` block `69230325` (26 Oct `20:14:41`, `0.576512` USDC returned, `heldSlash 0`), `DisputeV3` #2 tx `0xdc1e6ff9…` block `69238954` (26 Oct `21:53:50`, gas `85,048`, `0.41472` USDC returned to the owner wallet, `heldSlash 0`). A replay of either `finalize` now reverts `AlreadySettled()` (`0x560ff900`), which is what the `PARTIAL` above was waiting to see. The retired `DisputeV2` slasher authority was then removed: `ServiceRegistryV8.revokeSlasher(0xe5D993E0…0900)` tx `0xc0d3f541…` block `69238925`, gas `27,592`, `SlasherRevoked` → `authorizedSlashers(DisputeV2) = false` | **PASS** — the escrow pays out after the window and only after it |
| B8 | If the arbiter never resolves, the caller reclaims the bond after `resolutionWindow` | `reclaimExpiredBond`, 2 tests | the live drill does not demonstrate this path any more: dispute #4 on call `0xb773c233…` (`openDispute` tx `0x6f94d2a6…cac8`, block `69067859`) opened `2026-10-25 17:42:05 UTC` and was **resolved `Upheld` at `18:27:26 UTC`** (`resolvedAt = 1792952846`), so `reclaimExpiredBond(4)` reverts `AlreadyResolved()` — the 7-day window it was waiting on never applies to a resolved dispute. What #4 does leave behind is `finalize(4)`: permissionless after `resolvedAt + appealWindow` = `2026-10-27 18:27:26 UTC`, releasing `heldSlash(4) = 3481864` (3.481864 USDC) to the caller. The silence path now needs a fresh drill: open a dispute, leave it `Pending` past `resolutionWindow` (`604800` s), then `reclaimExpiredBond` | PARTIAL — the mechanism is tested and `reclaimExpiredBond` is in the contract; the live row needs a new quiet dispute after #4 is finalized |

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
| B — Quality | 10 | 2 | 0 |
| C — Financial | 8 | 0 | 0 |
| **Total** | **26** | **2** | **0** |

Reading: the money axis is the strongest, quality is the weakest *in proof* (the
mechanism exists, but appeal/finalize/reclaim were never driven from the UI), and
C8 and A8 are both proven on chain: disputes #1 and #2 escrowed their slashes at
open on `DisputeV3`, and the first `SLAUptime` claim took `5.373248 USDC` from
provider 1 for missing its published 99.5 % target. The remaining gaps are proof
gaps, not mechanism gaps: `B7` is done (all three disputes finalized on chain and the V2 slasher
authority revoked), and `B8` is the one left, waiting on its 7-day window rather than on code. B3 split in two: `B3a` (the delivered body matches the
committed hash) is PASS through `src/lib/responseProof.ts` and the Verify panel, and
`B3b` moved from GAP to PARTIAL because `SLAProvenance` now records an allowlisted
attestor's observation on chain — the mechanism exists, but the witness is a key this
repository controls, and no hash can prove an answer is *correct*.

`B3` then split three ways. `B3c` is PASS: `SLAEvidenceRegistry` anchors any named claim
about a call next to the address that vouched for it, one claim per `(callId, kind)`, and it
is live on Arc Testnet. `B3d` is PASS for the one claim it can actually carry: a Noir/UltraHonk
proof — verified on chain by `ZkClaimAdapter` + `HonkVerifier` at 2.9M gas, anchored at 3.8M —
that the committed response has a private preimage starting with a declared byte, for this
`callId`. That is an output constraint, not correctness, and the envelope says so where the
claim is stored.

`B3e` closes the other half of what `B3b` was waiting on, without hardware. A RISC Zero guest ran
on free GitHub Actions and committed `(callId, requestHash, responseHash, handlerId)`; the Groth16
seal over that claim verifies on Arc at `256,608` gas, and `Risc0ExecutionAdapter` binds the journal
to the call by reading the call's `requestHash` from `PayPerCallV8` — so a proof about one call
cannot be presented for another and a proof about another response cannot be presented for this
one. The anchor is live (`0x21dbb04b…`), and the panel shows it. This is *execution* evidence, not
a correctness proof and not attestation: the guest is a demonstration handler, so what it
establishes is that the published program ran and committed these four words, which is exactly
what the envelope's statement says and no more. `B3b` stays PARTIAL, because "an enclave signed
this" and "this program ran" are different claims, and only the second one is now provable here.

## Next work, highest value first

0. **B3e — grow the guest past the demonstration handler** — the proof machinery is live and
   costs nothing to run; what it proves is still `ping`/`pong`. The next honest step is a guest
   whose journal commits a fact the caller cares about (e.g. a response body typed against a
   declared schema), so the claim covers more than "this program ran".
1. **B8 — run `reclaimExpiredBond(4)` on 1 Nov 17:42:05 UTC** — dispute #4 is
   `Pending` with `3.481864` escrowed and the arbiter must not touch it. The
   reclaim returns the `2.0` bond to the caller and the escrow to the provider, so
   silence from the arbiter costs nobody. Nobody may `resolve` it before then.
2. **A4 — keeper cadence** — measured, not assumed: 8 runs in 26 h (roughly every
   3-6 h) against a `*/15` request, so the workflow now also runs on every push to
   `main` and carries an offset second cron (commit `56d48da`). A call can still sit
   `Pending` for hours when the repository is quiet; only a paid runner or an external
   scheduler would tighten that, and neither is free. The earlier keeper
   `0xd7B4C2B1…7d59` still holds `20 USDC` whose key is not in this workspace.
