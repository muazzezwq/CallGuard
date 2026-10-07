Kullanıcı cevaplarını görelim: Plan dosyası eski. Kullanıcı cevapları PLAN ANSWERS'dan geldi: **Her ikisi de (header canvas + kart sparkline)** ve layout/visual için "Mantıklı olan hangisi" dedi — yani en profesyonel kombinasyonu seçiyorum.

Frontend design skill'ini okuyayım: Tüm kodu gördüm. Şimdi tasarımı yazıyorum — **Arc Dark, market/data arketipi, glass surfaces, header canvas particle ağı + kart sparkline canvas, split-view desktop, swipeable mobile kartlar:** Build mode gerekiyor. Önce planı kaydedeyim: Plan var, güncelliyorum: Plan hazır. Build mode'a geçip inşa etmem lazım:

---

**Plan hazır. Build mode'a geçmem gerekiyor.**

Şu an Plan modundayım ve dosya yazamıyorum. Yukarıdaki mod seçiciden **Build** moduna geç veya **"Approve Plan to Build"** butonuna bas. Geçince hemen yazmaya başlarım:

**Ne yapılacak:**

1. `Marketplace.tsx` — komple yeni tasarım:
   - Header'da canlı **particle network canvas** arka planı
   - **Stats bar** — total/aktif/avg honor/elite sayıları
   - Her kart: **Honor Ring** (SVG gauge), **Tier Badge** (Elite/Pro/Standard/At Risk), **canvas sparkline** (hover'da glow), 4 metrik grid, call + compare butonları
   - Grid/List toggle, search, active filter, sort butonları
   - **Compare modal** — max 4 provider yan yana tablo
   - Skeleton loading animasyonu

2. `index.css` — `.mp-*` premium CSS sınıfları (glass, blur, glow, dark)

Landing sayfası değişmeyecek. Blockchain entegrasyonları korunacak.
