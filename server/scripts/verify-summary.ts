/**
 * 4d doğrulama: solo bir maç oynar (sunucu 1 bot ekler), her soruyu cevaplar,
 * podyumda matchSummary payload'ını basar. Sunucu istatistik biriktirmesini
 * tarayıcı zamanlamasına takılmadan uçtan uca sınar.
 * Kullanım: SERVER_URL=http://localhost:3002 npx tsx scripts/verify-summary.ts
 */
import { io } from "socket.io-client";
import { EV, type GameState, type PodiumEntry } from "../../shared/types";

const url = process.env.SERVER_URL || "http://localhost:3002";
const socket = io(url, {
  path: "/socket.io",
  transports: ["websocket"],
  auth: { roomId: "verify-4d", devId: "verify-sen", devName: "Sen" },
});

let started = false;
let lastAnswered = -1;

socket.on("connect", () => {
  socket.emit(EV.READY, true);
});

socket.on(EV.STATE, (state: GameState) => {
  if (state.phase === "lobby" && !started && state.hostId === state.youId) {
    started = true;
    setTimeout(() => socket.emit(EV.START, { mode: "classic" }), 300);
    return;
  }
  if (state.phase === "question" && state.round.index !== lastAnswered) {
    lastAnswered = state.round.index;
    // Bazı turlarda 0, bazılarında 2 seç: seri kırılsın, dağılım oluşsun.
    setTimeout(() => socket.emit(EV.ANSWER, state.round.index % 3 === 0 ? 0 : 2), 200);
    return;
  }
  if (state.phase === "podium") {
    const summary = state.matchSummary;
    console.log("=== matchSummary ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("podium:", state.podium!.map((p: PodiumEntry) => `${p.name}:${p.score}`).join(", "));
    const categoryTotal =
      summary?.perCategory?.reduce((total: number, item: { total: number }) => total + item.total, 0) ?? -1;
    const podiumSorted = state.podium.every(
      (player: PodiumEntry, index: number, all: PodiumEntry[]) => index === 0 || all[index - 1].score >= player.score,
    );
    const passed =
      !!summary &&
      Number.isInteger(summary.correct) &&
      summary.correct >= 0 &&
      summary.correct <= summary.total &&
      summary.total === state.round.total &&
      categoryTotal === summary.total &&
      Array.isArray(summary.review) &&
      summary.review.length === summary.total &&
      podiumSorted;
    console.log(passed ? "✓ Maç özeti ve podyum invariant'ları doğru." : "✗ Maç özeti veya podyum invariant'ı bozuk.");
    socket.disconnect();
    process.exit(passed ? 0 : 1);
  }
});

socket.on("connect_error", (e) => {
  console.error("reddedildi:", e.message);
  process.exit(1);
});
setTimeout(() => {
  console.error("zaman aşımı");
  process.exit(1);
}, 120000);
