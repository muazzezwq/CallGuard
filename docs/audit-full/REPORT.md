# CallGuard — Full security audit report

**Date:** 7 November 2026
**Baseline commit:** `3e279bd3001c8ffe760232ef46a7f9bff919a547`
**Mode:** read-only static review plus read-only chain evidence and the existing test gates. No production code changed during the audit.
**Network assumption:** Arc mainnet semantics (USDC native asset, ERC-20 facade `0x3600…0000`, 6 decimals). The testnet deployment is evidence, not the target.

Per-step evidence: `00-baseline.md`, `01-threat-model.md`, `02-contracts-calls.md`, `03-contracts-registry.md`, `04-contracts-disputes.md`, `05-contracts-zk-legacy.md`, `06-api.md`, `07-frontend.md`, `08-ops.md`, `PLAN.md`.

**Remediation status (8 November 2026):** the source-level fixes for every finding except CG-EVD-01, CG-OPS-02 and the deployment-shaped part of CG-REG-02/CG-DIS-03 are applied; the per-finding table is in `CHECKLIST.md` under "Fixed in the remediation pass". The contract fixes are immutable-deployment changes, so the live testnet instance still has the old behaviour until it is redeployed. Gates after the fixes: `bun run check` exit `0`, `bun test tests/` 647 pass / 7 skip / 0 fail, `forge test` 631 pass / 0 fail.

## Verdict

**Do not take this deployment to mainnet with real funds in its current shape.** The protocol's happy path is sound: escrow accounting balances, replay guards work, the receipt signature is bound to a call and a terms version, and the timeout path always returns the caller's money. The problems are in the edges that decide who gets paid when something goes wrong.

Three findings drive that verdict:

1. **CG-DIS-01** — a provider can unstake inside the 7-day dispute window, so an upheld quality dispute holds `0`. The V4 rewrite closed the resolution-time escape but left the opening-time one.
2. **CG-REG-02 / CG-API-01** — one owner EOA can authorize an arbitrary slasher and drain every provider stake in two transactions, and the API quietly falls back to the retired v7 contracts when v8 env vars are missing.
3. **CG-OPS-05** — the x402 facilitator, which holds `FACILITATOR_PRIVATE_KEY`, runs with 31 advisories including 1 critical, several on direct dependencies.

Fix order is at the end.

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 2 | CG-DIS-01, CG-REG-02 |
| Medium | 8 | CG-CALL-01, CG-REG-01, CG-DIS-02, CG-DIS-03, CG-EVD-01, CG-API-01, CG-API-02, CG-OPS-02 |
| Low | 12 | CG-CALL-02, CG-CALL-03, CG-REG-03, CG-REG-04, CG-REG-06, CG-DIS-04, CG-DIS-05, CG-ZK-01, CG-ZK-02, CG-LEG-01, CG-API-03/04/05/06, CG-FE-01, CG-FE-03, CG-OPS-01, CG-OPS-03, CG-OPS-04, CG-OPS-05 |
| Info | 12 | CG-CALL-04, CG-CALL-05, CG-REG-05, CG-EVD-02, CG-ZK-03, CG-ZK-04, CG-API-07, CG-API-08, CG-FE-02, CG-FE-04, CG-OPS-06, CG-OPS-07, CG-OPS-08 |

No finding is rated Critical: nothing found lets an unauthenticated party take funds they never signed for.

## Findings index

### Contracts — calls (detail in `02-contracts-calls.md`)
| ID | Severity | One line |
|---|---|---|
| CG-CALL-01 | Medium | `callServiceFor` lets a third party fill a victim's per-caller concurrency cap |
| CG-CALL-02 | Low | the concurrency cap is per caller, so total pending obligations are unbounded |
| CG-CALL-03 | Low | `claimTimeout` marks the call slashed before a slash call that could revert |
| CG-CALL-04 | Info | provider earnings are key-bound with no sweep |
| CG-CALL-05 | Info | `claimBatch` is an unbounded loop (keeper-only harm) |

