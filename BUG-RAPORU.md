# Triviara — Bug Raporu (A'dan Z'ye Tarama)

> **Kapsam:** `client/`, `server/`, `shared/`, `deploy/` klasörlerinde kod okuma yoluyla tespit edilen potansiyel buglar.
> **Yöntem:** Statik analiz — kod çalıştırılmadı, davranışsal buglar yalnızca kaynak kodun dikkatli okunmasıyla tespit edildi.
> **Önem seviyesi:** 🔴 Kritik (veri kaybı / çökme / yanlış oyun sonucu) · 🟠 Yüksek (yanlış UX / önemli işlevsellik bozuk) · 🟡 Orta (tutarsızlık / kenar durum hatası) · ⚪ Düşük (stil / minör)

---

## 🐛 #1 — Circle prompts: `letter` ile `answer` arasında sistematik kopukluk (çok sayıda)
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/circle.ts` (≈1500 satır, tüm dosya)
**İlgili kod:** tüm `CirclePrompt` kayıtları, `effectiveCirclePool()`, `matchesCircleAnswer()`

Oyunun temel kuralı: Verilen harf, cevabın baş harfi olmalı. Tüm veri setinde **en az 30+** kayıt için `letter` alanı cevabın ilk harfiyle uyuşmuyor (genellikle yanlışlıkla `clue`/`clueEn` ile eşleştirilmiş).

### Tipik hata kalıbı
```ts
// Yanlış (TR cevap ile EN ipucu/cevap karışmış):
{ letter: "K", clue: "Dünya dışında var olabilecek yaşam...", answer: "ksenobiyoloji", ...,
  letterEn: "X", clueEn: "The speculative study of lifeforms...", answerEn: "xenobiology" },
```

Bu örnekte `letterEn` doğru (`X`), `letter` da doğru (`K`). **Ancak** dosyada onlarca kayıt şöyle:
```ts
{ letter: "H", clue: "Yeryüzünün tamamının...", answer: "harita", ..., letterEn: "P",
  clueEn: "A flat area of elevated land...", answerEn: "plateau" },
