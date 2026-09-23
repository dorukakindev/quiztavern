---
name: testing-quiztavern
description: How to run and end-to-end test QuizTavern (client+server monorepo) locally with mock auth, auto-bots, and prod-mode checks.
---

# Testing QuizTavern locally

## Dev stack

- `server/.env` must contain `ALLOW_MOCK_AUTH=1` for local testing — without it every socket connection is rejected (fail-closed by design). The file may not exist; create it.
- `npm run dev` at repo root starts server on :3001 (tsx watch) + client on :5173 (vite). Vite proxies `/socket.io` and `/auth` to `127.0.0.1:3001` — test via `localhost:5173`, not :3001.
- If :3001 shows `EADDRINUSE`, a leftover `node dist/src/index.js` prod smoke server is usually holding it (check `ss -tlnp | grep 3001`); kill it — tsx watch does NOT auto-retry after a bind crash, restart `npm run dev`.
- Server needs Node ≥22.12.

## Mock identity & lobby

- Plain browser tab works — `window.parent === window` makes the client skip the Discord SDK and use a fallback identity (`dev-ana-lobi` room). `?as=<name>` gives a persistent per-name identity for multi-user tests; `?room=<id>` isolates rooms.
- Solo test is enough for the golden path: on EV.START the server **auto-adds a bot** when `ALLOW_MOCK_AUTH` and exactly 1 human is seated (server/src/index.ts ~line 335). Bots are auto-ready, so Hazırım → Masayı Başlat works with just you.
- Bots answer on a schedule; reveal triggers early once all eligible players answered — matches move fast if you answer quickly.
- Question count chip (5/10/15) picks match length; pick 5 for a ~60-90s full match to podium. Çember is always 20 rounds — test one round then "Masadan ayrıl" → "Masayı kapat ve kuruluma dön" → fresh lobby.
- Key TR labels: Klasik/Çember/Diğer modlar mode cards, "Hazırım"/"Hazırsın", "Masayı Başlat" (host-only, disabled until everyone ready), "İzleyici ol"→"Oyna" spectate roundtrip, "Kilitle" in Çember, "Masadan ayrıl" leave.
- Answers near the deadline may be rejected server-side (deadline check wins over late packets) — click choices early in the timer, not at <5s.
- The howto modal re-opens every load unless "Bir daha gösterme" is checked — handy for i18n checks (switch TR/EN bottom-left, reload).

## Prod-mode checks

