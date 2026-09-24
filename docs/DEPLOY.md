# QuizTavern — Fly.io'da kalıcı barındırma

Oyun tek Docker imajında çalışır: Express + Socket.IO sunucusu, production istemci
build'ini (`client/dist`) aynı porttan servis eder. SQLite dosyaları (XP, günlük
meydan okuma, soru bildirimleri) Fly volume'da tutulur.

Bu belge oyunu senin makinen yerine kalıcı bir sunucuya taşır; PC'n kapalıyken
de Activity çalışmaya devam eder ve App Directory başvurusu için sabit URL'in olur.

## 1. Ön koşullar

- `flyctl` kurulu ve `fly auth login` yapılmış olmalı.
- Discord Developer Portal'da uygulamanın şunları hazır olmalı:
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.

## 2. Uygulamayı oluştur (ilk kez)

```bash
fly apps create quiztavern          # ad doluysa quiztavern-<ek> kullan
fly volumes create quiztavern_data --region fra --size 1
```

`app` adını değiştirirsen `fly.toml` içindeki `app = "quiztavern"` satırını da
aynı ada güncelle.

## 3. Secret'ları ayarla

```bash
fly secrets set \
  DISCORD_CLIENT_ID="…" \
  DISCORD_CLIENT_SECRET="…" \
  DISCORD_BOT_TOKEN="…" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  PUBLIC_BASE_URL="https://quiztavern.fly.dev"
```

- `PUBLIC_BASE_URL` tarayıcı OAuth geri dönüşünü türetir — kendi alan adını
  kullanacaksan onu yaz.
- `SESSION_SECRET`'ı bir kez üretip aynı değeri koru; değişirse açık oturumlar
  geçersizleşir.
- `ALLOW_MOCK_AUTH` **asıla** ayarlanmaz.

## 4. Deploy

```bash
fly deploy
```

İmage monorepo'yu tek aşamada derler (server `dist` + client `dist`); health
check `/health` ucuna vurur. Deploy sonrası:

```bash
curl https://quiztavern.fly.dev/health     # {"ok":true}
fly logs                                  # "server dinliyor" satırını gör
```

## 5. Discord Portal ayarları

Fly URL'i belli olduktan sonra Developer Portal'da:

- **Activities → URL Mappings:** kök `/` → `https://quiztavern.fly.dev/`
  + Vekil Yol `/api` → `quiztavern.fly.dev` (önek soyulup `/socket.io`
  vb. istekler sunucuya düşer; kök eşleme bunu TEK BAŞINA karşılamaz).
- **OAuth2 → Redirects:** `https://quiztavern.fly.dev/auth/discord/callback` ekle.
- Eski cloudflared/tunnel mapping'lerini kaldır.

## 6. Otomatik deploy (isteğe bağlı)

`main`'e merge'lerde otomatik deploy için repo secret'ına `FLY_API_TOKEN`
ekle (`fly tokens create`) ve `.github/workflows/deploy.yml`'i etkinleştir —
şablon aşağıda, bu PR'da kapalı tutulur:

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

## Sorun giderme

- **`game.state` gelmiyor / mavi ekran:** sunucu logunda `ORIGIN_DENIED`,
  `AUTH_REQUIRED`, `INSTANCE_DENIED` ara (`fly logs`). `PUBLIC_BASE_URL` ve
  Portal'daki mapping uyuşmuyorsa origin reddi görülür.
- **Instance doğrulaması düşüyor:** `DISCORD_BOT_TOKEN` geçerli ve doğru
  uygulamaya ait olmalı.
- **Veri sıfırlandı:** volume bağlı mı — `fly volumes list`; `fly.toml`
  mounts bloğu `/app/server/data`ya bakmalı.
- **Oturumlar düştü:** `SESSION_SECRET` değişti mi diye kontrol et.

---

# Alternatif: Railway veya Render

Fly kullanmak istemezsen aynı Dockerfile iki platformda da tek tıkla çalışır —
config dosyaları repoda hazır (`railway.toml`, `render.yaml`). İkisi de `PORT`u
kendisi enjekte eder, sunucu `process.env.PORT`u okuduğu için imaj değişmez.

