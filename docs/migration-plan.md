# CallGuard — HTML → Vite Migration: Kapsamlı Parity Planı

Oluşturulma: 2026-10-05  
Kaynak: `app/app/index.html` (23.413 satır)  
Hedef: `src/` (Vite + React + wagmi v2 + viem)

---

## GENEL DURUM ÖZETİ

| Alan | Durum |
|---|---|
| Sidebar nav items (23 adet) | ✅ EXISTS — birebir HTML ile eşleşiyor |
| AppTopbar (connect/addr/USDC/EURC/USYC/theme/mode) | ✅ EXISTS |
| LiveBar (clock + SLA gauge) | ✅ EXISTS |
| AppShell (layout, hamburger, sidebar overlay) | ✅ EXISTS |
| CSS design tokens | ✅ EXISTS — index.css |
| Toast / notification sistemi | ⚠️ PARTIAL — `sonner` kullanıyor, HTML'deki `window.toast` yok |
| Tab title unseen counter | ❌ MISSING |
| `setLoading` global (tüm butonları disable) | ⚠️ PARTIAL — her panel kendi loading state'ini yönetiyor |
| `waitWithFinality` (Arc sub-second finality) | ❌ MISSING — utility yok |
| `short()` / `txLink()` / `addrLink()` utilities | ⚠️ PARTIAL — her panel kendisi kesiyor |
| `window.connect` / `window.toast` global'ler | ❌ MISSING — wagmi hook'ları var ama global değil |
| Role choice modal (first connect) | ❌ MISSING |
| Welcome box (3-step onboarding, localStorage) | ⚠️ PARTIAL — OnboardingWizard var ama wallet connect'e bağlı değil |
| Onboarding bar (steps 1-3, dismissible) | ✅ EXISTS — AppShell'de var |
| Particle canvas (landing hero) | ❌ MISSING |
| Terminal mockup animation (landing) | ❌ MISSING |
| Count-up animation | ❌ MISSING |
| Panel entrance stagger animation | ❌ MISSING |

---

## SIDEBAR — KARŞILAŞTIRMA

HTML sırası vs Vite sırası:

| HTML `data-nav` | Label (simple/pro) | Vite `PanelId` | Durum |
|---|---|---|---|
| `overview` | Home / Overview | `overview` | ✅ |
| `x402` | Pay with x402 / x402 Calls | `calls` | ⚠️ ID farklı: HTML=`x402`, Vite=`calls` |
| `marketplace` | Browse / Services | `marketplace` | ✅ |
| `calls` | My Requests / Requests | `requests` | ⚠️ ID farklı: HTML=`calls`, Vite=`requests` |
| `providers` | Providers | `providers` | ✅ |
| `nano` | Nano Pay / Nanopayments | `nano` | ✅ |
| `analytics` | Analytics | `analytics` | ✅ |
| `disputes` | Disputes | `disputes` | ✅ |
| — Advanced toggle — | — | — | ✅ |
| `quality` | Quality | `quality` | ✅ |
| `agent` | Agent Loop | `agent` | ✅ |
| `lending` | RepFi Lending | `lending` | ✅ |
| `futures` | SLA Futures | `futures` | ✅ |
| `attestation` | SLA Bridge | `attestation` | ✅ |
| `subscriptions` | Subscriptions | `subscriptions` | ✅ |
| `jobs` | Claims | `jobs` | ✅ |
| — Developer section — | — | — | ✅ |
| `mcp` | API / API / MCP | `mcp` | ✅ |
| `webhooks` | Webhooks | `webhooks` | ✅ |
| `notifications` | Notifications | `notifications` | ✅ |
| `leaderboard` | Leaderboard | `leaderboard` | ✅ |
| — System section — | — | — | ✅ |
| `history` | History / Tx History | `history` | ✅ |
| `apidocs` | API Docs | `apidocs` | ✅ |
| `register` | Become a Provider / Register | `register` | ✅ |
| `verify` | Verify / Verify Receipt | `verify` | ✅ |
| `settings` | Settings | `settings` | ✅ |

