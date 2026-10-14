# SLA Marketplace — Technical Spec (Phase 1 MVP)

On Arc Testnet, service providers stake USDC to register, users pay per call, and SLA breaches trigger automatic slashing — a protocol.

**Chain:** Arc Testnet (chainId 5042002)
**Payment token:** USDC (`0x3600000000000000000000000000000000000000`, native gas + ERC-20 interface, 6 decimals)
**Language:** Solidity ^0.8.24
**Framework:** Foundry

---

## Phase 1 Scope

This phase consists of two contracts:

1. **`ServiceRegistry.sol`** — provider registration, stake management, SLA parameters
2. **`PayPerCall.sol`** — call escrow, signed receipt submission, timeout slash

Reputation and Agent Wallet are Phase 2/3. They will be derived entirely from on-chain events and are not written yet.

---

## SLA Breach Model

**Hybrid model:** signed receipt (cryptographic commitment) + timeout-based slash.

Flow:

1. User calls `callService()` → USDC locked in escrow, `CallStarted` event emitted
2. Provider makes off-chain API call, produces response
3. Provider creates ECDSA signature on `keccak256(callId, responseHash)`
4. Provider calls `submitReceipt(callId, responseHash, signature)` → escrow transferred to provider, receipt stored on-chain
5. If provider does not submit within `maxResponseTime` (seconds, specified in registry), user calls `claimTimeout(callId)` → escrow + stake's `slashAmount` returned to user

**What this model satisfies:**

- "Cryptographic receipt created on-chain" → step 4, ECDSA signature + responseHash stored on-chain
- "Timestamp, call details, and fee stored" → `Call` struct stores all of these
- "When service time expires and call fails, stake automatically transferred to user" → step 5
- "Transactions are fully on-chain, no intermediary required" → yes, no oracle, no arbiter

**What this model intentionally does NOT cover (by design):**

- Response *quality*. Provider could return garbage and still sign a receipt. Phase 1 only answers "was a response provided, and was it timely?" Quality control is Phase 2+ work (challenge period, reputation decrease, optimistic dispute).

---

## ServiceRegistry.sol

### State

```solidity
struct Provider {
    address owner;           // provider wallet
    address signer;          // address used to sign receipt (may differ from owner)
    uint256 stake;           // locked USDC amount (6 decimals)
    uint256 pricePerCall;    // USDC per call (6 decimals)
    uint32  maxResponseTime; // seconds
    uint32  slashBps;        // percentage of stake slashed on breach, basis points (0-10000)
    string  endpoint;        // off-chain API URL, for discovery only
    bool    active;          // false = stop accepting new calls (preparing to unstake)
}

mapping(uint256 => Provider) public providers;
mapping(address => uint256) public providerIdOf; // owner -> providerId, 0 = unregistered
uint256 public nextProviderId; // starts at 1
uint256 public minStake;       // minimum USDC stake for register
IERC20  public immutable usdc;
address public immutable payPerCall; // authorized slash caller
```

### Functions

```solidity
function register(
    address signer,
    uint256 stakeAmount,
    uint256 pricePerCall,
    uint32  maxResponseTime,
    uint32  slashBps,
    string  calldata endpoint
) external returns (uint256 providerId);
// Pulls stake via USDC transferFrom. slashBps <= 10000. maxResponseTime >= 5 sec.

function deactivate(uint256 providerId) external;
// Only owner. active = false, no new calls accepted. Unstake cooldown starts.

function unstake(uint256 providerId) external;
// Only owner. active must be false and since last CallCompleted/CallSlashed event,
// unstakeCooldown (e.g. 1 hour) must have elapsed. USDC transferred back.

function slash(uint256 providerId, uint256 amount, address recipient) external;
// Only payPerCall contract can call. Deducts amount from stake, transfers to recipient.

function updatePrice(uint256 providerId, uint256 newPrice) external;
function updateSigner(uint256 providerId, address newSigner) external;
// Only owner.
```

### Events

```solidity
event ProviderRegistered(uint256 indexed providerId, address indexed owner, address signer, uint256 stake, uint256 pricePerCall, uint32 maxResponseTime, string endpoint);
event ProviderDeactivated(uint256 indexed providerId);
event ProviderUnstaked(uint256 indexed providerId, uint256 amount);
event ProviderSlashed(uint256 indexed providerId, uint256 amount, address recipient);
event PriceUpdated(uint256 indexed providerId, uint256 newPrice);
event SignerUpdated(uint256 indexed providerId, address newSigner);
```

---

## PayPerCall.sol

### State

```solidity
enum CallStatus { None, Pending, Completed, Slashed }

struct Call {
    uint256 providerId;
    address caller;
    uint256 amount;         // USDC in escrow
    uint32  startedAt;      // block.timestamp
    uint32  deadline;       // startedAt + maxResponseTime
    bytes32 requestHash;    // hash of request payload (for off-chain verification)
    bytes32 responseHash;   // filled in submitReceipt
    CallStatus status;
}

mapping(bytes32 => Call) public calls; // callId => Call
ServiceRegistry public immutable registry;
IERC20 public immutable usdc;
```

### Functions

