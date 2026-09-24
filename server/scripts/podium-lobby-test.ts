/**
 * Podyum → lobi dönüş regresyonu (B1).
 * "Lobiye dön" odadan atmamalı: host değişmez, kimse kimseyi beklemez;
 * sonuç ekranında kalan oyuncu (inResults) dondurulmuş sonucu görmeye
 * devam eder, kendi sonucunu kaybetmez.
 * Çalıştırma: npx tsx scripts/podium-lobby-test.ts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, type GameState, type ToastPayload } from "../../shared/types";
import { findFreePort } from "./test-port";

let baseUrl = "";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

interface Client {
  socket: Socket;
  state: GameState | null;
  toasts: ToastPayload[];
}

function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = { socket: io(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { roomId, devId, devName },
  }), state: null, toasts: [] };
  client.socket.on(EV.STATE, (s: GameState) => { client.state = s; });
  client.socket.on(EV.TOAST, (t: ToastPayload) => client.toasts.push(t));
  return client;
}

function waitFor(client: Client, predicate: (s: GameState) => boolean, label: string, timeoutMs = 15_000): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (client.state && predicate(client.state)) return resolve(client.state);
    const timer = setTimeout(() => {
      client.socket.off(EV.STATE, handler);
      reject(new Error(`Zaman aşımı: ${label} (son faz: ${client.state?.phase})`));
    }, timeoutMs);
    const handler = (s: GameState) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      client.socket.off(EV.STATE, handler);
      resolve(s);
    };
    client.socket.on(EV.STATE, handler);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  console.log("[podium-lobby] sunucu başlatılıyor…");
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ALLOW_MOCK_AUTH: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const killServer = () => {
    if (server.pid === undefined) return;
    server.kill();
  };

  try {
    for (let i = 0; i < 80; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch { /* henüz hazır değil */ }
      await sleep(250);
      if (i === 79) throw new Error("Sunucu 20 sn içinde açılmadı.");
    }
    console.log("[podium-lobby] sunucu hazır.\n");

    // ── Kurulum: 2 insan, 5 soruluk fitil maçı ─────────────────────────
    const a = connect("podium-lobby", "player-aaaa-0001", "Ayşe");
    const b = connect("podium-lobby", "player-bbbb-0002", "Baran");
    await waitFor(a, (s) => s.players.length === 2, "iki oyuncu lobide");
    const hostId = a.state!.hostId;
    const host = hostId === a.state!.youId ? a : b;
    host.socket.emit(EV.SET_MODE, { mode: "lightning" });
    await waitFor(a, (s) => s.gameMode === "lightning", "mod fitil");
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "herkes hazır");
    host.socket.emit(EV.START, {});
    await waitFor(a, (s) => s.phase === "question", "ilk soru", 25_000);
    for (let round = 0; round < 5; round++) {
      await waitFor(a, (s) => s.phase === "question" && s.round.index === round, `soru ${round + 1}`, 20_000);
      a.socket.emit(EV.ANSWER, 0);
      b.socket.emit(EV.ANSWER, 1);
      await waitFor(a, (s) => s.phase === "reveal" && s.round.index === round, `reveal ${round + 1}`, 12_000);
    }
    await waitFor(a, (s) => s.phase === "podium", "podyum", 15_000);
    assert(a.state!.podium !== null && a.state!.podium.length === 2, "kurulum: podyumda iki oyuncu");

    // ── A "Lobiye dön" — B sonuçlarda kalıyor ─────────────────────────
    console.log("Senaryo — A lobiye döner, B sonuçlarda kalır");
    a.socket.emit(EV.RETURN_TO_LOBBY);
    await waitFor(a, (s) => s.phase === "lobby" && s.lastMatch === null, "A lobiye döndü");
    assert(a.state!.hostId === hostId, "host değişmedi");
    assert(a.state!.players.length === 2, "kimse atılmadı (2 oyuncu)");
    assert(!a.state!.players.find((p) => p.id === a.state!.youId)!.ready, "dönen oyuncunun ready'si sıfır");

    await waitFor(b, (s) => s.phase === "lobby" && s.lastMatch !== null, "B'nin paketinde donmuş sonuç");
    const bLast = b.state!.lastMatch!;
    assert(bLast.podium.length === 2, "B'nin sonucunda podyum dolu");
    assert(bLast.matchSummary !== null, "B'nin maç özeti korunmuş (frozenSummaries)");
    assert(b.state!.players.find((p) => p.id === b.state!.youId)!.inResults === true, "B sonuçlarda rozeti taşıyor");

    // ── B de dönünce inResults boşalır ─────────────────────────────────
    b.socket.emit(EV.RETURN_TO_LOBBY);
    await waitFor(b, (s) => s.phase === "lobby" && s.lastMatch === null, "B de lobiye döndü");
    assert(b.state!.players.every((p) => p.inResults !== true), "sonuçlarda kalan yok");

    // ── Lobiden yeni maç başlatılabilir (B1'in amacı) ─────────────────
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "yeniden herkes hazır");
    host.socket.emit(EV.START, {});
    await waitFor(a, (s) => s.phase === "countdown" || s.phase === "question", "lobiden yeni maç başladı", 15_000);
    assert(true, "podyum→lobi sonrası host yeni maçı başlatabildi");
    assert(bLast.id > 0, "dondurulmuş sonucun maç kimliği dolu");

    a.socket.emit(EV.LEAVE_GAME);
    b.socket.emit(EV.LEAVE_GAME);
    await sleep(300);
    a.socket.disconnect();
    b.socket.disconnect();
  } finally {
    killServer();
  }

  console.log(`\n[podium-lobby] sonuç: ${passed} geçti, ${failed} kaldı`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n[podium-lobby] HATA: ${err.message}`);
  process.exit(1);
});
