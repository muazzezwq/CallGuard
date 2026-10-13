`widget.js`'yi okuyup birleştiriyorum. `widget.js`'ye `/health` path desteği ekleyip `health.js`'yi siliyorum. Aynı anda `vercel.json`'dan da kaldırıyorum. Plan moduna geçmişim. Build moduna geçmen gerekiyor.

**Mode selector'dan Build moduna geç** → sonra bana "hazır" de, hepsini tek seferde uygularım:

1. `api/widget.js` — başına health check path ekle
2. `api/health.js` — sil
3. `vercel.json` — `health.js` satırını kaldır (12 fonksiyona düşer)
4. Commit + push → Vercel otomatik redeploy yapar
