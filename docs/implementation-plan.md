Kapsamlı analiz başlatıyorum. Önce orijinal HTML'den tüm CSS'i çıkarıyorum. Orijinal HTML'den CSS'i tam olarak çıkarıyorum:Plan modundayım — kod çalıştıramam, sadece plan yazabilirim. Kapsamlı plan oluşturuyorum.

Önce mevcut durumu anlayalım: Devam ediyorum — CSS'in geri kalanını ve orijinal HTML CSS'ini paralel okuyorum: CSS'i tam okudum. Şimdi orijinal HTML'deki CSS ile karşılaştırma yapıyorum. Kritik eksiklikleri tespit ediyorum: Tam bir analiz tamamlandı. Şimdi plan yazıyorum: Plan `arc-studio-plans/PLAN.md` olarak kaydedildi.

---

## Bulguların Özeti

**İyi haber:** CSS tokenları, layout, sidebar, topbar, butonlar, kartlar, formlar, tablolar, badge'ler, animasyonlar — hepsi orijinal HTML ile **birebir eşleşiyor**. Temel yapı sağlam.

**Gerçek eksiklikler (10 madde):**

| # | Sorun | Etki |
|---|-------|------|
| 1 | `cg-panel`, `panel-head`, `field` class CSS'leri eksik | Panel içleri stil yok |
| 2 | `stat-card` renk varyantları (danger/warn/info) eksik | Overview renkler hatalı |
| 3 | Sparkline **canvas animasyonu** yok, statik SVG var | Landing page cansız |
| 4 | Terminal **typing animasyonu** döngüsel değil | Landing page statik |
| 5 | LiveBar honor **canvas gauge** yok, CSS circle var | Gauge orijinalden farklı |
| 6 | Overview **Live Activity** feed yok | Overview eksik bölüm |
| 7 | `[data-mode="simple"]` CSS kuralları yok | Simple/Pro menü gizleme çalışmıyor |
| 8 | Particle dot animasyonları (`@keyframes float-dot`) eksik | Landing arka plan cansız |
| 9 | `data-mode` attribute `document.body`'ye atılmıyor | CSS seçiciler çalışmıyor |
| 10 | Tablolar `.table` yerine Tailwind class kullanıyor | Stil uyumsuzluğu |

**Build'e geçmek için:** Plan'ı onayla (ya da "yap" de), Build moduna geç.
