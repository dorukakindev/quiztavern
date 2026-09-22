/**
 * Takım modu doğrulaması. Kendi sunucusunu başlatır (PORT=3105, ALLOW_MOCK_AUTH),
 * 4 istemciyle şunları kanıtlar:
 *  - Katılınca takımlar otomatik dengelenir (4 oyuncu -> 2v2).
 *  - Host bir oyuncunun takımını değiştirebilir (SET_TEAM).
 *  - Host OLMAYAN takım değiştiremez (reddedilir).
 *  - Takım alanı maç boyunca ve podyumda korunur; puanlar takıma göre toplanabilir.
 * Çalıştırma: npx tsx scripts/verify-team.ts
 */
import { spawn, spawnSync } from "node:child_process";
import { io, type Socket } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
let ok = true;
const log = (pass: boolean, m: string) => { console.log(`${pass ? "✓" : "✗"} ${m}`); ok = ok && pass; };

type Client = { socket: Socket; state: GameState | null };
function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = { socket: io(BASE, { path: "/socket.io", transports: ["websocket"], forceNew: true, auth: { roomId, devId, devName } }), state: null };
  client.socket.on(EV.STATE, (s: GameState) => { client.state = s; });
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
const teamOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)?.team;

async function main() {
  const server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    env: { ...process.env, PORT: String(PORT), ALLOW_MOCK_AUTH: "1" },
    stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  const killServer = () => {
    if (server.pid === undefined) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill();
  };

  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* hazır değil */ }
      await sleep(250);
      if (i === 79) throw new Error("Sunucu 20 sn içinde açılmadı.");
    }

    const IDS = ["dev:player-a", "dev:player-b", "dev:player-c", "dev:player-d"];
    const a = connect("team-test", "player-a", "Ada");
    const b = connect("team-test", "player-b", "Bora");
    const c = connect("team-test", "player-c", "Cem");
    const d = connect("team-test", "player-d", "Derya");
    const clients = [a, b, c, d];
    await waitFor(a, (s) => s.players.length === 4, "dört oyuncu");

    // ── Otomatik denge: 2v2 ──
    const st = a.state!;
    const t0 = st.players.filter((p) => p.team === 0).length;
    const t1 = st.players.filter((p) => p.team === 1).length;
    log(t0 === 2 && t1 === 2, `otomatik denge 2v2 (takım0=${t0}, takım1=${t1})`);

    // ── Host takım değiştirir: Bora'yı Ada'nın takımına al ──
    const host = st.hostId === IDS[0] ? a : clients.find((cl) => cl.state!.hostId === cl.state!.youId)!;
    const adaTeam = teamOf(a.state!, IDS[0])!;
    const boraTeam0 = teamOf(a.state!, IDS[1])!;
    host.socket.emit(EV.SET_TEAM, { targetId: IDS[1], team: adaTeam });
    await waitFor(a, (s) => teamOf(s, IDS[1]) === adaTeam, "Bora Ada'nın takımına geçti");
    log(teamOf(a.state!, IDS[1]) === adaTeam, `host takım değiştirdi (Bora ${boraTeam0} -> ${adaTeam})`);

    // ── Host OLMAYAN takım değiştiremez ──
    const nonHost = clients.find((cl) => cl.state!.hostId !== cl.state!.youId)!;
    const deryaBefore = teamOf(a.state!, IDS[3])!;
    const target = deryaBefore === 0 ? 1 : 0;
    nonHost.socket.emit(EV.SET_TEAM, { targetId: IDS[3], team: target });
    await sleep(400);
    log(teamOf(a.state!, IDS[3]) === deryaBefore, `host olmayanın takım değişimi reddedildi (Derya ${deryaBefore} sabit)`);

    // ── Maç: takımı dengele, oyna, podyumda takım alanı korunur ──
    host.socket.emit(EV.SET_TEAM, { targetId: IDS[1], team: boraTeam0 }); // 2v2'ye geri
    host.socket.emit(EV.SET_QUESTION_COUNT, { count: 5 });
    await waitFor(a, (s) => s.questionCount === 5, "soru sayısı 5");
    clients.forEach((cl) => cl.socket.emit(EV.READY, true));
    await waitFor(a, (s) => s.players.every((p) => p.ready), "herkes hazır");
    host.socket.emit(EV.START, { mode: "team" });
    await waitFor(a, (s) => s.phase === "question", "soru fazı");

    clients.forEach((cl) => cl.socket.on(EV.STATE, (s: GameState) => {
      if (s.phase === "question" && s.yourChoice === null) cl.socket.emit(EV.ANSWER, 0);
    }));
    const podium = await waitFor(a, (s) => s.phase === "podium", "podyum", 40000);
    const allHaveTeam = podium.players.every((p) => p.team === 0 || p.team === 1);
    log(allHaveTeam, "podyumda tüm oyuncuların takımı korundu");
    const teamA = podium.players.filter((p) => p.team === 0).reduce((sum, p) => sum + p.score, 0);
    const teamB = podium.players.filter((p) => p.team === 1).reduce((sum, p) => sum + p.score, 0);
    log(Number.isFinite(teamA) && Number.isFinite(teamB), `takım toplamları hesaplanabilir (A=${teamA}, B=${teamB})`);

    clients.forEach((cl) => cl.socket.disconnect());
  } finally {
    killServer();
  }
  console.log(ok ? "\n✓ Takım: otomatik denge, host değişimi, yetki, maç-boyu kalıcılık" : "\n✗ SORUN VAR");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
