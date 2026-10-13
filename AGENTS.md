# CallGuard — Project State (Arc Testnet, chain ID 5042002)

## Core Contracts — ACTIVE (v6 — Arc Studio deployer, 13 Oct 2026)
| Contract | Address | Explorer |
|---|---|---|
| `ServiceRegistry` (v6) | `0xdb73903c904f83251bc345e591a769e0a4ca32d9` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0xdb73903c904f83251bc345e591a769e0a4ca32d9) |
| `PayPerCall` (v6) | `0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a) |
| `ReputationLoan` (v3) | `0x9e0622828a03a578050e45ba2fde6b9140e676aa` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0x9e0622828a03a578050e45ba2fde6b9140e676aa) |
| `SLAFutures` (v3) | `0xcd57a9b924a565b12889277173b9ec06d4e10435` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0xcd57a9b924a565b12889277173b9ec06d4e10435) |
| `Subscription` (v2) | `0xc090ff2b856a5cc1bfe1137cf75ca566339f01db` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0xc090ff2b856a5cc1bfe1137cf75ca566339f01db) |
| `AgentWallet` (v2) | `0x6a7a41481e47a38bbe0236438c10e5ab8ca141e5` | [ArcScan ↗](https://explorer.testnet.arc.io/address/0x6a7a41481e47a38bbe0236438c10e5ab8ca141e5) |

> v6 includes: zkML Tier System, DePIN Oracle, ERC-4626 Stake Vault, StreamEscrow,
> Chainlink Price Feed, EIP-5564 Stealth Addresses, rate limiting, x402 Marketplace.
> Deployer wallet: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (Circle-managed, Arc Studio)

## ⚠️ Post-Deploy Wiring Required (run from your admin wallet)

```bash
# 1. Wire PayPerCall into ServiceRegistry (one-time, irreversible)
cast send 0xdb73903c904f83251bc345e591a769e0a4ca32d9 \
  "setPayPerCall(address)" 0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a \
  --private-key $ADMIN_PK --rpc-url https://rpc.testnet.arc.io

# 2. Wire ERC-8004 ReputationRegistry into PayPerCall (optional, best-effort)
cast send 0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a \
  "setReputationRegistry(address)" 0x8004B663056A597Dffe9eCcC1965A193B7388713 \
  --private-key $ADMIN_PK --rpc-url https://rpc.testnet.arc.io

# 3. Wire ERC-8183 AgenticCommerce into AgentWallet (optional)
cast send 0x6a7a41481e47a38bbe0236438c10e5ab8ca141e5 \
  "setAgenticCommerce(address)" 0x0747EEf0706327138c69792bF28Cd525089e4583 \
  --private-key $ADMIN_PK --rpc-url https://rpc.testnet.arc.io

# 4. DePIN Oracle — set your oracle bot address (optional)
# cast send 0xdb73903c904f83251bc345e591a769e0a4ca32d9 "setUptimeOracle(address)" $ORACLE_ADDR ...

# 5. Chainlink Price Feed for SLAFutures (optional, set when Arc Testnet feed available)
# cast send 0xcd57a9b924a565b12889277173b9ec06d4e10435 "setPriceFeed(address)" $CHAINLINK_FEED ...

# 6. EIP-5564 Stealth Announcer (optional)
# cast send 0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a "setStealthAnnouncer(address)" $ANNOUNCER ...
```

## Core Contracts — RETIRED (pre-v6, do not use)
| Contract | Address | Retired |
|---|---|---|
| `ServiceRegistry` (v5) | `0xc3ff2169ed44129b9fc06011a5a432f92ef2f0c4` | 13 Oct 2026 |
| `PayPerCall` (v5) | `0x389b44b7ad68c9e661a9ef2625f958840c31b601` | 13 Oct 2026 |
| `PayPerCall` (v6-standby) | `0xe901462b31f8a42262a2fc5ea3ee4f373cb75630` | 13 Oct 2026 |
| `DisputeQuality` (v2) | `0x7e2771df71c30307a95f038c93077d5350e7789d` | 13 Oct 2026 |
| `SLAFutures` (v2) | `0x19d03ff147816c97aad88f1275ad80855dcac9b2` | 13 Oct 2026 |
| `ReputationLoan` (v2) | `0x5a2f5455560ff9957db7fc208f9c819655c3a2d4` | 13 Oct 2026 |
| `PayPerCall` (v3) | `0x51bbd776d01bbb99b5425c701f00b2c516215e2e` | 7 Oct 2026 |
| `ServiceRegistry` (v3) | `0xea00f898C0eA249de7226b283e93C13eFa7BbcFF` | 7 Oct 2026 |

## Unchanged Contracts
| Contract | Address |
|---|---|
| `Dispute` | `0xa47162d8e4785d867f05800f35a334fd78575e56` |
| `CrossChainReceiver` (v2) | `0x760326de3cba39994dfd81d2b71b072c0265601c` |
| `SLAAttestationBridge` | `0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7` |

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
| `VITE_CLIENT_KEY` | Circle Console Client Key (`TEST_API_KEY:...`) — Passkey/Modular Wallets |
| `VITE_CLIENT_URL` | `https://modular-sdk.circle.com/v1/rpc/w3s/buidl` — Passkey/Modular Wallets |
| `GATEWAY_BATCH_URL` | Circle Gateway batching endpoint — nano-call dual-rail (optional) |
| `GATEWAY_BATCH_API_KEY` | Gateway batching API key (optional) |
| `UPTIME_ORACLE_PRIVATE_KEY` | DePIN oracle bot signing key (optional) |
| `CIRCLE_API_KEY` | Circle Standard Developer API Key — developer-controlled wallets / SCP (optional) |

## Deployment URLs
- App: `https://arcsla.vercel.app/app/`
- Landing: `https://arcsla.vercel.app`
- Netlify: `https://keen-lamington-f268c2.netlify.app`

## Backup Branches
- `backup/pre-app-redesign-20260924-2221`
- `backup/pre-komple-redesign-20260925-1305`
- `backup/pre-ux-overhaul-20260927`