### Contracts — registry (detail in `03-contracts-registry.md`)
| ID | Severity | One line |
|---|---|---|
| CG-REG-01 | Medium | `slashBps = 0` and `price = 0` are accepted, making the SLA unenforceable |
| CG-REG-02 | High | admin can authorize any slasher with no timelock and drain any stake |
| CG-REG-03 | Low | `termsHash` is caller-supplied and not derived from the terms |
| CG-REG-04 | Low | a pending terms proposal is overwritten and its version number reused |
| CG-REG-05 | Info | `zkTier` is never assigned; the cap-doubling branch is dead |
| CG-REG-06 | Low | `transferAdmin` is single-step with no recovery |

### Contracts — disputes and evidence (detail in `04-contracts-disputes.md`)
| ID | Severity | One line |
|---|---|---|
| CG-DIS-01 | High | a provider can unstake inside the dispute window, so an upheld dispute holds nothing |
| CG-DIS-02 | Medium | the arbiter can escrow the entire stake with no timelock |
| CG-DIS-03 | Medium | arbiter, appeal arbiter, and treasury are one key |
| CG-DIS-04 | Low | a timed-out call cannot be disputed |
| CG-DIS-05 | Low | evidence kinds are read from a mutable list at snapshot time |
| CG-EVD-01 | Medium | `statementHash` and `assumptionHash` are never proof inputs |
| CG-EVD-02 | Info | a wrong anchor cannot be corrected |

### Contracts — ZK and legacy (detail in `05-contracts-zk-legacy.md`)
| ID | Severity | One line |
|---|---|---|
| CG-ZK-01 | Low | `ZkClaimAdapter` does not commit to `claimHash` |
| CG-ZK-02 | Low | `SLAProvenance.verifyProvenance` ignores the allowlist |
| CG-ZK-03 | Info | `witness` proves only that a key saw the bytes |
| CG-ZK-04 | Info | `tee-attestation` is closed |
| CG-LEG-01 | Low | two `PayPerCall` layouts coexist |

### API (detail in `06-api.md`)
| ID | Severity | One line |
|---|---|---|
| CG-API-01 | Medium | missing v8 env silently falls back to the retired v7 contracts |
| CG-API-02 | Medium | `/api/call-service` has no request-level abuse control |
| CG-API-03 | Low | `success: true` with `callId: null` |
| CG-API-04 | Low | `settleEip3009` trusts its caller for `to`/`value`/expiry |
| CG-API-05 | Low | orphan alias records have no TTL |
| CG-API-06 | Low | `DISPUTE_V2` holds the `DisputeV4` address |
| CG-API-07 | Info | `Access-Control-Allow-Origin: *` on money routes |
| CG-API-08 | Info | `/api/evidence` answers `rpc-error` on a cold start |

### Frontend (detail in `07-frontend.md`)
| ID | Severity | One line |
|---|---|---|
| CG-FE-01 | Low | dead `tryClientAutoReceipt` reads a private key from `sessionStorage` |
| CG-FE-02 | Info | server secret names shown as copyable examples |
| CG-FE-03 | Low | an indexer failure renders as "no providers" |
| CG-FE-04 | Info | unused passkey path holds only a public client key |

### Operations (detail in `08-ops.md`)
| ID | Severity | One line |
|---|---|---|
| CG-OPS-01 | Low | `npm run deploy` still publishes the retired v7 subgraph |
| CG-OPS-02 | Medium | no pause, freeze, or global circuit breaker anywhere |
| CG-OPS-03 | Medium | the keeper depends on GitHub's unreliable cron with no liveness alert |
| CG-OPS-04 | Low | the idempotency recovery sweep runs once a day |
| CG-OPS-05 | Low | no dependency audit in CI, and the facilitator carries 1 critical + 21 high advisories |
| CG-OPS-06 | Info | the standalone facilitator keeps its whole trust surface in one process |
| CG-OPS-07 | Info | `[prove]` in a commit message spends proving minutes |
| CG-OPS-08 | Info | TDX image CI still runs for a closed kind |

## Reconciliation with `docs/audit-mainnet`

