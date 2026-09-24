import assert from "node:assert";
import { GAME } from "../src/config.js";
import { Room } from "../src/rooms.js";
import { GameError } from "../src/errors.js";
import type { XpGain } from "@quiztavern/shared";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const user = (id: string, name = id) => ({ id, name, avatarUrl: null, socketId: `s-${id}` });
const internals = (room: Room) => room as unknown as {
  players: Map<string, { score: number; eligibleFrom: number; stats: { total: number } }>;
  questions: { id: string; correctIndex: number }[];
  qIndex: number;
  roundLimit: number;
  revealUntil: number;
  beginQuestion(): void;
  reveal(reason?: "timeout" | "allAnswered"): void;
  advanceFromReveal(): void;
};
const addPlayer = (room: Room, id: string) => {
  room.addPlayer({ ...user(id), isBot: false });
};
const calls: { userId: string; amount: number }[] = [];
const fakeStore = {
  badge: () => null,
  snapshot: () => null,
  seasonBoard: () => ({ season: "x", rows: [] }),
  weeklyBoard: () => ({ season: "x", rows: [] }),
  recordMatch: () => new Map<string, XpGain>(),
  recordQuestionStats: () => {},
  questionStats: () => new Map(),
  bonusXp(entry: { userId: string; amount: number }) {
    calls.push({ userId: entry.userId, amount: entry.amount });
    return { gained: entry.amount, xp: entry.amount, level: 1, league: "acemi" as const, leveledUp: false, leagueChanged: false };
  },
  title: () => null,
  setTitle: () => true,
};
const duelRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  room.setProgressStore(fakeStore as never);
  for (const pid of ids) addPlayer(room, pid);
  // setGameMode hazır onayını sıfırlar — önce mod seç, sonra herkesi hazırla.
  room.setGameMode(ids[0], "duel");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
/** Son turu oynatıp maçı podyuma taşır. */
const toPodium = (room: Room) => {
  const inner = internals(room);
  inner.qIndex = inner.roundLimit - 1;
  inner.beginQuestion();
  inner.reveal("allAnswered");
  inner.revealUntil = 0;
  inner.advanceFromReveal();
  assert.equal(room.phase, "podium");
};

console.log("Düello regresyonları");

test("Mod seçimi soru sayısını 7'ye sabitler", () => {
  const room = duelRoom("d-mode", ["a", "b"]);
  assert.equal(room.questionCount, GAME.DUEL_QUESTIONS);
});

test("2 oyuncuyla ikisi de düellocu; fazlası izleyici olur", () => {
  const room = duelRoom("d-seat", ["a", "b", "c", "d"]);
  room.start("a", "duel");
  const inner = internals(room);
  assert.equal(inner.players.get("a")!.eligibleFrom, 0);
  assert.equal(inner.players.get("b")!.eligibleFrom, 0);
  assert.ok(inner.players.get("c")!.eligibleFrom >= inner.roundLimit, "c izleyici");
  assert.ok(inner.players.get("d")!.eligibleFrom >= inner.roundLimit, "d izleyici");
  const state = room.stateFor("c");
  assert.equal(state.players.find((p) => p.id === "c")!.waiting, true);
});

test("Tek oyuncu düello başlatamaz", () => {
  const room = duelRoom("d-min", ["a"]);
  assert.throws(() => room.start("a", "duel"), GameError);
});

test("İzleyicinin cevabı yutulur; düellocunun geçer", () => {
  const room = duelRoom("d-answer", ["a", "b", "c"]);
  room.start("a", "duel");
  const inner = internals(room);
  inner.qIndex = 0;
  inner.beginQuestion();
  const correct = inner.questions[0].correctIndex;
  room.answer("c", correct); // izleyici — reddedilir
  room.answer("a", correct);
  room.answer("b", (correct + 1) % 4);
  inner.reveal("allAnswered");
  assert.equal(inner.players.get("c")!.stats.total, 0, "izleyiciye tur işlenmez");
  assert.equal(inner.players.get("a")!.stats.total, 1);
});

test("Masadaki izleyici tahmin yapabilir; podyumda +XP yazar", () => {
  calls.length = 0;
  const room = duelRoom("d-predict", ["a", "b", "c"]);
  room.start("a", "duel");
  room.predict("c", "a");
  assert.equal(room.stateFor("c").yourPrediction, "a");
  // İzleyici olmayan düellocu tahmin yapamaz.
  room.predict("a", "b");
  assert.equal(room.stateFor("a").yourPrediction, null);
  // a kazansın: toPodium öncesi skor verelim — düelloyu tam oynamak yerine
  // her turda a doğru, b yanlış cevaplasın.
  const inner = internals(room);
  for (let i = 0; i < inner.roundLimit; i++) {
    inner.qIndex = i;
    inner.beginQuestion();
    const correct = inner.questions[i].correctIndex;
    room.answer("a", correct);
    room.answer("b", (correct + 1) % 4);
    inner.reveal("allAnswered");
    inner.revealUntil = 0;
    inner.advanceFromReveal();
  }
  assert.equal(room.phase, "podium");
  assert.ok(calls.some((c) => c.userId === "c" && c.amount === GAME.PREDICT_XP), "doğru tahmine XP yazılmadı");
});

test("Podyum yalnız düellocuları listeler", () => {
  const room = duelRoom("d-podium", ["a", "b", "c"]);
  room.start("a", "duel");
  toPodium(room);
  const podium = room.stateFor("a").podium ?? [];
  assert.equal(podium.length, 2);
  assert.ok(!podium.some((p) => p.id === "c"));
});

test("Maç ortasında oturan da izleyici kalır", () => {
  const room = duelRoom("d-late", ["a", "b"]);
  room.start("a", "duel");
  const inner = internals(room);
  inner.qIndex = 0;
  inner.beginQuestion();
  room.addPlayer({ ...user("e"), isBot: false });
  assert.ok(inner.players.get("e")!.eligibleFrom >= inner.roundLimit, "geç katılan izleyici");
});

test("İzleyici düellocu tahmin ettiğinde predictOpen açık görünür", () => {
  const room = duelRoom("d-open", ["a", "b", "c"]);
  room.start("a", "duel");
  const state = room.stateFor("c");
  assert.equal(state.predictOpen, true);
});

console.log(`duel-test: ${passed} geçti`);
assert.equal(passed, 8);
process.exit(0); // açık oda zamanlayıcıları process'i canlı tutmasın
