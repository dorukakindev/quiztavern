# Changelog

Bu depo [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler.
Varlık lisansları için `ASSET-LISANSLARI.md`'ye bakın.

## [Unreleased]

### Added — oyun modları (14 mod)

- Klasik, Fitil, Çember, Çifte Bahis, Takım, Son Masa, Bulanık Resim,
  Kelime Oyunu, Düello, Zil, Yakın Tahmin, Zaman Çizelgesi, D/Y Blitz,
  Tavern Panosu.

### Added — özellikler

- Jokerler (Tavern Kartları): %50, Çifte, Kalkan, Dondur; botlar da kullanır.
- XP/lig meta katmanı: seviye, sezon tablosu, haftalık turnuva, rozetler,
  unvanlar, masa temaları, kategori ustalığı.
- Günlük Meydan Okuma + gün lider tablosu ve Wordle paylaşımı.
- Soru yazarı turu: lobide soru yaz, maça karışır.
- Rövanş oylaması, izleyici tahmini, emote paketi, mod yardımı.
- Özel soru paketi yükleme + uygulama içi paket editörü.
- Mod amblemleri (Tripo render), kategori ikonları, lisans defteri.

### Changed — sağlamlık

- `retry()` uçuştaki authorize ile yarışmaz (Discord 4002).
- Socket emit'leri `socket.connected` ile korunur; WebGL bağlam kaybında
  render döngüsü durur; AudioContext ilk jestte unlock olur.
- Docker entrypoint bind-mount sahipliğini chown'lar (root → runuser).
- Admin uçları: timingSafeEqual + rate limit; global Express hata işleyici.

### Added — altyapı / geliştirici deneyimi

- ESLint flat config + Prettier; repo lint'i temiz (0 hata/uyarı).
- LICENSE (MIT), CHANGELOG, deploy/env.list (kanonik env listesi).
- Tek komutluk test runner (run-tests.mjs) — '&&' zinciri yerine özetli rapor.
- xp.db günlük yedekleme + haftalık bakım görevi.

### Changed — sağlamlık ve denge (BUG-RAPORU B-bulguları)

- Blitz: firstAnswerId yalnız doğru cevaba; kopuş pencereyi erken kapatmaz;
  izleyici tahmini yalnız geri sayımda; soru sayacı kendi ilerlemesini gösterir.
- Zil: yanlış basış skoru 0'da sınırlı; ceza yalnız basıp kaybedene; kazananın
  izleyiciye geçişi zili takmaz; bot doğruluğu botSkill'e bağlı.
- Tavern Panosu: ayrılan seçici kalıcı atlanır; seçim sırası maç-içi katılım/
  ayrılığı izler; 'son maç hariç' koruması sorulanları kapsar.
- Kelime Oyunu: harf-alma kişi başı 2; kilitli oyuncu harf alamaz; kazanç
  kutusu ve doğru/yanlış sesi düzeltildi; ipucu cevabı sızdırmaz.
- Yakın Tahmin: maç özeti inceleme listesi; beraberlik FP-simetrik test.
- Yazar soruları 'Topluluk' etiketi taşır; dar havuzda delik açmaz; bedava
  zorluk bonusu vermez.
- Lider tabloları yalnız lobi/podium fazında state'e yazılır (ağ tasarrufu).
- Soru sayısı çipleri anlamsız modlarda gizlenir + sunucu tarafında reddedilir.
- Kalibrasyon mod-bilinçli; deadline kilidi geç cevapları reddeder; şık-indeks
  cevap yalnız choice modlarında geçer.
- MODE_CONTRACT: mod özellikleri tek sözleşme tablosunda (shared/types.ts).
- emitRoom: ortak yük broadcast başına bir kez hesaplanır, kişisel katman
  alıcı başına uygulanır.

### Fixed — içerik verisi

- Çember: anlamsız EN ipucu-cevap çiftleri ve uydurma TR cevaplar düzeltildi;
  uzun bileşiklere alias; neredeyse-aynı ipuçları çeşitlendirildi.
- 149 referanssız soru görseli temizlendi (~7,5 MB); `_legacy/` 68 MB silindi.

## [1.0.0] — 2026-09

İlk Discord Activity yayını (Triviara, client ID 1552535678385004577).
Oracle Cloud Always Free üzerinde Docker + Caddy ile barındırılıyor.
