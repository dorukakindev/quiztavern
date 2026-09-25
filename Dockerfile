# syntax=docker/dockerfile:1

# ── Build aşaması ────────────────────────────────────────────────────────
# Monorepo tek imajda derlenir: sunucu dist'i `../client/dist` bekler
# (server/src/index.ts içindeki production statik servis yolu).
FROM node:22-slim AS build
WORKDIR /app

# better-sqlite3: prebuilt binary iner; inmezse kaynaktan derlemek için
# derleme zinciri kurulu olmalı.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Önce manifestler: kod değişse bile bağımlılık katmanı cache'te kalır.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY shared shared
COPY server server
COPY client client
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN npm run build

# Runtime'a yalnızca prod bağımlılıklar gider (vite/tsx/dev tipleri atılır).
RUN npm prune --omit=dev \
 && mkdir -p /prod-deps \
 && for d in node_modules server/node_modules client/node_modules; do \
      if [ -d "/app/$d" ]; then mkdir -p "/prod-deps/$d"; cp -a "/app/$d/." "/prod-deps/$d/"; fi; \
    done

# ── Runtime aşaması ──────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app

COPY --from=build /prod-deps/ /app/
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# SQLite veri dizini (xp.db, daily.db, question-reports.db) — Fly volume
# /app/server/data'ya bağlanır. Süreç root olmayan kullanıcıyla çalışır ama
# ayrıcalık düşürme ENTRYPOINT'te yapılır: mount sahibi host'tan geldiği için
# build-time chown mount tarafından gölgelenir; root'a ait bir volume'da
# non-root kullanıcı EACCES ile çökerdi (entrypoint her açılışta chown'lar).
RUN useradd --system --uid 1001 quiztavern \
 && mkdir -p /app/server/data \
 && chown -R quiztavern:quiztavern /app/server/data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

WORKDIR /app/server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/src/index.js"]
