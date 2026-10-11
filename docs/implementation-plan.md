Kapsamlı panel testi başlatıyorum. Her panel dosyasını, panel ID mapping'ini ve AppShell'i paralel kontrol ediyorum. Plan modundayım. Sidebar'ı ve panel dosyalarını okuyarak test yapıyorum: Tam analiz tamamlandı. Şimdi kapsamlı test raporumu sunuyorum. Build moduna geçip düzeltiyorum:

**Test Raporu — 23 Panel**

| Panel | Sidebar ID | AppShell map | Sorun |
|-------|-----------|--------------|-------|
| Overview | `overview` | ✅ | — |
| Call Builder | `calls` | ✅ | — |
| Services | `marketplace` | ✅ | — |
| Requests | `requests` | ✅ | — |
| Providers | `providers` | ✅ | — |
| Receipts | `receipts` | ✅ | — |
| Payments | `payments` | ✅ | — |
| Disputes | `disputes` | ✅ | — |
| Quality | `quality` | ✅ | — |
| Agent Loop | `agent` | ✅ | — |
| RepFi Lending | `lending` | ✅ | — |
| SLA Futures | `futures` | ✅ | — |
| SLA Bridge | `attestation` | ✅ | — |
| Subscriptions | `subscriptions` | ✅ | — |
| **Claims** | `jobs` | ✅ | ⚠️ Sidebar label "Claims" ama panel `jobs` → Jobs içeriği, Claims değil |
| API / MCP | `mcp` | ✅ | — |
| Webhooks | `webhooks` | ✅ | — |
| Notifications | `notifications` | ✅ | — |
| Leaderboard | `leaderboard` | ✅ | — |
| Tx History | `history` | ✅ | — |
| API Docs | `apidocs` | ✅ | — |
| Register | `register` | ✅ | — |
| Verify Receipt | `verify` | ✅ | — |
| Settings | `settings` | ✅ | — |
| Admin Panel | `admin` | ✅ | — |
| **Bulk Call** | `bulkcall` | ✅ | ⚠️ Sidebar'da görünmüyor |
| **Analytics** | `analytics` | ✅ | ⚠️ Sidebar'da link yok |
| **Bridge** | `bridge` | ✅ | ⚠️ Sidebar'da link yok |

**4 sorun:**
1. Sidebar "Claims" → `jobs` ID açıyor ama jobs paneli "ERC-8183 Jobs" içeriği gösteriyor, "Claims" değil
2. `bulkcall` paneli AppShell'de var ama sidebar'da Operations grubunda görünmüyor
3. `analytics` paneli var ama sidebar'da Developer altında link yok
4. `bridge` paneli var ama sidebar'da link yok

"Yap" dersen Build modunda hepsini düzeltiyorum.
