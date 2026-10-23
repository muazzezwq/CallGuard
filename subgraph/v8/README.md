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
queries per day. The frontend only switches its indexer when `VITE_SUBGRAPH_URL`
points at that endpoint; until then it keeps the v7 endpoint.
