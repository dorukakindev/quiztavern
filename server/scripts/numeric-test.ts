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
const internals = (room: Room) =>
  room as unknown as {
    players: Map<string, { score: number; stats: { total: number; correct: number } }>;
    numericQuestions: { id: string; answer: number }[];
    numericGuesses: Map<string, number>;
    qIndex: number;
    questionDeadline: number;
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
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_RUNNER_UP, "ikinci en yakın teselli alır");
  assert.equal(inner.players.get("c")!.score, 0);
  const nr = room.stateFor("a").reveal?.numeric;
  assert.equal(nr?.answer, answer);
  assert.deepEqual(nr?.winnerIds, ["b"]);
  assert.deepEqual(nr?.runnerUpIds, ["a"]);
});

test("İkinci en yakın teselli: kazananla berabere değil, üçüncüye yok", () => {
  const room = numericRoom("n-runner", ["a", "b", "c", "d"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer + 1); // kazanan
  room.numericAnswer("b", answer - 4); // ikinci en yakın (mesafe 4)
  room.numericAnswer("c", answer + 4); // aynı mesafe → ikisi de runner-up
  room.numericAnswer("d", answer + 50); // teselli yok
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_BASE);
  assert.equal(inner.players.get("b")!.score, GAME.NUMERIC_RUNNER_UP);
  assert.equal(inner.players.get("c")!.score, GAME.NUMERIC_RUNNER_UP);
  assert.equal(inner.players.get("d")!.score, 0);
  const nr = room.stateFor("a").reveal?.numeric;
  assert.deepEqual(new Set(nr?.runnerUpIds), new Set(["b", "c"]));
});

test("Tam isabet taban + bonus alır", () => {
  const room = numericRoom("n-exact", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer);
  room.numericAnswer("b", answer + 5);
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_BASE + GAME.NUMERIC_EXACT);
});

test("Eşit mesafe — önce kilitleyen kazanır, diğeri teselli dilimine düşer", () => {
  const room = numericRoom("n-tie", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  // İki tarafa aynı tahmin — kayan nokta mesafeleri bit-bit eşit olur
  // (örn. cevap 3.05 için |a+5−a| ile |a−5−a| ULP farklılaşır ve beraberlik bozulur).
  room.numericAnswer("a", answer + 5);
  room.numericAnswer("b", answer + 5);
  const nr = room.stateFor("a").reveal?.numeric;
  assert.deepEqual(nr?.winnerIds, ["a"], "önce kilitleyen tek kazanan");
  assert.ok(nr?.runnerUpIds.includes("b"), "eşit mesafe ikincisi teselli");
  assert.equal(inner.players.get("a")!.score, GAME.NUMERIC_BASE);
  assert.equal(inner.players.get("b")!.score, GAME.NUMERIC_RUNNER_UP);
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

test("choice emit'i numeric modda state'i kirletmez", () => {
  const room = numericRoom("n-choice", ["a"]);
  startRound(room); // inner bilinçli bağlanmadı — aşağıda internals2 okunuyor
  room.answer("a", 2); // numeric modda indeks cevap yutulmalı
  const internals2 = internals(room) as unknown as {
    players: Map<string, { choice: number | null }>;
    firstAnswerId: string | null;
  };
  assert.equal(internals2.players.get("a")!.choice, null);
  assert.equal(internals2.firstAnswerId, null);
  assert.equal(room.phase, "question"); // erken reveal da tetiklenmez
});

test("süresi geçmiş cevap: reveal + err.lateAnswer toast'ı", () => {
  const room = numericRoom("n-late", ["a"]);
  const inner = startRound(room);
  const toasts: string[] = [];
  room.setToastHandler((playerId, key) => {
    if (playerId === "a") toasts.push(key);
  });
  inner.questionDeadline = Date.now() - 1; // süre doldu, timer henüz ateşlenmemiş
  room.numericAnswer("a", 42);
  assert.equal(room.phase, "reveal");
  assert.deepEqual(toasts, ["err.lateAnswer"]);
  assert.equal(inner.numericGuesses.has("a"), false);
});

test("maç özeti incelemesi numeric'te tur geçmişi taşır (B51)", () => {
  const room = numericRoom("n-review", ["a", "b"]);
  const inner = startRound(room);
  const answer = inner.numericQuestions[0].answer;
  room.numericAnswer("a", answer); // tam isabet → kazanan
  room.numericAnswer("b", answer + 40); // kaybeden
  assert.equal(room.phase, "reveal");
  const fin = room as unknown as {
    finish(): void;
    frozenSummaries: Map<string, { review: { correct: boolean; yourAnswer: string; correctAnswer: string }[] }>;
  };
  fin.finish();
  const reviewA = fin.frozenSummaries.get("a")!.review;
  assert.equal(reviewA.length, inner.numericQuestions.length); // oynanmamış turlar da listelenir (diğer modlarla aynı)
  assert.equal(reviewA[0].correct, true);
  assert.equal(reviewA[0].yourAnswer, String(answer));
  assert.equal(reviewA[0].correctAnswer, String(answer));
  const reviewB = fin.frozenSummaries.get("b")!.review;
  assert.equal(reviewB[0].correct, false);
  assert.equal(reviewB[0].yourAnswer, String(answer + 40));
});

console.log(`numeric-test: ${passed} geçti`);
assert.equal(passed, 12);
process.exit(0); // açık oda zamanlayıcıları process'i canlı tutmasın
