# CallGuard — Hata & Sorun Raporu
_Tarih: Eylül 2026_

---

## Özet

| Kategori | Durum |
|---|---|
| TypeScript | ✅ 0 hata |
| Foundry testleri | ✅ 67/67 geçiyor |
| Solidity derleme | ✅ 0 hata (sadece uyarılar) |
| Config tutarsızlıkları | ⚠️ 3 sorun |
| Runtime / UI sorunları | ⚠️ 5 sorun |
| Güvenlik uyarıları | ⚠️ 2 sorun |

---

## 1. Config Tutarsızlıkları

### 1a. `registry` adresi yanlış kontrata işaret ediyor
**Dosya:** `src/lib/config.ts` satır 15

```ts
registry: "0x10387347678d9f7106D5625bE0BD6C915158B130",
```

`README.md`'ye göre bu adres **PayPerCall** kontratının Temmuz 2026 deployment'ı.  
`ServiceRegistry`'nin doğru adresi: `0xea00f898C0eA249de7226b283e93C13eFa7BbcFF`  
`payPerCall` adresi de güncel değil (`0xB9E08E1A9a72F17F67db6d13BBCb53252aF4Ca7b` yerine `0x1A64e531Dc7498931A658F14AD6801108F372ed8` olmalı — frontend'in işaret ettiği May 2026 deployment'ı).

**Etki:** Tüm subgraph sorguları ve zincir okuma/yazma işlemleri yanlış kontrata gidiyor.

---

### 1b. Arc Testnet RPC URL'si aktif değil
**Dosya:** `src/lib/config.ts` satır 9 ve 26

```ts
rpcUrls: { default: { http: ["https://rpc.arc-testnet.com"] } },
```

Arc Testnet'in doğru RPC endpoint'i `https://rpc.arc-testnet.circle.com` (veya env ile sağlanmalı).  
Bu URL cevap vermezse tüm wagmi bağlantısı çöküyor.

---

### 1c. `nativeCurrency.decimals` yanlış
**Dosya:** `src/lib/config.ts` satır 8

```ts
nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
```

Arc'ta native gas token (USDC) **18 decimals** ile expose ediliyor; bu kısım teknik olarak doğru.  
Ancak `CONFIG.usdcDecimals: 6` ERC-20 view için doğru. Bu iki farklı değer `LiveFeed.tsx` satır 53'teki `formatUnits(BigInt(e.amount), CONFIG.usdcDecimals)` çağrısında karışıklık yaratabilir — native gas cinsinden gelen bir `amount` değeri 6 decimals ile formatlanırsa 10^12 fark oluşur.

---

## 2. Runtime / UI Sorunları

### 2a. `LiveFeed` bileşeni Tailwind sınıfları kullanıyor ama `index.css` ile uyumsuz
**Dosya:** `src/components/LiveFeed.tsx`

`glass`, `bg-accent`, `text-accent`, `animate-pulse-glow`, `shimmer` gibi Tailwind custom class'ları kullanıyor.  
Bu sınıflar `tailwind.config.js`'e veya `index.css`'e hiç eklenmemiş — stillerin büyük kısmı görünmüyor, layout bozuk.

---

### 2b. `LandingPage` bileşeninde `LiveFeed` import edilmiyor ama dosya var
**Dosya:** `src/components/LandingPage.tsx`

`LiveFeed.tsx` dosyası projenin `src/components/` dizininde mevcut, ancak `LandingPage.tsx`'e import edilmemiş.  
`useRecentActivity` hook'u da hiç kullanılmıyor. Canlı feed bölümü kullanıcıya ulaşmıyor.

---

### 2c. `Hero.tsx` CSS değişkeni tanımsız
**Dosya:** `src/components/Hero.tsx` satır 89

```tsx
background: "var(--bg)"
```

`index.css`'te `--bg: #f7faf8` tanımlı, ancak `LandingPage.tsx` tüm sayfayı `background: "#0a0b0e"` ile dark overlay yapıyor. `var(--bg)` değeri light theme rengi, dark background içinde hero beyaz/açık görünür — görsel çelişki.

---

### 2d. `DashboardPreview.tsx` tamamen mock veri, subgraph'a bağlı değil
**Dosya:** `src/components/DashboardPreview.tsx`

`useProviders()`, `useNetworkStats()`, `useRecentActivity()` hook'larının hiçbiri kullanılmıyor.  
Tüm veriler hardcoded sabitler (`CALLS`, `SLAS`, `PROVIDERS` vs.). Zincirde gerçek bir işlem olsa bile dashboard güncellenmez.

---

### 2e. `SparklineChart.tsx` ve `StatCard.tsx` hiçbir bileşende import edilmiyor
**Dosya:** `src/components/SparklineChart.tsx`, `src/components/StatCard.tsx`, `src/components/Topbar.tsx`

Bu dosyalar mevcut ama `LandingPage.tsx` veya başka hiçbir bileşende kullanılmıyor. Dead code.

---

## 3. Solidity Güvenlik Uyarıları (forge lint)

### 3a. `block.timestamp` manipülasyon uyarısı (10 yer)
`Subscription.sol`, `PayPerCall.sol`, `ServiceRegistry.sol` dosyalarındaki deadline/cooldown karşılaştırmalarında `block.timestamp` kullanımı validator'lar tarafından kısa süreli (~12s) manipüle edilebilir.  
Arc'ın ~0.5s blok süresi riski azaltıyor; yine de kritik deadline logic için blok numarası veya Chainlink zaman kaynağı değerlendirilebilir.

### 3b. `unsafe-typecast` uyarısı
**Dosya:** `src/ServiceRegistry.sol` satır 422

```solidity
return uint8((numerator * 100) / denominator);
```

Sonuç 0–100 arasında olduğu için pratikte güvenli, ancak `numerator * 100` taşmaya karşı açık. `unchecked` bloğu dışında kullanılıyorsa Solidity 0.8.x overflow korur — ama cast her zaman risk taşır.

---

## 4. Önerilen Düzeltme Önceliği

| # | Sorun | Önem |
|---|---|---|
| 1 | `registry` ve `payPerCall` adreslerini README'deki son deployment ile eşleştir | Kritik |
| 2 | RPC URL'sini doğru Arc endpoint'iyle güncelle | Kritik |
| 3 | `LiveFeed`'i `LandingPage`'e ekle, custom Tailwind sınıflarını tanımla | Yüksek |
| 4 | `DashboardPreview`'i `useProviders` + `useNetworkStats` ile gerçek veriye bağla | Yüksek |
| 5 | `amount` formatlamada native (18 dec) vs ERC-20 (6 dec) ayrımını netleştir | Orta |
| 6 | `SparklineChart`, `StatCard`, `Topbar`'ı ya kullan ya sil | Düşük |