**KRİTİK:** HTML'de `x402` paneli = Vite'da `calls` (CallBuilder). HTML'de `calls` = Vite'da `requests` (Requests).  
Sidebar'daki etiketler doğru ama `data-nav` değerleri HTML ile tam eşleşmiyor. Bu deep-link ve external script'leri kırar.

---

## PANEL PARITY — DETAYLI

### 1. Overview / Dashboard
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| Stats bar (Providers/Calls/Receipts/Slashed) | ✅ Goldsky | ✅ Goldsky | ✅ |
| Honor rate gauge | ✅ | ✅ LiveBar'da | ✅ |
| Welcome box (3-step, localStorage dismiss) | ✅ | ⚠️ Ayrı wizard var, wallet connect'e bağlı değil | ⚠️ PARTIAL |
| Action cards (Register/Call/Request) | ✅ | ✅ | ✅ |
| Starter preset banner (fill defaults) | ✅ inline btn | ⚠️ Register'da var, Overview'da yok | ⚠️ PARTIAL |
| My Calls feed (loadMyCalls) | ✅ | ⚠️ Requests panelinde var | ⚠️ PARTIAL |
| Live event feed (subscribeToEvents) | ✅ | ✅ watchContractEvent | ✅ |
| Leaderboard (Bayesian reputation) | ✅ Goldsky | ✅ ayrı panel | ✅ |
| 24h activity chart | ✅ | ✅ | ✅ |
| Top providers bar | ✅ | ✅ | ✅ |
| Count-up animation (cgCountUp) | ✅ | ❌ MISSING | ❌ |
| Panel entrance stagger | ✅ | ❌ MISSING | ❌ |
| wsGoRegister / wsGoCall buttons | ✅ | ❌ MISSING (Welcome box'ta olmalı) | ❌ |
| Role choice modal (first connect) | ✅ | ❌ MISSING | ❌ |

### 2. CallBuilder (HTML: `x402` → Vite: `calls`)
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| doCall() — ERC-20 approve + callService | ✅ | ✅ | ✅ |
| doReceipt() — EIP-712 submitReceipt | ✅ | ✅ | ✅ |
| doTimeout() — claimTimeout | ✅ | ✅ | ✅ |
| doRouter() — auto-router (rep+price sort) | ✅ | ✅ | ✅ |
| doMultiCall() — multi-provider sequential | ✅ | ✅ | ✅ |
| doMultiCallNative() — Multicall3From aggregate3 | ✅ | ⚠️ Eksik Multicall3From contract | ⚠️ PARTIAL |
| doX402Call() — EIP-3009 off-chain sign | ✅ | ✅ | ✅ |
| Budget cap (updateBudgetDisplay, checkBudget, recordSpend) | ✅ | ❌ MISSING | ❌ |
| confirmTx modal (transaction confirm dialog) | ✅ | ❌ MISSING | ❌ |
| friendlyError() | ✅ | ❌ MISSING — generic catch | ⚠️ PARTIAL |
| checkNoPendingTx() | ✅ | ❌ MISSING | ❌ |
| gas estimator | ❌ HTML'de yok | ✅ Vite'da var | ✅ |
| Auto-receipt setup (openAutoReceiptSetup) | ✅ | ❌ MISSING | ❌ |
| CSV batch import | ❌ HTML'de yok | ✅ BulkCall panelinde | ✅ |

### 3. Providers
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| refreshAllProviders() Goldsky-first | ✅ | ✅ | ✅ |
| renderAllProviders() table | ✅ | ✅ | ✅ |
| openProviderModal() — detay modal | ✅ büyük modal | ✅ ayrı ProviderProfile panel | ✅ |
| Search/filter | ✅ | ✅ | ✅ |
| Ping endpoint | ✅ | ✅ | ✅ |
| sparkline bars | ✅ inline SVG | ❌ MISSING | ❌ |
| autoReceipt toggle per provider | ✅ | ❌ MISSING | ❌ |
| Provider modal: Goldsky analytics tab | ✅ | ⚠️ ProviderProfile'da kısmi | ⚠️ PARTIAL |

### 4. Register
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| doRegister() — approve + register | ✅ | ✅ | ✅ |
| doDeactivate() | ✅ | ✅ | ✅ |
| doUnstake() | ✅ | ✅ | ✅ |
| doRegisterV2() — ERC-8004 NFT | ✅ | ✅ | ✅ |
| refreshProvider() | ✅ | ✅ | ✅ |
| renderProvider() — current provider panel | ✅ | ✅ | ✅ |
| checkAutoReceiptStatus() | ✅ | ❌ MISSING | ❌ |
| Starter preset "Fill recommended" button | ✅ | ✅ Register + Overview'da | ✅ |
| Economics calculator | ❌ HTML'de yok | ✅ Vite'da var | ✅ |

### 5. Jobs (ERC-8183)
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| 5-step wizard | ✅ | ✅ | ✅ |
| doCreateJob() | ✅ | ✅ | ✅ |
| doSetBudget() | ✅ | ✅ | ✅ |
| doFundJob() — approve + fund | ✅ | ✅ | ✅ |
| doSubmitJob() | ✅ | ✅ | ✅ |
| doCompleteJob() | ✅ | ✅ | ✅ |
| loadMyJobs() — Goldsky | ✅ | ✅ | ✅ |
| Role badges (Client/Provider/Evaluator) | ✅ | ✅ | ✅ |

### 6. Requests (HTML: `calls` panel)
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| loadMyCalls() — Goldsky + RPC fallback | ✅ | ✅ | ✅ |
| renderCalls() table | ✅ | ✅ | ✅ |
| claimTimeout() per call | ✅ | ✅ | ✅ |
| claimAllTimeouts() | ✅ | ✅ | ✅ |
| SLA countdown timer per call | ✅ | ✅ | ✅ |
| Export CSV/JSON | ❌ HTML'de yok | ✅ | ✅ |

### 7. Analytics
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| loadAnalytics() — Goldsky | ✅ | ✅ | ✅ |
| 4 stat cards | ✅ | ✅ | ✅ |
| Provider activity bar chart | ✅ | ✅ | ✅ |
| Recent calls list | ✅ | ✅ | ✅ |
| refreshProviderDashboard() sparklines | ✅ | ❌ MISSING | ❌ |

### 8. Nano
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| fetchNanoBalance() | ✅ | ✅ | ✅ |
| doNanoCall() — Circle Gateway | ✅ | ✅ | ✅ |
| doX402Call() — EIP-3009 | ✅ | ✅ | ✅ |
| Budget display (updateBudgetDisplay) | ✅ | ❌ MISSING | ❌ |

### 9. MCP
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| Setup guide 4 steps | ✅ | ✅ | ✅ |
| OS detection copy buttons | ✅ | ✅ | ✅ |
| x402 live tester | ✅ | ✅ | ✅ |
| Remote SSE endpoint | ✅ | ✅ | ✅ |
| Example prompts | ✅ | ✅ | ✅ |
| switchSdkLang() | ✅ | ❌ MISSING | ❌ |

### 10. Wallet / Global
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| connect() — MetaMask + ensureArcNetwork | ✅ | ✅ wagmi | ✅ |
| disconnect() | ✅ | ✅ | ✅ |
| accountsChanged listener | ✅ | ✅ wagmi auto | ✅ |
| chainChanged listener | ✅ | ✅ wagmi auto | ✅ |
| refreshBalance() USDC+EURC+USYC | ✅ | ✅ | ✅ |
| fetchUsdcUsdRate() Band oracle (wallet-only) | ✅ | ✅ | ✅ |
| usdPrice() | ✅ | ✅ | ✅ |
| waitWithFinality() | ✅ | ❌ MISSING | ❌ |
| window.toast global | ✅ | ❌ MISSING | ❌ |
| window.cgCountUp | ✅ | ❌ MISSING | ❌ |

### 11. CSS / Visual
| Özellik | HTML | Vite | Durum |
|---|---|---|---|
| Design tokens (--bg-0 ... --accent vb.) | ✅ | ✅ | ✅ |
| Dark / light theme toggle | ✅ | ✅ | ✅ |
| Animated radial bg (green top-left, blue bottom-right) | ✅ | ⚠️ Statik var | ⚠️ PARTIAL |
| Toast styling | ✅ | ✅ sonner | ✅ |
| Mobile bottom nav (4 items) | ✅ | ⚠️ PARTIAL — var ama 4-item değil | ⚠️ PARTIAL |
| Particle canvas | ✅ | ❌ MISSING | ❌ |
| Terminal mockup animation | ✅ | ❌ MISSING | ❌ |
| Panel stagger entrance | ✅ | ❌ MISSING | ❌ |
| Tip tooltips (data-tip) | ✅ | ❌ MISSING | ❌ |
| simple-mode CSS visibility rules | ✅ | ✅ Vite'da JS ile | ✅ |

---

## ÖNCELİK SIRASI

### P0 — KRİTİK (fonksiyon bozuk)
1. **`x402` → `calls` ID mapping**: Sidebar'da HTML `x402` data-nav = Vite `calls` PanelId. External script/deep-link uyumu için `x402` alias ekle.
2. **`calls` → `requests` ID mapping**: Aynı sorun. HTML `calls` = Vite `requests`.
3. **`doMultiCallNative()`**: Multicall3From contract eksik — config'e ekle, CallBuilder'da implement et.
4. **`confirmTx` modal**: Büyük TX'ler (register, call) için onay dialogu eksik.
5. **Budget cap** (`updateBudgetDisplay`, `checkBudget`, `recordSpend`): Settings'te var ama CallBuilder/Nano'ya bağlı değil.
6. **`waitWithFinality()`**: Arc sub-second finality utility — tüm TX'lerde kullanılmalı, finality badge göstermeli.

### P1 — ÖNEMLİ (özellik eksik)
7. **Welcome box** wallet connect'e bağla: `showConnected()` çalışınca localStorage'da yoksa göster.
8. **Role choice modal**: İlk bağlanmada "Caller/Provider" seçimi — `cg_role_chosen` localStorage key.
9. **Tab title unseen counter**: `bumpUnseen()` — event geldiğinde tab title'a `(N)` ekle.
10. **Auto-receipt**: `checkAutoReceiptStatus()`, `openAutoReceiptSetup()`, `saveAutoReceiptKey()` — provider her call'u otomatik receipt etsin.
11. **sparklines**: Provider table'da her provider için mini 8-bar aktivite grafiği.
12. **`checkNoPendingTx()`**: Call açmadan önce pending TX kontrolü.
13. **`friendlyError()`**: Contract error mesajlarını kullanıcı dostu metne çevir.

### P2 — GÖRSEL / UX
14. **Panel stagger entrance animation**: Panel değişince `opacity: 0 → 1`, `translateY(10px → 0)`.
15. **Count-up animation**: Stats değerleri animasyonlu sayar.
16. **Particle canvas**: Landing page'de canvas particle efekti.
17. **Terminal mockup animation**: Landing page'deki döngüsel terminal simülasyonu.
18. **Animated radial bg**: `@keyframes` ile hareket eden bg gradyanı.
19. **Tip tooltips**: `data-tip` attribute'u olan `?` spanlar için tooltip.
20. **Mobile bottom nav**: 4 item (Overview/Providers/Payments/More).
21. **`switchSdkLang()`**: MCP panelinde dil seçici (JS/Python/curl).

---

## SIRADAKI ADIMLAR

Sırayla yapacağız:

1. **P0-1**: `x402` + `calls` ID alias — AppStore'a ekle, Sidebar'a `data-nav` attribute ile eski key'leri map et
2. **P0-2**: `waitWithFinality()` utility — `src/lib/finality.ts`
3. **P0-3**: `friendlyError()` utility — `src/lib/errors.ts`  
4. **P0-4**: Budget cap → CallBuilder + Nano bağlantısı
5. **P0-5**: `doMultiCallNative()` Multicall3From
6. **P0-6**: `confirmTx` modal component
7. **P1-1**: Welcome box wallet-connect bağlantısı + Role choice modal
8. **P1-2**: Tab title unseen counter
9. **P1-3**: Auto-receipt feature
10. **P1-4**: sparklines provider table'da
11. **P2**: Animasyonlar, tooltips, mobile nav

Her adım: kod yaz → build → push → devam.
