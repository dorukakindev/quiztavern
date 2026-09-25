import assert from "node:assert";
import { GAME } from "../src/config.js";
import { Room } from "../src/rooms.js";
import type { Difficulty, Question } from "../../shared/types";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const user = (id: string) => ({ id, name: `P${id}`, avatarUrl: null, socketId: `s-${id}` });
const internals = (room: Room) => room as unknown as {
  players: Map<string, { score: number }>;
  questions: Question[];
  qIndex: number;
  reveal(reason?: "timeout" | "allAnswered"): void;
  beginQuestion(): void;
};

const fake = (difficulty: Difficulty): Question => ({
  id: `q-${difficulty}`,
  category: "Test",
  text: `Soru (${difficulty})`,
  textEn: `Question (${difficulty})`,
  choices: ["a", "b", "c", "d"],
  choicesEn: ["a", "b", "c", "d"],
  correctIndex: 0,
  difficulty,
});

const roomWith = (difficulty: Difficulty) => {
  const room = new Room(`r-${difficulty}-${Math.random()}`, () => {}, { minPlayers: 1 });
  room.addPlayer({ ...user("a"), isBot: false });
  room.setGameMode("a", "classic");
  // Hız bileşenini kapat: kazanç = taban + zorluk bonusu (deterministik).
  room.setTableFlag("a", "speedBonus", false);
  room.setReady("a", true);
  room.start("a", "classic");
  const inner = internals(room);
  inner.questions[inner.qIndex] = fake(difficulty);
  inner.beginQuestion();
  return { room, inner };
};

const scored = (difficulty: Difficulty) => {
  const { room, inner } = roomWith(difficulty);
  room.answer("a", 0);
  inner.reveal();
  return inner.players.get("a")!.score;
};

console.log("Zorluk bonusu regresyonları");

test("zor soru tabana +120 ekler (kolaya göre fark tam DIFF_BONUS)", () => {
  const kolay = scored("kolay");
  const zor = scored("zor");
  assert.equal(kolay, GAME.BASE_POINTS + GAME.DIFF_BONUS.kolay);
  assert.equal(zor, GAME.BASE_POINTS + GAME.DIFF_BONUS.zor);
  assert.equal(zor - kolay, GAME.DIFF_BONUS.zor);
});

test("orta soru orta bonusu alır", () => {
  const orta = scored("orta");
  assert.equal(orta, GAME.BASE_POINTS + GAME.DIFF_BONUS.orta);
});

test("yanlış cevap zorluk bonusu üretmez", () => {
  const { room, inner } = roomWith("zor");
  room.answer("a", 2); // yanlış
  inner.reveal();
  assert.equal(inner.players.get("a")!.score, 0);
});

console.log(`\n[difficulty-bonus] sonuç: ${passed} geçti, 0 kaldı`);
