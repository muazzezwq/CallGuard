# CallGuard — Project State (Arc Testnet, chain ID 5042002)

## Core Contracts — ACTIVE (v5 — admin=owner wallet, 7 Oct 2026)
| Contract | Address | Notes |
|---|---|---|
| `ServiceRegistry` (v5) | `0xc3ff2169ed44129b9fc06011a5a432f92ef2f0c4` | admin=0xfbac99...06Da (owner wallet) |
| `PayPerCall` (v6) | `0xe901462b31f8a42262a2fc5ea3ee4f373cb75630` | registry=v5, +callServiceWithAuthorization (x402/EIP-3009) |
| `DisputeQuality` (v2) | `0x7e2771df71c30307a95f038c93077d5350e7789d` | HLB-05 pull payouts (withdrawPayout) |
| `SLAFutures` (v2) | `0x19d03ff147816c97aad88f1275ad80855dcac9b2` | HLB-02 escrow model (claimProceeds) |
| `ReputationLoan` (v2) | `0x5a2f5455560ff9957db7fc208f9c819655c3a2d4` | HLB-04 stake-based loan cap |
| `CrossChainReceiver` (v2) | `0x760326de3cba39994dfd81d2b71b072c0265601c` | HLB-01 callServiceFor(beneficiary) |

## Core Contracts — RETIRED (pre-HLB, do not use)
| Contract | Address | Retired |
|---|---|---|
| `PayPerCall` (v3) | `0x51bbd776d01bbb99b5425c701f00b2c516215e2e` | 7 Oct 2026 |
| `PayPerCall` (v2) | `0x10387347678d9f7106D5625bE0BD6C915158B130` | 3 Oct 2026 |
| `ServiceRegistry` (v3) | `0xea00f898C0eA249de7226b283e93C13eFa7BbcFF` | 7 Oct 2026 |
| `DisputeQuality` (v1) | `0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725` | 7 Oct 2026 |
| `SLAFutures` (v1) | `0xa6f194c621eE67559aDcA883824e01F1828e887c` | 7 Oct 2026 |
| `ReputationLoan` (v1) | `0xE656dF6512e9d10e555518b7342fd8c81c42B8c0` | 7 Oct 2026 |
| `CrossChainReceiver` (v1) | `0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c` | 7 Oct 2026 |

## Unchanged Contracts
| Contract | Address |
|---|---|
| `Dispute` | `0xa47162d8e4785d867f05800f35a334fd78575e56` |
| `Subscription` | `0xef7d56390f86a5cecc05f75e265859a1c79cefe6` |
| `SLAAttestationBridge` | `0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7` |
| `AgentWallet` | `0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6` |

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
- 223/223 Foundry tests passing (7 Oct 2026)
- Grace period: `SUBMIT_GRACE = 5` seconds
- Receipt EIP-712: domain ArcSLA/1, includes `respondedAt` timestamp

## AgentWallet (1 Oct 2026)
| Field | Value |
|---|---|
| Contract | `0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6` |
| Owner | `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da` |
| Agent (hot wallet) | `0x22099051bbe59117Ebc5219bdDA90D7790758C03` |
| Daily limit | 10 USDC |
| Max per call | 2 USDC |
| Balance | 0 USDC (needs deposit) |
| Paused | false |

## Vercel Environment Variables Required
| Key | Description |
|---|---|
| `FACILITATOR_PRIVATE_KEY` | Facilitator wallet private key |
| `SELLER_PRIVATE_KEY` | Auto-receipt provider private key |
| `VITE_USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` |
| `VITE_PAY_PER_CALL` | `0xe901462b31f8a42262a2fc5ea3ee4f373cb75630` |
| `VITE_SERVICE_REGISTRY` | `0xc3ff2169ed44129b9fc06011a5a432f92ef2f0c4` |
| `VITE_CHAIN_ID` | `5042002` |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.io` |
| `PROVIDER_1_WEBHOOK` | `https://arcsla.vercel.app/api/auto-receipt` |
| `AGENT_WALLET_ADDRESS` | `0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6` |
| `AGENT_PRIVATE_KEY` | Private key of `0x22099051bbe59117Ebc5219bdDA90D7790758C03` |

## Deployment URLs
- App: `https://arcsla.vercel.app/app/`
- Landing: `https://arcsla.vercel.app`
- Netlify: `https://keen-lamington-f268c2.netlify.app`

## Backup Branches
- `backup/pre-app-redesign-20260924-2221`
- `backup/pre-komple-redesign-20260925-1305`
- `backup/pre-ux-overhaul-20260927`
