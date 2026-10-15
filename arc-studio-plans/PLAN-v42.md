# Implementation Plan: CallGuard — v4.2 (Remaining 8 Integrations)

## Summary

After the 6 integrations completed in previous sessions (rate limiting, Marketplace, Gateway, Refund Protocol, ERC-8004, ERC-8183), we are implementing the remaining 8 integrations. All are added without breaking the existing contract and test suite.

## Goals

| # | Integration | Layer | Priority |
|---|---|---|---|
| 7 | Circle Modular Wallets (passkey + paymaster) | Frontend + API | High |
| 8 | Gateway Unified Balance | API + Frontend | High |
| 9 | ERC-4626 Stake Vault (Aave Arc yield) | Contract | High |
| 10 | StreamEscrow (Subscription stream mode) | Contract | Medium |
| 11 | Chainlink Data Feeds (SLAFutures price oracle) | Contract | Medium |
| 12 | zkML Tier System (PayPerCall tier gating) | Contract | Medium |
| 13 | DePIN Oracle (ServiceRegistry uptime feed) | Contract | Low |
| 14 | EIP-5564 Stealth Addresses (CallService stealth) | Contract | Low |

---

## 7. Circle Modular Wallets

### Goal
Passkey-based (WebAuthn) authentication for `AgentWallet` plus gasless transaction support via the Circle Gas Station paymaster. A new "Passkey Wallet" option is added without touching the existing MetaMask/ConnectKit flow.

### Files

**To create:**
- `src/components/PasskeyWallet.tsx` — passkey registration / login / gasless callService flow
- `src/hooks/usePasskeyWallet.ts` — wrapper hook around `@circle-fin/modular-wallets-core`

**To modify:**
- `package.json` — add the `@circle-fin/modular-wallets-core` dependency
- `.env.example` — `VITE_CLIENT_KEY`, `VITE_CLIENT_URL` lines

### Implementation Note

```ts
// src/hooks/usePasskeyWallet.ts
import {
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, createWalletClient } from "viem";
import { arcTestnet } from "viem/chains"; // chain ID 5042002

const CLIENT_KEY  = import.meta.env.VITE_CLIENT_KEY;
const CLIENT_URL  = import.meta.env.VITE_CLIENT_URL; // https://modular-sdk.circle.com/v1/rpc/w3s/buidl

// Transport URL = CLIENT_URL + "/arcTestnet"
const modularTransport = toModularTransport(`${CLIENT_URL}/arcTestnet`, CLIENT_KEY);
const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY);

export async function registerPasskey(username: string) {
  const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Register, username });
  const account    = await toCircleSmartAccount({ client: createPublicClient({ transport: modularTransport }), credential });
  return { credential, account };
}

export async function loginPasskey() {
  const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login });
  const account    = await toCircleSmartAccount({ client: createPublicClient({ transport: modularTransport }), credential });
  return { credential, account };
}

// Gasless callService — paymaster: true → Circle Gas Station
export async function gaslessCallService(account, providerId: bigint, requestHash: `0x${string}`) {
  const walletClient = createWalletClient({ account, transport: modularTransport });
  return walletClient.sendUserOperation({
    account,
    calls: [{ to: PAY_PER_CALL_ADDR, abi: PayPerCallABI, functionName: "callService", args: [providerId, requestHash] }],
    paymaster: true, // Gas Station sponsorship
  });
}
```

