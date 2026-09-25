#!/usr/bin/env bash
# Triviara — Oracle Always Free VM tek-komut redeploy.
# Kullanım: ./deploy/oracle-redeploy.sh   (yerelde çalışır, SSH ile VM'i günceller)
# Gereksinim: ~/.ssh/quiztavern-oracle anahtarı + quiztavern@VM sudo/docker yetkisi.
set -euo pipefail

HOST="${QUIZTAVERN_HOST:-quiztavern@193.123.36.134}"
KEY="${QUIZTAVERN_KEY:-$HOME/.ssh/quiztavern-oracle}"
CLIENT_ID="${VITE_DISCORD_CLIENT_ID:-1552535678385004577}"

ssh -i "$KEY" -o StrictHostKeyChecking=no "$HOST" bash -s <<REMOTE
set -euo pipefail
cd /opt/quiztavern/app
git fetch origin main
git reset --hard origin/main
sudo docker build --build-arg VITE_DISCORD_CLIENT_ID=$CLIENT_ID -t quiztavern .
sudo docker stop quiztavern || true
sudo docker rm quiztavern || true
sudo docker run -d --name quiztavern \
  --env-file /opt/quiztavern/env \
  -v /opt/quiztavern/data:/app/server/data \
  -p 127.0.0.1:8080:8080 \
  --restart always \
  quiztavern
sleep 3
sudo docker logs quiztavern --tail 5
REMOTE

echo "== /health =="
curl -fsS https://193.123.36.134.sslip.io/health && echo
