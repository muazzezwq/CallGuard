# CallGuard — Agent Notes (Arc Testnet, chain ID 5042002)

Pay-per-call SLA marketplace: providers stake USDC, callers pay per request, missed
deadlines auto-slash stake. Solidity contracts + React frontend + Vercel functions +
subgraph indexer (v7 Goldsky, v8 The Graph Studio) + x402 facilitator, all on Arc Testnet.

## Repo shape (not a workspace monorepo)

Root holds the React/Vite frontend **and** the Foundry contracts. Each subdir is a
separate deployable with its own `package.json` and `node_modules`:

- `src/` — frontend. `src/main.tsx` → `src/App.tsx`, which is a wallet gate:
  connected → `components/layout/AppShell.tsx`, else `components/CgLanding.tsx`.
  Feature screens are lazy `React.lazy` panels in `src/components/panels/`.
- `contracts/` / `test/` / `script/` — Solidity, Foundry tests, deploy scripts.
- `api/` — Vercel serverless functions (ESM Node, shipped as-is; no Vite build).
- `subgraph/` — v7 Goldsky subgraph (`graph codegen` / `build` / `goldsky` deploy).
  `subgraph/v8/` is the v8 indexer source (`npm run codegen:v8` / `build:v8`); it is
  deployed to The Graph Studio as `onur/1.0.0` and starts at block `68651068`.
- `x402-facilitator/` — standalone Node/Express server.
- `src/lib/config.ts` — **frontend source of truth** for contract addresses and the
  inline ABIs (they encode fix history for tuple/field shape). AGENTS.md mirrors it.

## Redesign phase work (`design/`)

Before starting a redesign phase, read `design/PHASE_<n>.md` (the verbatim prompt),
`design/PHASE_PROCESS.md`, the relevant `docs/decisions.md` entries, and the previous phase's
open `PARTIAL`/`FAIL`/`UNVERIFIED` rows in `design/phase-checklists/`. Then verify the real
repository state (`git status`, `git log`, fresh file reads) instead of trusting a summary of it.
Keep scope to the current phase, and keep an evidence-based checklist
(`PASS`/`PARTIAL`/`FAIL`/`UNVERIFIED`) at `design/phase-checklists/PHASE_<n>_CHECKLIST.md` — a
phase is not complete while any required row is not `PASS`. Never carry skill-usage claims from
one phase into another. Process details: `design/PHASE_PROCESS.md`; UI rules: `design/RULES.md`.

## Commands

Frontend (from repo root; uses bun on Vercel):
```bash
bun run dev          # vite dev server, port 5173
bun run build        # vite build → dist/
bun run typecheck    # tsc -p tsconfig.json --noEmit
bun run check        # typecheck + lint
bun run check-env    # node check.js — validates .env against active v7 addresses
bun run setup        # check.js && bun install
```
Contracts (Foundry):
```bash
forge test -vv       # 300 tests, 11 test suites
forge build
forge script script/Deploy.s.sol:Deploy --account deployer --rpc-url arc_testnet --broadcast
```
Subgraph / facilitator (use npm there, not bun):
```bash
cd subgraph && npm run codegen && npm run build && npm run deploy
cd x402-facilitator && npm run dev     # node --watch server.js
# e2e happy/timeout lifecycle: bun scripts/e2e-lifecycle.js (needs ARC_RPC_URL, CALLER_PK, PROVIDER_PK)
# 7-day v8 keeper soak: ARC_RPC_URL=... KEEPER_PK=... bun scripts/keeper-soak.js
```

## Toolchain gotchas

- **`bun run lint` is a real gate** — `eslint src --max-warnings=0`, so any ESLint error
  *or* warning fails it. Run it with `typecheck` (both are wrapped by `bun run check`).
- Solidity `0.8.37`, `via_ir = true`, optimizer 200, `evm_version = "cancun"` (OZ v5.6
  needs mcopy). Arc’s baseline is Osaka, so it accepts Cancun bytecode: **do not pass
  `--evm-version paris`** — OZ v5.6 `Bytes.sol` fails to compile for Paris.
- `lib/` are git submodules (openzeppelin-contracts v5.6.1, forge-std v1.16.1). Run
  `git submodule update --init` after clone.
- Both `bun.lock` and `package-lock.json` are committed. Frontend/Vercel build with **bun**;
  subgraph and facilitator use **npm**.
