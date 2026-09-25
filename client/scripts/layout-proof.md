# Oyun ekranı düzen kanıtı — tarayıcıda çalıştırılacak ölçüm

Bu dosya, `activity.css`/`GameBoard` her değiştiğinde tekrar koşturulacak ölçümün
kaynağıdır. Elle "gözüme iyi göründü" demek yerine sayı üretir.

Neden betik değil de kopyalanan bir parça: ölçüm gerçek bir maçın `question` →
`reveal` geçişini yakalamak zorunda, o da ancak canlı sunucuya bağlı bir
tarayıcıda oluyor. Node'dan koşan bir test bunu göremez.

## Kullanım

1. Sahte kimlikli yığını başlat (üretim portlarına dokunma):
   `ALLOW_MOCK_AUTH=1 PORT=3002 npm run dev -w server`
   `npm run dev -w client -- --port 5179 --strictPort`
2. `http://localhost:5179/?as=Sen` aç, masayı başlat.
3. Soru fazındayken aşağıdaki parçayı konsola yapıştır.

## Ölçüm

```js
// Soru fazında çalıştır: reveal'e kadar bekler, kartların kımıldayıp
// kımıldamadığını ölçer. Beklenen: her kart için sapma 0px (madde 1/9).
(async () => {
  const rects = () =>
    [...document.querySelectorAll(".qt-answer")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
  const faz = () => (document.querySelector(".qt-game").className.includes("is-revealing") ? "reveal" : "question");
  if (faz() !== "question") return "Soru fazında değil — bekle ve tekrar dene.";

  const once = rects();
  while (faz() === "question") await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 1200)); // koreografinin tüm beat'leri insin
  const sonra = rects();

  const sapma = once.map((a, i) => {
    const b = sonra[i];
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
  });
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    kartSayisi: once.length,
    sapmaPx: sapma,
    enBuyukSapma: Math.max(...sapma),
    sonuc: Math.max(...sapma) === 0 ? "GEÇTİ — hiçbir kart kımıldamadı" : "KALDI — kart oynadı",
  };
})();
```

## Taşma ölçümü (her boyutta)

```js
(() => {
  const de = document.documentElement;
  const tasanlar = [...document.querySelectorAll(".qt-game *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1);
    })
    .map((el) => el.className);
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    sayfaKaydirmasi: de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1,
    ekranDisinaTasanlar: tasanlar.slice(0, 6),
    sonuc: tasanlar.length === 0 && de.scrollHeight <= innerHeight + 1 ? "GEÇTİ" : "KALDI",
  };
})();
```

## Geçmesi gereken boyutlar

Gerçek ölçüm (2026-07-17, kullanıcının ekranı 1.5×):

| Bağlam                                             | CSS         |
| -------------------------------------------------- | ----------- |
| Discord DM                                         | 1289 × 495  |
| Discord sunucu (Word Bomb görüntüsünden türetildi) | ~1311 × 647 |

Bu yüzden test noktaları: **495 · 604 · 647 · 720**. Düzende sabit eşik yok,
`vh` tabanlı `clamp` ile sürekli ölçekleniyor — eşik olsaydı 699/701 arasında
görünüm zıplardı ve sunucu tam o sınıra düşüyor.

## Son koşum sonucu (2026-07-17)

| Boyut               | Sayfa kayması | Taşan öğe | Sayaç                 | Emote/şık çakışması |
| ------------------- | ------------- | --------- | --------------------- | ------------------- |
| 1289 × 495 (DM)     | yok           | yok       | tam görünür (üst 224) | yok                 |
| 1289 × 604          | yok           | yok       | tam görünür (üst 280) | yok                 |
| 1311 × 647 (sunucu) | yok           | yok       | tam görünür (üst 304) | yok                 |
| 1280 × 720          | yok           | yok       | tam görünür (üst 343) | yok                 |

