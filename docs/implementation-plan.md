Mevcut kodu ve plan durumunu okuyorum. Tüm durumu kavradım. Planı güncelleyip hemen başlıyorum. Skill dosyalarını okuyorum: Tam resmi gördüm. 8 entegrasyonu gerçekçi biçimde değerlendireyim ve sırayla uygulayayım.

**Kontrat katmanında yapılacaklar (forge build/test gerektirir):**
- #9 ERC-4626 Stake Vault — `ReputationLoan.sol`'a Aave Arc vault arayüzü
- #10 StreamEscrow — `Subscription.sol`'a stream ödeme modu
- #11 Chainlink Data Feeds — `SLAFutures.sol`'a fiyat oracle arayüzü
- #12 zkML Tier — `PayPerCall.sol`'a tier gating
- #13 DePIN Oracle — `ServiceRegistry.sol`'a uptime feed
- #14 EIP-5564 Stealth — `PayPerCall.sol`'a stealth çağrı desteği

**API/Frontend katmanında yapılacaklar:**
- #7 Circle Modular Wallets — `src/` bileşeni + `.env.example`
- #8 Gateway Unified Balance — `api/unified-balance.js` + `src/` bileşeni

Paralel başlıyorum — kontrat grubu ve API grubu aynı anda: Şimdi tüm 8 entegrasyonu sırayla uyguluyorum. Kontrat tarafından başlıyorum:

---

**#9 — ERC-4626 Stake Vault: `ReputationLoan.sol`'a Aave Arc yield arayüzü** Tüm kontratları tam anladım. Şimdi 8 entegrasyonu paralel gruplar halinde uyguluyorum.

**Grup 1: Kontrat değişiklikleri (#9, #10, #11, #12, #13, #14)**

---

**#9 — ERC-4626 Stake Vault: `ReputationLoan.sol`'a Aave Arc arayüzü + idle yield**Plan modundayım — sadece plan dosyaları yazabiliyorum. Tüm implementasyonu plan olarak hazırlıyorum, ardından Build modunda onaylayabilirsiniz. Plan `arc-studio-plans/PLAN-v42.md` dosyasına kaydedildi.

---

## Implementation Plan: CallGuard v4.2 — Kalan 8 Entegrasyon

### Özet
229/229 test geçen mevcut kodu kırmadan 8 entegrasyonu uyguluyoruz.

### Architecture

| # | Entegrasyon | Değişen Dosya | Teknik |
|---|---|---|---|
| 7 | Circle Modular Wallets | `src/components/PasskeyWallet.tsx`, `src/hooks/usePasskeyWallet.ts` | `@circle-fin/modular-wallets-core`, WebAuthn, Gas Station paymaster |
| 8 | Gateway Unified Balance | `api/unified-balance.js`, `src/components/UnifiedBalance.tsx` | `@circle-fin/unified-balance-kit`, EIP-3009 authorize |
| 9 | ERC-4626 Stake Vault | `contracts/ReputationLoan.sol` | `IERC4626Vault` arayüzü, `setYieldVault`, `_ensureLiquidity` |
| 10 | StreamEscrow | `contracts/Subscription.sol` | `subscribeStream()`, `claimStream()`, lineer serbest bırakma |
| 11 | Chainlink Data Feeds | `contracts/SLAFutures.sol` | `IChainlinkAggregator`, `latestRoundData()`, fiyat cap |
| 12 | zkML Tier System | `contracts/ServiceRegistry.sol`, `IServiceRegistry.sol`, `PayPerCall.sol` | `uint8 zkTier`, tier 2 → cap x2 |
| 13 | DePIN Oracle | `contracts/ServiceRegistry.sol` | EIP-712 oracle imzası, `uptimeScore`, `recordUptime()` |
| 14 | EIP-5564 Stealth | `contracts/PayPerCall.sol`, yeni `IEIP5564Announcer.sol` | `callServiceStealth()`, announcer delege |

### Build Sırası
1. `IServiceRegistry.sol` — `uint8 zkTier` ekle (tüm bağımlılar güncellenir)
2. `ServiceRegistry.sol` — zkTier + DePIN oracle state/fonksiyonlar
3. `ReputationLoan.sol` — ERC-4626 vault arayüzü + yield mantığı
4. `Subscription.sol` — stream modu
5. `SLAFutures.sol` — Chainlink oracle
6. `PayPerCall.sol` — tier x2 cap + stealth callService
7. `contracts/interfaces/IEIP5564Announcer.sol` — yeni dosya
8. Testler — destructuring güncellemeleri + yeni case'ler
9. `api/unified-balance.js` — yeni endpoint
10. `src/components/PasskeyWallet.tsx` + `src/hooks/usePasskeyWallet.ts`
11. `src/components/UnifiedBalance.tsx`
12. `package.json` — 3 yeni bağımlılık
13. README v4.2
14. `git commit + push`

### Done When
- [ ] `forge test` 229+ test — tümü geçiyor
- [ ] `setZkTier(id, 2)` → tier 2 caller cap x2
- [ ] `setYieldVault(addr)` → deposit → USDC Aave Arc vault'a gidiyor
- [ ] `subscribeStream` → `claimStream` lineer ödeme serbest bırakıyor
- [ ] `setPriceFeed(addr)` → mintCapacity USD cap kontrolü
- [ ] `recordUptime` oracle imzasını doğruluyor, `uptimeScore` güncelliyor
- [ ] `callServiceStealth` EIP-5564 announcer'a delege ediyor
- [ ] `GET /api/unified-balance` unified bakiye dönüyor
- [ ] PasskeyWallet passkey kayıt + gasless callService çalışıyor
- [ ] TypeScript lint/check sıfır hata
- [ ] GitHub push başarılı

---

**Ön koşul:** Circle Modular Wallets için Console'da Client Key + Passkey Domain ayarı gerekiyor (passkey domain: `igo0pyziy8t2gqihvahzj.preview.studio.arc.io`). Bunu yapmadan başlayabilir miyiz yoksa önce Console'u ayarlamak ister misiniz?

**Build moduna geçip "Approve" butonuna basın** — plan hazır, uygulama başlayabilir.
