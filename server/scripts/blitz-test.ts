// D/Y Blitz regresyonları (§6.1): kişisel akış, 60 sn pencere, seri çarpanı,
// bağımsız ilerleme, özet tablosu, istatistik, sızıntı yok.
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
type Claim = { truth: boolean; claim: string; text: string } | null;
type P = { score: number; stats: { total: number; correct: number }; blitzIdx: number; blitzStreak: number; blitzCorrect: number; blitzScore: number; blitzClaim: Claim; blitzTrail: { choice: number }[] };
const internals = (room: Room) => room as unknown as {
  players: Map<string, P>;
  qIndex: number;
  phase: string;
  questions: { id: string; correctIndex: number; choices: string[] }[];
  questionStartedAt: number;
  questionDeadline: number;
  lastReveal: { correctIndex: number; gains: Record<string, number> } | null;
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
  room.start("a", "blitz");
  inner.qIndex = 0;
  inner.beginQuestion();
  return inner;
};

console.log("D/Y Blitz regresyonları");

test("herkes kendi ifadesini görür; truth ve şıklar sızmaz", () => {
  const room = blitzRoom("b1", ["a", "b"]);
  const inner = startRound(room);
  assert.equal(inner.phase, "question");
  const sa = room.stateFor("a", false).blitz!;
  const sb = room.stateFor("b", false).blitz!;
  assert.ok(sa.statement && sb.statement, "herkesin kişisel ifadesi var");
  assert.equal((sa.statement as unknown as Record<string, unknown>).truth, undefined);
  assert.equal(sa.statement!.text, inner.players.get("a")!.blitzClaim!.text);
  assert.equal(room.stateFor("a", false).question, null, "klasik payload yok");
});

test("doğru +BASE; yanlış seriyi sıfırlar; akış ilerler", () => {
  const room = blitzRoom("b2", ["a"]);
  const inner = startRound(room);
  const p = inner.players.get("a")!;
  const truth = p.blitzClaim!.truth;
  room.answer("a", truth ? 0 : 1);
  assert.equal(p.blitzScore, GAME.BLITZ_BASE);
  assert.equal(p.blitzStreak, 1);
  assert.equal(p.blitzIdx, 1, "bir sonraki ifadeye geçti");
  room.answer("a", p.blitzClaim!.truth ? 1 : 0); // yanlış
  assert.equal(p.blitzScore, GAME.BLITZ_BASE, "yanlış puansız");
  assert.equal(p.blitzStreak, 0, "seri sıfırlandı");
  assert.equal(p.blitzIdx, 2);
});

test("seri çarpanı: üst üste doğrular STEP artar, CAP'te durur", () => {
  const room = blitzRoom("b3", ["a"]);
  const inner = startRound(room);
  const p = inner.players.get("a")!;
  for (let i = 0; i < 6; i++) room.answer("a", p.blitzClaim!.truth ? 0 : 1);
  // kazançlar: 100 +125 +150 +175 +200(cap) +200(cap)
  const expected = [100, 125, 150, 175, 200, 200].reduce((x, y) => x + y, 0);
  assert.equal(p.blitzScore, expected);
  assert.equal(p.blitzCorrect, 6);
});

test("havuz tükenince statement null — oyuncu izler", () => {
  const room = blitzRoom("b4", ["a"]);
  const inner = startRound(room);
  const p = inner.players.get("a")!;
  p.blitzIdx = inner.questions.length; // sona taşı
  p.blitzClaim = null;
  room.answer("a", 0);
  assert.equal(p.blitzAnswered, 0, "ifade yokken cevap yutulur");
});

test("oyuncular bağımsız ilerler — A 5 ifadede, B 1'de olabilir", () => {
  const room = blitzRoom("b5", ["a", "b"]);
  const inner = startRound(room);
  const a = inner.players.get("a")!;
  for (let i = 0; i < 5; i++) room.answer("a", a.blitzClaim!.truth ? 0 : 1);
  assert.equal(a.blitzIdx, 5);
  assert.equal(inner.players.get("b")!.blitzIdx, 0, "B henüz başlamadı");
});

test("pencere 60 sn; reveal özet tablosu skor sıralı", () => {
  const room = blitzRoom("b6", ["a", "b"]);
  const inner = startRound(room);
  assert.equal(inner.questionDeadline - inner.questionStartedAt, GAME.BLITZ_TOTAL_MS);
  room.answer("a", inner.players.get("a")!.blitzClaim!.truth ? 0 : 1);
  room.answer("b", inner.players.get("b")!.blitzClaim!.truth ? 1 : 0); // yanlış
  inner.reveal();
  const st = room.stateFor("a", false);
  assert.equal(inner.phase, "reveal");
  assert.ok(st.blitzSummary, "özet dolu");
  assert.equal(st.blitzSummary!.rows.length, 2);
  assert.equal(st.blitzSummary!.rows[0].id, "a", "skor sahibi başta");
  assert.equal(inner.lastReveal!.gains["a"], GAME.BLITZ_BASE);
  assert.equal(inner.players.get("a")!.blitzClaim, null, "akış dondu");
  assert.equal(st.blitz, null, "reveal'da canlı payload yok");
});

test("istatistik ve iz sürümü doğru sayılır", () => {
  const room = blitzRoom("b7", ["a"]);
  const inner = startRound(room);
  const p = inner.players.get("a")!;
  room.answer("a", p.blitzClaim!.truth ? 0 : 1);
  room.answer("a", p.blitzClaim!.truth ? 1 : 0);
  assert.equal(p.stats.total, 2);
  assert.equal(p.stats.correct, 1);
  assert.equal(p.blitzTrail.length, 2);
});

test("kopuş pencereyi erken kapatmaz — reveal yalnız 60 sn timer'ıyla", () => {
  const room = blitzRoom("b8", ["a", "b", "c"]);
  const inner = startRound(room);
  // Üçü de 1. ifadeyi cevapladı → hepsi "cevapladı" sayılır; biri kopunca
  // eski davranış pencereyi anında kapatırdı.
  for (const id of ["a", "b", "c"]) room.answer(id, inner.players.get(id)!.blitzClaim!.truth ? 0 : 1);
  room.markDisconnected("c");
  assert.equal(inner.phase, "question", "kopuş blitz penceresini erken kapatmamalı");
  // İzleyiciye geçiş de aynı korumanın altında.
  room.becomeSpectator("b");
  assert.equal(inner.phase, "question", "izleyiciye geçiş de kapatmamalı");
  // Süre dolunca normal reveal akışı çalışmaya devam eder.
  inner.reveal();
  assert.equal(inner.phase, "reveal");
});

console.log(`blitz-test: ${passed} geçti`);
assert.equal(passed, 8);
process.exit(0);
