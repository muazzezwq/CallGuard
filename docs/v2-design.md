# CallGuard v2 — Design Document

**Version:** 0.1 (Draft)
**Date:** May 2026
**Author:** Onur Akdemir
**Status:** Design phase — implementation planned for Stablecoin Commerce Stack Challenge (Track 4: Agentic Economy)

---

## Overview

CallGuard is a trustless, on-chain marketplace where AI agents transact with each other under enforceable service-level agreements (SLAs). Providers stake USDC against their commitments. Callers pay per request. Missed deadlines slash the stake automatically. No arbiter, no custodian.

v1 is live on Arc Testnet:
- **ServiceRegistry:** `0x74635245CfF23a7F261CD5ECF72693cbc75481e4`
- **PayPerCall:** `0x28aa00Af89483218E6Bc036a72C4bAe8A1514BFE`
- **Frontend:** [callguard.vercel.app](https://callguard.vercel.app)
- **Repository:** [github.com/muazzezwq/callguard](https://github.com/muazzezwq/callguard)
- **Stats at time of writing:** 9 providers, 95+ on-chain calls, 1 automated slash. Submitted to Arc's Agentic Economy hackathon, ranked 1st in technical scoring.

v2 extends the protocol along four dimensions: security (EIP-712 typed signing), economic alignment (stake-weighted reputation, dispute lockups), identity (DID/SBT binding), and accessibility (multi-chain payment origination via CCTP).

---

## Motivation

The agentic economy thesis posits that within a few years, AI agents will conduct meaningful economic activity on behalf of users and businesses — purchasing inference, negotiating service contracts, managing recurring subscriptions, settling commerce. For this to happen reliably, agents need a settlement layer where:

1. Service commitments are **enforceable** without human mediation
2. Reputation is **portable and credible** across counterparties
3. Payments **finalize quickly** with predictable costs
4. The infrastructure is **chain-agnostic** at the user-facing layer

Arc's design (USDC as gas, sub-second finality, EVM compatibility) provides the underlying chain. CallGuard provides the protocol-level layer above it.

v2 sharpens this layer in response to a month of deployed-system learnings and a review of adjacent Circle Research work — particularly the [Refund Protocol](https://www.circle.com/blog/refund-protocol-non-custodial-dispute-resolution-for-stablecoin-payments) for non-custodial dispute resolution patterns.

---

## Design Goals

| Goal | Rationale |
|---|---|
| **Auditability** | Receipts and signatures must be machine-readable, replay-resistant, and verifiable on-chain |
| **Economic security** | Reputation must scale with stake at risk, not just call count |
| **Identity continuity** | Compromised keys should not destroy accumulated reputation |
| **Chain neutrality (caller side)** | Callers should not need to bridge to Arc before paying |
| **Composability** | v2 contracts should be readable by external protocols (other agents, escrow modules, reputation aggregators) |
| **Non-custodial** | The protocol never takes custody of funds beyond escrow and slash logic |

---

## Architecture (v2)

### 2.1 Core Contracts

```
ServiceRegistry          — provider registration, stake management, signer rotation
PayPerCall               — call lifecycle (submit, honor, slash, refund)
ReputationOracle         — Bayesian scoring (read by any contract on Arc)
ReceiptVerifier (new)    — EIP-712 typed signature verification
DisputeModule (optional) — opt-in arbiter pattern for nuanced cases
```

Contracts are deployed on Arc as the **enforcement layer**. Caller-side payments may originate from other CCTP-supported chains (Ethereum, Base, Polygon, Solana).

### 2.2 Lifecycle of a Call (v2)

```
1. Caller selects provider from registry
2. Caller submits CallRequest:
   - serviceId
   - paid (USDC amount, in 18-decimal units on Arc Testnet)
   - deadline (block.timestamp + max_response_time)
   - refundTo (where slash proceeds go — NEW in v2)
   - chain (if cross-chain, see §2.5)
3. PayPerCall escrows the payment
4. Provider performs work off-chain, signs a Receipt (EIP-712)
5. Caller submits Receipt to PayPerCall
6. PayPerCall:
   a. Verifies signature against provider's hot signing key
   b. Checks deadline
   c. On honor: payment enters lockup period (NEW in v2)
   d. On miss: stake slashes, refund sent to refundTo
7. After lockup expires (no dispute): provider withdraws
8. Provider may opt for early withdrawal with EIP-712 fee consent (NEW in v2)
```

### 2.3 EIP-712 Typed Signing (replacing EIP-191)

**Current state (v1):** Receipts signed via `keccak256(abi.encodePacked(...)).toEthSignedMessageHash()`. Provider sees a hex blob in their wallet. Domain ambiguity allows cross-chain replay risk.

**v2 design:** Structured signing under EIP-712 with explicit domain separation.

```solidity
// Domain
EIP712Domain({
    name: "CallGuard",
    version: "1",
    chainId: block.chainid,
    verifyingContract: address(this)
})

// Type
struct Receipt {
    address caller;
    bytes32 callId;
    bytes32 serviceId;
    uint256 deadline;
    uint256 paid;
    uint256 slashAmount;
}

bytes32 constant RECEIPT_TYPEHASH = keccak256(
    "Receipt(address caller,bytes32 callId,bytes32 serviceId,uint256 deadline,uint256 paid,uint256 slashAmount)"
);
```

Verification uses OpenZeppelin's `EIP712._hashTypedDataV4(...)` and `ECDSA.recover(...)`. Domain separator includes `chainId`, preventing replay across forks and bridges.

**Wallet UX improvement:** Signer sees field-by-field representation of the Receipt instead of an opaque hex string. This matters for AI-agent operators reviewing batch signatures and for auditors verifying historical receipts.

**Implementation:** Branch already open in repo. Estimated 4-6 hours of focused work.

### 2.4 Lockup Period and Early Withdrawal (new in v2)

Borrowed from Refund Protocol's design. When a call is honored:

- Payment enters a **lockup period** (default: 24h, configurable per service)
- Provider cannot withdraw during this window
- Caller may flag the call as disputed during this window (triggers DisputeModule if enabled)
- After lockup expires with no dispute: provider withdraws freely

**Why this matters:** Algorithmic SLA enforcement (deadline-based slash) handles the common case but is brittle in edge cases — network delays, partial fulfillment, ambiguous quality. Lockup gives a structured dispute window without making the protocol custodial.

**Early withdrawal:** Provider may withdraw before lockup expires by signing an EIP-712 message agreeing to a fee:

```solidity
struct EarlyWithdrawal {
    bytes32[] callIds;
    uint256 totalAmount;
    uint256 feeAmount;
    uint256 expiry;
    uint256 nonce;
}
```

Fee destination is configurable: protocol treasury, dispute insurance pool, or a stake-yield backstop.

### 2.5 Stake-Weighted Reputation

**Current state (v1):** Bayesian scoring with formula `(good + 2) / (total + 3) × 100`. All calls weighted equally. A provider staking 1 USDC and a provider staking 10,000 USDC earn reputation at identical rates per call.

**Problem:** Sybil-cheap reputation farming. Adversary spins up 100 providers with minimal stake, runs colluding calls between them, accumulates high reputation, then converts to a single high-rep provider.

**v2 design:** Each call's contribution to reputation is weighted by the stake at risk during that call.

```
reputation_contribution(call_i) = outcome(call_i) × log(1 + stake_at_call(call_i))
```

Stake is snapshotted at call submission, not read live. This prevents the "stake during call, withdraw immediately after" gaming pattern.

**Open question:** Time-of-call snapshots add storage cost (1 uint256 per call). Worth measuring gas impact before committing to the snapshot pattern vs reading current stake.

### 2.6 ERC-8004 NFT Identity Binding (backwards-compatible hybrid)

**Problem:** In v1, provider identity equals wallet address. A compromised key means losing 6+ months of accumulated reputation. Additionally, wallet-based identity is not portable — reputation cannot easily be referenced by other protocols on Arc.

**v2 design:** Adopts Arc's [ERC-8004 IdentityRegistry](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent) NFT-based identity model with backwards compatibility for existing v1 providers.

**Mechanism:**

- **v1 providers (currently 9 on Arc Testnet):** continue with wallet-based identity unchanged. The existing `register()` function remains operational.
- **v2 providers:** mint an ERC-8004 IdentityRegistry NFT first, then register via new `registerV2()` function that records the NFT `tokenId`.
- **Optional migration:** existing v1 providers may mint an NFT and re-register under v2 to gain ecosystem portability. Migration is opt-in, not forced.

**Implementation sketch:**

```solidity
// New mapping in ServiceRegistry v2
mapping(uint256 => uint256) public providerToTokenId; // providerId → ERC-8004 tokenId

// New registration function (v1's register() preserved)
function registerV2(
    uint256 erc8004TokenId,
    uint256 stake,
    uint256 maxResponseTime,
    uint256 slashPercent,
    address signer,
    string memory endpoint
) external returns (uint256 providerId) {
    // Verify caller owns the NFT
    require(
        IERC721(ERC8004_IDENTITY_REGISTRY).ownerOf(erc8004TokenId) == msg.sender,
        "Not NFT owner"
    );
    
    // Existing v1 registration logic continues
    // ...
    
    providerToTokenId[providerId] = erc8004TokenId;
}
```

**Identity continuity on key rotation:** A v2 provider can transfer the ERC-8004 NFT to a new wallet, then call a new `rotateOwner()` function to update `signer` and re-bind the providerId. Reputation history persists because providerId stays constant.

**Considerations:**
- ERC-8004 NFT ownership lookup adds ~5k gas per relevant operation. Acceptable for register/rotate flows; avoided in per-call hot paths.
- Reputation remains stored in CallGuard's ServiceRegistry (not written to ERC-8004 ReputationRegistry — see §8 Ecosystem Positioning).
- Identity binding is non-blocking: a provider whose ERC-8004 NFT becomes inaccessible can still operate via the existing v1 wallet path.

### 2.7 Multi-chain Payment Origination via CCTP

**Current state (v1):** Caller and provider must both hold USDC on Arc Testnet. Bridging required for callers on other chains. Friction kills agentic UX.

**v2 design:** Arc remains the **enforcement layer** (staking, slashing, reputation logic). Callers may originate payments from any CCTP-supported chain.

```
Caller chain (e.g. Base):
1. Caller signs CCTP burn intent for paid amount
2. Caller submits CallRequest to CallGuard on Arc with attestation pointer
3. CCTP attestation arrives on Arc, USDC mints to PayPerCall
4. Lifecycle proceeds as in §2.2

Provider chain (still Arc):
- Stake remains on Arc (slashing must be atomic with the enforcement layer)
- Provider receives payment in USDC on Arc; may bridge out via CCTP if desired
```

**Why Arc-only enforcement:** Slashing requires atomic state transitions on stake and reputation. Splitting this across chains introduces consistency problems (what if attestation is lost? what if the provider's chain has different finality semantics?). Keep the hard guarantees on one chain.

**Reference:** Circle's `arc-multichain-wallet` sample demonstrates the EIP-712 burn intent → Gateway attestation pattern. CallGuard's CCTP integration will mirror this approach.

### 2.8 Optional Dispute Module

Separate, opt-in contract. Not part of the core PayPerCall flow.

**Use case:** A service with subjective quality criteria (e.g. "agent must return code that compiles") cannot be enforced by deadline-based slash alone. A provider may technically respond on time but return garbage.

**Design:** Service operators can register their service with a `DisputeModule` address. During the lockup period, callers may flag the call. The DisputeModule's arbiter (a designated non-custodial address) may issue a refund.

The arbiter has **only one power**: forward escrowed funds to a pre-specified address (caller's `refundTo`). The arbiter cannot send funds elsewhere.

This pattern mirrors Refund Protocol's non-custodial arbiter.

**Trade-off:** Adds a trust assumption (the arbiter behaves honestly). Services that want pure trustlessness simply don't register a DisputeModule — the v1 deadline-slash flow continues to work.

---

## Priority and Implementation Order

### Tier 1 — Must ship for v2 release
1. **EIP-712 typed signing** (§2.3)
2. **Pre-specified `refundTo` address** (§2.2)
3. **Lockup period with early withdrawal** (§2.4)
4. **Stake-weighted reputation** (§2.5)

### Tier 2 — Should ship for v2
5. **ERC-8004 NFT identity binding** (§2.6) — backwards-compatible hybrid (v1 wallet-only preserved, v2 NFT required)
6. **Multi-chain via CCTP** (§2.7)
7. **EIP-1271 support for contract-wallet recipients** (agents may be smart contract accounts)

### Tier 3 — Explore for v2 or defer to v3
8. **Optional DisputeModule** (§2.8)
9. **Debt accounting** for slashed-but-already-withdrawn cases
10. **Yield-bearing stake wrapper** (Aave/Compound integration)

---

## Positioning Within the Circle Ecosystem

CallGuard is not a competitor to existing Circle primitives. It extends them.

| Circle Primitive | CallGuard Relationship |
|---|---|
| **USDC** | Underlying settlement asset |
| **CCTP** | Cross-chain caller-payment origination (v2) |
| **Circle Wallets** | Recommended onboarding path for non-crypto-native callers |
| **App Kit** | Caller-side integration layer (Bridge, Swap, Send, Unified Balance) |
| **Refund Protocol** | Sister protocol — same trust philosophy applied to human-to-human commerce; CallGuard applies it to agent-to-agent |
| **Smart Contract Platform** | Deployment and management tooling for CallGuard contracts |

The clearest framing: **Refund Protocol** addresses dispute resolution in stablecoin commerce between humans. **CallGuard** addresses SLA enforcement in stablecoin commerce between AI agents. Same trust philosophy, different counterparty model.

---

## Section 8 — Ecosystem Positioning (ERC-8004 and ERC-8183)

After reviewing Arc's [agentic economy documentation](https://docs.arc.network/build/agentic-economy), [ERC-8004 Identity Registry tutorial](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent), and [ERC-8183 job lifecycle tutorial](https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job), the following decisions clarify CallGuard's place in the Arc agentic economy stack.

### CallGuard vs Arc's standards — a clear positioning

Arc promotes two standards for agent-based commerce:

- **ERC-8004** — agent identity (IdentityRegistry), reputation (ReputationRegistry), and validation (ValidationRegistry)
- **ERC-8183** — programmable job contracts with deterministic lifecycle (open → funded → submitted → completed/rejected/expired)

CallGuard solves a problem these standards intentionally do not address: **high-frequency pay-per-call SLA enforcement with stake-backed commitment**.

ERC-8183 covers job-based commerce — one client, one provider, one deliverable, one evaluator decision. CallGuard covers per-call commerce — a provider committing capital against ongoing service availability, with thousands of calls per hour and deadline-based automatic enforcement.

These are different commerce patterns. Together they cover the agentic economy spectrum.

### What CallGuard v2 integrates

**ERC-8004 IdentityRegistry — yes, with backwards compatibility.** New v2 providers register via `registerV2()`, which requires ownership of an ERC-8004 IdentityRegistry NFT. The token ID is recorded in the provider record. Existing v1 providers continue with wallet-based identity; migration is opt-in. (See §2.6 for implementation.)

### What CallGuard v2 does not integrate

**ERC-8183 — no integration in v2.** ERC-8183's `claimRefund` function is explicitly not hookable in the spec ("claimRefund is deliberately not hookable so that refunds after expiry cannot be blocked"). This prevents CallGuard's core slash logic from being implemented as an ERC-8183 hook contract. A separate CallGuard-SLAHook product targeting ERC-8183 jobs may be explored in v3.

**ERC-8004 ReputationRegistry — no direct writes in v2.** Reputation events are not pushed from CallGuard to ERC-8004 ReputationRegistry for two reasons:
1. Gas overhead is significant for high-frequency pay-per-call (~15-25k extra gas per receipt write)
2. ERC-8004's validator-registration model adds authorization complexity that doesn't align with CallGuard's permissionless registration

Composability is preserved through the NFT identity binding: any contract on Arc can query `providerToTokenId(providerId)` to get the ERC-8004 NFT, then check CallGuard's `getReputationScore(providerId)` for the Bayesian score. Future aggregator services may bridge CallGuard reputation events to ERC-8004 ReputationRegistry without contract modification.

### Hackathon submission framing

For the Stablecoin Commerce Stack Challenge (Track 4 — Agentic Economy on Arc), CallGuard positions as a **complementary layer** within Arc's standards stack:

> CallGuard addresses what ERC-8183 leaves uncovered: high-frequency pay-per-call SLA enforcement with stake-backed provider commitment, automatic deadline-based slashing, and sybil-resistant Bayesian reputation. v2 integrates ERC-8004 NFT identity for portable reputation. ERC-8183 and CallGuard target different commerce patterns — together they cover the agentic economy spectrum.

This positions CallGuard as a builder that:
- Understands Arc's stated standards
- Respects them where they fit (ERC-8004 NFT for identity)
- Departs from them where architecture demands (ERC-8183 hook constraint)
- Adds genuine new primitive (stake-backed SLA enforcement)

---

## Open Questions

1. **Snapshot vs current-stake** for reputation weighting (§2.5). Need gas measurements before deciding.
2. **Default lockup duration.** 24h reasonable for most use cases, but high-frequency agent calls may want sub-hour. Configurable per service?
3. **DID method choice** (§2.6). `did:pkh` is current lean; need to validate ecosystem support.
4. **Fee destination for early withdrawal** (§2.4). Treasury vs insurance pool vs stake-yield backstop. Each has different long-term implications.
5. **EIP-1271 verification cost** (§2.6 / Tier 2). For contract-wallet providers, every receipt verification calls into an external contract. May materially impact gas if widespread.

Feedback on any of these welcome via [GitHub issues](https://github.com/muazzezwq/callguard/issues) or directly.

---

## References

1. Circle Research, "Refund Protocol: Non-Custodial Dispute Resolution for Stablecoin Payments," April 2025. [Link](https://www.circle.com/blog/refund-protocol-non-custodial-dispute-resolution-for-stablecoin-payments)
2. `circlefin/refund-protocol` — reference Solidity implementation. [Repo](https://github.com/circlefin/refund-protocol)
3. `circlefin/arc-escrow` — sample app showing Refund Protocol consumption pattern. [Repo](https://github.com/circlefin/arc-escrow)
4. `circlefin/arc-multichain-wallet` — CCTP burn-intent + Gateway pattern reference. [Repo](https://github.com/circlefin/arc-multichain-wallet)
5. EIP-712: Typed structured data hashing and signing. [Spec](https://eips.ethereum.org/EIPS/eip-712)
6. EIP-1271: Standard signature validation method for contracts. [Spec](https://eips.ethereum.org/EIPS/eip-1271)
7. Arc Network documentation. [Docs](https://docs.arc.network)

---

*Building solo from Adana, Turkey. Feedback and questions welcome.*

*— Onur Akdemir | [callguard.vercel.app](https://callguard.vercel.app) | [github.com/muazzezwq/callguard](https://github.com/muazzezwq/callguard) | [@EthOnr72414](https://x.com/EthOnr72414)*