| Previous | Previous severity | Now | Change |
|---|---|---|---|
| AM-01 single EOA | Blocker | **still open** | Re-rated to High and split: CG-REG-02 (admin + slasher) and CG-DIS-03 (arbiter roles). "Blocker" over-rated it while the protocol holds testnet funds; it becomes a blocker again at mainnet scale |
| AM-02 arbiter-controlled dispute parameters | Critical | **still open** | Re-rated Medium (CG-DIS-02). The arbiter already holds the resolve power, so parameter control adds convenience, not capability |
| AM-03 demo settlement | High | **fixed locally, not deployed** | `3e279bd` |
| AM-04 idempotency off by default | High | **fixed locally, not deployed** | `3e279bd` |
| AM-05 unlimited approvals | High | **fixed locally, not deployed** | `77850f0`; `maxUint256` no longer appears in `src/` or `api/` |
| AM-06 `callServiceFor` griefing | Medium | **still open** | Now CG-CALL-01 with a concrete reproduction |
| AM-07 admin authorizes slasher | Medium/High | **still open** | Merged into CG-REG-02 |
| AM-08 zero slash / zero price | Medium | **still open** | Now CG-REG-01 with line-level proof that `_validateTerms` has no floor |
| AM-09 terms proposal overwrite | Low/Medium | **still open** | Now CG-REG-04 |
| AM-10 settlement receipt status | Medium/Low | **still open, downgraded** | CG-API-03 |
| AM-11 public API surface and CSP | Low | **still open** | CG-API-07, and the security headers still cover only non-API routes |
| AM-12 dead client key path | Low | **still open** | CG-FE-01 |
| AM-13 server key names in UI | Low | **still open as Info** | CG-FE-02 |
| AM-14 availability is stored, not enforced | Info | **open by design** | unchanged |
| AM-15 Arc USDC decimals | Info | **closed as a non-issue** | `src/lib/config.ts:8-11` documents 18 for the native gas layer and 6 for the ERC-20 facade; this is correct, not a contradiction |

New in this audit, not present in `docs/audit-mainnet`: CG-DIS-01, CG-EVD-01, CG-ZK-01, CG-ZK-02, CG-REG-03, CG-CALL-02, CG-CALL-03, CG-API-01, CG-API-02, CG-API-05, CG-OPS-01…05.

## Fresh-pass critique

A reread of the goal and the findings, looking for what is wrong, redundant, or over-rated.

**Removed.** An earlier draft claimed a permanent fund lock: many timeouts would drain the stake and then `ServiceRegistryV8.slash` would revert `InsufficientStake`, leaving `claimTimeout` permanently broken. Reading the arithmetic at `PayPerCallV8.sol:268` kills it — `slashAmount` is `stake * slashBps / 10000` of the *live* stake, so it is always at most the stake and the sum of a geometric series never exceeds it. The draft also ignored that `unstake` refuses while `pendingCalls != 0`. That finding is withdrawn, and CG-CALL-03 records only the structural residue.

**Removed.** A draft claim that `Risc0ExecutionAdapter` ignores `claimHash` was wrong: the journal has five words and the fifth is compared at `:90`. Only `ZkClaimAdapter` and `SLAProvenanceAdapter` discard it. Corrected into CG-ZK-01 and CG-EVD-01.

**Downgraded.** AM-01 from Blocker to High. With testnet balances the honest description is "the trust model is a single key"; "blocker" was true for the earlier, different question of mainnet launch readiness with user funds.

**Downgraded.** AM-02 from Critical to Medium for the reason in the reconciliation table.

**Upgraded.** CG-OPS-05 from a process note to a real finding once `npm audit` in `x402-facilitator/` reported a critical advisory on a dependency of the process that holds the facilitator key.

**Not added, deliberately.** The audit does not claim that `SUBMIT_GRACE = 5s` is too short, that the keeper bounty is too small, or that `resolutionWindow` is too long. Each is a parameter choice with a documented rationale, and none creates a fund-safety defect. Parameter opinions belong in a product review, not here.

