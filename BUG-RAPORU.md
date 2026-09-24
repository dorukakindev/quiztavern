# QuizTavern — Doğrulanmış Bug Analizi ve Düzeltme Planı (v2)

> **Bu rapor v1'in (önceki `BUG-RAPORU.md`) yerini alır.** v1 statik bir ön taramaydı ve 40 bulgudan **çoğu kod okunarak doğrulanamadı** — bkz. [Eski raporun akıbeti](#eski-raporun-akıbeti). Bu rapor her bulgunun **kod satırıyla doğrulandığı** ve mümkün olan her yerde **çalıştırılarak yeniden üretildiği** tam bir analizdir.
>
> **Yöntem:** `client/`, `server/`, `shared/`, `tools/` altındaki ~11.000 satırın tamamı okundu; `npm ci` → `npm run build` → `npm test` zinciri gerçekten koşuldu (33 test paketi). Aşağıdaki her bulgu ya doğrudan kod kanıtıyla ya da test koşusuyla doğrulanmıştır. **Hiçbir kod değişikliği yapılmamıştır.**
>
> **Önem:** 🔴 Kritik (yanlış oyun sonucu / çökme) · 🟠 Yüksek (bozuk işlevsellik) · 🟡 Orta (kenar durum / sağlamlık) · ⚪ Düşük (temizlik / kozmetik)

---

## 0. Gerçek Build ve Test Sonuçları

| Komut | Sonuç | Not |
|---|---|---|
| `npm ci` | ✅ | 223 paket |
| `npm run build` (server + client) | ✅ | `tsc --noEmit` + esbuild + vite; tip hatası yok |
| `npm test` (33 paket) | ⚠️ | İki **test altyapısı** hatası zinciri kırıyor (B19, B20); kalan 31 paketin tüm assertion'ları geçiyor |

- `npm test` boşluk içeren repo yolundan (ör. `…\quiz en yeni\quiztavern`) koşulduğunda `test:dod` aşamasında **ENOENT ile çöker** — nedeni B19.
- Boşluksuz yoldan koşulduğunda **yalnızca** `test:admin-reports` son temizlikte **EPERM** ile çöker (B20); 9 assertion'ının tamamı geçer.
- GitHub CI (Ubuntu, boşluksuz yol, dosya silme kilidi yok) her iki hatayı da görmez → **CI yeşil**; bu hatalar geliştirici makinesi (özellikle Windows) deneyimini bozar.
- `test:validate-questions` sonucu: **hata yok, 669 uyarı** — uyarıların önemli kısmı B2'deki 5 kategori ve B3'teki veri tekrarlarıdır.

---

## 1. 🔴 Kritik Bulgu

### B1. Zaman Çizelgesi: `orderGuesses` turlar arasında hiç sıfırlanmıyor — 2. turdan itibaren mod yanlış puanlar ve yeni cevapları reddeder

- **Dosya:** `server/src/rooms.ts:1618-1632` (`beginQuestion`), `2185`, `2209`, `2465`
- **KANIT** — `beginQuestion()` yeni turda sıfırladıkları:

```ts
this.lastNumericReveal = null;
this.lastTimelineReveal = null;
// Yakın Tahmin: yeni turda tahminler sıfırlanır.
this.numericGuesses.clear();
this.lastBlitzSummary = null;
```

`this.orderGuesses.clear()` **yok**. Map yalnızca `handleNoPlayersLeft` içinde (`rooms.ts:478`) temizleniyor; `closeIfEmpty`'de bile eksik (bkz. B13). Kullanan taraf:

```ts
// orderAnswer (rooms.ts:2185) — 2. turda herkes "zaten cevapladı" sanılır:
if (!player || !prompt || ... || this.orderGuesses.has(playerId)) return;
// revealTimeline (rooms.ts:2209) — 2. turun çözümüne 1. turun dizimi puanlanır:
const order = this.orderGuesses.get(player.id);
```

- **Senaryo:** 2 oyuncu Zaman Çizelgesi modunda; her ikisi de 1. turda dizim kilitler → 2. turda ikisinin de `order-answer` girdisi sunucuda sessizce yutulur, süre sonunda **1. turun dizimi 2. turun olaylarına göre puanlanır**. Ayrıca `stateFor.yourOrder` (`rooms.ts:1575`) bayat dizimi gösterir, `hasAnswered` (`rooms.ts:2465`) erken reveal tetikler. Maç boyunca her tur aynı cevap tekrar puanlanır.
- **Düzeltme:** `beginQuestion` içinde `this.numericGuesses.clear();` satırının yanına `this.orderGuesses.clear();` ekle; `closeIfEmpty` içindeki eksik kopyayı da tamamla. `test:timeline`'a "2 turlu maç + iki turda da cevap" senaryosu ekle (mevcut testler tek turlu cevapladığı için bug'ı yakalamıyor).

---

## 2. 🟠 Yüksek Bulgu

### B2. 5 yeni içerik kategorisinin ikonu ve İngilizce etiketi yok — EN arayüzde Türkçe kategori adı, her yerde jenerik "?" ikonu

- **Dosya:** `client/src/activity/icons.tsx:87-145` (`CATEGORY_ICONS`), `client/src/activity/i18n.ts:1114-1163` (`CATEGORY_LABELS_EN`)
- **KANIT:** `+140 soru, 5 yeni kategoride` ekleyen içerik commit'i (Orta Çağ, Antik Uygarlıklar, Olimpiyatlar, Bitkiler, İklim & Hava — `server/data/questions.json`) sonrası bu 5 ad **ne** `CATEGORY_ICONS`'da **ne** `CATEGORY_LABELS_EN`'de var. `CategoryIcon` bilinmeyen adda `Question` (jenerik "?") ikonuna düşer; `categoryLabel` EN modda ham Türkçe adı döndürür:

```ts
// icons.tsx
export function CategoryIcon({ name, weight = 'duotone' }: ...) {
  const Glyph = CATEGORY_ICONS[name] ?? Question   // ← 5 kategori buraya düşer
// i18n.ts:1169
return CATEGORY_LABELS_EN[name] ?? name              // ← EN arayüzde "Orta Çağ" görünür
```

