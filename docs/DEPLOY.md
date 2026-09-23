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
  (alt yol eşlemeleri gerekmez; `/api` istekleri aynı origin'e gider).
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
   `PUBLIC_BASE_URL` = servisin Railway URL'i (`https://<ad>.up.railway.app`).
   `ALLOW_MOCK_AUTH` **asla** eklenmez.
3. **Volume** ekle: servis → **Volumes → New Volume** → mount path
   `/app/server/data`. Bu, restart/deploy'da XP/rozet/günlük verisini korur.
4. Railway bir public domain üretir (Settings → Networking → Generate Domain) —
   o URL'i `PUBLIC_BASE_URL`'e ve aşağıdaki Portal adımına yaz.

## Render (Dockerfile tek tıkla; ücretsiz planda kalıcı disk yok)

1. https://dashboard.render.com → **New → Blueprint** → repo'yu seç →
   `render.yaml` algılanır → **Apply**. İlk deploy'da `sync: false` değişkenleri
   sorulur: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`,
   `PUBLIC_BASE_URL` (`https://<servis>.onrender.com`). `SESSION_SECRET`
   blueprint tarafından üretilir.
2. Ücretsiz plan uyur — ilk istek ~30 sn'de uyanır ve `/health` ucu health
   check'i karşılar. SQLite dosyaları konteyner içi kalır: **yeniden
   deploy/restart'ta XP verisi sıfırlanır**.
3. Kalıcılık için planı **starter** yap ve `render.yaml` içindeki yorumlu
   `disk:` bloğunu aç (mount `/app/server/data`).

## Sonrası (iki platformda da aynı)

Developer Portal'da URL'leri sabitle:
- **Activities → URL Mappings:** kök `/` → servis URL'in.
- **OAuth2 → Redirects:** `https://<servis-url>/auth/discord/callback`.
- Eski cloudflared/tunnel mapping'lerini kaldır.

Doğrulama: `curl https://<servis-url>/health` → `{"ok":true}`; sonra Discord'da
Activity'i açıp bir maç oynat (lobi → soru → podyum akışı + XP şeridi doluyor mu).
