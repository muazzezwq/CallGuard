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

Stake recovery after a slash has the same kind of gap: `PayPerCallV8.claimTimeout` charges
`stake * slashBps / 10_000`, so a missed call shrinks the bond regardless of the call price.
`src/components/panels/StakeTopUp.tsx` (rendered above the v7 card) restores it with
`ServiceRegistryV8.addStake(providerId, amount)` behind an approve when the allowance is short.

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

The SSR provider page (`api/provider-page.js`) used to read the retired v7 registry and the
Goldsky v7 subgraph, so `/providers/1` advertised `10.00 USDC` stake and a default `50%` honor
rate on 24 Oct 2026 while v8 held `8.00 USDC` and one slashed call. It now reads
`ACTIVE.SERVICE_REGISTRY`, decodes `getProvider` by named fields (no hardcoded word indices), shows
the terms version, and builds `/sitemap.xml` from `nextProviderId()`
instead of an indexer. `src/lib/config.ts` no longer falls back to the retired Goldsky v7 URL.

The Graph Studio deploy key and the old Goldsky token were revoked on 24 Oct 2026. A redeploy of
`subgraph/v8` therefore needs a fresh Studio deploy key first; the live query endpoint keeps
serving without one.

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

- Quality-dispute UI for the retired DisputeQuality contract (replaced by `DisputesV8`, which
  drives `DisputeV2`; the old panel is no longer routed).
- Production migration contract (testnet uses the manual flow above).

### Post-migration follow-ups (24 Oct 2026)

- `/api/attestation` and the `Verify Receipt` on-chain fallback still read the v7 `PayPerCall`
  with the v7 tuple layout, so every v8 call verified as "No verified receipt was found"
  (the API answered `providerId 0` / `UNKNOWN`). Both now read the active `PayPerCall` and
  decode the status from word `10` when the tuple has 11 words.
- `DisputesV8` lists the wallet's disputeable calls and accepts a call id handed over from
  `Verify Receipt` and `History`, so the flow no longer starts by asking for an id the user
  cannot know.

## 7. Deployment record — Arc Testnet, 23 Oct 2026

> **Later history, same section.** The dispute row below is what this deployment created.
> `DisputeV2` was superseded by `DisputeV3` on 27 Oct 2026 and by `DisputeV4` on 28 Oct 2026;
> `revokeSlasher` removed V2 and V3 on 28 Oct, so `authorizedSlashers(DisputeV4)` is the only
> `true` today and the live dispute addresses are in §14. The registry, `PayPerCallV8` and
> `SLAKeeper` rows are unchanged.

| Contract | Address |
|---|---|
| `ServiceRegistryV8` | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` |
| `PayPerCallV8` | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` |
| `SLAKeeper` | `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7` |
| `DisputeV2` | `0xe5D993E0B328B506B874505B23b4bE876d7c0900` |

- Registry admin: `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`.
- Arbiter, appeal arbiter, treasury: same owner address for this testnet deployment.
- Verified on chain: bytecode exists at all four addresses; `registry.admin()` is the owner;
  `registry.payPerCall()` is `PayPerCallV8`; `registry.authorizedSlashers(DisputeV2)` was true
  at deploy time and is `false` since the 28 Oct 2026 handover to `DisputeV4` (§14);
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

Provider migration ran on 23 Oct 2026. `ServiceRegistryV8.nextProviderId()` is `3` and
`providerIdOf(0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da)` is `1`. Provider `1` holds
`7.485694 USDC` stake after `9` slashed calls (`7485694` in `getProvider`), price `1 USDC`,
terms v1 (`maxResponseTime 120`, `slashBps 2000`,
`availabilityTargetBps 9950`, `termsHash 0xbe8c8cd7…`), endpoint
`https://arcsla.vercel.app/api/auto-receipt`, cap `10`, and is `active`. The Studio subgraph
indexes it. The v7 provider `1` was deactivated at 15:22:45 UTC and unstaked at 16:23:01 UTC on
24 Oct 2026; its stake is `0`, so migration is complete and v8 is the only marketplace with
locked stake.

Migration order, all steps done:

1. ✅ Connect the owner wallet on `https://arcsla.vercel.app` and register on v8 (defaults match
   the v7 terms). Endpoint value: `https://arcsla.vercel.app/api/auto-receipt`. This is the
   repo's live provider backend: `GET` returns health JSON, `POST` submits the EIP-712 receipt
   and requires `x-webhook-secret`. `vercel.json` rewrites `/api/auto-receipt/health` to that
   function, so the marketplace health probe (`${endpoint}/health`) hits real JSON instead of
   the SPA fallback. The endpoint is frozen into terms and `keccak256(endpoint)`; changing it
   later needs `proposeTermsUpdate` plus the 2-day `TERMS_TIMELOCK`.
2. ✅ Verify `ServiceRegistryV8.nextProviderId()` advanced to `2` and the Studio subgraph indexes
   the `ProviderRegistered` event.
3. ✅ Deactivate the v7 provider (tx `0x2b730469…`, 15:22:45 UTC), wait `UNSTAKE_COOLDOWN = 1
   hour`, then unstake (tx `0x5db0fb6f…`, 16:23:01 UTC). v7 stake is `0`.
4. ✅ Start the keeper soak and keep it running for 7 days (started 24 Oct 15:33 UTC, ends
   31 Oct 15:33 UTC).

One deploy gap surfaced during step 1: `Register.tsx` never switched the wallet to Arc Testnet
before writing, so a wallet on another chain failed `approve` with
`Requested resource not available`. It now calls `switchChainAsync`, matching `Verify.tsx` and
`Requests.tsx`.

## 8. DisputeV3 (quality-slash escrow) — historical; superseded by §14

> `DisputeV3` is retired as of 28 Oct 2026: slash authority revoked, dispute #4 finalized, no funds
> held. The section below is the deploy record for that contract, kept for the procedure and the
> evidence it cites. The active dispute contract is `DisputeV4` (§14).

`DisputeV2` computed the quality slash at `resolve` time, so a provider could
`deactivate`, wait the 1 hour `UNSTAKE_COOLDOWN`, `unstake`, and leave nothing to
slash. `DisputeV3` slashes the stake inside `openDispute` and escrows the money in
the dispute contract, so the provider cannot withdraw it before the decision.
Evidence: `test/DisputeV3.t.sol` (`test_unstakeBeforeResolve_stillPaysCaller` for
the fix, `test_gap_unstakeBeforeResolveSkipsQualitySlash` pinning the old
behaviour), and `docs/SLA_COVERAGE.md` C8.

Only `DisputeV2` is replaced. The registry, `PayPerCallV8`, the keeper, the
provider registration, and the v8 subgraph stay as they are.

### 8.1 Deploy

The broadcaster needs gas only; the registry admin is the owner wallet.

