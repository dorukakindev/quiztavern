# QuizTavern — Discord App Directory listing + submission checklist

App Directory başvurusu (Developer Portal → Applications → <app> → App
Directory / Store Listing) için metinler ve doğrulama listesi. Metinler
portalda TR + EN ayrı girilir; aşağıdakileri aynen kopyalayabilirsin.

## Tagline (kısa açıklama, ~100 karakter sınırı)

- **TR:** `Ses kanalındaki arkadaşlarınla hızlı bilgi yarışması — takımınla soru kap, ligde yüksel!`
- **EN:** `Fast trivia with friends in voice chat — answer with your team, climb the leagues!`

## Description (uzun açıklama)

**TR:**
```
QuizTavern, Discord ses kanalında oynanan takımlı bilgi yarışmasıdır. Aktiviteyi
aç, masana otur, soruları kapış — takım arkadaşlarınla aynı anda cevaplayın,
en hızlı doğrular daha çok puan alır.

• Takımlı veya serbest mod, Çember kelime turu, bahisli "Hepsi içerde" anları
• Günlük Meydan Okuma: herkes aynı 5 soru — Wordle usulü skoru kanala at
• Kalıcı ilerleme: XP, ligler (Acemi → Efsane), rozetler, takılabilir unvanlar
• Kendi soru paketin: JSON/CSV yükle veya uygulama içi editörle kürate et
• Mola verenin koltuğu 30 sn korunur; maç sonuçlarını kanala paylaş
```

**EN:**
```
QuizTavern is a team trivia game played inside a Discord voice channel. Open the
activity, take a seat, race to answer — answer together with your teammates and
the fastest correct answers earn the most points.

• Team or free-for-all modes, a Çember letter round, "all-in" betting moments
• Daily Challenge: everyone gets the same 5 questions — share your score Wordle-style
• Persistent progression: XP, leagues (Novice → Legend), badges, selectable titles
• Your own question packs: upload JSON/CSV or curate with the in-app editor
• Disconnecting players keep their seat for 30s; share match results to the channel
```

## Tags / kategori

`Games`, `Entertainment`, `Trivia` (portal seçim listesinden); ikincil:
`Education`, `Social`.

## Screenshot'lar (portalda en az 1–2 görsel)

Canlı oyundan alınacak kareler (hepsi Activity içinde, Discord UI'sı görünür):

1. **Lobi** — dolu masa, XP şeridi + rozetler + unvan etiketi açık.
2. **Soru anı** — 4 şık + sayaç halkası + "Soru X/10", takım rozetleri.
3. **Reveal** — doğru/yanlış işaretleri + oyuncu kartlarında ✓/✗.
4. **Podyum** — 3B karakter + kazanan halkası + "Kanala paylaş" butonu.
5. (ops.) **Günlük sonuç deseni** veya **paket editörü** ekranı.

## Submission checklist (başvuru öncesi)

Teknik (portal + kod):
- [ ] Activity **kalıcı bir URL'de** canlı — Railway/Render deploy'u tamam
      (`docs/DEPLOY.md` §Railway/Render); `/health` `{"ok":true}` dönüyor.
- [ ] Portal **Activities → URL Mappings** kök `/` → canlı URL (tünel yok).
- [ ] **OAuth2 → Redirects**'te `<url>/auth/discord/callback` kayıtlı.
- [ ] `ALLOW_MOCK_AUTH` prod'da YOK; `PUBLIC_BASE_URL` ve `SESSION_SECRET` doğru.
- [ ] Kalıcı volume bağlı (`/app/server/data`) — aksi halde XP sıfırlanır.
- [ ] **Terms of Service / Privacy Policy** URL'leri portalda dolu
      (repo'da `/terms` `/privacy` sayfaları servis ediliyor — canlı URL'ini yaz).
- [ ] App icon (1024×1024) + banner görselleri yüklü.
- [ ] Yukarıdaki TR+EN metinler + screenshot'lar girildi.

Son kontrol (canlıda):
- [ ] 2+ gerçek hesapla tam maç: lobi→soru→reveal→podyum→XP/rozet yazımı.
- [ ] Reconnect: bir sekme kapat-aç, koltuk+skor korunuyor.
- [ ] Bot'la dolu masa 8 kişi kapasite hatası vermeden tamamlanıyor.

Discord onay kriterleri notları: Activity'nin ses kanalı içinde sosyal/multiplayer
olduğu ve store metinlerindeki vaadin oyunda bulunduğu incelenir; kapalı beta yerine
"public preview" olarak da başvurulabilir.
