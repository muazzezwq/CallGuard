# Step 2 — Threat model and trust boundaries

**Baseline:** `3e279bd`.

## Actors

| Actor | Trust | Can move funds? | Key evidence |
|---|---|---|---|
| Caller | untrusted | Pays `pricePerCall` into escrow; withdraws refunds/slash with `claim()` | `contracts/PayPerCallV8.sol:112-147`, `:290-300` |
| Provider owner | untrusted | Withdraws earnings, stakes/unstakes, sets terms, changes signer/price | `contracts/ServiceRegistryV8.sol:227-330`, `:403-430` |
| Provider signer | untrusted, hot | Signs EIP-712 receipts that release escrow | `contracts/PayPerCallV8.sol:200-236` |
| Keeper | permissionless | Cranks timeouts, earns a bounded bounty | `contracts/SLAKeeper.sol:68-108` |
| Arbiter (owner EOA) | trusted | Opens the slash at dispute time, sets parameters, resolves | `contracts/DisputeV4.sol:212-270`, `:346-373` |
| Appeal arbiter (same EOA) | trusted | Re-resolves an appealed dispute | `contracts/DisputeV4.sol:375-413` |
| Treasury (same EOA) | trusted | Receives the treasury share of a held slash | `contracts/DisputeV4.sol:429-434` |
| Registry admin (same EOA) | trusted | Authorizes slashers, sets PayPerCall, transfers admin | `contracts/ServiceRegistryV8.sol:141-172` |
| Evidence registry owner (same EOA) | trusted | Points kinds at verifiers, sets `bindsResponse` | `contracts/SLAEvidenceRegistryV2.sol:121-145` |
| Facilitator (Vercel) | semi-trusted | Submits a signed EIP-3009 authorization that a user already signed | `api/_settle.js:22-52` |
| x402 buyer wallet | semi-trusted | Pays nano calls, capped per request | `api/nano-call.js` |
| Indexer (The Graph) | untrusted input to the UI | None; UI must not treat it as authoritative | `src/lib/subgraph.ts:61-68` |
| Browser wallet | untrusted input to the contracts | Signs approvals and calls; all authority is on chain | `src/components/panels/CallBuilder.tsx` |

## Assets

| Asset | Where it sits | Who can take it |
|---|---|---|
| Caller escrow (`c.amount`) | `PayPerCallV8` balance | Provider on receipt, caller on timeout, never the owner |
| Provider stake | `ServiceRegistryV8` via `stake`, held as USDC in the registry | Provider on `unstake`; any authorized slasher on `slash` |
| Dispute held slash | `DisputeV4` balance | Caller/treasury/appellant on `finalize` |
| Keeper bounty | `PayPerCallV8` → `SLAKeeper` → keeper EOA | The keeper that cranked |
| Dispute/appeal bonds | `DisputeV4` balance | Returned or forfeited on resolve |
| Evidence claims | `SLAEvidenceRegistryV2` storage | Nobody; anchoring is permissionless and one-shot per `(callId, kind)` |
| Role keys | off chain | Whoever holds them |

## Invariants and what enforces them

| # | Invariant | Enforced by | Gap |
|---|---|---|---|
| I1 | A caller is never charged without a call record | `_createCall` runs before the transfer in both money paths (`PayPerCallV8.sol:157`, `:172`) | none found |
| I2 | A provider cannot be paid twice for one call | `c.status != Pending` after completion (`:200-236`) | none found |
| I3 | One receipt signature cannot close two calls | `usedReceipts[digest]` (`:224`, `:228`) | none found |
| I4 | One EIP-3009 authorization cannot start two calls | `authorizationState` pre-check + USDC's own replay guard (`:159-161`) | none found |
| I5 | A timeout always refunds the caller | `refunded = c.amount; claimable[c.caller] += refunded + slashed` (`:277-282`) | Refund is pull-only; a caller that never calls `claim()` leaves funds in the contract |
| I6 | A provider cannot escape a pending obligation by unstaking | `unstake` rejects `pendingCalls != 0` (`ServiceRegistryV8.sol:251-266`) | Only *pending* calls. A completed call is unprotected, see CG-DIS-01 |
| I7 | A dispute always holds a slash | `openDispute` escrows `stake * disputeSlashBps` at open (`DisputeV4.sol:257-262`) | Held slash is computed from the stake that remains at open time, which can be zero |
| I8 | Slashing never exceeds the stake | `slash` rejects `p.stake < amount` (`ServiceRegistryV8.sol:360-367`) | Enforced; also means a call whose slash exceeds the remaining stake cannot be settled, see CG-CALL-02 |
| I9 | Every anchored claim is bound to the call's response | `bindsResponse` + adapter checks (`SLAEvidenceRegistryV2.sol:139-145`) | Statement and assumption digests are not proof inputs, see CG-ZK-01 |
| I10 | A claim kind cannot be re-anchored | `(callId, kind)` single row | none found |
| I11 | Admin cannot take provider stake without a dispute | `slash` is `onlySlasher` (`ServiceRegistryV8.sol:117-123`, `:360`) | `authorizeSlasher` is instant and un-timelocked, see CG-REG-05 |
| I12 | Terms cannot change under a pending call | `c.termsVersion` pinned at open; 2-day timelock | `termsHash` is not derived from the terms, see CG-REG-03 |
| I13 | A paid API call is settled exactly once | Upstash idempotency store, default on in production | Recovery sweep runs once a day, CG-OPS-04 |

## Trust assumptions that are load-bearing

1. The owner EOA behaves. It holds registry admin, arbiter, appeal arbiter, treasury, and evidence-registry ownership. Nothing on chain bounds it except `slash` requiring an authorized slasher and `openDispute` requiring a completed call by the caller.
2. USDC behaves. The ERC-20 facade at `0x3600…0000` must implement EIP-3009 and revert on replay. Arc's native-asset model is assumed, not proven here.
3. The facilitator does not keep or replay authorizations. It can settle anything a user signed; it cannot create a signature.
4. The provider signer key is not the owner key. If they are the same key, a receipt signature and a stake withdrawal share one blast radius.
5. The arbiter reads evidence honestly. The chain stores claims, not verdicts, and the arbiter decides which claim matters.
6. Callers act. Refunds and slash proceeds are pull-based, so an inactive caller is an unclaimed balance.
7. The indexer is a display layer. Nothing on chain reads it.

## Out of scope for threat modelling

- MEV and ordering on Arc.
- Compromise of the user's hardware wallet.
- Phishing of the Vercel or GitHub account.