```bash
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export SERVICE_REGISTRY_V8=0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3
export PAY_PER_CALL_V8=0xedce61eF5be31DC22cEfE342692622A26919a7EF
export ARBITER_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
export APPEAL_ARBITER_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
export TREASURY_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
# defaults already match the live V2 configuration
forge script script/DeployDisputeV3.s.sol:DeployDisputeV3 \
  --account deployer --rpc-url arc_testnet --broadcast
```

If the broadcaster is not the registry admin, the `authorizeSlasher` call inside
the script reverts. In that case deploy with the script's constructor only and
authorise from the owner wallet:

```bash
cast send 0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3 \
  'authorizeSlasher(address)' <DISPUTE_V3> \
  --account <owner-account> --rpc-url arc_testnet
```

Without that authorisation `openDispute` reverts, because the registry only lets
authorised slashers move stake.

### 8.2 Wire the frontend

1. Set `VITE_DISPUTE_V3=<DISPUTE_V3>` (and `DISPUTE_V3` for server code) in Vercel
   production. `VITE_DISPUTE_V2` can stay for the fallback; the app prefers V3.
2. Redeploy. The panel then calls `previewSlash` and shows the exact USDC amount
   that `openDispute` will escrow before the click. The env string may be typed in
   any case: `src/lib/config.ts` lower-cases every env address (`envAddress`),
   because a hand-typed mixed-case value with a broken EIP-55 checksum makes viem
   reject all reads and the panel silently renders zeros.
3. Revoke the old slasher once no dispute is pending on V2:
   `registry.revokeSlasher(0xe5D993E0B328B506B874505B23b4bE876d7c0900)`.
   `finalize` on an existing V2 dispute still works, because the money is already
   held inside that contract.

### 8.3 After deploy

- ✅ Opened dispute #1 on call `0x8cfa1821…dfb265` (tx
  `0x87864cae2dff2efdd14269ab94f135f0f8dcc11f8355eb490b656860585387ff`, block
  `68915026`): `heldSlash(1) = 576000` **before** `resolve`, `SlashHeld(1, 576000)`
  emitted, provider stake `5.76 → 5.184 USDC`, and the dispute contract holds
  `2.576 USDC` (2.00 bond + 0.576 escrow).
- `logs`/`getDispute`: the record carries the same fields as V2, so the panel
  needs no shape change.
- The v8 subgraph still points its `DisputeV2` data source at the old address, so
  the dispute entity stops updating for new disputes. The panel reads disputes
  from the contract, so this only affects indexer consumers. A Studio key is
  needed to redeploy the subgraph.

### 8.4 Deployment record — 24 Oct 2026

| Contract | Address |
|---|---|
| `DisputeV3` | `0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec` |

Verified on chain after the deploy: bytecode present; `arbiter`, `appealArbiter` and
`treasury` are the owner wallet; `disputeBond 2.00`, `appealBond 3.00`,
`disputeWindow/appealWindow/resolutionWindow = 604800/172800/604800`,
`disputeSlashBps 1000`; `registry()` and `payPerCall()` point at the live v8 pair;
`registry.authorizedSlashers(0xEf9f…6Fec)` is `true`; `disputeCount()` is `0`;
`previewSlash(1)` returned `0.576 USDC` (`10 %` of the `5.76 USDC` stake).

Vercel production received `VITE_DISPUTE_V3` and `DISPUTE_V3`. `DisputeV2`
(`0xe5D993E0…0900`) stays deployed: dispute #1 is resolved `Upheld` and its
`finalize` on 26 Oct 2026 18:58:38 UTC still pays out from that contract.

Update, 26 Oct 2026 21:53 UTC: that payout happened (`finalize(1)` tx `0xa09b50b2…`, block
`69223802`, `settled = true`, `heldSlash = 0`), `DisputeV3` finalized both of its disputes
(tx `0x7fe6d6fa…` block `69230325` returning `0.576512` USDC, and tx `0xdc1e6ff9…` block
`69238954` returning `0.41472` USDC, gas `85,048`), and `registry.revokeSlasher(DisputeV2)`
(tx `0xc0d3f541…`, block `69238925`, gas `27,592`) retired the V2 authority:
`authorizedSlashers(DisputeV2)` is now `false`, `authorizedSlashers(DisputeV3)` is `true`.
A replay of either finalize reverts `AlreadySettled()` (`0x560ff900`).

## 9. SLAUptime (A8 availability enforcement) — ready to deploy

The registry publishes `availabilityTargetBps` but never enforced it. `SLAUptime`
measures availability from the registry counters since the provider's last check
and lets **anyone** claim a slash when the published target was missed. Evidence:
`test/SLAUptime.t.sol` (29 tests), `docs/SLA_COVERAGE.md` A8.

Only a new contract is added; the registry, `PayPerCallV8`, the keeper, provider
registrations, and the subgraph stay as they are.

### 9.1 Deploy

```bash
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export SERVICE_REGISTRY_V8=0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3
export ARBITER_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
export TREASURY_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
# defaults: 10 % slash, 20 % bounty, 24 h cooldown, 20 samples
# On testnet use AVAILABILITY_MIN_SAMPLES=5: the live provider has a handful of
# calls, so a 20-call window cannot be reached by hand. Keep 20+ on mainnet.
export AVAILABILITY_MIN_SAMPLES=5
forge script script/DeploySLAUptime.s.sol:DeploySLAUptime \
  --account deployer --rpc-url arc_testnet --broadcast
```

If the broadcaster is not the registry admin, the in-script `authorizeSlasher`
reverts. Deploy without it and authorise from the owner wallet:

```bash
cast send 0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3 \
  'authorizeSlasher(address)' <SLA_UPTIME> \
  --account <owner-account> --rpc-url arc_testnet
```

Without that authorisation `claimAvailability` reverts: the registry only lets
authorised slashers move stake.

### 9.2 Wire the frontend

1. Set `VITE_SLA_UPTIME=<SLA_UPTIME>` in Vercel production and redeploy.
2. The new **Trust & Quality → Availability** panel lists providers with target,
   observed availability, sample count, and a `Claim` button that appears only when
   the contract would accept it.
3. Leaving the variable unset keeps the panel in explain-only mode: it documents
   the mechanism and hides every write.

### 9.3 After deploy

- Publish a target on a provider that has one: `availabilityTargetBps` must be
  non-zero, otherwise `claimAvailability` reverts with `TargetUnspecified`.
- Let the provider miss enough calls to reach `minSamples` with a rate below the
  target, then claim once and confirm the stake fell by `availabilitySlashBps`,
  the claimer received `bountyBps` of the slash, and the treasury got the rest.
- `previewAvailability(providerId)` mirrors the same decision, so the panel and the
  transaction can never disagree.

### 9.4 Deployment record — 25 Oct 2026

| Contract | Address |
|---|---|
| `SLAUptime` | `0x6916997DEFe98819176F66867fD5B356C284e89f` |

Verified on chain after the deploy: bytecode present; `arbiter` and `treasury` are
the owner wallet; `availabilitySlashBps 1000`, `bountyBps 2000`, `cooldown 86400`,
`minSamples 5`; `registry()` is `ServiceRegistryV8`; and
`registry.authorizedSlashers(0x6916…e89f)` is `true`.

