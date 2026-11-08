# Step 3 — Contracts pass A: calls, payments, timeout, keeper

**Files:** `contracts/PayPerCallV8.sol` (385 lines), `contracts/SLAKeeper.sol` (116), `contracts/interfaces/IPayPerCallV8.sol`.
**Baseline:** `3e279bd`.

## External surface

| Function | Access | Money | Notes |
|---|---|---|---|
| `callService(providerId, requestHash)` | anyone | `safeTransferFrom` caller → contract | `:112-123` |
| `callServiceFor(providerId, requestHash, beneficiary)` | anyone | `safeTransferFrom` caller → contract; call owned by `beneficiary` | `:124-147` |
| `callServiceWithAuthorization(...)` | anyone with a signed authorization | `transferWithAuthorization` beneficiary → contract | `:149-198` |
| `submitReceipt(callId, responseHash, respondedAt, termsVersion, sig)` | provider signer signature | escrow → `claimable[provider.owner]` | `:200-248` |
| `claimTimeout(callId)` | anyone | refund + slash → `claimable`, bounty → keeper | `:250-288` |
| `claim()` | anyone with a balance | contract → caller | `:290-300` |
| `getCall`, `hashReceipt`, `registry` | view | — | `:304-318` |

## Accounting, traced

`callService`: USDC in `+= c.amount`, `claimable` unchanged.
`submitReceipt`: no USDC moves; `claimable[owner] += c.amount`. Contract still holds the USDC until `claim()`.
`claimTimeout`: USDC in from registry `+= slashAmount`; credits `caller += c.amount + (slashAmount - bounty)`, `keeper += bounty`. Contract still holds both until `claim()`.
`claim`: USDC out `-= claimable[msg.sender]`, zeroed before transfer (`:294-297`).

Every path is balanced: total credits equal escrow plus received slash. No path lets the owner touch caller escrow.

## Findings

### CG-CALL-01 — `callServiceFor` lets a third party consume another caller's concurrency allowance
- Severity: Medium
- Confidence: High
- Evidence: `contracts/PayPerCallV8.sol:124-147` (payer is `msg.sender`, call owner is `beneficiary`); `:343-345` (`openCallsPerCaller[providerId][beneficiary] >= cap` reverts).
- Precondition: any funded attacker; a provider with a finite `maxConcurrentCalls`.
- Impact: the attacker spends their own USDC to open `cap` pending calls in the victim's name. The victim then cannot open a call until those deadline out or are completed. The attacker is refunded on timeout, so the cost is gas plus temporary capital, and the griefing is repeatable. The victim's allowance is a shared namespace they do not control.
- Existing mitigation: the attacker pays `pricePerCall` per call and risks nothing else; the victim is only blocked, never charged.
- Required fix: either charge the beneficiary (`authorization` path) or count the allowance against `msg.sender` when it is not the beneficiary.
- Verification: add a forge test where `callerA` fills `cap` calls for `callerB` and assert `callerB`'s next `callService` reverts `TooManyConcurrentCalls`. That test passing is the finding.

### CG-CALL-02 — the provider concurrency cap is per caller, not per provider
- Severity: Low
- Confidence: High
- Evidence: `contracts/PayPerCallV8.sol:341-345` — the only cap check is `openCallsPerCaller[providerId][beneficiary]`. `maxConcurrentCalls` (`ServiceRegistryV8.sol:420-430`) never gates total open calls.
- Precondition: many distinct funded callers.
- Impact: a provider's total pending obligations are unbounded, so the stake can be spread across an arbitrary number of calls. Each timeout slashes `stake * slashBps / 10000` of the *remaining* stake (`:268`), so early claimants take a larger share than later ones and a late caller recovers the price but a much smaller slash. The provider's advertised slash is therefore not a per-call guarantee once several calls are open.
- Existing mitigation: `_createCall` requires `expectedSlash >= pricePerCall` (`:338-340`), which guarantees that one call is backed, not that all are.
- Required fix: track a provider-wide open-call counter and require `pendingCalls * expectedSlash <= stake`, or price the guarantee as "pro rata".
- Verification: forge test opening `n` calls and asserting the sum of realized slashes is below `n * expectedSlash`.

### CG-CALL-03 — the timeout slash can revert a settlement that the code has already marked final
- Severity: Low
- Confidence: Medium
- Evidence: `contracts/PayPerCallV8.sol:259` sets `status = Slashed` before `_registry.slash` at `:282`; `ServiceRegistryV8.sol:360-367` reverts `InsufficientStake` when `p.stake < amount`. The stub in `contracts/interfaces/IPayPerCallV8.sol` and `test/` also matter here.
- Precondition: the stake drops below `stake * slashBps / 10000` between the read at `:268` and the call at `:282` — impossible in one transaction, so this needs a second slasher contract acting inside the same block, or a stake value that changed earlier in the same transaction through a reentrant path.
- Impact: today the arithmetic makes the revert unreachable, because `slashAmount` is recomputed from the live stake immediately before the call. The risk is structural: the guard depends on `slash()`'s ordering, not on `claimTimeout` checking anything. If a future adapter or a second slasher is added, a revert here would leave the call permanently `Slashed` with no refund credited.
- Existing mitigation: `nonReentrant` on both sides, and `slash` reads the same storage the caller just read.
- Required fix: make `claimTimeout` tolerate a short stake by capping `slashAmount` to the current stake and continuing, instead of relying on the registry to revert.
- Verification: a forge test with a mock registry that returns a smaller stake than `getProvider` reported, asserting `claimTimeout` still credits the refund.

### CG-CALL-04 — provider earnings have no sweep, so a provider that loses its key loses its balance
- Severity: Info
- Confidence: High
- Evidence: `contracts/PayPerCallV8.sol:238` credits `claimable[provider.owner]`; `:290-300` pays only `msg.sender`. There is no `claimTo` and no owner-level recovery.
- Precondition: provider owner key lost or the owner is a contract without a `claim()` path.
- Impact: earnings sit in the contract forever. No third party is harmed; the loss is the provider's.
- Existing mitigation: none, and none is needed for caller safety.
- Required fix: none required. Document that `claimable` is key-bound.
- Verification: not applicable.

### CG-CALL-05 — `SLAKeeper.claimBatch` is an unbounded loop over caller-supplied ids
- Severity: Info
- Confidence: High
- Evidence: `contracts/SLAKeeper.sol:82-108` iterates `callIds` with a `claimTimeout` call per element.
- Precondition: a keeper passing a large array.
- Impact: only the keeper's own transaction can run out of gas, and every element is pre-checked with `isClaimable` (`:44-49`). No cross-user harm.
- Existing mitigation: `isClaimable` filter, and the keeper script batches.
- Required fix: none required.
- Verification: not applicable.

## Nothing found

- No reentrancy path: every money function is `nonReentrant`, and `claim` zeroes before transferring (`:294-297`).
- No signature malleability hole: `ECDSA.recover` rejects high-s and invalid `v` (OZ v5).
- No deadline arithmetic overflow: `deadline` is `uint32` set from `block.timestamp + maxResponseTime`, and `maxResponseTime` is bounded by `_validateTerms`.
- No way for the keeper to take the caller refund: `refunded + slashed` is always credited to `c.caller`, never to `msg.sender`.
- No way for a recipient of `callServiceFor` to be charged: the payer is always `msg.sender`.
