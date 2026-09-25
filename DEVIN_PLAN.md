# Triviara — İnceleme ve Devin Uygulama Planı

> Bu dosya doğrudan Devin'e verilmek üzere yazıldı. En alttaki "Devin'e yapıştırılacak prompt" bölümünü görev başlangıcına koy, dosyanın tamamını da repo köküne `DEVIN_PLAN.md` olarak ekle.

## İnceleme kapsamı ve sınır

İncelenenler: `README.md`, `package.json`, `implementation_plan.md`, `SMOKE-TEST.md`, `SMOKE-DURUM.md`, `benim-eklediklerim.txt`. `client/`, `server/`, `shared/` altındaki kaynak kodu dışarıdan okunamadı. Bu yüzden aşağıdaki maddeler iki türe ayrıldı:

- **[KESİN]** — dosyalarda doğrudan görülen sorun.
- **[DOĞRULA]** — bu tür projelerde çok sık görülen ve belgelerdeki ipuçlarından şüphelenilen risk. Devin önce kodda doğrulamalı, sorun yoksa atlamalı.

---

## FAZ 0 — Keşif (Devin, kod yazmadan önce)

1. `npm install && npm test && npm run build` çalıştır, sonucu raporla. Kırılan test varsa önce onu düzelt.
2. Soru veri dosyalarının yerini, oyun modlarını (klasik, yıldırım, çember, bahis, takım) ve durum yönetimini (bellek içi mi, veritabanı mı) haritalayıp `docs/ARCHITECTURE.md` olarak kısa bir özet yaz.
3. Aşağıdaki [DOĞRULA] maddelerinin her biri için "var / yok" tablosu çıkar.

---

## FAZ 1 — Kritik buglar ve güvenlik (öncelik: 🔴)

### 1.1 [KESİN] Oturuma özel dosya repoda
`SMOKE-DURUM.md` geçici tünel adreslerini ve Discord Client ID'yi içeriyor, dosyanın kendisi de "bu oturuma özeldir" diyor. Client ID gizli değil ama dosya repoda durmamalı.
- Dosyayı sil, `.gitignore`'a `SMOKE-DURUM.md` ekle.
- `gitleaks detect` (veya `trufflehog`) ile **tüm git geçmişini** tara. Herhangi bir `.env`, `CLIENT_SECRET`, `BOT_TOKEN`, `SESSION_SECRET` bulunursa: kullanıcıya bildir, secret'ı Discord Portal'da yenilemesini söyle.

### 1.2 [KESİN] Çember modu cevap eşleştirme riski (Türkçe karakterler + boşluklar)
Çember cevapları `kızılırmak`, `çanakkale`, `tuzgölü`, `ziraatbankası` gibi Türkçe karakterli; EN tarafında da `bluemosque`, `lycianway`, `gesturalbrushwork` gibi boşlukları silinmiş çok kelimeli cevaplar var. Oyuncu "Blue Mosque", "KIZILIRMAK" veya "kizilirmak" yazarsa büyük ihtimalle yanlış sayılıyor.
- Sunucuda tek bir `normalizeAnswer(text, lang)` fonksiyonu yaz:
  - TR için `toLocaleLowerCase('tr-TR')` (I→ı, İ→i sorunu), EN için `toLocaleLowerCase('en-US')`.
  - Boşluk, tire, kesme işareti, noktalama kaldır.
  - Karşılaştırmayı hem ham hem **diakritiksiz** hâl üzerinden yap (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c). EN oyuncusu `kizilirmak` yazabilmeli.
- Veri şemasına opsiyonel `aliases: string[]` alanı ekle (ör. `blue mosque`, `sultan ahmed mosque`).
- Birim testleri: `KIZILIRMAK`, `Kızılırmak`, `kizilirmak`, `Blue Mosque`, `blue-mosque`, `  bauhaus ` hepsi doğru sayılmalı.

### 1.3 [KESİN] Soru içerik hataları (benim-eklediklerim.txt'teki paketler)
| id / girdi | Sorun | Düzeltme |
|---|---|---|
| Çember TR "K → koleksiyon" | İpucu bir *mekânı* (galeri) tarif ediyor; koleksiyon mekân değil | Harfi G, cevabı `galeri` yap (EN zaten `gallery`) |
| Çember TR "Y → yazısalfırça" | Türkçede yerleşik bir terim değil, kimse bilemez | Girdiyi kaldır, yerine ör. `Y → yağlıboya` koy |
| `turkiye-sultanahmet-mavi` | "Mavi Camii / Yeşil Camii…" dilbilgisi hatalı | Şıklar `Mavi Cami`, `Yeşil Cami`, `Beyaz Cami`, `Altın Cami` |
| `turkiye-antalya-turist` + çember "A → antalya" | Son yıllarda yabancı ziyaretçi sayısında İstanbul'un öne geçtiğini gösteren veriler var; "genellikle" ifadesi tartışmalı | Güncel resmî veriyle doğrula; belirsizse soruyu "havalimanı üzerinden en çok turist" gibi netleştir veya değiştir |
| `turkiye-ziraatbankasi` | Osmanlı Bankası (1856) daha eski; "en eski" iddiası tartışılabilir | "Bugün faaliyette olan en eski Türk bankası" diye netleştir |

