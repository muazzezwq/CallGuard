# CallGuard × Arkreen × TLAY — Integration Brief

**Date:** September 2026  
**Status:** Testnet live, integration ready

---

## The Stack

```
Arkreen DePIN Node          TLAY BoAT Machine         CallGuard (this project)
(solar panel data)    →     (embedded wallet)    →    (SLA enforcement)
 kWh generation             pays 0.01 USDC             on-chain escrow
 AREC issuance              per API call               slash on miss
 Polygon / Arc              Arc Testnet                Arc Testnet
```

**Full flow:**
1. Arkreen node generates solar kWh data (real IoT, DePIN-verified)
2. Arkreen node registers as CallGuard provider (stakes USDC, sets SLA terms)
3. TLAY machine (eCandle, Bitaxe, etc.) discovers provider via CallGuard registry
4. Machine sends x402 call with EIP-3009 signature (BoAT signs on-device, ~58KB runtime)
5. CallGuard facilitator verifies signature, opens escrow on-chain
6. Arkreen endpoint responds with kWh data within SLA window
7. Auto-receipt submitted → escrow released → Arkreen earns USDC
8. If no response within SLA → machine claims timeout → Arkreen slashed

---

## Testnet Status

| Component              | Status | URL / Address |
|------------------------|--------|---------------|
| Arc Testnet RPC        | ✅ Live | `https://rpc.testnet.arc.io` (block ~69.5M) |
| PayPerCallV8           | ✅ Live | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` |
| ServiceRegistryV8      | ✅ Live | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` |
| DisputeV4              | ✅ Live | `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B` |
| Evidence registry v2   | ✅ Live | `0x64872c29A19dF8E471103d0708397BAb96A311FC` |
| x402 call endpoint     | ✅ Live | `https://arcsla.vercel.app/callService` |
| Energy data endpoint   | ✅ Live | `https://arcsla.vercel.app/api/energy-data` (402 without payment) |
| CallGuard app          | ✅ Live | `https://arcsla.vercel.app/` |

---

## For Arkreen — How to Register as a Provider

### Requirements
- Arc Testnet wallet with at least 10 USDC (`ServiceRegistryV8.minStake()`) plus gas
- Your Arkreen node endpoint URL
- Node.js

### Steps

```bash
git clone https://github.com/muazzezwq/CallGuard
cd CallGuard
npm install ethers

# Set your variables
export PRIVATE_KEY=0x<your_arkreen_node_wallet>
export ARKREEN_ENDPOINT=https://<your-node>.example.com/api/energy

# the helper script is not in this repo; register through the Register panel,
# or send ServiceRegistryV8.register(...) with cast
```

**What this does:**
- Stakes the 10 USDC minimum on CallGuard `ServiceRegistryV8`
- Sets: 0.01 USDC/call, 30s SLA window, 50% slash on timeout
- Publishes metadata with service schema for TLAY machine discovery

**After registration**, any TLAY machine or other caller can discover your provider via the leaderboard at `arcsla.vercel.app/` and call your endpoint with SLA enforcement.

---

## For TLAY — How to Call via CallGuard (BoAT Integration)

### x402 Flow (BoAT on-device)

```
GET https://arcsla.vercel.app/api/energy-data
→ HTTP 402 + payment terms (payTo, asset, maxAmount)

POST https://arcsla.vercel.app/api/call-service
  Body: { providerId, payload, from, to, value, validBefore, nonce, v, r, s }
  Header: X-Machine-Id: <device_address>
→ HTTP 200 { callId, txHash, data }
```

### Test script

```bash
export PRIVATE_KEY=0x<machine_wallet>
export PROVIDER_ID=1
export PAYLOAD=kwh_now
# the helper script is not in this repo; call through the Call Builder panel
# or PayPerCallV8.callService(...) with cast
```

### EIP-3009 signing (C pseudocode for BoAT)

```c
// BoAT on-device signing — 58KB runtime
BoatEthTxTransferWithAuth auth = {
  .from        = machine_wallet_addr,
  .to          = CALLGUARD_FACILITATOR,
  .value       = CALL_PRICE_USDC,        // 10000 = 0.01 USDC
  .validBefore = unix_now + 300,
  .nonce       = random_bytes32(),
};
BoatEthSignEIP3009(privateKey, &auth, &signature);
// → submit to /api/call-service with X-Payment header
```

---

## For Both — Joint Demo Scenario

**"Machine buys solar data every 10 seconds"**

```
[Bitaxe miner] evaluates energy price
  → if profitable: BoAT signs EIP-3009 (on-device)
  → POST /api/call-service → CallGuard opens escrow
  → /api/energy-data returns kWh data
  → auto-receipt submitted → Arkreen earns 0.01 USDC
  → Bitaxe adjusts mining schedule based on solar availability
```

This creates the first **Physical AI × DePIN × SLA** loop on Arc:
- Machine autonomy (TLAY BoAT)
- Verified real-world data (Arkreen DePIN)
- SLA enforcement with slash/escrow (CallGuard)
- USDC settlement in <1s (Arc Testnet)

---

## Contact

- CallGuard: https://github.com/muazzezwq/CallGuard
- App: https://arcsla.vercel.app/
- Contract explorer: https://explorer.testnet.arc.io/address/0xedce61eF5be31DC22cEfE342692622A26919a7EF (`PayPerCallV8`)

---

## Open Items for Integration

- [ ] Arkreen: provide testnet node endpoint URL for live demo
- [ ] TLAY: write the BoAT call script (no helper is in this repo yet) and test it with a real device
- [ ] CallGuard: add `ARKREEN_API_URL` env var for live kWh data
- [ ] Joint: coordinate demo video — eCandle → CallGuard → Bitaxe
- [ ] Joint: co-tweet / blog post on Arc ecosystem
