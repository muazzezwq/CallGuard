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

v7 cleanup has no explorer path: v7 `ServiceRegistry` and `PayPerCall` are not verified on
Blockscout, and the app's unstake control now targets v8. `src/components/panels/V7Cleanup.tsx`
is rendered at the bottom of the Register panel and appears only when the connected wallet has a
non-zero v7 `providerIdOf`. It calls `deactivate(providerId)`, then `unstake(providerId)` after
`UNSTAKE_COOLDOWN` (`3600` s) once `pendingCalls == 0`. The view surface does not expose
`deactivatedAt`, so the cooldown clock starts from the deactivate receipt in that session; after
a reload an early `unstake` simply reverts with `CooldownActive`.

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

Known indexing gap: `Provider.maxConcurrentCalls` reads `0` in the subgraph because the
`ProviderRegistered` event does not carry the cap. `subgraph/v8/src/registry.ts:29` writes `0`
and only `MaxConcurrentCallsUpdated` (`registry.ts:111`) updates it. On-chain enforcement is
unaffected: `ServiceRegistryV8.getProvider` returns the real value (provider 1 registered with
`10`). Closing the gap needs either a cap field on the event in a future deployment or a
contract read on the provider detail view.

Timeout lifecycle verified end to end on 24 Oct 2026 with `scripts/e2e-timeout-v8.js`:

- Call `0xc4e2245e33de0849d87772795d9b27797eedb998c7f2d8a82311459e87da12f5`, terms v1.
- `callService` escrowed `1.0 USDC`; the claim was refused while `deadline + SUBMIT_GRACE`
  was still open.
- `SLAKeeper.claim` after the grace window: refund `1.0`, slashed `1.9`, bounty `0.1`.
- Penalty is `stake * slashBps / 10_000` (`PayPerCallV8.sol:268`), so one missed call costs
  `2.0 USDC` out of a `10 USDC` stake regardless of the call price. Provider stake went
  `10.0` → `8.0`, `slashedCalls` `0` → `1`.
- The caller pulled the `2.9 USDC` refund+slash with `PayPerCallV8.claim()`; the keeper withdrew
  its `0.1 USDC` bounty. Subgraph recorded `SLASHED`, `totalSlashed 2000000`.

Consequence for the soak: every deliberate timeout burns `2 USDC` of stake. With `8 USDC` left,
four more timeouts exhaust the bond, so the 7-day run should mostly monitor and use only a
bounded number of timeout drills.

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

Provider migration ran on 23 Oct 2026. `ServiceRegistryV8.nextProviderId()` is `2` and
`providerIdOf(0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da)` is `1`. Provider `1` holds `10 USDC`
stake, price `1 USDC`, terms v1 (`maxResponseTime 120`, `slashBps 2000`,
`availabilityTargetBps 9950`, `termsHash 0xbe8c8cd7…`), endpoint
`https://arcsla.vercel.app/api/auto-receipt`, cap `10`, and is `active`. The Studio subgraph
indexes it. The v7 provider `1` is still `active` with `pendingCalls == 0` and cleanup is the
remaining migration step.

Migration order, with the first two steps done:

1. ✅ Connect the owner wallet on `https://arcsla.vercel.app` and register on v8 (defaults match
   the v7 terms). Endpoint value: `https://arcsla.vercel.app/api/auto-receipt`. This is the
   repo's live provider backend: `GET` returns health JSON, `POST` submits the EIP-712 receipt
   and requires `x-webhook-secret`. `vercel.json` rewrites `/api/auto-receipt/health` to that
   function, so the marketplace health probe (`${endpoint}/health`) hits real JSON instead of
   the SPA fallback. The endpoint is frozen into terms and `keccak256(endpoint)`; changing it
   later needs `proposeTermsUpdate` plus the 2-day `TERMS_TIMELOCK`.
2. ✅ Verify `ServiceRegistryV8.nextProviderId()` advanced to `2` and the Studio subgraph indexes
   the `ProviderRegistered` event.
3. Deactivate the v7 provider, wait `UNSTAKE_COOLDOWN = 1 hour`, then unstake.
4. Start the keeper soak and keep it running for 7 days.

One deploy gap surfaced during step 1: `Register.tsx` never switched the wallet to Arc Testnet
before writing, so a wallet on another chain failed `approve` with
`Requested resource not available`. It now calls `switchChainAsync`, matching `Verify.tsx` and
`Requests.tsx`.
