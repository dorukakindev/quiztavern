/**
 * Çifte Bahis doğrulaması. Kendi sunucusunu başlatır (PORT=3103, ALLOW_MOCK_AUTH),
 * iki istemciyle bir maç sürer ve şunları kanıtlar:
 *  - Bahis fazında yalnız kategori + bankroll sızar (soru metni/şıkları GELMEZ).
 *  - Herkes 1000 bankroll ile başlar.
 *  - Bağlı herkes yatırınca süre dolmadan soruya geçilir (erken-advance).
 *  - Reveal'de kazanç ±bahis: |gain| === yatırılan, yeni skor = eski + gain.
 *  - Maç podyuma ulaşır (tam döngü stabil).
 * Çalıştırma: npx tsx scripts/verify-bet.ts
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const PORT = 3103;
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

async function main() {
  const server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
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

    // Mock auth oyuncu id'lerini "dev:" ile önekler.
    const ADA = "dev:player-ada-0001", BORA = "dev:player-bora-002";
    const ada = connect("bet-test", "player-ada-0001", "Ada");
    const bora = connect("bet-test", "player-bora-002", "Bora");
    await waitFor(ada, (s) => s.players.length === 2, "iki oyuncu");
    const host = ada.state!.hostId === ADA ? ada : bora;
    // Masa ayarı değişimi "hazır"ı sıfırlar; sayıyı ÖNCE ayarla, sonra onayla.
    host.socket.emit(EV.SET_QUESTION_COUNT, { count: 5 }); // testi kısa tut
    await waitFor(ada, (s) => s.questionCount === 5, "soru sayısı 5");
    ada.socket.emit(EV.READY, true); bora.socket.emit(EV.READY, true);
    await waitFor(ada, (s) => s.players.every((p) => p.ready), "ikisi hazır");
    host.socket.emit(EV.START, { mode: "bet" });

    // ── Bahis fazı: sızıntı + bankroll ──
    const betState = await waitFor(ada, (s) => s.phase === "bet", "bahis fazı");
    log(betState.bet !== null && betState.bet.category.length > 0, `bahis fazında kategori görünür (${betState.bet?.category})`);
    log(betState.question === null, "bahis fazında soru metni/şıkları SIZMIYOR");
    log(betState.bet?.bankroll === 1000, `bankroll 1000 (${betState.bet?.bankroll})`);
    const adaScore0 = betState.players.find((p) => p.id === ADA)!.score;
    log(adaScore0 === 1000, `Ada 1000 ile başladı (${adaScore0})`);

    // Round 0 bahisleri: Ada 400, Bora all-in 1000.
    const ADA_BET = 400, BORA_BET = 1000;
    const tBet = Date.now();
    ada.socket.emit(EV.BET, ADA_BET);
    bora.socket.emit(EV.BET, BORA_BET);

    // ── Erken-advance: ikisi de yatırınca deadline'dan (9sn) çok önce soruya ──
    await waitFor(ada, (s) => s.phase === "question", "soru fazı", 8000);
    const advanceMs = Date.now() - tBet;
    log(advanceMs < 8000, `herkes yatırınca erken soruya geçildi (${advanceMs}ms, deadline 9000)`);
    log(ada.state!.question?.choices.length === 4, "soru 4 şıkla geldi");
    log(ada.state!.yourBet === ADA_BET, `yourBet korundu (${ada.state!.yourBet})`);

    // Round 0 cevapları: ikisi de 0. correctIndex istemcide yok; invariant'ı test ederiz.
    ada.socket.emit(EV.ANSWER, 0);
    bora.socket.emit(EV.ANSWER, 0);

    // ── İlk reveal: kazanç ±bahis, skor = 1000 + gain ──
    const rev = await waitFor(ada, (s) => s.phase === "reveal" && s.reveal !== null, "ilk reveal");
    const adaGain = rev.reveal!.gains[ADA];
    const boraGain = rev.reveal!.gains[BORA];
    const adaScore = rev.players.find((p) => p.id === ADA)!.score;
    const boraScore = rev.players.find((p) => p.id === BORA)!.score;
    log(Math.abs(adaGain) === ADA_BET, `Ada kazancı ±bahis (gain ${adaGain}, bahis ${ADA_BET})`);
    log(Math.abs(boraGain) === BORA_BET, `Bora kazancı ±bahis (gain ${boraGain}, bahis ${BORA_BET})`);
    log(adaScore === 1000 + adaGain, `Ada skoru = 1000 + gain (${adaScore})`);
    log(boraScore === 1000 + boraGain, `Bora skoru = 1000 + gain (${boraScore})`);
    log(boraScore === 0 || boraScore === 2000, `all-in Bora ya 0 ya 2000 (${boraScore})`);

    // ── Kalan turları otomatik oyna, podyuma ulaş ──
    const auto = (c: Client) => c.socket.on(EV.STATE, (s: GameState) => {
      if (s.phase === "bet" && s.yourBet === null) {
        c.socket.emit(EV.BET, Math.floor((s.bet?.bankroll ?? 0) * 0.25));
      }
      if (s.phase === "question" && s.yourChoice === null) c.socket.emit(EV.ANSWER, 0);
    });
    auto(ada); auto(bora);
    const podium = await waitFor(ada, (s) => s.phase === "podium", "podyum", 40000);
    log(podium.podium !== null && podium.podium.length === 2, "maç podyuma ulaştı (tam döngü)");

    ada.socket.disconnect(); bora.socket.disconnect();
  } finally {
    killServer();
  }
  console.log(ok ? "\n✓ Çifte Bahis: sızıntı yok, erken-advance, ±bahis puanlama, tam döngü" : "\n✗ SORUN VAR");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
