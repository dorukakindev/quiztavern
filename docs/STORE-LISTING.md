# Triviara — Discord App Directory listing + submission checklist

App Directory başvurusu (Developer Portal → Applications → <app> → App
Directory / Store Listing) için metinler ve doğrulama listesi. Metinler
portalda TR + EN ayrı girilir; aşağıdakileri aynen kopyalayabilirsin.

## Tagline (kısa açıklama, ~100 karakter sınırı)

- **TR:** `Ses kanalındaki arkadaşlarınla hızlı bilgi yarışması — takımınla soru kap, ligde yüksel!`
- **EN:** `Fast trivia with friends in voice chat — answer with your team, climb the leagues!`

## Description (uzun açıklama)

**TR:**
```
Triviara, Discord ses kanalında oynanan takımlı bilgi yarışmasıdır. Aktiviteyi
aç, masana otur, soruları kapış — takım arkadaşlarınla aynı anda cevaplayın,
en hızlı doğrular daha çok puan alır.

• 14 oyun modu: Klasik, Fitil, Çember, Çifte Bahis, Takım — üstüne Düello,
  Zil, Yakın Tahmin, Zaman Çizelgesi, Tavern Panosu, Kelime Oyunu, D/Y Blitz,
  Son Masa ve Bulanık Resim
• Tavern Kartları: %50, Çifte Puan, Kalkan, Dondur jokerleriyle taktiksel oyun
• Günlük Meydan Okuma + Haftalık Turnuva: kalıcı tablolar, Wordle usulü paylaşım
• Kalıcı ilerleme: XP, ligler (Acemi → Efsane), rozetler, unvanlar, masa temaları
• Kendi soru paketin + lobiden soru yazma: sorun doğrudan maça karışır
• Mola verenin koltuğu 30 sn korunur; maç sonuçlarını kanala paylaş
```

**EN:**
```
Triviara is a team trivia game played inside a Discord voice channel. Open the
activity, take a seat, race to answer — answer together with your teammates and
the fastest correct answers earn the most points.

• 14 game modes: Classic, Fuse, Circle, Double Bet, Teams — plus Duel,
  Bell, Close Guess, Timeline, Tavern Board, Word Game, T/F Blitz,
  Last Table and Blurry Picture
• Tavern Cards: tactical jokers — 50/50, Double Points, Shield, Freeze
• Daily Challenge + Weekly Tournament: persistent boards, Wordle-style sharing
• Persistent progression: XP, leagues (Novice → Legend), badges, titles, table themes
• Your own question packs + write a question in the lobby — it joins the match
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
