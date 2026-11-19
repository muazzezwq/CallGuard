# CallGuard v8 subgraph

Indexes the Arc Testnet v8 deployment that went live on 13 Nov 2026:

- `ServiceRegistryV8` `0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9`
- `PayPerCallV8` `0xA40623c2C8A39ae55AE3fEa47f85cF89Dc7F5491`
- `DisputeV4` `0x7c04880003361c16Dd1d49205ef5ec187e2D2d39`

Start blocks: `72114871` (registry, pay-per-call) and `72116512` (dispute).

The manifest deliberately keeps the v7 Goldsky deployment untouched. Build it from
the parent `subgraph/` directory:

```bash
npm run codegen:v8
npm run build:v8
```

Deploy to The Graph Studio (slug `onur`, version label `1.0.3`):

```bash
npm run deploy:studio:v8
```

The development query URL is
`https://api.studio.thegraph.com/query/1763627/onur/1.0.3`. It is limited to 3,000
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
- **`DisputeRecord` covers DisputeV4 only.** The manifest indexes `DisputeV4`; the
  retired `DisputeV2`/`V3` disputes are not in this deployment and are read from
  their own contracts if needed.
