# Marketplace Premium UI Redesign

## Özet
`src/components/panels/Marketplace.tsx` (Browse Providers) panelini komple yeniden yaz. Landing sayfasına dokunma. Arc Dark + glassmorphism + canvas animasyonları + profesyonel UX.

## Tasarım Kararları
- **Layout:** Desktop grid (3 kolon) + mobilde tek kolon swipeable kartlar. Sol üstte hero header + particle canvas arka plan.
- **Görsel Stil:** Arc Dark, glass surfaces (backdrop-blur), neon yeşil/mor vurgular, glow efektler.
- **Canvas:** Header'da particle network ağı + her provider kartında canvas sparkline (reputation trend).
- **UX:** Canlı stats bar (toplam/aktif/avg honor/elite count), honor ring SVG her karta, tier badge (Elite/Pro/Standard/At Risk), compare modal, list/grid toggle, animated skeleton loading.

## Dosyalar

| # | Dosya | İşlem |
|---|---|---|
| 1 | `src/components/panels/Marketplace.tsx` | Komple yeniden yaz |
| 2 | `src/index.css` | `.mp-*` CSS class'ları ekle |

## Build Sequence
1. `Marketplace.tsx` yeniden yaz — ParticleCanvas, SparklineCanvas, HonorRing, TierBadge, ProviderCard, StatsBar, CompareModal, SortBtn bileşenleri
2. `src/index.css`'e `.mp-root`, `.mp-hero`, `.mp-card`, `.mp-metrics`, `.mp-grid` vb. CSS ekle
3. TypeScript sıfır hata — `tsc --noEmit`
4. Commit + push

