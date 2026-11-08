# Step 9 — Operations, workflows, keeper, subgraph, facilitator

**Audit baseline:** `3e279bd`. Read-only review of `script/`, `scripts/`, `.github/workflows/`, `subgraph/`, `x402-facilitator/`, `vercel.json`.
Nothing was executed and no key was used.

## 1. Key custody

| Key | Holder | Used by | Blast radius | Evidence |
|---|---|---|---|---|
| Owner EOA `0xfbac99E6…06Da` | user, hardware/TTY | `ServiceRegistryV8` owner, `DisputeV4` arbiter + appeal arbiter + treasury, `SLAEvidenceRegistryV2` owner | Total: slasher authorization, dispute resolution, treasury sweep, verifier wiring | `script/DeployV8.s.sol:47-49`; `AGENTS.md` |
| `KEEPER_PK` | GitHub Actions secret | `scripts/keeper-soak.js` → `SLAKeeper.claimBatch` + `withdrawBounty` | Bounded: can only crank timeouts that anyone can crank, and withdraw its own bounty | `.github/workflows/keeper.yml`; `scripts/keeper-soak.js:40-41`, `:76` |
| `FACILITATOR_PRIVATE_KEY` | Vercel env | `api/_settle.js`, `api/call-service.js` | Can submit `transferWithAuthorization` for any signed authorization it holds; cannot mint or move other funds | `api/_settle.js:22-52` |
| `BUYER_PRIVATE_KEY` | Vercel env | `api/nano-call.js` x402 buyer | Spends that wallet's USDC; nano calls capped at 0.001 USDC per request | `api/nano-call.js` |
| `SELLER_PRIVATE_KEY` | Vercel env | facilitator `/callguard-hook` receipt signing | Can forge provider receipts for the seller it controls | `x402-facilitator/server.js:34` |
| `FACILITATOR_ADMIN_TOKEN` | Vercel env | `/verify`, `/settle`, `/callService` in the standalone facilitator | Arbitrary settlement of supplied payments | `x402-facilitator/server.js:46-55` |
| `CRON_SECRET` | Vercel env + cron | `GET /api/idempotency-recovery` | Can drive the recovery sweep | `api/call-service.js:809-838` |
| `NANO_API_KEY` | Vercel env | `POST /api/nano-call` | Can spend the buyer wallet up to the per-request cap | `api/nano-call.js` |
| deployer keystore | local Foundry keystore | `forge script --account deployer` | Deploy only; scripts read role addresses from env | `script/*.s.sol` |

Positive findings:

- Every deploy script reads role addresses with `vm.envAddress` and broadcasts through a Foundry keystore account (`--account deployer`). No private key literal appears in `script/`.
- `DeployEvidenceV2.s.sol:19-20` and `:186` state the rule explicitly: the agent deploys contracts only, the owner signs owner-role transactions at their own TTY.
- The facilitator's admin routes are fail-closed: without `FACILITATOR_ADMIN_TOKEN` every admin route answers `503` (`x402-facilitator/server.js:46-49`), and the comparison uses `crypto.timingSafeEqual` (`:29`).
- The facilitator's CORS is an allowlist with same-origin fallback, not `*` (`x402-facilitator/server.js:21-30`), and its `/ping` route runs an SSRF guard mirroring `api/ping-provider.js` (`:57-95`).

## 2. Deployment and rollback

| Asset | Deploy path | Rollback |
|---|---|---|
| Frontend + `/api/*` | `git push` to `main` → Vercel Git integration (`bun run build`, `dist/`) | Vercel instant rollback to a previous deployment; no on-chain change |
| v8 contracts | `forge script script/DeployV8.s.sol --account deployer --rpc-url arc_testnet --broadcast` | **None.** Contracts are immutable; recovery is a new deployment plus migration. `ServiceRegistryV8.setPayPerCall` is one-time |
| Evidence registry | `script/DeployEvidenceV2.s.sol` + owner `setProofVerifier` | `setProofVerifier` is repeatable, so a bad adapter can be replaced; already-anchored claims stay |
| Subgraph v8 | `npm run codegen:v8 && build:v8 && deploy:studio:v8` → The Graph Studio `onur/1.0.2` | Redeploy a new version label; the frontend URL in `src/lib/config.ts` must change with it |
| Subgraph v7 | `npm run deploy` → Goldsky `callguard-v7/1.1.0` | Legacy only; the live app reads the Studio v8 URL |
| x402 facilitator | `x402-facilitator/vercel.json` routes all paths to `server.js` | Vercel rollback |
| Keeper | GitHub Actions cron, no server | Remove the workflow or the secret |

Nothing in the repository provides an on-chain pause, an emergency stop, or a stake-freeze switch. That is the correct consequence of immutable contracts, but it means an active exploit can only be answered by deactivating providers through the registry or by front-running with `claimTimeout`; there is no global circuit breaker. Recorded as CG-OPS-02.

