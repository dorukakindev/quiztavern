# QuizTavern — Mimari Özet

Discord Embedded Activity içinde çalışan, sunucu-otoriter çok oyunculu bilgi yarışması.
Tek instance = tek masa. İstemci yalnızca görüntü + input; tüm oyun kararı sunucudadır.

## Yığın

| Katman | Teknoloji | Konum |
|---|---|---|
| İstemci | Vite + React 19 + TS, `@discord/embedded-app-sdk` | `client/` |
| Sunucu | Express 5 (statik + `/api`), Socket.IO 4 | `server/` |
| Paylaşılan sözleşme | Tek tip dosyası: fazlar, event'ler, payload'lar | `shared/types.ts` |

- `client/index.html` → `activity-main.tsx` → `activity/ActivityApp.tsx` (tek ekran,
  fazlara göre render). `client/src/_legacy/` eski standalone uygulama — build'e girmez.
- Sunucu prod'da `client/dist`'i servis eder; socket `/api/socket.io` altındadır.
- Geliştirmede Cloudflare tüneli + Discord URL Mappings (`/` ve `/api`).

## Oyun akışı

`Phase = lobby → countdown → (bet) → question → reveal → podium` (+ Çember'de aynı
iskelet, klasik şıklar yerine `circle`/`circleReveal`).

**Modlar** (`GameMode`): `classic` (15 sn, sakin), `lightning`/Fitil (8 sn, hız bonusu),
`circle`/Çember (harf→kelime ipucu, yazarak cevap), `bet`/Çifte Bahis (soru öncesi
bankroll yatırma), `team`/Takım (iki takım havuzu). Lobi ayarları: soru sayısı
(5/10/15), zorluk filtresi, kategori seçimi — hepsi yalnız host değiştirebilir.

## Sunucu-otoriter garantiler

- `QuestionPayload` doğru cevabı İÇERMEZ; `correctIndex`/`answer` yalnız reveal'da gider.
- Cevap zaman damgası sunucuda (`answeredAt`); deadline sonrası `EV.ANSWER` reddedilir
  (`Date.now() >= questionDeadline` → reveal); oyuncu turda tek kez cevaplayabilir
  (`choice !== null` guard). Bahis `placeBet` bankroll'e klemplenir.
- Soru seçimi tekrarsız: `seenQuestionIds` / `seenCirclePromptKeys` masada bugüne dek
  görülenleri dışlar; havuz tükenince yalnız son maçın seti dışarıda bırakılarak sıfırlanır.
- Kimlik: Discord OAuth → imzalı session token → socket'te `verifyInstanceMembership`
  (bot token'lı Activity-Instances API, 45 sn pozitif / 10 sn negatif önbellek).
  `ALLOW_MOCK_AUTH` yalnız geliştirmede; prod'da set ise sunucu başlamayı reddeder.

## Durum yönetimi

Bellek içi: `rooms: Map<string, Room>` — instance başına bir `Room`. Kalıcı DB yok;
XP/lig/görev gibi çapraz-oturum ilerleme sistemi mevcut değil (eski uygulamada
vardı, Activity'de kaldırıldı). Koptuktan sonra koltuk/skor 30 sn korunur
(`RECONNECT_GRACE_MS`), lobide kopan anında silinir. Aynı kullanıcının ikinci
bağlantısı eskisini düşürür.

## İçerik

- Klasik: `server/data/questions.json` (2217 soru; id benzersizliği boot'ta doğrulanır).
- Çember: `server/src/circle.ts` içinde `ALL_CIRCLE_PROMPTS` (harf, TR/EN ipucu+cevap).
- Normalize: `normalizeCircleAnswer` — tr-TR lowercase, `ı→i`, boşluk/tire silme,
  NFD diakritik silme. `aliases` alanı yok.

## İstemci güvenlik/UX katmanları

- Socket `io.use` zinciri: rate limit → session imzası → instance doğrulaması →
  prod'da Origin kontrolü (yalnız header varsa; Discord iframe Origin göndermez).
- `connect_error` → offline + state'siz = hata ekranı ("Tekrar dene" → `reconnectNow`,
  OAuth'u yeniden başlatmaz).
- i18n: `client/src/activity/i18n.ts` TR+EN anahtar paritesi test edilir; sunucu
  metin değil `ToastKey` yollar, istemci çevirir.

## Testler

`npm test` (repo kökü): client `test:activity` (UI/erişilebilirlik regresyonları),
`test:i18n`, `test:sdk`; server `test:hardening`, `test:sec`, `test:circle-lightning-edge`,
`test:bet-team-edge`, `test:dod` (uçtan uca maç + reconnect + host devri + kick),
`test:origin-gate`.
