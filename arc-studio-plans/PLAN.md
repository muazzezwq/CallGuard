# Implementation Plan: CallGuard — Kalan 8 Entegrasyon (v4.2)

> Onceki oturumda tamamlananlar (v4.1): rate limiting, x402 Marketplace, Gateway Nanopayments, Circle Refund Protocol, ERC-8004 yazma, ERC-8183 hook — 229/229 test, GitHub'a push edildi.

## Summary
Arastirmada tespit edilen en kritik uc eksikligi kapatiyoruz: (1) SECURITY.md'de acik kalan DoS vektorunu kapatan per-provider rate limiting, (2) Circle Agent Marketplace uyumlu x402 discovery endpoint'i ve (3) Gateway Nanopayments tam entegrasyonu — tum bunlari mevcut kontrat ve API fonksiyonlarini kirmadan.

## Architecture
- **Blockchain:** Arc Testnet — USDC native gas
- **Kontrat degisiklikleri:** `PayPerCall.sol` — `openCallsPerCaller` mapping + `maxConcurrentCallsPerCaller` provider config. `ServiceRegistry.sol` — provider struct'a `maxConcurrentCalls` field.
- **API degisiklikleri:** `api/nano-call.js` — `@circle-fin/x402-batching` Gateway middleware. Yeni `api/marketplace.js` — x402 Bazaar discovery schema endpoint.
- **Frontend:** `src/components/CgLanding.tsx` — Marketplace listing badge ve Gateway Nanopayments demo akisi.
- **Wallet:** Mevcut MetaMask + ConnectKit korunuyor. x402 flow degismiyor.

## Files to Create/Modify

### Contracts
1. `contracts/interfaces/IServiceRegistry.sol` — `ProviderView` struct'a `maxConcurrentCalls` ekle.
2. `contracts/ServiceRegistry.sol` — Provider struct'a `uint32 maxConcurrentCalls`, `register()` ve `registerV2()` param listesine ekle, view fonksiyonlarina yansit.
3. `contracts/PayPerCall.sol` — `openCallsPerCaller[providerId][caller]` mapping; `_callServiceFor` cap kontrolu (`TooManyConcurrentCalls` error); `submitReceipt` ve `claimTimeout` icinde decrement.

### API
4. `api/marketplace.js` — Yeni dosya. Circle Agent Marketplace x402 Bazaar discovery schema. `GET /api/marketplace` → JSON-LD service listing. `GET /api/marketplace/health` → canli provider health check.
5. `api/nano-call.js` — `@circle-fin/x402-batching` `createGatewayMiddleware` ile revize. Mevcut EIP-3009 akisi korunuyor, Gateway ikinci rail olarak ekleniyor.
6. `api/call-service.js` — x402 `PAYMENT-REQUIRED` header'i `accepts` array + `input/output JSON Schema` alanlariyla Marketplace spec'e tam uyumlu.

### Frontend
7. `src/components/CgLanding.tsx` — "Circle Agent Marketplace'te listeli" badge + Gateway Nanopayments akis diyagrami.

### Tests
8. `test/PayPerCall.t.sol` — Rate limiting test case'leri (`TooManyConcurrentCalls` revert, cap sonrasi decrement ile yeni cagri acilabiliyor).

## Build Sequence
1. `IServiceRegistry.sol` guncelle — `ProviderView`'a `maxConcurrentCalls` ekle.
2. `ServiceRegistry.sol` guncelle — `Provider` struct, `register()`, `registerV2()`, view fonksiyonlari.
3. `PayPerCall.sol` guncelle — mapping, cap check, decrements.
4. `test/PayPerCall.t.sol` — rate limiting testleri, tum suite gec.
5. `api/marketplace.js` olustur — discovery schema, provider listing, health check.
6. `api/call-service.js` — x402 `accepts` array ve JSON Schema alanlari.
7. `api/nano-call.js` — `@circle-fin/x402-batching` kurulumu + Gateway middleware.
8. `src/components/CgLanding.tsx` — Badge + akis bilgisi.

## Done When
- [ ] `forge test` 223+ test geciyor, yeni rate limiting testleri dahil
- [ ] `callService()` ayni (providerId, caller) ciftinden `maxConcurrentCalls` asildiginda `TooManyConcurrentCalls` revert ediyor
- [ ] `GET /api/marketplace` gecerli x402 Bazaar discovery JSON'u donuyor
- [ ] `GET /api/marketplace/health` canli provider endpoint ping sonuclarini donuyor
- [ ] `POST /api/nano-call` hem Gateway (`@circle-fin/x402-batching`) hem standart EIP-3009 path'ini destekliyor
- [ ] `api/call-service.js` 402 response'u `accepts` array ile tam x402 spec uyumlu
- [ ] Frontend landing sayfasinda Marketplace badge gorunuyor

## Contracts — Rate Limiting Tasarimi

```solidity
// PayPerCall.sol — yeni state
// providerId => caller => acik cagri sayisi
mapping(uint256 => mapping(address => uint32)) public openCallsPerCaller;
error TooManyConcurrentCalls();

// _callServiceFor icine eklenecek (provider alindiktan sonra):
uint32 maxConcurrent = p.maxConcurrentCalls == 0 ? 10 : p.maxConcurrentCalls;
if (openCallsPerCaller[providerId][beneficiary] >= maxConcurrent)
    revert TooManyConcurrentCalls();
openCallsPerCaller[providerId][beneficiary]++;

// submitReceipt ve claimTimeout icine eklenecek (status set'ten sonra):
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
