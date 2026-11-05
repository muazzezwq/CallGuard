# Ana ağ hazırlık kontrol listesi

Gösterim: `PASS` = kaynak/salt-okunur evidence ile doğrulandı; `PARTIAL` = sınırlama ile kullanılabilir; `FAIL` = düzeltilmeli veya yazılı kabul gerekli; `UNVERIFIED` = kanıtlanmadı.

| # | Alan | Durum | Kanıt / eksik |
|---|---|---|---|
| ENV-1 | `.env` ignore; yalnız örnek dosya commit’li | PASS | `.gitignore`; tracked secret-like arama |
| ENV-2 | Public `VITE_*` private key içermez | PASS | `.env.example` uyarısı; örnek değerler secret değil |
| ENV-3 | Server key browser bundle’a girmez | PARTIAL | Serverlar unprefixed; `src/lib/utils.ts` ölü private-key path |
| DEP-1 | Her tx öncesi aktif v8 adres/pairing doğrula | PASS | `check.js`; deployment dokümanı |
| DEP-2 | Deployed registry admin yapılandırması | FAIL | Tek owner EOA + arbiter + appeal + treasury |
| DEP-3 | DisputeV4 econ parameter policy | FAIL | Arbiter parametreyi değiştirebilir; AM-01/AM-02 |
| DEP-4 | Keeper gecikirse timeout işleyişi | PASS | Permissionless `claimTimeout`; custody yok |
| PAY-1 | x402 `to` escrow, `value` price | PASS | Kod ve deployment wiring doğruluyor |
| PAY-2 | Duplicate payment value drain etmez | PARTIAL | USDC nonce; durable idempotency yok |
| PAY-3 | Demo success gerçek başarı gibi değil | FAIL | FACILITATOR_PRIVATE_KEY yok → `success:true, settled:false` |
| PAY-4 | Payment backend yokken 503/deny | FAIL | Production fail-closed gerekli |
| PAY-5 | Persistent idempotency + güvenli recovery | PARTIAL | Varsayılan açık değil |
| TOK-1 | Approval her çağrı için minimum | FAIL | `active PPC` ve CCTP `maxUint256` |
| TOK-2 | Transfer UI ile birebir eşleşir | UNVERIFIED | Fresh wallet/fork E2E gerekli |
| CALL-1 | Stake slash’i cover etmeden open yok | PASS | `PayPerCallV8` kontrolü |
| CALL-2 | Üçüncü kişi beneficiary cap doldurmaz | FAIL | `callServiceFor` permissionless |
| CALL-3 | Timeout path caller’ı öder | PASS | permissionless claim flow doğrulandı |
| SLA-1 | Availability target contract tarafından enforce’lu | FAIL | Stored, not enforced |
| SLA-2 | Evidence verifier allowlist dışına çıkar | PASS | V2 wiring |
| SLA-3 | Anchored evidence yalnız çağrıya bağlı | PASS | Prod smoke `true/false`; fixture compare |
| SLA-4 | TEE attestation domain doğrulamalı | FAIL/CLOSED | Quote yok; kind closed |
| SLA-5 | zk-execution verifier/wiring geçişi | PASS | V2 anchored; docs §13.8 |
| SLA-6 | zk-constraint row dispute-visible registry’de | PASS | V2 anchored; docs §13.9 |
| UI-1 | XSS/eval yüzeyi yok | PASS | Kaynak arama temiz |
| UI-2 | Private key import path kaldırılmalı | FAIL | `src/lib/utils.ts` |
| UI-3 | CSP target sıkı | PARTIAL | Yalnız frame-ancestors |
| WEB-1 | Public API CORS bilinçli | PASS | `*` designed public; credential yok |
| OPS-1 | Failed settle monitor/alert | UNVERIFIED | Metrics/logs/runbook gerekli |
| OPS-2 | Rollback production web + wiring | UNVERIFIED | Runbook rehearsal |
| OPS-3 | Keeper key scope minimum | PARTIAL | GitHub secret; runner riski |
| TEST-1 | Multisig/timelock fork test | UNVERIFIED | Yok |
| TEST-2 | `callServiceFor` consent test | UNVERIFIED | Yok |
| TEST-3 | Exact approval wallet E2E | UNVERIFIED | Yok |
| TEST-4 | Mainnet disposable wallet dry run | UNVERIFIED | Yapılmalı |

Genel: DEP-2, DEP-3, PAY-3, PAY-4, TOK-1 ve CALL-2 çözülmeden veya ikinci reviewer tarafından yazılı kabul edilmeden **fon tutan release yok**.
