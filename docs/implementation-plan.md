Kapsamlı audit başlatıyorum. Tüm kritik dosyaları paralel okuyorum. Plan modundayım. Tüm dosyaları read-only araçlarla kapsamlı okuyorum: Yeterince gördüm. Şimdi daha fazla kritik panel okuuyorum: Yeterince kapsamlı analiz yaptım. Build moduna geçmem gerekiyor. Tüm bulguları şimdi sunuyorum:

---

## Kapsamlı Audit Raporu — Tespit Edilen 22 Sorun

### 🔴 Kritik

| # | Sorun | Dosya |
|---|-------|-------|
| 1 | `ProgressTracker.tsx` satır 16: `markStep` render içinde çağrılıyor — her render'da state mutation, sonsuz döngü | ProgressTracker.tsx |
| 2 | `main.tsx`: ConnectKit `theme="midnight"` hardcoded — light tema seçilince modal koyu kalıyor | main.tsx |
| 3 | `Analytics.tsx` satır 5: `SUBGRAPH_URL` hardcoded — `CONFIG.subgraphUrl`'i kullanmıyor, yanlış URL olursa sessizce başarısız | Analytics.tsx |
| 4 | `App.tsx` Suspense fallback `background: #070b12` koyu hardcoded — light tema geçişinde flash | App.tsx |
| 5 | `useSubgraph` satır 5: `fetchProviders` import edilmiş ama schema hatası var — `maxResponseTime` field yok | lib/subgraph.ts |

### 🟡 Önemli

| # | Sorun | Dosya |
|---|-------|-------|
| 6 | `CgLanding.tsx` `SUBGRAPH_Q` satır 8: `providers { owner }` field'ı subgraph schema'sında yok | CgLanding.tsx |
| 7 | `index.css`: `body` `transition: background color` yok — tema geçişi flash yapıyor | index.css |
| 8 | `Sidebar.tsx`: `bulkcall` panel ID yok OPERATIONS grubunda — sadece advanced'da var | Sidebar.tsx |
| 9 | `AppShell.tsx`: `panels` map'te `"x402"` yok — `normalizePanel` ile `"x402"→"calls"` ama panels map'te `"x402"` key'i yok, hata fırlatabilir | AppShell.tsx |
| 10 | `vercel.json`: `/(.*) → /index.html` rewrite path-based routing'i bozuyor | vercel.json |
| 11 | `AppTopbar.tsx`: `copied` state `useEffect` cleanup yok — component unmount olursa timer leak | AppTopbar.tsx |
| 12 | `RoleModal.tsx`: `setMode` import edilmiş ama `useAppStore` TypeScript type'ında `setMode` tanımı eksik değil mi kontrol | store |

### 🟢 Küçük / Polishing

| # | Sorun | Dosya |
|---|-------|-------|
| 13 | `OnboardingWizard.tsx`: AppShell'de import edilmiş ama `visible` durumu mount/unmount yerine display:none ile yönetiliyor — her render'da hesaplanıyor | OnboardingWizard.tsx |
| 14 | `Overview.tsx` satır 81: `markStep` kullanımlarda `useEffect` dependency array'inde `markStep` eksik | Overview.tsx |
| 15 | `Notifications.tsx`: `useWatchContractEvent` sadece `CallStarted` ve `ReceiptSubmitted` dinliyor — her ikisi de aynı `PPC_ABI`, event adresi doğru mu kontrol gerekiyor | Notifications.tsx |
| 16 | `index.css` `.cg-hero-section`: `min-height` hâlâ kaldırılmış ama `padding-top: 40px` yetersiz — hero content kısa sayfada kaydırma olmadan görünmüyor | CgLanding CSS |
| 17 | `CgLanding.tsx`: `Reveal` komponenti `willChange: "opacity, transform"` eklenmiş ama `contain: "layout style"` yok — repaint pahalı | CgLanding.tsx |
| 18 | `UsdcBanner.tsx`: Faucet linki `faucet.circle.com` — Arc Testnet faucet farklı URL: `faucet.testnet.arc.io` | UsdcBanner.tsx |
| 19 | `Analytics.tsx`: `ARCSCAN` URL `explorer.testnet.arc.io` — doğru değil, `testnet.arcscan.app` olmalı | Analytics.tsx |
| 20 | `AppShell.tsx` keyboard shortcut: `G+O`, `G+C` — `keydown` event'i 2s timeout sonra sıfırlanıyor ama `cleanup` return edilmiyor | AppShell.tsx |
| 21 | `ProgressTracker.tsx`: `markStep("wallet")` kondisyonel render döngüsü — `useEffect` içine taşınmalı | ProgressTracker.tsx |
| 22 | `CgLanding` → `SparklineCanvas`: `devicePixelRatio` scale iki kez uygulanıyor — `resize()` + `useEffect` ikinci kez scale yapıyor | CgLanding.tsx |

---

**Onaylıyor musun?** "Yap" dersen Build moduna geçip tüm 22 sorunu düzelteceğim.