```solidity
function callService(
    uint256 providerId,
    bytes32 requestHash
) external returns (bytes32 callId);
// 1. providers[providerId].active must be true
// 2. Transfer USDC via transferFrom for pricePerCall
// 3. callId = keccak256(providerId, caller, nonce, block.timestamp, requestHash)
// 4. Store Call struct, status = Pending
// 5. Emit CallStarted

function submitReceipt(
    bytes32 callId,
    bytes32 responseHash,
    bytes calldata signature
) external;
// 1. calls[callId].status == Pending
// 2. block.timestamp <= deadline
// 3. digest = keccak256("\x19Ethereum Signed Message:\n32", keccak256(callId, responseHash))
// 4. ecrecover(digest, signature) == providers[providerId].signer
// 5. Store responseHash, status = Completed
// 6. Transfer escrow USDC to provider owner
// 7. Emit ReceiptSubmitted

function claimTimeout(bytes32 callId) external;
// 1. calls[callId].status == Pending
// 2. block.timestamp > deadline
// 3. status = Slashed
// 4. Transfer escrow USDC back to caller
// 5. Call registry.slash(providerId, stake * slashBps / 10000, caller)
// 6. Emit CallSlashed
```

### Events

```solidity
event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline);
event ReceiptSubmitted(bytes32 indexed callId, bytes32 responseHash);
event CallSlashed(bytes32 indexed callId, uint256 refunded, uint256 slashed);
```

---

## Security Considerations

Pay special attention to:

1. **Reentrancy.** `callService`, `submitReceipt`, `claimTimeout` — all involve USDC transfer. Use OpenZeppelin `ReentrancyGuard`.
2. **Checks-effects-interactions.** Update state (`status = Completed`) before transfer.
3. **Signature replay.** `callId` unique (nonce + timestamp + requestHash). Same signature cannot be used for another call because digest includes callId.
4. **Integer overflow.** 0.8.24 has built-in SafeMath, but enforce `slashBps` max 10000.
5. **Unstake front-running.** Provider cannot deactivate and unstake while having a pending call — cooldown + pending call check.
6. **USDC approval flow.** User must first call `usdc.approve(payPerCall, amount)`. Frontend manages this automatically.

---

## Arc Testnet Specific Notes

1. **USDC as native gas.** When user makes a call, they pay both `pricePerCall` and gas in USDC. UI "total cost" should show both line items.
2. **USDC ERC-20 interface 6 decimals** — native gas uses 18 decimals. Contracts should use only the ERC-20 interface, 6 decimals.
3. **Deterministic sub-second finality.** This gives us a reasonable lower bound for `maxResponseTime` — 5 seconds is comfortable on Arc.
4. **Explorer:** `https://testnet.arcscan.app/tx/{hash}` — demo HTML should show a link for each tx.

---

## Demo HTML Scope

Single file, ethers.js v6, Metamask connection. Buttons:

1. **Connect Wallet** — switch to Arc Testnet (add if needed)
2. **Register Provider** — form: stake, pricePerCall, maxResponseTime, slashBps, endpoint
3. **Call Service** — select providerId, enter requestHash (or auto-generate), USDC approve + callService
4. **Submit Receipt** — callId + responseHash, sign via wallet, submit to contract
5. **Claim Timeout** — enter callId, if deadline passed trigger slash
6. **Live event feed** — listen to `CallStarted`, `ReceiptSubmitted`, `CallSlashed` events, list them

The event feed is most important — to show jury/investor: "look, it's fully on-chain, no intermediary".

---

## Test Plan (Foundry)

`forge test` will run:

### Happy path
- `test_registerProvider_setsState`
- `test_callService_escrowsUSDC`
- `test_submitReceipt_transfersToProvider`
- `test_submitReceipt_withValidSignature`

### Timeout
- `test_claimTimeout_refundsCaller`
- `test_claimTimeout_slashesProvider`
- `test_claimTimeout_beforeDeadline_reverts`

### Security
- `test_submitReceipt_afterDeadline_reverts`
- `test_submitReceipt_invalidSignature_reverts`
- `test_submitReceipt_wrongSigner_reverts`
- `test_submitReceipt_twice_reverts`
- `test_claimTimeout_afterReceipt_reverts`
- `test_unstake_withPendingCall_reverts`
- `test_reentrancy_callService`

### Edge
- `test_slashBps_zero_onlyRefunds`
- `test_slashBps_max_fullSlash`
- `test_differentProviders_independentState`

---

## Folder Structure

```
sla-marketplace/
├── foundry.toml
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── ServiceRegistry.sol
│   ├── PayPerCall.sol
│   └── interfaces/
│       └── IServiceRegistry.sol
├── test/
│   ├── ServiceRegistry.t.sol
│   ├── PayPerCall.t.sol
│   └── helpers/
│       └── MockUSDC.sol
├── script/
│   └── Deploy.s.sol
└── demo/
    └── index.html
```

---

## Implementation Steps

1. Initialize Foundry project + import OpenZeppelin + configure Arc
2. `MockUSDC` (6-decimal ERC-20 for testing)
3. `ServiceRegistry.sol` + its tests
4. `PayPerCall.sol` + its tests
5. `Deploy.s.sol` script (deploy to Arc Testnet)
6. `demo/index.html`
7. Deploy, test with real USDC, show demo live

Pause after each step, run, confirm. I won't write all the way to step 7 — we'll go step by step.

---

