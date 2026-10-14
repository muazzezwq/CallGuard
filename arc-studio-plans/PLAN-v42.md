# Implementation Plan: CallGuard — v4.2 (Kalan 8 Entegrasyon)

## Ozet

Onceki oturumlarda tamamlanan 6 entegrasyonun (rate limiting, Marketplace, Gateway, Refund Protocol, ERC-8004, ERC-8183) ardindan kalan 8 entegrasyonu uyguluyoruz. Hepsi mevcut kontrat ve test suite'ini kirmadan ekleniyor.

## Hedefler

| # | Entegrasyon | Katman | Oncelik |
|---|---|---|---|
| 7 | Circle Modular Wallets (passkey + paymaster) | Frontend + API | Yuksek |
| 8 | Gateway Unified Balance | API + Frontend | Yuksek |
| 9 | ERC-4626 Stake Vault (Aave Arc yield) | Kontrat | Yuksek |
| 10 | StreamEscrow (Subscription stream modu) | Kontrat | Orta |
| 11 | Chainlink Data Feeds (SLAFutures fiyat oracle) | Kontrat | Orta |
| 12 | zkML Tier System (PayPerCall tier gating) | Kontrat | Orta |
| 13 | DePIN Oracle (ServiceRegistry uptime feed) | Kontrat | Dusuk |
| 14 | EIP-5564 Stealth Addresses (CallService stealth) | Kontrat | Dusuk |

---

## 7. Circle Modular Wallets

### Amac
`AgentWallet` icin passkey tabanli (WebAuthn) kimlik dogrulama ve Circle Gas Station paymaster ile gasless islem destegi. Mevcut MetaMask/ConnectKit akisina dokunmadan yeni bir "Passkey Wallet" secenegi eklenir.

### Dosyalar

**Olusturulacak:**
- `src/components/PasskeyWallet.tsx` — passkey kayit / giris / gasless callService akisi
- `src/hooks/usePasskeyWallet.ts` — `@circle-fin/modular-wallets-core` sarmalayici hook

**Degistirilecek:**
- `package.json` — `@circle-fin/modular-wallets-core` bagimliligi ekle
- `.env.example` — `VITE_CLIENT_KEY`, `VITE_CLIENT_URL` satirlari

### Uygulama Notu

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

