# CallGuard v8 subgraph

Indexes the Arc Testnet v8 availability core:

- `ServiceRegistryV8` `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3`
- `PayPerCallV8` `0xedce61eF5be31DC22cEfE342692622A26919a7EF`
- `DisputeV2` `0xe5D993E0B328B506B874505B23b4bE876d7c0900`

Start block: `68651068`.

The manifest deliberately keeps the v7 Goldsky deployment untouched. Build it from
the parent `subgraph/` directory:

```bash
npm run codegen:v8
npm run build:v8
```

Deploy to The Graph Studio (slug `onur`, version label `1.0.0`):

```bash
npm run deploy:studio:v8
```

The development query URL is
`https://api.studio.thegraph.com/query/1763627/onur/1.0.0`. It is limited to 3,000
queries per day. `src/lib/config.ts` defaults `subgraphUrl` to it, and
`VITE_SUBGRAPH_URL` overrides the default — an unset variable no longer falls back
to the retired v7 Goldsky endpoint.

## What this indexer cannot answer

- **`Provider.maxConcurrentCalls` is `0` for every provider.** `ProviderRegistered`
  does not carry the cap, and the contract's initial cap is written at registration
  without an event. Only `MaxConcurrentCallsUpdated` sets the field, so a provider
  whose cap was never changed reads `0` here while `getProvider` on chain answers the
  real value (`10` for provider 1). Panels that need it read the chain.
- **`nftBound` is always `false` and `nftTokenId` always `null`.** v8's
  `ServiceRegistryV8` has no ERC-8004 binding and emits no NFT event; the fields are
  hardcoded in `handleProviderRegistered` so the entity keeps its shape.
- **`DisputeRecord` only holds DisputeV2 disputes.** The manifest indexes
  `DisputeV2`; disputes opened on V3 or V4 are not here. Read `DisputeV4` directly
  for current disputes.
