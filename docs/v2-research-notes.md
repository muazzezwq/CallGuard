# CallGuard v2 — Research Notes

*Notes from reviewing Circle Research's Refund Protocol (Apr 2025) and `circlefin/arc-escrow` sample app, for planning CallGuard v2 design choices.*

---

## Source

- **Blog post:** https://www.circle.com/blog/refund-protocol-non-custodial-dispute-resolution-for-stablecoin-payments
- **Smart contract repo:** https://github.com/circlefin/refund-protocol
- **Sample app repo:** https://github.com/circlefin/arc-escrow
- **Authors:** Alex Kroeger, Kaili Wang (Circle Research)
- **License:** Apache 2.0 (educational, unaudited)

---

## What Refund Protocol is

A smart contract that adds **non-custodial dispute resolution** to ERC-20 stablecoin payments. Solves the "stablecoins are like cash, no refunds" problem without introducing a trusted custodian.

The arbiter has three powers and only three:
1. Specify a lockup period during which recipient's funds are escrowed
2. Permit refunds to a pre-specified address (set by payer at payment time)
3. Allow early withdrawal of recipient funds for a mutually agreed fee

Critically: the arbiter **cannot** send funds to an address of their choosing. That's what makes it non-custodial.

---

## Why this matters for CallGuard

CallGuard and Refund Protocol solve different problems with adjacent primitives:

- **Refund Protocol:** Human-to-human commerce, dispute via arbiter
- **CallGuard:** Agent-to-agent SLA enforcement, dispute via automatic slash

But the underlying mechanics overlap. Several Refund Protocol design decisions directly improve CallGuard's design.

---

## Direct learnings for CallGuard v2

### 1. Pre-specified refund address — HIGH PRIORITY

**Current CallGuard:** When a slash happens, where does the stake go? Need to confirm by reading the contract. Likely back to caller or to protocol treasury.

**Refund Protocol pattern:** Payer specifies `refundTo` address at payment time:

```solidity
function pay(
    address to,
    uint256 amount,
    address refundTo
) external { ... }
```

**v2 idea:** Caller specifies refund address at call submission. Reasons:
- Transparency (everyone knows up front where slash proceeds go)
- Recovery scenarios (caller wallet compromised, refund goes elsewhere)
- Multi-account flows (agent calls on behalf of a user, refund goes to user)

**Effort:** Low. Adds one parameter to the call submission flow.

---

### 2. Lockup period before withdrawal — HIGH PRIORITY

**Current CallGuard:** On successful call honor, funds presumably release to provider immediately (or after the deadline check). No dispute window.

**Refund Protocol pattern:** After payment, funds sit in escrow for a lockup period. During this window:
- Recipient can NOT withdraw
- Payer can dispute
- Arbiter can refund

After lockup expires, recipient withdraws without anyone's permission.