## Dependency and supply chain

Commands run at baseline:

| Tree | Result |
|---|---|
| root (`bun audit`) | 25 vulnerabilities: 8 high, 15 moderate, 2 low. Notable: `ws` (high, memory-exhaustion DoS) reached through `ethers`, `viem`, and WalletConnect; `zod` (high, memory exhaustion) through `viem` and `@coinbase/cdp-sdk`; `vite` (moderate, dev-server path bypass) |
| `subgraph/` (`npm audit --omit=dev`) | 40 vulnerabilities: 1 critical, 17 high, 13 moderate, 9 low |
| `x402-facilitator/` (`npm audit --omit=dev`) | 31 vulnerabilities: 1 critical, 21 high, 9 moderate. Direct high-severity packages include `@x402/evm`, `viem`, and `@modelcontextprotocol/sdk` |

The facilitator is the concerning one: it is the only tree that both holds a funding key and exposes HTTP routes. The two `ws` and `zod` advisories are memory-exhaustion classes, which matter for a serverless function with a 25-second cap. None of the three trees is audited in CI (CG-OPS-05).

## Invariant-test gaps

| Invariant | Test today | Gap |
|---|---|---|
| I6 provider cannot escape a pending call by unstaking | `test/ServiceRegistryV8.t.sol` covers `pendingCalls != 0` | No test for a **completed** call followed by `deactivate` + `unstake` + `openDispute`. CG-DIS-01 lives exactly there |
| I7 a dispute always holds a slash | fork test asserts the two historical disputes | Both were opened while the stake existed; no test opens one after an unstake |
| I2/I3 receipt replay | covered | — |
| I4 authorization replay | covered on chain; API covered by `tests/api-call-service.test.ts` | — |
| I8 slash never exceeds stake | partially | No test for two slashers in one block (CG-CALL-03) |
| I9 claim bound to response | covered per adapter | No test that a **mismatched** `statementHash` is rejected — because it is not rejected (CG-EVD-01) |
| I13 settle exactly once | `tests/api-call-service-idempotency.test.ts` | No test for the daily recovery sweep timing (CG-OPS-04) |
| CG-REG-01 zero slash | none | `_validateTerms` has no floor test |
| CG-CALL-01 cap griefing | none | no test where one payer fills another's cap |

The single highest-value new test is the CG-DIS-01 sequence: complete, deactivate, warp past the cooldown, unstake, open a dispute, assert `heldSlash`.

## Remediation order

1. **CG-DIS-01** — needs a contract change: hold the slash at completion, or block `unstake` while a completed call is still disputable. Do this before mainnet, because every quality dispute is currently worthless.
2. **CG-REG-02 + CG-DIS-03** — operational today: move admin to a multisig with a timelock, split `arbiter`/`appealArbiter`/`treasury`. No redeployment needed for the second part.
3. **CG-OPS-05** — audit and upgrade the facilitator tree before its next deploy; it holds a key and carries a critical advisory.
4. **CG-API-01** — make a missing v8 env a hard failure on money routes instead of a v7 fallback.
5. **CG-REG-01, CG-EVD-01, CG-DIS-02** — contract-level hardening, bundled with the next deployment.
6. **CG-CALL-01, CG-API-02, CG-OPS-02, CG-OPS-03** — abuse and liveness.
7. Everything rated Low and Info, as cleanup.

Already fixed locally and awaiting deploy: AM-03 (`3e279bd`), AM-04 (`3e279bd`), AM-05 (`77850f0`).

## UNVERIFIED

| Claim | Why it is not verified |
|---|---|
| Live values of Vercel secrets | Names only; values are encrypted |
| Whether the keeper ran on schedule today | Requires `gh run list` |
| Whether the Studio subgraph is synced to head | Requires a live query |
| Real Arc USDC EIP-3009 behaviour on mainnet | Testnet facade only |
| Whether any mainnet-like fork test would surface CG-DIS-01 differently | No fork suite was run for this pass |
| The exact critical package in the facilitator tree | `npm audit` reported the count; the package was not resolved |