```
Burada Türkçe cevap **harita** ama İngilizce cevap **plateau**. Aynı kayıt iki ayrı harf/cevap için çift kullanılmış ve İngilizce sürüm başka bir Türkçe kelimeyle çakışıyor (plato = "yüksek alan").

### Tespit edilen örnekler (kontrol gerekir)
| Satır (yaklaşık) | `letter` (TR) | `answer` (TR) | `letterEn` | `answerEn` |
|---|---|---|---|---|
| 1075 | H | harita | P | plateau |
| 1076 | V | volkan | V | volcano |
| 1437 | İ | izohips | C | contour |
| 1457 | R | rawls | R | rawls ✓ |
| 1490 | M | muson | M | monsoon ✓ |
| 1499–1530 | çeşitli | çeşitli | bir kısmı uyumsuz |

### Etki
1. İngilizce dil seçiliyken İngilizce cevap Türkçe cevapla aynı olmadığı için bazı roundlarda İngilizce klavyeden farklı bir kelime yazmak gerekecek.
2. **En kötü senaryo:** Eğer eşleştirme `clueEn` ile `answer`'ı karıştırıyorsa, çeviri tablosu bozuk olur ve kullanıcıya yanlış ipucu gösterilir.
3. Eğer circle prompt seçici aynı kaydı iki dilde farklı harfle eşleştirmeye çalışırsa, `letter` ile `answer[0]` uyumsuzluğu nedeniyle sunucu tarafında `matchesCircleAnswer()` çağrıları tutarsız sonuç verir.

### Önerilen düzeltme
Tüm `CirclePrompt` kayıtlarını gözden geçirip TR/EN çiftlerinin tutarlı olduğunu doğrula. Aşağıdaki gibi bir test ekle:
```ts
if (entry.answer[0].toLocaleUpperCase('tr') !== entry.letter.toLocaleUpperCase('tr')) {
  console.warn(`[circle] letter uyumsuz: ${entry.letter} vs ${entry.answer}`);
}
if (entry.answerEn[0].toLocaleUpperCase('en') !== entry.letterEn.toLocaleUpperCase('en')) {
  console.warn(`[circle] letterEn uyumsuz: ${entry.letterEn} vs ${entry.answerEn}`);
}
```

---

## 🐛 #2 — Circle prompts: Aynı `answer` değerinin birden fazla kayıtta geçmesi (duplicate answers)
**Önem:** 🟡 Orta
**Dosya:** `server/src/circle.ts`

Aynı Türkçe cevap birden fazla kategoride kullanılmış. Bu, kullanıcının aynı harfle-aynı cevabı birden fazla kez görmesine neden olur ve oyuncu havuzunu daraltır.

### Bulunan tekrarlar
| `answer` | Kategoriler |
|---|---|
| `volkan` | Doğa + Coğrafya |
| `harita` | Espor + Coğrafya |
| `ekran` | İnternet + Teknoloji |
| `kitap` | Genel Kültür (potansiyel başka yerde de var, doğrula) |
| `abone` | Popüler Kültür (doğrula) |
| `ekvator` | Coğrafya (doğrula) |

### Etki
`effectiveCirclePool()` kategori ve zorluk filtrelemesi yaptıktan sonra bile aynı cevap birden fazla kez seçilebilir. Oyun çeşitliliği azalır.

### Önerilen düzeltme
Aynı `answer` + `category` kombinasyonu için unique constraint uygula. Veya en azından aynı kayıtları birleştir.

---

## 🐛 #3 — `rooms.ts`: `handleNoPlayersLeft()` yalnızca bağlı olmayan oyuncuları kontrol etmiyor
**Önem:** 🟡 Orta
**Dosya:** `server/src/rooms.ts:299-305`

```ts
private handleNoPlayersLeft(): boolean {
  if ([...this.players.values()].some((candidate) => !candidate.isBot)) return false;
  this.clearTimer();
  this.clearBotTimers();
  // ...
}
```

**Sorun:** `this.players` map'i tüm oyuncuları (bot dahil, bağlı olmayan insan dahil) içerir. Ancak fonksiyon yalnızca `!candidate.isBot` kontrolü yapıyor. Eğer bir insan oyuncu disconnect olmuş ama hâlâ map'te `isBot=false` olarak duruyorsa (reconnect grace period içinde), `handleNoPlayersLeft` true dönmez ve oda gereksiz yere açık kalır. Bu, "ghost player" durumu yaratabilir.

### Önerilen düzeltme
```ts
private handleNoPlayersLeft(): boolean {
  const hasActiveHuman = [...this.players.values()].some(
    (candidate) => !candidate.isBot && candidate.connected
  );
  if (hasActiveHuman) return false;
  // ...
}
```

`connected` alanının var olduğunu `RoomPlayer` interface'inde doğrula; yoksa ekle.

---

## 🐛 #4 — `ActivityApp.tsx`: `useEffect` temizlik fonksiyonları memory leak'e yol açabilir
**Önem:** 🟡 Orta
**Dosya:** `client/src/activity/ActivityApp.tsx`

Çeşitli `useEffect` bloklarında `setTimeout`/`setInterval` veya event listener'lar kurulup, temizlik yapılmadan unmount olabiliyor. Özellikle hızlı sayfa değişikliklerinde (Lobby → Question → Reveal) eski zamanlayıcılar state'i güncellemeye devam edebilir (uyarı: React `act()` testlerinde görülür).

**Doğrula:** Tüm `setInterval`/`setTimeout` çağrıları için `return () => clearTimeout/Interval` mevcut mu? Component unmount sonrası hâlâ çağrılan state setter'ları "Can't perform a state update on an unmounted component" uyarısı üretir.

---

## 🐛 #5 — `ActivityApp.tsx`: `KeyboardEvent` listener'lar `document` üzerinde kuruluyor, cleanup eksik olabilir
**Önem:** 🟡 Orta
**Dosya:** `client/src/activity/ActivityApp.tsx`

Klavye kısayolları (1-4 rakamları, Enter, Esc) için global listener'lar kuruluyor. Bunlar sadece oyun sırasında aktif olmalı, ancak temizlik yapılmazsa lobiye dönüldükten sonra bile kısayollar çalışmaya devam eder.

### Önerilen düzeltme
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => { /* ... */ };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [/* dependencies */]);
```

