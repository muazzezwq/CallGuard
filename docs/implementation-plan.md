Frontend'i kontrol ediyorum. Durumu net gördüm. Şimdi 14 entegrasyonu sidebar'daki panellerle eşleştiriyorum:

**Sidebar'da gözükenler (✅) vs gözükmeyenler (❌):**

| # | Entegrasyon | Panel | Sidebar'da |
|---|---|---|---|
| 1 | Per-provider rate limiting | → Call Builder içinde | ✅ (calls) |
| 2 | Circle Agent Marketplace x402 | Services / marketplace | ✅ (marketplace) |
| 3 | Gateway Nanopayments | Payments | ✅ (payments) |
| 4 | Circle Refund Protocol | Disputes/Receipts | ✅ (disputes, receipts) |
| 5 | ERC-8004 ReputationRegistry | Providers | ✅ (providers) |
| 6 | **ERC-8183 Pipeline Hook** | ❌ Yok | ❌ Panel yok |
| 7 | Circle Modular Wallets | Passkey Wallet | ✅ (passkey) |
| 8 | Gateway Unified Balance | Unified Balance | ✅ (balance) |
| 9 | ERC-4626 Stake Vault | RepFi Lending | ✅ (lending) |
| 10 | StreamEscrow | Subscriptions | ✅ (subscriptions) |
| 11 | Chainlink Data Feeds | SLA Futures | ✅ (futures) |
| 12 | zkML Tier System | Register / Providers | ✅ (register) |
| 13 | DePIN Oracle | Providers | ✅ (providers) |
| 14 | EIP-5564 Stealth Addresses | Call Builder içinde | ✅ (calls) |

**Tek eksik: ERC-8183 Pipeline Hook için bir panel yok.** Sidebar'a "Pipeline Hook" menü öğesi ve basit bir panel ekleyeyim mi? Kontratla bağlanacak — `setPipelineHook(address)` çağrısı + hook durumunu gösterecek.