## 3. Findings

### CG-OPS-01 — `npm run deploy` in `subgraph/` still publishes the retired v7 subgraph to Goldsky
- Severity: Low
- Confidence: High
- Evidence: `subgraph/package.json` scripts: `"deploy": "goldsky subgraph deploy callguard-v7/1.1.0 --path build"`; `"deploy:v8": "goldsky subgraph deploy callguard-v8/1.0.0 --path v8/build"`; `src/lib/config.ts` points at The Graph Studio `onur/1.0.2`.
- Precondition: an operator follows the obvious `npm run deploy` to refresh the indexer.
- Impact: the indexer the app reads is never updated, and a Goldsky deployment that indexes the retired v3/v7 registry is refreshed instead. The failure is silent: the app keeps serving stale or empty provider data with no error.
- Existing mitigation: `AGENTS.md` documents that Goldsky v8 was abandoned and that the Studio URL is canonical, and `deploy:studio:v8` exists.
- Required fix: rename `deploy` to `deploy:v7:legacy`, make the default script the Studio v8 one, or print a refusal unless `ALLOW_V7_DEPLOY=1`.
- Verification: `python3 -c "import json;print(json.load(open('subgraph/package.json'))['scripts'])"` then confirm the default script no longer targets a retired registry.

### CG-OPS-02 — no pause, freeze, or global circuit breaker exists anywhere in the system
- Severity: Medium
- Confidence: High
- Evidence: `contracts/ServiceRegistryV8.sol` exposes `authorizeSlasher`/`revokeSlasher`/`deactivate`, not a pause; `contracts/PayPerCallV8.sol` has no pause; `contracts/SLAKeeper.sol` has no pause; `vercel.json` has no incident switch.
- Precondition: an active exploit or a compromised facilitator key.
- Impact: the only available response is per-provider deactivation and racing `claimTimeout`. A compromised facilitator key keeps settling until it is removed from the Vercel environment and redeployed, and pending calls keep the old behaviour. There is no single action that stops value flow.
- Existing mitigation: immutable contracts limit the damage a stolen owner key can do to the functions it holds, and `deactivate` stops new calls to one provider.
- Required fix: decide explicitly whether a pause is wanted. If yes, it needs a new deployment (the current contracts cannot be upgraded). If not, write the incident runbook that replaces it: revoke the key in Vercel, redeploy, deactivate the affected provider, and sweep treasury.
- Verification: either a pause function exists on the next deployment, or `docs/` contains an incident runbook with the four steps above.

### CG-OPS-03 — the keeper depends on GitHub's unreliable cron and has no liveness alert
- Severity: Medium
- Confidence: High
- Evidence: `.github/workflows/keeper.yml` schedules `*/15 * * * *` plus `7,37 * * * *`, and its own comment records that GitHub ran the job 8 times in 26 hours (3–6 hour gaps). There is no job that alerts on a missed run.
- Precondition: a call times out while the cron is delayed.
- Impact: refund and slash are delayed by hours. `claimTimeout` is permissionless, so a third party can take the keeper bounty first, which is a revenue loss rather than a fund loss. The real risk is that nobody notices the keeper is dead, because the only signal is a missing artifact.
- Existing mitigation: three triggers, `cancel-in-progress: false`, and the workflow fails loudly when `KEEPER_PK` is missing.
- Required fix: an external heartbeat check (a cron that asserts the newest JSONL artifact is younger than N hours and alerts), or move the crank to a host with a real scheduler.
- Verification: `gh run list --workflow=keeper.yml` shows a run within the last hour, and a deliberately broken run raises an alert.

### CG-OPS-04 — the idempotency recovery sweep runs once a day, so a stuck payment can wait up to 24 hours
- Severity: Low
- Confidence: High
- Evidence: `vercel.json` crons: `[{"path": "/api/idempotency-recovery", "schedule": "0 4 * * *"}]`.
- Precondition: a `call-service` invocation writes a `submitted` or `unknown` operation record and then the function dies.
- Impact: the record is repaired only at 04:00 UTC, so a caller who paid sees no settlement for up to a day, and the same authorization stays blocked for that window.
- Existing mitigation: the sweep is authenticated, and a `confirmed` replay answers from the store immediately.
- Required fix: shorten to every 15 minutes, or run the sweep on the same keeper schedule.
- Verification: `python3 -c "import json;print(json.load(open('vercel.json'))['crons'])"` shows the new schedule.