### 1.4 [KESİN] Otomatik soru doğrulayıcı yok
Yukarıdaki hatalar elle yakalandı; gelecekte eklenecek paketler için `tools/validate-questions.ts` yaz ve `npm test`'e ekle. Kontroller:
- `id` benzersiz; 4 şık var ve birbirinden farklı; doğru cevap şıklar arasında.
- TR ve EN şık sayısı eşit; doğru cevabın **indeksi** iki dilde aynı.
- Çember: `answer` normalize edilmiş hâli `letter` ile başlıyor (TR ve EN ayrı ayrı).
- Zorluk değeri `kolay|orta|zor` dışında değil; kategori tanımlı kategorilerden biri.
- Uyarı (hata değil): cevap 20 karakterden uzunsa, boşluk silinmiş çok kelimeli cevaplarda `aliases` yoksa.

### 1.5 [DOĞRULA] Hile: doğru cevap istemciye erken gidiyor mu?
Sunucu-otoriter mimari iddiası ancak şunlar sağlanıyorsa geçerli:
- Soru yayınlanırken payload'da `correctIndex` / `answer` **yok**; sadece reveal anında gönderiliyor.
- Cevap zaman damgası sunucuda alınıyor; süre dolduktan sonra gelen cevap reddediliyor; aynı oyuncu bir soruya ikinci kez cevap gönderemiyor.
- Puan istemciden gelen hiçbir değere dayanmıyor.
Her biri için sunucu testi ekle.

### 1.6 [DOĞRULA] Arayüzde sahte / sabit veriler
Tasarım notlarında "24 oyuncu çevrimiçi", "6 açık masa", "24/32 oyuncu kayıtlı", "50.000 altın ödül havuzu", "Elif" (sıralamada 1.), "Safir Ligi", "+640 XP bu hafta" gibi değerler geçiyor. Discord Portal'daki maksimum katılımcı 8 iken 32 kişilik turnuva gösterilmesi bunların mock olduğunu düşündürüyor.
- Tüm bu değerleri kodda ara. Gerçek veriye bağlı olmayanları ya gerçek veriye bağla ya da ekrandan kaldır / "Yakında" rozetiyle işaretle. Kullanıcıya sahte canlılık göstermek güven kırar.

### 1.7 [DOĞRULA] Kalıcılık
XP, haftalık lig, görevler, seri (streak) ve sıralama sunucu yeniden başlayınca sıfırlanıyor mu? Bellek içiyse:
- `better-sqlite3` (tek süreç, tek port mimarisine uygun) ile basit bir kalıcılık katmanı ekle: `users`, `match_results`, `quest_progress`, `weekly_league`.
- Aktif maç durumu bellekte kalabilir; sadece maç sonuçları ve ilerleme yazılsın.

### 1.8 [KESİN] Belge tutarsızlıkları
- `package.json` adı `quiz-orbit` → `quiztavern`.
- README "7 paket test" diyor, `npm test` 9 paket çalıştırıyor → güncelle.
- `SMOKE-TEST.md` "ALLOW_MOCK_AUTH satırını sil", `SMOKE-DURUM.md` "başına # koy" diyor → tek talimat: sil. Ayrıca `config.ts`'in `NODE_ENV=production` iken `ALLOW_MOCK_AUTH=1` görürse **başlamayı reddettiğini** test eden bir test ekle (fail-closed iddiasını kanıtlasın).

---

## FAZ 2 — Güvenilirlik ve altyapı (🟡)

1. **GitHub Actions CI**: her push/PR'da `npm ci && npm test && npm run build` + soru doğrulayıcı. Node 22.12.
2. **Reconnect**: 30 sn içinde dönen oyuncunun koltuk + skoru korunuyor mu, bir sunucu testiyle kanıtla; 30 sn sonra koltuk boşalıyor mu.
3. **Oda kapasitesi**: sunucudaki oda limiti Discord Portal'daki 8 ile tutarlı olsun; "Oda dolu" toast'u yalnızca gerçekten doluyken çıksın.
4. **Soru tekrarını önleme**: aynı instance içinde son N maçta sorulan soruları havuzdan dışla.
5. **Hata görünürlüğü**: sunucuda yapılandırılmış log (pino), istemcide yakalanmamış hataları `/api/client-errors`'a gönderen küçük bir hook (rate-limitli).
6. **Discord smoke testi**: `SMOKE-TEST.md`'deki DoD listesinin hiçbir maddesi işaretli değil. Kod değişikliklerinden sonra kullanıcıya bu listeyi gerçek Discord'da geçmesi için hatırlat (Devin bunu kendisi yapamaz).

---

## FAZ 3 — Tasarım (🟡)

`implementation_plan.md` zaten iyi bir animasyon listesi içeriyor; önceliklerini aynen uygula (cevap pulse/shake, buton press, sayfa geçişi, timer son saniye, podyum). Eksik olan ve daha önemli olanlar:

