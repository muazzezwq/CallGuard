# Audit checklist — CallGuard full audit

**Baseline:** `3e279bd3001c8ffe760232ef46a7f9bff919a547`
**Legend:** `PASS` evidence exists and was read · `PARTIAL` covered with an explicit gap · `FAIL` attempted and did not hold · `UNVERIFIED` needs credentials or a live run.

## Plan steps

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | Baseline and evidence index | PASS | `00-baseline.md`: commit, tree state, tool versions, three gate results, active address table, AM-01…AM-15 reconciliation |
| 2 | Threat model and trust boundaries | PASS | `01-threat-model.md`: 13 actors, 8 assets, 13 invariants with the enforcing contract, 7 trust assumptions |
| 3 | Contracts pass A — calls, payments, timeout, keeper | PASS | `02-contracts-calls.md`: every external function with access path and accounting trace; 5 findings |
| 4 | Contracts pass B — providers, stake, terms, slashing | PASS | `03-contracts-registry.md`: state machine table, 6 findings, `nothing found` rows |
| 5 | Contracts pass C — disputes and evidence | PASS | `04-contracts-disputes.md`: lifecycle table, money-flow table for all five terminal states, 7 findings |
| 6 | Contracts pass D — ZK, provenance, legacy | PASS | `05-contracts-zk-legacy.md`: adapter matrix, 4 ZK findings, legacy table, 1 legacy finding |
| 7 | API and settlement | PASS | `06-api.md`: one row per endpoint; 8 findings |
| 8 | Frontend | PASS | `07-frontend.md`: 39-panel inventory, 4 findings |
| 9 | Operations, workflows, keeper, subgraph, facilitator | PASS | `08-ops.md`: key-custody table, deployment/rollback table, 8 findings, 6 `UNVERIFIED` rows |
| 10 | Consolidate, critique, publish | PASS | `REPORT.md` + this file; critique section lists 2 withdrawn, 2 downgraded, 1 upgraded finding; dependency table; invariant-gap table |

## Gate results

| Gate | Command | Status | Evidence |
|---|---|---|---|
| Typecheck + lint | `bun run check` | PASS | exit `0` after the remediation edits |
| Frontend/API tests | `bun test tests/` | PASS | 654 tests / 60 files: 647 pass, 7 skip, 0 fail |
| Contracts | `forge test` | PASS | 631 tests / 31 suites, 0 fail |
| Working tree | `git status --short` | — | remediation edits present; per-finding status below |
| No secret in the audit docs | manual read | PASS | no key, mnemonic, or 64-hex literal |

## Coverage

| Area | In scope files | Read | Status |
|---|---|---|---|
| `contracts/PayPerCallV8.sol` | 385 lines | full | PASS |
| `contracts/ServiceRegistryV8.sol` | 466 lines | full | PASS |
| `contracts/DisputeV4.sol` | 613 lines | full | PASS |
| `contracts/SLAEvidenceRegistryV2.sol` | 267 lines | full | PASS |
| `contracts/SLAKeeper.sol` | 116 lines | full | PASS |
| `contracts/zk/*` | 4 files | full | PASS |
| `contracts/SLAProvenance.sol` | — | read | PASS |
| Legacy `contracts/*.sol` | 23 files | referenced surface | PARTIAL — not every dormant legacy contract was line-read; those with no active write path are listed in `05-contracts-zk-legacy.md` |
| `api/*` | 21 files | full for the money paths | PASS |
| `src/` | 39 panels + shared modules | full for money and trust-sensitive panels | PARTIAL — marketing components were not line-read |
| `script/`, `scripts/` | 16 + 11 | full for key handling | PASS |
| `.github/workflows/` | 4 | full | PASS |
| `subgraph/`, `x402-facilitator/` | both | full for trust surface | PASS |
| Generated verifier internals | `KeccakClaimVerifier.sol` 104 KB | interface only | PARTIAL — bytecode-level review is out of scope |

## Open blockers to a mainnet launch

| Item | Finding | Status |
|---|---|---|
| Provider can unstake inside the dispute window | CG-DIS-01 | PASS in source — `unstake` waits `DISPUTE_WINDOW` after `lastCompletedAt`; needs a redeploy |
| Single key holds admin, arbiter, appeal, treasury, evidence owner | CG-REG-02, CG-DIS-03 | PARTIAL — `script/DeployV8.s.sol::_requireSeparateRoles` now refuses a collapsed role set, so the deploy path cannot create one by accident; the four addresses themselves are chosen at deployment and the current testnet instance still holds one wallet |
| Facilitator tree carries 1 critical and 21 high advisories | CG-OPS-05 | PARTIAL — `audit` job added to CI, non-blocking until the backlog clears |
| Silent v7 fallback on money routes | CG-API-01 | PASS — `moneyContracts()` makes the v8 pair mandatory on money routes |
| Zero-slash terms accepted | CG-REG-01 | PASS — `MIN_SLASH_BPS = 100`, zero price rejected |
| Claim statement not bound to the proof | CG-EVD-01 | FAIL — open, needs a circuit change |
| No global pause or incident runbook | CG-OPS-02 | PASS — `MONEY_ROUTES_DISABLED` answers 503 on all three money routes before an authorization is read, and `docs/INCIDENT_RUNBOOK.md` is the written replacement for a pause |

