Hâlâ aynı hata — demek ki `api/` klasöründe hâlâ 13+ dosya var. Gerçek sayıyı kontrol ediyorum. Sandbox'ta tam olarak **13 dosya** var. `health.js` silindi ama Vercel hâlâ 13 sayıyor — demek ki Vercel bu push'tan önceki cache'i kullanıyor ya da başka bir `api/` route var.

Aslında sayım doğru: 13 dosya = 13 serverless function. Bir tane daha birleştirmem gerekiyor.

**En iyi aday:** `api/nano-balance.js` → `api/nano-call.js` içine birleştir.

Bu ikisi aynı nano-payment sistemine ait:
- `nano-call.js` — nano ödeme çağrısı yapar
- `nano-balance.js` — nano bakiye sorgular

`nano-call.js`'ye `?action=balance` parametresi ekleyip `nano-balance.js`'yi sileceğim. **12'ye düşer.**

Onaylıyor musun?
