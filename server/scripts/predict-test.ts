import assert from "node:assert";
import { GAME } from "../src/config.js";
import { Room } from "../src/rooms.js";
import type { XpGain } from "@quiztavern/shared";

const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer();
const internals = (room: Room) => room as unknown as {
  qIndex: number;
  revealUntil: number;
};
const beginQuestion = (room: Room) =>
  (room as unknown as { beginQuestion: () => void }).beginQuestion();
const reveal = (room: Room) => (room as unknown as { reveal: (reason: "timeout" | "allAnswered") => void }).reveal("allAnswered");
const advanceFromReveal = (room: Room) =>
  (room as unknown as { advanceFromReveal: () => void }).advanceFromReveal();
const addPlayer = (room: Room, id: string) => {
  room.addPlayer({ id, name: `Oyuncu ${id}`, avatarUrl: null, socketId: `s-${id}`, isBot: false });
  room.setReady(id, true);
};

/** Maçı hızlıca podyuma sürer: son turu göster ve bitir. */
const podiumRoom = (room: Room) => {
  stop(room);
  internals(room).qIndex = room.stateFor("a").round.total - 1;
  beginQuestion(room);
  reveal(room);
  internals(room).revealUntil = 0;
  advanceFromReveal(room);
  assert.equal(room.phase, "podium");
};

// Kayıtlar: bonusXp çağrılarını izleyen sahte depo.
const calls: { userId: string; amount: number }[] = [];
const fakeStore = {
  badge: () => null,
  snapshot: () => null,
  seasonBoard: () => ({ season: "x", rows: [] }),
  weeklyBoard: () => ({ season: "x", rows: [] }),
  recordMatch: () => new Map<string, XpGain>(),
  recordQuestionStats: () => {},
  questionStats: () => [],
  bonusXp(entry: { userId: string; amount: number }) {
    calls.push({ userId: entry.userId, amount: entry.amount });
    return { gained: entry.amount, xp: entry.amount, level: 1, league: "acemi" as const, leveledUp: false, leagueChanged: false };
  },
  title: () => null,
  setTitle: () => true,
};

// 1. Geri sayımda izleyici tahmin yapar; state'e yansır.
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(fakeStore as never);
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  assert.equal(room.phase, "countdown");
  room.predict("b", "a");
  const state = room.stateFor("b");
  assert.equal(state.yourPrediction, "a");
  assert.equal(state.predictOpen, true);
  stop(room);
}

// 2. İlk soruda (qIndex 0) pencere hâlâ açık.
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  beginQuestion(room);
  assert.equal(room.phase, "question");
  assert.equal(room.stateFor("b").predictOpen, true);
  room.predict("b", "a");
  assert.equal(room.stateFor("b").yourPrediction, "a");
  stop(room);
}

// 3. İlk reveal'den sonra pencere kapalı — geç tahmin hile olur.
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  beginQuestion(room);
  reveal(room);
  assert.equal(room.phase, "reveal");
  assert.equal(room.stateFor("b").predictOpen, false);
  assert.throws(() => room.predict("b", "a"), /predictPhase/);
  stop(room);
}

// 4. Doğru bilen izleyiciye finish'te PREDICT_XP.
{
  calls.length = 0;
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(fakeStore as never);
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  room.predict("b", "a");
  // a kazansın: yüksek skor ver.
  (room.players.get("a") as { score: number }).score = 500;
  podiumRoom(room);
  assert.deepEqual(calls, [{ userId: "b", amount: GAME.PREDICT_XP }]);
  const state = room.stateFor("b");
  assert.equal(state.xpGains?.["b"]?.gained, GAME.PREDICT_XP);
}

// 5. Yanlış tahmin → ödül yok.
{
  calls.length = 0;
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(fakeStore as never);
  addPlayer(room, "a"); addPlayer(room, "b"); addPlayer(room, "c");
  room.start("a", "classic");
  room.becomeSpectator("b");
  room.predict("b", "c"); // c değil a kazanır
  (room.players.get("a") as { score: number }).score = 500;
  podiumRoom(room);
  assert.deepEqual(calls, []);
}

// 6. Oyuncu tahmin edemez; izleyici olmayan id de edemez.
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.predict("a", "b"); // oyuncu — sessizce yok sayılır
  room.predict("ghost", "a"); // odada yok — yok sayılır
  assert.equal(room.stateFor("a").yourPrediction, null);
  stop(room);
}

// 7. Masaya oturunca tahmin düşer (artık oyuncu).
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  room.predict("b", "a");
  room.becomePlayer({ id: "b", name: "b", avatarUrl: null, socketId: "s-b" });
  assert.equal(room.stateFor("b").yourPrediction, null);
  stop(room);
}

// 8. Yeni maç tahminleri sıfırlar.
{
  const room = new Room("r", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(fakeStore as never);
  addPlayer(room, "a"); addPlayer(room, "b");
  room.start("a", "classic");
  room.becomeSpectator("b");
  room.predict("b", "a");
  podiumRoom(room);
  room.returnToLobby("a");
  room.start("a", "classic");
  room.becomeSpectator("b");
  assert.equal(room.stateFor("b").yourPrediction, null);
  stop(room);
}

// 9. Blitz'te pencere soru fazında kapalı — tüm 60 sn boyunca qIndex=0
//    olduğu için genel kural pencereyi maç sonuna dek açık bırakırdı (B49).
{
  const room = new Room("r", () => {}, { minPlayers: 1 });
  addPlayer(room, "a"); addPlayer(room, "b");
  room.setGameMode("a", "blitz");
  room.setReady("a", true); room.setReady("b", true); // setGameMode ready'leri sıfırlar
  room.start("a", "blitz");
  room.becomeSpectator("b");
  assert.equal(room.phase, "countdown");
  room.predict("b", "a"); // geri sayımda serbest
  assert.equal(room.stateFor("b").yourPrediction, "a");
  beginQuestion(room);
  assert.equal(room.phase, "question");
  assert.equal(room.stateFor("b").predictOpen, false, "blitz'te soru fazında kapalı");
  assert.throws(() => room.predict("b", "a"), /predictPhase/);
  stop(room);
}

console.log("predict-test: 9/9 OK");
