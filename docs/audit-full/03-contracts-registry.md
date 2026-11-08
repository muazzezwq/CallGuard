# Step 4 — Contracts pass B: providers, stake, terms, slashing

**File:** `contracts/ServiceRegistryV8.sol` (466 lines), `contracts/interfaces/IServiceRegistryV8.sol`.
**Baseline:** `3e279bd`.

## Provider state machine

| From | Action | Guard | To |
|---|---|---|---|
| — | `register` | `MIN_STAKE`, unique owner, valid terms | active, `latestTermsVersion = 1` |
| active | `addStake` | owner | active, stake up |
| active | `deactivate` | owner | inactive, `deactivatedAt = now` |
| inactive | `unstake` | `!active`, `pendingCalls == 0`, `now >= deactivatedAt + UNSTAKE_COOLDOWN` | stake `0` |
| active/inactive | `proposeTermsUpdate` | owner, `_validateTerms` | pending proposal, `executeAt = now + TERMS_TIMELOCK` |
| pending | `executeTermsUpdate` | `now >= executeAt` | new version, pending cleared |
| pending | `cancelTermsUpdate` | owner | pending cleared |
| active | `slash` | `onlySlasher`, `stake >= amount` | stake down, USDC out |

`pendingCalls` moves only through `markCallStarted` (`:372-376`) and `markCallFinished` (`:378-383`), both `onlyPayPerCall`.

## Findings

### CG-REG-01 — a provider may advertise a zero slash and a zero price, which makes the SLA unenforceable
- Severity: Medium
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol:461-465` — `_validateTerms` checks only an upper bound on `slashBps` (`> MAX_SLASH_BPS`), an upper bound on availability, and a minimum response time. Nothing rejects `slashBps == 0` or `availabilityTargetBps == 0`. `contracts/ServiceRegistryV8.sol:403-410` — `updatePrice` accepts `newPrice == 0`. `contracts/PayPerCallV8.sol:338-340` then passes: `expectedSlash = 0 < price = 0` is false, so the call opens.
- Precondition: a provider registers or updates with `slashBps = 0`.
- Impact: the caller pays for a promise with no consequence for breaking it. `claimTimeout` computes `slashAmount = 0` (`PayPerCallV8.sol:268`) and the caller gets only their own money back — the SLA is a refund policy, not a penalty. A UI that lists such a provider next to a 20% one misrepresents the risk.
- Existing mitigation: none on chain. The frontend shows `slashBps` per provider, but it does not block or warn.
- Required fix: enforce a floor (`slashBps >= MIN_SLASH_BPS`) and a non-zero price, or expose the value as "guarantee: none" everywhere it is displayed.
- Verification: `forge test` case calling `proposeTermsUpdate` with `slashBps = 0` and asserting a revert. Today it succeeds.

### CG-REG-02 — the registry admin can authorize an arbitrary slasher with no timelock, and that slasher can drain any stake
- Severity: High
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol:151-172` (`transferAdmin`, `authorizeSlasher`, `revokeSlasher` are all `onlyAdmin` and immediate); `:360-367` (`slash` moves USDC to any `recipient` up to the whole stake).
- Precondition: the admin key is compromised, or the admin is a single EOA that signs a malicious transaction.
- Impact: one transaction authorizes an attacker contract, a second drains every provider's stake to an arbitrary address. There is no timelock, no event-based delay, and no bound. The whole provider economy is a single-key trust.
- Existing mitigation: `authorizedSlashers` is a mapping, so the damage is visible in events after the fact. `DisputeV4` is the only expected slasher.
- Required fix: make `authorizeSlasher` a two-step call with a delay (for example 2 days, the same order as `TERMS_TIMELOCK`), or move admin to a multisig with a timelock. Because the contract is immutable, this needs a new deployment.
- Verification: a forge test where `authorizeSlasher` followed by `slash` in the same block succeeds today; after the fix, the second call must revert until the delay elapses.

