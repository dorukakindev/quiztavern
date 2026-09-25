/** Regresyon: bir oyuncu kopunca, bağlı ve cevaplamış oyuncular tur deadline'ını
 *  BEKLEMEDEN reveal görmeli. Bekleme listesi bağlantısı kopanı içermemeli. */
import { io, type Socket } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const BASE = process.env.SERVER_URL ?? "http://localhost:3002";
type Client = { socket: Socket; state: GameState | null };
function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = {
    socket: io(BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      forceNew: true,
      auth: { roomId, devId, devName },
    }),
    state: null,
  };
  client.socket.on(EV.STATE, (s: GameState) => {
    client.state = s;
  });
  return client;
}
function waitFor(c: Client, pred: (s: GameState) => boolean, label: string, timeoutMs = 12000): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (c.state && pred(c.state)) return resolve(c.state);
    const timer = setTimeout(() => {
      c.socket.off(EV.STATE, h);
      reject(new Error(`zaman aşımı: ${label}`));
    }, timeoutMs);
    const h = (s: GameState) => {
      if (pred(s)) {
        clearTimeout(timer);
        c.socket.off(EV.STATE, h);
        resolve(s);
      }
    };
    c.socket.on(EV.STATE, h);
  });
}

async function main() {
  let ok = true;
  const log = (pass: boolean, m: string) => {
    console.log(`${pass ? "✓" : "✗"} ${m}`);
    ok = ok && pass;
  };
  const a = connect("dr-test", "player-a-001", "Ayşe");
  const b = connect("dr-test", "player-b-002", "Baran");
  await waitFor(a, (s) => s.players.length === 2, "iki oyuncu");
  a.socket.emit(EV.READY, true);
  b.socket.emit(EV.READY, true);
  await waitFor(a, (s) => s.players.every((p) => p.ready), "ikisi hazır");
  const host = a.state!.hostId === a.state!.youId ? a : b;
  host.socket.emit(EV.START, { mode: "classic" });
  await waitFor(a, (s) => s.phase === "question", "soru fazı");

  // A cevaplar, B (cevapsız) kopar.
  a.socket.emit(EV.ANSWER, 0);
  await waitFor(a, (s) => s.yourChoice !== null, "A cevapladı");
  const t0 = Date.now();
  b.socket.disconnect();
  // Fix çalışıyorsa: B bekleme dışı, A tek bağlı+cevaplamış -> hemen reveal.
  // Fix yoksa: tur deadline'a (~10-15sn) kadar bekler -> 6sn timeout patlar.
  try {
    await waitFor(a, (s) => s.phase === "reveal", "erken reveal", 6000);
    const elapsed = Date.now() - t0;
    log(elapsed < 6000, `B kopunca erken reveal (${elapsed}ms; deadline'dan çok kısa)`);
  } catch {
    log(false, "B kopunca reveal deadline'a kadar bekledi (fix çalışmıyor)");
  }

  a.socket.disconnect();
  console.log(ok ? "✓ Kopan oyuncu erken reveal'i engellemiyor" : "✗ SORUN VAR");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
