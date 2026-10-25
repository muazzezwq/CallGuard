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
`ACTIVE.SERVICE_REGISTRY` with the v8 layout (active at word 5, `completedCalls` 7,
`slashedCalls` 8), shows the terms version, and builds `/sitemap.xml` from `nextProviderId()`
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
`providerIdOf(0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da)` is `1`. Provider `1` holds
`8 USDC` stake after one timeout drill slashed `2 USDC` from the original `10`, price `1 USDC`,
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

## 8. DisputeV3 (quality-slash escrow) — ready to deploy

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
