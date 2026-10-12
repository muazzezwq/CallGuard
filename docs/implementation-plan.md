Mevcut kodu okuyarak plan hazırlayayım. Kodu tam anladım. Plan hazırlanıyor. Kod tabanını tam olarak gördüm. Plan hazırlıyorum.

## Implementation Plan: CallGuard — Top 3 Entegrasyon

### Summary
Araştırmada tespit edilen en kritik üç eksikliği kapatıyoruz: (1) SECURITY.md'de açık kalan DoS vektörünü kapatan per-provider rate limiting, (2) Circle Agent Marketplace uyumlu x402 discovery endpoint'i ve (3) Gateway Nanopayments tam entegrasyonu — tüm bunları mevcut kontrat ve API fonksiyonlarını kırmadan.

### Architecture
- **Blockchain:** Arc Testnet — USDC native gas
- **Kontrat değişiklikleri:** `PayPerCall.sol` — `openCallsPerCaller` mapping + `maxConcurrentCallsPerCaller` provider config. `ServiceRegistry.sol` — provider struct'a `maxConcurrentCalls` field.
- **API değişiklikleri:** `api/nano-call.js` — `@circle-fin/x402-batching` Gateway middleware. Yeni `api/marketplace.js` — x402 Bazaar discovery schema endpoint.
- **Frontend:** `src/components/CgLanding.tsx` — Marketplace listing badge ve Gateway Nanopayments demo akışı.
- **Wallet:** Mevcut MetaMask + ConnectKit korunuyor. x402 flow değişmiyor.

### Files to Create/Modify

**Kontratlar:**
1. `contracts/ServiceRegistry.sol` — Provider struct'a `uint32 maxConcurrentCalls` ekle, `register()` ve `registerV2()` param listesine ekle, `IServiceRegistry.ProviderView`'a yansıt.
2. `contracts/interfaces/IServiceRegistry.sol` — `ProviderView` struct'a `maxConcurrentCalls` ekle.
3. `contracts/PayPerCall.sol` — `openCallsPerCaller[providerId][caller]` mapping ekle; `_callServiceFor` içinde cap kontrolü; `submitReceipt` ve `claimTimeout` içinde decrement.

**API:**
4. `api/marketplace.js` — Yeni dosya. Circle Agent Marketplace x402 Bazaar discovery schema. `GET /api/marketplace` → JSON-LD service listing. `GET /api/marketplace/health` → canlı provider health check.
5. `api/nano-call.js` — `@circle-fin/x402-batching` `createGatewayMiddleware` ile revize. Mevcut EIP-3009 akışı korunuyor, Gateway ikinci rail olarak ekleniyor.
6. `api/call-service.js` — x402 `PAYMENT-REQUIRED` header formatını Marketplace spec'e tam uyumlu hale getir (`accepts` array, `input/output JSON Schema` alanları).

**Frontend:**
7. `src/components/CgLanding.tsx` — "Circle Agent Marketplace'te listeli" badge + Gateway Nanopayments akış diyagramı.

**Test:**
8. `test/PayPerCall.t.sol` — Rate limiting test case'leri ekle.

### Build Sequence
1. `IServiceRegistry.sol` güncelle — `ProviderView`'a `maxConcurrentCalls` ekle.
2. `ServiceRegistry.sol` güncelle — `Provider` struct, `register()`, `registerV2()`, view fonksiyonları.
3. `PayPerCall.sol` güncelle — `openCallsPerCaller` mapping, cap check `_callServiceFor`, decrement `submitReceipt` + `claimTimeout`.
4. `test/PayPerCall.t.sol` — rate limiting test'leri ekle, tüm test suite'i geç.
5. `api/marketplace.js` oluştur — discovery schema, provider listing, health check.
6. `api/call-service.js` — x402 `accepts` array ve JSON Schema alanları.
7. `api/nano-call.js` — `@circle-fin/x402-batching` kurulumu + Gateway middleware.
8. `src/components/CgLanding.tsx` — Badge + akış bilgisi.

### Done When
- [ ] `forge test` 223+ test geçiyor, yeni rate limiting testleri dahil
- [ ] `callService()` aynı (providerId, caller) çiftinden `maxConcurrentCalls` aşıldığında `TooManyConcurrentCalls` revert ediyor
- [ ] `GET /api/marketplace` geçerli x402 Bazaar discovery JSON'u dönüyor
- [ ] `GET /api/marketplace/health` canlı provider endpoint ping sonuçlarını dönüyor
- [ ] `POST /api/nano-call` hem Gateway (`@circle-fin/x402-batching`) hem standart EIP-3009 path'ini destekliyor
- [ ] `api/call-service.js` 402 response'u `accepts` array ile tam x402 spec uyumlu
- [ ] Frontend landing sayfasında Marketplace badge görünüyor

---

Planı kaydediyorum, ardından Build moduna geçip başlayabilirsiniz. Plan `arc-studio-plans/PLAN.md` dosyasına kaydedildi.

**Build moduna geçip "Approve" butonuna basın — hemen başlıyoruz.**

Yapılacaklar sırayla:

**Kontrat (DoS kapanışı):**
- `IServiceRegistry.sol` → `ProviderView`'a `maxConcurrentCalls`
- `ServiceRegistry.sol` → `Provider` struct + `register/registerV2` parametre
- `PayPerCall.sol` → `openCallsPerCaller` mapping, `_callServiceFor` cap check, `submitReceipt/claimTimeout` decrement
- `test/PayPerCall.t.sol` → rate limiting testleri, 223+ test geçmeli

**API (Marketplace + Gateway):**
- `api/marketplace.js` → Circle Agent Marketplace x402 Bazaar discovery endpoint (yeni dosya)
- `api/call-service.js` → `accepts` array ile tam x402 spec uyumu
- `api/nano-call.js` → `@circle-fin/x402-batching` Gateway middleware ikinci rail

**Frontend:**
- `src/components/CgLanding.tsx` → Marketplace badge + Gateway akış açıklaması
