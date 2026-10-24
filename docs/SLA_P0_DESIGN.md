# P0 — SLA Core Design (v8)

Status: P0 contracts deployed to Arc Testnet on 23 Oct 2026, indexed by the v8 Studio
subgraph, and active in Vercel production; provider migration and the 7-day soak are pending.
Deployment record: `docs/V8_DEPLOYMENT.md` §7.
Implemented: `ServiceRegistryV8` (43 tests), `PayPerCallV8` (18), `SLAKeeper` (9),
`DisputeV2` (29), and the cross-contract `CallGuardP0` suite (7). Full Foundry suite: 406 tests.
Frontend and server routes select v8 when `VITE_SERVICE_REGISTRY_V8` + `VITE_PAY_PER_CALL_V8`
(or `SERVICE_REGISTRY_V8` + `PAY_PER_CALL_V8`) are set; otherwise the v7 pair stays active.
Not implemented: provider migration execution, a v8 dispute panel, and the 7-day testnet
soak. The v8 indexer is deployed at `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`.
Scope: the shared core for A (availability), B (quality), and C (financial SLA).
This phase delivers **A only**. B and C depend on the proof layer added here.

## 1. Decision

CallGuard v7 is an escrow + deadline + timeout-slash protocol. It is not a full SLA
system because the provider's receipt is self-attestation and no keeper guarantees
that a timeout is enforced.

P0 replaces the v7 core with a new, non-upgradeable v8 pair:

- `ServiceRegistryV8` — providers, stake, versioned SLA terms.
- `PayPerCallV8` — escrow, deadline, receipt, timeout.
- `SLAKeeper` — permissionless timeout crank with a bounded bounty.
- `DisputeV2` — call-bound disputes with a verified settlement timestamp and one appeal.

P0 does **not** claim quality or financial SLA. It makes availability credible:
terms are versioned, each call snapshots its terms, a receipt cannot be submitted
after the window, and a timeout is enforced without the caller having to act.

## 2. What P0 closes

| v7 gap | P0 fix |
|---|---|
| Provider can sign an arbitrary `responseHash` | Still true for A; caller ack is P1. P0 only rejects zero hash and binds the receipt to `termsVersion`. |
| `respondedAt` is not enforced | `respondedAt <= deadline` is enforced. Backdating remains possible; it is not a cryptographic proof. |
| No automatic timeout | `SLAKeeper` calls `claimTimeout`; bounty makes it economically viable. |
| No terms version | Every provider has versioned terms; every call stores `termsVersion` and `termsHash`. |
| Terms can diverge from the call | Existing calls keep their snapshot; updates only affect new calls. |
| Provider cannot top up stake | `addStake` increases stake without re-registration. |
| Dispute window trusts caller input | `Call.completedAt` is written by `submitReceipt`; `DisputeV2` reads it. |
| Single arbiter, no appeal | P0 uses a multisig arbiter and one appeal level. |

## 3. Non-goals

- No caller acknowledgement or independent correctness proof. That is P1.
- No rolling availability SLO, error budget, or service credits. That is P1.
- No quality refund from escrow. P0 disputes can only apply the extra slash.
- No insurance pool, underwriting, or claims. That is C.
- No change to the existing v7 deployment. v7 stays deployed and read-only.

## 4. Architecture

```
provider ──register/addStake/updateTerms──> ServiceRegistryV8
                                              │
caller ──callService──> PayPerCallV8 ─────────┘ reads terms snapshot
                              │
                              ├── submitReceipt(provider signature)
                              ├── claimTimeout()  <── SLAKeeper (bounty)
                              └── claim()         <── caller/provider withdrawal

DisputeV2 ──reads Call.completedAt──> PayPerCallV8
          └──slash()───────────────> ServiceRegistryV8
```

`PayPerCallV8` is the only contract allowed to call the registry's call hooks and
`slash`. `DisputeV2` is an authorized slasher for the extra dispute slash.

## 5. Contracts

### 5.1 ServiceRegistryV8

Responsibilities:

- Provider registration, signer, stake, price, endpoint.
- Versioned SLA terms per provider.
- Timelocked terms updates.
- Stake top-up.
- Slash custody and call accounting.
- Reputation counters.

New state:

```solidity
struct TermsInput {
    uint32 maxResponseTime;
    uint16 slashBps;
    uint16 availabilityTargetBps;
    bytes32 termsHash;
    string termsUri;
}

struct SLATerms {
    uint32 version;
    uint32 maxResponseTime;
    uint16 slashBps;
    uint16 availabilityTargetBps;
    bytes32 termsHash;
    string termsUri;
    uint64 effectiveAt;
    bool active;
}

mapping(uint256 => mapping(uint32 => SLATerms)) private _terms;
mapping(uint256 => uint32) private _latestTermsVersion;
mapping(uint256 => TermsInput) private _pendingTerms;
mapping(uint256 => uint32) private _pendingTermsVersion;
mapping(uint256 => uint64) private _pendingTermsExecuteAt;
```

Rules:

- `register` creates terms version `1` and emits `TermsUpdated`.
- `proposeTermsUpdate` validates the input, stores it, and sets
  `executeAt = block.timestamp + TERMS_TIMELOCK`.
- `executeTermsUpdate` creates `latest + 1`; old versions are immutable.
- `cancelTermsUpdate` clears the pending update.
- `addStake` pulls USDC and increases `stake`.
- `slash` reverts if `amount > stake`; the caller address is unchanged.
- `markCallStarted` / `markCallFinished` / `incCompleted` / `incSlashed` remain
  restricted to `payPerCall`.

Constants:

- `TERMS_TIMELOCK = 2 days`.
- `MIN_RESPONSE_TIME = 5`.
- `MAX_SLASH_BPS = 10_000`.
- `UNSTAKE_COOLDOWN = 1 hours`.

### 5.2 PayPerCallV8

Responsibilities:

- Lock USDC per call.
- Snapshot `termsVersion` and `termsHash` at call open.
- Accept a provider-signed EIP-712 receipt before `deadline + SUBMIT_GRACE`.
- Refund the caller and slash the provider after `deadline + SUBMIT_GRACE`.
- Keep the existing pull-withdrawal model.

Call struct:

```solidity
enum CallStatus { None, Pending, Completed, Slashed }

struct Call {
    uint256 providerId;
    address caller;
    uint256 amount;
    uint32 startedAt;
    uint32 deadline;
    uint32 completedAt;
    uint32 termsVersion;
    bytes32 termsHash;
    bytes32 requestHash;
    bytes32 responseHash;
    CallStatus status;
}
```

Receipt struct:

```solidity
struct Receipt {
    bytes32 callId;
    bytes32 responseHash;
    uint64 respondedAt;
    uint32 termsVersion;
}
```

EIP-712:

- Domain: `ArcSLA` / `2`.
- Type: `Receipt(bytes32 callId,bytes32 responseHash,uint64 respondedAt,uint32 termsVersion)`.
- The signer must equal the provider's current `signer`.

Receipt rules:

- `responseHash != bytes32(0)`.
- `respondedAt <= deadline`.
- `block.timestamp <= deadline + SUBMIT_GRACE`.
- `termsVersion == call.termsVersion`.
- Digest replay protection via `usedReceipts`.
- On success: `status = Completed`, `completedAt = block.timestamp`,
  `claimable[provider.owner] += amount`.

Timeout rules:

- `block.timestamp > deadline + SUBMIT_GRACE`.
- `status == Pending`.
- Refund `amount` to the caller's `claimable`.
- Slash `stake * terms.slashBps / 10_000`, capped by stake.
- Pay the keeper bounty from the slash amount.
- Credit the remaining slash to the caller.
- Emit `CallSlashed(callId, refunded, slashed, bounty)`.

### 5.3 SLAKeeper

Responsibilities:

- Expose `isClaimable(callId)`.
- Call `PayPerCallV8.claimTimeout` for one call or a batch.
- Never custody user funds; refunds and slash credits go to the existing
  `claimable` balances.
- Bounty is bounded: `min(slashAmount * 500 / 10_000, MAX_BOUNTY)`.
- If `slashAmount == 0`, the bounty is `0`; the keeper is expected to run for
  protocol health, or a treasury-funded bounty can be added later.

The keeper is permissionless. Anyone can run it; the contract does not depend on
a single operator.

### 5.4 DisputeV2

Responsibilities:

- Open a dispute only for a `Completed` call.
- Read `Call.completedAt`; do not accept `settledAt` from the caller.
- Enforce `block.timestamp <= completedAt + disputeWindow`.
- Pull a bond from the caller.
- Resolve within `resolutionWindow`; if the arbiter misses it, the caller can
  reclaim the bond and the dispute closes as `Rejected`.
- Allow one appeal with a separate bond.
- On upheld: return the caller bond and apply `disputeSlashBps` of the provider's
  current stake. The first-instance slash is held inside `DisputeV2` until the
  appeal window closes.
