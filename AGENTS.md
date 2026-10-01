# CallGuard — Project State (Arc Testnet, chain ID 5042002)

## Core Contracts (verified on ArcScan)
| Contract | Address | Status |
|---|---|---|
| `PayPerCall` (v2) | `0x10387347678d9f7106D5625bE0BD6C915158B130` | ✅ Verified |
| `ServiceRegistry` | `0xea00f898C0eA249de7226b283e93C13eFa7BbcFF` | ✅ Verified |
| `Dispute` | `0xa47162d8e4785d867f05800f35a334fd78575e56` | ✅ Verified |
| `Subscription` | `0xef7d56390f86a5cecc05f75e265859a1c79cefe6` | ✅ Verified |
| `DisputeQuality` | `0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725` | ✅ Deployed (1 Oct 2026) |
| `SLAFutures` | `0xa6f194c621eE67559aDcA883824e01F1828e887c` | ✅ Deployed (1 Oct 2026) |
| `ReputationLoan` | `0xE656dF6512e9d10e555518b7342fd8c81c42B8c0` | ✅ Deployed (1 Oct 2026) |

## Dependent Addresses
- `FACILITATOR_ADDRESS`: `0x0E515aEd287a7b3d2D9F7911321d99826653Fbd8`
- `SELLER_ADDRESS`: `0x9adEDa85604C205791B98B4C239b5625688a4ba5`
- `USDC_ADDRESS`: `0x3600000000000000000000000000000000000000` (Arc native USDC)

## Key Parameters
- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.io`
- Explorer: `https://explorer.testnet.arc.io`
- Subgraph: `https://api.goldsky.com/api/public/project_cmqryheeji.../subgraphs/arcsla/1.0.0/gn`

## Test Results
- 67/67 Foundry tests passing
- Grace period: `SUBMIT_GRACE = 5` seconds
- Receipt EIP-712: includes `respondedAt` timestamp

## Vercel Environment Variables Required
| Key | Description |
|---|---|
| `FACILITATOR_PRIVATE_KEY` | Facilitator wallet private key |
| `SELLER_PRIVATE_KEY` | Auto-receipt provider private key |
| `VITE_USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` |
| `VITE_PAY_PER_CALL` | `0x10387347678d9f7106D5625bE0BD6C915158B130` |
| `VITE_SERVICE_REGISTRY` | `0xea00f898C0eA249de7226b283e93C13eFa7BbcFF` |
| `VITE_CHAIN_ID` | `5042002` |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.io` |
| `PROVIDER_1_WEBHOOK` | `https://arcsla.vercel.app/api/auto-receipt` |

## Deployment URLs
- App: `https://arcsla.vercel.app/app/`
- Landing: `https://arcsla.vercel.app`
- Netlify: `https://keen-lamington-f268c2.netlify.app`

## Backup Branches
- `backup/pre-app-redesign-20260924-2221`
- `backup/pre-komple-redesign-20260925-1305`
- `backup/pre-ux-overhaul-20260927`
