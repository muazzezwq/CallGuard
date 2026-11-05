# Arc mainnet yayını öncesi güvenlik denetimi

**Tarih:** 2 Kasım 2026  
**Ağ varsayımı:** Arc mainnet. Findings, mevcut Arc testnet dağıtımı ve kaynak koddan çıkarılmıştır; dağıtım yapılandırmasına bağlı maddeler checklist’te ayrıca işaretlenmiştir.  
**Kapsam ve mod:** kaynak kodu denetimi + salt-okunur zincir/deployment kontrolleri. **Kod düzeltilmedi.**

Desteklenmeyen sonuçlar:
- Harici izleme, hosted monitoring ve üretim credential envanteri doğrulanmadı.
- Arc USDC için 6 decimals ve ERC-20 facade modeli varsayılır.
- Mevcut fuzz/fork testleri, escrow doğruluğunun resmi ispatı değildir.

## Kısa sonuç

Mevcut dağıtımla **ana ağda fon yükü olmadan önce yayına alınmamalı**. Normal ürün akışında para ve çağrı mantığı mantıklı görünüyor; ancak compromise edilmiş veya yanlış kullanılan owner/arbiter anahtarı slash escrow’yu ve dispute ekonomisini yönlendirebilir. En tehlikeli uygulama hatası ise facilitator key yokken “başarılı” dönen demo settlement’tır.

Kullanıcıya açılacak değerler için önce: admin/arbiter/treasury rolleri ayrılmalı, fail-closed settlement doğrulanmalı, kalıcı idempotency etkinleştirilmeli ve exact/bounded approvals uygulanmalıdır.

## Bulgular

### AM-01 — Tek bir EOA provider slash, dispute escrow ve evidence wiring’i değiştirebilir
- **Önem:** Engel / tasarım-critical
- **Kanıt:** `contracts/ServiceRegistryV8.sol:158`, `:272`; `contracts/DisputeV4.sol:138-140`, `:147`, `:375`, `:415`; Arc testnet admin, DisputeV4 arbiter/appeal arbiter/treasury ve SLAEvidenceRegistryV2 wiring’in owner cüzdanında olduğu belgeli.
- **Etki:** Bu anahtar keyfi slasher yetkisi verebilir, arbitration rollerini değiştirebilir, slash yüzdesi/bonds/window değerlerini değiştirebilir, treasury’ye yönlendirebilir veya kötü sonuca dışarıdan override koyamayabilir. Yetki yalnız provider stake’ini değil, dispute piyasasının kurallarını da kapsar.
- **Önkoşul:** Key compromise, operatör hatası veya compromise edilmiş deployment pipeline.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Registry/dispute administration en az 2-of-3 multisig veya amaca özel timelocked governance’a alınmalı; slash authorization/arbiter/appeal/treasury ayırılmalı; cancellation ve incident/rollback prosedürü eklenmeli; yeni dağıtımda `cast call` ile role readback yapılmalı; multisig/role revert senaryoları fork test ile doğrulanmalı; deployed adresler release artifact’ında pinlenmelidir.

### AM-02 — DisputeV4 protocol ücretleri ve bonds kullanıcı rızası olmadan değişebilir
- **Önem:** Critical
- **Kanıt:** `DisputeV4.sol:147`, `:585-587`; `docs/V8_DEPLOYMENT.md` §14; disputeBond 2 USDC, appealBond 3 USDC, resolutionWindow 604800, appealWindow 172800, disputeSlashBps 1000 (10%). Tek anahtar arbiter/appeal yolunu kontrol ediyor.
- **Etki:** Operatör dispute bond maliyetini veya slash paylaşımını ekonomik olarak anlamsız hale getirebilir veya pending dispute için kuralları değiştirebilir. Slash escrow ve treasury yönlendirmesi de kırılma alanıdır.
- **Önkoşul:** AM-01 anahtarının kontrolü.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Açık dispute için economic parameters immutable veya yalnız timelocked değişiklik; önceki dispute’ler için açılış zamanındaki policy hash sabitlenmeli; treasury kesinkes multisig olmalı; policy değişiklikleri public notice/timelock ardından uygulanmalı; arbitrary-treasury withdrawal için testler eklenmelidir.

