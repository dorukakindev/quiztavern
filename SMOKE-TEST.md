# Discord Smoke Testi — adım adım

Amaç: oyunun GERÇEK Discord iframe'inde çalıştığını kanıtlamak. Bugüne kadarki
her şey mock modda doğrulandı; bu liste geçmeden "Discord'da çalışıyor" denemez.

## 0. Ön koşullar (bir kez)

- [ ] **Dev Discord uygulaması** — Developer Portal'da YENİ uygulama aç
      (prod'dan ayrı; testçiler prod team'ine eklenmez, Developer rolü secret görür).
  - Installation: **User Install + Guild Install** ikisi de işaretli
  - **OAuth2 → Redirects: `https://127.0.0.1` ekle** ← atlanırsa `authorize()`
    "Missing redirect_uri in request" (5000) ile patlar. Activity iframe'inde
    bu adrese gerçekten gidilmez; Discord yalnızca kayıtlı bir redirect
    bulunmasını şart koşar.
  - Activities → Settings: **Enable Activities** açık
  - (Telefonda test için) iOS/Android platform kutuları işaretli
  - OAuth2: Client ID + Client Secret'ı not al; Bot sekmesinden Bot Token üret
- [x] **cloudflared** kuruldu — `%LOCALAPPDATA%\cloudflared\cloudflared.exe`, PATH'te,
      sürüm 2026.7.2, SHA256 resmî release ile doğrulandı. (ngrok free interstitial
      sayfası gösterdiği için Activity iframe'inde sorun çıkarır; cloudflared tercih.)
      **Not:** TryCloudflare quick tunnel için Cloudflare hesabı / alan adı GEREKMEZ;
      README'deki "önce siteni ekle" şartı named tunnel içindir.
- [ ] `server/.env` doldur (bkz. server/.env.example):
      `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`,
      `SESSION_SECRET` (openssl rand -hex 32) — ve **ALLOW_MOCK_AUTH satırını sil**
      (üretim duruşu; mock açıkken instance doğrulaması atlanır).
- [ ] `client/.env` doldur (bkz. client/.env.example): `VITE_DISCORD_CLIENT_ID`.

## 1. Tünel + URL Mapping (her oturumda)

```
# Terminal 1 — sunucu
npm run dev -w server

# Terminal 2 — istemci
npm run dev -w client

# Terminal 3 — istemci tüneli
cloudflared tunnel --url http://localhost:5173

# Terminal 4 — sunucu tüneli
cloudflared tunnel --url http://localhost:3001
```

- Portal → Activities → **URL Eşlemeleri**. Sayfa İKİ ayrı bölüm (protokolsüz,
  sadece host — `https://` yazma):
  1. **Kök Eşlemeleri**: Önek `/` sabittir, sadece Hedef'i doldur →
     `xxx-client.trycloudflare.com` (istemci)
  2. **Vekil Yol Eşlemeleri** → "Bir URL Eşleştirmesi daha ekle" →
     Önek `/api`, Hedef `yyy-server.trycloudflare.com` (oyun sunucusu)

  `/api` eşlemesi ZORUNLU: Discord CSP'si iframe'den dış adres isteğini engeller;
  istemci sunucuya yalnızca proxy'nin /api önekiyle ulaşır. Kod bunu kendisi
  seçer: hostname `.discordsays.com` ise `/api`, değilse `VITE_GAME_SERVER_URL`.
  Eksikse `/api/...` istekleri köke düşer, Vite'a gider ve
  `[token] 404: sunucu yanit vermedi` alırsın.

  (Not: Bu arayüzde "sıralama" derdi yoktur — kök ayrı bölümdedir ve vekil yol
  eşlemeleri ondan önce değerlendirilir. Doküman metnindeki "uzun önek üstte"
  uyarısı elle liste yazılan eski/başka akışlar içindir.)
- Sunucu tünel URL'sini `client/.env` → `VITE_GAME_SERVER_URL`'e de yaz
  (https'li tam URL; tarayıcıdan Discord'suz test için kullanılır).
- Discord'da bir ses kanalına gir → Aktiviteler (roket) → uygulamayı başlat.

## 2. Geçmesi gerekenler (planın DoD listesi)

- [ ] Masaüstünde açılıyor; authorize ekranı geliyor, onay sonrası lobi
- [ ] `ready → authorize → token → authenticate` zinciri hatasız
      (Konsol: PTB Discord → View → Developer → Toggle Developer Tools)
- [ ] instanceId + katılımcılar görünüyor (ikinci hesapla kanala gir, koltukta belir)
- [ ] Socket.IO **websocket-only** bağlanıyor (Network sekmesi: `transport=websocket`)
- [ ] Socket.IO **polling → upgrade** da çalışıyor (realtime.ts'te transports
      sırasını geçici `['polling','websocket']` yapıp dene, sonra geri al)
- [ ] Tam maç: lobi → geri sayım (BAŞLA) → 5 soru → reveal koreografisi → podyum
- [ ] Reconnect: Discord'u kapat/aç ya da uçak modu — 30 sn içinde dönünce
      skor + koltuk duruyor
- [ ] PIP: Activity'yi küçült → kompakt kart; soru sırasında kilitlemeden
      küçült → "Cevap ver!" yanıp sönüyor
- [ ] Telefonda aç: landscape kilidi deniyor mu, safe-area payları çalışıyor mu
- [ ] Ekranda/DevTools'ta secret YOK: `client_secret`, `session_token` bundle'da
      aranmaz (sadece VITE_ değişkenleri: Client ID kamuya açık, sorun değil)
- [ ] Arkaplan videosu + maskot Discord proxy'sinden yükleniyor
      (Network: `*.discordsays.com/table/...` istekleri 200)

## 3. Bilinen tuzaklar

- **VPN'i kapat.** Açık VPN localhost trafiğine karışıyor: tünel logunda
  `dial tcp [::1]:3001 ... bağlantı kurulamadı` çıkar ve sunucu tüneli
  Cloudflare hata sayfası döndürür. Sunucu ayakta olduğu hâlde. (Bunu IPv6
  sorunu sanıp yanlış teşhis koyduk; VPN kapanınca IPv4/IPv6 ikisi de düzeldi.)
- **Tünel PowerShell'den açılmalı.** Claude'un Bash kabuğu kum havuzunda ve dışa
  bağlantısı kısıtlı; `cloudflared` oradan `connectex: Erişim izinlerince izin
  verilmeyen...` (WSAEACCES) hatası verir. PowerShell'den sorunsuz açılıyor.
- Vite tünel host'unu reddederse: `client/vite.config.ts` → `server.allowedHosts`
  (zaten `.trycloudflare.com` ekli).
- Discord istemcisi URL mapping değişikliğini hemen almayabilir → Discord'u
  tamamen kapatıp aç (tray'den de çık).
- `blocked:csp` konsol hatası görürsen: bir kaynak hâlâ dış CDN'den geliyor
  demektir — Network sekmesinde hangi istek olduğuna bak.
- Tünel URL'leri her `cloudflared` çalıştırışında değişir: Mapping + VITE_GAME_SERVER_URL
  ikisini de güncellemeyi unutma.