**Karşılaştırma:** Railway ücretsiz trial kredisiyle başlar ve **volume** desteği
kalıcı SQLite'ı her planda verir; Render'ın ücretsiz web planı kalıcı disk
desteklemez (xp.db restart'ta sıfırlanır) — disk için starter plana çıkmak gerekir.

## Railway (önerilen — kalıcı disk her planda)

1. https://railway.com → **New Project → Deploy from GitHub repo** → quiztavern'i
   seç. `railway.toml` Dockerfile'ı ve `/health` kontrolünü otomatik uygular.
2. **Variables** sekmesine ekle:
   `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`,
   `SESSION_SECRET` (bir kez üret: `openssl rand -hex 32`, sonra sabit tut),
   `PUBLIC_BASE_URL` = servisin Railway URL'i (`https://<ad>.up.railway.app`),
   `VITE_DISCORD_CLIENT_ID` = `DISCORD_CLIENT_ID` ile aynı (client ID imaja
   build-arg olarak gömülür; değişkense Activity Discord'da SDK'ya bağlanamaz).
   `ALLOW_MOCK_AUTH` **asla** eklenmez.
3. **Volume** ekle: servis → **Volumes → New Volume** → mount path
   `/app/server/data`. Bu, restart/deploy'da XP/rozet/günlük verisini korur.
4. Railway bir public domain üretir (Settings → Networking → Generate Domain) —
   o URL'i `PUBLIC_BASE_URL`'e ve aşağıdaki Portal adımına yaz.

## Render (Dockerfile tek tıkla; ücretsiz planda kalıcı disk yok)

1. https://dashboard.render.com → **New → Blueprint** → repo'yu seç →
   `render.yaml` algılanır → **Apply**. İlk deploy'da `sync: false` değişkenleri
   sorulur: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`,
   `PUBLIC_BASE_URL` (`https://<servis>.onrender.com`),
   `VITE_DISCORD_CLIENT_ID` (`DISCORD_CLIENT_ID` ile aynı — build-arg olur).
   `SESSION_SECRET` blueprint tarafından üretilir.
2. Ücretsiz plan uyur — ilk istek ~30 sn'de uyanır ve `/health` ucu health
   check'i karşılar. SQLite dosyaları konteyner içi kalır: **yeniden
   deploy/restart'ta XP verisi sıfırlanır**.
3. Kalıcılık için planı **starter** yap ve `render.yaml` içindeki yorumlu
   `disk:` bloğunu aç (mount `/app/server/data`).

## Sonrası (iki platformda da aynı)

Developer Portal'da URL'leri sabitle:
- **Activities → URL Mappings:** kök `/` → servis URL'in
  + Vekil Yol `/api` → `<servis-host>` (Discord `/api` önekini soyar;
  socket.io ve auth uçları bu yoldan sunucuya ulaşır).
- **OAuth2 → Redirects:** `https://<servis-url>/auth/discord/callback`.
- Eski cloudflared/tunnel mapping'lerini kaldır.

Doğrulama: `curl https://<servis-url>/health` → `{"ok":true}`; sonra Discord'da
Activity'i açıp bir maç oynat (lobi → soru → podyum akışı + XP şeridi doluyor mu).

---

# Alternatif: Oracle Cloud Always Free (gerçek VM, süresiz ücretsiz)

En ucuz-kalıcı yol: Oracle'ın süresiz ücretsiz VM'inde kendi Docker'ın çalışır —
uyku yok, disk kalıcı, sabit IP. Ücret yok ama hesap açılışında kart doğrulaması ister.

## 1. Hesap ve VM (sen yaparsın — kart doğrulaması gerekir)

1. https://www.oracle.com/cloud/free/ → Sign up → **home region**'ı dikkatli
   seç (Always Free kaynaklar yalnız home region'da; Frankfurt tercih et).
2. Compute → **Create instance**:
   - Image: **Ubuntu 22.04 aarch64** (Ampere ARM)
   - Shape: **VM.Standard.A1.Flex** → 2 OCPU / 12 GB (Always Free içinde)
   - SSH key: "no SSH key" seç (cloud-init betiği kendi anahtarını kurar)
   - **Advanced options → Management → cloud-init script:** repodaki
     `deploy/oracle/cloud-init.yaml` dosyasının tamamını yapıştır
   - Networking: yeni VCN+subnet otomatik oluşsun, public IP verilsin
3. **Security List aç** (OCI tarafı — ufw'a ek): oluşan subnet'in Security
   List'ine ingress ekle: `0.0.0.0/0 TCP 80` ve `0.0.0.0/0 TCP 443` (22 zaten açık).
4. Instance **public IP**'sini not et.

## 2. Uygulama katmanı (Devin SSH'tan kurar)

cloud-init VM'i hazır getirir (Docker + `quiztavern` kullanıcısı + UFW).
Devin'e `ssh quiztavern@<public-ip>` erişimi verdiğinde gerisini o yapar:
repo → `docker build --build-arg VITE_DISCORD_CLIENT_ID=<app client id>` →
konteyner (restart always, `/opt/quiztavern/data` volume'u
`/app/server/data`'ya bağlı) → env secret'ları → Caddy ile HTTPS.
Not: client ID imaja build anında gömülür (`import.meta.env`); build-arg
atlanırsa Activity Discord'da SDK'ya bağlanamaz.

## 3. Alan adı + HTTPS

Activity iframe'i HTTPS ister; seçenekler:
- **DuckDNS (önerilen):** https://www.duckdns.org → GitHub/Google ile giriş →
  alt alan (ör. `quiztavern.duckdns.org`) → IP = public IP. Hesap bedava,
  Let's Encrypt uyumlu. `token`'ı da Devin'e ver (IP değişirse güncellemek için).
- **sslip.io (sıfır kayıt):** `<public-ip>.sslip.io` doğrudan IP'ye çözümlenir;
  Caddy buna da sertifika alır — ek hesap gerekmez, nadir Let's Encrypt
  rate-limit riski var.

`deploy/oracle/Caddyfile` içine `<DOMAIN>` yerine seçtiğin alan yazılır.

## 4. Discord Portal (Railway/Render'dakiyle aynı)

- **Activities → URL Mappings:** kök `/` → `https://<alan-adın>`
  + Vekil Yol `/api` → `<alan-adın>` (Discord `/api` önekini soyup
  `/socket.io` vb. istekleri sunucuya iletir; eksikse activity
  'websocket error' ile düşer).
- **OAuth2 → Redirects:** `https://<alan-adın>/auth/discord/callback`
- Eski cloudflared mapping'lerini kaldır.
- Doğrulama: `curl https://<alan-adın>/health` → `{"ok":true}`.

## Notlar

- A1 ARM kapasitesi bazen dolu olur; "Out of capacity" alırsan başka
  availability domain dene veya **VM.Standard.E2.1.Micro** (AMD x86, 1GB) seç
  — Docker imajı iki mimaride de derlenir (better-sqlite3 kaynakdan derlenir).
- Boot volume 47-200GB Always Free — `/opt/quiztavern/data` üzerindedir,
  xp.db/daily.db burada kalıcıdır.
- Ücretsiz hesap uyku yapmaz; VM kapatılmadıkça kaynaklar senindir.