- `finalize` releases a first-instance upheld slash to the caller when no appeal
  was filed. A successful provider appeal returns the held slash to the provider.
- On rejected: send the caller bond to the treasury. A later caller appeal win
  applies a fresh slash directly to the caller; the original bond stays forfeited.
- The appeal bond follows the appellant: a winning appellant is refunded, a
  losing appellant forfeits it to the treasury.
- P0 does not refund the escrow; the escrow was already settled by `submitReceipt`.

## 6. Lifecycle

### Register

1. Provider calls `register` with stake, price, response time, slash bps,
   availability target, terms hash, and terms URI.
2. Registry creates terms version `1`.
3. Registry pulls stake.

### Open call

1. Caller calls `callService(providerId, requestHash)`.
2. `PayPerCallV8` reads the latest terms.
3. It checks `stake * slashBps / 10_000 >= pricePerCall`.
4. It stores `termsVersion`, `termsHash`, `deadline = now + maxResponseTime`.
5. It pulls the caller's USDC into escrow.

### Receipt

1. Provider produces the response off-chain.
2. Provider signs `Receipt(callId, responseHash, respondedAt, termsVersion)`.
3. Anyone submits the receipt before `deadline + SUBMIT_GRACE`.
4. Contract verifies signer, terms version, timestamp, and replay.
5. Escrow becomes claimable by the provider owner.

### Timeout

1. Keeper sees `isClaimable(callId) == true`.
2. Keeper calls `claim`.
3. Contract refunds the caller and slashes the provider.
4. Keeper receives a bounded bounty.
5. Both parties withdraw with `claim()`.

### Dispute

1. Caller opens a dispute within `disputeWindow` after `completedAt`.
2. Arbiter resolves.
3. Either side appeals once.
4. Appeal arbiter resolves.
5. Bonds and slash are settled.

## 7. Invariants

1. A call's `termsVersion` and `termsHash` never change after `callService`.
2. A receipt cannot be used twice.
3. A receipt cannot be submitted after `deadline + SUBMIT_GRACE`.
4. `respondedAt` cannot exceed `deadline`.
5. `responseHash` cannot be zero.
6. A timeout cannot be claimed before `deadline + SUBMIT_GRACE`.
7. A call can be closed only once.
8. `slashAmount <= stake`.
9. `expectedSlash >= pricePerCall` at call open.
10. `pendingCalls` is decremented exactly once per call.
11. `completedAt` is set only by `submitReceipt`.
12. A dispute cannot be opened for an unknown, pending, or slashed call.
13. A dispute cannot be opened twice for the same call.
14. A terms update cannot affect an existing call.
15. `addStake` cannot decrease stake.

## 8. Migration

**Do not point the v7 `ServiceRegistry.payPerCall` at v8 while v7 has pending
calls.** v7's `markCallFinished` is restricted to the current `payPerCall`; after
the switch, v7 calls cannot close and their escrow is trapped.

P0 migration plan (step 1 is complete; steps 2–6 remain):

1. Deploy `ServiceRegistryV8`, `PayPerCallV8`, `DisputeV2`, `SLAKeeper`.
   Deployed 23 Oct 2026 — see `docs/V8_DEPLOYMENT.md` §7.
2. Keep v7 deployed and read-only. Do not call `proposePayPerCall` on v7.
3. On testnet, providers migrate manually:
   - deactivate on v7,
   - wait for `pendingCalls == 0` and the cooldown,
   - `unstake`,
   - `register` on v8 with the same terms and stake.
4. New calls use v8 only.
5. The frontend reads v8 addresses and labels v7 as legacy.
6. For production, add a `migrateProvider` path or a one-time migration contract
   that lets a provider move stake without the manual unstake/register dance.

## 9. Test matrix

### Unit

- `register` creates terms v1 and pulls stake.
- `addStake` increases stake; non-owner cannot add.
- `proposeTermsUpdate` timelock; `execute` creates v2; `cancel` works.
- Existing call still reads v1 after v2 is created.
- `callService` snapshots terms and deadline.
- `submitReceipt` rejects zero hash, wrong terms version, late `respondedAt`,
  late transaction, wrong signer, and replay.
- `claimTimeout` rejects before grace, rejects a completed call, and succeeds once.
- Refund and slash amounts match the event.
- Keeper bounty is bounded and never exceeds the slash.
- Dispute rejects a `settledAt`-style bypass; uses `completedAt`.
- Dispute rejects pending/slashed calls and duplicates.
- Appeal path works; expired resolution lets the caller reclaim the bond.
- Slash cannot exceed stake.
- `pendingCalls` accounting is balanced.

