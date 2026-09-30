# Kapsamlı Kontrol Raporu — 30 Eylül 2026

## GRUP 1 — Çöken / Sessiz Hata (6 adet)

### 1. `formatUnits(c.amount, d)` — BigInt guard eksik (satır 9629, 10897)
Subgraph'tan gelen `c.amount` string. `formatUnits` BigInt bekliyor.
String gelirse `ethers` v6'da hata fırlatır, call listesi boş kalır.
**Düzeltme:** `BigInt(c.amount || "0")` wrapper ekle.

### 2. `window.loadProviders` iki kez override — zincirleme bozuluyor (satır 15564, 16398)
İki ayrı blok `window.loadProviders`'ı override ediyor.
İkinci override birincinin `origLoadProviders`'ını kaybediyor.
Empty state kontrolü ve provider card enrichment çakışıyor.
**Düzeltme:** İki override'ı tek chain'e birleştir.

### 3. `showCategory` iki tanım — hangi çalışıyor belli değil (satır 11599, 15399)
`window.showCategory` ve lokal `showCategory` aynı anda var.
Bazı çağrılar lokal versiyonu kullanıyor (data-category toggle yok),
bazıları window versiyonunu. Sidebar click doğru çalışmıyor.
**Düzeltme:** Lokal tanımı kaldır, sadece `window.showCategory` kalsın.

### 4. `refreshAll` sadece wallet bağlıyken çalışıyor ama guard yok (satır 8641)
`state.signer` null iken çağrılırsa ethers çağrıları fırlatır.
İlk yüklemede race condition var.
**Düzeltme:** Fonksiyon başına `if (!state.signer) return;` ekle.

### 5. `updateWelcomeBox` — `state.networkStats.slashedAmount` undefined olabilir (satır 9146)
Subgraph henüz indexlememişse `state.networkStats` boş obje dönüyor.
`slashedAmount` undefined → `formatUnits(undefined, 6)` crash.
**Düzeltme:** `?.` optional chain + fallback `0n` ekle.

### 6. `doTimeout` — `c.callId` bytes32 string, `BigInt()` conversion yok (satır 10242)
`BigInt(idStr)` hex string için çalışmıyor, `BigInt("0x...")` gerekiyor.
Satır 10242: `const providerId = BigInt(idStr)` — `idStr` bytes32 hash olabilir.
**Düzeltme:** hex kontrolü + `parseInt(idStr, 16)` fallback.

---

## GRUP 2 — Fonksiyonel Sorunlar (5 adet)

### 7. `loadMyDisputes` / `loadMySubscriptions` — v1.4.2 fallback URL kullanıyor
Satır 12807: subgraph URL'yi CONFIG'den alıyor ama v1.4.2 dispute/sub entity'si yok.
v2.0.0'da bu entityler var. Fallback v1.4.2'ye düşerse disputes boş gelir.
**Düzeltme:** `loadMyDisputes/loadMySubscriptions` sadece v2 URL'i denesin, başarısız olursa "indexing in progress" mesajı göstersin.

### 8. `enrichProviderCards` — `allProviders` henüz dolu değilken çağrılıyor
`loadProviders` resolve olmadan önce `enrichProviderCards` çağrılıyor.
Provider card'lar reputation badge'i alamıyor.
**Düzeltme:** `await origLP(...args)` sonrası değil, `origLP` promise'i resolve olunca çağır — zaten öyle ama ikinci override bunu kırıyor (#2 ile bağlantılı).

### 9. `bulkCall` — `doCall` input set etmek için 500ms bekliyor (satır ~11200)
`setTimeout(doCall, 500)` ile input fill edildikten sonra bekliyor.
Yavaş bağlantıda confirmation modal gelmeden önce timeout dolabilir.
**Düzeltme:** `await` ile input flush et, setTimeout kaldır.

### 10. Provider dashboard — `state.providerInfo` cached, refresh yok
Provider kayıt güncelledikten sonra (stake artır vs.) eski değerler gösteriyor.
`refreshAll()` tüm state'i yeniliyor ama provider dashboard panel kapatılıp
açılmadan güncellenmiyor.
**Düzeltme:** `doRegister` başarılı olunca `updateProviderDash()` çağır.

### 11. Auto-receipt `/api/auto-receipt` timeout — Vercel 25s limit var ama RPC 30s bekliyor
`tx.wait(1)` 30s timeout ile çağrılıyor, Vercel function 25s'de ölüyor.
**Düzeltme:** `tx.wait(1)` → `tx.wait()` (1 confirm yeterli), ethers default timeout kullan.

---

## GRUP 3 — UI/UX Sorunları (5 adet)

### 12. `57 console.log` üretimde
Debug logları temizlenmemiş.
**Düzeltme:** Sadece `[GOLDSKY DEBUG]`, `[REP DEBUG]`, `CALL DEBUG`, `USDC DEBUG` olanları yorum satırına al.

### 13. Leaderboard `renderLeaderboard` iki kez tanımlı (satır 15142 + başka yer)
`window.renderLeaderboard = function(...args)` override ediyor.
**Kontrol gerekli.**

### 14. Settings panel — budget limit kaydedilmiyor
`budgetPanel` input'ları `localStorage`'a yazıyor ama sayfa yenilenince
`showConnected()` bu değerleri restore etmiyor.
**Düzeltme:** `showConnected` içinde localStorage'dan budget limitini restore et.

### 15. `wrong network` banner — ID `wrongNetBanner` (HTML'de) ama JS `wrongNetworkBanner` diyor
Satır üstünde CSS birleştirdik ama JS'deki ID referansları kontrol edilmedi.
**Düzeltme:** Tüm JS referanslarını `wrongNetBanner` → tek ID'ye normalize et.

### 16. Help panel — `.help-panel.open` toggle ama `open` class kaldırılmıyor
Help FAB butonu `helpPanel.classList.toggle('open')` yapıyor.
Modal açık iken sidebar menü'ye tıklanınca panel kapanmıyor.
**Düzeltme:** `showCategory` çağrısında helpPanel'den `open` class kaldır.

---

## Özet

| Grup | Adet | Öncelik |
|------|------|---------|
| Çöken / Sessiz Hata | 6 | Kritik |
| Fonksiyonel Sorunlar | 5 | Yüksek |
| UI/UX | 5 | Orta |
| **Toplam** | **16** | |