- **Senaryo:** İngilizce arayüzlü oyuncu lobide "Orta Çağ" kartını "?" ikonuyla görür; soru ekranında kategori etiketi çevrilmez. `tools/validate-questions.ts` bu 5 kategori için toplam ~112 uyarı basıyor ("kategori tanımlı değil — EN etiket/ikon ekleyin") — uyarı doğru, mevcut haliyle görmezden geliniyor.
- **Düzeltme:** 5 kategori için ikon + EN etiket ekle (ör. Orta Çağ → Castle, "Middle Ages"; Antik Uygarlıklar → Sphinx/Bank, "Ancient Civilizations"; Olimpiyatlar → Medal, "Olympics"; Bitkiler → Leaf, "Plants"; İklim & Hava → CloudRain, "Climate & Weather"). Validator'daki kategori uyarısını hata seviyesine çekme seçeneğini değerlendir.

### B3. Çember/Kelime örneklemede `answerEn` dedup'u yok — EN arayüzde aynı cevap bir maçta iki kez çıkabilir

- **Dosya:** `server/src/circle.ts` (`sampleCirclePrompts`, ~1717-1723 arası) + veri (1735 satırın tamamı tarandı)
- **KANIT:** dedup yalnız TR cevaba bakar:

```ts
answers.add(normalizeCircleAnswer(p.answer))   // answerEn kontrol EDİLMİYOR
```

Veride **52 farklı `answerEn` değeri birden fazla kayıtta geçiyor** (×4 tekrar: `gravity`, `bias`; ×3: `desert`, `camera`, `cat`, `zipper`, `fandom`, `victory`, `neutron`, `token`, `cloud`; ×2: 41 grup — `checkpoint`, `survival`, `match`, `weapon`, `ice`, `telescope`, `referee`, `epoch`, `hemingway`, `pulsar`, `quasar`…).
- **Senaryo:** Espor kategorisinde `galibiyet → "victory"` ve `zafer → "victory"` dedup anahtarları farklı olduğundan **aynı maçta birlikte düşebilir**; EN arayüzdeki oyuncu aynı cevabı iki kez görür/yazar. TR'de 104 farklı cevap birden fazla kayıtta olsa da maç içi TR dedup bunu engelliyor — sorun yalnız EN tarafında.
- **Düzeltme:** dedup setine `normalizeCircleAnswer(p.answerEn ?? "")` de ekle (1 satır). `tools/validate-questions.ts`'a `answerEn` duplicate uyarısı ekle.

### B4. Düello: geri sayım (countdown) sırasında katılan üçüncü oyuncu düelloya girer — "1'e 1" bozulur

- **Dosya:** `server/src/rooms.ts:354-361` (`addPlayer`), `1229-1234` (`start`)
- **KANIT:** `addPlayer` countdown fazını lobi sayar:

```ts
eligibleFrom: this.phase === "lobby" || this.phase === "countdown"
  ? 0
  : ...
```

`start()` içindeki düello izleyici ataması yalnız **start anında masada oturanlara** uygulanır:

```ts
if (this.gameMode === "duel") {
  const bySeat = [...this.players.values()].sort((a, b) => a.seat - b.seat);
  for (const watcher of bySeat.slice(2)) watcher.eligibleFrom = this.roundLimit;
}
```

