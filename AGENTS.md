# CallGuard — Agent Notes (Arc Testnet, chain ID 5042002)

Pay-per-call SLA marketplace: providers stake USDC, callers pay per request, missed
deadlines auto-slash stake. Solidity contracts + React frontend + Vercel functions +
Goldsky subgraph + x402 facilitator, all on Arc Testnet.

## Repo shape (not a workspace monorepo)

Root holds the React/Vite frontend **and** the Foundry contracts. Each subdir is a
separate deployable with its own `package.json` and `node_modules`:

- `src/` — frontend. `src/main.tsx` → `src/App.tsx`, which is a wallet gate:
  connected → `components/layout/AppShell.tsx`, else `components/CgLanding.tsx`.
  Feature screens are lazy `React.lazy` panels in `src/components/panels/`.
- `contracts/` / `test/` / `script/` — Solidity, Foundry tests, deploy scripts.
- `api/` — Vercel serverless functions (ESM Node, shipped as-is; no Vite build).
- `subgraph/` — Goldsky subgraph (`graph codegen` / `build` / `goldsky` deploy).
- `x402-facilitator/` — standalone Node/Express server.
- `src/lib/config.ts` — **frontend source of truth** for contract addresses and the
  inline ABIs (they encode fix history for tuple/field shape). AGENTS.md mirrors it.

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
```

## Toolchain gotchas

- **`bun run lint` is a real gate** — `eslint src --max-warnings=0`, so any ESLint error
  *or* warning fails it. Run it with `typecheck` (both are wrapped by `bun run check`).
- Solidity `0.8.37`, `via_ir = true`, optimizer 200, `evm_version = "cancun"` (OZ v5.6
  needs mcopy). **Arc deployment requires an `--evm-version paris` override.**
- `lib/` are git submodules (openzeppelin-contracts v5.6.1, forge-std v1.16.1). Run
  `git submodule update --init` after clone.
- Both `bun.lock` and `package-lock.json` are committed. Frontend/Vercel build with **bun**;
  subgraph and facilitator use **npm**.
- `dist/` and `app/` are **committed build output** (tracked in git, not ignored). If you
  keep the tracked build current, rebuild with `bun run build` after frontend changes.
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
- README says "229 tests"; actual is **300** (9 test files in `test/`, 11 suites).
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

## Key parameters

- Chain ID `5042002`; RPC `https://rpc.testnet.arc.io`; explorer `https://explorer.testnet.arc.io`.
- Subgraph (canonical): `https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/callguard-v7/1.1.0/gn`.
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