## Fixed in the remediation pass

Contract changes are source-level: they need a new deployment before they are
live, because `ServiceRegistryV8`, `PayPerCallV8` and `DisputeV4` are immutable
on chain.

| Finding | Fix | Evidence |
|---|---|---|
| CG-REG-01 | `MIN_SLASH_BPS = 100`; `register`/`updatePrice` reject a zero price with `InvalidPrice` | `contracts/ServiceRegistryV8.sol` |
| CG-REG-02 | `transferAdmin` only nominates, `acceptAdmin` completes; `authorizeSlasher` only nominates, `confirmSlasher` completes after `SLASHER_DELAY` | `contracts/ServiceRegistryV8.sol`, `test/RegistryAdmin.sol` |
| CG-REG-04 | `proposeTermsUpdate` rejects overwriting a live proposal with `TermsProposalPending` | `contracts/ServiceRegistryV8.sol` |
| CG-DIS-01 | `unstake` reverts `DisputeWindowOpen` until `DISPUTE_WINDOW` has passed since `lastCompletedAt` | `contracts/ServiceRegistryV8.sol`, `test/DisputeV2.t.sol` |
| CG-DIS-02 | `_currentDisputeSlash` is capped by the provider's own advertised `slashBps` | `contracts/DisputeV4.sol` |
| CG-CALL-01 | The concurrent-call cap follows the payer, not the beneficiary (`capAccountOf`) | `contracts/PayPerCallV8.sol`, `test/PayPerCallV8.t.sol` |
| CG-CALL-03 | `claimTimeout` caps the slash at the remaining stake instead of reverting `InsufficientStake` | `contracts/PayPerCallV8.sol` |
| CG-API-01 | `moneyContracts()` makes the v8 pair mandatory on money routes; a missing pair answers `503`, and the v7 fallback stays read-only | `api/_contracts.js`, `api/call-service.js` |
| CG-API-03 | `sendSettled` states `callIdParse: "missing"` instead of leaving a confirmed settlement with an ambiguous `callId: null` | `api/call-service.js`, `src/lib/facilitatorOutcome.ts` |
| CG-API-04 | `settleEip3009` requires `expectedTo` and `minValue` and checks the authorization window itself | `api/_settle.js` |
| CG-API-05 | `RETENTION_MS` is a record field and the Redis TTL, shared by both stores | `api/_idempotency.js`, `api/_upstash_idempotency_store.js` |
| CG-API-06 | `DISPUTE_V4` is preferred, `DISPUTE_V2` kept as a deprecated alias with a startup warning | `api/_contracts.js` |
| CG-FE-01 | Dead `tryClientAutoReceipt` deleted | `src/lib/utils.ts` |
| CG-FE-03 | `SubgraphUnavailableError` distinguishes an unreachable indexer from an empty marketplace | `src/lib/subgraph.ts`, `src/hooks/useSubgraph.ts`, `tests/subgraph-unavailable.test.ts` |
| CG-OPS-01 | `npm run deploy` now targets the Studio v8 subgraph; the Goldsky v7 job is `deploy:v7:legacy` | `subgraph/package.json` |
| CG-OPS-04 | Recovery sweep runs every 15 minutes instead of daily | `vercel.json` |
| CG-OPS-05 | Advisory job added for the root package, `subgraph/` and `x402-facilitator/` | `.github/workflows/checks.yml` |

## Closed since `docs/audit-mainnet`

| Item | Commit | Status |
|---|---|---|
| AM-03 fail-closed settlement | `3e279bd` | PASS locally; not deployed |
| AM-04 production idempotency default | `3e279bd` | PASS locally; not deployed |
| AM-05 bounded approvals | `77850f0` | PASS locally; not deployed; `tests/approval-scope.test.ts` |
| AM-15 USDC decimals "contradiction" | — | PASS — it was documentation, not a defect |

## Not re-checked in this pass

| Item | Why |
|---|---|
| Live secret values | Encrypted in Vercel |
| Keeper run history | Needs `gh run list` |
| Subgraph sync state | Needs a live query |
| Mainnet USDC behaviour | Testnet only |
| Fork test for CG-DIS-01 | Not written; listed as the highest-value missing test |