- **Senaryo:** 3 sn'lik geri sayım penceresinde katılan oyuncu `eligibleFrom = 0` alır → 3. düellocu olarak 1. turdan itibaren oynar ve podyuma girir (`snapshotPodium` filtresi `eligibleFrom < roundLimit`'i geçirir). "Düello hep 2 kişi" sözleşmesi ihlal edilir.
- **Düzeltme:** `addPlayer` içinde `this.gameMode === "duel" && this.phase === "countdown"` iken `eligibleFrom = this.roundLimit` ver (bet/elim dallarının countdown'a da uygulanmasıyla aynı desen — bet için start sonrası bankroll tamiri yapıldığı için sorun yok, duel için yapılmamış).

### B5. Son Masa: geri sayım sırasında katılan oyuncu "hayalet" olur — `lives = 0` ile oyuncu sayılır ama hiç oynayamaz

- **Dosya:** `server/src/rooms.ts:359` (`lives: 0` ile kayıt), `1217` (canlar yalnız `start()`'ta atanır), `2440-2442` (`eligiblePlayers` → `lives > 0`), `1253` (`answer` → `lives <= 0` reddi)
- **KANIT:** `addPlayer` kaydı `lives: 0` ile kurulur; can ataması yalnız `start()` içinde `player.lives = this.gameMode === "elim" ? GAME.ELIM_LIVES : 0;` satırıyla yapılır. Countdown'da (start'tan **sonra**) katılan oyuncu `eligibleFrom = 0` alır ama canı atanmamış olur.
- **Senaryo:** Elim maçının 3 sn'lik geri sayımında masaya oturan oyuncu: `waiting` görünmez (`eligibleFrom = 0 ≤ qIndex`), `eligibleCount`'a girmez, cevap veremez (`lives = 0`) — masada "düşünüyor" görünen ama hiç oynayamayan hayalet. Kod yorumu ("Son Masa'da geç katılan bu maça alınmaz") countdown istisnasını kapsamıyor.
- **Düzeltme:** `addPlayer` içinde elim + countdown iken `lives: GAME.ELIM_LIVES` ver ya da `eligibleFrom = this.roundLimit` yap (soru fazı davranışıyla tutarlı olur).

### B6. D/Y Blitz: herhangi bir oyuncu koptuğunda/ayrıldığında 60 sn'lik pencere saniyeler içinde kapanabilir

- **Dosya:** `server/src/rooms.ts:423`, `456`, `564` (üç yol da `revealIfEveryoneAnswered()` çağırır), `2464` (`hasAnswered` blitz: `blitzAnswered > 0`), `2431-2437` (`revealIfEveryoneAnswered`)
- **KANIT:** Blitz'te `blitzAnswer` kasıtlı olarak erken reveal tetiklemez (herkes kendi hızında ilerler); ama `markDisconnected` / `removePlayer` / `becomeSpectator` yolları `revealIfEveryoneAnswered` çağırır ve blitz'te "cevapladı" ölçütü "en az 1 ifade"dir.
- **Senaryo:** 3 oyuncu blitz oynuyor; herkesin 1. ifadeyi cevaplamasından (pencerenin ilk ~2-3 saniyesi) sonra biri izleyiciye geçer ya da bağlantısı kopar → kalan herkes "cevaplamış" sayılır → `revealBlitz` tetiklenir → 60 sn'lik pencere ~55 sn erken kapanır ve herkesin puanı haksızca düşük kalır.
- **Düzeltme:** `revealIfEveryoneAnswered` başına `if (this.gameMode === "blitz") return;` ekle (blitz yalnız kendi 60 sn timer'ıyla bitmeli).

### B7. `badge.haftaSampiyonu.hint` i18n anahtarı yok — "Haftanın Şampiyonu" rozetinde tooltip metni `undefined` görünür

- **Dosya:** `client/src/activity/i18n.ts:556-557` (tr) ve `1095-1096` (en) — yalnız `badge.haftaSampiyonu` ve `.desc` tanımlı; `client/src/activity/ActivityApp.tsx:55, 58, 68, 77` — bileşenler hep `badge.${badge}.hint` üretir
- **KANIT:**

```ts
// i18n.ts — .hint YOK, yalnız .desc var:
'badge.haftaSampiyonu': 'Haftanın Şampiyonu',
'badge.haftaSampiyonu.desc': 'Geçen haftanın turnuva tablosunda birinci oldun.',
// ActivityApp.tsx:55 — kullanılan anahtar .hint:
const hint = `${t(`badge.${badge}.hint` as StringKey)} · ${t(selected ? 'title.unset' : 'title.pick')}`
```

`as StringKey` cast'i tip denetimini bypass ettiği için derleyici bunu göremez; `translate()` bilinmeyen anahtar için `undefined` döner.
- **Senaryo:** Haftalık turnuvayı kazanan oyuncunun rozet seçici satırında ve podyum "Yeni rozet!" kutusunda tooltip **"undefined · Unvan olarak tak"** olarak görünür. Diğer 19 rozetin tamamında `.hint` var; yalnız bu rozet `.desc` kullanıyor.
- **Düzeltme:** TR+EN için `badge.haftaSampiyonu.desc` → `badge.haftaSampiyonu.hint` (veya `.hint` ekle). Savunma olarak: `translate()`'a eksik anahtar fallback'i ve `client/scripts/i18n-test.ts`'e `BADGE_KEYS × .hint` kesişim assertion'ı ekle.

### B8. Klavye kısayolu (A-D / 1-4) Çember dışındaki tüm özel girişli modlarda da aktif + bayat `removedChoices` okur

- **Dosya:** `client/src/activity/ActivityApp.tsx:1443-1460`
- **KANIT:**

```ts
useEffect(() => {
  if (isCircle || locked) return          // ← yalnız Çember hariç tutuluyor
  const onKey = (event: KeyboardEvent) => { ... const index = shortcutIndex(event.key, 4) ... onAnswer(index) }
  ...
}, [isCircle, locked, onAnswer])          // ← state.removedChoices bağımlılıkta YOK
```

- **Senaryo (a):** Kelime Oyunu, Yakın Tahmin, Zaman Çizelgesi, Zil modlarında ekranda 4 şıklı grid yoktur; odak input'ta değilken "A" tuşu anlamsız `EV.ANSWER` emit'i üretir + `sfx.play('lock')` çalar → kullanıcı "cevabım kilitlendi" hisseder, sunucu sessizce yutar. Blitz'te 2 şık varken `shortcutIndex(key, 4)` 0-3 dönebilir.
- **Senaryo (b):** %50 jokeri oynanınca `removedChoices` değişir ama `locked` değişmediğinden dinleyici yeniden kurulmaz — **silinen şık klavyeden hâlâ seçilebilir** (buton `disabled` ile kapalıyken klavye yolu açık kalır).
- **Düzeltme:** Guard'ı `if (isCircle || isWord || isNumeric || isTimeline || isZil || locked) return` yap; Blitz'te `shortcutIndex(key, 2)`; `state.removedChoices`'u effect bağımlılıklarına ekle.

### B9. Süre dolduktan sonra istemci cevap göndermeye devam eder; sunucu sessizce "cevapsız" işler — kullanıcı doğru bildiğini sanır

- **Dosya:** `client/src/activity/gameLogic.ts:20-27` (`questionIsLocked` deadline içermez), `client/src/activity/ActivityApp.tsx:1382`; sunucu tarafı `server/src/rooms.ts:1241` ve `1250`
- **KANIT:** İstemci kilidi yalnız `selected/revealing/spectator/waiting`'e bağlar; sayaç 0'ı gösterdiğinde butonlar hâlâ aktiftir. Sunucu: `if (Date.now() >= this.questionDeadline) return this.reveal();` ve `if (Date.now() >= this.deadlineFor(player)) return;` — **hiçbir toast döndürmez**.
- **Senaryo:** Ağ gecikmesi penceresinde (sayaç 0, reveal paketi henüz gelmedi) oyuncu şıkka basar; `sfx.play('lock')` çalar, "kilitlendi" görünür; sunucu cevabı reddeder ve turu cevapsız işler. Kullanıcı doğru bildiğine eminken puan almaz.
- **Düzeltme:** İstemcide `locked` koşuluna `deadline && serverNow() >= deadline` ekle; sunucu tarafında deadline aşımı reddinde açık geri bildirim (örn. yeni `err.lateAnswer` toast anahtarı) döndürmeyi değerlendir.

---

## 3. 🟡 Orta Bulgu

### B10. Kelime Oyunu "harf al" sınırsız — tek oyuncu turun değerini anında tabana çekebilir

- **Dosya:** `server/src/rooms.ts:1301-1309`
- **KANIT:** `wordLetter` yalnız faz/eligible/kalan-harf kontrolü yapar; kişi başına limit, maliyet veya "kendi cevabını kilitledin" kontrolü yok.
- **Senaryo:** Tek bir oyuncu (veya troll) art arda tüm harfleri (uzunluk−1 adet) açar → turun değeri herkes için tabana iner. Cevabını kilitlemiş (puanı donmuş) oyuncu bile harf açıp rakiplerinin değerini düşürebilir.
- **Düzeltme:** Oyuncu başına turda 1 harf hakkı ya da harf başına puan maliyeti; `player.circleAnswer !== null` iken reddetmeyi değerlendir.

### B11. Zil modunda skor negatife düşebilir

- **Dosya:** `server/src/rooms.ts:2024`, `2029`
- **KANIT:** `if (this.gameMode === "zil") gain = correct ? this.zilValue() : -GAME.ZIL_PENALTY;` ve `if (gain) player.score += gain;` — Bet modundaki `player.score = Math.max(0, player.score + gain)` (`rooms.ts:2016`) koruması burada yok.
- **Senaryo:** Skoru 200'ün altındaki oyuncu yanlış basınca (`ZIL_PENALTY = 200`) eksiye düşer.
- **Düzeltme:** Tüm modlarda `player.score = Math.max(0, player.score + gain)` kalıbına geç (tek `addScore` yardımcısı).

### B12. Tavern Panosu: `boardPickerOrder` maç öncesi sıfırlamadan ÖNCE örneklenir — önceki maçta geç katılmış oyuncu hiç hücre seçemez

- **Dosya:** `server/src/rooms.ts:1151` (örnekleme) vs `~1218` (`eligibleFrom = 0` sıfırlama döngüsü sonra çalışır)
- **Senaryo:** Önceki maç ortasında katılmış (`eligibleFrom > 0`) oyuncu, yeni Pano maçında soruları cevaplayabilir ama hücre seçme sırasına asla girmez.
- **Düzeltme:** `boardPickerOrder` atamasını `eligibleFrom` sıfırlama döngüsünden sonra yap.

### B13. `handleNoPlayersLeft` / `closeIfEmpty` ikizleri ayrışmış — ikincisi `orderGuesses`'i temizlemiyor

- **Dosya:** `server/src/rooms.ts:463-492` vs `494-525`
- **KANIT:** İlk fonksiyon `this.numericGuesses.clear(); this.orderGuesses.clear();` yapar; ikincisi yalnız `numericGuesses.clear()` yapar. İkisi ~30 satır birebir kopya.
- **Düzeltme:** Ortak gövdeyi tek `resetToLobby()` metoduna çıkar (B1'in ikinci düzeltmesi buradan gelir).

### B14. `answer()` numeric/timeline modlarında genel ANSWER olayını reddetmiyor (ölü veri yazımı)

- **Dosya:** `server/src/rooms.ts:1239-1240`
- **KANIT:** Başlangıç koşulu yalnız `circle`/`word`'ü dışlar; `numeric`/`timeline` modlarında `currentQuestion()` null döndüğü için yazar-kontrolü atlanır ve `player.choice`/`player.answeredAt` yazılır (`rooms.ts:1254-1255`).
- **Senaryo:** Bozuk/tesadüfi istemci bu modlarda `EV.ANSWER` gönderirse oyuncu kaydına anlamsız cevap yazılır. Çoğunlukla `numericAnswer` sonradan ezer; istatistik bozulması riski düşük ama mod filtresi modlar arası sözleşmeyi bozar.
- **Düzeltme:** Dışlama listesine `numeric`, `timeline` (ve `board`'un pick fazı) ekle; geçerli mod kümesini tek `Set<GameMode>` tablosunda tut.

### B15. `bonusXp` transaction dışında üç ayrı yazma yapıyor

- **Dosya:** `server/src/xp.ts:449-471`
- **KANIT:** `upsertPlayer` → `upsertSeason` → `upsertWeekly` art arda; ana yol `recordMatch` bunun aksine `db.transaction` içinde (`xp.ts:381`).
- **Senaryo:** Süreç yazmalar arasında ölürse oyuncunun toplam XP'si ile sezon/hafta tablosu ayrışır (haftalık şampiyon rozeti yanlış kişiye gidebilir).
- **Düzeltme:** `bonusXp` gövdesini `db.transaction(() => { ... })` içine al (3 satır).

### B16. Graceful shutdown SQLite depolarını kapatmıyor

- **Dosya:** `server/src/index.ts:744-783`
- **KANIT:** `shutdown()` odaları dispose eder, `io.close()` + `httpServer.close()` çağırır; `xpStore.close()` / `dailyStore.close()` / `reports.close()` **hiçbir yerde çağrılmıyor** (metotlar tanımlı: `xp.ts:536`, `reports.ts:47`).
- **Senaryo:** SIGTERM'de son WAL checkpoint yapılmadan süreç ölür; `.db-wal`/`.db-shm` artıkları kalır, son işlemler bir sonraki açılışta kurtarılana dek gecikir. Ayrıca `finish()` açık kalan bekleyen event'lerle süreci askıda tutabilir.
- **Düzeltme:** `finish()` içinde üç `close()`'u çağır; hata durumunda exit code 1 ver.

### B17. `/admin/reports` ucunda hız sınırı yok ve token karşılaştırması timing-safe değil

- **Dosya:** `server/src/index.ts:84-88`
- **KANIT:** `app.use("/auth", createRateLimitMiddleware(...))` yalnız `/auth` önekini kapsar; `/admin` için limiter yok. `if (auth !== \`Bearer ${QT_ADMIN_TOKEN}\`)` — `!==` karşılaştırması zaman sızıntısına açıktır. Bu token aynı zamanda paket yükleme hakkı da verir (`index.ts:118-121`).
- **Senaryo:** Zayıf `QT_ADMIN_TOKEN` ile sınırsız kaba kuvvet denemesi yapılabilir.
- **Düzeltme:** `/admin` yoluna `createRateLimitMiddleware({ limit: 10, windowMs: 60_000 })` ekle; karşılaştırmayı uzunluk kontrolü + `crypto.timingSafeEqual` ile yap.

### B18. Global Express hata işleyicisi yok — yanlış `NODE_ENV`'de stack trace sızabilir, gövde limiti HTML döner

- **Dosya:** `server/src/index.ts` (4-parametreli error middleware yok; grep ile doğrulandı)
- **Senaryo:** `express.json` 256kb limit aşımında Express varsayılan **HTML** hata sayfası döndürür (JSON API sözleşmesi bozulur); `NODE_ENV != production` olan herhangi bir dağıtımda beklenmedik hatalar stack trace'i yanıta yazar.
- **Düzeltme:** `log.error` + `res.status(500).json({ error: "..." })` yapan tek error handler ekle.

### B19. Test betikleri boşluklu repo yolunda kırılıyor — `URL.pathname` yüzde-kodlamayı temizlemiyor (Windows/Linux)

- **Dosya:** `server/scripts/dod-test.ts:71`, `admin-reports-test.ts:31`, `packs-test.ts:112`, `podium-lobby-test.ts:70` (+ manuel betikler `verify-bet.ts:38`, `verify-podium-order.ts:36`, `verify-team.ts:38`)
- **KANIT:**

```ts
cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
```

`URL.pathname` boşluğu `%20` olarak kodlar → cwd `...quiz%20en%20yeni/...` olur (var olmayan dizin) → `spawn(process.execPath, ...)` aldatıcı `spawn ...node.exe ENOENT` hatası atar. Bir üstteki satırdaki `tsxCli` doğru şekilde `fileURLToPath` ile çözülüyor — cwd aynı düzeltmeden yoksun.
- **Yeniden üretildi:** `npm test`, `…\quiz en yeni\quiztavern` yolunda `test:dod` aşamasında bu hatayla çöktü; aynı repo boşluksuz yola kopyalanınca 33 paketin tamamı koştu.
- **Düzeltme:** Tüm `cwd:` atamalarında `fileURLToPath(new URL("..", import.meta.url))` kullan.

### B20. `admin-reports-test.ts` kapanışta Windows'ta EPERM ile çöker — child sürecin çıkışı beklenmiyor

- **Dosya:** `server/scripts/admin-reports-test.ts:101`
- **KANIT:** `finally { server.kill(); }` sonrası dosyanın en sonunda `rmSync(tmp, { recursive: true, force: true })` — kill asenkrondur; sunucu süreci `REPORTS_DB_PATH`'teki SQLite dosyasını henüz tutuyordur → Windows açık tutulan dosyayı silmeye izin vermez → **9 assertion geçtiği halde süreç EPERM ile 1 döner ve test zinciri kırılır.**
- **Yeniden üretildi:** Boşluksuz yolda dahi çöktü (B19'dan bağımsız, Windows'a özgü).
- **Düzeltme:** `rmSync`'tan önce `server.on("exit")` beklentisi ekle ya da `rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })` kullan.

### B21. Fly.io volume + non-root kullanıcı sahiplik çakışması

- **Dosya:** `Dockerfile:46-52` (`useradd quiztavern`, `chown` **build zamanında**), `fly.toml:19-22` (volume `/app/server/data`'ya mount)
- **Senaryo:** Fly volume'ları root sahipliğiyle mount edilir; build-time `chown` mount edilen dosya sistemini gölgeler → `quiztavern` kullanıcısı `/app/server/data/xp.db` oluşturamayınca sunucu açılışta **EACCES ile crash** eder. (Railway/Render bu riski taşımaz; Render ücretsiz planda disk yok — dosyada dürüstçe belgelenmiş.)
- **Düzeltme:** Entrypoint'te root ile başlayıp `chown` sonrası `su`/gosu ile kullanıcıya düş, ya da deploy dokümanunda adımı açıkça belirt.

### B22. SFX: kullanıcı jestinden önce ilk sesler duyulmaz (autoplay policy) — unlock dinleyicisi yok

- **Dosya:** `client/src/lib/sfx.ts:24-40, 44-50`
- **Senaryo:** `AudioContext` ilk `play()`'de kurulur; jest olmadan gelen tick/reveal sesleri `suspended` context'te kaybolur. "Sesler açık" gösterilirken ilk maç sessizdir.
- **Düzeltme:** İlk `pointerdown/keydown` jestine tek seferlik `ctx.resume()` dinleyicisi ekle.

### B23. WebGL context kaybı ele alınmıyor

- **Dosya:** `client/src/activity/AmbientShader.tsx:60-115`
- **Senaryo:** Mobilde arka plana geçiş/GPU resetinde `webglcontextlost` gelince canvas donar, rAF döngüsü `INVALID_OPERATION` üretmeye devam eder.
- **Düzeltme:** `webglcontextlost`'ta `preventDefault()` + döngüyü durdur; restore'da yeniden derle ya da bileşeni sessizce kaldır.

### B24. `retry()` uçuştaki `authorize()` ile yarışabilir — Discord "Already authing (4002)"

- **Dosya:** `client/src/activity/useDiscordActivity.ts:66-77, 202-216`
- **Senaryo:** SDK hazır olma 12 sn sürebilir; sabırsız kullanıcı "Tekrar dene" ile ikinci `authorize()` başlatır.
- **Düzeltme:** `retry` uçuştaki söz varken beklesin ya da öncekinden vazgeçildiğini işaretleyip tek authorize garantilesin.

### B25. Lightbox'ta focus trap yok

- **Dosya:** `client/src/activity/ActivityApp.tsx:1733-1740` (`.qt-lightbox`)
- **KANIT:** `role="dialog" aria-modal="true"` + Escape + backdrop click var; diğer modallardaki `useFocusTrap` deseni uygulanmamış — Tab odağı arka plandaki (etkisiz) butonlarda dolaşır.
- **Düzeltme:** Diğer modallarla aynı `useFocusTrap` desenini uygula.

### B26. `normalizeCircleAnswer` noktalama/apostrof silmiyor

- **Dosya:** `server/src/circle.ts` (~1676-1694)
- **KANIT:** Yalnız `[\s-]+` silinir; oyuncu cevabı `kızılırmak.` ya da `'izmir'` gibi yazarsa eşleşmez.
- **Düzeltme:** `.replace(/[''.,!?;:()]/g, "")` ekle.

### B27. `clientErrors` ham URL + uzun stack gönderir

- **Dosya:** `client/src/lib/clientErrors.ts:18-33`
- **KANIT:** `body: JSON.stringify({ type, message, stack, url: window.location.href })` — filtre yok. Token sızması yok (sessionToken URL'de taşınmıyor) ama URL'de dev kimlik adı (`?as=`) taşınabilir.
- **Düzeltme:** `window.location.origin + pathname` gönder; stack'i sınırla.

---

## 4. ⚪ Düşük Bulgu

| # | Bulgu | Dosya:satır | Not |
|---|---|---|---|
| B28 | `ROOM_TTL_MS` tanımlı ama hiç kullanılmıyor | `server/src/config.ts:179` | Yalnız izleyicisi takılı kalan odalar süresiz yaşar; idle sweep ya da kaldırma |
| B29 | Blitz'te `firstAnswerId` yalnız DOĞRU cevapta set edilir | `server/src/rooms.ts:1371` | "En hızlı parmak" göstergesiyle tutarsız |
| B30 | `answer()`'da deadline-sonrası reveal tetikleme oyuncu doğrulamasından önce | `server/src/rooms.ts:1242` | İzleyici de reveal'ı ~ms'ler erken tetikleyebilir; zararsız, kod düzeni |
| B31 | Boş çalışma zamanı DB'si `server/data/question-reports.db` repoya commit edilmiş | `git ls-files server/data/` | `.gitignore` satırı (`server/data/`) sonradan eklendi; tracked dosya kalmış. Rapor geldiğinde worktree kirlenir |
| B32 | `predict-test` mock'unda `recordQuestionStats` yok → hata log'u | `server/scripts/predict-test.ts` (mock) + `rooms.ts:2352` | Test geçer ama 3 hata log'u basar; mock'u tamamla |
| B33 | `discord-http.ts` retry döngüsünde erişilemez `throw` | `server/src/discord-http.ts:52` | Ölü kod |
| B34 | `socketIpLimiter` 60 bağlantı/dk/IP — NAT arkası toplu red | `server/src/index.ts:60` | Bilgi notu; çok kullanıcılı tek IP senaryosu |
| B35 | Toast dışı emit'lerde `socket.connected` koruması yok | `client/src/lib/realtime.ts` | Kopukken socket.io tamponlar; yeniden bağlanınca bayat ayar gider |
| B36 | `leaveGame(thenRejoin)` disconnect gelmezse takılır | `client/src/lib/realtime.ts` | El yolu var (`rejoinGame`); zaman aşımı garantisi ekle |
| B37 | `GameSkeleton` ekran okuyucu için tamamen sessiz (`aria-hidden`) | `client/src/activity/ActivityApp.tsx:2161` | `role="status"` + görsel olmayan "Yükleniyor" |
| B38 | `model-viewer` chunk'u 1.02 MB (build uyarısı) | `client/vite.config.ts` | Lazy `import()` ile ilk yükleme küçültülür |
| B39 | `handleNoPlayersLeft`/`closeIfEmpty` ~30 satır kopya | `server/src/rooms.ts:463-525` | B13 ile aynı düzeltme |

---

## 5. İçerik Verisi Bulguları (circle.ts — 1735 satırın tamamı tarandı)

Önemli: **v1 raporun "30+ letter/answer uyumsuz kayıt" iddiası ÇÜRÜTÜLDÜ** — Türkçe kurallarla (`toLocaleUpperCase('tr')`, `i→İ`, `ı→I`) **0 uyumsuz kayıt** var. Eski tarama büyük olasılıkla locale'siz `toUpperCase()` kullanmıştır (bu durumda `istanbul → ISTANBUL` sahte uyumsuz görünür; dosyada İ/ı ile başlayan 29 kayıt var).

Gerçek veri bulguları:

1. **104 farklı TR cevap birden fazla kayıtta** (212 kayıt; örn. `bulut`×3, `kamera`×3, `nöron`×3, `zeka`×3, `istanbul`×2, `pasifik`×2…). **Aynı kategori içinde yalnız 2 ikili**: `pepsi` (Markalar, satır 911/1221) ve `yağlıboya` (Sanat, satır 1104/1633). Oyun etkisi sınırlı (maç içi TR dedup aynı cevabı bir maçta tekrarlatmıyor) ama dar kategori filtrelerinde havuzu görünmez küçültür.
2. **52 farklı `answerEn` grubu çakışıyor** (bkz. B3 — kod tarafındaki dedup açığıyla birlikte anlamlı).
3. **6 anlamsız EN ipucu↔cevap çifti**: `yosun→"desert"` (satır 647; tarifi yapan `cactus`), `ırmak→"inland"` (652; `lake`), `söğüt→"bulb"` (645), `kanyon→"grotto"` (650; `cave`), `akrep→"quiescence"` (660; `hibernation`), `tuzgölü→"laketuz"` (~1687; İngilizce kelime değil, `salt lake` olmalı).
4. **~5 neredeyse-aynı ipucu kopyası**: `körfez` (52/591), `minare` (232/585), `pasifik` (45/594), `istanbul` (43/847), `lagün`/`haliç` (649/971) — yeni kategorilere kopyalanırken çeşitlendirilmemiş.
5. **Yanlış/uydurma TR cevaplar**: `akın` (658; "kuşların mevsimsel göçü"nün cevabı **göç** olmalı — A harfi için başka kavram seçilmeli), `fenix` (~1308; yaygın yazım `feniks`, alias yok), `enkavstik` (~1631; `enkaustik`), `ambasador` (~1412; TDK yazımı `elçi`/`büyükelçi`), `icracı` (732), `filmmetni` (734), `kötüadam` (737), `hayatta` (777), `rastgeleci` (787), `porya` (~1410).
6. **Tahmin edilemez uzun bileşik cevaplar**: `uluslararasıfonetikalfabe` (~1548), `öznefiilnesne` (~1545), `streetfighteriii3rdstrike` (~1591), `aquavenyhrox` (~1587), `elektrikliyılanbalığı` — `aliases` alanı tüm dosyada yalnız 3 kayıtta kullanılmış (ayasofya, sultanahmet, ziraatbankası); yazım varyasyonu gerektiren cevaplarda alias eksik.
7. **Validator boşlukları** (`tools/validate-questions.ts`): (a) I/İ ayrımı `normalizeCircleAnswer` ile kontrol edildiği için gerçek harf kuralı doğrulanamıyor — `letter:"I" + answer:"istanbul"` bile geçer; (b) `answerEn` duplicate kontrolü yok; (c) `clue` boşluk/uzunluk denetimi yok; (d) `questions-numeric`/`questions-order` verilerini hiç denetlemiyor; (e) resimli sorularda "aynı soru metni" uyarısı false positive üretiyor (`visualcat-*` soruları metin aynı, görsel farklı — bilinçli tasarım).

---

## 6. Eski Raporun Akıbeti

Eski `BUG-RAPORU.md`'deki 40 iddiadan **doğrulananlar** v2'de yukarıda düzeltme önerisiyle yer alıyor. Kalanların durumu:

| Eski # | İddia | Hüküm | Kanıt özeti |
|---|---|---|---|
| 1 | 30+ circle letter/answer uyumsuz | ❌ **ÇÜRÜTÜLDÜ** | Türkçe locale ile 0 uyumsuz; İ/ı başlayan 29 kayıtın tamamı kurallı |
| 2 | Duplicate circle cevapları | ⚠️ Kısmen | 104 grup var ama maç içi TR dedup oyunu kırmıyor (gerçek sorun EN tarafı: B3) |
| 3 | handleNoPlayersLeft connected kontrolü | ❌ ÇÜRÜTÜLDÜ | Kopan oyuncu bilinçli sayılır — 30 sn reconnect grace tasarımı; önerilen düzeltme grace'i bozardı |
| 4, 5 | useEffect/klavye listener temizliği | ❌ ÇÜRÜTÜLDÜ | Tüm listener/interval cleanup'lı; tek istisna 0 ms'lik kozmetik `setTimeout` |
| 6 | sdkReady yarışı | ❌ Büyük ölçüde çürütüldü | Tekil `sessionPromise` + `connectOnce`; kalan küçük yarış B24 |
| 7 | Reconnect bellek sızıntısı | ❌ ÇÜRÜTÜLDÜ | 7 dinleyicinin tamamı `off` + `disconnect` |
| 8 | revealIfEveryoneAnswered yarış durumu | ❌ ÇÜRÜTÜLDÜ | Tüm akış senkron, faz-korumalı; Node tek thread — çift reveal imkânsız. (Ama blitz erken reveal B6'da gerçek) |
| 9, 10, 11 | pictureQuota/bot süresi | ❌ ÇÜRÜTÜLDÜ | `botDelay` her zaman aktif sürenin %80'inin altında; `pictureQuota` belgelendiği gibi |
| 12 | XP transaction yok | ⚠️ Kısmen | `recordMatch` atomik; yalnız `bonusXp` açık (B15) |
| 13 | Timezone | ❌ ÇÜRÜTÜLDÜ | Tüm tarih anahtarları tutarlı UTC (ay/ISO hafta/gün) |
| 14 | OAuth CSRF | ❌ ÇÜRÜTÜLDÜ | 32 bayt state + httpOnly cookie + `timingSafeEqual` (`index.ts:232-256`) |
| 15 | Membership TTL | ❌ ÇÜRÜTÜLDÜ | 45 sn pozitif / 10 sn negatif cache + budama |
| 16 | Rate limiter bellek | ❌ ÇÜRÜTÜLDÜ | `maxEntries` + her 256 işlemde prune + evict |
| 17 | Pack upload limiti | ❌ ÇÜRÜTÜLDÜ | `express.json 256kb` + 20/dk + 422 şema doğrulama |
| 18 | CSV enjeksiyon | ❌ Geçersiz | CSV yalnız import; export ucu yok |
| 19 | i18n eksik çeviri | ❌ ÇÜRÜTÜLDÜ | `en: Record<StringKey, string>` tip sözleşmesi eksik çeviriyi derleme hatası yapar; TR/EN kümeleri birebir. Tek gerçek açık: `haftaSampiyonu.hint` (B7) |
| 21 | Reconnect sonsuz bekleme | ❌ ÇÜRÜTÜLDÜ | Overlay'de expired durumu + iki çıkış butonu |
| 23 | clientErrors hassas veri | ⚠️ Kısmen | Token yok; ham URL kalıntısı (B27) |
| 24 | WebGL context kaybı | ✅ Doğrulandı | B23 |
| 25 | SFX autoplay | ✅ Doğrulandı (kısmen) | B22 |
| 26 | seededRandom determinizmi | ❌ ÇÜRÜTÜLDÜ | Seed UTC gün anahtarından; Fisher-Yates deterministik |
| 27 | Pack ID collision | ❌ ÇÜRÜTÜLDÜ | `crypto.randomUUID()` + slugify çakışma son eki |
| 28 | Kick sonrası reconnect | ❌ ÇÜRÜTÜLDÜ | `kickedUntil` 5 dk ban, tüm giriş yollarında uygulanıyor (test'le de doğrulandı) |
| 29 | BootCurtain sonsuz animasyon | ❌ ÇÜRÜTÜLDÜ | 1500 ms → fade → unmount, temizlikli |
| 30 | seasonKey | ❌ ÇÜRÜTÜLDÜ | UTC ay; geçişler tutarlı |
| 31 | Eksik kategori ikonu | ⚠️ Çürütüldü AMA… | Mevcut 48 kategorinin ikonu tam; **sonradan eklenen 5 kategoride gerçekten eksik** (B2) |
| 32 | Botlar aynı cevabı verir | ❌ ÇÜRÜTÜLDÜ | Her bot bağımsız `0.45` doğruluk + rastgele yanlış şık |
| 33 | Galaxy animasyonu | ❌ ÇÜRÜTÜLDÜ | `prefers-reduced-motion` desteği mevcut |
| 34 | Graceful shutdown | ⚠️ Kısmen | io/http kapanışı var; DB close yok (B16) |
| 35 | Discord retry-after | ❌ ÇÜRÜTÜLDÜ | `retry-after` + `x-ratelimit-reset-after` + 5 sn tavan + 10 sn timeout |
| 36 | dominantDifficulty | ❌ ÇÜRÜTÜLDÜ | Tally + karşılaştırma doğru |
| 37 | Focus trap | ⚠️ Kısmen | 6 modal'da `useFocusTrap` var; yalnız lightbox eksik (B25) |
| 38 | Report rate limit | ❌ ÇÜRÜTÜLDÜ | Per-socket 80 olay/5 sn + `UNIQUE(user_id, question_id)` |
| 39 | Question ID benzersizliği | ❌ ÇÜRÜTÜLDÜ | Yükleyici duplicate id'de sunucuyu açtırmıyor |
| 40 | Podyum ses stacking | ⚠️ Bilgi | Kısa zarflar; kasıtlı katmanlama |

**Not:** Eski rapor "server/data klasörü yok, build kırılır" iddiası da (ara analizde ortaya çıkmıştı) **yanlıştır** — `git ls-files server/data/` dosyaların izlendiğini gösterir; `npm ci && npm run build` bu klon üzerinden başarıyla koştu. Tek gerçek kalıntı B31'deki boş `question-reports.db`.

---

## 7. Geliştirme Önerileri (bug olmayan)

1. **Broadcast maliyeti:** Her `broadcast()` her alıcı için `stateFor` üretir; `stateFor` her çağrıda `seasonBoard(5)` + `weeklyBoard(5)` + `snapshot()` SQLite sorguları çalıştırır. 8 kişilik masada tek cevap olayı 16+ gereksiz sorgu demektir. Lider tablolarını yalnız `lobby`/`podium` fazlarında gönder; oyun fazlarında `null` bırak.
2. **Mod sözleşmesi tek tabloda:** "Hangi mod hangi girdiyi kabul eder" dağıtık `if`'ler (B14) yerine tek `Record<GameMode, ...>` tablosu, yeni mod eklendikçe bu hataları yapısal olarak önler.
3. **`emitRoom` trafik:** Ortak state'i `io.to(room.id)` ile, kişisel alanları (`youId`, `yourChoice`…) küçük ayrı paketle taşı.
4. **Timer kalıbı:** 6 reveal fonksiyonundaki tekrarlanan `this.timer = setTimeout(() => this.advanceFromReveal(), revealMs)` kalıbını faz-korumalı tek `scheduleNext(fn, ms)` yardımcısında topla.
5. **`build.sourcemap: 'hidden'` + `build.target`:** `clientErrors` stack gönderen bir istemcide satır numaraları sourcemap olmadan anlamsız; hata ayıklama maliyeti düşer.
6. **`model-viewer`'ı lazy `import()` ile yükleyin** (B38) — ilk yükleme ~%58 küçülür.
7. **Validator güçlendirme** (bkz. bölüm 5.7): gerçek I/İ kontrolü, `answerEn` duplicate, `clue` boşluk, numeric/order verileri, resimli soru metin istisnası.
8. **Test coverage açıkları:** timeline'da 2 turlu cevap senaryosu (B1'i yakalardı); blitz'te kopma senaryosu (B6); duel/elim'de countdown katılımı (B4/B5); i18n testine `BADGE_KEYS × .hint` kesişimi (B7).
9. **CI'a Windows işi ekle** (`runs-on: windows-latest`) — B19/B20 yalnızca Windows'ta görünür.
10. **`server/data/question-reports.db`'yi repodan çıkar** (`git rm --cached`), `.gitignore` desenini `server/data/*.db` ile daralt (sorular `questions*.json` izli kalsın).
11. **Instance doğrulama koşulu:** Handshake'teki instance doğrulaması `!ALLOW_MOCK_AUTH` bloğuna bağlı (`server/src/index.ts`, `io.use` handshake bloğu). `NODE_ENV=production` unutulmuş (ama mock auth kapalı, gerçek Discord kimlikleri tanımlı) bir dağıtımda oturum doğrulaması çalışır ancak `verifyInstanceMembership` hiç çağrılmaz ve kullanıcının beyan ettiği `roomId` kabul edilir — doğrulanmış kullanıcı başka instance'ın odasını izleyebilir. Koşulu `!ALLOW_MOCK_AUTH` yerine `IS_PRODUCTION || DISCORD_BOT_TOKEN mevcut` yaparak pencereyi kapat.
12. **`translate()` geliştirme modunda eksik anahtar için `console.warn`** bassın — `undefined` sessiz kalmaz.

---

## 8. Düzeltme Planı (önerilen sıra)

### Faz 1 — Oyun doğruluğu (hemen; hepsi küçük, lokal düzeltmeler)

| Sıra | Bulgu | Dosya | Değişiklik | Tahmini çaba |
|---|---|---|---|---|
| 1.1 | B1 orderGuesses | `rooms.ts` | `beginQuestion`'a 1 satır `clear()` + `closeIfEmpty`'ye 1 satır; timeline testine 2 turlu senaryo | 15 dk |
| 1.2 | B4 duel countdown | `rooms.ts` | `addPlayer` eligibleFrom koşuluna duel+countdown dalı | 15 dk |
| 1.3 | B5 elim countdown | `rooms.ts` | Aynı dalda `lives: GAME.ELIM_LIVES` (ya da roundLimit dışarı) | 15 dk |
| 1.4 | B6 blitz erken reveal | `rooms.ts` | `revealIfEveryoneAnswered` başına blitz guard | 5 dk |
| 1.5 | B7 hint anahtarı | `i18n.ts` | `.desc` → `.hint` (tr+en); i18n testine badge kesişimi | 15 dk |
| 1.6 | B2 kategori ikon/EN | `icons.tsx`, `i18n.ts` | 5 ikon + 5 EN etiket | 30 dk |
| 1.7 | B3 answerEn dedup | `circle.ts` | dedup setine 1 satır; validatora uyarı | 15 dk |
| 1.8 | B8 klavye kısayolu | `ActivityApp.tsx` | Guard genişlet + `removedChoices` deps'e | 15 dk |
| 1.9 | B9 deadline kilidi | `gameLogic.ts`, `rooms.ts` | İstemciye deadline koşulu; sunucuya `err.lateAnswer` | 1 sa |

### Faz 2 — Sağlamlık ve geliştirici deneyimi

| Sıra | Bulgu | Değişiklik |
|---|---|---|
| 2.1 | B19 test cwd | 7 betikte `fileURLToPath` (tek PR, mekanik) |
| 2.2 | B20 admin-reports temizlik | `exit` bekleme / `maxRetries` |
| 2.3 | B15 bonusXp | `db.transaction` sarmalı |
| 2.4 | B16 shutdown DB close | `finish()` içinde 3 `close()` |
| 2.5 | B17 admin rate limit | Limiter + `timingSafeEqual` |
| 2.6 | B18 hata işleyici | Global JSON error handler |
| 2.7 | B10 wordLetter limiti | Oyuncu başına 1 harf / maliyet tasarım kararı |
| 2.8 | B11 zil clamp | `Math.max(0, ...)` |
| 2.9 | B12 boardPickerOrder | Atamayı sıfırlama döngüsünden sonra yap |
| 2.10 | B13/B39 ikiz fonksiyonlar | Tek `resetToLobby()` |
| 2.11 | B14 answer mod filtresi | Geçerli mod `Set`'i |
| 2.12 | B21 Fly volume | Entrypoint chown+su veya doküman |

### Faz 3 — İçerik kalitesi ve cila

- **Veri temizliği:** 6 anlamsız EN çifti (5.3), `akın`→göç harf kuralı yeniden seçimi, uydur kelimeler + alias'lar, uzun bileşikler, neredeyse-aynı ipucu kopyaları.
- **Validator güçlendirme** (7.7) + resimli soru metin istisnası.
- **İstemci cila:** SFX unlock jesti (B22), WebGL lost (B23), retry uçuş kilidi (B24), lightbox trap (B25), `clientErrors` sanitasyonu (B27), normalize noktalama (B26).
- **Performans:** lider tablolarının faz-bazlı yayınlanması (7.1), `model-viewer` lazy import (B38), sourcemap (7.5).
- **Temizlik:** B28-B33, B35-B37; `question-reports.db`'nin repodan çıkarılması.

---

## 9. Doğrulanan Güçlü Yönler (dokunulmamalı)

- **Güvenlik duruşu özenli:** OAuth state + `timingSafeEqual`, fail-closed mock-auth ve instance doğrulaması, hazır SQL ifadeleri, rate limit + origin kapısı, CSP/Discord frame istisnası, path traversal yok, admin panelinde HTML kaçışı, token loglanmıyor.
- **Durum makinesi temelde sağlam:** senkron faz geçişleri, deadline kararları sunucu-otoriter, timer/bot temizliği eksiksiz, kick 5 dk ban + test kapsamı.
- **Çapraz sözleşmeler temiz:** ToastKey ↔ i18n tam kesişim (66 anahtar), EV olay adları iki tarafta birebir, 33 test paketinin script haritası eksiksiz.
- **Test suite gerçekten kapsamlı:** 33 paket, ~400 assertion; bu raporun bulduğu açıklar (B1, B4-B6) test senaryosu eklenerek kalıcı kapatılabilir.

---

*Rapor tarihi: 2026-02-24 · Analiz: kodun tamamının okunması + `npm ci`/`build`/`test` koşuları (Node 25.6.1, Windows) · Hiçbir kaynak kod değiştirilmedi.*
