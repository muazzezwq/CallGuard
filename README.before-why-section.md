# CallGuard

> 🏗️ Built by an [Arc Architects](https://www.arc.network) program member.

**Programmable payment and trust infrastructure for machine-to-machine services, built on Arc.**

CallGuard explores how programmable USDC payments and onchain verification can create more reliable interactions between autonomous services.

The system enables service providers and users to interact through transparent payment flows, verifiable execution, and reputation-based coordination.

Designed for the emerging agent economy, CallGuard focuses on AI agents, APIs, and digital services that need reliable ways to exchange value without unnecessary intermediaries.

Built on [Arc Testnet](https://www.arc.network), Circle's stablecoin-native L1 where USDC is the native gas token.

---

## Why this exists

**AI agents are becoming economic actors.** A planning agent calls a retrieval agent. A research agent calls a summarization agent. A trading agent calls a price-feed agent. Each of these interactions is a paid API call between two autonomous programs that have never met and have no reason to trust each other.

Today those calls happen through three bad options:

1. **Trust the provider.** Agent pays up-front, hopes for a response. Breaks at scale.
2. **Trust a custodian.** Both parties deposit into an escrow run by a third party. Adds latency, adds a new point of failure, adds a fee.
3. **Trust a DAO.** Disputes go to human arbitration. Too slow for machine-speed transactions.

CallGuard is the fourth option: **trust the code**.

A provider stakes USDC, commits to a max response time and slash percentage, and signs a cryptographic receipt when they fulfill a call. If they miss the deadline, anyone can trigger the slash. The contract transfers the escrow back to the caller plus a penalty from the provider's stake. All of this takes seconds on Arc.

The result is a permissionless marketplace where AI agents — or any program holding USDC — can buy API calls with automatic SLA enforcement and an on-chain reputation score.

---

## Built for AI agents

Here is a concrete scenario. Agent A is a research assistant running on a user's laptop. It needs to summarize a 200-page PDF. It doesn't have a summarization model locally, but there are dozens of providers offering this as a paid API.

**Without CallGuard:**

```
Agent A → "send me your best summarization provider"
        → tries provider X, sends document, waits
        → provider X keeps the money, ignores the request
        → Agent A has no recourse except blacklisting
```

**With CallGuard:**

```
Agent A → reads on-chain registry, picks provider by reputation + price
        → calls provider #42, escrows 0.10 USDC
        → provider has 30 seconds to return a signed receipt
        → if receipt arrives → provider gets paid, reputation up
        → if not → Agent A gets refund + 20% of provider's stake
```

Every step is a contract call. The agent needs no human supervision. The provider needs no billing system. The reputation score is a live `uint8` view on-chain, readable by any other contract — including a router that automatically picks the best provider for the next call.

### Why Arc specifically

AI-agent transactions have properties that traditional chains handle poorly:

- **They're frequent.** A single agent may make thousands of calls per hour. High fees kill the use case.
- **They're small.** A typical API call is worth 0.001–1 USDC. On Ethereum mainnet, the gas alone would exceed the call price.
- **They're USDC-denominated.** Agents carry USDC as working capital, not ETH. A chain that charges gas in a volatile token adds a second asset to manage.

Arc solves all three: [USDC is native gas](https://docs.arc.network/arc/concepts/welcome-to-arc), finality is sub-second, and fees are priced predictably in the same token the protocol charges in. A full call-and-receipt round trip costs ~0.017 USDC — less than a credit-card merchant fee.

---

## Live on Arc Testnet

**Try the live demo:** [**callguard.vercel.app**](https://callguard.vercel.app) — open in any modern browser with MetaMask.

### v5 contracts (current — July 2026 redeployment)

| Contract | Address |
| --- | --- |
| ServiceRegistry | [`0xea00f898C0eA249de7226b283e93C13eFa7BbcFF`](https://testnet.arcscan.app/address/0xea00f898C0eA249de7226b283e93C13eFa7BbcFF) |
| PayPerCall | [`0x10387347678d9f7106D5625bE0BD6C915158B130`](https://testnet.arcscan.app/address/0x10387347678d9f7106D5625bE0BD6C915158B130) |
| CrossChainReceiver | [`0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c`](https://testnet.arcscan.app/address/0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c) |
| AgenticCommerce (ERC-8183) | [`0x0747EEf0706327138c69792bF28Cd525089e4583`](https://testnet.arcscan.app/address/0x0747EEf0706327138c69792bF28Cd525089e4583) |
| USDC (native gas) | [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |
| EURC | [`0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`](https://testnet.arcscan.app/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a) |
| USYC | [`0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`](https://testnet.arcscan.app/address/0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C) |
| Band Oracle | [`0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68`](https://testnet.arcscan.app/address/0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68) |
| Memo | [`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`](https://testnet.arcscan.app/address/0x5294E9927c3306DcBaDb03fe70b92e01cCede505) |
| Multicall3From | [`0x522fAf9A91c41c443c66765030741e4AaCe147D0`](https://testnet.arcscan.app/address/0x522fAf9A91c41c443c66765030741e4AaCe147D0) |

Deployed July 2026. Frontend points here.

| Contract | Address |
| --- | --- |
| ServiceRegistry | [`0x0FbC2841d0d56a57C3967472DDCaef825a38de02`](https://testnet.arcscan.app/address/0x0FbC2841d0d56a57C3967472DDCaef825a38de02) |
| PayPerCall | [`0x1A64e531Dc7498931A658F14AD6801108F372ed8`](https://testnet.arcscan.app/address/0x1A64e531Dc7498931A658F14AD6801108F372ed8) |
| CrossChainReceiver | [`0x9dA167e0d99de5aE8651449eaebB44ceDFE96F04`](https://testnet.arcscan.app/address/0x9dA167e0d99de5aE8651449eaebB44ceDFE96F04) |
| RegisterWithNFT | [`0x8910495C2a876c7b59a175CAc09F823B688b0eEb`](https://testnet.arcscan.app/address/0x8910495C2a876c7b59a175CAc09F823B688b0eEb) |
| USDC (native gas) | [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |

Deployed May 2026. Frontend points here.

### v1 contracts (legacy — EIP-191 signing)

| Contract | Address |
| --- | --- |
| ServiceRegistry | [`0x74635245CfF23a7F261CD5ECF72693cbc75481e4`](https://testnet.arcscan.app/address/0x74635245CfF23a7F261CD5ECF72693cbc75481e4) |
| PayPerCall | [`0x28aa00Af89483218E6Bc036a72C4bAe8A1514BFE`](https://testnet.arcscan.app/address/0x28aa00Af89483218E6Bc036a72C4bAe8A1514BFE) |

Live since April 2026 with 9 active providers. Remains operational; new registrations are routed to v3.

---

## What's in the demo

The demo at [callguard.vercel.app](https://callguard.vercel.app) is a single-file dapp (ethers.js v6, no build step) that exposes every part of the protocol:

### On the landing page (no wallet required)

- **Live network stats** — registered providers, calls on chain, slashes enforced
- **Live activity feed** — streams recent `CallStarted`, `ReceiptSubmitted`, `CallSlashed`, `ProviderRegistered` events from Arc Testnet
- **Contract address bar** — all contract addresses with one-click links to ArcScan

### Inside the app (after connecting a wallet)

- **Register as provider** — stake USDC, set SLA terms, choose slash %
- **Register with NFT (v2)** — mint an ERC-8004 AgentIdentity NFT and register in one transaction via `RegisterWithNFT` helper
- **Multi-chain payments** — pay from Ethereum Sepolia, Base Sepolia, or Polygon Amoy via CCTP V2; Arc enforces the SLA
- **x402 live facilitator** — real HTTP 402 payment flow backed by a deployed facilitator; client signs an EIP-3009 authorization, the facilitator verifies it and settles `transferWithAuthorization` on Arc
- **Circle Gateway Nanopayments** — gasless 0.001 USDC micro-payments via Circle Gateway; no MetaMask prompt, no gas, no tx confirmation; facilitator handles payment server-side with batch on-chain settlement
- **ERC-8183 Jobs wizard** — 5-step job lifecycle (Create → Set Budget → Fund → Submit → Complete) with role badges (Client / Provider / Evaluator), progress rail, and auto-advance between steps
- **My Jobs list** — one-click list of all jobs where you are client or provider, pulled from Goldsky subgraph
- **Provider health check** — live 🟢/🔴 endpoint ping for each active provider via facilitator proxy
- **Multi-provider routing** — top-3 display sorted by reputation then price, with auto-call best provider
- **Multicall3From** — batch calls to multiple providers in a single tx using Arc's native batching contract; preserves msg.sender via CallFrom precompile
- **Arc Memo extension** — every x402 call attaches a human-readable on-chain memo via Arc's native Memo contract; visible on ArcScan for reconciliation
- **Post-quantum receipt signing** — every receipt carries a SLH-DSA-SHA2-128s signature (NIST FIPS 205), compatible with Arc's PQ precompile (0x1800..0004)
- **Band Protocol oracle** — live USDC/USD price feed from Band oracle on Arc; provider prices shown in USD alongside USDC
- **MCP server** — 6 tools for AI agents: list providers, leaderboard, health check, nanopay, network stats, Arc docs search
- **Analytics panel** — provider activity bars, honor rate, call volume from Goldsky subgraph
- **Provider modal analytics** — honor rate, call volume, activity bar inline in every provider modal
- **EURC + USYC balances** — header shows EURC and USYC balances alongside USDC
- **Arc Privacy Sector (APS)** — vision panel for private SLA calls; integration ready when APS precompile API is public
- **Goldsky subgraph v1.3.0** — Provider, Call, Job events indexed; real-time GraphQL queries
- **Submit receipt** — EIP-712 typed signing (structured fields in wallet)
- **Claim timeout** — auto-slash when provider misses deadline
- **Session budget cap** — spending limit for agent flows
- **Live activity feed** — real-time contract events including SLA calls, nanopayments, and job lifecycle events
- **Leaderboard** — top 10 providers by Bayesian reputation score with honor rate
- **Provider detail modal** — full stats, call history, honor rate, nanopay button, Goldsky analytics per provider

---

## x402 Integration

CallGuard implements the [x402 HTTP Payment Protocol](https://x402.org) as a composable layer on top of the existing pay-per-call flow.

**How it composes:**

```
x402  → answers "how does the agent pay?" (HTTP 402, Circle Gateway rail)
CallGuard → answers "what does the agent get for that payment?" (stake-backed SLA)
```

**Flow:**

```
1. Agent → GET /service (no payment)
2. Provider → 402 Payment Required + payment details
3. Agent → calls X402Middleware.executePayment() with USDC
4. Middleware → calls PayPerCall.callService() atomically
5. SLA clock starts on-chain
6. Provider delivers off-chain → submits EIP-712 receipt → gets paid
```

**Provider server:**

```bash
# Install dependencies
npm install

# Set env vars
PRIVATE_KEY=0x...
PROVIDER_ID=1
ARC_RPC_URL=https://rpc.testnet.arc.network

# Start x402 provider
npm run x402:provider
# → http://localhost:3000/service
```

**Test with curl:**

```bash
# Should return 402
curl http://localhost:3000/service

# Health check
curl http://localhost:3000/health
```

---

## CCTP Multi-chain

Callers on any supported chain can pay for CallGuard calls using USDC from their native chain. Circle CCTP V2 bridges the payment to Arc Testnet, where SLA enforcement happens.

**Supported source chains (testnet):**
- Ethereum Sepolia (domain 0)
- Base Sepolia (domain 6)
- Polygon Amoy (domain 7)

**Flow:**
```
depositForBurn() on source chain
    → Circle Iris attestation (~20-60s)
    → receiveMessage() on Arc
    → CrossChainReceiver.handleReceiveFinalizedTransfer()
    → callService() fires automatically
```

Caller never needs to touch Arc directly.

---

## How it works

```mermaid
%%{init: {'theme':'neutral'}}%%
sequenceDiagram
    autonumber
    actor Caller as Caller (AI Agent)
    participant USDC as USDC Token
    participant PPC as PayPerCall
    participant SR as ServiceRegistry
    actor Provider as Provider (AI Service)
    actor Anyone as Anyone

    rect rgb(180, 220, 180)
    Note over Caller,Provider: Honor path — SLA met

    Caller->>USDC: approve(PayPerCall, amount)
    Caller->>PPC: callService(providerId, requestHash)
    PPC->>USDC: transferFrom(Caller, PPC, amount)
    PPC->>SR: read provider info
    PPC-->>Caller: callId, CallStarted event

    Provider->>Provider: process request off-chain
    Provider->>Provider: sign Receipt (EIP-712)

    Provider->>PPC: submitReceipt(callId, hash, signature)
    PPC->>PPC: verify signature, check deadline
    PPC->>USDC: transfer(Provider, amount)
    PPC->>SR: incCompleted(providerId) — reputation up
    end

    rect rgb(245, 180, 180)
    Note over Caller,Anyone: Timeout path — SLA missed

    Anyone->>PPC: claimTimeout(callId)
    PPC->>PPC: verify deadline expired
    PPC->>USDC: transfer(Caller, escrowed amount)
    PPC->>SR: slash(providerId, slashAmount, Caller)
    PPC->>SR: incSlashed(providerId) — reputation down
    end
```

---

## Getting started

### Prerequisites

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Install and build

```bash
git clone https://github.com/muazzezwq/callguard
cd callguard
forge install
forge build
```

### Run tests

```bash
forge test -vv
```

Expected: **66 tests passed, 0 failed.**

### Try the demo

Open [callguard.vercel.app](https://callguard.vercel.app) with MetaMask — Arc Testnet will be added automatically.

Or run locally:

```bash
cd demo
python3 -m http.server 8080
```

### Deploy your own copy

```bash
cp .env.example .env
# Fill USDC_ADDRESS (0x3600...0000 on Arc Testnet)

cast wallet import deployer --interactive

forge script script/Deploy.s.sol:Deploy \
  --account deployer \
  --sender 0xYOUR_DEPLOYER \
  --rpc-url arc_testnet \
  --broadcast
```

See [`DEPLOY.md`](./DEPLOY.md) for the full walkthrough.

---

## Solidity example

```solidity
// 1. Agent approves USDC
usdc.approve(payPerCall, 1e6);

// 2. Agent opens the call
bytes32 requestHash = keccak256(abi.encode("summarize this document"));
bytes32 callId = payPerCall.callService(1, requestHash);

// 3. Provider delivers the response off-chain, signs EIP-712 receipt
bytes32 responseHash = keccak256(responseBytes);
bytes memory signature = providerSigner.signTypedData(domain, types, value);

// 4. Provider submits the receipt on-chain — escrow released, reputation bumped
payPerCall.submitReceipt(callId, responseHash, signature);

// 5. Or, if 30 seconds passed without a receipt:
payPerCall.claimTimeout(callId);
// → escrow refunded + stake slashed + reputation decreased
```

---

## Project layout

```
callguard/
├── src/
│   ├── ServiceRegistry.sol          # provider registry, stake, ERC-8004 NFT binding, Bayesian reputation
│   ├── PayPerCall.sol               # call escrow, EIP-712 receipt verification, timeout enforcement
│   ├── CrossChainReceiver.sol       # CCTP V2 receiver — bridges multi-chain USDC to callService()
│   ├── RegisterWithNFT.sol          # helper: mint ERC-8004 NFT + registerV2() in one tx
│   ├── X402Middleware.sol           # x402 payment middleware — bridges HTTP 402 payments to callService()
│   └── interfaces/
│       ├── IServiceRegistry.sol
│       └── IPayPerCall.sol
├── test/
│   ├── ServiceRegistry.t.sol        # 57 unit tests (v1 + v2 + ERC-8004 NFT)
│   ├── PayPerCall.t.sol             # 9 unit tests
│   └── helpers/
│       └── MockUSDC.sol
├── script/
│   └── Deploy.s.sol                 # deploys ServiceRegistry + PayPerCall + CrossChainReceiver
├── scripts/
│   ├── x402-provider.js             # Node.js x402 provider server (Express + ethers v6)
│   └── bridge-and-call.ts           # CCTP bridge helper script
├── demo/
│   └── index.html                   # single-file dapp (ethers.js v6, no build step)
├── docs/
│   └── v2-design.md
├── SPEC.md
├── ARCHITECTURE.md
├── SECURITY.md
├── DEPLOY.md
└── README.md
```

---

## Known limitations

- **CCTP attestation takes 1-4 minutes.** Sepolia requires ~12-19 block confirmations before Circle Iris issues an attestation. The demo polls for up to 5 minutes.
- **x402 full integration live.** The "Call via x402" button performs a real HTTP 402 handshake, the user signs an EIP-3009 `TransferWithAuthorization` off-chain (no gas), and the facilitator (`x402-facilitator/`, hosted at callguard.onrender.com) calls `callServiceWithAuthorization()` on-chain — USDC goes straight into SLA escrow in a single transaction. The payer signs; the facilitator pays gas.
- **Event scan window is 100,000 blocks.** Very old calls won't appear in the "Calls" stat. A proper indexer is planned.

---

## Roadmap

### ✅ Completed

- **EIP-712 typed signing** — structured receipt previews in wallet
- **ERC-8004 NFT identity binding** — `registerV2()` requires AgentIdentity NFT; `RegisterWithNFT` helper mints NFT + registers in one tx
- **CCTP multi-chain payments** — Ethereum/Base/Polygon → Arc via Circle CCTP V2
- **x402 HTTP payment protocol** — full EIP-3009 authorization flow via Frankfurt facilitator
- **Circle Gateway Nanopayments** — gasless micro-payments, server-side EIP-3009, Circle batch settlement
- **ERC-8183 Jobs** — full lifecycle wizard (Create → Set Budget → Fund → Submit → Complete)
- **My Jobs list** — Goldsky subgraph event-sourced job history per wallet
- **Provider endpoint health check** — live ping via facilitator proxy
- **Multi-provider routing** — top-3 ranked by reputation + price, auto-call
- **Multicall3From** — Arc native batch calls in single tx, msg.sender preserved via CallFrom precompile
- **Arc Memo extension** — on-chain human-readable memo on every x402 call via Arc's native Memo contract
- **Post-quantum receipt signing** — SLH-DSA-SHA2-128s (NIST FIPS 205), Arc PQ precompile compatible
- **Band Protocol oracle** — live USDC/USD price feed; provider prices shown in USD
- **MCP server** — 6 tools for AI agents; local stdio + remote SSE; arc_docs_search tool
- **Goldsky subgraph v1.3.0** — Provider, Call, Job events indexed; real-time GraphQL
- **Analytics panel** — provider activity bars, honor rate, call volume from Goldsky
- **EURC + USYC balances** — header shows all Arc ecosystem token balances
- **Arc Privacy Sector (APS) panel** — vision for private SLA calls
- **Activity feed** — SLA calls, nanopayments, and job events all in one stream
- **Bayesian on-chain reputation** — `(completed + 2) / (total + 3) × 100`
- **Auto-router** — picks best provider by reputation + price filters
- **Session budget cap** — spending limit for agent flows
- **66/66 Foundry tests**

### Planned

- APS private SLA calls — when Arc Privacy Sector precompile API is public
- EIP-1271 support (contract-wallet callers)
- Optional DisputeModule for subjective-quality services
- Mainnet deployment once Arc Mainnet is live
- Reputation-weighted routing contract
- Railway facilitator migration

---

## Resources

### Arc & Circle

- [Arc Network](https://www.arc.network/) — project homepage
- [Arc documentation](https://docs.arc.network/arc/concepts/welcome-to-arc) — concepts, architecture, guides
- [Circle Developers](https://developers.circle.com/) — SDKs, CCTP, Gateway, Paymaster
- [Circle Console](https://console.circle.com/signin) — API keys, testnet dashboards

### Testnet tools

- [Arc Testnet Faucet](https://faucet.circle.com/) — free testnet USDC (also serves as gas)
- [ArcScan Testnet](https://testnet.arcscan.app/) — block explorer
- [thirdweb Arc Testnet](https://thirdweb.com/arc-testnet) — chain config, contract explorer

### Project documents

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — design decisions and rationale
- [`SECURITY.md`](./SECURITY.md) — threat model and known trade-offs
- [`DEPLOY.md`](./DEPLOY.md) — step-by-step deployment guide
- [`SPEC.md`](./SPEC.md) — original technical specification

---

## License

MIT. Not affiliated with Circle, Arc, or any project mentioned above. Built independently for the Arc Architects community.