**v2 idea:** Add a configurable lockup period (e.g. 24h) between call-honored and provider-withdraw. During this window:
- Caller can flag the call as "fraudulent" or "unsatisfactory"
- Optional arbiter (see #4) can mediate
- Default behavior: no dispute → provider withdraws after lockup

**Tradeoff:** Provider waits longer to access funds. Mitigated by #3 (early withdrawal).

**Effort:** Medium. Touches the receipt-redemption flow.

---

### 3. Early withdrawal with EIP-712 fee consent — HIGH PRIORITY

**Refund Protocol pattern:** If provider wants funds before lockup expires, they sign an EIP-712 message agreeing to a fee. Arbiter executes the early withdrawal on-chain after verifying signature.

```solidity
function earlyWithdrawByArbiter(
    uint256[] paymentIDs,
    uint256[] withdrawalAmounts,
    uint256 feeAmount,
    uint256 expiry,
    uint256 salt,
    address recipient,
    uint8 v, bytes32 r, bytes32 s
) onlyArbiter external { ... }
```

**v2 idea:** Provider can opt into early withdrawal by signing EIP-712 message. Fee goes to:
- Option A: Protocol treasury (funds ongoing development)
- Option B: A liquidity pool that backstops dispute periods
- Option C: Insurance pool for slashed-but-disputed cases

**Why this is good:** Solves the "provider waiting too long" objection to lockup. Fee is provider's choice, not imposed.

**Effort:** Medium. Requires EIP-712 setup (which we want anyway for v2). 

---

### 4. Optional arbiter (orchestrator) layer — MEDIUM PRIORITY

**Current CallGuard:** No arbiter. Dispute happens through automatic slash only. Either the deadline passes or it doesn't. Black and white.

**Refund Protocol pattern:** A non-custodial arbiter exists for nuanced cases — quality disputes, partial-fulfillment scenarios, etc.

**v2 consideration:** Should CallGuard add an optional arbiter for cases where automatic slash isn't enough?

Cases where slash is insufficient:
- Call timestamp ambiguity (network delay vs provider negligence)
- Partial fulfillment (provider returned 50% of expected output)
- Quality disputes (provider returned data, but wrong data)

**Tradeoff:** Arbiter introduces a third party. Even non-custodial, it's centralization risk. May undermine CallGuard's "trustless" pitch.

**Alternative:** Use Refund Protocol's mediator pattern as a separate optional module, not core to v1 CallGuard contracts. Builders who need dispute resolution opt into the module. Builders who want pure automation skip it.

**Effort:** High if integrated. Low if shipped as separate optional contract.

---

### 5. Debt mechanism for insufficient balance — LOW PRIORITY

**Refund Protocol pattern:** If a refund is owed but recipient has already withdrawn or doesn't have enough balance, the arbiter covers it from their own balance and registers a `debt` mapping. Future payments to that recipient are deducted to repay the debt.

**v2 consideration:** If a provider is slashed but has already withdrawn most of their stake, what happens? Right now they can't be slashed beyond their current stake.

**Could borrow from Refund Protocol:** Track "debt" owed by providers. Future calls' payments could be intercepted to repay accumulated debt. This makes the slash mechanism more robust against stake-withdrawal-then-misbehave patterns.

**Effort:** Medium. Adds storage and accounting. Worth considering for mainnet.

---

### 6. Yield on escrowed stake — LONG-TERM

**Refund Protocol blog mentions:** Escrow funds sitting idle are inefficient. Could be swept to Aave or similar for yield.

**v2 consideration:** Provider stakes are also idle. On mainnet, this is real opportunity cost. Could integrate yield-bearing wrapper (Aave aUSDC, Compound cUSDC).

**Risk:** Adds protocol dependency. Aave/Compound failure = stake loss. Need careful risk analysis.

**Effort:** High. Likely a v3 feature, not v2.

---

## Considerations Refund Protocol surfaces

The blog post itself lists open issues. Useful for hackathon submission to mention which ones CallGuard inherits/avoids:

| Refund Protocol issue | CallGuard v2 status |
|---|---|
| 1. Malicious arbiter making fake payments | N/A — no arbiter in v2 by default |
| 2. Refund address hard to specify in custodial wallet flows | Same risk — handle via DID/SBT binding (#3 of original v2 plan) |
| 3. Per-payment gas overhead | Same risk — consider batched receipts |
| 4. Idle escrow capital | Same opportunity — see #6 above |
| 5. EIP-1271 for contract wallets | Want to support from v2 day one (agents may be contract accounts) |

---

## CallGuard v2 — Revised priority list

Combining the original v2 plan with Refund Protocol learnings:

### Tier 1 — Must-have for v2
1. **EIP-712 typed signing** (original plan, reinforced by Refund Protocol use of EIP-712 for early withdrawal consent)
2. **Pre-specified refund address** (new, from Refund Protocol)
3. **Lockup period with optional early withdrawal** (new, from Refund Protocol)
4. **Stake-weighted reputation** (original plan, unchanged)

### Tier 2 — Should-have
5. **DID/SBT identity binding** (original plan)
6. **EIP-1271 support for contract wallets** (new — agents may be smart contract accounts)
7. **Multi-chain via CCTP** (original plan)

### Tier 3 — Nice-to-have / explore
8. **Optional arbiter module** (new, from Refund Protocol — separate contract, not core)
9. **Debt accounting for over-slashed providers** (new, from Refund Protocol)
10. **Yield-bearing stake wrapper** (long-term, v3 territory)

---

## Hackathon positioning

CallGuard submission to Track 4 (Agentic Economy) can credibly position itself relative to Refund Protocol:

> "Circle Research's Refund Protocol established the pattern for non-custodial dispute resolution in stablecoin payments. CallGuard extends this primitive to agent-to-agent commerce — where the counterparties are autonomous AI agents, the dispute mechanism is algorithmic (deadline-based slashing), and reputation accumulates on-chain via Bayesian scoring. Same trust philosophy, different domain."

This frames CallGuard as a **continuation of Circle's research thread**, not a clone. Strong positioning for judges who know the Refund Protocol work.

---

## Next steps

1. Read the actual `circlefin/refund-protocol` Solidity code to extract EIP-712 implementation details (next session)
2. Look at `arc-escrow` UI to see how Refund Protocol is consumed in practice
3. Update CallGuard v2 design doc with Tier 1 items
4. Sketch out the EIP-712 typed data structures for CallGuard receipts (combining current Receipt fields + lockup metadata)

---

# Part 2 — ERC-8004 and ERC-8183 Research

*Added May 11, 2026 after discovering Arc's official agent identity and job lifecycle standards. Strategic implications still under review.*

---

## Source

- **Arc Agentic Economy overview:** https://docs.arc.network/build/agentic-economy
- **Register your first AI agent (ERC-8004):** https://docs.arc.network/arc/tutorials/register-your-first-ai-agent
- **Create your first ERC-8183 job:** https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job
- **ERC-8004 spec:** https://eips.ethereum.org/EIPS/eip-8004
- **ERC-8183 spec:** https://eips.ethereum.org/EIPS/eip-8183

---

## What these standards are

Arc Network promotes two complementary EIPs as the official infrastructure for agent-based commerce on Arc:

### ERC-8004 — Trustless Agent Identity

Three registries:

| Contract | Address (Arc Testnet) | Role |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Mints NFT identity per agent |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Records feedback events from external observers |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | Two-step request/response validation flow |

Key design rules:
- Agent identity = ERC-721 NFT, not raw wallet address
- Reputation is recorded by **external validators**, not by the agent owner (prevents self-dealing)
- Validation flow: owner requests, validator responds (binary 100/0 or graded)
- Metadata is stored off-chain (IPFS), only URI is on-chain

### ERC-8183 — Programmable Job Contracts

Single contract on Arc Testnet:
- AgenticCommerce reference implementation: `0x0747EEf0706327138c69792bF28Cd525089e4583`

Job lifecycle: `Open → Funded → Submitted → Completed (or Rejected / Expired)`

Six core functions:
1. `createJob(provider, evaluator, expiredAt, description, hook)` — client creates a job
2. `setBudget(jobId, amount, optParams)` — provider sets the price
3. `fund(jobId, optParams)` — client approves and escrows USDC
4. `submit(jobId, deliverable, optParams)` — provider submits deliverable hash
5. `complete(jobId, reason, optParams)` — evaluator approves; USDC released to provider
6. `getJob(jobId)` — view job state

Key design rules:
- Per-job escrow (not per-provider stake)
- Evaluator role is explicit and separate from client (though may be the same address)
- Deliverable is just a `bytes32` hash; meaning is application-defined
- Optional `hook` address for extending behavior
- No automated enforcement — `complete` is a manual evaluator action

---

## CallGuard vs ERC-8004/8183 — direct comparison

| Aspect | CallGuard (v1, current) | ERC-8004 + ERC-8183 |
|---|---|---|
| Use case | High-frequency pay-per-call | Lower-frequency job-based commerce |
| Identity | Wallet address as identity | ERC-721 NFT identity |
| Reputation | Single Bayesian formula in registry | Separate ReputationRegistry, feedback events |
| Validation | Provider EIP-191 signature on receipt | Separate validator role; binary 100/0 response |
| Enforcement | Automatic slash on deadline miss | Manual evaluator `complete` or `reject` |
| Granularity | One service = ongoing endpoint with many calls | One job = one deliverable |
| Stake mechanism | Provider stakes USDC against SLA | Only escrow per job; no provider stake |
| Slash mechanism | Yes — automatic on timeout | No — only refund or release |
| Counterparty model | Service registry with multiple ongoing providers | Per-job parties (client, provider, evaluator) |
| Reputation farming defense | Bayesian smoothing | Validator separation (owners can't self-rep) |

---

## Critical observation — CallGuard fills a gap

ERC-8004/8183 explicitly **do not** cover:

- ❌ Provider stake / commitment mechanism
- ❌ Automatic SLA enforcement via deadline
- ❌ Sybil-resistant reputation backed by economic commitment
- ❌ Deadline-based slashing
- ❌ High-frequency pay-per-call patterns (job creation is heavyweight)

These are exactly what CallGuard provides. The two systems are **not competing — they are addressing different layers of the same problem**:

- ERC-8004/8183: identity, job lifecycle, manual evaluation
- CallGuard: stake-backed automatic enforcement, reputation built from outcomes, high-frequency calls

---

## Two strategic paths

### Strategy A — Integrate with ERC-8004/8183

Position CallGuard as an **enforcement layer** that sits on top of (or alongside) ERC-8004 and ERC-8183:

- Providers register their identity via ERC-8004 IdentityRegistry (NFT)
- CallGuard stake binding references the agent's ERC-8004 token ID (not just wallet address)
- Reputation events flow into both CallGuard's internal counters AND ERC-8004 ReputationRegistry
- For developers who want job semantics (single deliverable), CallGuard can integrate ERC-8183 escrow as the payment primitive
- For high-frequency pay-per-call, CallGuard's own PayPerCall remains the path

**Pros:**
- Composable with all existing Arc-native tooling
- Compatible with Arc team's strategic standards
- Strong hackathon positioning ("first SLA-enforcement layer on Arc that respects native standards")
- Provider NFTs are transferable, more flexible than address-based identity

**Cons:**
- More complex implementation
- Extra gas costs for NFT lookups
- Dependency on three external registries

### Strategy B — Remain independent

Position CallGuard as a **distinct primitive** that intentionally departs from ERC-8004/8183 because high-frequency pay-per-call has different requirements:

- Keep wallet-based identity (faster, cheaper)
- Keep internal reputation only
- Don't integrate ERC-8183 — different problem space

**Pros:**
- Simpler, faster, more focused
- No dependency on external registries
- Lower gas costs

**Cons:**
- Less composable with Arc-native tooling
- May appear "not invented here" to ecosystem developers
- Misses positioning opportunity

---

## Implementation gap — important constraint

If choosing Strategy A, several open questions remain:

1. **NFT-bound identity** — does CallGuard require providers to mint an ERC-8004 NFT before registering? Or is it optional?
2. **Reputation duality** — when a provider honors a call, should it emit feedback to ERC-8004 ReputationRegistry in addition to CallGuard's internal counter?
3. **Job vs call** — is a single CallGuard "call" the same as an ERC-8183 "job"? Or are calls a higher-frequency primitive that aggregates into jobs?
4. **Hook integration** — ERC-8183's `hook` parameter is meant for extending behavior. Could CallGuard's slash/stake logic be implemented as a hook contract, making CallGuard itself an ERC-8183 extension?

These are not 5-minute decisions. They require deliberate architectural review.

---

## Strategic implications for hackathon submission (Track 4)

Track 4 is "Best Agentic Economy Experience on Arc." Judges will almost certainly evaluate proposals against Arc's stated standards.

Two submission angles:

### Angle 1 — "CallGuard fills the gap ERC-8183 leaves"

Submission emphasizes:
- ERC-8183 is excellent for one-shot job commerce
- It does not address high-frequency call-by-call enforcement
- It does not provide stake-backed commitment
- CallGuard provides exactly this missing layer
- Includes a roadmap for ERC-8004 integration (NFT identity)

This positions CallGuard as **complementary, not competing**.

### Angle 2 — "CallGuard is independent infrastructure"

Submission emphasizes:
- High-frequency pay-per-call has unique requirements
- Automatic enforcement removes need for manual evaluation
- Bayesian on-chain reputation is composable
- Does not mention ERC-8004/8183 prominently

Riskier — appears to ignore Arc's stated standards.

**Recommendation:** Angle 1 is stronger. It shows technical maturity (understands the ecosystem) and contribution (adds what's missing).

---

## Open questions for evening strategy session

1. Should CallGuard v2 require ERC-8004 NFT identity, or keep it as opt-in?
2. Can CallGuard's PayPerCall be implemented as an ERC-8183 `hook` instead of a separate contract?
3. How should reputation events bridge between CallGuard's internal Bayesian formula and ERC-8004 ReputationRegistry feedback?
4. Is there a meaningful "CallGuard token ID = agent NFT" binding that creates value beyond a simple address mapping?
5. Does the v2 design document need full rewriting, or is it an addendum?

---

## Notes I want to remember

- The strategic decision is **not urgent**. CallGuard v1 is live, working, and valuable on its own merits.
- Arc's recommendation does not invalidate CallGuard — these standards do not duplicate CallGuard's value (stake, slash, reputation backed by economic commitment).
- The right move is to **integrate thoughtfully**, not to panic-rewrite.
- The 65-day hackathon timeline allows for proper integration work if Strategy A is chosen.
- I learned of ERC-8004/8183 only today. Most other builders are likely in the same position. Early movers benefit.

---

*Part 2 added May 11, 2026, after evening discussion. Strategy decision pending.*

---

## Strategic Decisions — May 11, 2026

After reviewing the ERC-8004 / ERC-8183 specs, the Refund Protocol source, and the Arc team's stated direction, the following architectural decisions were made for CallGuard v2:

### Decision 1 — ERC-8004 NFT Identity: Backwards-Compatible Hybrid

**Choice:** v1 providers (currently 9 on Arc Testnet) continue with wallet-based identity unchanged. v2 introduces a new `registerV2` function that requires ERC-8004 IdentityRegistry NFT ownership. Both paths coexist.

**Rationale:**
- Preserves existing v1 stakes and reputation history
- Does not force a forced-migration event that would risk losing existing providers
- New v2 providers get portable, ecosystem-composable identity via NFT
- Migration is opt-in — existing providers can optionally mint and re-register

**Implementation note:** New mapping `providerToTokenId` in ServiceRegistry v2. Registration validates `IERC721(ERC8004_REGISTRY).ownerOf(tokenId) == msg.sender`.

### Decision 2 — ERC-8183 Integration: Not for v2

**Choice:** CallGuard v2 remains an independent protocol. No integration with ERC-8183 AgenticCommerce.

**Rationale:**
- ERC-8183's `claimRefund` is deliberately not hookable — this prevents CallGuard's core slash logic from being implemented as a hook
- CallGuard addresses high-frequency pay-per-call; ERC-8183 addresses lower-frequency job-based commerce. Different problem spaces.
- Building two products (independent + hook variant) is not realistic in the 65-day hackathon window
- v3 may revisit if ERC-8183 spec evolves or if a separate CallGuard-SLAHook product becomes worthwhile

### Decision 3 — Reputation Writing: Internal Only

**Choice:** CallGuard does not write feedback to ERC-8004 ReputationRegistry. Bayesian scoring remains entirely within CallGuard's own ServiceRegistry.

**Rationale:**
- Gas overhead of cross-contract writes is significant for high-frequency pay-per-call (~15-25k extra gas per receipt)
- ERC-8004's validator-registration model adds authorization complexity
- Soru 1's NFT binding already provides ecosystem composability (any contract can query: "this NFT's CallGuard reputation is X")
- Future aggregator services can bridge CallGuard events → ERC-8004 ReputationRegistry without modifying contracts

### Decision 4 — Hackathon Submission Angle: Ecosystem Complement

**Choice:** Submission positions CallGuard as a **complementary** layer to Arc's stated standards, not an alternative.

**Submission framing:**
> "CallGuard addresses what ERC-8183 leaves uncovered: high-frequency pay-per-call SLA enforcement with stake-backed provider commitment, automatic deadline-based slashing, and sybil-resistant Bayesian reputation. v2 integrates ERC-8004 NFT identity for portable reputation. ERC-8183 and CallGuard target different commerce patterns — together they cover the agentic economy spectrum."

**Rationale:**
- Shows technical maturity (understands the ecosystem)
- Aligns with Architects-program-member positioning
- Backed by actual integration work (ERC-8004 NFT binding)
- Honest about why ERC-8183 integration was not pursued (architectural constraint: claimRefund not hookable)

---

## What these decisions mean for the v2 design document

The existing `docs/v2-design.md` was written before these decisions. It contains an outdated "DID/SBT Identity Binding" section that mentioned did:pkh / did:ethr / did:web as candidates.

`docs/v2-design.md` needs the following updates:

1. **Section 2.6 (DID/SBT Identity Binding)** → rename to "ERC-8004 NFT Identity Binding"; replace did:pkh research with ERC-8004 IdentityRegistry specification
2. **New Section 8 (Ecosystem Positioning)** → add the four decisions above as a formal architectural appendix
3. **Tier 2 listing** → replace "DID/SBT identity binding" with "ERC-8004 NFT identity binding"

These updates will be made next.

---

*Decisions captured May 11, 2026 evening, after a full day of research and discussion.*

*— Onur Akdemir | callguard.vercel.app | github.com/muazzezwq/callguard*