First live reading, `previewAvailability(1)` on provider 1:

- observed availability `5714` bps (`57.14 %`) against a published target of
  `9950` bps (`99.50 %`)
- `7` samples (`4` completed, `3` timed out)
- `slashAmount 5.373248 USDC` (10 % of the `53.732480 USDC` stake), bounty
  `1.074649 USDC`, treasury `4.298599 USDC`
<!-- verified 31 Oct 2026 by archive reads of the same registry: `getProvider(1).stake` is `53732480` at block `69063378` and `48359232` at block `69063380`, so the slash base is the 53.732480 USDC the row prints. The lower stake figures quoted elsewhere come from later blocks, after further slashes and disputes. -->
- `ready = true`

Vercel production received `VITE_SLA_UPTIME` and `SLA_UPTIME`; the deployment
`callguard-deq5jxv2j-muazzezwqs-projects.vercel.app` is `READY` and aliased to
`arcsla.vercel.app`, and the bundle references the contract address.

#### First claim — 25 Oct 2026

| Field | Value |
|---|---|
| tx | `0xd7429d93cca53a9cdb5c12933c4023eb8da03c5e504dceea8aa352f8d6160539` |
| block | `69063379` |
| gas | `180217` |
| event | `AvailabilitySlashed(1, 0xfbac…06Da, 5714, 9950, 7, 5373248, 1074649)` |
| stake | `53.732480 → 48.359232 USDC` |
| claimer | `+1.074649 USDC` (bounty, 20 % of the slash) |
| treasury | `+4.298599 USDC` (the rest) |
| window after | `completed 4`, `slashed 3`, `samples 0`, `cooldownEndsAt 1793034255` |

`previewAvailability(1)` afterwards reports `ready = false`: the window is empty
and the 24 h cooldown is running, so the same calls cannot be claimed twice. This
is the A8 PASS evidence in `docs/SLA_COVERAGE.md`.

## 10. SLAProvenance (B3b payload provenance) — deployed 25 Oct 2026

`PayPerCallV8` binds a receipt to a `responseHash`, which says the provider committed
to a body — not where that body came from. `SLAProvenance` adds the missing slot: an
allowlisted attestor signs an EIP-712 digest over
`(callId, payloadHash, originHash, observedAt)`; anyone may submit the signature, and
the contract recovers the signer and stores the record only for an allowlisted key.

The digest binds chain id, verifying contract, call id, payload hash, origin hash and
observation time, so a signature cannot be replayed onto another call, origin,
deployment or chain. One record per call id, zero payload hash rejected, and an
observation more than `MAX_CLOCK_SKEW` (300 s) in the future rejected. Revoking a key
stops new records and leaves history intact.

**Trust model, stated plainly.** The contract verifies *who attested*, not that the
attestation is true, and not that the payload is a correct answer. On this deployment
the only allowlisted attestor is a key held by this workspace, so `B3b` is PARTIAL:
the mechanism is real and on chain, independence is not.

### 10.1 Deployment record

| Item | Value |
|---|---|
| `SLAProvenance` | `0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb` |
| deploy tx | `0xf858d54e469d1e2acb17eb957627205506ef628fff0e73062103a94d45c2d944` (block `69078183`, gas `577821`) |
| `setAttestor` tx | `0x94d6482e2f81acaaff882806b3c31163a10b74a6b14bff0f2f41343731cc3f78` |
| owner | `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da` (the admin wallet) |
| attestor | `0x528581fB8E66186Ba14650a1bD0bbd88DBC82F9c` (drill key, `chmod 600` under `/tmp/opencode/`) |
| `MAX_CLOCK_SKEW` | `300` |

Deploy script: `script/DeploySLAProvenance.s.sol` (`PROVENANCE_OWNER`, optional
`ATTESTOR_ADDRESS`). Contract tests: `test/SLAProvenance.t.sol`, 19 cases — happy path,
clock skew, unallowlisted signer, replay, wrong payload, wrong call, wrong origin,
wrong chain, malformed signature, empty hash, future timestamp, revocation.

Frontend wiring: `VITE_SLA_PROVENANCE` (`SLA_PROVENANCE_ADDRESS`,
`SLA_PROVENANCE_ENABLED`, `SLA_PROVENANCE_ABI` in `src/lib/config.ts`). Without the
address the Verify panel keeps only the local hash check.

### 10.2 Attestor runbook

```bash
CALL_ID=0x... ENDPOINT_URL=https://api.example.com/x \
  ATTESTOR_PK=0x... bun scripts/provenance-attest.js
```

The script hashes the exact response bytes, reads `provenanceDigest` from the
contract (so the EIP-712 encoding is never guessed), signs that raw digest, sends
`recordProvenance`, then re-reads `getProvenance` and `verifyProvenance` and fails if
the registry does not confirm what it just accepted. `PAYLOAD` / `PAYLOAD_FILE` /
`ORIGIN` cover endpoints that are not GET-able; `DRY_RUN=1` prints the digest and
signature without sending.

#### First record — 25 Oct 2026

