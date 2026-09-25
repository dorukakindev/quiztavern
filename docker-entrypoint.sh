#!/bin/sh
# Konteyner root açılır: bind-mount/Fly volume sahibi HOST'tan gelir ve
# imajdaki build-time chown mount tarafından gölgelenir — root'a ait bir
# volume'da non-root kullanıcı EACCES ile çökerdi. Başlangıçta veri
# dizinini quiztavern'e ver, sonra runuser ile root olmayan kullanıcıya
# düş (exec → node PID 1 olur, SIGTERM nazik kapanışı çalıştırır).
set -eu
chown -R quiztavern:quiztavern /app/server/data
exec runuser -u quiztavern -- "$@"