- `dist/` is **generated build output and ignored by Git** (`.gitignore:25`). Vercel builds
  the site from source with `bun run build` and publishes `dist/` (`vercel.json`); never
  commit it. A local build leaves `git status` clean.
- `app/` no longer exists. It was the legacy static HTML app, removed in `54dbd38`
  (2026-10-16); `dist/` was intentionally untracked in `e06494b` (2026-10-17).
- Env: server code (`api/`, `x402-facilitator/`) reads **unprefixed** vars first, falling
  back to `VITE_*`. `VITE_*` ships in the browser bundle — **never** put `*_PRIVATE_KEY`
  or secrets in a `VITE_*` var. `.env.example` documents all vars; never commit `.env`.
- Recent commits migrated all Turkish strings/comments to English — write English.

## Protocol facts agents get wrong

- `callService` returns and `callId` is **`bytes32`** (not `uint256`); `submitReceipt` takes
  `(bytes32 callId, bytes32 responseHash, uint64 respondedAt, bytes signature)`.
- `getProvider` returns a **9-field** tuple; the registry counter is `nextProviderId`
  (not `providerCount`). `src/lib/config.ts` ABIs already reflect these fixes — trust it.
- Receipts are **EIP-712** (domain name `"ArcSLA"`, version `"1"`, includes `respondedAt`).
  `ARCHITECTURE.md` §4 still describes the old EIP-191 `personal_sign` scheme — **stale**.
- `getCall` has **two layouts**: v7 returns 8 words with `status` at index `7`; v8 returns
  11 words with `status` at index `10` (after `completedAt`, `termsVersion`, `termsHash`).
  `Verify.tsx` and `api/attestation.js` decode both, so a v8 call no longer verifies as
  "no receipt found". Read the **active** PayPerCall (`ACTIVE_PPC_ADDRESS` in the frontend,
  `ACTIVE` in `api/_contracts.js`), never the hardcoded v7 address.
- README says "229 tests"; actual is **407** (16 test suites). AGENTS.md used to say 300 — stale.
- The subgraph deploy script (`subgraph/package.json`) deploys `callguard-v7/1.1.0`, which
  matches the canonical query URL in `src/lib/config.ts`. (The old `arcsla/1.1.7` script and
  the `callguard-v7/1.0.0` deploy were stale — they indexed the retired v3 registry.)

## Core Contracts — ACTIVE (v7, 13 Oct 2026; admin = owner wallet)

| Contract | Address |
|---|---|
| `ServiceRegistry` (v7) | `0x9ca97010464e8e6de6e27cf25eae9b939fbd7333` |
| `PayPerCall` (v7.1 — ERC-8183 hook) | `0x5fb41dd22c44e1de08f37d98c2995a62d6220540` |
| `ReputationLoan` (v3) | `0x9e0622828a03a578050e45ba2fde6b9140e676aa` |
| `SLAFutures` (v3) | `0xcd57a9b924a565b12889277173b9ec06d4e10435` |
| `Subscription` (v2) | `0xc090ff2b856a5cc1bfe1137cf75ca566339f01db` |
| `AgentWallet` (v2) | `0x6a7a41481e47a38bbe0236438c10e5ab8ca141e5` |

Unchanged: `Dispute` `0xa47162d8e4785d867f05800f35a334fd78575e56`,
`CrossChainReceiver` (v2) `0x760326de3cba39994dfd81d2b71b072c0265601c`,
`SLAAttestationBridge` `0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7`.

Dependent: `FACILITATOR_ADDRESS` `0x0E515aEd287a7b3d2D9F7911321d99826653Fbd8`,
`SELLER_ADDRESS` `0x9adEDa85604C205791B98B4C239b5625688a4ba5`,
`USDC_ADDRESS` `0x3600000000000000000000000000000000000000` (Arc native USDC, 6 decimals).

**RETIRED — do not use** (superseded 13 Oct 2026 unless noted): `ServiceRegistry` v5
`0xc3ff2169…`, `PayPerCall` v5 `0x389b44b7…`, `PayPerCall` v6-standby `0xe901462b…`,
`DisputeQuality` v2 `0x7e2771df…`, `SLAFutures` v2 `0x19d03ff1…`, `ReputationLoan` v2
`0x5a2f5455…`; (7 Oct) `PayPerCall` v3 `0x51bbd776…`, `ServiceRegistry` v3 `0xea00f898…`.
Also superseded: AgentWallet `0xf73f2Fc5…` (1 Oct).

