# Step 5 — Contracts pass C: disputes and evidence

**Files:** `contracts/DisputeV4.sol` (613 lines), `contracts/SLAEvidenceRegistryV2.sol` (267).
**Baseline:** `3e279bd`.

## Dispute lifecycle

| Status | Entered by | Guard | Money held | Exits |
|---|---|---|---|---|
| `Pending` | `openDispute` | caller of the call; `Completed`; `now <= completedAt + disputeWindow` | bond + held slash escrowed at open | `resolve`, `reclaimExpiredBond` |
| `Upheld` | `resolve(true)` | arbiter, `now <= openedAt + resolutionWindow` | bond returned to caller; held slash still in the contract | `appeal`, `finalize` |
| `Rejected` | `resolve(false)` | same | bond to treasury; held slash still in the contract | `appeal`, `finalize` |
| `Appealed` | `appeal` | a party, `now <= resolvedAt + appealWindow` | adds appeal bond | `resolveAppeal` |
| `AppealUpheld` | `resolveAppeal(true)` | appeal arbiter | held slash to caller; bond per appellant | terminal |
| `AppealRejected` | `resolveAppeal(false)` | appeal arbiter | held slash to provider; bond per appellant | terminal |

`finalize` is permissionless and pays the held slash to the caller when the status is `Upheld`, to the provider owner otherwise (`DisputeV4.sol:323-343`).
`reclaimExpiredBond` is permissionless and returns both the bond and the held slash when the arbiter never rules (`:295-321`).

## Money flow, every terminal state

| Terminal | Caller receives | Provider receives | Treasury receives | Contract left with |
|---|---|---|---|---|
| `finalize` after `Upheld` | bond (already at resolve) + heldSlash | — | — | 0 |
| `finalize` after `Rejected` | — | heldSlash | bond (already at resolve) | 0 |
| `resolveAppeal(true)` | heldSlash + bond if caller appealed | bond if provider appealed and lost | bond if caller appealed and lost | 0 |
| `resolveAppeal(false)` | — | heldSlash + bond if provider appealed | bond if caller appealed | 0 |
| `reclaimExpiredBond` | bond | heldSlash | — | 0 |

## Findings

### CG-DIS-01 — a provider can unstake inside the dispute window, so an upheld dispute holds nothing
- Severity: High
- Confidence: High
- Evidence: `contracts/DisputeV4.sol:212-270` — `openDispute` escrows `_currentDisputeSlash(providerId)` at opening time; `:585-588` — that value is `registry.getProvider(id).stake * disputeSlashBps / 10_000`, read from the live stake. `contracts/ServiceRegistryV8.sol:251-266` — `unstake` guards only `p.active` and `p.pendingCalls != 0`, with `UNSTAKE_COOLDOWN` after deactivation. `contracts/PayPerCallV8.sol:230` — `submitReceipt` clears the pending call before the provider is paid, so a completed call no longer blocks `unstake`. `contracts/DisputeV4.sol:225-227` — the caller has `disputeWindow` (7 days) from `completedAt` to open.
- Precondition: the provider delivered a call and expects a quality dispute.
- Impact: the provider calls `deactivate`, waits the 1 hour cooldown, calls `unstake`, and the stake is `0`. Every dispute opened afterwards computes `slashAmount = 0`, so `heldSlash` stays `0`, `openDispute` transfers nothing, and an `Upheld` verdict pays the caller nothing. `resolve` still returns the caller's bond, so the caller spends gas and gets exactly their deposit back while the provider keeps the price and the stake. The V4 rewrite moved the escrow from resolution to opening and closed the *resolution-time* escape; it did not close the *opening-time* race, and the 7-day window against a 1-hour cooldown leaves it wide open.
- Existing mitigation: the header comment at `DisputeV4.sol:15-21` states the intent; the code implements it only against a stake that still exists. `previewSlash` (`:489-492`) lets a caller check before paying the bond, so an informed caller can decline a pointless dispute.
- Required fix: hold the slash at **completion**, not at dispute. `submitReceipt` should move the provider's exposure into an escrow keyed by `callId` for `disputeWindow`, releasing it when the window closes; or make `unstake` reject a provider whose most recent completed call is younger than `disputeWindow`. Either needs a new deployment.
- Verification: a fork or unit test in which a provider completes a call, deactivates, advances `UNSTAKE_COOLDOWN`, unstakes, and the caller then opens a dispute: assert `heldSlash == 0` today, and `> 0` after the fix.

### CG-DIS-02 — `setDisputeSlashBps` allows the arbiter to escrow the entire stake, with no timelock
- Severity: Medium
- Confidence: High
- Evidence: `contracts/DisputeV4.sol:446-451` — `setDisputeSlashBps` accepts any value up to `10_000` and applies immediately. `:585-588` uses it to compute the held slash. `:436-444` — `setDisputeBond` and `setAppealBond` are equally immediate and unbounded.
- Precondition: arbiter key, or an arbiter that changes the parameter between a call and its dispute.
- Impact: with `disputeSlashBps = 10_000`, one upheld dispute transfers the provider's whole stake to the caller. With a large `disputeBond`, a caller cannot afford to dispute at all. The parameters are also mutable between the moment a provider registers and the moment a dispute is opened, so no provider can price the risk it is taking.
- Existing mitigation: `InvalidBps` bounds the value at `10_000`; the values are public and emitted.
- Required fix: bound `disputeSlashBps` to the provider's own advertised `slashBps`, and put both bond setters behind the same timelock pattern as terms.
- Verification: a forge test asserting `setDisputeSlashBps(10_001)` reverts and that a dispute cannot hold more than the provider's declared `slashBps`.

