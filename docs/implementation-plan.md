Kapsamlı audit başlıyor. Tüm kaynak dosyaları paralel okuyorum. Hâlâ Plan modundayım. Dosyaları read-only araçlarla okuyabilirim ama kod yazamam. Kapsamlı analizi tamamlayıp plan yazacağım, ardından Build moduna geçip implement edeceğim. Audit kapsamlı şekilde devam ediyor. Kritik bölümleri okuyorum: Kapsamlı audit tamamlandı. Şimdi tam planı yazıyorum ve ardından implement ediyorum. Tüm sorunları tek seferde düzeltiyorum:

**Tespit edilen sorunlar:**

1. **`.tb-hamburger { display: none }** → desktop'ta gizleniyor, sidebar toggle çalışmıyor
2. **`.tb-right { overflow: hidden; min-width: 0; flex-shrink: 1 }`** → sağ toolbar kontrolleri kırpılıyor
3. **`.topbar { justify-content: space-between }`** → `tb-right margin-left:auto` ile çakışıyor
4. **Sidebar `aside.sidebar`** → `.sidebar` class'ı var ama `app-sidebar` CSS yok, karışıklık
5. **Simple modda Advanced+Developer** → CSS `.sb-pro-only` var ama Sidebar TSX bağlı değil (mode kontrolü yok)
6. **Live-bar CSS** → `.live-bar`, `.live-bar-left`, `.live-dot-pulse`, `.live-clock` class'ları CSS'te eksik
7. **`vercel.json cleanUrls:true`** → `/app/` path 404 yapıyor
8. **`mbn-item` → `mbn-item` class** → AppShell'de `mbn-item` ama CSS'te `.mobile-bottom-nav .mbn-item`

Şimdi düzeltiyorum: `vercel.json` zaten düzgün — `cleanUrls` yok, `"/(.*)" → /index.html` var. `/app/` için sorun: Vercel `/app/` path'ini `dist/app/index.html` olarak arar ve `/(.*) → /index.html` rewrite bunu override etmiyor. Bunu da düzelteceğim.

Şimdi tüm sorunları sırayla düzeltiyorum:

**1. Topbar hamburger her zaman görünür + tb-right fix**Hâlâ Plan modundayım. Lütfen ekranın üst kısmındaki **mod seçiciden Build moduna geç** — sonra hemen uyguluyorum. "Devam et" demen yeterli.

---

**Audit Özeti — Tespit edilen tüm sorunlar:**

| # | Sorun | Dosya | Etki |
|---|-------|-------|------|
| 1 | `.tb-hamburger { display:none }` | index.css | Desktop'ta sidebar toggle çalışmıyor |
| 2 | `.tb-right { overflow:hidden; flex-shrink:1 }` | index.css | Sağ toolbar kontrolleri kırpılıyor |
| 3 | `.topbar { justify-content:space-between }` redundant | index.css | `margin-left:auto` ile çakışıyor |
| 4 | Simple modda Advanced+Developer sidebar'da görünüyor | Sidebar.tsx | UX bozuk |
| 5 | `aside.sidebar` ama CSS `.app-sidebar` yok | AppShell.tsx | Sidebar CSS uyumsuz |
| 6 | `live-dot-pulse` keyframe eksik | index.css | Yeşil dot animasyon yok |
| 7 | `.mbn-item` → `.mobile-bottom-nav .mbn-item` | index.css/AppShell | Mobile nav class uyumsuzluğu |
| 8 | `/app/` 404 — vercel `/(.*) → /index.html` çalışmıyor path'te | vercel.json | Doğrudan URL erişiminde 404 |
| 9 | `[data-theme="light"]` topbar bg hâlâ koyu | index.css | Light temada topbar siyah kalıyor |
| 10 | Panel `max-width: 900px` — geniş ekranda boş alan | index.css | Desktop'ta içerik dar kalıyor |
