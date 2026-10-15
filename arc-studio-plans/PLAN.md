# Implementation Plan: CallGuard — Remaining 8 Integrations (v4.2)

> Completed in the previous session (v4.1): rate limiting, x402 Marketplace, Gateway Nanopayments, Circle Refund Protocol, ERC-8004 writes, ERC-8183 hook — 229/229 tests, pushed to GitHub.

## Summary
We are closing the three most critical gaps found in research: (1) per-provider rate limiting that closes the DoS vector left open in SECURITY.md, (2) a Circle Agent Marketplace-compatible x402 discovery endpoint, and (3) full Gateway Nanopayments integration — all without breaking existing contract and API functions.

## Architecture
- **Blockchain:** Arc Testnet — USDC native gas
- **Contract changes:** `PayPerCall.sol` — `openCallsPerCaller` mapping + `maxConcurrentCallsPerCaller` provider config. `ServiceRegistry.sol` — `maxConcurrentCalls` field on the provider struct.
- **API changes:** `api/nano-call.js` — `@circle-fin/x402-batching` Gateway middleware. New `api/marketplace.js` — x402 Bazaar discovery schema endpoint.
- **Frontend:** `src/components/CgLanding.tsx` — Marketplace listing badge and Gateway Nanopayments demo flow.
- **Wallet:** Existing MetaMask + ConnectKit setup is kept. x402 flow is unchanged.

## Files to Create/Modify

### Contracts
1. `contracts/interfaces/IServiceRegistry.sol` — add `maxConcurrentCalls` to the `ProviderView` struct.
2. `contracts/ServiceRegistry.sol` — add `uint32 maxConcurrentCalls` to the Provider struct, to the `register()` and `registerV2()` param lists, and reflect in view functions.
3. `contracts/PayPerCall.sol` — `openCallsPerCaller[providerId][caller]` mapping; cap check in `_callServiceFor` (`TooManyConcurrentCalls` error); decrement inside `submitReceipt` and `claimTimeout`.

### API
4. `api/marketplace.js` — New file. Circle Agent Marketplace x402 Bazaar discovery schema. `GET /api/marketplace` → JSON-LD service listing. `GET /api/marketplace/health` → live provider health check.
5. `api/nano-call.js` — revised with `@circle-fin/x402-batching` `createGatewayMiddleware`. Existing EIP-3009 flow is preserved, Gateway is added as a second rail.
6. `api/call-service.js` — x402 `PAYMENT-REQUIRED` header fully Marketplace-spec compliant with `accepts` array + `input/output JSON Schema` fields.

### Frontend
7. `src/components/CgLanding.tsx` — "Listed on Circle Agent Marketplace" badge + Gateway Nanopayments flow diagram.

### Tests
8. `test/PayPerCall.t.sol` — Rate limiting test cases (`TooManyConcurrentCalls` revert, new calls can open after cap decrement).

## Build Sequence
1. Update `IServiceRegistry.sol` — add `maxConcurrentCalls` to `ProviderView`.
2. Update `ServiceRegistry.sol` — `Provider` struct, `register()`, `registerV2()`, view functions.
3. Update `PayPerCall.sol` — mapping, cap check, decrements.
4. `test/PayPerCall.t.sol` — rate limiting tests, whole suite passes.
5. Create `api/marketplace.js` — discovery schema, provider listing, health check.
6. `api/call-service.js` — x402 `accepts` array and JSON Schema fields.
7. `api/nano-call.js` — `@circle-fin/x402-batching` setup + Gateway middleware.
8. `src/components/CgLanding.tsx` — Badge + flow info.

## Done When
- [ ] `forge test` passes 223+ tests, including the new rate limiting tests
- [ ] `callService()` reverts with `TooManyConcurrentCalls` when the same (providerId, caller) pair exceeds `maxConcurrentCalls`
- [ ] `GET /api/marketplace` returns a valid x402 Bazaar discovery JSON
- [ ] `GET /api/marketplace/health` returns live provider endpoint ping results
- [ ] `POST /api/nano-call` supports both the Gateway (`@circle-fin/x402-batching`) and the standard EIP-3009 path
- [ ] `api/call-service.js` 402 response fully x402-spec compliant with `accepts` array
- [ ] Marketplace badge visible on the frontend landing page

## Contracts — Rate Limiting Design

```solidity
// PayPerCall.sol — new state
// providerId => caller => open call count
mapping(uint256 => mapping(address => uint32)) public openCallsPerCaller;
error TooManyConcurrentCalls();

// to add inside _callServiceFor (after the provider is loaded):
uint32 maxConcurrent = p.maxConcurrentCalls == 0 ? 10 : p.maxConcurrentCalls;
if (openCallsPerCaller[providerId][beneficiary] >= maxConcurrent)
    revert TooManyConcurrentCalls();
openCallsPerCaller[providerId][beneficiary]++;

// to add inside submitReceipt and claimTimeout (after the status is set):
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
