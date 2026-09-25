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

### Fixed — içerik verisi
- Çember: anlamsız EN ipucu-cevap çiftleri ve uydurma TR cevaplar düzeltildi;
  uzun bileşiklere alias; neredeyse-aynı ipuçları çeşitlendirildi.
- 149 referanssız soru görseli temizlendi (~7,5 MB); `_legacy/` 68 MB silindi.

## [1.0.0] — 2026-09
İlk Discord Activity yayını (Triviara, client ID 1552535678385004577).
Oracle Cloud Always Free üzerinde Docker + Caddy ile barındırılıyor.
