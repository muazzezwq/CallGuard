# Incident runbook

This is the answer to CG-OPS-02: CallGuard has no on-chain pause, because the
deployed contracts are immutable and the live instance has no pause slot. What
exists instead is a switch on this deployment plus the procedure below. Read it
before you need it.

Two facts decide everything here:

- The chain keeps running. `SLAKeeper` keeps claiming timeouts, providers keep
  their stake, and a call that was already opened keeps the terms it was opened
  with.
- The only thing you can stop instantly is this deployment, through the
  `MONEY_ROUTES_DISABLED` environment variable.

## The switch

`api/_killswitch.js`. When `MONEY_ROUTES_DISABLED` is `1`, `true`, `yes`, or
`on`, `/api/call-service`, `/api/energy-data`, and `/api/premium-report` answer
`503 { code: "MONEY_ROUTES_DISABLED" }` before reading an authorization, calling
the RPC, or asking the facilitator to settle.

```bash
vercel env add MONEY_ROUTES_DISABLED production   # answer: 1
vercel --prod                                     # the env change needs a deploy
```

Set it on `preview` too if the incident is in the shared facilitator key, not in
one deployment.

## Step 1 — stop value flow

Set `MONEY_ROUTES_DISABLED=1` and redeploy, as above. Do not delete
`FACILITATOR_PRIVATE_KEY` first: the running deployment reads it on every
request, so removing the variable alone does not stop the code that is already
serving.

## Step 2 — revoke the compromised key

If the facilitator key may be compromised, treat it as spent:

```bash
vercel env rm FACILITATOR_PRIVATE_KEY production
```

Then create a new facilitator wallet, fund it, add the new key as
`FACILITATOR_PRIVATE_KEY` in **both** `production` and `preview`, and redeploy.
A key that was only removed keeps working anywhere it was copied to.

The same rule applies to `KEEPER_PK` (GitHub Actions secret) and to
`UPSTASH_REDIS_REST_TOKEN`.

## Step 3 — deactivate the affected provider

Per-provider, on chain, from the owner wallet:

```bash
cast send 0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3 \
  "deactivate(uint256)" <providerId> --account deployer --rpc-url arc_testnet
```

`deactivate` stops new calls. It does not stop `claimTimeout` or an open dispute,
and it does not release the stake — `unstake` also waits out `DISPUTE_WINDOW`
(7 days) after the provider's last completed call, by design.

## Step 4 — sweep and reconcile

1. `cast call 0x3600…0000 "balanceOf(address)(uint256)" <treasury>` — record it.
2. Move the treasury balance out of the hot wallet to cold storage. The treasury
   is the owner wallet today, so this is one transfer, not a governance action.
3. Reconcile the last settled calls from `/api/idempotency-recovery` before you
   decide the incident is over. A settlement whose outcome is `unknown` is not a
   settlement: check the transaction hash on the explorer.
4. Re-enable by removing `MONEY_ROUTES_DISABLED` (or setting it to `0`) and
   redeploying.

## What has no switch

| Component | Why | Response instead |
|---|---|---|
| `ServiceRegistryV8` | immutable, no pause slot | step 3, per provider |
| `PayPerCallV8` | immutable, no pause slot | step 1, at the API edge |
| `DisputeV4` | immutable | `revokeSlasher` from the owner, then step 1 |
| `SLAKeeper` | immutable, permissionless crank | nobody's key is required to crank it; a compromised keeper can only pay gas |
| Subgraph | read-only index | the frontend reports an unavailable indexer rather than an empty marketplace |

A pause function is a decision for the next deployment, not a patch to this one.
If that decision is made, it belongs in `ServiceRegistryV8` (which owns stake and
provider state) and must be tested against `test/ServiceRegistryV8.t.sol`.
