/** İzleyici modu: koltuk bırak (SPECTATE) / koltuğa otur (TAKE_SEAT) geçişleri,
 *  host devri ve state alanları (youAreSpectator, spectatorCount). */
import { io, type Socket } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const BASE = process.env.SERVER_URL ?? "http://localhost:3002";
type Client = { socket: Socket; state: GameState | null };

function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = { socket: io(BASE, { path: "/socket.io", transports: ["websocket"], forceNew: true, auth: { roomId, devId, devName } }), state: null };
  client.socket.on(EV.STATE, (s: GameState) => { client.state = s; });
  return client;
}
function waitFor(c: Client, pred: (s: GameState) => boolean, label: string, timeoutMs = 12000): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (c.state && pred(c.state)) return resolve(c.state);
    const timer = setTimeout(() => { c.socket.off(EV.STATE, h); reject(new Error(`zaman aşımı: ${label}`)); }, timeoutMs);
    const h = (s: GameState) => { if (pred(s)) { clearTimeout(timer); c.socket.off(EV.STATE, h); resolve(s); } };
    c.socket.on(EV.STATE, h);
  });
}

async function main() {
  let ok = true;
  const log = (pass: boolean, m: string) => { console.log(`${pass ? "✓" : "✗"} ${m}`); ok = ok && pass; };
  const a = connect("spec-test", "player-aaaa-0001", "Ayşe");
  const b = connect("spec-test", "player-bbbb-0002", "Baran");
  await waitFor(a, (s) => s.players.length === 2, "iki oyuncu");
  log(a.state!.youAreSpectator === false && a.state!.spectatorCount === 0, "başta ikisi oyuncu, 0 izleyici");

  // A koltuğu bırakır -> izleyici
  a.socket.emit(EV.SPECTATE);
  await waitFor(a, (s) => s.youAreSpectator, "A izleyici oldu");
  const s1 = a.state!;
  log(s1.youAreSpectator === true, "A.youAreSpectator = true");
  log(s1.players.length === 1, `koltukta 1 oyuncu kaldı (geldi: ${s1.players.length})`);
  log(s1.spectatorCount === 1, `spectatorCount = 1 (geldi: ${s1.spectatorCount})`);
  log(s1.players.some((p) => p.id === b.state!.youId), "kalan oyuncu B");
  // B tarafında da tutarlı
  await waitFor(b, (s) => s.players.length === 1 && s.spectatorCount === 1, "B senkron");
  log(b.state!.hostId === b.state!.youId, "host A'dan B'ye geçti");

  // A tekrar koltuğa oturur -> oyuncu
  a.socket.emit(EV.TAKE_SEAT);
  await waitFor(a, (s) => !s.youAreSpectator, "A tekrar oyuncu");
  const s2 = a.state!;
  log(s2.youAreSpectator === false, "A.youAreSpectator = false");
  log(s2.players.length === 2, `koltukta 2 oyuncu (geldi: ${s2.players.length})`);
  log(s2.spectatorCount === 0, `spectatorCount = 0 (geldi: ${s2.spectatorCount})`);

  a.socket.disconnect(); b.socket.disconnect();

  // Asıl senaryo: masa dolu (8) -> 9. kişi reddedilmez, izleyici olur.
  const full: Client[] = [];
  for (let i = 0; i < 8; i++) full.push(connect("spec-full", `player-full-${i}`, `Oyuncu${i}`));
  await waitFor(full[0], (s) => s.players.length === 8, "8 oyuncu masada");
  const ninth = connect("spec-full", "player-full-9th", "Dokuzuncu");
  await waitFor(ninth, (s) => s.youAreSpectator || s.players.length > 0, "9. bağlandı");
  log(ninth.state!.youAreSpectator === true, "masa doluyken 9. kişi otomatik İZLEYİCİ");
  log(ninth.state!.players.length === 8, `koltukta hâlâ 8 oyuncu (geldi: ${ninth.state!.players.length})`);
  log(ninth.state!.spectatorCount === 1, `spectatorCount = 1 (geldi: ${ninth.state!.spectatorCount})`);
  [...full, ninth].forEach((c) => c.socket.disconnect());

  console.log(ok ? "✓ İzleyici modu geçişleri doğru" : "✗ SORUN VAR");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
