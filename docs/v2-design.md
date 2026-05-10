# ArcSLA v2 — Design Document

**Version:** 0.1 (Draft)
**Date:** May 2026
**Author:** Onur Akdemir
**Status:** Design phase — implementation planned for Stablecoin Commerce Stack Challenge (Track 4: Agentic Economy)

---

## Overview

ArcSLA is a trustless, on-chain marketplace where AI agents transact with each other under enforceable service-level agreements (SLAs). Providers stake USDC against their commitments. Callers pay per request. Missed deadlines slash the stake automatically. No arbiter, no custodian.

v1 is live on Arc Testnet:
- **ServiceRegistry:** `0x74635245CfF23a7F261CD5ECF72693cbc75481e4`
- **PayPerCall:** `0x28aa00Af89483218E6Bc036a72C4bAe8A1514BFE`
- **Frontend:** [arcsla.vercel.app](https://arcsla.vercel.app)
- **Repository:** [github.com/muazzezwq/arcsla](https://github.com/muazzezwq/arcsla)
- **Stats at time of writing:** 9 providers, 95+ on-chain calls, 1 automated slash. Submitted to Arc's Agentic Economy hackathon, ranked 1st in technical scoring.

v2 extends the protocol along four dimensions: security (EIP-712 typed signing), economic alignment (stake-weighted reputation, dispute lockups), identity (DID/SBT binding), and accessibility (multi-chain payment origination via CCTP).

---

## Motivation

The agentic economy thesis posits that within a few years, AI agents will conduct meaningful economic activity on behalf of users and businesses — purchasing inference, negotiating service contracts, managing recurring subscriptions, settling commerce. For this to happen reliably, agents need a settlement layer where:

1. Service commitments are **enforceable** without human mediation
2. Reputation is **portable and credible** across counterparties
3. Payments **finalize quickly** with predictable costs
4. The infrastructure is **chain-agnostic** at the user-facing layer

Arc's design (USDC as gas, sub-second finality, EVM compatibility) provides the underlying chain. ArcSLA provides the protocol-level layer above it.

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
    name: "ArcSLA",
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

### 2.6 DID/SBT Identity Binding (optional)

**Problem:** In v1, provider identity equals wallet address. A 6-month reputation history is destroyed by a single phishing attack. This is brittle for any provider operating real services.

**v2 design:** Providers may **optionally** bind their address to a Decentralized Identifier (DID) or a Soulbound Token (SBT). On key compromise:

1. Provider rotates the hot signing key via existing v1 mechanism (cold key controls registration)
2. Provider proves continuity by re-binding to the same DID/SBT
3. Reputation persists across the rotation

**Methods under consideration:**
- `did:ethr` — well-supported, but Ethereum-centric
- `did:pkh` — chain-agnostic, simpler resolution
- `did:web` — off-chain anchor, fastest to integrate, weakest decentralization guarantees

Likely default: `did:pkh` with a fallback to address-only for providers who don't want the dependency.

**Considerations:** DID resolution should not become a runtime dependency for core flows (call honor, slash). Identity binding is queryable but not blocking.

### 2.7 Multi-chain Payment Origination via CCTP

**Current state (v1):** Caller and provider must both hold USDC on Arc Testnet. Bridging required for callers on other chains. Friction kills agentic UX.

**v2 design:** Arc remains the **enforcement layer** (staking, slashing, reputation logic). Callers may originate payments from any CCTP-supported chain.

```
Caller chain (e.g. Base):
1. Caller signs CCTP burn intent for paid amount
2. Caller submits CallRequest to ArcSLA on Arc with attestation pointer
3. CCTP attestation arrives on Arc, USDC mints to PayPerCall
4. Lifecycle proceeds as in §2.2

Provider chain (still Arc):
- Stake remains on Arc (slashing must be atomic with the enforcement layer)
- Provider receives payment in USDC on Arc; may bridge out via CCTP if desired
```

**Why Arc-only enforcement:** Slashing requires atomic state transitions on stake and reputation. Splitting this across chains introduces consistency problems (what if attestation is lost? what if the provider's chain has different finality semantics?). Keep the hard guarantees on one chain.

**Reference:** Circle's `arc-multichain-wallet` sample demonstrates the EIP-712 burn intent → Gateway attestation pattern. ArcSLA's CCTP integration will mirror this approach.

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
5. **DID/SBT identity binding** (§2.6)
6. **Multi-chain via CCTP** (§2.7)
7. **EIP-1271 support for contract-wallet recipients** (agents may be smart contract accounts)

### Tier 3 — Explore for v2 or defer to v3
8. **Optional DisputeModule** (§2.8)
9. **Debt accounting** for slashed-but-already-withdrawn cases
10. **Yield-bearing stake wrapper** (Aave/Compound integration)

---

## Positioning Within the Circle Ecosystem

ArcSLA is not a competitor to existing Circle primitives. It extends them.

| Circle Primitive | ArcSLA Relationship |
|---|---|
| **USDC** | Underlying settlement asset |
| **CCTP** | Cross-chain caller-payment origination (v2) |
| **Circle Wallets** | Recommended onboarding path for non-crypto-native callers |
| **App Kit** | Caller-side integration layer (Bridge, Swap, Send, Unified Balance) |
| **Refund Protocol** | Sister protocol — same trust philosophy applied to human-to-human commerce; ArcSLA applies it to agent-to-agent |
| **Smart Contract Platform** | Deployment and management tooling for ArcSLA contracts |

The clearest framing: **Refund Protocol** addresses dispute resolution in stablecoin commerce between humans. **ArcSLA** addresses SLA enforcement in stablecoin commerce between AI agents. Same trust philosophy, different counterparty model.

---

## Open Questions

1. **Snapshot vs current-stake** for reputation weighting (§2.5). Need gas measurements before deciding.
2. **Default lockup duration.** 24h reasonable for most use cases, but high-frequency agent calls may want sub-hour. Configurable per service?
3. **DID method choice** (§2.6). `did:pkh` is current lean; need to validate ecosystem support.
4. **Fee destination for early withdrawal** (§2.4). Treasury vs insurance pool vs stake-yield backstop. Each has different long-term implications.
5. **EIP-1271 verification cost** (§2.6 / Tier 2). For contract-wallet providers, every receipt verification calls into an external contract. May materially impact gas if widespread.

Feedback on any of these welcome via [GitHub issues](https://github.com/muazzezwq/arcsla/issues) or directly.

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

*— Onur Akdemir | [arcsla.vercel.app](https://arcsla.vercel.app) | [github.com/muazzezwq/arcsla](https://github.com/muazzezwq/arcsla) | [@EthOnr72414](https://x.com/EthOnr72414)*
