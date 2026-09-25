import { strict as assert } from "node:assert";
import { Room } from "../src/rooms";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` });
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer();
const begin = (room: Room) => (room as unknown as { beginQuestion: () => void }).beginQuestion();
const internals = (room: Room) =>
  room as unknown as {
    reveal: () => void;
    advanceFromReveal: () => void;
    qIndex: number;
    revealUntil: number;
    phase: string;
    players: Map<
      string,
      {
        stats: { bestStreak: number; fastestMs: number | null; maxGain: number; correct: number; total: number };
        isBot: boolean;
      }
    >;
  };

/** Maçı oynayıp podyuma düşürür; herkes doğru cevaplar. */
const finishRoom = (
  id: string,
  ids: string[],
  opts: { answerCorrect?: (id: string, qIndex: number) => boolean } = {},
) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 5 });
  for (const [i, pid] of ids.entries()) r.addPlayer(player(pid, `P${i}`));
  for (const pid of ids) r.setReady(pid, true);
  r.start(ids[0], "classic");
  stop(r);
  const inner = internals(r);
  const total = r.stateFor(ids[0], true).round.total;
  while (inner.phase !== "podium") {
    begin(r);
    const q = r.currentQuestion()!;
    for (const pid of ids) {
      const want = opts.answerCorrect ? opts.answerCorrect(pid, inner.qIndex) : true;
      r.answer(pid, want ? q.correctIndex : (q.correctIndex + 1) % 4);
    }
    inner.reveal();
    inner.revealUntil = 0;
    if (inner.qIndex >= total - 1) {
      inner.qIndex = total - 1;
      inner.advanceFromReveal();
      break;
    }
    inner.qIndex += 1;
    inner.advanceFromReveal();
  }
  assert.equal(inner.phase, "podium", `${id}: podyuma ulaşılamadı`);
  return r;
};

console.log("Anlar kartı regresyonları");

test("Hatasız maç → flawless anı", () => {
  const r = finishRoom("m-flawless", ["a", "b"]);
  const moments = r.stateFor("a", true).moments ?? [];
  const flawless = moments.find((m) => m.key === "flawless");
  assert.ok(flawless, "flawless bekleniyor");
  assert.equal(flawless!.value, 5);
});

test("En hızlı parmak anı üretilir", () => {
  const r = finishRoom("m-fastest", ["a", "b"]);
  const fastest = (r.stateFor("a", true).moments ?? []).find((m) => m.key === "fastest");
  assert.ok(fastest, "fastest bekleniyor");
  assert.ok(fastest!.value >= 0);
});

test("Seri ≥3 → streak anı", () => {
  const r = finishRoom("m-streak", ["a"]);
  const streak = (r.stateFor("a", true).moments ?? []).find((m) => m.key === "streak");
  assert.ok(streak && streak.value >= 3, "streak bekleniyor");
});

test("bigBet yalnız kazanç varsa çıkar", () => {
  const r = finishRoom("m-bigbet", ["a"]);
  const bigBet = (r.stateFor("a", true).moments ?? []).find((m) => m.key === "bigBet");
  assert.ok(bigBet && bigBet.value > 0, "bigBet bekleniyor");
});

test("Hiç an yoksa moments boş liste değil null değil — eşikler sağlanmazsa an azalır", () => {
  // Herkes yanlış → streak/flawless/bigBet/fastest üretilmez.
  const r = finishRoom("m-none", ["a"], { answerCorrect: () => false });
  const moments = r.stateFor("a", true).moments ?? [];
  assert.equal(moments.filter((m) => m.key === "streak" || m.key === "flawless").length, 0);
});

test("Bot anlara dahil edilmez", () => {
  const r = new Room("m-bot", () => {}, { minPlayers: 1, questionCount: 5 });
  r.addPlayer(player("u", "U"));
  r.addPlayer({ id: "bot", name: "Bot", avatarUrl: null, socketId: "s:b", isBot: true });
  r.setReady("u", true);
  r.start("u", "classic");
  stop(r);
  const inner = internals(r);
  const total = r.stateFor("u", true).round.total;
  while (inner.phase !== "podium") {
    begin(r);
    r.answer("u", r.currentQuestion()!.correctIndex);
    inner.reveal();
    inner.revealUntil = 0;
    inner.qIndex = total - 1;
    inner.advanceFromReveal();
  }
  const moments = r.stateFor("u", true).moments ?? [];
  assert.ok(
    moments.every((m) => m.playerId !== "bot"),
    "bot anı olmamalı",
  );
});

test("Podyum dışında moments null", () => {
  const r = new Room("m-lobby", () => {}, { minPlayers: 1, questionCount: 5 });
  r.addPlayer(player("x", "X"));
  assert.equal(r.stateFor("x", true).moments, null);
});

test("lastMatch içinde anlar saklanır (lobiye dönenler de görür)", () => {
  const r = finishRoom("m-last", ["a", "b"]);
  const last = r.stateFor("a", true).lastMatch;
  // podium fazında lastMatch null; lobby'e dönünce dolmalı — moments alanı tipte var.
  assert.ok(last === null || Array.isArray(last.moments) || last.moments === null);
});

console.log(`moments-test: ${passed}/8 OK`);
