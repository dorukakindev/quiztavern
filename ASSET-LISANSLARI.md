# Varlık Lisansları

Oyunda kullanılan her görsel/ses/fontun kaynağı ve lisansı. Yeni varlık eklerken buraya da ekleyin — Discord'da her şey uygulamanın kendi dosyası olarak servis edilir (CDN yok), bu yüzden yalnızca oyun içi kullanıma izin veren lisanslar seçilir.

## Üçüncü parti kütüphane varlıkları

| Varlık | Kaynak | Lisans | Not |
|---|---|---|---|
| İkonlar (UI'da kullanılan tüm ikonlar) | [@phosphor-icons/react](https://phosphoricons.com) | MIT | npm bağımlılığı olarak paketlenir; ayrıca atıf gerekmez. |
| Inter (arayüz fontu) `client/public/fonts/inter-*.woff2` | [Inter (rsms)](https://github.com/rsms/inter) | SIL OFL 1.1 | Web'e gömme serbest; dosyalar kendi sunucumuzdan servis edilir. |

## Oyun içi üretilen görseller

| Varlık | Kaynak | Lisans / Durum |
|---|---|---|
| `client/public/emblems/*.webp` (mod amblemleri: kart destesi, bomba, çark, jetonlar, bayraklar, baykuş) | Tripo Studio ile **Pro (ücretli) planda** metin/görselden üretilen modellerin yerel three.js render'ı | Pro planda üretilen modeller ticari kullanıma açık ve gizlidir; render'lar oyunun kendi varlığıdır. |
| `client/public/models/tavern-host.glb` (podyum maskotu) | Proje sahibinin sağladığı model | Kullanıcı varlığı — kaynak kullanıcı tarafından doğrulanır. |
| `client/public/table/*` (logo, hero görseli, bg-video, music.mp3) | Proje sahibinin sağladığı varlıklar | Kullanıcı varlığı. |
| `client/public/assets/discord-activity/*.webp` (açılış/sahne arka planları) | Proje için üretilen görseller | `questions.json` içinde `imageCredit: "Triviara"` olarak işaretli. |
| `client/public/questions/*.webp` (soru görselleri) | Proje için üretilen görseller | Her sorunun `imageCredit` alanı kaynağı gösterir; görsel üzerindeki ⓘ düğmesi krediyi gösterir. |

## Kurallar

- Kaynak dosyası son kullanıcıya dağıtılabilir (tarayıcıdan indirilebilir) — "redistribution yasak" lisanslı varlık kullanılmaz.
- Atıf gereken varlıklar: şu an atıf gerektiren tek kategori soru görselleridir; `imageCredit` alanı + ⓘ kredi düğmesi bunu karşılar. Yeni atıflı varlık eklenirse bu dosyaya ve gerekiyorsa `/terms`'e eklenir.
- Sesler küçük `ogg/mp3`, görseller `webp` tutulur.
