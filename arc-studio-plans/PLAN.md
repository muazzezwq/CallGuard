# Implementation Plan: CallGuard — Kalan 8 Entegrasyon (v4.2)

> Önceki oturumda tamamlananlar (v4.1): rate limiting, x402 Marketplace, Gateway Nanopayments, Circle Refund Protocol, ERC-8004 yazma, ERC-8183 hook — 229/229 test, GitHub'a push edildi.

## Summary
Araştırmada tespit edilen en kritik üç eksikliği kapatıyoruz: (1) SECURITY.md'de açık kalan DoS vektörünü kapatan per-provider rate limiting, (2) Circle Agent Marketplace uyumlu x402 discovery endpoint'i ve (3) Gateway Nanopayments tam entegrasyonu — tüm bunları mevcut kontrat ve API fonksiyonlarını kırmadan.

## Architecture
- **Blockchain:** Arc Testnet — USDC native gas
- **Kontrat değişiklikleri:** `PayPerCall.sol` — `openCallsPerCaller` mapping + `maxConcurrentCallsPerCaller` provider config. `ServiceRegistry.sol` — provider struct'a `maxConcurrentCalls` field.
- **API değişiklikleri:** `api/nano-call.js` — `@circle-fin/x402-batching` Gateway middleware. Yeni `api/marketplace.js` — x402 Bazaar discovery schema endpoint.
- **Frontend:** `src/components/CgLanding.tsx` — Marketplace listing badge ve Gateway Nanopayments demo akışı.
- **Wallet:** Mevcut MetaMask + ConnectKit korunuyor. x402 flow değişmiyor.

## Files to Create/Modify

### Contracts
1. `contracts/interfaces/IServiceRegistry.sol` — `ProviderView` struct'a `maxConcurrentCalls` ekle.
2. `contracts/ServiceRegistry.sol` — Provider struct'a `uint32 maxConcurrentCalls`, `register()` ve `registerV2()` param listesine ekle, view fonksiyonlarına yansıt.
3. `contracts/PayPerCall.sol` — `openCallsPerCaller[providerId][caller]` mapping; `_callServiceFor` cap kontrolü (`TooManyConcurrentCalls` error); `submitReceipt` ve `claimTimeout` içinde decrement.

### API
4. `api/marketplace.js` — Yeni dosya. Circle Agent Marketplace x402 Bazaar discovery schema. `GET /api/marketplace` → JSON-LD service listing. `GET /api/marketplace/health` → canlı provider health check.
5. `api/nano-call.js` — `@circle-fin/x402-batching` `createGatewayMiddleware` ile revize. Mevcut EIP-3009 akışı korunuyor, Gateway ikinci rail olarak ekleniyor.
6. `api/call-service.js` — x402 `PAYMENT-REQUIRED` header'ı `accepts` array + `input/output JSON Schema` alanlarıyla Marketplace spec'e tam uyumlu.

### Frontend
7. `src/components/CgLanding.tsx` — "Circle Agent Marketplace'te listeli" badge + Gateway Nanopayments akış diyagramı.

### Tests
8. `test/PayPerCall.t.sol` — Rate limiting test case'leri (`TooManyConcurrentCalls` revert, cap sonrası decrement ile yeni çağrı açılabiliyor).

## Build Sequence
1. `IServiceRegistry.sol` güncelle — `ProviderView`'a `maxConcurrentCalls` ekle.
2. `ServiceRegistry.sol` güncelle — `Provider` struct, `register()`, `registerV2()`, view fonksiyonları.
3. `PayPerCall.sol` güncelle — mapping, cap check, decrements.
4. `test/PayPerCall.t.sol` — rate limiting testleri, tüm suite geç.
5. `api/marketplace.js` oluştur — discovery schema, provider listing, health check.
6. `api/call-service.js` — x402 `accepts` array ve JSON Schema alanları.
7. `api/nano-call.js` — `@circle-fin/x402-batching` kurulumu + Gateway middleware.
8. `src/components/CgLanding.tsx` — Badge + akış bilgisi.

## Done When
- [ ] `forge test` 223+ test geçiyor, yeni rate limiting testleri dahil
- [ ] `callService()` aynı (providerId, caller) çiftinden `maxConcurrentCalls` aşıldığında `TooManyConcurrentCalls` revert ediyor
- [ ] `GET /api/marketplace` geçerli x402 Bazaar discovery JSON'u dönüyor
- [ ] `GET /api/marketplace/health` canlı provider endpoint ping sonuçlarını dönüyor
- [ ] `POST /api/nano-call` hem Gateway (`@circle-fin/x402-batching`) hem standart EIP-3009 path'ini destekliyor
- [ ] `api/call-service.js` 402 response'u `accepts` array ile tam x402 spec uyumlu
- [ ] Frontend landing sayfasında Marketplace badge görünüyor

## Contracts — Rate Limiting Tasarımı

```solidity
// PayPerCall.sol — yeni state
// providerId => caller => açık çağrı sayısı
mapping(uint256 => mapping(address => uint32)) public openCallsPerCaller;
error TooManyConcurrentCalls();

// _callServiceFor içine eklenecek (provider alındıktan sonra):
uint32 maxConcurrent = p.maxConcurrentCalls == 0 ? 10 : p.maxConcurrentCalls;
if (openCallsPerCaller[providerId][beneficiary] >= maxConcurrent)
    revert TooManyConcurrentCalls();
openCallsPerCaller[providerId][beneficiary]++;

// submitReceipt ve claimTimeout içine eklenecek (status set'ten sonra):
if (openCallsPerCaller[c.providerId][c.caller] > 0)
    openCallsPerCaller[c.providerId][c.caller]--;
```

## API — Marketplace Discovery Schema

```json
GET /api/marketplace
{
  "x402Version": 1,
  "services": [{
    "id": "callguard-arc-testnet",
    "name": "CallGuard SLA Marketplace",
    "description": "Stake-backed onchain SLA. Auto-slash on timeout. 9 active providers.",
    "url": "https://<host>/api/call-service",
    "category": "INFRASTRUCTURE",
    "accepts": [{
      "scheme": "exact",
      "network": "eip155:5042002",
      "asset": "0x3600000000000000000000000000000000000000",
      "maxAmountRequired": "10000000",
      "payTo": "<facilitator>",
      "description": "USDC on Arc Testnet"
    }],
    "supportsVanillax402": true,
    "supportsCircleGateway": true,
    "inputSchema": { "$schema": "...", "type": "object", ... },
    "outputSchema": { "$schema": "...", "type": "object", ... }
  }]
}
```
