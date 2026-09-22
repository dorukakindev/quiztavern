# Sabit adresli Cloudflare Named Tunnel — kurulum

Amaç: Discord Activity'nin yüklediği URL'yi **kalıcı** yapmak. Ephemeral
`trycloudflare` tünellerinin URL'si her yeniden başlatmada değişir ve Discord
Portal'daki eşleme bayatlar → beyaz ekran. Named tunnel sabit bir hostname
verir; bir daha güncelleme derdi olmaz.

## Ön koşul
- **Cloudflare hesabı** + üzerinde yönetilen bir **alan adı** (domain). Ücretsiz
  planda çalışır ama sahip olduğun bir domain'i Cloudflare'e eklemen gerekir
  (nameserver'ları Cloudflare'e yönlendirerek). Domain yoksa named tunnel DNS
  routing yapamaz — o durumda deploy (Railway/Fly/Render) yoluna geçeriz.
- `cloudflared` zaten kurulu (`C:\Users\K\AppData\Local\cloudflared\cloudflared.exe`).

## Adımlar (hepsi bir kez)

1. **Giriş** (tarayıcı açılır, Cloudflare hesabınla yetkilendir):
   ```
   cloudflared tunnel login
   ```

2. **Tünel oluştur** (bir UUID + credentials .json üretir):
   ```
   cloudflared tunnel create quiztavern
   ```
   Çıktıdaki `Created tunnel quiztavern with id <UUID>` satırındaki UUID'yi ve
   `<UUID>.json` yolunu not al.

3. **DNS yönlendir** (hostname → tünel). Alan adın `ornek.com` ise:
   ```
   cloudflared tunnel route dns quiztavern quiztavern.ornek.com
   ```

4. **Config'i doldur:** `deploy/cloudflared-config.yml` içinde:
   - `TUNNEL_UUID_BURAYA` → adım 2'deki UUID (iki yerde)
   - `quiztavern.SENIN-ALAN-ADIN.com` → adım 3'teki hostname (iki yerde)

5. **Çalıştır** (Node.js 22.12 veya daha yeni):

   Önce bağımlılıkları kurup iki production çıktısını üret. `server/.env`
   içinde `NODE_ENV=production` ve
   `PUBLIC_BASE_URL=https://quiztavern.ornek.com` tanımlı olmalı.

   ```powershell
   npm ci
   npm run build
   $env:PORT = "3001"
   npm start
   ```

   ```
   cloudflared tunnel --config deploy/cloudflared-config.yml run quiztavern
   ```
   Artık `https://quiztavern.ornek.com` hem client'ı hem soketi (path'e göre)
   servis eder. Test: tarayıcıda aç → lobi gelmeli; `.../health` → `{"ok":true}`.

## Discord Developer Portal
Uygulaman → **Activities → URL Mappings**. Amaç: her şeyi tek sabit hostname'e
yönlendirmek (cloudflared path'e göre zaten 3001/5173 ayırıyor):
- **Root `/`** → `quiztavern.ornek.com`

Şu an birden çok eşlemen varsa (ör. ayrı bir `/api/socket.io` veya `/api` eşlemesi),
onları da **aynı** `quiztavern.ornek.com`'a yönlendir — cloudflared tarafı path
ayrımını yapıyor, ayrı hedefe gerek yok. Kaydet, Activity'yi kapat-aç.

Bir daha URL değişmez: `cloudflared ... run` her başladığında **aynı**
   hostname'i kullanır. API, Socket.IO ve derlenmiş istemci tek `3001`
   sürecinden servis edilir; production'da Vite geliştirme sunucusu çalıştırılmaz.

## Not — yerel production süreci hâlâ ayakta olmalı
Named tunnel yalnızca bir **proxy**; oyunu senin makinendeki tek 3001 süreci
sunuyor. Makine kapanınca oyun durur. Sürekli açık kalması
gereken gerçek üretim istiyorsan deploy (Railway/Fly/Render) yolu daha uygun —
o zaman makinenden bağımsız çalışır.