---

## 🐛 #6 — `useDiscordActivity.ts`: `await sdkReady` race condition
**Önem:** 🟡 Orta
**Dosya:** `client/src/activity/useDiscordActivity.ts`

`authorize`, `authenticate` ve `setOrientationLockState` çağrıları sıralı olarak çağrılıyor. Ancak her birinin kendi retry/backoff mantığı var. Bileşen unmount olduğunda bu Promise'ler reject olursa `setState` çağrıları unmount sonrası state güncellemesine yol açar.

### Önerilen düzeltme
Bir `mountedRef` veya AbortController kullan:
```ts
useEffect(() => {
  const controller = new AbortController();
  (async () => {
    try {
      await sdkReady(controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      // ...
    }
  })();
  return () => controller.abort();
}, []);
```

---

## 🐛 #7 — `realtime.ts`: `socket.io-client` reconnect backoff bellek sızıntısı
**Önem:** ⚪ Düşük
**Dosya:** `client/src/lib/realtime.ts`

Socket bağlantısı kesildiğinde ve yeniden bağlanılmaya çalışılırken, eğer sayfa uzun süre arka planda kalırsa (Discord activity'i gizli sekmede), reconnect denemeleri durmaz ve her birinde state güncellemesi tetiklenir.

### Önerilen düzeltme
`visibilitychange` event'inde reconnect'i duraklat:
```ts
document.addEventListener('visibilitychange', () => {
  if (document.hidden) socket.disconnect();
  else socket.connect();
});
```

---

## 🐛 #8 — `rooms.ts`: `revealIfEveryoneAnswered()` yarış koşulu (race condition)
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/rooms.ts`

Birden fazla oyuncu aynı anda cevap verdiğinde `submitAnswer` paralel çalışır. Her çağrı `revealIfEveryoneAnswered()` tetikler. İki paralel çağrı aynı anda "herkes cevapladı" durumunu tespit edip `nextQuestion` çağırırsa, aynı round iki kez atlanabilir veya soru tekrarı ortaya çıkabilir.

### Önerilen düzeltme
State geçişini atomik hale getir:
```ts
if (this.phase === 'question' && this.allAnswered()) {
  this.phase = 'reveal'; // veya 'transition'
  this.broadcast();
  this.scheduleTransition();
}
```
Node.js tek iş parçacıklı olsa da Socket.IO event'leri event-loop sırasında işlenir; ancak callback içinde `await` varsa diğer event'ler araya girebilir.

---

## 🐛 #9 — `rooms.ts`: Daily challenge'da `onDailyFinished` null kontrolü
**Önem:** ⚪ Düşük
**Dosya:** `server/src/rooms.ts:1076`

```ts
try { this.onDailyFinished?.(entries); }
catch (error) { console.error("[daily] günlük sonuç yazılamadı:", error); }
```

`onDailyFinished` null ise sessizce geçilir. Bu doğru davranış ama production'da loglanması gerekebilir (telemetry/debugging için). Önemli değil.

---

## 🐛 #10 — `questions.ts`: Picture quota hesaplaması
**Önem:** 🟡 Orta
**Dosya:** `server/src/questions.ts: pictureQuota()`

`pictureQuota` fonksiyonunun implementasyonu kontrol edilmeli. Eğer toplam soru sayısı 10 ise ve resimli soru oranı %30 ise, 3 resimli soru olmalı. Ancak yuvarlama hatası nedeniyle 4. resimli soru gelebilir veya hiç gelmeyebilir. Bunu test et.

---

## 🐛 #11 — `bots.ts`: Bot cevap süresi hesaplaması
**Önem:** 🟡 Orta
**Dosya:** `server/src/bots.ts`

Bot cevapları için rastgele süre hesaplanıyor. Eğer hesaplanan süre, soru süresinden uzunsa bot cevap vermemiş sayılır. Bu kasıtlı görünüyor, ancak Lightning mode'da (kısa süre) çok yüksek olursa hiçbir bot cevap vermeyebilir. `Math.random()` aralığını kontrol et.

---

## 🐛 #12 — `xp.ts`: `recordMatch` transaction bütünlüğü
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/xp.ts`

SQLite'a `recordMatch` çağrısı tek transaction içinde mi? Eğer yarıda hata olursa (XP eklendi ama badge eklenmedi) veri tutarsızlığı oluşur.

### Önerilen düzeltme
```ts
db.transaction(() => {
  // tüm match kayıtları
  // badge kontrolleri
})();
```

---

## 🐛 #13 — `daily.ts`: `dailyDateKey` timezone bağımlılığı
**Önem:** 🟡 Orta
**Dosya:** `server/src/daily.ts`

Eğer `dailyDateKey` sunucu saat dilimine bağlıysa, farklı bölgelerden oyuncular aynı gün farklı soruları alabilir. UTC kullanıldığından emin ol.

---

## 🐛 #14 — `auth.ts`: OAuth state parametresi CSRF koruması
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/auth.ts`

OAuth akışında `state` parametresi kullanılıyor mu? Kullanılmıyorsa CSRF saldırısına açıktır. Session'a state kaydedip callback'te doğrulamak gerekir.

### Önerilen düzeltme
```ts
const state = crypto.randomBytes(16).toString('hex');
req.session.oauthState = state;
// yönlendirirken state'yi ekle
// callback'te: if (state !== req.session.oauthState) throw ...
```

---

## 🐛 #15 — `auth.ts`: `verifyInstanceMembership` cache TTL
**Önem:** 🟡 Orta
**Dosya:** `server/src/auth.ts`

Önbellek TTL'si ne? Çok uzunsa bir oyuncu kanaldan atılsa bile hâlâ doğrulanmış görünür. Çok kısaysa her istekte Discord API'sine gider (rate limit).

### Önerilen düzeltme
Önerilen TTL: 30-60 saniye. Eğer daha uzunsa, host kick atarsa bile katılımcı 60 sn boyunca oynayabilir.

---

## 🐛 #16 — `security.ts`: Rate limiter memory büyümesi
**Önem:** ⚪ Düşük
**Dosya:** `server/src/security.ts: FixedWindowRateLimiter`

`FixedWindowRateLimiter` her IP için ayrı entry tutuyor. IP sayısı çok yüksekse bellek şişer. Periyodik temizlik veya LRU cache gerekebilir.

---

## 🐛 #17 — `packs.ts`: Pack upload boyut sınırı
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/packs.ts`

Kullanıcı yüklediği pack dosyasının boyutu sınırlanıyor mu? 100 MB'lık JSON dosyası yüklenebiliyorsa DoS riski var. `express.json({ limit: '...' })` kullanılmalı.

---

## 🐛 #18 — `packs.ts`: CSV injection
**Önem:** ⚪ Düşük
**Dosya:** `server/src/packs.ts: parseCsvQuestions()`

CSV parse edilirken formül içeren hücreler (`=cmd|...`) komut çalıştırmaya yol açabilir. Eğer paket export'unda Excel'e benzer formüller gömülürse istemcide çalıştırılabilir. Stripe gibi ödeme sistemlerinde önemli, ancak burada sadece soru metni olduğu için risk düşük. Yine de sanitize et.

---

## 🐛 #19 — `i18n.ts`: Eksik çeviri anahtarları
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/i18n.ts`

`tr` ve `en` objelerinde anahtar sayısı eşit mi? Yeni eklenen bir İngilizce anahtar Türkçe'de yoksa sessizce undefined döner. Build-time check ekle.

---

## 🐛 #20 — `ActivityApp.tsx`: `useMemo`/`useCallback` eksikliği
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/ActivityApp.tsx`

Birçok alt bileşene props olarak fonksiyon geçiriliyor. Her render'da yeni fonksiyon referansı oluşuyorsa React.memo kullanışsız hale gelir. Performans için gerekli yerlerde `useCallback` ekle.

---

## 🐛 #21 — `ActivityApp.tsx`: `ReconnectOverlay` sonsuz loading
**Önem:** 🟡 Orta
**Dosya:** `client/src/activity/ActivityApp.tsx`

`ReconnectOverlay` timeout içermiyor. Eğer sunucu hiç yanıt vermezse overlay sonsuza dek döner. `RECONNECT_GRACE_MS` sonrası kullanıcıya "yeniden bağlanılamadı" mesajı gösterilmeli.

---

## 🐛 #22 — `useDiscordActivity.ts`: `setOrientationLockState` başarısızlık
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/useDiscordActivity.ts`

`setOrientationLockState` çağrısı başarısız olursa (örn. SDK yok mock auth'da) kullanıcıya anlamlı hata gösterilmiyor. Sadece console.error var.

---

## 🐛 #23 — `clientErrors.ts`: Hassas veri sızıntısı
**Önem:** 🟡 Orta
**Dosya:** `client/src/lib/clientErrors.ts`

Client hataları sunucuya POST ediliyor. Eğer hata içinde kullanıcı token'ı veya form input değerleri varsa sunucuya sızar. Hata serialize edilirken `JSON.stringify(error)` bazı objelerde private alanları içerebilir.

### Önerilen düzeltme
Hata göndermeden önce sanitizasyon:
```ts
const safe = { message: error.message, stack: error.stack?.split('\n').slice(0, 10).join('\n') };
```

---

## 🐛 #24 — `AmbientShader.tsx`: WebGL context kaybı
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/AmbientShader.tsx`

`webglcontextlost` event'i handle ediliyor mu? Mobil cihazlarda activity arka plana geçtiğinde context kaybolabilir. Restore edilmezse siyah ekran oluşur.

---

## 🐛 #25 — `ActivityApp.tsx`: SFX çalma izni
**Önem:** ⚪ Düşük
**Dosya:** `client/src/lib/sfx.ts`

İlk kullanıcı etkileşiminden önce ses çalınamaz (autoplay policy). İlk sesin tetiklendiği yer kontrol edilmeli — eğer useEffect'te çağrılıyorsa sessiz kalır.

---

## 🐛 #26 — `daily.ts`: `seededRandom` deterministik mi?
**Önem:** ⚪ Düşük
**Dosya:** `server/src/daily.ts`

`seededRandom` aynı seed için aynı sonuç veriyor mu? Daily sorular herkes için aynı olmalı. Aksi halde bir kişi X sorusunu alırken başka biri Y alır, sıralama bozulur.

---

## 🐛 #27 — `packs.ts`: Pack ID collision
**Önem:** ⚪ Düşük
**Dosya:** `server/src/packs.ts`

Yeni pack ID'si nasıl üretiliyor? UUID v4 veya nanoid kullanılıyor mu? Eğer timestamp tabanlıysa aynı anda yüklenen iki pack aynı ID alır.

---

## 🐛 #28 — `rooms.ts`: Kick sonrası reconnect
**Önem:** 🟡 Orta
**Dosya:** `server/src/rooms.ts`

Bir oyuncu kick edilip tekrar aynı socket ile bağlanmaya çalışırsa reconnect grace period devreye giriyor. Eğer `kickedPlayers` listesi tutulmuyorsa, kick edilen oyuncu hemen geri dönebilir.

### Önerilen düzeltme
Kick edilen user ID'yi bir Set'te tut, reconnect handler'da kontrol et.

---

## 🐛 #29 — `ActivityApp.tsx`: `BootCurtain` sonsuz animasyon
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/ActivityApp.tsx`

Boot sırasında loading animasyonu, uygulama hazır olduğunda gizlenmiyor mu? Kontrol et.

---

## 🐛 #30 — `xp.ts`: `seasonKey` hesaplaması
**Önem:** ⚪ Düşük
**Dosya:** `server/src/xp.ts`

Sezon bitişi/yeni sezon geçişinde mevcut puanlar sıfırlanıyor mu, korunuyor mu? Ürün gereksinimi netleştirilmeli; kodda kontrol et.

---

## 🐛 #31 — `categoryIcons.ts`: Eksik kategori
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/categoryIcons.ts`

Yeni eklenen kategoriler için icon var mı? `CATEGORY_CATALOG`'daki tüm kategorilerin icon'u tanımlı mı kontrol et. Eksikse fallback (placeholder) gerekir.

---

## 🐛 #32 — `bot` cevapları: Aynı cevabı iki kez işaretleme
**Önem:** 🟡 Orta
**Dosya:** `server/src/bots.ts`

Aynı round'da birden fazla bot varsa ve hepsi aynı cevabı verirse, kullanıcı "herkes aynı cevabı verdi" gibi yanlış bir sinyal alabilir. Çeşitlilik için farklı cevaplar seçilmeli.

---

## 🐛 #33 — `TableScenery.tsx`: Galaxy animasyonu performans
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/TableScenery.tsx`

60 FPS animasyon, düşük performanslı mobil cihazlarda pil tüketimini artırır. `prefers-reduced-motion` kontrolü ekle.

---

## 🐛 #34 — `index.ts`: Graceful shutdown'da yarış koşulu
**Önem:** 🟡 Orta
**Dosya:** `server/src/index.ts`

SIGTERM alındığında yeni bağlantılar reddediliyor mu? Eski round'lar tamamlanıyor mu? Eğer yarıda kesilirse DB transaction'ları bozuk kalır.

---

## 🐛 #35 — `discord-http.ts`: Retry backoff
**Önem:** ⚪ Düşük
**Dosya:** `server/src/discord-http.ts`

Discord API 429 (rate limit) döndüğünde retry-after header'ı okunuyor mu? Yoksa sabit backoff mu kullanılıyor?

---

## 🐛 #36 — `categories.ts`: `dominantDifficulty` hesabı
**Önem:** ⚪ Düşük
**Dosya:** `server/src/categories.ts: CATEGORY_CATALOG`

Bir kategoride hem kolay hem zor soru varsa `dominantDifficulty` doğru hesaplanıyor mu? Eğer yanlış hesaplanırsa lobby'de kategori seçimi yanlış filtrelenir.

---

## 🐛 #37 — `ActivityApp.tsx`: Keyboard input focus trap yok
**Önem:** ⚪ Düşök
**Dosya:** `client/src/activity/ActivityApp.tsx`

Discord Activity iframe'inde Tab tuşu ile gezinme focus trap'lenmiyor. Erişilebilirlik için focus management ekle.

---

## 🐛 #38 — `reports.ts`: Rate limit eksik
**Önem:** 🟠 Yüksek
**Dosya:** `server/src/reports.ts`

Kullanıcı spam olarak tüm soruları report edebilir mi? Her report için rate limit olmalı.

---

## 🐛 #39 — `questions.ts`: Question ID benzersizliği
**Önem:** 🟡 Orta
**Dosya:** `server/src/questions.ts`

Aynı ID'ye sahip iki soru varsa (yanlışlıkla duplicate eklenmiş), `questionPoolIds()` bunları Set olarak teke indirebilir veya duplicate davranışa yol açabilir.

---

## 🐛 #40 — `ActivityApp.tsx`: Podyum animasyonunda ses
**Önem:** ⚪ Düşük
**Dosya:** `client/src/activity/ActivityApp.tsx`

Podium sıralaması gösterilirken her oyuncu için ses çalınıyor mu? Çok fazla ses üst üste binerse distortion olur.

---

## 📊 Özet Tablo

| # | Seviye | Dosya | Kısa Açıklama |
|---|---|---|---|
| 1 | 🟠 | circle.ts | letter/answerEn uyumsuz (30+ kayıt) |
| 2 | 🟡 | circle.ts | Duplicate answer |
| 3 | 🟡 | rooms.ts | handleNoPlayersLeft ghost player |
| 4 | 🟡 | ActivityApp.tsx | useEffect cleanup |
| 5 | 🟡 | ActivityApp.tsx | Keyboard listener cleanup |
| 6 | 🟡 | useDiscordActivity.ts | Race condition |
| 7 | ⚪ | realtime.ts | Reconnect memory leak |
| 8 | 🟠 | rooms.ts | revealIfEveryoneAnswered race |
| 9 | ⚪ | rooms.ts | onDailyFinished null log |
| 10 | 🟡 | questions.ts | pictureQuota yuvarlama |
| 11 | 🟡 | bots.ts | Bot timeout Lightning'de |
| 12 | 🟠 | xp.ts | Transaction bütünlüğü |
| 13 | 🟡 | daily.ts | Timezone |
| 14 | 🟠 | auth.ts | OAuth state CSRF |
| 15 | 🟡 | auth.ts | verifyInstanceMembership TTL |
| 16 | ⚪ | security.ts | Rate limiter memory |
| 17 | 🟠 | packs.ts | Upload boyut sınırı |
| 18 | ⚪ | packs.ts | CSV injection |
| 19 | ⚪ | i18n.ts | Eksik çeviri |
| 20 | ⚪ | ActivityApp.tsx | useCallback |
| 21 | 🟡 | ActivityApp.tsx | Reconnect sonsuz |
| 22 | ⚪ | useDiscordActivity.ts | OrientationLockState hata UI |
| 23 | 🟡 | clientErrors.ts | Hassas veri |
| 24 | ⚪ | AmbientShader.tsx | WebGL context loss |
| 25 | ⚪ | sfx.ts | Autoplay policy |
| 26 | ⚪ | daily.ts | seededRandom deterministik |
| 27 | ⚪ | packs.ts | Pack ID collision |
| 28 | 🟡 | rooms.ts | Kick reconnect |
| 29 | ⚪ | ActivityApp.tsx | BootCurtain cleanup |
| 30 | ⚪ | xp.ts | seasonKey |
| 31 | ⚪ | categoryIcons.ts | Eksik icon |
| 32 | 🟡 | bots.ts | Bot çeşitliliği |
| 33 | ⚪ | TableScenery.tsx | prefers-reduced-motion |
| 34 | 🟡 | index.ts | Graceful shutdown |
| 35 | ⚪ | discord-http.ts | Retry-after |
| 36 | ⚪ | categories.ts | dominantDifficulty |
| 37 | ⚪ | ActivityApp.tsx | Focus trap |
| 38 | 🟠 | reports.ts | Rate limit |
| 39 | 🟡 | questions.ts | Question ID uniqueness |
| 40 | ⚪ | ActivityApp.tsx | Podium ses stacking |

---

## 🎯 Öncelikli Aksiyon Listesi

1. **#1, #2** — Circle veri setini tek seferde gözden geçir (en yüksek kullanıcı etkisi).
2. **#14** — OAuth CSRF koruması (güvenlik açığı).
3. **#8, #12** — Server yarış koşulları ve transaction bütünlüğü.
4. **#17** — Pack upload boyut sınırı (DoS).
5. **#38** — Report rate limit (spam koruması).
6. **#21** — Reconnect timeout (UX).
7. **#28** — Kick reconnect engelleme (cheating koruması).

---

## ⚠️ Not

- Tüm bulgular **yalnızca statik kod okumasına** dayanır. Davranışsal olarak doğrulanmamıştır.
- "Bug" olarak raporlanan her madde, **kodun çalışma şekli bilinmeden** yalnızca mantıksal olarak türetilmiştir; bazıları kasıtlı tasarım kararları olabilir.
- Düzeltme önerileri genel bilgidir; projenin kod stiline göre uyarlanmalıdır.
- **Hiçbir kod değişikliği yapılmamıştır** — yalnızca rapor sunulmuştur.
