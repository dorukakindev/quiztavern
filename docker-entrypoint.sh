#!/bin/sh
# Konteyner root açılır: bind-mount/Fly volume sahibi HOST'tan gelir ve
# imajdaki build-time chown mount tarafından gölgelenir — root'a ait bir
# volume'da non-root kullanıcı EACCES ile çökerdi. Başlangıçta veri
# dizinini quiztavern'e ver, sonra setpriv ile root olmayan kullanıcıya
# düş. setpriv hedefi exec'lediği için node PID 1 olur ve SIGTERM'i
# doğrudan alır (runuser arada kalıp çocuğu 2 sn'de öldürürdü — 10 sn'lik
# nazik kapanış penceresi korunur).
set -eu
chown -R quiztavern:quiztavern /app/server/data
exec setpriv --reuid quiztavern --regid quiztavern --init-groups "$@"