### On Kosul (kullanici yapacak)
1. [Circle Console](https://console.circle.com) → Keys → Client Keys → yeni key olustur
2. Console → Passkey Domain → `igo0pyziy8t2gqihvahzj.preview.studio.arc.io` gir
3. `.env` dosyasina `VITE_CLIENT_KEY=<key>` ekle

---

## 8. Gateway Unified Balance

### Amac
LP'lerin ve provider'larin USDC bakiyelerini tum desteklenen zincirler uzerinde tek bir bakiye olarak gormesi ve harcamasi.

### Dosyalar

**Olusturulacak:**
- `api/unified-balance.js` — `GET /api/unified-balance?address=0x...` → per-chain breakdown + toplam
- `src/components/UnifiedBalance.tsx` — wallet baglandiginda unified bakiye paneli

**Degistirilecek:**
- `package.json` — `@circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2` ekle

### Uygulama Notu

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

### Amac
`ReputationLoan.sol`'daki atil LP likidite havuzunu ERC-4626 uyumlu Aave Arc vault'una yonlendirerek LP'lerin ek APY kazanmasi.

### Dosyalar

**Degistirilecek:**
- `contracts/ReputationLoan.sol`
  - `IERC4626Vault` arayuzu import
  - `yieldVault` state (address, set/clear via `setYieldVault` — onlyOwner)
  - `vaultShares` state
  - `deposit()` → vault aktifse `usdc.approve + vault.deposit()` cagrisi
  - `withdraw()` → vault aktifse `vault.redeem()` cagrisi
  - `borrow()` → gerektiginde `vault.redeem()` ile likidite cek
  - `YieldVaultSet(address)`, `YieldDeposited(uint256)`, `YieldRedeemed(uint256)` eventleri

### Solidity Tasarimi

```solidity
// contracts/ReputationLoan.sol — eklenecekler

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

// deposit() degisikligi — LP'nin USDC'si vault'a gidiyor:
// usdc.safeTransferFrom(msg.sender, address(this), amount);
// if (address(yieldVault) != address(0)) {
//     usdc.forceApprove(address(yieldVault), amount);
//     uint256 newShares = yieldVault.deposit(amount, address(this));
//     vaultShares += newShares;
//     emit YieldDeposited(amount, newShares);
// }
// totalShares += shares; totalAssets += amount;

// _ensureLiquidity() — borrow/withdraw oncesi vault'tan gerektigi kadar redeem:
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
- `test/ReputationLoan.t.sol` → mock `IERC4626Vault` ekle, `setYieldVault` + `deposit` + `withdraw` + `borrow` senaryolari

---

## 10. StreamEscrow (Subscription.sol stream odeme modu)

### Amac
`Subscription.sol`'daki mevcut toplu odeme modeline ek olarak, sure boyunca lineer olarak serbest birakilan stream odeme modu.

### Dosyalar

**Degistirilecek:**
- `contracts/Subscription.sol`
  - `Sub` struct'a `streamMode bool` ve `streamReleased uint256` ekle
  - `subscribeStream(providerId, duration)` yeni fonksiyon — saatlik USDC stream kilidi
  - `claimStream(subId)` — gecen sureye oranla birikmis USDC'yi provider'a serbest birak
  - `StreamSubscribed`, `StreamClaimed` eventleri

### Solidity Tasarimi

```solidity
// Yeni fonksiyon — stream modu:
function subscribeStream(uint256 providerId, uint64 duration) external nonReentrant returns (uint256 subId) {
    // Mevcut provider aktiflik kontrolu...
    // pricePerSecond = pricePerCall / maxResponseTime (yaklasik)
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

## 11. Chainlink Data Feeds (SLAFutures fiyat oracle)

### Amac
`SLAFutures.sol`'da provider'larin slot fiyatini manuel set etmek yerine Chainlink USD/USDC fiyat feed'inden otomatik hesaplama secenegi.

### Dosyalar

**Degistirilecek:**
- `contracts/SLAFutures.sol`
  - `IChainlinkAggregator` minimal arayuzu
  - `priceFeed` state (address, set via `setPriceFeed` — onlyOwner)
  - `mintCapacity()` → `priceFeed` aktifse `latestRoundData()` ile USD bazli cap kontrolu
  - `PriceFeedSet(address)` eventi

### Chainlink Arc Testnet
- USDC/USD feed: `0x...` (Arc Testnet — Chainlink Agustos 2026 duyurusu)
- Fallback: feed `address(0)` ise mevcut manuel fiyat korunur

### Solidity Tasarimi

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

// mintCapacity ici — slot fiyat USD cap:
function _usdCapCheck(uint256 pricePerCall, uint256 totalSlots) internal view {
    if (address(priceFeed) == address(0)) return; // feed yok, atla
    (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
    require(answer > 0 && block.timestamp - updatedAt < 3600, "stale feed");
    // answer = USD per USDC * 10^feedDecimals
    // totalUSD = pricePerCall * totalSlots * answer / 10^(feedDecimals + 6)
    // require(totalUSD <= MAX_BATCH_USD) // orn. 1_000_000 = $1M cap
}
```

---

## 12. zkML Tier System (PayPerCall tier gating)

### Amac
Provider'larin zkML kaniti varsa daha dusuk stake + daha yuksek limit almasi. ERC-7992 zkML standard su an taslak — basit on/off tier flag olarak implemente edilir, gelecekte full ZK proof'a yukseltilir.

### Dosyalar

**Degistirilecek:**
- `contracts/ServiceRegistry.sol`
  - `zkTier mapping(uint256 => uint8)` — provider → tier (0=none, 1=basic, 2=full)
  - `setZkTier(providerId, tier)` — onlyOwner (zkML prover whitelist simulasyonu)
  - `getProvider()` view'a `zkTier` yansit → `IServiceRegistry.ProviderView`'a `uint8 zkTier` ekle
  - Tier 1: minStake %50 indirim. Tier 2: `maxConcurrentCalls` x2.
  - `ZkTierSet(providerId, tier)` eventi

**Degistirilecek:**
- `contracts/interfaces/IServiceRegistry.sol` — `ProviderView`'a `uint8 zkTier` ekle
- `contracts/PayPerCall.sol` — `_callServiceFor` icinde tier 2 ise cap x2

### Test Guncellemeleri
- `test/ServiceRegistry.t.sol` → `setZkTier` + tier 1/2 minStake testleri
- `test/PayPerCall.t.sol` → tier 2 cap x2 testi
- Tum `ProviderView` struct destructuring'leri +1 alan

---

## 13. DePIN Oracle (ServiceRegistry uptime feed)

### Amac
Harici DePIN aglarindan (Cairn pattern) provider uptime kanitlarini `ServiceRegistry`'ye yazma. Off-chain oracle bot imzali mesajla `recordUptime()` cagirir.

### Dosyalar

**Degistirilecek:**
- `contracts/ServiceRegistry.sol`
  - `uptimeOracle address` state (set via `setUptimeOracle` — onlyOwner)
  - `lastUptimePing mapping(uint256 => uint64)` — son ping zamani
  - `uptimeScore mapping(uint256 => uint16)` — 0–10000 bps
  - `recordUptime(providerId, score, sig)` — oracle imzali uptime kaydi
  - `UptimeRecorded(providerId, score)` eventi

**Olusturulacak:**
- `api/notify-provider.js` → mevcut dosya; uptime ping + oracle bot webhook olarak guncelle

### EIP-712 Imza Tasarimi

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

## 14. EIP-5564 Stealth Addresses (CallService stealth cagri)

### Amac
Caller'in kimligini gizlemek icin EIP-5564 stealth address semasi. Caller bir kerelik stealth adres uretir; payment ve callId bu adresten gonderilir.

### Dosyalar

**Olusturulacak:**
- `contracts/interfaces/IEIP5564Announcer.sol` — minimal announcer arayuzu
- `contracts/StealthCallGuard.sol` — stealth callService wrapper

**Degistirilecek:**
- `contracts/PayPerCall.sol`
  - `callServiceStealth(providerId, requestHash, stealthAddress, ephemeralPubKey, metadata)` yeni fonksiyon
  - EIP-5564 `Announce` event emit (announcer contract'a delege)
  - `StealthAnnouncer` state (set via `setStealthAnnouncer` — onlyOwner)

### EIP-5564 Tasarimi

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

// PayPerCall yeni fonksiyon:
function callServiceStealth(
    uint256 providerId,
    bytes32 requestHash,
    address stealthAddress,     // EIP-5564 tek kullanimlik adres
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

## Build Sirasi

1. **`IServiceRegistry.sol`** — `uint8 zkTier` ekle (en cok bagimlilik yaratir)
2. **`ServiceRegistry.sol`** — zkML tier, DePIN oracle, uptime feed
3. **`ReputationLoan.sol`** — ERC-4626 vault entegrasyonu
4. **`Subscription.sol`** — stream odeme modu
5. **`SLAFutures.sol`** — Chainlink fiyat oracle
6. **`PayPerCall.sol`** — zkML tier x2 cap, stealth callService
7. **`contracts/interfaces/IEIP5564Announcer.sol`** — yeni dosya
8. **Tum testler** — yeni alanlar icin destructuring guncellemeleri + yeni test case'leri
9. **`api/unified-balance.js`** — yeni dosya
10. **`api/notify-provider.js`** — DePIN oracle webhook guncellemesi
11. **`src/components/PasskeyWallet.tsx`** — yeni bilesen
12. **`src/components/UnifiedBalance.tsx`** — yeni bilesen
13. **`src/hooks/usePasskeyWallet.ts`** — yeni hook
14. **`package.json`** — `@circle-fin/modular-wallets-core`, `@circle-fin/unified-balance-kit`, `@circle-fin/adapter-viem-v2` ekle
15. **`README.md`** — v4.2 bolumu
16. **`git commit + push`**

---

## Done When

- [ ] `forge test` 229+ test geciyor (yeni test case'ler dahil)
- [ ] `setZkTier(id, 2)` → `getProvider` `zkTier=2` donuyor; `PayPerCall` tier 2 icin cap x2 uyguluyor
- [ ] `setYieldVault(addr)` → `deposit()` USDC'yi vault'a yonlendiriyor
- [ ] `subscribeStream()` → `claimStream()` lineer USDC serbest birakiyor
- [ ] `setPriceFeed(addr)` → `mintCapacity()` fiyat cap kontrolu yapiyor
- [ ] `recordUptime(providerId, score, sig)` oracle imzasi dogrulayarak `uptimeScore` guncelliyor
- [ ] `callServiceStealth()` EIP-5564 announcer'a delege ediyor
- [ ] `GET /api/unified-balance?address=0x...` unified bakiye donuyor
- [ ] `PasskeyWallet.tsx` passkey kayit/giris ve gasless callService calisiyor
- [ ] TypeScript lint/check sifir hata
- [ ] `git push` basarili

---

## On Kosullar (Kullanicinin Yapacaklari)

### Circle Modular Wallets icin
1. [Circle Console](https://console.circle.com) → Keys → Client Keys → yeni key olustur (TEST_API_KEY ile baslar)
2. Console → Passkey Settings → Passkey Domain: `igo0pyziy8t2gqihvahzj.preview.studio.arc.io`
3. `.env` dosyasina ekle:
   ```
   VITE_CLIENT_KEY=TEST_API_KEY:...
   VITE_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl
   ```

### DePIN Oracle icin
- `UPTIME_ORACLE_PRIVATE_KEY` env degiskeni — oracle bot cuzdani
- `setUptimeOracle(oracleAddress)` kontrat cagrisi deploy sonrasi

### Chainlink icin
- Arc Testnet Chainlink USDC/USD feed adresi (Agustos 2026 duyurusu — `setPriceFeed` ile sonradan set edilebilir)