## SLA P0 v8 — DEPLOYED, NOT ACTIVE (Arc Testnet, 23 Oct 2026)

| Contract | Address |
|---|---|
| `ServiceRegistryV8` | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` |
| `PayPerCallV8` | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` |
| `SLAKeeper` | `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7` |
| `DisputeV2` | `0xe5D993E0B328B506B874505B23b4bE876d7c0900` |

Registry admin, arbiter, appeal arbiter, and treasury are all the owner wallet
`0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`. On-chain wiring is verified:
`registry.payPerCall()` is `PayPerCallV8`, `registry.authorizedSlashers(DisputeV2)` is true,
and `SLAKeeper.payPerCall()` is `PayPerCallV8`.

The v8 env vars are set in Vercel production (23 Oct 2026). The frontend and API now use
`ServiceRegistryV8` + `PayPerCallV8`; v7 stays deployed and read-only. The v8 indexer is live
on The Graph Studio: `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`. Provider
migration ran on 23 Oct: v8 provider `1` is the owner wallet with `8 USDC` stake (one timeout
drill slashed `2`), `1 USDC` price, terms v1 (window `120`, slash `2000`, availability `9950`), and endpoint
`https://arcsla.vercel.app/api/auto-receipt`. The v7 provider `1` was deactivated on 24 Oct 15:22:45 UTC
(tx `0x2b730469…`) and unstaked at 16:23:01 UTC (tx `0x5db0fb6f…`), so its stake is `0` and the v7
registry holds no locked funds; the cleanup card `src/components/panels/V7Cleanup.tsx` stays as the
unverified-contract write path. Goldsky v8 was
abandoned after Starter-plan credit exhaustion (23 Oct 2026). Deployment details and activation
order: `docs/V8_DEPLOYMENT.md` §7.

## Key parameters

- Chain ID `5042002`; RPC `https://rpc.testnet.arc.io`; explorer `https://explorer.testnet.arc.io`.
- Subgraph (v8, live app, The Graph Studio): `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`.
- Subgraph (v7 legacy): `https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/callguard-v7/1.1.0/gn`.
- `SUBMIT_GRACE = 5` seconds. EIP-712 receipt domain ArcSLA/1 with `respondedAt`.
- Erc-8004 `ReputationRegistry` `0x8004B663…` and ERC-8183 `AgenticCommerce` `0x0747EEf0…`
  integrations are **best-effort**: a revert there does not fail `submitReceipt`/`agentCall`.

## AgentWallet (v2 active)

Owner `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`; agent hot wallet
`0x22099051bbe59117Ebc5219bdDA90D7790758C03`; daily limit 10 USDC; max per call 2 USDC; not paused.

## Deploy / wiring

- Deploy walkthrough: `DEPLOY.md`. Serverless API has its own `vercel.json`
  (`outputDirectory: dist`, `buildCommand: bun run build`, per-route `maxDuration`
  and CORS headers); `/callService`, `/nano/*`, `/providers/:id`, `/sitemap.xml` are
  rewritten to `api/` functions.
- Required deploy env vars and v7 address checks are enumerated by `bun run check-env`
  and `.env.example` — use those, not a duplicated list here.
- Post-deploy (from admin wallet): `ServiceRegistry.setPayPerCall(0x5fb41dd2…)`
  is **one-time/irreversible**; then best-effort `PayPerCall.setReputationRegistry(0x8004B663…)`
  and `AgentWallet.setAgenticCommerce(0x0747EEf0…)`.
- **Required if redeploying `Dispute`:** call `Dispute.setPayPerCall(<PayPerCall>)` once
  (arbiter-only). Without it, `openDispute` reverts — disputes are bound to a verified
  on-chain call to stop fabricated disputes.

## URLs

- App + Landing: `https://arcsla.vercel.app` ·
  Netlify: `https://keen-lamington-f268c2.netlify.app`
- Backup branches: `backup/pre-app-redesign-20260924-2221`,
  `backup/pre-komple-redesign-20260925-1305`, `backup/pre-ux-overhaul-20260927`
