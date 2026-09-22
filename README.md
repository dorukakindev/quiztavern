# QuizTavern

Discord içinde çalışan, çok oyunculu, sunucu-otoriter bir quiz oyunu. İstemci bir
[Discord Embedded Activity](https://discord.com/developers/docs/activities/overview)
(Vite + React), sunucu Express + Socket.IO'dur.

## İçerik

| Yol | Açıklama |
| --- | --- |
| `client/` | Discord Activity arayüzü (Vite, React 19, TypeScript) |
| `server/` | Yetkili oyun sunucusu (Express 5, Socket.IO 4) |
| `shared/` | İstemci+sunucu ortak tip ve sabitler (`shared/types.ts`) |
| `deploy/` | Cloudflare Tunnel ile yayınlama rehberi (`deploy/TUNNEL.md`) |
| `client/public/` | Statik varlıklar — yasal sayfalar dahil (`/privacy`, `/terms`) |

## Gereksinimler

- Node.js >= 22.12
- npm >= 10.9

## Kurulum

```bash
npm install
cp server/.env.example server/.env   # gizli değerleri doldur
cp client/.env.example client/.env   # VITE_DISCORD_CLIENT_ID
```

## Geliştirme

```bash
npm run dev        # client (5173) + server (3001) birlikte
```

- İstemci, Discord iframe'i DIŞINDA `VITE_GAME_SERVER_URL`'e, içinde `/api`
  proxy'sine bağlanır (`client/src/lib/realtime.ts`).
- Yerel test `ALLOW_MOCK_AUTH=1` ile gerçek Discord olmadan çalışır;
  üretimde bu bayrak kapalı olmalıdır (`server/src/config.ts` fail-closed).

## Test

```bash
npm test           # 7 paket: client oyun+i18n, server hardening/security/edge'ler
npm run build      # server -> dist/, client -> client/dist
npm start          # production: node --enable-source-maps dist/src/index.js
```

Production mod sunucusu `client/dist`'i statik servis eder; `/privacy` ve
`/terms` temiz yolları Discord Developer Portal'ın istediği kamu URL'leridir.

## Üretim ortamı değişkenleri

`server/.env.example` içinde hepsi belgeli: `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET`,
`PUBLIC_BASE_URL` (https), `ALLOWED_ORIGINS`, `PORT`, `HOST`,
`ALLOW_MOCK_AUTH` (production'da `0`).

## Yayınlama

Tek süreç, tek port (varsayılan 3001). Önerilen yol
`deploy/TUNNEL.md` — Cloudflare Tunnel; Discord Developer Portal'da
**Activities → URL Mappings** kökü tünel adresine bağlanır.
