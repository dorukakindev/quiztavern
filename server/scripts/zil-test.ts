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
  questions: { id: string; correctIndex: number }[];
  qIndex: number;
  roundLimit: number;
  revealUntil: number;
  buzzWinnerId: string | null;
  beginQuestion(): void;
  reveal(reason?: "timeout" | "allAnswered"): void;
  advanceFromReveal(): void;
};
const zilRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  for (const pid of ids) room.addPlayer({ ...user(pid), isBot: false });
  room.setGameMode(ids[0], "zil");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
const startRound = (room: Room) => {
  const inner = internals(room);
  room.start("a", "zil");
  inner.qIndex = 0;
  inner.beginQuestion();
  return inner;
};

console.log("Zil regresyonları");

test("İlk basan zili kazanır; ikincisi yutulur", () => {
  const room = zilRoom("z-buzz", ["a", "b", "c"]);
  const inner = startRound(room);
  room.buzz("b");
  assert.equal(inner.buzzWinnerId, "b");
  room.buzz("a");
  assert.equal(inner.buzzWinnerId, "b", "ilk basan tutar");
  assert.equal(room.stateFor("a").zil?.winnerId, "b");
});

test("Kazanan doğru bilirse tur değeriyle reveal olur", () => {
  const room = zilRoom("z-win", ["a", "b"]);
  const inner = startRound(room);
  room.buzz("a");
  room.answer("a", inner.questions[0].correctIndex);
  assert.equal(room.phase, "reveal");
  assert.equal(inner.players.get("a")!.score, GAME.ZIL_BASE, "1. deneme tam değer");
});

test("Yanlış cevap denemeyi yakar, zil yeniden açılır; ikinci doğru düşük değerde", () => {
  const room = zilRoom("z-retry", ["a", "b"]);
  const inner = startRound(room);
  room.buzz("a");
  room.answer("a", (inner.questions[0].correctIndex + 1) % 4);
  assert.equal(room.phase, "question", "zil yeniden açıldı");
  assert.equal(inner.buzzWinnerId, null);
  room.buzz("a"); // yanmış oyuncu tekrar basamaz
  assert.equal(inner.buzzWinnerId, null);
  room.buzz("b");
  room.answer("b", inner.questions[0].correctIndex);
  assert.equal(room.phase, "reveal");
  assert.equal(inner.players.get("b")!.score, GAME.ZIL_BASE - GAME.ZIL_DECAY, "2. deneme düşük değer");
});

test("Herkes yanarsa tur puansız biter", () => {
  const room = zilRoom("z-allfail", ["a", "b"]);
  const inner = startRound(room);
  const wrong = (inner.questions[0].correctIndex + 1) % 4;
  room.buzz("a");
  room.answer("a", wrong);
  room.buzz("b");
  room.answer("b", wrong);
  assert.equal(room.phase, "reveal");
  // Cezanın net etkisi −ZIL_PENALTY ama skor 0'ın altına inmez (clamp).
  assert.equal(inner.players.get("a")!.score, 0, "yanlış basan skor tabana indi (negatif yok)");
  assert.equal(inner.players.get("b")!.score, 0);
});

test("Zil yokken cevaplar yutulur", () => {
  const room = zilRoom("z-noBuzz", ["a", "b"]);
  const inner = startRound(room);
  room.answer("a", 1);
  assert.equal(inner.players.get("a")!.stats.total, 0);
});

test("Zil kazananı kopunca tur yeniden açılır", () => {
  const room = zilRoom("z-disc", ["a", "b"]);
  const inner = startRound(room);
  room.buzz("a");
  room.markDisconnected("a", "s-a");
  assert.equal(inner.buzzWinnerId, null);
  assert.equal(room.phase, "question");
  room.buzz("b");
  assert.equal(inner.buzzWinnerId, "b");
});

test("Uygun olmayan oyuncu basamaz (geç katılan)", () => {
  const room = new Room("z-late", () => {}, { minPlayers: 1 });
  room.addPlayer({ ...user("a"), isBot: false });
  room.addPlayer({ ...user("b"), isBot: false });
  room.setGameMode("a", "zil");
  room.setReady("a", true);
  room.setReady("b", true);
  const inner = internals(room);
  room.start("a", "zil");
  inner.qIndex = 0;
  inner.beginQuestion();
  room.addPlayer({ ...user("c"), isBot: false }); // mid-match joiner
  room.buzz("c");
  assert.equal(inner.buzzWinnerId, null, "bekleyen basamaz");
  room.buzz("a");
  assert.equal(inner.buzzWinnerId, "a");
});

test("Lobi dışı fazlarda basmak yutulur", () => {
  const room = zilRoom("z-phase", ["a", "b"]);
  room.buzz("a"); // lobide
  assert.equal(internals(room).buzzWinnerId, null);
});

test("Kazanan izleyiciye geçince zil takılmaz — denemesi yanar (B61)", () => {
  const room = zilRoom("z-spectate", ["a", "b", "c"]);
  const inner = startRound(room);
  room.buzz("a");
  room.becomeSpectator("a"); // kazanan pencerede izleyiciye geçti
  assert.equal(inner.buzzWinnerId, null, "zil takılı kalmadı");
  assert.equal(room.phase, "question", "zil yeniden açıldı");
  room.buzz("b"); // masa bekletilmeden devam eder
  assert.equal(inner.buzzWinnerId, "b");
});

test("Son insan izleyiciye geçerse oda kapanmaz, kaydı düşmez (B47)", () => {
  const room = zilRoom("z-orphan", ["a"]);
  startRound(room);
  let emptied = false;
  room.setEmptiedHandler(() => { emptied = true; });
  room.becomeSpectator("a");
  assert.equal(emptied, false, "oda açık kaldı");
  const spec = (room as unknown as { spectators: Map<string, unknown> }).spectators;
  assert.ok(spec.has("a"), "izleyici kayıtlı");
  assert.equal(room.phase, "lobby", "masa boş lobiye döndü");
});

test("Hiç basmayan oyuncu ceza yemez; yalnız yanlış basan −ZIL_PENALTY (B48)", () => {
  const room = zilRoom("z-passive", ["a", "b", "c"]);
  const inner = startRound(room);
  room.buzz("a");
  room.answer("a", (inner.questions[0].correctIndex + 1) % 4); // a: yanlış deneme → yanar
  room.buzz("b");
  room.answer("b", inner.questions[0].correctIndex);           // b: doğru → kazanır
  assert.equal(room.phase, "reveal");
  const gains = room.stateFor("c").reveal!.gains;
  assert.equal(gains["a"], -GAME.ZIL_PENALTY, "yanlış basan ceza");
  assert.ok(gains["b"] > 0, "kazanan değer aldı");
  assert.equal(gains["c"], 0, "hiç basmayan ceza yemez");
});


console.log(`zil-test: ${passed} geçti`);
assert.equal(passed, 11);
process.exit(0); // açık oda zamanlayıcıları process'i canlı tutmasın