### Prerequisite (user action)
1. [Circle Console](https://console.circle.com) → Keys → Client Keys → create a new key
2. Console → Passkey Domain → enter `igo0pyziy8t2gqihvahzj.preview.studio.arc.io`
3. Add `VITE_CLIENT_KEY=<key>` to the `.env` file

---

## 8. Gateway Unified Balance

### Goal
Let LPs and providers see and spend their USDC balances across all supported chains as a single balance.

### Files

**To create:**
- `api/unified-balance.js` — `GET /api/unified-balance?address=0x...` → per-chain breakdown + total
- `src/components/UnifiedBalance.tsx` — unified balance panel when the wallet is connected

**To modify:**
- `package.json` — add `@circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2`

### Implementation Note

```ts
// src/components/UnifiedBalance.tsx
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemProviderAdapter } from "@circle-fin/adapter-viem-v2";

const kit = new UnifiedBalanceKit();

async function fetchUnifiedBalance(walletClient) {
  const adapter  = createViemProviderAdapter(walletClient);
  const balances = await kit.getBalances({ depositor: walletClient.account.address });
  return balances; // { total, chains: [{ chain, balance }] }
}

async function depositToUnified(walletClient, amount: bigint) {
  const adapter = createViemProviderAdapter(walletClient);
  return kit.deposit({ adapter, chain: arcTestnet, amount, allowanceStrategy: "authorize" });
}
```

API endpoint:
```js
// api/unified-balance.js
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
export default async function handler(req, res) {
  const { address } = req.query;
  const kit = new UnifiedBalanceKit();
  const balances = await kit.getBalances({ depositor: address });
  return res.json({ ok: true, address, balances });
}
```

---

## 9. ERC-4626 Stake Vault (Aave Arc Yield)

### Goal
Route the idle LP liquidity pool in `ReputationLoan.sol` into an ERC-4626-compatible Aave Arc vault so LPs earn extra APY.

### Files

**To modify:**
- `contracts/ReputationLoan.sol`
  - import the `IERC4626Vault` interface
  - `yieldVault` state (address, set/clear via `setYieldVault` — onlyOwner)
  - `vaultShares` state
  - `deposit()` → call `usdc.approve + vault.deposit()` when the vault is active
  - `withdraw()` → call `vault.redeem()` when the vault is active
  - `borrow()` → pull liquidity via `vault.redeem()` when needed
  - `YieldVaultSet(address)`, `YieldDeposited(uint256)`, `YieldRedeemed(uint256)` events

### Solidity Design

```solidity
// contracts/ReputationLoan.sol — to add

interface IERC4626Vault {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function asset() external view returns (address);
}

// State:
IERC4626Vault public yieldVault;   // address(0) = disabled
uint256 public vaultShares;        // shares held in Aave Arc vault

// Events:
event YieldVaultSet(address indexed vault);
event YieldDeposited(uint256 assets, uint256 shares);
event YieldRedeemed(uint256 shares, uint256 assets);

// onlyOwner setter:
function setYieldVault(address vault) external onlyOwner {
    yieldVault = IERC4626Vault(vault);
    emit YieldVaultSet(vault);
}

// deposit() change — the LP's USDC goes to the vault:
// usdc.safeTransferFrom(msg.sender, address(this), amount);
// if (address(yieldVault) != address(0)) {
//     usdc.forceApprove(address(yieldVault), amount);
//     uint256 newShares = yieldVault.deposit(amount, address(this));
//     vaultShares += newShares;
//     emit YieldDeposited(amount, newShares);
// }
// totalShares += shares; totalAssets += amount;

// _ensureLiquidity() — redeem as much as needed from the vault before borrow/withdraw:
// function _ensureLiquidity(uint256 needed) internal {
//     uint256 directBalance = usdc.balanceOf(address(this));
//     if (directBalance >= needed || address(yieldVault) == address(0)) return;
//     uint256 deficit = needed - directBalance;
//     uint256 sharesToRedeem = /* previewRedeem ile hesapla */;
//     if (sharesToRedeem > vaultShares) sharesToRedeem = vaultShares;
//     uint256 redeemed = yieldVault.redeem(sharesToRedeem, address(this), address(this));
//     vaultShares -= sharesToRedeem;
//     emit YieldRedeemed(sharesToRedeem, redeemed);
// }
```

### Test
- `test/ReputationLoan.t.sol` → add a mock `IERC4626Vault`, `setYieldVault` + `deposit` + `withdraw` + `borrow` scenarios

---

## 10. StreamEscrow (Subscription.sol stream payment mode)

### Goal
In addition to the existing lump-sum payment model in `Subscription.sol`, a stream payment mode that releases linearly over time.

### Files

**To modify:**
- `contracts/Subscription.sol`
  - add `streamMode bool` and `streamReleased uint256` to the `Sub` struct
  - `subscribeStream(providerId, duration)` new function — hourly USDC stream lock
  - `claimStream(subId)` — release accrued USDC to the provider pro-rata for elapsed time
  - `StreamSubscribed`, `StreamClaimed` events

### Solidity Design

```solidity
// New function — stream mode:
function subscribeStream(uint256 providerId, uint64 duration) external nonReentrant returns (uint256 subId) {
    // existing provider-activity check...
    // pricePerSecond = pricePerCall / maxResponseTime (approx)
    // lockedBalance = pricePerSecond * duration
    // Sub { ..., streamMode: true, streamReleased: 0 }
    // emit StreamSubscribed(subId, msg.sender, providerId, duration)
}

function claimStream(uint256 subId) external nonReentrant {
    Sub storage s = subscriptions[subId];
    // require(streamMode); require(!cancelled)
    // elapsed = min(block.timestamp - startTime, duration)
    // claimable = (lockedBalance * elapsed / duration) - streamReleased
    // s.streamReleased += claimable
    // usdc.safeTransfer(providerOwner, claimable)
    // emit StreamClaimed(subId, claimable)
}
```

---

## 11. Chainlink Data Feeds (SLAFutures price oracle)

### Goal
In `SLAFutures.sol`, an option to auto-compute the slot price from the Chainlink USD/USDC price feed instead of setting it manually per provider.

### Files

**To modify:**
- `contracts/SLAFutures.sol`
  - minimal `IChainlinkAggregator` interface
  - `priceFeed` state (address, set via `setPriceFeed` — onlyOwner)
  - `mintCapacity()` → USD-based cap check via `latestRoundData()` when `priceFeed` is active
  - `PriceFeedSet(address)` event

### Chainlink Arc Testnet
- USDC/USD feed: `0x...` (Arc Testnet — Chainlink August 2026 announcement)
- Fallback: if the feed is `address(0)`, the existing manual price is kept

### Solidity Design

```solidity
interface IChainlinkAggregator {
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt,
        uint256 updatedAt, uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

// SLAFutures state:
IChainlinkAggregator public priceFeed;

function setPriceFeed(address feed) external onlyOwner {
    priceFeed = IChainlinkAggregator(feed);
    emit PriceFeedSet(feed);
}

// inside mintCapacity — slot price USD cap:
function _usdCapCheck(uint256 pricePerCall, uint256 totalSlots) internal view {
    if (address(priceFeed) == address(0)) return; // no feed, skip
    (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
    require(answer > 0 && block.timestamp - updatedAt < 3600, "stale feed");
    // answer = USD per USDC * 10^feedDecimals
    // totalUSD = pricePerCall * totalSlots * answer / 10^(feedDecimals + 6)
    // require(totalUSD <= MAX_BATCH_USD) // e.g. 1_000_000 = $1M cap
}
```

---

## 12. zkML Tier System (PayPerCall tier gating)

### Goal
Providers with a zkML proof get lower stake + higher limits. The ERC-7992 zkML standard is currently a draft — implemented as a simple on/off tier flag, to be upgraded to full ZK proofs later.

### Files

**To modify:**
- `contracts/ServiceRegistry.sol`
  - `zkTier mapping(uint256 => uint8)` — provider → tier (0=none, 1=basic, 2=full)
  - `setZkTier(providerId, tier)` — onlyOwner (zkML prover whitelist simulation)
  - reflect `zkTier` in the `getProvider()` view → add `uint8 zkTier` to `IServiceRegistry.ProviderView`
  - Tier 1: 50% minStake discount. Tier 2: `maxConcurrentCalls` x2.
  - `ZkTierSet(providerId, tier)` event

**To modify:**
- `contracts/interfaces/IServiceRegistry.sol` — add `uint8 zkTier` to `ProviderView`
- `contracts/PayPerCall.sol` — cap x2 for tier 2 inside `_callServiceFor`

### Test Updates
- `test/ServiceRegistry.t.sol` → `setZkTier` + tier 1/2 minStake tests
- `test/PayPerCall.t.sol` → tier 2 cap x2 test
- +1 field in all `ProviderView` struct destructurings

---

## 13. DePIN Oracle (ServiceRegistry uptime feed)

### Goal
Write provider uptime proofs from external DePIN networks (Cairn pattern) into `ServiceRegistry`. An off-chain oracle bot calls `recordUptime()` with a signed message.

### Files

**To modify:**
- `contracts/ServiceRegistry.sol`
  - `uptimeOracle address` state (set via `setUptimeOracle` — onlyOwner)
  - `lastUptimePing mapping(uint256 => uint64)` — last ping time
  - `uptimeScore mapping(uint256 => uint16)` — 0–10000 bps
  - `recordUptime(providerId, score, sig)` — oracle-signed uptime record
  - `UptimeRecorded(providerId, score)` event

**To create:**
- `api/notify-provider.js` → existing file; update as the uptime ping + oracle bot webhook

### EIP-712 Signature Design

```solidity
// UptimeClaim(uint256 providerId, uint16 score, uint64 timestamp)
bytes32 constant UPTIME_TYPEHASH = keccak256("UptimeClaim(uint256 providerId,uint16 score,uint64 timestamp)");

function recordUptime(uint256 providerId, uint16 score, uint64 timestamp, bytes calldata sig) external {
    require(timestamp >= block.timestamp - 5 minutes, "stale");
    bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(UPTIME_TYPEHASH, providerId, score, timestamp)));
    address signer = ECDSA.recover(digest, sig);
    require(signer == uptimeOracle, "bad sig");
    lastUptimePing[providerId] = uint64(block.timestamp);
    uptimeScore[providerId] = score;
    emit UptimeRecorded(providerId, score);
}
```

---

## 14. EIP-5564 Stealth Addresses (CallService stealth call)

### Goal
The EIP-5564 stealth address scheme for hiding the caller's identity. The caller generates a one-time stealth address; payment and callId are sent from that address.

### Files

**To create:**
- `contracts/interfaces/IEIP5564Announcer.sol` — minimal announcer interface
- `contracts/StealthCallGuard.sol` — stealth callService wrapper

**To modify:**
- `contracts/PayPerCall.sol`
  - `callServiceStealth(providerId, requestHash, stealthAddress, ephemeralPubKey, metadata)` new function
  - emit the EIP-5564 `Announce` event (delegated to the announcer contract)
  - `StealthAnnouncer` state (set via `setStealthAnnouncer` — onlyOwner)

### EIP-5564 Design

```solidity
interface IEIP5564Announcer {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );
    function announce(uint256 schemeId, address stealthAddress, bytes calldata ephemeralPubKey, bytes calldata metadata) external;
}

// PayPerCall new function:
function callServiceStealth(
    uint256 providerId,
    bytes32 requestHash,
    address stealthAddress,     // EIP-5564 one-time address
    bytes calldata ephemeralPubKey,
    bytes calldata metadata
) external nonReentrant returns (bytes32 callId) {
    callId = _callServiceFor(providerId, requestHash, stealthAddress);
    if (address(stealthAnnouncer) != address(0)) {
        stealthAnnouncer.announce(1, stealthAddress, ephemeralPubKey, metadata);
    }
}
```

---

## Build Order

1. **`IServiceRegistry.sol`** — add `uint8 zkTier` (creates the most dependencies)
2. **`ServiceRegistry.sol`** — zkML tier, DePIN oracle, uptime feed
3. **`ReputationLoan.sol`** — ERC-4626 vault integration
4. **`Subscription.sol`** — stream payment mode
5. **`SLAFutures.sol`** — Chainlink price oracle
6. **`PayPerCall.sol`** — zkML tier x2 cap, stealth callService
7. **`contracts/interfaces/IEIP5564Announcer.sol`** — new file
8. **All tests** — destructuring updates for new fields + new test cases
9. **`api/unified-balance.js`** — new file
10. **`api/notify-provider.js`** — DePIN oracle webhook update
11. **`src/components/PasskeyWallet.tsx`** — new component
12. **`src/components/UnifiedBalance.tsx`** — new component
13. **`src/hooks/usePasskeyWallet.ts`** — new hook
14. **`package.json`** — add `@circle-fin/modular-wallets-core`, `@circle-fin/unified-balance-kit`, `@circle-fin/adapter-viem-v2`
15. **`README.md`** — v4.2 section
16. **`git commit + push`**

---

## Done When

- [ ] `forge test` passes 229+ tests (including new test cases)
- [ ] `setZkTier(id, 2)` → `getProvider` returns `zkTier=2`; `PayPerCall` applies a 2x cap for tier 2
- [ ] `setYieldVault(addr)` → `deposit()` routes USDC into the vault
- [ ] `subscribeStream()` → `claimStream()` releases USDC linearly
- [ ] `setPriceFeed(addr)` → `mintCapacity()` performs the price cap check
- [ ] `recordUptime(providerId, score, sig)` verifies the oracle signature and updates `uptimeScore`
- [ ] `callServiceStealth()` delegates to the EIP-5564 announcer
- [ ] `GET /api/unified-balance?address=0x...` returns the unified balance
- [ ] `PasskeyWallet.tsx` passkey registration/login and gasless callService work
- [ ] TypeScript lint/check zero errors
- [ ] `git push` succeeds

---

## Prerequisites (user actions)

### For Circle Modular Wallets
1. [Circle Console](https://console.circle.com) → Keys → Client Keys → create a new key (starts with TEST_API_KEY)
2. Console → Passkey Settings → Passkey Domain: `igo0pyziy8t2gqihvahzj.preview.studio.arc.io`
3. Add to the `.env` file:
   ```
   VITE_CLIENT_KEY=TEST_API_KEY:...
   VITE_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl
   ```

### For the DePIN Oracle
- `UPTIME_ORACLE_PRIVATE_KEY` env variable — oracle bot wallet
- `setUptimeOracle(oracleAddress)` contract call after deploy

### For Chainlink
- Arc Testnet Chainlink USDC/USD feed address (August 2026 announcement — can be set later via `setPriceFeed`)
