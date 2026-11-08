# CallGuard — Full Security Audit Plan

**Started:** 7 November 2026  
**Mode:** read-only static audit + read-only chain verification + existing test execution. No production code changes.
**Network assumption:** Arc mainnet semantics (USDC native asset + ERC-20 facade `0x3600…0000`, 6 decimals). Testnet deployment is used only as evidence.

## Goal

Produce a comprehensive, evidence-backed security audit of every reachable part of CallGuard — contracts, API, frontend, operations, deployment scripts, keeper, subgraph, and x402 facilitator — with one finding record per issue, explicit line references, severity, preconditions, impact, and a remediation order.

## Scope

In scope:
- Active v8 contracts: `PayPerCallV8`, `ServiceRegistryV8`, `SLAKeeper`, `DisputeV4`, `SLAEvidenceRegistryV2`.
- ZK/provenance contracts and adapters under `contracts/zk/`.
- Legacy contracts in `contracts/` where they are still referenced, deployed, or create copy/paste risk.
- All files in `api/` and the Vercel routing/config.
- Frontend source in `src/` (panels, wallet integration, marketing config, utilities).
- `script/`, `scripts/`, `.github/workflows/`, `subgraph/`, `x402-facilitator/`, `verification/`.
- Deployment and environment documentation that changes the trust model.

Out of scope:
- `node_modules/`, `lib/` submodules, generated verifier internals except their public interface and trust assumptions.
- Hosted service configuration values that cannot be read without credentials.
- Active exploitation, mainnet transactions, or credential use.

## Rules

- No production code changes during the audit. Findings are recorded; fixes require separate approval.
- Every claim cites a file and line, or is marked `UNVERIFIED`.
- A missing check is written as `nothing found` rather than inferred.
- Existing tests are evidence only for what they assert; they are not a proof of safety.
- No commit, push, deploy, or owner transaction without explicit user approval.

## Steps

### 1. Baseline and evidence index
Record commit, tree state, tool versions, gate results, deployed addresses, the file inventory that the audit will cite, and a reconciliation table for every finding in `docs/audit-mainnet/`.
**Acceptance:** `docs/audit-full/00-baseline.md` exists and contains the current `git rev-parse HEAD`, `git status --short` output, gate results, the active address table, and a row for AM-01…AM-15 with `fixed / still open / not re-checked`.

### 2. Threat model and trust boundaries
Map actors (caller, provider, keeper, arbiter, owner, facilitator, relayer, indexer, browser), assets (USDC, stake, bonds, evidence, keys), and protocol invariants (no unpaid service, no double slash, no double settlement, evidence binding, liveness).
**Acceptance:** `docs/audit-full/01-threat-model.md` contains an actor/asset table, an invariant table with the contract or API that is supposed to enforce each invariant, and a list of trust assumptions.

### 3. Contract pass A — calls, payments, timeout, keeper
Audit `PayPerCallV8.sol`, `SLAKeeper.sol`, `IPayPerCallV8`, and their registry/keeper interactions: call creation, authorization path, receipt replay, deadline math, timeout claim, bounty custody, reentrancy, and accounting.
**Acceptance:** `docs/audit-full/02-contracts-calls.md` exists; every external function is listed with its access path and at least one invariant check.

### 4. Contract pass B — providers, stake, terms, slashing
Audit `ServiceRegistryV8.sol`: registration, staking, deactivation, unstake, terms timelock, signer updates, slasher authorization, admin transfer, and all places where stored values are not enforced.
**Acceptance:** `docs/audit-full/03-contracts-registry.md` exists with a state-machine table and explicit `nothing found` rows for unenforced assumptions.

### 5. Contract pass C — disputes and evidence
Audit `DisputeV4.sol` and `SLAEvidenceRegistryV2.sol`: bond flow, slash escrow, resolution windows, appeal path, finalize, evidence snapshot, signature/proof anchoring, ownership, and parameter changes.
**Acceptance:** `docs/audit-full/04-contracts-disputes.md` exists with a dispute lifecycle table and a money-flow table for every terminal state.

### 6. Contract pass D — ZK, provenance, legacy surface
Audit `contracts/zk/*`, `SLAProvenance.sol`, verifier interfaces, and reachable legacy contracts. Check proof binding, image/handler pinning, replay, malformed input behavior, and copy/paste risk.
**Acceptance:** `docs/audit-full/05-contracts-zk-legacy.md` exists with one row per adapter/verifier and one row per legacy contract that is still referenced.

### 7. API and settlement pass
Audit every `api/*` file and `vercel.json`: authentication, EIP-3009 settlement, idempotency, replay, CORS, error behavior, secret handling, rate limits, and failure modes.
**Acceptance:** `docs/audit-full/06-api.md` exists with one row per endpoint: caller, auth, input validation, side effects, failure mode, and evidence.

### 8. Frontend pass
Audit `src/`: wallet connection, approvals, transaction construction, displayed examples, XSS/eval surfaces, secret exposure, client-side trust, and misleading UI states.
**Acceptance:** `docs/audit-full/07-frontend.md` exists with one row per panel or shared module that can move funds or display trust-sensitive state.

### 9. Operations, workflows, keeper, subgraph, facilitator
Audit scripts, GitHub workflows, env contracts, deployment scripts, subgraph queries, x402 facilitator, and incident/rollback paths.
**Acceptance:** `docs/audit-full/08-ops.md` exists with a key-custody table, a deployment/rollback table, and explicit `UNVERIFIED` rows for anything that needs credentials or a live run.

### 10. Consolidate, critique, and publish
Merge findings into `REPORT.md`, produce `CHECKLIST.md`, deduplicate against `docs/audit-mainnet/`, run a fresh-pass critique, check dependency and supply-chain exposure, list invariant-test gaps, and verify every finding has a line reference and a test or observation.
**Acceptance:** `docs/audit-full/REPORT.md` and `CHECKLIST.md` exist; a critique section lists what was removed or downgraded; a dependency/supply-chain section records the result of `bun pm audit`/`npm audit` or explains why it could not run; an invariant-test gap table exists; all gates still pass; `git status` shows only audit documentation.

## Evidence format

Each finding uses:

```
### CG-XX — title
- Severity: Blocker | Critical | High | Medium | Low | Info
- Confidence: High | Medium | Low
- Evidence: path:line, path:line
- Precondition:
- Impact:
- Existing mitigation:
- Required fix:
- Verification:
```

## Status

| Step | Status | Evidence |
|---|---|---|
| 1 | in progress | — |
| 2 | pending | — |
| 3 | pending | — |
| 4 | pending | — |
| 5 | pending | — |
| 6 | pending | — |
| 7 | pending | — |
| 8 | pending | — |
| 9 | pending | — |
| 10 | pending | — |
