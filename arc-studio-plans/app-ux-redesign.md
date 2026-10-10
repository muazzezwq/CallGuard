# App UI/UX Redesign Plan

## Summary
CallGuard dApp iç tasarımını kapsamlı iyileştirme. 30 panel, layout bileşenleri, footer/docs bölümü. Tüm fonksiyonlar korunur, sadece görsel/UX iyileştirilir. Push yapılmaz.

## Tespit Edilen Sorunlar

### Layout Shell
- Topbar: Simple/Pro toggle + net pill + balance + tema + adres hepsi sıkışık → gruplandır
- Sidebar: section başlıkları `var(--text-faint)` çok soluk → biraz belirgin
- LiveBar: Honor gauge metni kesiliyor mobile'da
- AppShell: panel area `overflow-y:auto` ama `padding-bottom` yok → footer içerikle örtüşüyor
- Mobile bottom nav: 4 item, Search eksik

### Panel CSS Sorunları (hepsi inline style kullanıyor)
- `s.page { maxWidth:860 }` → 1100px'e çıkar (geniş ekranda boş alan)
- `grid4: gridTemplateColumns:"repeat(2,1fr)"` → desktop'ta 4 sütun olmalı
- Stat kartları: border-left renkli accent eksik
- Tüm paneller: `padding:"20px 16px"` → consistent değil, bazısı 24px bazısı 16px

### Eksik UX Bileşenleri
- **Footer/Docs** hiç yok — her panelin altına sabit docs bölümü eklenecek
- **Empty state** görselleri yok — sadece metin var
- **Loading skeleton** sadece bazı panellerde var
- **Breadcrumb** yok — hangi panelde olduğunu gösteren topbar breadcrumb

## Değiştirilecek Dosyalar

### 1. index.css
- Panel container sınıfları standardize et
- Stat kart accent border-left renkleri
- Footer/docs CSS
- Breadcrumb CSS

### 2. AppShell.tsx
- Mobile bottom nav'a Search ekle
- Panel area'ya padding-bottom ekle (footer için)
- Footer render et

### 3. AppTopbar.tsx  
- Topbar'a breadcrumb (aktif panel adı) ekle
- Balance + adres grubu daha düzenli

### 4. Sidebar.tsx
- Section başlıkları biraz daha belirgin
- Aktif item left border accent

### 5. Yeni: AppFooter.tsx
- Docs linkler: Arc Docs, Circle Docs, GitHub, ArcScan, Faucet, API Docs, Security
- Contract adresleri kopyalanabilir
- Version bilgisi

### 6. Overview.tsx
- stat grid 4 kolon (desktop)
- Activity chart daha büyük
- Welcome wizard daha şık

### 7. CallBuilder.tsx
- Sol/sağ panel layout daha temiz
- Execution summary kartı daha belirgin

### 8. Providers / Marketplace
- Provider kart grid daha havadar
- Honor rate bar renkli

### 9. Receipts / Requests / Payments
- Tablo layout → kart list (mobile friendly)
- Boş durum görseli

### 10. Tüm paneller
- Consistent `cg-panel-page` wrapper class
- Section başlıkları `cg-section-head` class

## Build Sequence
1. index.css — panel token standardizasyonu + footer CSS
2. AppFooter.tsx — yeni bileşen
3. AppShell.tsx — footer + mobile nav
4. AppTopbar.tsx — breadcrumb
5. Overview.tsx — stat grid + chart
6. CallBuilder.tsx — layout polish
7. Providers/Marketplace — kart polish
8. Receipts/Requests/Payments — tablo → kart
9. Typecheck sıfır hata

## Done When
- [ ] Tüm paneller `cg-panel-page` class kullanıyor
- [ ] Footer her panelin altında görünüyor
- [ ] Mobile bottom nav 5 item (+ Search)
- [ ] Overview stat grid 4 kolon desktop
- [ ] Typecheck sıfır hata
- [ ] Push yok — local hazır

## Kısıtlamalar
- Contract adresleri, ABI, wallet bağlantısı, iş mantığı DEĞİŞMEZ
- Yeni bağımlılık eklenmez
- Push yapılmaz (kullanıcı onayı gerekir)