### Invariant

- Sum of `claimable` liabilities <= USDC balance held by `PayPerCallV8`.
- No call can be both `Completed` and `Slashed`.
- No receipt digest can be consumed twice.
- No call can be closed without one of: valid receipt, timeout.

### End-to-end

1. Register provider, open call, no response, keeper claims, caller withdraws refund.
2. Register provider, open call, valid receipt, provider withdraws.
3. Late response: receipt reverts; keeper claims; provider slashed.
4. Bad response: dispute upheld; extra slash paid; bond returned.
5. Rejected dispute: bond goes to treasury.
6. Appeal: first decision changed by appeal arbiter.

## 10. Acceptance checklist

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| P0-1 | Terms versioned per provider | PASS | `test_register_setsProviderAndTermsV1`, `test_executeTerms_createsV2AndKeepsV1` |
| P0-2 | Call snapshots terms | PASS | `test_callService_escrowsAndSnapshotsTerms`, `test_p0_callSnapshotsTermsAcrossTimelockedUpdate` |
| P0-3 | Receipt hardening | PASS | zero hash, late `respondedAt`, late tx, wrong version, wrong signer, replay tests |
| P0-4 | Stake top-up | PASS | `test_addStake_increasesStakeAndPullsUSDC`, `test_p0_stakeTopUpRestoresSlashCapacity` |
| P0-5 | Timelocked terms update | PASS | `test_executeTerms_beforeTimelock_reverts`, `test_cancelTerms_clearsPending` |
| P0-6 | Keeper auto-claim | PARTIAL | `SLAKeeper` unit + batch tests pass and the contract is deployed at `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7`. `scripts/e2e-timeout-v8.js` ran a real timeout on 24 Oct 2026: call `0xc4e2245e…`, refund `1.0`, slashed `1.9`, bounty `0.1`, provider stake `10.0` → `8.0`, caller claimed `2.9`; the subgraph recorded `SLASHED`. The 7-day soak started 24 Oct 2026 15:33 UTC (keeper `0xd7B4…7d59`, `POLL_MS 60000`, ends 31 Oct 15:33 UTC) and is running; it has not finished. |
| P0-7 | Dispute uses `completedAt` | PASS | `openDispute` has no `settledAt` input; `test_openDispute_*` window and status tests |
| P0-8 | Appeal path | PASS | `test_appeal_upheldThenReversedByProvider`, `test_p0_disputeUsesCompletedAtAndAppealReverses` |
| P0-9 | Migration does not trap v7 calls | PARTIAL | v7 provider `1` deactivated on 24 Oct 2026 15:22:45 UTC (tx `0x2b730469…`); `getProvider(1).active` is `false` and `pendingCalls(1)` is `0`, so no v7 call is trapped. The `10 USDC` stake is still locked and `unstake` opens at 16:22:45 UTC after `UNSTAKE_COOLDOWN`; the withdrawal itself is not done. Procedure in §8. |
| P0-10 | Frontend shows terms version and deadline | PARTIAL | Call Builder shows `vN`, terms hash, max response; Register/Providers/Marketplace/Leaderboard/History and `api/` read v8. Contracts, the Studio v8 subgraph, and production env are active and the owner is registered on v8 (provider `1`). The SSR provider page reads `ServiceRegistryV8` directly and `/sitemap.xml` enumerates `nextProviderId()`, both verified live on 24 Oct 2026 (`8.00 USDC` stake, `0%` honor). The v8 dispute panel is still missing. |

## 11. Open questions

1. Keeper bounty source: slash percentage vs treasury budget. P0 assumes slash.
2. `availabilityTargetBps` is stored but not enforced in P0. Rolling enforcement
   belongs to P1.
3. Arbiter model: 3/5 multisig for P0; optimistic oracle is a later option.
4. Terms URI format: IPFS CID preferred; HTTPS allowed with a hash.
5. Production migration: manual unstake/register vs a dedicated migration contract.
6. Whether `respondedAt` should be removed entirely once caller ack exists, or kept
   as a provider claim.

## 12. Implementation order

1. `ServiceRegistryV8` terms + stake.
2. `PayPerCallV8` call snapshot + receipt hardening.
3. `SLAKeeper` + bounty.
4. `DisputeV2` completedAt + appeal.
5. Migration scripts and v7 freeze procedure.
6. Frontend wiring and terms display.
7. Testnet soak: keeper running for 7 days.