- `/privacy` and `/terms` are **prod-only** routes (inside `IS_PRODUCTION`); in dev vite serves `/privacy.html` + `/terms.html` from `client/public`. Both should be checked.
- Prod server requires Discord env vars AND refuses to boot with `ALLOW_MOCK_AUTH=1`. Move `server/.env` aside, then:
  `PORT=3002 NODE_ENV=production DISCORD_CLIENT_ID=x DISCORD_CLIENT_SECRET=x DISCORD_BOT_TOKEN=x SESSION_SECRET=x PUBLIC_BASE_URL=https://example.com node dist/src/index.js`
  (values aren't validated — only presence matters). Restore `.env` after.

## Server-internal checks

- Game logic is socket-driven and hard to observe in UI; for changed internals (e.g. `sampleCirclePrompts` dedup, `clientAddressKey` XFF) run a quick `npx tsx -e "import {...} from './src/...'"` check in `server/` — the real TS module, not `dist` (dist may be a stale bundle).
- `npm test` covers 7 suites (activity, i18n, hardening, sec, circle/bet edge, dod).

## Viewport / Discord-iframe emulation

- To simulate Discord Activity iframe sizes (mobile portrait, landscape, pip) without Discord creds: run Chrome with `--remote-debugging-port=29229`, then drive `Emulation.setDeviceMetricsOverride` over the page target's WebSocket (`ws://127.0.0.1:29229/devtools/page/<targetId>`). The emulated page renders 1:1 real px at the top-left of the window (letterboxed); computer-tool clicks/zooms still work on it. `Emulation.clearDeviceMetricsOverride` resets.
- Quick driver used in session: `/tmp/cdp.mjs <w> <h> [mobile] [url|-]` (recreate if gone — ~20 lines of Node native WebSocket; also `Runtime.evaluate` over the same socket for scrollability checks like `stage.scrollHeight > stage.clientHeight`).
- `?layout=pip` forces the compact PipCard view (`useDiscordActivity.ts`) — use it to test the ~360×310 pip surface instead of the full UI.

## Devin Secrets Needed

- None for local mock-auth testing. Real Discord Activity flow needs a dev Discord app (see repo `SMOKE-TEST.md`): `DISCORD_CLIENT_ID/SECRET/BOT_TOKEN` in `server/.env`, `VITE_DISCORD_CLIENT_ID` in `client/.env`, plus cloudflared tunnels — that path was not part of routine local testing.

## Reveal-window capture

Solo+bot reveals resolve in ~3s, so post-hoc screenshots miss them. Poll for the reveal state and screenshot instantly:

```bash
node /tmp/cdp-eval.mjs "new Promise(res=>{const p=()=>{document.querySelector('.is-revealing,[class*=reveal]')?res('revealed'):setTimeout(p,50)};p()}).then(r=>location.reload&&r)"
```

(or a `watch-reveal.mjs` CDP script that polls `document.querySelector('.is-revealing')` every ~50ms then triggers the screenshot immediately).

## Progression (XP/league/season) checks

- `?as=X` maps to a **persistent** userId `dev:as-X-tab` — XP/season data in `server/data/xp.db` accumulates across runs for that name; use a fresh `?as=` name (or delete `server/data/xp.db`) for first-run states.
- `state.progress` is `null` before a player's first finished match — the lobby XP strip renders nothing until then (by design, not a bug). Season board (`state.seasonBoard`) shows regardless.
- Raw state sniff without UI (e.g. asserting `players[].progress` on broadcast): connect `socket.io-client` with `auth: { roomId, devName: 'x', devId: 'dev:as-x-tab', instanceId: 'dev-instance' }` and read the `state` event.

## Branch-switching gotchas

- `git checkout` while `npm run dev` is up: tsx watch can keep serving a **stale** server build — check `ss -tlnp | grep 3001` pid start time against the checkout; when in doubt restart `npm run dev` cleanly.
- `Emulation.setEmulatedMedia` (e.g. `prefers-reduced-motion`) is **per-CDP-session** — it drops when the ws closes; assert and verify within the same session.

## Short-lived element checks (reveal beats, flag, toast)

- `.qt-report-flag` only mounts while `beats.active` (~2-3s reveal). Do the wait→click→assert in ONE page eval (poll→click→sleep→read toast) — separate `ev.mjs` calls round-trip slower than the reveal window.
- `ev.mjs` needs an outer `setTimeout` LONGER than any inner promise poll (I use 90s), and must import `ws` via CJS default (`import wspkg from '.../ws/index.js'; const {WebSocket}=wspkg`) — Node's native WebSocket global lacks `.on()`.
- Reveal beats sequence: `beats.voters` (avatars in `.qt-answer__tally`) → `beats.gains` (`.qt-answer__pct` + dist bar). Poll for the specific element of the beat you want, not just `.qt-answer__tally`.
- Toast trigger for position checks: flag click → `report.sent` ("Question reported — thanks!"), `.qt-toast` ~4.5s lifetime.

## Question-pack API checks

- `GET/POST/PUT/DELETE /api/question-packs` takes `x-dev-id: <devId>` in mock mode (prod: Bearer session) — userId becomes `dev:<devId>`, so `x-dev-id: as-<name>-tab` matches a `?as=<name>` browser session.
- Full pack questions (incl. `correctIndex`) come ONLY from `GET /api/question-packs/:id` as owner — strangers get 403 "Bu paketi yalnızca oluşturan kişi düzenleyebilir."; list route returns metadata only. Legacy `createdBy:'dev'` packs are owner-editable by anyone in mock mode.
- PackEditor lives in MASA AYARLARI → SORU PAKETİ → details "Paket oluştur / düzenle" (`<details.qt-pack-upload>` — the old "Paket yükle" details sits below it). React inputs need native-setter+`input` event for programmatic fills.
- Rate limit: ~20 pack writes/60s per user — spaced curl checks fine, bursts of save/delete loops trip 429.

## CSP probe for viewer features

- The app's own CSP meta (`client/index.html`: `script-src 'self'`, tight `connect-src`) blocks third-party viewer needs — for anything shipping 3D/texture/WASM (model-viewer etc.), the fast first probes are `fetch('blob:')` in page and a console `CompileError`/texture-load check. `KHR_draco_mesh_compression` GLBs cannot work under this CSP at all — decode the asset (`npx @gltf-transform/cli optimize in.glb out.glb --compress false --texture-compress false`) instead of relaxing `script-src`.
