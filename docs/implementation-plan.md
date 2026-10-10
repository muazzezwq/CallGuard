Tüm panelleri ve mevcut yapıyı paralel okuyorum. Plan modundayım. Dosyaları okuyabilirim: Tam resmi görüyorum. Şimdi planı oluşturup kaydediyorum: Plan `arc-studio-plans/app-ux-redesign.md`'e kaydedildi.

---

## Analiz Özeti

**30 panel incelendi.** Temel sorunlar:

**Layout:**
- Topbar'da elemanlar gruplandırılmamış, sıkışık
- Panel alanı `padding-bottom` yok → footer içerikle çakışıyor
- Mobile nav'da Search butonu eksik

**Panel CSS:**
- Hepsi inline `style={}` kullanıyor → tutarsız spacing, tema geçişinde sorunlar
- `maxWidth: 860` dar — geniş ekranda boş alan
- Stat kartlarda renkli accent border yok
- Empty state sadece metin, görsel yok

**Eksik bileşenler:**
- **Footer/Docs yok** — Arc Docs, Circle Docs, GitHub, ArcScan, Faucet, Security linkleri hiç yok
- Breadcrumb yok — hangi panelde olduğunu gösteren gösterge
- Loading skeleton tutarsız

**Plan:**
1. `index.css` — panel token standardizasyonu + footer CSS
2. `AppFooter.tsx` — yeni docs/links bileşeni
3. `AppShell` — footer entegrasyonu + mobile nav
4. `AppTopbar` — breadcrumb
5. `Overview`, `CallBuilder`, `Providers`, `Receipts` — layout polish
6. TypeScript sıfır hata, push yok

**Onaylıyor musun?** → "Yap" dersen Build modunda hepsini uyguluyorum.
