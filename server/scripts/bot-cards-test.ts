import assert from "node:assert";
import { Room } from "../src/rooms.js";
import type { Question } from "../../shared/types";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const user = (id: string, isBot: boolean) => ({ id, name: `P${id}`, avatarUrl: null, socketId: `s-${id}`, isBot });
const internals = (room: Room) =>
  room as unknown as {
    players: Map<
      string,
      { score: number; choice: number | null; fiftyRemoved: number[]; frozen: boolean; cards: number }
    >;
    questions: Question[];
    qIndex: number;
    beginQuestion(): void;
  };

const fake: Question = {
  id: "q-1",
  category: "Test",
  text: "Soru",
  textEn: "Question",
  choices: ["a", "b", "c", "d"],
  choicesEn: ["a", "b", "c", "d"],
  correctIndex: 0,
  difficulty: "kolay",
};

const roomWithBot = () => {
  const room = new Room(`r-${Math.random()}`, () => {}, { minPlayers: 1 });
  room.addPlayer({ ...user("a", false) });
  room.addPlayer({ ...user("bot", true) });
  room.setGameMode("a", "classic");
  room.setReady("a", true);
  room.start("a");
  const inner = internals(room);
  inner.questions[inner.qIndex] = fake;
  inner.beginQuestion();
  return { room, inner };
};

console.log("Bot joker kartı regresyonları");

test("bot %50 oynayınca tam 2 yanlış şık silinir", () => {
  const { room, inner } = roomWithBot();
  inner.players.get("bot")!.cards = 1;
  room.useCard("bot", "fifty");
  const removed = inner.players.get("bot")!.fiftyRemoved;
  assert.equal(removed.length, 2);
  assert.ok(removed.every((i) => i !== 0)); // doğru şık asla silinmez
});

test("%50 sonrası silinen şık cevap olarak reddedilir (bot dahil)", () => {
  const { room, inner } = roomWithBot();
  inner.players.get("bot")!.cards = 1;
  room.useCard("bot", "fifty");
  const removed = inner.players.get("bot")!.fiftyRemoved;
  room.answer("bot", removed[0]);
  assert.equal(inner.players.get("bot")!.choice, null); // silinmiş şık seçilemedi
  room.answer("bot", 0);
  assert.equal(inner.players.get("bot")!.choice, 0); // kalan şık seçilebildi
});

test("dondur jokeri botu da hedefleyebilir", () => {
  const { room, inner } = roomWithBot();
  inner.players.get("a")!.cards = 1;
  room.useCard("a", "freeze", "bot");
  assert.equal(inner.players.get("bot")!.frozen, true);
});

test("rakip state'i silinen şık indekslerini sızdırmaz", () => {
  const { room, inner } = roomWithBot();
  inner.players.get("bot")!.cards = 1;
  room.useCard("bot", "fifty");
  const state = room.stateFor("a", false);
  const botRow = state.players.find((p) => p.id === "bot")!;
  assert.ok(!("removedChoices" in botRow));
  assert.ok(!("fiftyRemoved" in botRow));
});

console.log(`\n[bot-cards] sonuç: ${passed} geçti, 0 kaldı`);

// Odaların asılı zamanlayıcıları process'i açık tutmasın — senkron
// testler bittiğinde çık.
process.exit(0);