### CG-OPS-05 — no dependency audit runs in CI, and the facilitator has a second lockfile
- Severity: Low
- Confidence: High
- Evidence: `.github/workflows/checks.yml` runs `bun run check` and `bun test tests/` and `forge test`; no `bun audit` or `npm audit` step exists. `subgraph/package-lock.json` and `x402-facilitator/package.json` are separate installs that the root gates never touch.
- Precondition: a vulnerable transitive dependency, or a supply-chain compromise of a subgraph/facilitator dependency.
- Impact: advisories surface only when someone looks. The two sub-projects are the least-reviewed code in the repository and the facilitator holds `FACILITATOR_PRIVATE_KEY`.
- Existing mitigation: `--frozen-lockfile` on install; submodules pinned.
- Required fix: add an advisory job (`bun audit --production` plus `npm audit --omit=dev` in each sub-project) as a non-blocking first step, then make it blocking once the backlog is clear.
- Verification: the audit step appears in `checks.yml` and prints a report on a push.

### CG-OPS-06 — the standalone facilitator keeps its whole trust surface in one Express process with a wildcard route
- Severity: Info
- Confidence: High
- Evidence: `x402-facilitator/vercel.json` routes `/(.*)` to `server.js`; that file mounts `/verify`, `/settle`, `/callService`, `/callguard-hook`, `/nano/service`, `/api/service`, `/ping`.
- Precondition: none for reading; a public deployment exposes every route at the root path.
- Impact: the admin token is the only boundary between the settlement routes and the internet, and the deployment ships the same process that holds `FACILITATOR_PRIVATE_KEY`. The fail-closed default is correct, so this is a design observation rather than a defect.
- Existing mitigation: `requireAdmin` answers `503` without a token and `401` on a mismatch; CORS is an allowlist; `/ping` has an SSRF guard.
- Required fix: none required. If the facilitator is ever deployed publicly, split the admin surface onto a separate deployment.
- Verification: `curl -s -o /dev/null -w '%{http_code}' -X POST https://<host>/settle` returns `503` when the token is unset.

### CG-OPS-07 — `zk-execution.yml` spends proving time on any push whose message contains `[prove]`
- Severity: Info
- Confidence: High
- Evidence: `.github/workflows/zk-execution.yml` sets `PROVE_REQUESTED` from `contains(github.event.head_commit.message, '[prove]')` or `inputs.mode == 'groth16'`, then runs a Groth16 job with `timeout-minutes: 350`.
- Precondition: a commit to the default branch with `[prove]` in its message.
- Impact: unbounded CI minutes on a free/public repository. No fund or key risk, because the job only builds and proves.
- Existing mitigation: the job is gated on that token; the default path only builds the guest and asserts the pinned image id.
- Required fix: none required; consider requiring a maintainer approval for the `groth16` input if CI minutes become a cost.
- Verification: a push without `[prove]` skips the proving job.

### CG-OPS-08 — `tee-attestation` image CI is still active for a kind that is permanently closed
- Severity: Info
- Confidence: High
- Evidence: `.github/workflows/tdx-app.yml` still builds and pushes the TDX image with SBOM and provenance; `contracts/SLAEvidenceRegistryV2.sol` `modeOf(tee-attestation)` is `0`, so `anchor()` reverts `NoVerifierForKind()`.
- Precondition: a push that touches `verification/tdx-app/`.
- Impact: build minutes on an artifact nothing consumes. No security impact.
- Existing mitigation: the workflow is path-scoped, and `docs/verification/ATTESTOR_SCOPE.md` records the closure and the re-open conditions.
- Required fix: none required. Delete the workflow if the kind is never re-opened.
- Verification: `modeOf(tee-attestation)` on chain returns `0`.

## 4. Nothing found

- No private key, mnemonic, or keystore file is tracked. `.gitignore` covers `.env*`, `broadcast/`, `out/`, `cache/`, `dist/`, and `.agents/`.
- No workflow deploys to production. `checks.yml` has no secrets and no deploy step, so a compromised pull request cannot reach Vercel or the chain through CI.
- No deploy script can be run by an agent against the owner wallet: all role addresses come from env, and the owner-role calls are documented as manual.
- Keeper actions are bounded to permissionless cranking plus its own bounty (`scripts/keeper-soak.js:67`, `:183`); it never holds caller refunds.
- The facilitator's settlement path is the same `transferWithAuthorization` the API uses, so it cannot move more than a signed authorization allows.

## 5. UNVERIFIED

| Item | Why |
|---|---|
| Actual Vercel env values (`FACILITATOR_PRIVATE_KEY`, `CRON_SECRET`, `NANO_API_KEY`, `FACILITATOR_ADMIN_TOKEN`) | Names were read from the project API; values are encrypted/sensitive and were not decrypted |
| Whether the standalone facilitator is currently deployed and publicly reachable | No deployment list was read for that project |
| Whether the keeper job actually ran on schedule today | Requires `gh run list`, not executed |
| Whether `KEEPER_PK`'s balance covers gas | Read-only chain lookups were not performed for this pass |
| Whether The Graph Studio `onur/1.0.2` is synced to head | Requires a live query |
| Rollback drill | Would need a real Vercel rollback and an on-chain replacement; not performed |
