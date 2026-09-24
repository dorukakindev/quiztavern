// Zaman Çizelgesi regresyonları (§6.1): permütasyon doğrulama, kısmi puan,
// doğru sıra sızıntısız, reveal'da yıl açılımı, botlar.
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
type P = { score: number; stats: { total: number; correct: number }; orderAnswers: (number[] | null)[] };
const internals = (room: Room) => room as unknown as {
  players: Map<string, P>;
  qIndex: number;
  phase: string;
  orderQuestions: { id: string; events: { label: string; year: number; when: string }[] }[];
  orderShuffle: number[];
  orderGuesses: Map<string, number[]>;
  questionStartedAt: number;
  questionDeadline: number;
  beginQuestion(): void;
  reveal(): void;
};

const timelineRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  for (const pid of ids) room.addPlayer({ ...user(pid), isBot: false });
  room.setGameMode(ids[0], "timeline");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
const startRound = (room: Room) => {
  const inner = internals(room);
  room.start(ids0(room), "timeline");
  inner.qIndex = 0;
  inner.beginQuestion();
  return inner;
};
const ids0 = (room: Room) => internals(room).players.keys().next().value!;
const solution = (room: Room) => {
  const q = internals(room).orderQuestions[internals(room).qIndex];
  return q.events.map((_, i) => i).sort((a, b) => q.events[a].year - q.events[b].year);
};

console.log("Zaman Çizelgesi regresyonları");

test("soru fazında yıllar gizli, karışık dizilim gelir", () => {
  const room = timelineRoom("t1", ["a", "b"]);
  const inner = startRound(room);
  assert.equal(inner.phase, "question");
  const tl = room.stateFor("a", false).timeline!;
  assert.ok(tl, "payload dolu");
  assert.equal(tl.items.length, 4);
  assert.equal(tl.orderIdx.length, 4);
  assert.equal((tl.items[0] as unknown as Record<string, unknown>).when, undefined, "yıl sızmaz");
  assert.deepEqual([...tl.orderIdx].sort(), [0, 1, 2, 3], "permütasyon");
});

test("permütasyon olmayan dizim yutulur", () => {
  const room = timelineRoom("t2", ["a"]);
  startRound(room);
  room.orderAnswer("a", [0, 0, 1, 2]);
  room.orderAnswer("a", [0, 1, 2, 5]);
  room.orderAnswer("a", [0, 1, 2]);
  assert.equal(internals(room).orderGuesses.size, 0, "geçersiz dizimler yutuldu");
});

test("doğru sıra: her doğru pozisyon +100, tam isabet 400", () => {
  const room = timelineRoom("t3", ["a", "b"]);
  const inner = startRound(room);
  const sol = solution(room);
  room.orderAnswer("a", sol); // tam isabet
  const wrong = [sol[1], sol[0], sol[2], sol[3]]; // 2 doğru pozisyon
  room.orderAnswer("b", wrong);
  const a = inner.players.get("a")!, b = inner.players.get("b")!;
  assert.equal(a.score, 4 * GAME.TIMELINE_PER_POS);
  assert.equal(b.score, 2 * GAME.TIMELINE_PER_POS);
  assert.equal(inner.phase, "reveal", "herkes dizince reveal");
});

test("cevap vermeyen 0 alır; istatistik doğru", () => {
  const room = timelineRoom("t4", ["a", "b"]);
  const inner = startRound(room);
  room.orderAnswer("a", solution(room));
  inner.reveal();
  const a = inner.players.get("a")!, b = inner.players.get("b")!;
  assert.equal(a.stats.correct, 1);
  assert.equal(b.stats.correct, 0);
  assert.equal(b.score, 0);
});

test("reveal payload'ı doğru sırayı yıllarıyla taşır", () => {
  const room = timelineRoom("t5", ["a"]);
  const inner = startRound(room);
  room.orderAnswer("a", solution(room));
  const tr = room.stateFor("a", false).timelineReveal!;
  assert.ok(tr, "reveal dolu");
  assert.equal(tr.ordered.length, 4);
  // doğru sıra yıllara göre artan
  const q = inner.orderQuestions[0];
  tr.ordered.forEach((e, i) => assert.equal(e.label, q.events[solution(room)[i]].label));
  assert.ok(tr.ordered[0].when.length > 0, "yıl etiketi açılır");
  assert.equal(tr.hits["a"], 4);
});

test("kilitli cevap değiştirilemez", () => {
  const room = timelineRoom("t6", ["a"]);
  startRound(room);
  const sol = solution(room);
  room.orderAnswer("a", sol);
  room.orderAnswer("a", [sol[3], sol[2], sol[1], sol[0]]);
  const p = internals(room).players.get("a")!;
  assert.equal(p.score, 4 * GAME.TIMELINE_PER_POS, "ilk dizim kalır");
});

test("round.total havuz büyüklüğünü yansıtır (Soru 1/0 bug'ı)", () => {
  const room = timelineRoom("t7", ["a"]);
  startRound(room);
  const st = room.stateFor("a", false);
  assert.ok(st.round.total > 0, "total sıfır değil");
});

console.log(`timeline-test: ${passed} geçti`);
assert.equal(passed, 7);
process.exit(0);