### CG-DIS-03 — the arbiter, the appeal arbiter, and the treasury are the same key, so appeal is not an independent review
- Severity: Medium
- Confidence: High
- Evidence: `contracts/DisputeV4.sol:415-434` — `setArbiter`, `setAppealArbiter`, and `setTreasury` are all gated on `msg.sender == arbiter`; the deployment sets all three to the owner EOA (`script/DeployV8.s.sol:47-49`).
- Precondition: none; this is the deployed configuration.
- Impact: the appeal path cannot overturn the first decision for any reason other than the same key changing its mind, and the treasury that receives forfeited bonds is the same key that decides forfeiture. The three-role design in the code implies separation that the deployment does not have.
- Existing mitigation: the roles are separate storage slots, so a later split needs only three transactions.
- Required fix: set `appealArbiter` to a different key or a multisig, and `treasury` to a contract the arbiter does not control. No redeployment needed.
- Verification: `DisputeV4.arbiter()`, `.appealArbiter()`, `.treasury()` return three distinct addresses.

### CG-DIS-04 — a timed-out call can never be disputed, so the keeper's slash is final
- Severity: Low
- Confidence: High
- Evidence: `contracts/DisputeV4.sol:218-220` — `openDispute` rejects anything but `CallStatus.Completed`; `contracts/PayPerCallV8.sol:259` sets `Slashed` on timeout.
- Precondition: a provider that missed a deadline for a legitimate reason, for example a chain stall or an RPC outage during the response window.
- Impact: the slash already happened and the caller is already refunded, so the only thing a dispute could recover is the provider's stake. There is no path for it. A provider punished by infrastructure failure has no appeal.
- Existing mitigation: `SUBMIT_GRACE` gives 5 seconds after the deadline, and the provider chooses `maxResponseTime`.
- Required fix: none required for caller safety. If provider fairness matters, allow a dispute on a `Slashed` call limited to reversing the slash.
- Verification: `openDispute` on a slashed call reverts `CallNotCompleted`.

### CG-DIS-05 — evidence kinds are read at snapshot time from a mutable owner list
- Severity: Low
- Confidence: High
- Evidence: `contracts/DisputeV4.sol:459-476` (`setEvidenceKinds`, up to 8, arbiter-gated) and `:529-583` (`_snapshotEvidence` iterates the current list).
- Precondition: the arbiter changes the kind list between two disputes.
- Impact: two disputes over comparable calls can record different claims, and a kind removed from the list silently stops appearing in new snapshots. Because the snapshot is immutable once written, the record is honest about *what happened*, but the arbiter controls what gets looked at.
- Existing mitigation: the kind list is public and its changes are emitted.
- Required fix: pin the kind list per dispute, or record the list version in the snapshot.
- Verification: a forge test changing kinds between two `openDispute` calls and asserting the second snapshot differs.

### CG-EVD-01 — `statementHash` and `assumptionHash` are never verified against the proof
- Severity: Medium
- Confidence: High
- Evidence: `contracts/SLAEvidenceRegistryV2.sol:160-180` — `anchor` accepts `statementHash` and `assumptionHash` as free parameters. `contracts/zk/Risc0ExecutionAdapter.sol:56-104` binds `callId`, `requestHash`, `responseHash`, `handlerId`, and `claimHash`, but takes no statement or assumption input. `contracts/zk/ZkClaimAdapter.sol:43-70` binds only `callId` and `responseHash` from the circuit. `contracts/zk/SLAProvenanceAdapter.sol:42-51` ignores `claimHash`, `statementHash`, and `assumptionHash` entirely.
- Precondition: anyone anchoring a claim; anchoring is permissionless.
- Impact: a valid proof for a call can be anchored together with any statement text. The registry's own documentation says it stores a claim, not a verdict, but a reader who sees "proof verified" plus a statement will read the statement as proven. For `zk-execution` the binding is strong because `claimHash` is a journal word (`Risc0ExecutionAdapter.sol:88-90`); for `zk-constraint` and `witness` it is not.
- Existing mitigation: `bindsResponse` records whether the artifact binds the response, and the UI distinguishes the two.
- Required fix: make the envelope digest a proof input for every adapter, or document per kind that the statement is unauthenticated.
- Verification: anchor a valid `zk-constraint` proof with a statement hash that does not describe the predicate; it succeeds today.

### CG-EVD-02 — an anchored claim is one-shot per `(callId, kind)`, but statement text is not, so a wrong anchor cannot be corrected
- Severity: Info
- Confidence: High
- Evidence: `contracts/SLAEvidenceRegistryV2.sol` stores one row per `(callId, kind)` and `anchor` reverts on a duplicate.
- Precondition: a claim anchored with a typo or a superseded statement.
- Impact: the row is permanent. Correcting the statement requires a different kind or a new call, so the dispute snapshot may carry wording nobody wants.
- Existing mitigation: the one-shot rule is what makes a snapshot meaningful.
- Required fix: none required; anchor carefully.
- Verification: not applicable.

## Nothing found

- No path in which a caller loses the bond without a decision: `reclaimExpiredBond` returns it when the arbiter is silent (`:295-321`).
- No path in which the held slash is stranded: every terminal state transfers or returns it, and `heldSlash` is zeroed before each transfer.
- `finalize` and `reclaimExpiredBond` are permissionless but cannot choose a destination, so a third party cannot redirect funds.
- A dispute cannot be opened twice for the same call: `disputeIdByCallId` plus `AlreadyDisputedElsewhere` against the V3 registry.
- `setEvidenceKinds` rejects duplicates and caps the list at 8 (`:459-476`).