### CG-REG-03 — the stored `termsHash` is caller-supplied and is not derived from the terms
- Severity: Low
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol:272-287` stores `input.termsHash` with no comparison against `maxResponseTime`, `slashBps`, `availabilityTargetBps`, `termsUri`. `PayPerCallV8.sol:369` copies it into the call and emits it in `CallStarted`.
- Precondition: a provider proposes terms whose hash does not describe the terms.
- Impact: `CallStarted.termsHash` looks like a commitment to the SLA that governed the call, but it is a free-form 32 bytes. Any off-chain verifier that compares the hash to the terms text will be checking a value the provider chose, not a value the chain enforced.
- Existing mitigation: the numeric terms are stored separately and are enforced; only the hash is unbound.
- Required fix: compute the hash on chain from the stored fields plus `termsUri`, or drop it from the event.
- Verification: a forge test proposing a matching hash and asserting `getTerms(id, 1).termsHash == keccak256(abi.encode(...))`.

### CG-REG-04 — a pending terms proposal can be overwritten, and the version number is reused
- Severity: Low
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol:272-287` — `proposeTermsUpdate` writes `_pendingTerms` unconditionally. `proposedVersion = _latestTermsVersion + 1`, so a second proposal before execution emits the same version number twice.
- Precondition: the provider proposes twice inside one timelock window.
- Impact: off-chain watchers that key on `(providerId, proposedVersion)` see two different proposals with one id, and the two-day delay restarts each time. No other party can be harmed, since only the owner can propose.
- Existing mitigation: `TermsProposed` events carry the terms, so a watcher can detect the change.
- Required fix: revert when a proposal is already pending, or bump a proposal nonce.
- Verification: a forge test proposing twice and asserting the second reverts with `TermsProposalPending`.

### CG-REG-05 — `zkTier` is never assigned, so the cap-doubling branch is dead code
- Severity: Info
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol` has no setter for `zkTier`; the field is written only in `register` (default `0`) and read in `PayPerCallV8.sol:342` (`provider.zkTier >= 2 ? baseCap * 2 : baseCap`) and in `getProvider`.
- Precondition: none.
- Impact: the only concurrency cap is the single value in `maxConcurrentCalls`. Anyone reading the code or the ABI may believe a higher tier grants headroom; it never does.
- Existing mitigation: none needed; the branch is safe.
- Required fix: remove the branch and the field, or add the setter it was meant to have.
- Verification: `grep -n zkTier contracts/ServiceRegistryV8.sol` shows no assignment.

### CG-REG-06 — `transferAdmin` is single-step and there is no way to recover a mistyped admin
- Severity: Low
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol:151-156` assigns `admin = newAdmin` immediately with only an address check.
- Precondition: a typo or a wrong-chain address in the admin slot.
- Impact: `authorizeSlasher`, `revokeSlasher`, and `setPayPerCall` become permanently unreachable. `setPayPerCall` being one-time makes this permanent for the registry-to-calls wiring.
- Existing mitigation: the owner checks the address before signing; there is no on-chain guard.
- Required fix: two-step `transferAdmin` / `acceptAdmin`.
- Verification: a forge test asserting `admin` does not change until the new admin accepts.

## Nothing found

- `unstake` cannot run with `pendingCalls != 0` (`:251-266`), so an open call always keeps its stake.
- `slash` cannot exceed the stake (`:360-367`), so no provider balance ever goes negative.
- `markCallStarted`/`markCallFinished`/`incCompleted`/`incSlashed` are `onlyPayPerCall`, so counters cannot be forged.
- `register` rejects a duplicate owner and enforces `MIN_STAKE`.
- `_validateTerms` bounds `maxResponseTime` from below and `slashBps`/`availabilityTargetBps` from above, so no overflow path exists in `Math.mulDiv`.

## Open question, not a finding

`unstake` guards only `pendingCalls`. A **completed** call stays disputable for `disputeWindow` (7 days) while the unstake cooldown is 1 hour, so a provider can withdraw its stake inside the dispute window. The consequence lands in the dispute contract, so it is recorded as CG-DIS-01.