## Başarı Kriteri
- [ ] Header'da particle network canvas animasyonu çalışıyor
- [ ] Her kart sparkline canvas çiziliyor (hover'da glow)
- [ ] Honor ring SVG rate gösteriyor, renkli (yeşil/sarı/kırmızı)
- [ ] Tier badge (Elite/Pro/Standard/At Risk) görünüyor
- [ ] Stats bar (total/active/avgHonor/totalCalls/elite) doluyor
- [ ] Compare modal çalışıyor (max 4 provider)
- [ ] Grid/List toggle çalışıyor
- [ ] Mobile tek kolon, touch-friendly 44px tap targets
- [ ] Skeleton loading animasyonu var
- [ ] TypeScript sıfır hata

## Notlar
- Landing sayfası (`CgLanding.tsx`) kesinlikle değiştirilmeyecek
- Blockchain/wagmi/subgraph entegrasyonları korunacak (`useProviders`, `setPanel`, `formatUnits`)
- Tüm renkler CSS var() token'ları kullanacak (`--accent`, `--bg-1`, `--border` vb.)

---

# Pixel-Perfect HTML → Vite Migration Plan (Archived)

## Özet
23.413 satırlık orijinal HTML'deki tasarımı mevcut Vite/React projesine birebir taşı. Orijinal tasarım korunmalı, işlevsellik bozulmamalı.

## Mevcut Durum Tespiti

### CSS Durumu (index.css — 735 satır)
- CSS tokenları (`--bg-0` → `--bg-3`, `--border`, `--accent` vb.) orijinal HTML ile **birebir eşleşiyor**
- `[data-theme="light"]` override kuralları mevcut
- Layout (`.app-shell`, `.topbar`, `.sidebar`, `.main-content`) mevcut
- Butonlar, kartlar, formlar, tablolar, badge'ler, tab'lar mevcut
- Mobile responsive (768px, 480px) mevcut
- Animasyonlar (`spin`, `panel-enter`, `stagger-in`, `pulse-dot`) mevcut

### Eksik CSS Kuralları (orijinal HTML'de var, index.css'de yok)
1. **Live bar / ticker** — `.live-bar`, `.live-bar-item`, `.live-bar-label`, `.live-bar-val` tam stilleri
2. **Panel içi class'lar** — `.cg-panel`, `.panel-head`, `.panel-head-icon`, `.panel-head-info`, `.panel-body`
3. **Field/form** — `.field`, `.field-row`, `.field label` (`.form-group`/`.form-label` var ama HTML'deki eski class'lar da kullanılıyor)
4. **Stat varyantları** — `.stat-card.danger`, `.stat-card.warn`, `.stat-card.info`, `.stat-card.success`
5. **SLA countdown bar** — `.sla-bar`, `.sla-bar-item`, `.sla-bar-countdown`
6. **Honor rate gauge** — `.gauge-wrap`, `.gauge-arc`, `.gauge-label`
7. **Mode labels** — `[data-mode="simple"]`, `[data-mode="pro"]` sidebar etiket gösterimi
8. **Sidebar collapse** — `.sb-advanced-toggle`, `.sb-advanced-body`
9. **Empty/error state** — `.empty-state`, `.error-state` standart görünümler
10. **Loading skeleton** — `.skeleton`, `.skeleton-row`, `.skeleton-text`
11. **Toast/notification** — `.toast`, `.toast-success`, `.toast-danger`
12. **Modal** — `.modal-overlay`, `.modal`, `.modal-header`, `.modal-body`
13. **CgLanding özel class'lar** — `.cg-landing`, `.cg-ticker`, `.cg-hero`, `.cg-stat-bar`, `.sparkline-svg`, `.role-cards` vb.
14. **Body sınıfı uyumsuzluğu** — orijinal HTML `body.dark` kullanıyor ama Vite `data-theme` attribute kullanıyor

### Bileşen Durumu

#### Çalışıyor
- AppShell grid layout ✓
- Sidebar (tüm gruplar, ikonlar, badge'ler) ✓
- AppTopbar (hamburger, logo, net-pill, balance, tema, Simple/Pro, ⌘K) ✓
- LiveBar ✓
- CommandPalette ✓
- OnboardingWizard ✓
- MobileBottomNav ✓
- 30+ panel (Overview, CallBuilder, Register, Verify vb.) ✓

#### Eksik / Bozuk
1. **CgLanding sparkline** — `<canvas>` elemanı var ama orijinal HTML'deki `drawSparkline()` JS animasyonu yok; Vite'ta statik SVG kullanılıyor — canvas animasyonu eklenecek
2. **CgLanding particle dots** — orijinal HTML'de floating dot animasyonları var (CSS `@keyframes float-dot`) — eksik
3. **Overview gauge animasyonu** — honor rate gauge'in arc animasyonu orijinal HTML'de `stroke-dasharray` animasyonlu SVG — eksik
4. **LiveBar honor gauge** — orijinal HTML'de `<canvas>` gauge var; Vite'ta CSS semi-circle ile simüle ediliyor — canvas gauge eksik
5. **CgLanding terminal animasyonu** — orijinal HTML'de döngüsel typing animasyonu var; Vite'ta basit static render var — typing animasyonu eksik
6. **Overview "Live Activity" feed** — orijinal HTML'de gerçek zamanlı subgraph pull ile animasyonlu feed var — eksik
7. **Sidebar "Simple/Pro" label gizleme** — `[data-mode="simple"]` seçicisiyle bazı menü öğeleri gizleniyor — CSS eksik
8. **Dark/Light tema geçişi** — `data-theme` attribute değişiyor ama bazı bileşenler `bg-0` yerine Tailwind class'ları kullanıyor — tutarsız
9. **Panel `cg-panel` class'ları** — panellerde `.cg-panel` yerine karışık Tailwind + custom CSS kullanılıyor
10. **History, Requests, Receipts tabloları** — orijinal `.table` class'ı yerine Tailwind class'ları kullanılıyor — stil uyumsuzluğu

### Mimari Farklar
- Orijinal: vanilla HTML/CSS/JS, tek dosya
- Vite: React + TypeScript + Tailwind + wagmi + ConnectKit + Zustand
- Problem: Tailwind class'ları ile custom CSS class'ları karışık kullanılıyor — bazı paneller orijinal `.card`, `.btn`, `.input` kullanıyor, bazıları Tailwind utility class'ları kullanıyor

## Build Sequence

### Adım 1 — index.css eksik CSS kurallarını ekle
Orijinal HTML `<style>` bloğundan şu class'ları index.css'e ekle:
- `.cg-panel`, `.panel-head`, `.panel-head-icon`, `.panel-head-info`, `.panel-body`
- `.field`, `.field-row`, `.field label`, `.field-hint`  
- `.stat-card.danger`, `.stat-card.warn`, `.stat-card.info`, `.stat-card.success` renk varyantları
- `.gauge-wrap`, `.gauge-arc`, `.gauge-label`, `.gauge-val`
- `.sla-bar`, `.sla-bar-item`, `.sla-bar-countdown`
- `.empty-state`, `.error-state`
- `.skeleton`, `.skeleton-row`, `.skeleton-text`, `.skeleton-shimmer` animasyonu
- `[data-mode="simple"] .sb-pro-only`, `[data-mode="pro"] .sb-simple-only` görünürlük kuralları
- `.toast`, `.toast-container`, `.toast-success`, `.toast-danger`
- CgLanding class'ları: `.cg-ticker`, `.cg-hero`, `.cg-stat-bar`, `.cg-sparkline`, `.cg-role-card`, `.cg-terminal`
- Particle animasyonu: `@keyframes float-dot`, `.particle`

### Adım 2 — CgLanding canvas sparkline + particle animasyonları
Orijinal HTML'deki:
- `drawSparkline(canvas, data, color)` fonksiyonu → `SparklineCanvas.tsx` bileşeni
- Floating particle dots → CSS `@keyframes float-dot` + `ParticleDots.tsx`
- Terminal typing animasyonu → `useTypewriter` hook + döngüsel terminal output

### Adım 3 — LiveBar honor gauge (canvas)
Orijinal HTML'deki `drawHonorGauge(canvas, rate)` → `HonorGauge.tsx` (canvas-based)

### Adım 4 — Overview Live Activity feed
Subgraph poll her 10s, animasyonlu satır ekleme (slide-in), `LIVE` pulse dot

### Adım 5 — Sidebar Simple/Pro CSS kuralları
`[data-mode="simple"]` → Pro-only menü öğelerini gizle
`[data-mode="pro"]` → Tüm öğeleri göster
`AppShell` → `document.body.setAttribute("data-mode", mode)` ekle

### Adım 6 — Panel CSS tutarlılığı
Her panelde Tailwind utility class'ları yerine `.card`, `.btn`, `.input`, `.badge`, `.tabs`, `.tab`, `.table` class'larını kullan:
- `Overview.tsx` — stat-card class'ları
- `Requests.tsx`, `Receipts.tsx`, `History.tsx` — `.table` class'ı
- `CallBuilder.tsx` — `.btn`, `.input`, `.form-group`, `.form-label`
- `Register.tsx` — form elemanları
- `Leaderboard.tsx` — tablo

### Adım 7 — Dark/Light tema tutarlılığı
- `AppShell` + `CgLanding` → `document.body.setAttribute("data-theme", theme)` ✓ (zaten var)
- Tüm paneller inline style veya Tailwind yerine CSS var() kullanıyor olmalı
- `[data-theme="light"]` için override kurallarını genişlet

### Adım 8 — Typecheck + build + push

## Dosyalar (Değiştirilecek)

| # | Dosya | Değişiklik |
|---|-------|------------|
| 1 | `src/index.css` | Eksik 14 CSS grup eklendi |
| 2 | `src/components/CgLanding.tsx` | Canvas sparkline, particles, terminal animasyonu |
| 3 | `src/components/layout/LiveBar.tsx` | Canvas honor gauge |
| 4 | `src/components/layout/AppShell.tsx` | `data-mode` body attribute |
| 5 | `src/components/layout/Sidebar.tsx` | `sb-pro-only` / `sb-simple-only` class'ları |
| 6 | `src/components/panels/Overview.tsx` | Live activity feed, animasyonlu stat-card'lar |
| 7 | `src/components/panels/Requests.tsx` | `.table` class |
| 8 | `src/components/panels/Receipts.tsx` | `.table` class |
| 9 | `src/components/panels/History.tsx` | `.table` class |
| 10 | `src/components/panels/CallBuilder.tsx` | `.cg-panel`, `.btn`, `.input` class'ları |

## Yeni Dosyalar

| Dosya | İçerik |
|-------|--------|
| `src/hooks/useTypewriter.ts` | Döngüsel typing animasyonu hook'u |

## Başarı Kriteri
- [ ] Dark/Light tema anında geçiş yapıyor, tüm bileşenler doğru renk kullanıyor
- [ ] Simple modda Advanced menü öğeleri gizli, Pro'da görünür
- [ ] CgLanding: sparkline canvas animasyonu çalışıyor
- [ ] CgLanding: terminal typing animasyonu döngüsel çalışıyor
- [ ] LiveBar: canvas honor gauge çalışıyor
- [ ] Overview: "Live Activity" feed subgraph'tan canlı geliyor
- [ ] Tüm tablolar `.table` class'ı kullanıyor
- [ ] Tüm butonlar `.btn` / `.btn-primary` class'ı kullanıyor
- [ ] Mobile: hamburger açılıyor, sidebar drawer animasyonlu
- [ ] TypeScript sıfır hata
- [ ] Vercel build başarılı

## Notlar
- `app/app/index.html` kaynak HTML dosyası — tüm CSS referansı buradan alınıyor
- Blockchain entegrasyonlarına (wagmi, ABI, config.ts) dokunulmayacak
- Tailwind konfigürasyonu değiştirilmeyecek — sadece class kullanımı tutarlı hale getirilecek