### AM-03 — Facilitated settlement demo modda success döner
- **Önem:** Yüksek
- **Kanıt:** `api/call-service.js:14`, `:1080-1083`; `FACILITATOR_PRIVATE_KEY` absent ise JSON `{success:true, demo:true, settled:false}`.
- **Etki:** `settled` alanını kontrol etmeyen client ücretsiz çıktı teslim eder. x402 entegrasyonunda en tehlikeli hata bu “başarılı görünen settlement” durumudur.
- **Önkoşul:** Production da missing key/rollout break/secret mismatch.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Production fail-closed; `demo` yalnız local environment’da mümkün olmalı; key yoksa 503/explicit error; boot-time assertion; deploy smoke testinde gerçek `transferWithAuthorization` receipt kontrolü.

### AM-04 — Default settlement’ta durable application idempotency yok
- **Önem:** Yüksek
- **Kanıt:** `api/call-service.js:653`, `:675`, `:810`; Upstash ve `CALL_SERVICE_IDEMPOTENCY=enabled` olmadan default path nonce-first; store yok.
- **Etki:** USDC used-nonce double-spend’i sınırlar; ancak service delivery/refund/log duplicates ve partial failure recovery için kayıp/dengesizlik oluşabilir.
- **Önkoşul:** Browser retry, network timeout, serverless replay veya payment landed fakat provider response fail.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Mainnet’te Upstash + `CALL_SERVICE_IDEMPOTENCY=enabled` zorunlu; conjunction yoksa 503; CRON_SECRET protected recovery; timeout-after-payment ve duplicate retry integration testleri; restore/reconciliation runbook.

### AM-05 — Client USDC approvals unbounded
- **Önem:** Yüksek
- **Kanıt:** `src/components/panels/CallBuilder.tsx:600` ve `:814`; `ACTIVE_PPC_ADDRESS` ve CCTP TokenMessengerV2 `maxUint256` onayı.
- **Etki:** Vulnerable/compromised selected token counterpart, user’s full allowance’ını drain edebilir. Native Arc USDC ve user-controlled wallet için ağır risk.
- **Önkoşul:** Contract defect / route compromise / target contract’ta privilege misuse.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Exact requested amount approve veya kullanıcı seçerse bounded allowance; operation sonrası reset; UI’da token/spender/amounts açıkça gösterilir; bounded approval E2E test.

### AM-06 — `callServiceFor` arbitrary beneficiary’s açık çağrı kotasını doldurur
- **Önem:** Orta
- **Kanıt:** `contracts/PayPerCallV8.sol:124`; cap check `:349`, increment `:376`, `_decrementOpenCalls` timeout/complete path’te çalışır.
- **Etki:** Saldırgan ödeme yaparak target’ın `openCallsPerCaller` kapasitesini doldurup onu çağırmaya kapatabilir. Provider yine call başlatabilir; caller’s availability zarar görür.
- **Önkoşul:** Public provider + target address known + caps not yet refilled/used.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Sponsor imzası/onayı zorunlu ya da `callServiceFor` ayrı quota modeli; consent hash EIP-712; per-provider/per-caller rate limit; maxFill count; UI açık uyarı.

### AM-07 — Registry admin key arbitrary slasher authorize edebilir
- **Önem:** Orta/Yüksek (compromise senaryosu)
- **Kanıt:** `ServiceRegistryV8.sol:158`; registry key/timelock no documented public usage gates.
- **Etki:** Yetkilendirilen any slasher claims silent, bonds bypass edilebilir, provider stake kaybı oluşabilir.
- **Önkoşul:** AM-01.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Timelocked governance için public notice (24-72h); max quota; revocation direct; irrelevant slasher construction? Contract requirements; emergency broadcasting.

### AM-08 — Zero slash / zero-price provider unmetered spam
- **Önem:** Orta
- **Kanıt:** `ServiceRegistryV8.sol:461-464` terms validate but slash can be zero; PPC paid path checks expectedSlash >= price, free path bypass.
- **Etki:** Free provider with no slash economics enables massive RPC/indexer/dispute pressure; victim cannot rely on economic deterrence.
- **Önkoşul:** Provider config `pricePerCall=0`; public listing.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** Minimum `slashBps` mandatory, zero price restricted or stake-bonded; anti-spam credentials / price or rate floor.

### AM-09 — Pending terms proposal overwrite
- **Önem:** Düşük / Orta
- **Kanıt:** `ServiceRegistryV8.sol:272` pending update overwrite + timelock reset.
- **Etki:** Provider owner can chain proposals to suppress final execution; not direct theft but timelock semantics misleading.
- **Önkoşul:** Provider owner repeatedly posts update.
- **Güven:** Orta.
- **Gerekli düzeltme:** multi-slot or locked proposal; first-eta preserved; audit log and event note.

