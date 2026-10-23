# Deploying the v8 availability core

P0 ships a new non-upgradeable pair: `ServiceRegistryV8` + `PayPerCallV8`, with
`SLAKeeper` and `DisputeV2`. The v7 pair stays deployed and read-only. Read
`docs/SLA_P0_DESIGN.md` §8 before touching `ServiceRegistry.payPerCall`.

## 1. Deploy

Set the deployment environment:

```bash
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export ARBITER_ADDRESS=0x...          # multisig, first instance
export APPEAL_ARBITER_ADDRESS=0x...   # separate multisig, one appeal
export TREASURY_ADDRESS=0x...
# optional: registry admin defaults to the broadcaster (msg.sender)
export ADMIN_ADDRESS=0x...
# optional overrides
export MIN_STAKE=10000000
export DISPUTE_BOND=2000000
export APPEAL_BOND=3000000
export DISPUTE_WINDOW=604800
export APPEAL_WINDOW=172800
export RESOLUTION_WINDOW=604800
export DISPUTE_SLASH_BPS=1000
```

Do **not** pass `--evm-version paris`. Arc’s baseline is Osaka, so Cancun bytecode is
accepted, and OZ v5.6 `Bytes.sol` fails to compile for Paris:

```bash
forge script script/DeployV8.s.sol:DeployV8 \
  --account deployer --sender 0xYOUR_DEPLOYER \
  --rpc-url arc_testnet --broadcast
```

The script deploys all four contracts, calls `registry.setPayPerCall(payPerCall)`
once, authorizes `DisputeV2` as a slasher, and then hands registry admin to
`ADMIN_ADDRESS` (when it differs from the broadcaster). The broadcaster is admin
only while the pair is wired, so the wiring stays atomic. Record the four addresses.

## 2. Server env

Vercel / serverless:

```bash
SERVICE_REGISTRY_V8=0x...
PAY_PER_CALL_V8=0x...
SLA_KEEPER_V8=0x...
DISPUTE_V2=0x...
```

`api/_contracts.js` selects v8 only when both `SERVICE_REGISTRY_V8` and
`PAY_PER_CALL_V8` are present. `api/call-service.js`, `api/auto-receipt.js`, and
`api/notify-provider.js` then use the v8 tuple, event, and `ArcSLA/2` receipt.

## 3. Frontend env

These values are set in Vercel production as of 23 Oct 2026. The local example below stays
commented so an env-less local build still uses v7.

```bash
VITE_SERVICE_REGISTRY_V8=0x...
VITE_PAY_PER_CALL_V8=0x...
VITE_SLA_KEEPER=0x...
VITE_DISPUTE_V2=0x...
# set after the v8 subgraph is synced; otherwise the app keeps the v7 endpoint
VITE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1763627/onur/1.0.0
```

Both registry and pay-per-call are required; without them the app keeps the v7
call path. The Call Builder labels the active pair and shows the terms version,
terms hash, response window, and slash.

The v8 indexer source is `subgraph/v8/`. Build it from `subgraph/`, then deploy the
Studio slug `onur` with the Graph CLI:

```bash
npm run codegen:v8
npm run build:v8
cd v8
../node_modules/.bin/graph deploy onur subgraph.yaml --studio --version-label 1.0.0
```

Its manifest starts at block `68651068`. The Studio development query URL is
`https://api.studio.thegraph.com/query/1763627/onur/1.0.0` and is limited to 3,000
queries per day. A production key is required before public traffic moves to it.

## 4. Provider migration (testnet)

Do **not** point v7 `ServiceRegistry.payPerCall` at v8. On v7:

1. `deactivate(providerId)`.
2. Wait for `pendingCalls == 0` and `UNSTAKE_COOLDOWN`.
3. `unstake(providerId)`.
4. `approve(v8Registry, stake)`.
5. `ServiceRegistryV8.register(signer, stake, price, maxResponseTime, slashBps,
   availabilityTargetBps, maxConcurrentCalls, endpoint, termsHash, termsUri)`.

The v8 registration creates terms v1 and snapshots it on every call. Terms
changes go through `proposeTermsUpdate` and a 2-day timelock.

## 5. Keeper

Run `SLAKeeper.claim(callId)` or `claimBatch(callIds)` after
`deadline + SUBMIT_GRACE`. Anyone can run it; the bounty is 5% of the slash,
capped at 5 USDC, and credited through `withdrawBounty`.

Soak harness: `scripts/keeper-soak.js` polls the v8 subgraph for `STARTED` calls,
re-verifies each one with `SLAKeeper.isClaimable`, submits `claimBatch` in chunks,
withdraws accrued bounty, and appends a JSONL evidence log.