| Field | Value |
|---|---|
| call | `0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265` |
| tx | `0x7cd975aba4e24ccb8fbeab98a000ed92003791313e9f11320ca7342e9373fa76` |
| block / gas | `69078912` / `145459` |
| payload | `pong` → `0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d` (equals the call's `responseHash`) |
| origin | `arcsla.vercel.app` → `0x0533755f352233ad0fe3675873655f9a13056f080bed0f759461613b00f6a78b` |
| observedAt / recordedAt | `1792955719` / `1792955722` |
| `verifyProvenance(callId, committedHash)` | `true` |

The Verify panel shows the record (attestor, origin hash, both timestamps, attested
hash), links the attestor on ArcScan, and asks `verifyProvenance` with the *committed*
hash — the meaningful question — rather than with the recorded one. Checked in the
dev server: the attested call renders `MATCH`, an unattested call renders
"no attestation recorded for this call yet", and the console stays clean.

## 11. Evidence layer (B3c/B3d modular verification) — deployed 26 Oct 2026

`SLAProvenance` answers "a key saw these bytes". It cannot answer "how was this answer
produced", and it must not pretend to. `SLAEvidenceRegistry` is the additive slot for
stronger artifacts: it anchors a *named* claim about a call, plus the address that
vouched for it, in one of two modes.

- **Signature** — the artifact was checked off chain and an allowlisted key signs the
  claim (EIP-712 `CallGuardEvidence` / `1`). Used for AWS Nitro attestations: Nitro signs
  with P-384, which has no EVM precompile, so on-chain verification is impossible and
  saying otherwise would be a lie.
- **Proof** — a verifier contract checks the artifact on chain. Used for the UltraHonk zk
  proof, which the EVM can check.

One claim per `(callId, kind)`, so evidence cannot be rewritten by a later, cheaper claim;
zero hashes rejected; a reverting verifier is a failure, not a pass. The stored value is a
digest of the off-chain envelope (`cg-claim/1`), which carries the statement and its
assumptions — a claim that does not name what it proves is rejected by the schema before it
reaches the chain.

### 11.1 Deployment record

| Item | Value |
|---|---|
| `SLAEvidenceRegistry` | `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB` |
| `HonkVerifier` (UltraHonk, keccak claim) | `0xC64341aBd4dfC62aCd11E35245D06FCF2B094846` |
| `ZkClaimAdapter` | `0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E` |
| verifier libraries | `RelationsLib` `0xb3dfa23c23eb683615408db4389ff1bbf74169ed`, `ZKTranscriptLib` `0x4cb5b3e5db8511c7caa53a073646267fd114d640` |
| deploy txs | `0x0d478277…` (RelationsLib), `0x01bd877f…` (ZKTranscriptLib), `0xabee20b4…` (HonkVerifier), `0xad2b170b…` (adapter), `0xc311a817…` (registry), `0x8063a5ce…` (`setProofVerifier`) |
| blocks / gas | `69090922`–`69090923` / **8,699,831** total (≈4.64 USDC at 533 gwei) |
| owner | `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da` |
| wiring read back | `modeOf(keccak256("zk-constraint")) = 2`, `proofVerifier = adapter`, `owner = admin` |
| script | `script/DeployEvidence.s.sol` (`EVIDENCE_OWNER`, optional `ZK_KIND`, `TEE_ATTESTOR_ADDRESS`) |
| frontend | `VITE_SLA_EVIDENCE` → the Verify panel's "Anchored evidence" card |

### 11.2 First live claim (zk output constraint)

| Item | Value |
|---|---|
| tx | `0xe8f6b0c594234d9ad318af41bcbade5374456e6c8e9ae552e0998fdb92673732` |
| block / gas | `69092517` / `3,810,232` |
| call | `0x8cfa1821…b265` (provider 1, `COMPLETED`) |
| claim hash | `0x51323974d481dbcb701dfb12f57e988b73ddd4a2b0a60525b1382caf39608021` |
| statement | "A private 4-byte body hashes to the committed responseHash and starts with the byte 0x70, for this callId" |
| reproduction | `bun scripts/zk-claim-envelope.ts --write` rebuilds the envelope and reprints the digest |

The claim is an output constraint, not correctness. The circuit proves the committed
`responseHash` has a preimage that starts with `0x70`, bound to the call by a `call_id`
public input; it says nothing about whether the body came from the provider's endpoint or
whether the answer is right. `B3b` therefore stays PARTIAL: attested *execution* still needs
real enclave hardware, and this workspace has none.

Operational notes worth keeping: `bb` needs `-t evm` on both `write_vk` and `prove`, and the
generated verifier does not compile under `via_ir` until its five `assembly` blocks are
annotated `("memory-safe")` — `docs/verification/DESIGN.md` §4.2.

## 12. Intel TDX path (B3b on real hardware) — Phala Cloud, attempted and stopped

The Nitro path in §11 is exercised against fixtures because this workspace has no AWS
account. Phala Cloud was picked as the second attempt because a TDX verifier needs no
account of its own to check a quote, so the only thing to obtain was one CVM-hour. The CVM
was never obtained: provisioning is refused on a zero balance (§12.4). The code and the
image remain, and steps 1–5 below are still the runbook once a balance exists.

Three pieces:

| Piece | Path | What it does |
|---|---|---|
| container | `verification/tdx-app/` | runs in the CVM; `/answer` returns a body plus a TDX quote bound to `callId` and the caller's nonce |
| verifier | `src/lib/verification/tdx.ts` | quote → Intel root, `report_data` binding, RTMR3 replay, compose-hash allowlist |
| capture | `scripts/tdx-attest.ts` | fetches `/answer` + `/info`, verifies, prints the claim digest, `--write` stores fixtures |

### 12.1 Why `report_data` is split 32/32

`report_data` is the only 64 bytes in a TDX quote the guest controls. First half:
`subjectUserData(callId, termsHash, responseHash)` — the same binding the Nitro path uses,
so evidence cannot be moved between calls. Second half: the caller's nonce, because a TDX
quote has no timestamp and freshness has to come from somewhere. A verifier that skips the
nonce is replayable; the script generates a fresh one per run.

### 12.2 The claim this earns

Statement (stored in the envelope, digest anchored on chain):

> The committed response for this call was produced inside an Intel TDX trust domain whose
> measured compose file is the one listed here, and the quote binds this call and a fresh
> caller nonce

Assumptions, all named in the envelope: Intel TDX root of trust; Phala's dstack measures the
compose file into RTMR3 and the compose-hash allowlist is current; the image digest inside
the compose file is the image whose source was reviewed.

Still not claimed: that the answer is correct.

### 12.3 Runbook

1. Build the container (`.github/workflows/tdx-app.yml`) and pin the printed digest in
   `verification/tdx-app/docker-compose.yaml`. A tag is not evidence; a digest is.
2. Deploy the compose file as a CVM on Phala Cloud (dashboard → Advanced, or `phala deploy`).
3. `bun scripts/tdx-attest.ts --base https://<cvm-host> --call 0x<callId> --write`
   — this fails loudly if the body does not hash to the committed `responseHash`, if the
   quote is not TDX, if the TCB is revoked, if the nonce is not echoed, or if the measured
   compose-hash is not the served one.
4. Owner signs once: `setSignatureVerifier(keccak256("tee-attestation"), <attestor>, true)`.
5. Anyone anchors the claim with the attestor signature. One anchor exists per
   `(callId, kind)`, and `tee-attestation` is a different kind from `witness`, so the TDX
   claim does not collide with the provenance record already stored for that call.

`B3b` moves to PASS only after step 5 lands on chain and the Verify panel shows the row.
Until then it stays PARTIAL with the same reason it has had all along: no hardware evidence
anchored.

### 12.4 Where this stopped (26 Oct 2026)

Step 1 is done: the image built on CI (`run 40363049500`, `linux/amd64`, index digest
`sha256:11ee891a8955e7815a41a0f22304e9e528351f27065fdffb92141c74bbea6b23`), provenance
attested, and pullable anonymously from `ghcr.io/muazzezwq/callguard-tdx`. The digest is
**not** pinned in the committed compose file, because step 2 never ran and a digest that no
CVM was started from would look like deployment evidence it is not.

Step 2 is refused:

```
phala deploy -n callguard-tdx -c verification/tdx-app/docker-compose.yaml -t tdx.small
Error [ERR-04-001]: Balance $0.00 is below minimum $0.00
POST https://cloud-api.phala.com/api/v1/cvms/provision → 400
```

Two TDX nodes are online and visible to the account (`prod5`, `prod9`, US-WEST-1), so the
platform is reachable; the gate is billing, not capacity. Provisioning needs a non-zero
balance and no payment method was added, so the work stopped here by decision. Nothing was
deployed, nothing was charged, and no owner transaction was signed.

Consequence, stated plainly: the TDX verifier is exercised against synthetic quotes only.
The real-quote regression suite still skips, `test/fixtures/tdx/` is empty, and no
`tee-attestation` claim is anchored. Resuming needs one thing — a funded balance — after
which §12.3 steps 1–5 run unchanged.


The billing gate also falsifies an assumption this section opened with: Phala Cloud does not
hand out a free CVM on signup. An account with no payment method has a `$0.00` balance, and
`POST /cvms/provision` answers `ERR-04-001` before any node is chosen. Two TDX nodes were
online and available to the account at the time, so this is money, not capacity.

## 13. Execution proof (RISC Zero zkVM, Groth16) — anchored 26 Oct 2026

`B3b`'s honest claim — "the execution that produced this answer was attested" — needs
hardware it does not have (§12). A zkVM is the other route to a weaker, checkable version of
it: the guest program's execution is proven by a SNARK the EVM verifies itself, so no key sits
in the loop and nothing has to be trusted off chain. Proving runs on GitHub Actions, so the
cost is `$0`; the Groth16 prover is x86-only, which is why it cannot run in this workspace.

The claim this earns, stated as narrowly as it should be: *a guest program with the published
image id ran on a private request whose `keccak256` is the call's committed `requestHash`, and
committed this `responseHash` for this `callId`*. It does not say the body came from the
provider's endpoint and it does not say the answer is correct. Freshness is the journal's
binding to the call, never a clock — a proof has no timestamp.

### 13.1 What is deployed

| Item | Value |
|---|---|
| `RiscZeroGroth16Verifier` | `0x8F0a67be3cB5750e1Ea088ECbfD27DBdB8228f01` |
| `Risc0ExecutionAdapter` (active) | `0xD804F2E0EfB3D8c470d60942643B71Ea5b271a21` |
| `Risc0ExecutionAdapter` (superseded) | `0xfB9b71be4f719688C906A76b8f81B63c27c4e560` — deployed with a mis-formatted image id, never used, see §13.4 |
| vendored verifier source | `lib/risc0-ethereum` at `365e7b2` (`v3.0.1`), GPL-3.0, unchanged |
| deploy txs | verifier `0x5e1a5cd8…` (block `69234491`, `1,135,268` gas), adapter `0x2b334a30…` (block `69236302`, `470,413` gas) |
| wiring txs | `setProofVerifier(keccak256("zk-execution"), adapter)` — `0x72d58a6d…` (block `69234518`, `70,907` gas) into first adapter, `0x3c2dd697…` (block `69236342`, `33,907` gas) into the active one. Repeatable by design, not one-time |
| constants | `ControlID.CONTROL_ROOT` `0xa54dc85a…`, `BN254_CONTROL_ID` `0x04446e66…`, selector `0x73c457ba`, all read back from chain |
| image id | `0x5fc483d58bc5eb7aa650ff3df138de5d435d97f39e2c06f74e7b40c48504b9fa` |
| script | `script/DeployZkExecution.s.sol` (`PAY_PER_CALL_V8`, `ZK_EXECUTION_IMAGE_ID`, optional `ZK_VERIFIER` to reuse a deployed verifier) |
| frontend | the Verify panel's "Anchored evidence" card gains a `ZK execution proof` row |

### 13.2 The anchored claim

| Item | Value |
|---|---|
| tx | `0x21dbb04b7f265fb67ce2ed83cae10f0413bcf14310c2a764f77d297ef2be57cf` |
| block / gas | `69236411` / `404,917` |
| `anchoredAt` | `1793049878` (2026-10-26 21:24:38 UTC) |
| call | `0x8cfa1821…b265` (provider 1, `COMPLETED`) |
| claim hash | `0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c` |
| response hash | `0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d` |
| proof blob | `abi.encode(seal, journal)` = **544 bytes** (260-byte seal, 128-byte journal) |
| read back | `modeOf = 2`, `getEvidence(callId, kind) = (kind, claimHash, responseHash, 0xD804F2E0…, 1793049878)`, `isAnchored = true`, `adapter.imageId` and `adapter.verifier` as above |
| reproduction | `bun scripts/zk-execution-proof.ts --write --blob <file>` rebuilds the envelope, the digest and the blob from the committed artifacts |

The registry stores a digest, not a verdict. The row is real because the verifier contract
accepted a Groth16 seal over the claim digest rebuilt from `imageId ‖ sha256(journal)`, and
because the adapter separately read the call's `requestHash` from `PayPerCallV8` and compared
it with the journal — a proof for one call cannot be presented for another, and a proof about
another response cannot be presented for this one.

### 13.3 Measurements

| Measurement | Value |
|---|---|
| prove (CI, `ubuntu-latest`, cold cache) | **238 s** |
| guest image id / journal | `0x5fc483d5…`, 128 bytes, digest `0xa86c1ab9…3694` |
| seal | 260 bytes (4-byte selector + 256-byte Groth16 proof) |
| `RiscZeroGroth16Verifier.verify` alone on Arc | **256,608** gas |
| `Risc0ExecutionAdapter.verify` (pairing + journal binding + `getCall`) | **285,885** gas |
| anchor, end to end | **404,917** gas (≈0.012 USDC at 30 gwei) |
| third-party service cost | none — the verifier is vendored, proving is CI |

Compare with §11's UltraHonk path: 2.9M gas to verify an output constraint, versus 0.26M here,
because the RISC Zero verifier is a hand-written pairing check with the verification key
compiled into it and only five public inputs.

### 13.4 The bug that only the chain could report, and how it was found

The first anchor reverted `ProofRejected`, and a direct `verify` call on the deployed verifier
reverted `VerificationFailed` with `PRECOMPILES::ecpairing` returning `false`. Nothing else was
wrong: the selector matched the seal, `BN254_CONTROL_ID` matched, and the journal was the one
the guest wrote. The cause was the guest image id.

`PING_ID` is `[u32; 8]`, and a RISC Zero digest is those eight words with **little-endian**
byte order. The host formatted them big-endian, so it printed an id that looks like a hash and
commits to nothing; the workflow pinned it, the fixture recorded it and the adapter was
deployed with it, so every artifact agreed with the wrong value. The chain then had nothing to
say except that the pairing failed.

The proof was always valid. `test/Risc0Receipt.t.sol` proves it locally: the committed seal
verifies against `0x5fc483d5…`, and is rejected against the old misread id. The host now goes
through `Digest::from(PING_ID).as_bytes()` instead of formatting words by hand, and runs
`verify_integrity_with_context` before writing anything, so a seal that does not attest to its
own claim cannot leave CI. Confirming the fix needed no new proof — only a new adapter, because
`imageId` is immutable — and the CI dev run prints the corrected id, which is what
`EXPECTED_IMAGE_ID` pins.

### 13.5 Runbook

1. `[prove]` in the commit message of a push that touches `.github/workflows/zk-execution.yml`
   requests a Groth16 run (`PROVE_REQUESTED`); a plain run builds the guest and stops before
   proving. Job logs need a token, so the job publishes the values as annotations, which do not.
2. Read `imageId`, `journal`, `journalDigest` and `sealHex` from the run's notice annotation and
   write them to `test/fixtures/zk-execution/{seal.bin,journal.bin,image_id.txt}`; compare the id
   with `EXPECTED_IMAGE_ID`.
3. `bun scripts/zk-execution-proof.ts --write --blob <file>` regenerates
   `src/lib/verification/fixtures/zk-execution.json` and the anchor blob.
4. `forge test --match-contract Risc0ReceiptTest` must pass before any deploy: it verifies the
   seal locally, which is the only check available without gas.
5. `ZK_VERIFIER=<deployed> bash` the deploy runner, then `setProofVerifier` for the new adapter
   and `anchor` the blob. Simulate first; every step in the runner is an `eth_call` before it is
   a transaction.

Guest and toolchain pins live in the workflow and in `zk-execution/`: `risc0-zkvm 3.0.6`,
`r0vm 3.0.6`, `cargo-risczero 3.0.6`, host Rust `1.91.0`, guest Rust `1.88.0` via
`rzup install rust`. The guest keeps its own `Cargo.lock` (`ruint 1.16.0`, `enum-ordinalize
4.3.0`) because the guest toolchain resolves differently from the host.

## 14. Dispute evidence binding (SLAEvidenceRegistryV2 + DisputeV4) — deployed and wired

`DisputeV4` is a verbatim port of `DisputeV3`'s money flow plus one write at `openDispute`: a
snapshot of every configured evidence kind for that call. `SLAEvidenceRegistryV2` is the v1
registry plus two hashes (the claim's statement and its assumptions) and one wiring flag
(`bindsResponse`). Evidence never changes `disputeBond`, `appealBond`, `disputeSlashBps`, a
window, or a verdict — `test_balancesAreIdenticalWithAndWithoutEvidence` asserts the caller,
provider and treasury deltas are exactly equal with and without a bound claim, for both
verdicts.

Status: **deployed and wired 28 Oct 2026**. The agent did not broadcast anything; the owner ran
`script/DeployEvidenceV2.s.sol` and every wiring call from their own TTY with the `owner` keystore.

| Item | Value |
|---|---|
| `SLAEvidenceRegistryV2` | `0x64872c29A19dF8E471103d0708397BAb96A311FC` (tx `0x2df3be0f…26941`, block `69401608`, `765735` gas) |
| `DisputeV4` | `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B` (tx `0x8ebe9986…2fd8f`, block `69401608`, `2752305` gas) |
| Gas paid by the owner | `0.076077615 USDC` for both deploys |

Read back after the deploy, all matching the script's pin: `owner()` = the owner wallet, arbiter /
appeal arbiter / treasury = the owner wallet, `disputeBond` `2000000`, `appealBond` `3000000`,
`disputeWindow`/`resolutionWindow` `604800`, `appealWindow` `172800`, `disputeSlashBps` `1000`,
`legacyDispute()` = `0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec`, `evidence()` = the new registry.
Read back after the wiring, all matching the runbook: `modeOf(zk-constraint)` = `2`,
`modeOf(zk-execution)` = `2`, `bindsResponse(zk-execution)` = `true`, `evidenceKinds()` = the four
kinds, `authorizedSlashers(DisputeV3)` = `false`, `authorizedSlashers(DisputeV4)` = `true`,
`isAnchored(callId, zk-execution, claim)` = `true`. `modeOf(witness)` read `0` (`NoVerifier`) at
deploy time, before its adapter existed; it was wired to `SLAProvenanceAdapter` later the same
day (tx `0xd5499453…6f81`, block `69494118`) and now reads `2`. `modeOf(tee-attestation)` is
still `0`, because no attestor exists, so that row answers `present=false, reason=NoVerifier`;
that is the wiring's honest state, not a gap in the snapshot.

| Wiring call | Tx |
|---|---|
| `setProofVerifier(zk-constraint, ZkClaimAdapter, true)` | `0x19ac4811…f77cd` (block `69469204`, `93512` gas) |
| `setProofVerifier(zk-execution, Risc0ExecutionAdapter, true)` | `0x5b9addae…ed0fad` (block `69469218`, `93512` gas) |
| `DisputeV4.setEvidenceKinds([4 kinds])` | `0x44b6701e…7bf1e` (block `69469236`, `142806` gas) |
| `ServiceRegistryV8.revokeSlasher(DisputeV3)` | `0xfc9579c2…729f7cd` (block `69469252`, `25604` gas) |
| `ServiceRegistryV8.authorizeSlasher(DisputeV4)` | `0x5b30dded…bc85507` (block `69469274`, `47502` gas) |
| `anchor(zk-execution fixture)` | `0x5f57a56e…702a013e` (block `69469682`, `450278` gas) |

Everything after this table is the historical procedure plus the limits; the agent does not
broadcast an owner-wallet transaction.

### 14.1 What the script does

```bash
forge script script/DeployEvidenceV2.s.sol:DeployEvidenceV2 --account deployer --rpc-url arc_testnet            # dry run
forge script script/DeployEvidenceV2.s.sol:DeployEvidenceV2 --account deployer --rpc-url arc_testnet --broadcast # two deploys
```

It deploys `SLAEvidenceRegistryV2` (owner = `EVIDENCE_OWNER_ADDRESS`, default the live owner
`0xfbac99E6…06Da`) and `DisputeV4` with the live parameters, checks each constructor argument
back on chain, and then prints the seven owner calls with exact arguments. It refuses to
continue if any read-back disagrees. Live defaults it pins:
`DISPUTE_BOND=2000000`, `APPEAL_BOND=3000000`, `DISPUTE_WINDOW=604800`,
`APPEAL_WINDOW=172800`, `RESOLUTION_WINDOW=604800`, `DISPUTE_SLASH_BPS=1000`,
`LEGACY_DISPUTE=0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec`.
`test/DisputeV4.t.sol::test_deployScriptLiveDefaultsMatchTheControllerValues` fails if one drifts.

### 14.2 The seven owner calls, and what "wrong" looks like

Run them in this order. Each read-back is the gate for the next one.

| # | Call | Read-back | What wrong looks like |
|---|---|---|---|
| 1 | `registryV2.setProofVerifier(keccak256("zk-constraint"), 0x8bD4fB9F…664E, true)` | `modeOf(kind) == 2`, `bindsResponse(kind) == true` | `bindsResponse` false → every `zk-constraint` row reads `VerifierNotBinding` and never binds |
| 2 | `registryV2.setProofVerifier(keccak256("zk-execution"), 0xD804F2E0…1a21, true)` | same, plus `proofVerifier(kind) == 0xD804F2E0…1a21` | a stale adapter address anchors nothing (`VerifierNotAllowed` on the re-anchor) |
| 3 | `registryV2.setProofVerifier(keccak256("witness"), 0x046d715D…0498, true)` — the deployed path | `modeOf(kind) == 2`, `bindsResponse(kind) == true`, `proofVerifier(kind) == 0x046d715D…0498` | **do not use `setSignatureVerifier` here.** A signature key reaches mode `1`, `DisputeV4` binds only mode `2`, and the snapshot records a mode-1 row as `ModeIsSignature` — a claim the dispute cannot use, which reads like progress and is not. An unwired kind instead reads `NoVerifier`, which is visible on chain and silent in the money paths |
| 4 | `disputeV4.setEvidenceKinds([witness, tee-attestation, zk-constraint, zk-execution])` | `evidenceKinds()` returns the four kinds | **the dangerous one**: with an empty allowlist `openDispute` snapshots nothing, no row is ever rendered, and nothing errors — the feature ships doing nothing |
| 5 | `registry.revokeSlasher(0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec)` | `authorizedSlashers(V3) == false` | **do not skip and do not reorder**: the V4 guard is one-directional — V4 asks V3 whether it already holds a call, V3 has no reciprocal check. While V3 stays a slasher, a caller can open a second dispute on a call V4 already escrowed and cut the same stake twice. The script prints an ORDERING GATE line while `authorizedSlashers(V3)` is still true |
| 6 | `registry.authorizeSlasher(<new DisputeV4>)` | `authorizedSlashers(V4) == true` | without it `openDispute` reverts at the escrow step, so disputes simply cannot open |
| 7 | `registryV2.anchor(<fixture callId>, keccak256("zk-execution"), …)` with the fixture's four hashes and `` `0x$(xxd -p test/fixtures/zk-execution/seal.bin)` `` | `isAnchored(callId, kind, claimHash) == true`, `modeOf(kind) == 2` | the live UI row disappears; the v1 anchor on the old registry still stands, so the panel would read the v1 row and say the registry predates statement hashing |

Order matters twice, and only one of the two is negotiable. Steps 1-2 must precede step 7: an
unwired kind rejects the anchor. Step 6 must follow step 5 — that is a hard gate, not a
convention. The overlap where both contracts are authorised is the dangerous direction: V3 can
open a dispute on a call V4 already escrowed, because the guard in V4 covers only V3→V4. The gap
where neither is authorised is harmless — no dispute can open for a few minutes.

### 14.3 Env after signing

```bash
SLA_EVIDENCE_V2=<registryV2>      # server: /api/evidence reads it
VITE_SLA_EVIDENCE_V2=<registryV2> # browser: dual v1/v2 read in Verify
VITE_DISPUTE_V4=<disputeV4>       # dispute write path; DisputeV3 stays readable
```

`/api/evidence` answers `anchored: false, note: "no-registry"` until `SLA_EVIDENCE_V2` is set, so
an unconfigured deployment says so instead of pretending nothing is anchored.

### 14.3b Anchor proof packaging (the failure that looks like a bad proof)

`Risc0ExecutionAdapter.verify` expects `proof = abi.encode(bytes seal, bytes journal)`. Passing
`test/fixtures/zk-execution/seal.bin` on its own makes `abi.decode` fail inside the adapter, which
returns `false` rather than reverting; the registry turns that into `ProofRejected` (`0xc3b0d8cd`),
so the message reads like a rejected proof when the bytes were simply wrapped wrong. Build the blob:

```bash
SEAL="0x$(od -An -v -tx1 test/fixtures/zk-execution/seal.bin | tr -d ' \n')"
JOURNAL="0x$(od -An -v -tx1 test/fixtures/zk-execution/journal.bin | tr -d ' \n')"
PROOF="$(cast abi-encode 'f(bytes,bytes)' "$SEAL" "$JOURNAL")"
cast call $ADAPTER 'verify(bytes,bytes32,bytes32,bytes32)(bool)' "$PROOF" "$CALL_ID" "$CLAIM" "$RESPONSE" --rpc-url https://rpc.testnet.arc.io  # true before spending gas
```

`journal.bin` is the 128-byte journal (`callId`, `requestHash`, `responseHash`, `handlerId`); the
seal is `260` bytes. `xxd` is not installed on this box, so `od -An -v -tx1` is the portable form.

### 14.3c Production: the 12-function cap and the tuple decode

Two failures showed up only in production, after the wiring was green on chain:

1. **Deploy rejected.** Hobby caps a deployment at 12 Serverless Functions; `api/` had 12 and
   `api/evidence.js` made 13. `/api/evidence` is now `api/_evidence.js` (a `_`-prefixed module is
   not a function) dispatched from `/api/attestation?evidence=1` through a `vercel.json` rewrite.
   The public URL and payload are unchanged; `attestation.js` dispatches before its RPC guard so
   the evidence route keeps its own status codes.
2. **`note: "rpc-error"` with a good RPC.** viem decodes a single tuple output into an object keyed
   by component name, so `const [row] = decodeFunctionResult(...)` throws `TypeError: {} is not
   iterable` and every read answered 502. `decodeEvidenceRow` in `api/_evidence.js` now returns the
   object, and `tests/api-evidence.test.ts` pins the decode against the recorded chain result from
   block `69469682` — the stub-injected tests could not see this, because they never decode.

### 14.3d DisputeV3 is closed

`finalize(4)` ran on 28 Oct 2026 (tx `0xbdaf9525…f6167`, block `69473913`, `85048` gas): it released
`3.481864 USDC` and left `settled(4) = true`, `heldSlash(4) = 0`, and no USDC balance in V3 in
either representation (6-decimal `0x3600…0000` and the 18-decimal system contract). `finalize` is
permissionless; the owner wallet signed it and received the escrow because it was the caller on that
call. Nothing further is pending on V3.

Smoke result after the fix: `/api/evidence?callId=0x8cfa1821…fb265&kind=zk-execution` →
`200 {anchored:true, match:true, source:"fixture", note:null}`; an unwired kind → `404` with
`note:null`; `/api/attestation?callId=…` still answers `verdict:"COMPLETED"`.

### 14.4 Post-deploy smoke test

The route's module loading has now been wrong three times, and every time `bun test` was green while
production answered `500 FUNCTION_INVOCATION_FAILED` on **every** request, including ones that never
reach the evidence code — a module-load failure, not a handler error.

1. A `.ts` specifier. 2. `createRequire(import.meta.url)` around the fixtures: a bundler keeps that
call, so the function needed JSON files that were not traced into its directory. The fixtures are now
static `import … with { type: "json" }` declarations. 3. **An extensionless relative specifier.**
Vercel does not bundle an ESM function's import graph: it compiles each file and copies it beside its
neighbours, where node's ESM resolver needs the exact file name. The deployment log said it plainly:

```
Cannot find module '/var/task/src/lib/verification/schema'
  imported from /var/task/src/lib/verification/witnessClaim.js
```

`bun test` and `esbuild` both guess the extension, which is why the first two fixes looked complete.
Every relative import under `src/lib/verification/` now states `.js`, and
`tests/api-bundle-load.test.ts` fails on an extensionless specifier in that directory, plus it
bundles the entry and imports the artifact alone under `node`. To read the deployed error instead of
guessing:

```bash
vercel ls --yes                                   # newest Ready production deployment
vercel logs --deployment <deployment-url>         # the cold-start stack trace
curl -s -o /dev/null -w "%{http_code}\n" "https://arcsla.vercel.app/api/attestation?providerId=1"
```

`x-vercel-error: FUNCTION_INVOCATION_FAILED` with a runtime `nodejs24.x` trace naming a module means
load, not handler. After the deploy, against production:

```bash
curl -s "https://arcsla.vercel.app/api/evidence?callId=0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265&kind=zk-execution"
# expect: "anchored": true, "match": true, "source": "fixture", "note": null
curl -s "https://arcsla.vercel.app/api/evidence?callId=0xf68c0c621adf813fb65be6e8b594061669fced19d678807cbb22a92ca6feb488&kind=zk-execution"
# expect: "anchored": true, "match": true  (the claim dispute 2 binds)
curl -s "https://arcsla.vercel.app/api/attestation?providerId=1"
# expect: score 44, completedCalls 6, slashedCalls 9, proof.contract = ServiceRegistryV8
```

All four were read back on 29 Oct 2026 after `2104de6` was deployed.

`match: false` with `note: null` means the anchored hashes disagree with the served envelope —
stop and compare `statementHash` and `assumptionHash` with the values in
`test/ClaimHashes.t.sol`. A 500 means the function did not load: check for a specifier or a
`require` the runtime cannot resolve, and run `bun test tests/api-bundle-load.test.ts` first — it
reproduces the deployed artifact locally.

### 14.5 What this does not claim

A bound claim means the anchored `responseHash` equals the call's and the kind's verifier was
recorded as binding the response. It does not mean the answer is correct, and it does not move
money. The four claim kinds keep their scopes: `witness` (a key saw the bytes),
`tee-attestation` (synthetic evidence only, §12), `zk-constraint` (the committed hash has a
preimage meeting a stated predicate), `zk-execution` (a guest with the published image id ran and
committed these four words).

### 14.6 Limits this feature does not close

- **The verifier does not attest the statement.** `IEvidenceVerifier.verify` receives
  `(proof, callId, claimHash, responseHash)` and the deployed adapters check the proof's journal
  against `callId` and `responseHash`; `Risc0ExecutionAdapter` discards `claimHash`. So a bound row
  means "the anchored response hash equals the call's, and this kind's verifier was recorded as
  binding the response" — it does not mean the proof covered the statement text next to it.
- **Anchoring is permissionless and first-come.** `anchor` is keyed on `(callId, kind)` with
  `AlreadyAnchored` guarding a second write, so whoever anchors first owns that row for that kind.
  With the current adapters, a holder of a valid seal can anchor it with statement text of their
  choosing; the honest attestor is then locked out for that pair. The snapshot shows the digest the
  chain holds and the Verify panel recomputes it from the served words, so tampering is visible —
  but the words themselves are not attributable. Closing this needs a verifier that commits
  `statementHash` in its journal, which is a new adapter, not a wiring change.

### 14.7 Settling disputes 1 and 2 — `finalize`, not `reclaimExpiredBond`

Both live disputes were **already decided**. `resolve(id, true)` ran on each one on 28 Oct 2026, so
`status` is `Upheld` (`2`) and only the appeal window stands between them and settlement:

| id | call | `openedAt` | `resolvedAt` | `status` | `settled` | `heldSlash` |
|---|---|---|---|---|---|---|
| `1` | `0x5ca2100b…b9ed1` | `1793209403` (28 Oct 17:43:23Z) | `1793216871` (28 Oct 19:47:51Z) | `Upheld` | `false` | `1,283,554` |
| `2` | `0xf68c0c62…b488` | `1793214948` (28 Oct 19:15:48Z) | `1793216831` (28 Oct 19:47:11Z) | `Upheld` | `false` | `924,159` |

`reclaimExpiredBond` is **not** the call for either id. It requires `status == Pending`, and both
records answer `AlreadyResolved()` at that guard. It only ever applies to a dispute no arbiter
touched inside `resolutionWindow` (604,800 s), and that never happened here.

The right call is `finalize(id)`. It is permissionless, needs no arbiter role, and reverts
`AppealWindowOpen()` until `block.timestamp > resolvedAt + appealWindow` (`172,800` s):

| id | `finalize` opens at | epoch |
|---|---|---|
| `1` | 2026-10-30T19:47:51Z | `1793389671` |
| `2` | 2026-10-30T19:47:11Z | `1793389631` |

Neither side appealed inside that window (`appeal` requires `Upheld`/`Rejected` plus a party, and
the window has closed on both), so each finalize pays the escrowed slash to the caller. Both
callers are the owner wallet `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`, and so are `arbiter`,
`appealArbiter` and `treasury`. Bonds were already returned at resolve time, so finalize moves only
`heldSlash`. `USDC.balanceOf(DisputeV4)` is `2,207,713` — exactly `1,283,554 + 924,159` — so the
contract is solvent and both transfers are covered.

Pre-flight, from the repository root (read-only):

```bash
export RPC=https://rpc.testnet.arc.io
D=0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B
cast block latest --rpc-url $RPC -f timestamp        # must exceed 1793389671
cast call $D "getDispute(uint256)((bytes32,address,uint256,uint64,uint64,uint64,uint256,uint256,uint8,string,string))" 1 --rpc-url $RPC
cast call $D "settled(uint256)(bool)" 1 --rpc-url $RPC        # expect false
cast call $D "heldSlash(uint256)(uint256)" 1 --rpc-url $RPC   # expect 1283554
```

The two writes, signed by the owner in its own terminal (the agent never broadcasts these):

```bash
cast send $D "finalize(uint256)" 1 --account deployer --rpc-url arc_testnet
cast send $D "finalize(uint256)" 2 --account deployer --rpc-url arc_testnet
```

The same two actions exist in the UI: on `/app?nogate` → Disputes, each row shows
`Finalize (release 1.28 USDC)` / `Finalize (release 0.92 USDC)` once the window closes
(`canFinalize` in `src/components/panels/DisputesV8.tsx`). The `Reclaim bond` branch there is the
`Pending` path and stays hidden for these ids.

Read back after each write:

```bash
cast call $D "settled(uint256)(bool)" 1 --rpc-url $RPC       # true
cast call $D "heldSlash(uint256)(uint256)" 1 --rpc-url $RPC  # 0
cast call 0x3600000000000000000000000000000000000000 "balanceOf(address)(uint256)" $D --rpc-url $RPC
#   expect 924,159 after id 1, 0 after id 2
```

`DisputeFinalized(id, status, slashAmount)` is the event to expect. A revert before the window
closes means too early, not a defect: read `block.timestamp` and `resolvedAt` again rather than
retrying.
