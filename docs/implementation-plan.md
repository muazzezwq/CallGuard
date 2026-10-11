Mevcut onboarding akışını ve panelleri okuyorum. Tam resmi görüyorum. Mevcut `OnboardingWizard` var (4 adım, localStorage ile), `Overview`'da welcome card var, `CgLanding`'de role kartları var. Şimdi kullanıcı yolculuğunu uçtan uca analiz edip kapsamlı önerilerimi sunuyorum:

---

## Kullanıcı İlk Girişi — Kapsamlı Analiz & Öneriler

### Mevcut Durum

Şu an ne oluyor:
1. Kullanıcı siteye giriyor → CgLanding görüyor (iyi)
2. "Connect wallet" tıklıyor → AppShell açılıyor → Overview geliyor
3. Overview'da "Welcome" kartı var (3 adım: USDC al, Rol seç, İlk call)
4. OnboardingWizard modal var ama `AppShell` içine eklenmemiş — görünmüyor
5. Kullanıcı ne yapacağını bilemiyor, tüm sidebar tek seviye

---

### 5 Somut Öneri

---

**1. İlk Bağlantı Sonrası "Role Seçim" Modal'ı**

Cüzdan bağlandıktan sonra tek seferlik bir modal:
- "Ben kimim?" → **Provider** (API sat) veya **Caller** (API kullan)
- Seçime göre sidebar öne çıkar, Overview kişiselleşir
- localStorage'a kaydedilir, bir daha sormaz

---

**2. USDC Bakiye Kontrolü + Akıllı Uyarı**

Bağlandıktan sonra:
- USDC < 1 → sarı banner: "You need USDC to use CallGuard. Get test USDC from the faucet →"
- USDC = 0 → Overview'daki tüm action butonları disabled, tooltip: "Need USDC first"
- Bu zaten var gibi görünüyor ama Overview'da çalışmıyor

---

**3. Contextual Tooltip'ler (First-time hints)**

Her paneli ilk açışta sağ alt köşede küçük bir hint balonu:
- CallBuilder açılınca: "💡 Enter provider ID 1 to test the full SLA lifecycle"
- Register açılınca: "💡 Stake at least 10 USDC to start earning"
- Receipts açılınca: "💡 As provider: sign and submit within your SLA window"
- Görüldükten sonra kaybolur, ✕ ile de kapatılabilir

---

**4. Overview'ı Kişiselleştir — "My Activity" ilk sırada**

Şu an Overview'da network stats ilk sırada. Öneri:
- Cüzdan bağlıysa ilk section: "MY ACTIVITY" — bu adres için calls, receipts, stake durumu
- Kayıtlı provider değilse: Register CTA'yı büyük göster
- Kayıtlıysa: aktif SLA countdown, honor rate, earnings

---

**5. Progress Tracker — Sidebar Üstünde**

Sidebar'ın üstünde küçük bir ilerleme çubuğu:
```
✅ Wallet connected
✅ USDC balance
⬜ Register / First call
⬜ Submit receipt
```
Kullanıcı tamamladıkça yeşile döner. Tam tamamlayınca kaybolur. 5 dakikada tüm lifecycle'ı görmüş olur.

---

### Öncelik Sırası

| # | Öneri | Etki | Süre |
|---|-------|------|------|
| 1 | Role seçim modal | Yüksek | Orta |
| 2 | USDC bakiye uyarısı | Yüksek | Kısa |
| 3 | Contextual tooltip'ler | Orta | Orta |
| 4 | Overview kişiselleştir | Yüksek | Uzun |
| 5 | Progress tracker sidebar | Orta | Kısa |

**Hangilerini yapalım?** "Hepsini yap" veya numara belirt.