```bash
ARC_RPC_URL=https://rpc.testnet.arc.io KEEPER_PK=0x... bun scripts/keeper-soak.js
# optional: POLL_MS=60000 BATCH_SIZE=20 MIN_BOUNTY_WITHDRAW=1000000 DURATION_DAYS=7
#           SOAK_LOG_DIR=/tmp/opencode/keeper-soak
```

The soak runs for 7 days because `DisputeV2.disputeWindow` and
`DisputeV2.resolutionWindow` are both `604800` seconds on the deployed instance, and
`DisputeV2.resolve` reverts with `ResolutionWindowOpen` until `openedAt + resolutionWindow`
has passed. A shorter soak cannot reach the dispute-resolution branch at all. Seven days is
also the coverage needed for `TERMS_TIMELOCK` (2 days) plus the `appealWindow` (2 days) in a
single run.

## 6. Not included

- v8 dispute panel (contracts are live and tested; UI uses the legacy quality
  panel until the P1 UI pass).
- Production migration contract (testnet uses the manual flow above).

## 7. Deployment record — Arc Testnet, 23 Oct 2026

| Contract | Address |
|---|---|
| `ServiceRegistryV8` | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` |
| `PayPerCallV8` | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` |
| `SLAKeeper` | `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7` |
| `DisputeV2` | `0xe5D993E0B328B506B874505B23b4bE876d7c0900` |

- Registry admin: `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`.
- Arbiter, appeal arbiter, treasury: same owner address for this testnet deployment.
- Verified on chain: bytecode exists at all four addresses; `registry.admin()` is the owner;
  `registry.payPerCall()` is `PayPerCallV8`; `registry.authorizedSlashers(DisputeV2)` is true;
  `SLAKeeper.payPerCall()` is `PayPerCallV8`.
- Deployer: temporary EOA `0x36f96B4AcCA8dB663Dae4905B7c084D915c78839`. Its key was discarded
  after broadcast; the script handed registry admin to the owner in the same run.
- Gas: approximately `0.383192937 USDC` (native Arc USDC, 18 decimals).
- Deployment block: `68651068` (all four contracts and the three wiring calls). Use this as the
  v8 subgraph `startBlock`.

**Status: contracts deployed, indexed, and active in production.** Vercel production received
the v8 contract env vars and `VITE_SUBGRAPH_URL`, and deployment
`dpl_7SLyCpKPpRQ5ELKda6KxLfAvG8fu` is `READY` at `https://arcsla.vercel.app`. Verified after
the deploy: `/api/marketplace` returns `payPerCall` `0xedce61eF5be31DC22cEfE342692622A26919a7EF`
and `serviceRegistry` `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3`; the browser bundle contains
both addresses and the Studio query URL; no console errors on the landing/app route.

The v8 indexer is deployed to The Graph Studio as slug `onur`, version `1.0.0`:

- Query URL: `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`
- Deployment start block: `68651068`
- Verified during deployment: `_meta.hasIndexingErrors` false, frontend provider/call
  queries and `disputeRecords` all return valid responses. The Studio development URL is
  limited to 3,000 queries per day.

Goldsky v8 deployment was abandoned because the account hit Starter-plan credit exhaustion;
the existing v7 Goldsky deployment is unchanged.

Provider migration is still pending. `ServiceRegistryV8.nextProviderId()` is `1` and
`providerIdOf(0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da)` is `0`, so the v8 marketplace is
empty until the owner registers. The v7 provider remains active with `10 USDC` stake, `1 USDC`
price, `120s` response window, `20%` slash, and `10` concurrent calls. After v8 registration,
the v7 provider can be deactivated and unstaked after the `1 hour` cooldown, then the 7-day
keeper soak can start.

Current activation order:

1. Connect the owner wallet on `https://arcsla.vercel.app` and register on v8 (defaults match
   the v7 terms). Endpoint value: `https://arcsla.vercel.app/api/auto-receipt`. This is the
   repo's live provider backend: `GET` returns health JSON, `POST` submits the EIP-712 receipt
   and requires `x-webhook-secret`. `vercel.json` rewrites `/api/auto-receipt/health` to that
   function, so the marketplace health probe (`${endpoint}/health`) hits real JSON instead of
   the SPA fallback. The endpoint is frozen into terms and `keccak256(endpoint)`; changing it
   later needs `proposeTermsUpdate` plus the 2-day `TERMS_TIMELOCK`.
2. Verify `ServiceRegistryV8.nextProviderId()` advanced to `2` and the Studio subgraph indexes
   the `ProviderRegistered` event.
3. Deactivate the v7 provider, wait `UNSTAKE_COOLDOWN = 1 hour`, then unstake.
4. Start the keeper soak and keep it running for 7 days.
