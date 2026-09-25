/**
 * Podyum sıralaması doğrulaması. Kendi sunucusunu başlatır (PORT=3499,
 * ALLOW_MOCK_AUTH), tek insan + 1 bot ile tam maç oynar, HER reveal'de skorları
 * kaydeder ve podyumdaki DİZİ SIRASININ score'a göre azalan olduğunu kanıtlar.
 * Çalıştırma: npx tsx scripts/verify-podium-order.ts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const PORT = 3499;
const BASE = `http://localhost:${PORT}`;
let ok = true;
const log = (pass: boolean, m: string) => { console.log(`${pass ? "✓" : "✗"} ${m}`); ok = ok && pass; };

type Client = { socket: Socket; state: GameState | null; history: GameState[] };
function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = { socket: io(BASE, { path: "/socket.io", transports: ["websocket"], forceNew: true, auth: { roomId, devId, devName } }), state: null, history: [] };
  client.socket.on(EV.STATE, (s: GameState) => { client.state = s; client.history.push(s); });
  return client;
}
function waitFor(c: Client, pred: (s: GameState) => boolean, label: string, timeoutMs = 15000): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (c.state && pred(c.state)) return resolve(c.state);
    const timer = setTimeout(() => { c.socket.off(EV.STATE, h); reject(new Error(`zaman aşımı: ${label} (faz: ${c.state?.phase})`)); }, timeoutMs);
    const h = (s: GameState) => { if (pred(s)) { clearTimeout(timer); c.socket.off(EV.STATE, h); resolve(s); } };
    c.socket.on(EV.STATE, h);
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(PORT), ALLOW_MOCK_AUTH: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  const killServer = () => {
    if (server.pid === undefined) return;
    server.kill();
  };

  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* hazır değil */ }
      await sleep(250);
      if (i === 79) throw new Error("Sunucu 20 sn içinde açılmadı.");
    }

    const HUMAN = "dev:player-human";
    const a = connect("podium-order-test", "player-human", "Sen");
    await waitFor(a, (s) => s.players.length === 1, "insan katıldı");
    a.socket.emit(EV.SET_QUESTION_COUNT, { count: 5 }); // testi kısa tut
    await waitFor(a, (s) => s.questionCount === 5, "soru sayısı 5");
    a.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "hazır");
    // Bot yalnız START anında (room.players.size===1 iken) otomatik eklenir.
    a.socket.emit(EV.START, { mode: "classic" });
    await waitFor(a, (s) => s.phase === "question" && s.players.length === 2, "soru fazı (insan+bot)");

    // Her soruda hemen cevapla (index 0) — hızlıca skor biriktir.
    a.socket.on(EV.STATE, (s: GameState) => {
      if (s.phase === "question" && s.yourChoice === null) a.socket.emit(EV.ANSWER, 0);
    });

    const podium = await waitFor(a, (s) => s.phase === "podium", "podyum", 90000);

    const finalScores = (podium.podium ?? []).map((p) => ({ name: p.name, id: p.id, score: p.score }));
    console.log("Final podyum dizisi:", JSON.stringify(finalScores));
    const sortedDesc = [...finalScores].every((p, i) => i === 0 || finalScores[i - 1].score >= p.score);
    log(sortedDesc, `podyum dizisi score'a göre azalan (${finalScores.map((p) => `${p.name}:${p.score}`).join(", ")})`);

    const humanEntry = finalScores.find((p) => p.id === HUMAN);
    const botEntry = finalScores.find((p) => p.id !== HUMAN);
    log(!!humanEntry && !!botEntry, "insan ve bot podyumda bulundu");
    if (humanEntry && botEntry) {
      const humanIndex = finalScores.findIndex((p) => p.id === HUMAN);
      const botIndex = finalScores.findIndex((p) => p.id !== HUMAN);
      const higherScoreIsFirst = humanEntry.score === botEntry.score
        || (humanEntry.score > botEntry.score) === (humanIndex < botIndex);
      log(higherScoreIsFirst, `yüksek skorlu önce (insan=${humanEntry.score}, bot=${botEntry.score})`);
    }

    a.socket.disconnect();
  } finally {
    killServer();
  }
  console.log(ok ? "\n✓ Podyum sıralaması doğru" : "\n✗ SORUN VAR — podyum sıralaması bozuk");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
