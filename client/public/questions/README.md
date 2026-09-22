Soru görselleri burada durur. `server/data/questions.json`'daki bir sorunun
`image` alanı bu klasördeki dosya adını verir (örn. `"image": "eyfel-kulesi.webp"`),
istemci `/questions/<dosya-adı>` yolundan yükler.

Kurallar: **3:2 oran** (ör. 1200x800 veya 960x640 — `.qt-question-image`
CSS'i bu orana kilitli, başka oranlar kırpılır), ~150 KB altı, tercihen
WEBP, üzerinde yazı/filigran yok (kategori rozeti ve soru metni ayrıca
gösteriliyor).
