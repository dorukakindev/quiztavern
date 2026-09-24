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
  numericQuestions: { id: string; answer: number }[];
  numericGuesses: Map<string, number>;
  qIndex: number;
  beginQuestion(): void;
  reveal(reason?: "timeout" | "allAnswered"): void;
};
const numericRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  for (const pid of ids) room.addPlayer({ ...user(pid), isBot: false });
  room.setGameMode(ids[0], "numeric");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
const startRound = (room: Room) => {
  const inner = internals(room);
  room.start("a", "numeric");
  inner.qIndex = 0;
  inner.beginQuestion();
  return inner;
};

console.log("Yakın Tahmin regresyonları");

test("En yakın tahmin kazanır; puan taban değerdir", () => {
  const room = numericRoom("n-closest", ["a", "b", "c"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer + 10);
  room.numericAnswer("b", answer - 3);
  room.numericAnswer("c", answer + 100);
  assert.equal(room.phase, "reveal");
  assert.equal(inner.players.get("b")!.score, GAME.NUMERIC_BASE);
  assert.equal(inner.players.get("a")!.score, 0);
  const nr = room.stateFor("a").reveal?.numeric;
  assert.equal(nr?.answer, answer);
  assert.deepEqual(nr?.winnerIds, ["b"]);
});

test("Tam isabet taban + bonus alır", () => {
  const room = numericRoom("n-exact", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer);
  room.numericAnswer("b", answer + 5);
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_BASE + GAME.NUMERIC_EXACT);
});

test("Eşit mesafe berabere — ikisi de kazanır", () => {
  const room = numericRoom("n-tie", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer + 5);
  room.numericAnswer("b", answer - 5);
  const nr = room.stateFor("a").reveal?.numeric;
  assert.equal(nr?.winnerIds.length, 2);
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_BASE);
  assert.equal(inner.players.get("b")!.score, GAME.NUMERIC_BASE);
});

test("Tahmin bir kez kilitlenir; ikinci giriş yutulur", () => {
  const room = numericRoom("n-lock", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer + 10);
  room.numericAnswer("a", answer); // geç değiştirme girişimi
  assert.equal(inner.numericGuesses.get("a"), answer + 10);
});

test("Sayı olmayan/saçma girişler yutulur", () => {
  const room = numericRoom("n-nan", ["a"]);
  const inner = startRound(room);
  room.numericAnswer("a", NaN);
  room.numericAnswer("a", 1e20);
  assert.equal(inner.numericGuesses.size, 0);
  assert.equal(room.phase, "question");
});

test("Uygun olmayan oyuncu tahmin giremez (geç katılan)", () => {
  const room = numericRoom("n-late", ["a"]);
  const inner = startRound(room);
  room.addPlayer({ ...user("b"), isBot: false });
  room.numericAnswer("b", 42);
  assert.equal(inner.numericGuesses.has("b"), false);
});

test("Doğru cevap soru payload'ında istemciye gönderilmez", () => {
  const room = numericRoom("n-secret", ["a"]);
  startRound(room);
  const payload = room.stateFor("a").numeric;
  assert.ok(payload);
  assert.equal("answer" in (payload as object), false, "answer sızıntısı yok");
});

test("stateFor yourNumericGuess ve zil ile çakışmaz", () => {
  const room = numericRoom("n-state", ["a"]);
  const inner = startRound(room);
  room.numericAnswer("a", 7);
  // Tek oyuncu kilitlediği için tur doğrudan reveal olur — istatistik burada sayılır.
  assert.equal(room.stateFor("a").yourNumericGuess, 7);
  assert.equal(room.stateFor("a").zil, null);
  assert.equal(inner.players.get("a")!.stats.total, 1);
});

console.log(`numeric-test: ${passed} geçti`);
assert.equal(passed, 8);
process.exit(0); // açık oda zamanlayıcıları process'i canlı tutmasın
