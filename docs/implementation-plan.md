Receipts panelindeki "Verify ↗" butonunu ve Verify Receipt panelini okuyorum. **Sorun bulundu.** Receipts.tsx satır 63:

```tsx
<a href={`/app/?verify=${r.id}`} className="btn btn-sm">Verify ↗</a>
```

Bu bir `<a href>` — yani **hard navigation** yapıyor. `/app/?verify=0x...` adresine tam sayfa yüklemesi ile gidiyor. Ama uygulama SPA, `/app/` path'i `vercel.json`'da `/` redirect'e düştüğü için ana sayfaya atıyor.

Ayrıca Verify paneli `?verify=` parametresini okuyup input'a otomatik dolduruyor mu kontrol edeyim: Tam resmi görüyorum. **Katmanlı analiz:**

**Katman 1 — Hard navigation hatası (kök neden):**
`Receipts.tsx:63` → `<a href="/app/?verify=...">` → hard page reload → `/app/` → `vercel.json` redirect `/` → CgLanding (landing page) gösteriyor

**Katman 2 — URL param doğru ama panel açılmıyor:**
`Verify.tsx:108` → `useEffect` `?verify=` parametresini okuyor ✓ ama `isConnected: false` olduğunda `App.tsx:12` CgLanding render ediyor → AppShell hiç mount edilmiyor → Verify paneli açılmıyor

**Katman 3 — AppShell panel açma mekanizması:**
AppShell içinde `useEffect` `?verify=` parametresini okuyup `setPanel("verify")` yapıyor mu? Kontrol edeyim: **Katman 3 teyit edildi:** AppShell, `?verify=` URL parametresini hiç okumuyor. Verify panelini otomatik açan kod yok.

**Tam sorun zinciri:**

```
Kullanıcı "Verify ↗" tıklar
  ↓
<a href="/app/?verify=0x..."> → Hard navigation (SPA bozuluyor)
  ↓
/app/?verify=0x... → vercel.json redirect → /?verify=0x...
  ↓
App.tsx → isConnected=false → CgLanding render → Landing görünüyor
  ↓ (veya isConnected=true ise)
AppShell mount oluyor ama ?verify= parametresini hiç okumuyor
  ↓
Overview açılıyor (default panel), Verify paneli açılmıyor
```

**Çözüm 3 katman:**

1. `Receipts.tsx` — `<a href>` → `<button onClick>` ile `setPanel("verify")` + `callId` store'a kaydet
2. `useAppStore` — `pendingVerify` state ekle
3. `AppShell` + `Verify.tsx` — `pendingVerify` store'dan oku, input'a otomatik doldur

Build moduna geçersen hepsini uyguluyorum. "Yap" de.
