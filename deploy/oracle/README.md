# Oracle Always Free deploy

`cloud-init.yaml` + `Caddyfile` ilk kurulum içindir (rehber: kök README).

## Güncelleme (redeploy)

    ./deploy/oracle/redeploy.sh

Yerelde çalışır; SSH ile VM'de `git reset --hard origin/main` → docker build
→ konteyner restart → `/health` doğrulaması yapar. Gerekenler:

- `~/.ssh/quiztavern-oracle` anahtarı (ya da `QUIZTAVERN_KEY` ile geç)
- varsayılan host `quiztavern@193.123.36.134` (`QUIZTAVERN_HOST` ile değişir)
- `VITE_DISCORD_CLIENT_ID` build arg'i (varsayılan Triviara ID gömülü)