### AM-10 — Settle helper doesn’t explicitly verify final status
- **Önem:** Orta / low residual
- **Kanıt:** `api/_settle.js:15`, `:44`, `:46`; no explicit `receipt.status === 1`.
- **Etki:** ethers v6 normally throws on revert; future refactor/intercepted client may accept bad receipts. Not current exploit claim, defense-in-depth gap.
- **Önkoşul:** Library/API refactor or client trust issue.
- **Güven:** Orta.
- **Gerekli düzeltme:** status check, `to`/facade/method assertion, persist tx hash; fail if mismatch.

### AM-11 — `/api/*` public surface broad, CSP weak
- **Önem:** Düşük
- **Kanıt:** `vercel.json` `/api/*` CORS `*`; CSP only `frame-ancestors`, no script-src/connect-src; app still needs data public.
- **Etki:** Public endpoint by design; no credential impact; weaker browser isolation.
- **Önkoşul:** Compromised UI/dependency/browser attack.
- **Güven:** Orta.
- **Gerekli düzeltme:** isolate secret endpoints; add CSP for production; remove extraneous headers; public read-only endpoints documented.

### AM-12 — Dead client private-key path remains exported
- **Önem:** Düşük
- **Kanıt:** `src/lib/utils.ts:2`, `:112-125`; `cg_ar_key_*` sessionStorage → `privateKeyToAccount`; no setter found/imported.
- **Etki:** dead code future misuse; accidental import leaks key handling into client bundle.
- **Önkoşul:** developer misuse.
- **Güven:** Orta.
- **Gerekli düzeltme:** delete module or move into server-only path; ESLint boundary and tests; private key never client side.

### AM-13 — client examples mix server secrets with browser snippets
- **Önem:** Düşük / hygiene high
- **Kanıt:** `Nano.tsx` `CIRCLE_API_KEY`; `Providers.tsx` `PRIVATE_KEY` example.
- **Etki:** copy/paste may expose high-value server credentials in `VITE_*` or public repository/user issue.
- **Önkoşul:** user follows example naïvely.
- **Güven:** Orta.
- **Gerekli düzeltme:** code blocks “SERVER ONLY”, Circle example with frontend-safe Client Key only, warning UI; lint docs if possible.

### AM-14 — availability/SLA guarantee is not enforced
- **Önem:** Bilgi
- **Kanıt:** `ServiceRegistryV8.sol` stores target; `PayPerCallV8.sol` does not check availability; `tee-attestation` closed.
- **Etki:** UI overstatement risk, no hidden slash for availability.
- **Önkoşul:** marketing claim not matching implementation.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** UI text reviewed; independent merchant/uptime patrol/oracle process; README separates slash from availability.

### AM-15 — Arc-specific USDC assumptions not portable
- **Önem:** Bilgi
- **Kanıt:** Arc native asset + ERC-20 facade; no generic USDC semantics; `SLA_KEEPER` precompile.
- **Etki:** copied scripts overpay/underpay, double-count balance, wrong address.
- **Güven:** Yüksek.
- **Gerekli düzeltme:** every transaction verifies chain ID/token/precompile; no mainnet automation without explicit prompt; keep docs exact.

## Ana ağ çıkış kapısı

`CHECKLIST.md`: mevcut dağıtıma **FAIL**. Geçmesi gereken kapı en az: AM-01 governance/multisig, AM-03 fail-closed, AM-04 durable idempotency, AM-05 approvals, AM-02 deployed policy. AM-06 consent gap ayrıca resolve edilmeli veya açık olarak waiver’lanır.

## Önerilen düzeltme sırası
1. Admin/arbiter/appeal/treasury/slasher yetkilerini split + multisig/timelock.
2. Demo settlement fail-closed; production smoke testi.
3. Upstash idempotency + recovery test.
4. Exact/bounded allowance.
5. `callServiceFor` consent.
6. Deadline-bound disputes; remove dead secrets.
7. Fork test + incident drill + bağımsız review.

## Denetim sınırları

Bu bir formal verification veya profesyonel pen-test değildir. Sonuçlar statik kod ve salt-okunur evidence’a dayanır. Hiçbir ana ağ veya testnet işlemi bu rapor kapsamında gönderilmemiştir. Yerel makineden secret okunmamış/kopyalanmamıştır.
