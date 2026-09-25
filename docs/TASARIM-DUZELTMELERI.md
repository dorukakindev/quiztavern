# Tasarım ve hata düzeltmeleri (2026-09)

Oyunun tüm akışı (lobi, kategori penceresi, geri sayım, soru, cevapların açıklandığı an (reveal), podyum, özet, inceleme) sekiz ekran boyutunda
(1440×900, 1366×625, 1280×720, 1024×600, 900×640, 768×1024, 844×390, 390×844)
ve beş modda gerçek tarayıcıyla oynatılıp ekran görüntüsü + taşma ölçümüyle
incelendi. Yerleşim düzeltmelerinin çoğu `client/src/activity/layout-fixes.css`
dosyasında; her bloğun yanında hangi sorunu neden düzelttiği yazıyor.

## Sıkışma / kayma / taşma düzeltmeleri

**Lobi**

- Masaüstünde sağ panel ekranın üst kenarına yapışıyor ve alttan kesiliyordu. Sol panel de alttaki ses/müzik/dil düğmelerinin üstüne biniyordu. Artık iki panel de ekrana sığıyor ve içerik fazlaysa kendi içinde kayıyor.
- "Günlük Meydan Okuma" iki satıra kırılıp paneldeki en iri öğe oluyordu. Artık tek satır.
- "Diğer m…" kesiliyordu, "Karışık" çipi kutusundan taşıyordu. İkisi de düzeldi.
- Küçük masada (telefon, alçak pencere) koltuklar ortadaki diske biniyordu. Masa küçükken koltuklar ve disk orantılı olarak küçülüyor.
- Telefon yatay (844×390): alttaki sabit Hazır/Başlat çubuğu ekranın üçte birini kaplıyor, masayı 230px'e eziyordu. Bu boyutta butonlar artık yandaki paneldeki normal yerlerinde.
- Dar ekranda tepedeki koltuk kesiliyordu, ses/dil düğmeleri de sayfanın en altında kayboluyordu. Düğmeler sol üste taşındı.

**Oyun ekranı**

- "İzleyici ol / Masadan ayrıl" 1024px'te iki satıra kırılıyordu. Artık hiç kırılmıyor; dar ekranda "Masadan ayrıl" yalnız ikon olarak görünüyor.
- Oyuncu şeridinde isim, rozet ve durum üç satıra diziliyor, durum "Düşünü…" diye kesiliyordu.
- Reveal'de yüzde etiketi ✓/✗ rozetinin üstüne biniyor, oy veren avatarlar bir alttaki şıkkı örtüyordu. İkisi artık tek rozet olarak kartın alt kenarında duruyor. Kimsenin seçmediği şıkta "%0" gösterilmiyor.
- 561–900px yüksek ekranlarda (tablet, küçük pencere) soru kartı ekranın yarısına sıkışıyor, oyuncular görünmüyordu. Bu boyutlar artık telefon düzenini kullanıyor.
- Dağılım çubuğu şık metninin içinden geçiyordu. Sayacın tarama çizgisi de halkanın dışına taşıyordu.
- Bildirim (toast) emoji çubuğunu örtüyordu. Artık üst ortada çıkıyor.

**Podyum / Özet / İnceleme**

- Sekmeler her sekmede farklı yükseklikte duruyordu (69 → 88 → 126px). Artık tepede sabit.
- 1024×600 ve 844×390'da kart ekrandan taşıyordu. Satırlar sıkılaştı ve gerekirse sayfa kayıyor.
- 3B karakter geç yüklenince podyum aşağı kayıyordu ve üstte siyah bir yükleme şeridi görünüyordu. Karakter artık sabit bir alanda açılıyor. Alçak ekranda hiç yüklenmiyor (yaklaşık 3 MB tasarruf).
- Özet ekranında kategori çubukları XP kutusuna yapışıktı. İncelemede "senin cevabın" satırında yanlış ikon (çıkış) vardı.

## Hatalar

- Reveal sırasında cevap vermeyen oyuncular "Düşünüyor" görünüyordu. Artık "Cevapsız / No answer" yazıyor.
- İngilizce arayüzde yüzde "%60" yazılıyordu. Artık "60%" (`formatPercent`).
- CSP `wasm-unsafe-eval` içermediği için podyumda model-viewer her açılışta konsola WebAssembly hatası basıyordu.
- `activity.css` içinde 61 bozuk karakterli (mojibake) yorum satırı UTF-8'e düzeltildi.
- `origin-gate` testi soğuk başlangıçta 20 sn sınırına takılıp ara sıra düşüyordu. Sınır 40 sn yapıldı.
