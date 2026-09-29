# CallGuard — Kritik Hata Raporu
_29 Eylül 2026 — `app/app/index.html` tam tarama_

---

## 🔴 KRİTİK (uygulama kırılıyor)

### 1. `window.toast` 4 kez tanımlanıyor — son tanım imzayı bozuyor
**Satır:** 8193, 14590, 16041, 16410

Ana `toast()` fonksiyonu `({ title, detail, kind, ... })` obje alıyor.  
Ama satır 16410'daki override `(msg, type, txHash)` pozisyonel argüman bekliyor.  
Bu override her zaman son çalışıyor → tüm `toast({ kind: "err", ... })` çağrıları obje yerine string alıyor → `title` undefined, toast boş görünüyor.

**Etkilenen:** Tüm hata/başarı toast'ları yanlış veya boş çıkıyor.

---

### 2. CONFIG içinde `usyc` ve `memo` 3 kez tekrar tanımlanıyor
**Satır:** 8043–8048

```js
usyc: "0xe918...",   // 8043
memo: "0x5294...",   // 8044
usyc: "0xe918...",   // 8045  ← duplicate
memo: "0x5294...",   // 8046  ← duplicate
usyc: "0xe918...",   // 8047  ← duplicate
memo: "0x5294...",   // 8048  ← duplicate
```

JS obje literal'ında duplicate key son değeri alır — fonksiyonel olarak zararsız ama strict mode / lint'te hata, gelecekte farklı adres yazılırsa hangisinin geçerli olduğu belirsizleşir.

---

### 3. `window.waitWithFinality` hiç `window`'a atanmıyor
**Satır:** 8202 (tanım), 14239 ve 14305 (kullanım)

`waitWithFinality` fonksiyonu ana script bloğunda lokal tanımlı. Dispute ve Subscription modal'larındaki kod `window.waitWithFinality?.(tx)` ile erişmeye çalışıyor — her zaman `undefined` dönüyor, fallback `tx.wait()` çalışıyor. Finality süresi hiçbir zaman hesaplanmıyor, finality badge gösterilmiyor.

---

### 4. `doCallWithBalanceCheck` içinde `kind: "error"` — toast tanımıyor
**Satır:** 14842

```js
toast({ kind: "error", ... })
```

Ana toast fonksiyonu `kind: "err"` bekliyor, `"error"` değil.  
CSS class'ı `toast error` oluşuyor ama `.toast.error` CSS tanımlı değil → kırmızı renk yok, hata mesajı stil almıyor.

---

### 5. `facilitatorUrl: window.location.origin` — prod'da yanlış API çağrısı
**Satır:** 8038

`window.location.origin` = `https://arcsla.vercel.app`  
`/api/nano-call`, `/api/service`, `/api/ping-provider` → Vercel'deki serverless fonksiyonlara gidiyor.  
Ama bu endpoint'lerin bazıları (`/api/nano-call`, `/api/service`) x402-facilitator'a yani **local `server.js`'e** gönderilmesi gerekiyor.  
Vercel'de bu endpoint'ler farklı implementasyon — eğer facilitator ayrı host'ta çalışıyorsa URL sabit olmalı, `window.location.origin` değil.

---

## 🟠 YÜKSEK ÖNCELİK (özellik çalışmıyor)

### 6. `_origDoCall` tanımlanıyor ama hiç kullanılmıyor
**Satır:** 14836

```js
const _origDoCall = window.doCall;
```
Sonraki satırlarda `_origDoCall` hiç çağrılmıyor, `doCallWithBalanceCheck` direkt `doCall` çağırıyor. Dead variable — ileride yanlışlıkla `_origDoCall` çağrılırsa eski sürüm çalışır.

---

### 7. `doX402Call` facilitator'a `window.location.origin + "/api/service"` gönderiyor — HTTP 402 bekleniyor ama Vercel 200 dönüyor
**Satır:** 12690

x402 akışı şöyle: `GET /api/service` → beklenen yanıt `HTTP 402` + `{ accepts: [...] }`.  
`vercel.json`'daki `/api/service.js` handler 200 dönüyor (Vercel serverless).  
Dolayısıyla `x402Terms` her zaman `null` kalıyor, x402 akışı hiç gerçekleşmiyor — standart on-chain akışa fallback yapıyor.

---

### 8. `fetchNanoBalance` — relative URL `/api/nano-balance` Vercel'de 404
**Satır:** 11053

```js
const _nUrl = '/api/nano-balance?address=' + _nAddr;
```

`vercel.json`'a bakıldığında `api/nano-balance.js` mevcut.  
Ama bu endpoint **Gateway nano-balance** sorgusu yapıyor — wallet bağlı değilse `_nAddr` undefined, sorgu `?address=undefined` gidiyor → hatalı sonuç.

---

### 9. Subgraph URL version 1.4.2 — sync durumu bilinmiyor
**Satır:** 8039

```
https://api.goldsky.com/.../arcsla/1.4.2/gn
```

Son deploy Temmuz 2026. Subgraph yeni contract event'larını (doRegisterV2, Dispute, Subscription) indexlemiyor olabilir → provider listesi, call geçmişi eksik/güncel değil.

---

## 🟡 ORTA (görsel/UX bozuk)

### 10. `.toast.error` CSS class'ı tanımsız — `.toast.err` var
**Satır:** CSS tanımlarında sadece `.toast.err { border-left-color: var(--danger); }` var.  
`kind: "error"` ile oluşturulan toast'lar renksiz görünüyor (madde 4 ile bağlantılı).

### 11. `getProgress()` fonksiyonu — `p.called` undefined olabilir
**Satır:** 14853  
`getProgress()` localStorage'dan okurken alan yoksa `{}` dönüyor → `p.called` undefined → `if (!p.called)` her zaman true → ilk çağrı overlay her zaman açılıyor, daha önce çağrı yapılmış olsa bile.

### 12. `$("callProviderId")` inputu boşken `doCall()` çağrılıyor
**Satır:** 17351  
Builder `_waitForFn('doCall', function(){ window.doCall(); })` — provider ID parametresiz çağırıyor.  
`doCall()` içinde `$("callProviderId").value.trim()` boş olunca "Enter a provider ID" toast'u çıkıyor ama input alanı odaklanmıyor.

---

## Özet Sayıları

| Seviye | Adet |
|--------|------|
| 🔴 Kritik | 5 |
| 🟠 Yüksek | 4 |
| 🟡 Orta | 3 |
| **Toplam** | **12** |

---

_Düzeltme sırası önerisi: 1 → 4 → 3 → 7 → 5_
