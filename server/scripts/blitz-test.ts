// D/Y Blitz regresyonları (§6.1): iddia üretimi, 0/1 cevap, düz puan,
// reveal sütunları, 8 sn pencere, çift cevap reddi, istatistik.
import assert from "node:assert";
import { GAME } from "../src/config.js";
import { Room } from "../src/rooms.js";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const user = (id: string) => ({ id, name: `P${id}`, avatarUrl: null, socketId: `s-${id}` });
const internals = (room: Room) => room as unknown as {
  players: Map<string, { score: number; stats: { total: number; correct: number } }>;
  qIndex: number;
  questionStartedAt: number;
  questionDeadline: number;
  currentBlitz: { truth: boolean; claim: string; claimEn?: string } | null;
  lastReveal: { correctIndex: number; picks: string[][]; gains: Record<string, number> } | null;
  beginQuestion(): void;
  reveal(): void;
};

const blitzRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  for (const pid of ids) room.addPlayer({ ...user(pid), isBot: false });
  room.setGameMode(ids[0], "blitz");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
const startRound = (room: Room) => {
  const inner = internals(room);
  room.start(ids0(idsOf(room)), "blitz");
  inner.qIndex = 0;
  inner.beginQuestion();
  return inner;
};
// host = ilk eklenen oyuncu
const idsOf = (room: Room) => [...(room as unknown as { players: Map<string, unknown> }).players.keys()];
const ids0 = (ids: string[]) => ids[0];

console.log("D/Y Blitz regresyonları");

test("iddia turda üretilir; payload şık/correctIndex sızdırmaz", () => {
  const room = blitzRoom("b1", ["a"]);
  const inner = startRound(room);
  const st = room.stateFor("a", false);
  assert.ok(inner.currentBlitz, "currentBlitz dolu olmalı");
  assert.ok(st.blitz, "blitz payload'ı olmalı");
  assert.ok(st.blitz!.claim.length > 0);
  assert.equal((st.blitz as unknown as Record<string, unknown>).choices, undefined);
  assert.equal((st.blitz as unknown as Record<string, unknown>).correctIndex, undefined);
  assert.equal(st.question, null, "klasik soru payload'ı blitz'te yok");
});

test("Doğru bilen +BLITZ_BASE; yanlış bilen 0", () => {
  const room = blitzRoom("b2", ["a", "b"]);
  const inner = startRound(room);
  const truth = inner.currentBlitz!.truth;
  room.answer("a", truth ? 0 : 1);
  room.answer("b", truth ? 1 : 0);
  inner.reveal();
  assert.equal(inner.lastReveal!.gains["a"], GAME.BLITZ_BASE);
  assert.equal(inner.lastReveal!.gains["b"], 0);
  assert.equal(inner.lastReveal!.correctIndex, truth ? 0 : 1);
});

test("cevap yalnız 0 veya 1 — sınır dışı yutulur", () => {
  const room = blitzRoom("b3", ["a", "b"]);
  startRound(room);
  room.answer("a", 2);
  room.answer("a", -1);
  assert.equal(room.stateFor("a", false).yourChoice, null);
  room.answer("a", 1);
  assert.equal(room.stateFor("a", false).yourChoice, 1);
});

test("kilitli cevap değişmez", () => {
  const room = blitzRoom("b4", ["a", "b"]);
  startRound(room);
  room.answer("a", 0);
  room.answer("a", 1);
  assert.equal(room.stateFor("a", false).yourChoice, 0);
});

test("tur süresi 8 sn — masa ayarından bağımsız", () => {
  const room = new Room("b5", () => {}, { minPlayers: 1, questionDurationMs: 20_000 });
  room.addPlayer({ ...user("a"), isBot: false });
  room.setGameMode("a", "blitz");
  room.setReady("a", true);
  const inner = startRound(room);
  assert.equal(inner.questionDeadline - inner.questionStartedAt, GAME.BLITZ_MS);
});

test("reveal istatistiği sayar; zil/numeric alanları boş", () => {
  const room = blitzRoom("b6", ["a"]);
  const inner = startRound(room);
  room.answer("a", inner.currentBlitz!.truth ? 0 : 1);
  inner.reveal();
  const st = room.stateFor("a", false);
  assert.equal(inner.players.get("a")!.stats.total, 1);
  assert.equal(inner.players.get("a")!.stats.correct, 1);
  assert.equal(st.numeric, null);
  assert.equal(st.zil, null);
  // blitz payload'ı reveal fazında da dolu kalır (sütunlar iddiayı gösterir).
  assert.ok(st.blitz);
});

test("hız bonusu yok — son saniyede doğru da tam puan almaz, sabit BASE", () => {
  const room = blitzRoom("b7", ["a"]);
  const inner = startRound(room);
  const truth = inner.currentBlitz!.truth;
  // cevap deadline'a yakın: hız oranı ~0 olsa bile BASE verilmeli
  inner.questionStartedAt -= 7_000;
  room.answer("a", truth ? 0 : 1);
  inner.reveal();
  assert.equal(inner.lastReveal!.gains["a"], GAME.BLITZ_BASE);
});

console.log(`blitz-test: ${passed} geçti`);
assert.equal(passed, 7);
process.exit(0);
