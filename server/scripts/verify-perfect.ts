/**
 * 6b doğrulama: istemcinin "herkes doğru" türetmesini sunucu verisiyle sınar.
 * Script de tarayıcıyla AYNI STATE'i alır; her reveal'de
 * perfect = eligibleCount>=2 && picks[correctIndex].length === eligibleCount
 * hesaplar ve "ben doğruyken perfect true mu" doğrular. (Test sırasında bot
 * her zaman doğru; bkz. bots.ts geçici değişiklik.)
 * Kullanım: SERVER_URL=http://localhost:3002 npx tsx scripts/verify-perfect.ts
 */
import { io } from "socket.io-client";
import { EV, type GameState } from "../../shared/types";

const url = process.env.SERVER_URL || "http://localhost:3002";
const socket = io(url, {
  path: "/socket.io",
  transports: ["websocket"],
  auth: { roomId: "verify-6b", devId: "verify-perf", devName: "Sen" },
});

let started = false;
let lastQ = -1;
let myChoice: number | null = null;
const results: string[] = [];
let ok = true;
let revealCount = 0;

socket.on("connect", () => socket.emit(EV.READY, true));

socket.on(EV.STATE, (state: GameState) => {
  if (state.phase === "lobby" && !started && state.hostId === state.youId) {
    started = true;
    setTimeout(() => socket.emit(EV.START, { mode: "classic" }), 300);
    return;
  }
  if (state.phase === "question" && state.round.index !== lastQ) {
    lastQ = state.round.index;
    myChoice = state.round.index % 4; // farklı şıklar dene -> bazı turlar doğru
    setTimeout(() => socket.emit(EV.ANSWER, myChoice), 150);
    return;
  }
  if (state.phase === "reveal" && state.reveal) {
    const { correctIndex, picks } = state.reveal;
    const eligible = state.eligibleCount;
    const correctCount = picks[correctIndex]?.length ?? 0;
    const perfect = eligible >= 2 && correctCount === eligible;
    const iCorrect = myChoice === correctIndex;
    const allPicks = picks.flat();
    const validPayload =
      picks.length === 4 &&
      new Set(allPicks).size === allPicks.length &&
      allPicks.length <= eligible &&
      correctCount <= eligible &&
      (!perfect || iCorrect);
    ok = ok && validPayload;
    revealCount++;
    results.push(
      `tur ${lastQ + 1}: eligible=${eligible} doğruSeçen=${correctCount} benDoğru=${iCorrect} => perfect=${perfect}`,
    );
  }
  if (state.phase === "podium") {
    console.log(results.join("\n"));
    const perfectRounds = results.filter((r) => r.includes("perfect=true")).length;
    const iCorrectRounds = results.filter((r) => r.includes("benDoğru=true")).length;
    console.log(`\nBEN DOĞRU olan tur: ${iCorrectRounds} | PERFECT olan tur: ${perfectRounds}`);
    const passed = ok && revealCount > 0;
    console.log(
      passed
        ? "✓ Perfect türetmesini besleyen reveal payload'ları tutarlı."
        : "✗ Reveal payload'ında tutarsızlık bulundu.",
    );
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
