Sistematik bug araştırması başlatıyorum. Tüm kritik dosyaları paralel okuyorum. **Kritik bulgu tespit edildi.** `Overview.tsx satır 52`'de hardcoded eski contract adresleri var. Devam ediyorum: **3 yeni kritik bulgu tespit edildi.** Devam ediyorum: `Overview.tsx` 676 satır — daha önce okuduğumda 52. satırda hardcoded adresleri ve `"PayPerCall v3"` yazan CONTRACTS array'ini gördüm. Bu adreslerin güncel `config.ts` ile tutarlı olup olmadığını kontrol ediyorum: Çok sayıda sorun tespit ettim. Raporu yazıyorum:

---

## Bug Araştırması — Kapsamlı Rapor

**Toplam tespit:** 18 sorun / 5 kritik / 7 önemli / 6 düşük öncelikli

---

### 🔴 KRİTİK

**BUG-01 — Overview.tsx:49-54 — Hardcoded eski kontrat adresleri**
```
DisputeQuality:  0x3c9bDc... ← config.ts'de 0x7e2771df... var
SLAFutures:      0xa6f194... ← config.ts'de 0x19d03ff1... var
ReputationLoan:  0xE656dF... ← config.ts'de 0x5a2f5455... var
PayPerCall v3    ← etiket yanlış, v5 olmalı
```
ArcScan linkleri yanlış adreslere gidiyor. Kullanıcı "View on ArcScan" tıklayınca boş/yanlış kontrat görüyor.

**BUG-02 — Agent.tsx:23 — Hardcoded subgraph URL**
```ts
const SUBGRAPH_URL = "https://api.goldsky.com/.../arcsla/3.0.0/gn";
```
`CONFIG.subgraphUrl` yerine hardcoded. Subgraph URL değişirse Agent paneli bozulur. Ayrıca bu değişken hiç kullanılmıyor — `useSubgraph` hook'u zaten `CONFIG.subgraphUrl` kullanıyor. Dead code.

**BUG-03 — Payments.tsx:56 — `e.shortMessage` unsafe access**
```ts
setStatus(e.shortMessage ?? ...)
```
`e: any` cast ile `shortMessage` erişiliyor. wagmi hatalarında `shortMessage` `undefined` olabilir ve `??` fallback yanlış sırada — `e.shortMessage` undefined değil, var ama boş string ise `??` fallback'e düşmez ve boş status gösterir.

**BUG-04 — Overview.tsx:167-168 — `ReceiptSubmitted` event ABI yanlış**
```ts
inputs: [{ name: "callId", type: "bytes32", indexed: true },
         { name: "providerId", type: "uint256", indexed: true }]  // ← YANLIŞ
```
Gerçek ABI: `callId(bytes32 indexed), responseHash(bytes32), respondedAt(uint64)` — `providerId` diye bir field **yok**. Event decode edilemiyor, live feed'de `a.providerId` her zaman `undefined`.

**BUG-05 — Register.tsx:79 — Default endpoint hardcoded production URL**
```ts
const [endpoint, setEndpoint] = useState("https://callguard.vercel.app/provider");
```
Testnet için geliştirici kendi endpoint'ini yazmalı. Bu default yanlış yönlendiriyor. Ayrıca `callguard.vercel.app` → `arcsla.vercel.app` olarak değişmiş.

---

### 🟡 ÖNEMLİ

**BUG-06 — subgraph.ts:3 — `owner` field var, Goldsky schema'da yok**
`Provider` interface satır 6: `owner: string` — Goldsky 3.0.0 schema'sında `owner` field'ı yok. Bu field içeren sorgular GraphQL hatası döndürüyor ama `console.warn` ile sessizce geçiyor.

**BUG-07 — Overview.tsx:122-123 — Subgraph query sadece 100 call alıyor**
```ts
calls(first:100,...)
```
Ağda 116+ call var. İlk 100'ü alıyor, analizler eksik veri üzerinden yapılıyor. `callsNum`, `slashesNum`, `honorRate` hesapları yanlış.

**BUG-08 — CallBuilder.tsx:48 — `RiskBadge` `honorRate=0` için yanlış hesaplama**
```ts
if (honorRate < 10) return <HighRisk>
```
Provider'ın henüz hiç çağrısı yoksa `honorRate=0` — "High Risk" badge gösteriyor. Yeni provider'lar risk değil, sadece veri yok.

**BUG-09 — useSubgraph.ts:17 — `pollInterval=15000` default çok agresif**
Her 15s subgraph fetch — 30 panel aynı anda açıkken 30+ paralel istek. Goldsky rate limit'e takılabilir.

**BUG-10 — Payments.tsx:17 — `args: [address as \`0x\`]` null cast**
```ts
args: [address as `0x${string}`],
query: { enabled: !!address }
```
`enabled` doğru ama tip cast güvensiz — `address` `undefined` iken `as \`0x...\`` cast runtime hatası vermez ama wagmi'ye `undefined` geçirir. `address ?? "0x0"` daha güvenli.

**BUG-11 — main.tsx — `appName` boş string**
```ts
appName: "",
```
ConnectKit modal'da "Connect to " yazıyor, proje adı yok.

**BUG-12 — Overview.tsx:162 — Live event amount hesabı yanlış**
```ts
`${Number(a.amount || 0) / 1e6} USDC`
```
`a.amount` bigint — `Number(bigint)` unsafe (precision kaybı > 2^53). `formatUnits` kullanılmalı.

---

### 🟢 DÜŞÜK ÖNCELİKLİ

**BUG-13 — Overview.tsx:49 — "PayPerCall v3" etiket yanlış** — v5 olmalı
**BUG-14 — Register.tsx:80 — Default endpoint URL güncel değil**
**BUG-15 — Agent.tsx:23 — Dead code SUBGRAPH_URL sabiti**
**BUG-16 — CallBuilder.tsx — toast module import'u yorum satırı**  `sonner` yerine console.log fallback kullanılıyor — hata bildirimleri sessiz kalıyor
**BUG-17 — useSubgraph.ts — `staleTime: refetchInterval - 5000`** — refetchInterval 8000 ise staleTime 3000 — çok agresif invalidation
**BUG-18 — AppFooter — "Arc Testnet Faucet" linki** hardcoded `faucet.testnet.arc.io` — URL değişebilir, `CONFIG`'den alınmalı

---

**Onaylıyor musun?** "Yap" dersen Build moduna geçip 18 sorunu önem sırasına göre düzelteceğim.
