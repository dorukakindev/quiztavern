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
