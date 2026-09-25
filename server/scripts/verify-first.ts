/** "En hızlı parmak" doğrulaması: turun İLK kilitleyeni state.firstAnswerId olur;
 *  tur başında null; sonradan cevaplayan onu değiştirmez. */
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
function waitFor(c: Client, pred: (s: GameState) => boolean, label: string, timeoutMs = 15000): Promise<GameState> {
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
  const a = connect("first-test", "player-aaaa-0001", "Ayşe");
  const b = connect("first-test", "player-bbbb-0002", "Baran");
  try {
    await waitFor(a, (s) => s.players.length === 2, "iki oyuncu");
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "ikisi hazır");
    const host = a.state!.hostId === a.state!.youId ? a : b;
    host.socket.emit(EV.START, { mode: "classic" });

    const q1 = await waitFor(a, (s) => s.phase === "question", "1. soru");
    log(q1.firstAnswerId === null, `tur başında firstAnswerId null (geldi: ${q1.firstAnswerId})`);

    // A önce cevaplar
    a.socket.emit(EV.ANSWER, 0);
    const afterA = await waitFor(a, (s) => s.firstAnswerId !== null, "A cevapladı");
    log(afterA.firstAnswerId === a.state!.youId, `ilk kilitleyen A (firstAnswerId=A.youId)`);

    // B sonra cevaplar — first değişmemeli
    b.socket.emit(EV.ANSWER, 1);
    await new Promise((r) => setTimeout(r, 400));
    log(a.state!.firstAnswerId === a.state!.youId, "B sonra cevaplayınca first hâlâ A");

    // Sonraki tura geç: reveal sonrası yeni soruda firstAnswerId sıfırlanmalı
    const q2 = await waitFor(a, (s) => s.phase === "question" && s.round.index === 1, "2. soru", 20000);
    log(q2.firstAnswerId === null, `yeni turda firstAnswerId tekrar null (geldi: ${q2.firstAnswerId})`);
  } finally {
    a.socket.disconnect();
    b.socket.disconnect();
  }
  console.log(ok ? "✓ En hızlı parmak doğru çalışıyor" : "✗ SORUN VAR");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