**Kart sabitliği @ 1289×495:** reveal boyunca 15 kare örneklendi, 4 kartın
hepsinde sapma **0px**. Sadece son kareye değil her kareye bakılır — ara bir
sıçrama da hatadır.

**Puan çipi (nabız rafından oyuncu kartına taşındı):** 7 tur izlendi, çip çıkan
3 turun 3'ünde de sayarak arttı:
`+211 → +503 → +678 → +768 → +801 → +809`. Çip 193px'lik şeride sığıyor,
kart içi taşma 0.

> Not: sol şeritteki çip kazanç 0 iken artık "—" gösterir (eskiden hiç
> görünmezdi ve "sonucu gelmemiş" gibi okunuyordu).

## İkinci tur: tasarımın kalan 4 maddesi (2026-07-17)

| Madde                              | Ölçüm                                           |
| ---------------------------------- | ----------------------------------------------- |
| Çember: 20 nokta yerine ince çubuk | çubuk **200px**, nokta **0**, "Tur 5 / 20"      |
| "Masadan ayrıl" şeridin dışında    | `ayrilDisarida: true` (495 ve 647'de)           |
| Reveal'de sağ sütun = puan kutusu  | sayaç yok, `qt-your-gain` var, çizgi altında    |
| Reveal'de emote gizli              | soru fazında var (sağ alt 14/14), reveal'de yok |

**Kart sabitliği yeniden kanıtlandı** (RevealProgress karttan çıkarıldığı için
şarttı): 1289×495'te 14 kare, sapma **0px**.

> `qt-emote-bar` ile `qt-reveal-progress` kutuları geometrik olarak üst üste
> biner ama ikisi hiçbir zaman aynı anda görünmez: soru fazında çizgi
> `opacity:0`, reveal'de emote hiç render edilmez. Ölçüm "ÇAKIŞIYOR" derse
> paniğe gerek yok — görünürlüğü de kontrol et.

## Geri sayım rozeti: rakam vs yazı (2026-07-17)

Rozet tek haneli rakama göre ölçülü. `seconds` 0 olunca içerik "BAŞLA"/"GO"
yazısına dönüyor ve font küçülmezse çemberden taşıyor. `is-go` sınıfı fontu
kısar. 1289×495'te ölçülen:

| Hal                 | Font   | Yazı genişliği | Kutu içi | Taşıyor  |
| ------------------- | ------ | -------------- | -------- | -------- |
| `1` (rakam)         | 69.3px | 110px          | 110px    | hayır    |
| BAŞLA — `is-go` YOK | 69.3px | **231px**      | 110px    | **EVET** |
| BAŞLA — `is-go` var | 21.8px | 110px          | 110px    | hayır    |
| GO — `is-go` var    | 21.8px | 110px          | 110px    | hayır    |

**Ölçüm yöntemi notu:** "BAŞLA" karesi ekranda ~100ms görünür (geri sayım
3→2→1'den doğrudan soruya geçer), canlı yakalamak güvenilmez. Elemanı
`document.body`'ye takıp ölçmek yeterli: genişlik/font `vw/vh` tabanlı, ataya
bağlı değil. `getBoundingClientRect().width` body seviyesinde yanıltıcı çıkar
(68.9px) — **`clientWidth` vs `scrollWidth`** karşılaştır; clientWidth 110,
CSS'in dediği 118.8px − 10px kenarlık ile birebir uyuyor.

"Herkes aynı anda başlıyor" (`countdown.together`) kaldırıldı; canlı geri
sayımda doğrulandı (`h1Kaldi: hayır`).

## Bilinen açık

`reveal.nextIn` "Yeni soru **4** saniye içinde geliyor" diyor, çünkü
`GAME.REVEAL_MS = 3500` ve `Math.ceil(3500/1000) = 4`. Spec'te "3 saniye"
yazıyordu. Ya REVEAL_MS 3000'e çekilmeli ya da metin kabul edilmeli — karar
verilmedi.