1. **Erişilebilirlik — renk körlüğü**: doğru/yanlış sadece yeşil/kırmızıyla anlatılmasın; reveal'da ✓ / ✗ ikonları ve şık kenarlığı deseni ekle.
2. **Klavye kısayolları**: 1–4 (veya A–D) ile şık seçme, Enter ile kilitleme. Masaüstü Discord kullanıcıları için büyük hız farkı.
3. **Ses efektleri + sessize alma düğmesi**: geri sayım tik'i, doğru/yanlış, podyum. Varsayılan düşük ses, ayar kalıcı.
4. **Mobil**: yatay kilit + safe-area test edilmemiş (smoke listesi). Şık butonları mobilde en az 44px dokunma alanı.
5. **Kategori seçici**: 20+ buton tek satır yerine yatay kaydırma + seçili kategoriler en başta.
6. Tüm yeni animasyonlar `prefers-reduced-motion` altında kapalı (plan zaten şart koşuyor).

---

## FAZ 4 — Eklenmesi en değerli özellikler (🟢, sırayla)

1. **"Bu soru hatalı" bildirimi** — reveal ekranında küçük bayrak butonu; sunucu `question_reports` tablosuna yazar. İçerik kalitesini oyuncular denetler. (Faz 1.3'teki hataların oyunda fark edilmesini sağlar.)
2. **Günlük meydan okuma** — herkes için aynı 5 soru (tarih tohumlu seçim), günde bir kez oynanır, Wordle tarzı emoji sonuç metni (`🟩🟩🟥🟩🟩 Triviara #42`) kopyalanabilir. En güçlü geri dönme sebebi.
3. **Maç sonu Discord paylaşımı** — podyumdan sonra "Kanala paylaş" butonu; Embedded App SDK ile sonuç kartı / davet. Yeni oyuncu getiren döngü.
4. **Sunucuya özel soru paketi** — sunucu yöneticisinin JSON/CSV ile kendi sorularını yüklemesi (Faz 1.4 doğrulayıcısından geçer). Topluluklar için en ayırt edici özellik.
5. **İzleyici modu** — maç başladıktan sonra gelenler koltuk almadan izler, bir sonraki maça otomatik katılır.

Her özellik ayrı PR olsun; her PR'da test + kısa ekran görüntüsü/gif.

---

## Uygulama sırası (PR listesi)

| # | PR | Faz | Tahmini boyut |
|---|---|---|---|
| 1 | Keşif raporu + ARCHITECTURE.md | 0 | S |
| 2 | SMOKE-DURUM kaldır, gitleaks taraması, belge tutarlılığı, paket adı | 1.1, 1.8 | S |
| 3 | `normalizeAnswer` + aliases + testler | 1.2 | M |
| 4 | Soru doğrulayıcı + içerik düzeltmeleri | 1.3, 1.4 | M |
| 5 | Anti-hile doğrulama/düzeltme + testler | 1.5 | M |
| 6 | Sahte verilerin temizlenmesi | 1.6 | M |
| 7 | SQLite kalıcılık | 1.7 | L |
| 8 | CI + reconnect/kapasite testleri + tekrar önleme | 2 | M |
| 9 | Erişilebilirlik, klavye, ses | 3 | M |
| 10 | implementation_plan.md animasyonları | 3 | M |
| 11 | Soru bildirimi | 4.1 | S |
| 12 | Günlük meydan okuma | 4.2 | M |
| 13 | Discord paylaşımı | 4.3 | M |
| 14 | Özel soru paketi | 4.4 | L |

---

## Devin'e yapıştırılacak prompt

```
Repo: github.com/dorukakindev/quiztavern (Discord Embedded Activity quiz oyunu;
client: Vite + React 19 + TS, server: Express 5 + Socket.IO 4, shared/types.ts).

Repo kökündeki DEVIN_PLAN.md dosyası bu görevin tek kaynağıdır. Kurallar:
1. Önce FAZ 0'ı yap ve bulgularını bana raporla; [DOĞRULA] maddelerinin her biri
   için "sorun var / yok" tablosu ver. Onayımı beklemeden FAZ 1'e geçebilirsin.
2. PR'ları plandaki sırayla, her biri ayrı branch ve ayrı PR olacak şekilde aç.
   Bir PR'da birden fazla konuyu karıştırma.
3. Her PR'da: `npm test` ve `npm run build` geçmeli; yeni davranış için test ekle.
4. Dokunulmayacaklar: renk paleti, font ailesi, genel layout, prefers-reduced-motion
   desteği. Oyun kuralları (puanlama, süreler) değişmeyecek; sadece bug düzeltilecek.
5. Git geçmişinde secret bulursan kod değiştirmeden ÖNCE bana haber ver.
6. Gerçek Discord iframe testini sen yapamazsın; ilgili PR açıklamasına
   SMOKE-TEST.md'den hangi maddelerin elle test edilmesi gerektiğini yaz.
7. Belirsiz kalan bir içerik/ürün kararında (ör. bir sorunun doğruluğu) tahmin etme,
   PR açıklamasında soru olarak bırak.
```
