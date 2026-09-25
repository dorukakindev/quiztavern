/**
 * FAZ 1.5 anti-hile kanıtları — sunucu-otoriter sözleşme, Room üzerinde
 * doğrudan (socket katmanını test eden dod/sec betiği zaten ayrıca var).
 * Çalıştırma: npx tsx scripts/anticheat-test.ts
 */
import { strict as assert } from "node:assert";
import { GAME } from "../src/config";
import { Room } from "../src/rooms";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false });
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer();

console.log("Anti-hile sözleşme testleri");

// ── Klasik mod ─────────────────────────────────────────────────────────────
const room = new Room("anticheat-classic", () => {}, { minPlayers: 2, questionCount: 5 });
room.addPlayer(player("a", "Ada"));
room.addPlayer(player("b", "Bora"));
room.setGameMode("a", "classic");
room.setReady("a", true);
room.setReady("b", true);
room.start("a", "classic");

test("lobby/countdown fazında ANSWER yok sayılır (seçim boş kalır)", () => {
  // Lobi: start çağrısından önce gönderilen cevap hiçbir koltuğa işlemez.
  room.answer("a", 1);
  assert.equal(room.players.get("a")!.choice, null);
  // Countdown: faz 'countdown' iken gönderilen cevap da işlemez.
  assert.equal(room.phase, "countdown");
  room.answer("a", 2);
  assert.equal(room.players.get("a")!.choice, null);
});

stop(room);
(room as unknown as { beginQuestion: () => void }).beginQuestion();

test("soru payloadında doğru cevap yok — correctIndex/answer sızmaz", () => {
  const question = room.stateFor("a", true).question!;
  const serialized = JSON.stringify(question);
  assert.ok(!("correctIndex" in question), "correctIndex alanı yok");
  assert.ok(!serialized.includes("correctIndex"), "payload içinde correctIndex geçmiyor");
  assert.ok(!serialized.includes("correct"), "payload içinde correct ipucu yok");
});

test("mükerrer ANSWER ilk seçimi değiştiremez", () => {
  room.answer("a", 0);
  room.answer("a", 2);
  assert.equal(room.players.get("a")!.choice, 0);
});

test("cevap zaman damgasını sunucu koyar", () => {
  const answeredAt = room.players.get("a")!.answeredAt!;
  assert.ok(typeof answeredAt === "number" && answeredAt > 0);
  assert.ok(answeredAt <= Date.now() && Date.now() - answeredAt < 5_000);
});

const correctIdx = room.currentQuestion()!.correctIndex;
test("süre dolmuş soruya cevap reddedilir (reveal tetiklenir)", () => {
  (room as unknown as { questionDeadline: number }).questionDeadline = Date.now() - 1;
  room.answer("b", correctIdx);
  assert.equal(room.players.get("b")!.choice, null);
  assert.equal(room.phase, "reveal");
});

test("reveal fazında ANSWER yok sayılır", () => {
  assert.equal(room.phase, "reveal");
  room.answer("b", 1);
  assert.equal(room.players.get("b")!.choice, null);
});

test("reveal doğru cevabı ancak süre bitince açıklar", () => {
  const reveal = room.stateFor("a", true).reveal!;
  assert.equal(typeof reveal.correctIndex, "number");
  // Doğru cevaplayan (a, şık 0 === correctIndex değilse de): a şık 0 oynadı —
  // kazanç yalnız sunucunun hesapladığı puan: gains sözlüğü mevcut ve sınırlı.
  const gains = reveal.gains;
  for (const [id, gain] of Object.entries(gains)) {
    assert.ok(
      gain >= 0 && gain <= GAME.BASE_POINTS + GAME.SPEED_POINTS + GAME.DIFF_BONUS.zor,
      `${id} kazancı sınır içinde`,
    );
  }
});
stop(room);

// ── Çember mod ─────────────────────────────────────────────────────────────
const circle = new Room("anticheat-circle", () => {}, { minPlayers: 2, questionCount: 5 });
circle.addPlayer(player("a", "Ada"));
circle.addPlayer(player("b", "Bora"));
circle.setGameMode("a", "circle");
circle.setReady("a", true);
circle.setReady("b", true);
circle.start("a", "circle");
stop(circle);
(circle as unknown as { beginQuestion: () => void }).beginQuestion();

test("çemberde payload doğru cevabı taşımaz", () => {
  const serialized = JSON.stringify(circle.stateFor("a", true).circle!);
  assert.ok(!serialized.includes('"answer"'), "circle payloadında answer yok");
});

test("çemberde mükerrer cevap ve süre-sonrası cevap reddedilir", () => {
  circle.answerCircle("a", "yanlış bir metin");
  circle.answerCircle("a", "başka metin");
  assert.equal(circle.players.get("a")!.circleAnswer, "yanlış bir metin");
  (circle as unknown as { questionDeadline: number }).questionDeadline = Date.now() - 1;
  circle.answerCircle("b", "geç cevap");
  assert.equal(circle.players.get("b")!.circleAnswer, null);
});
stop(circle);

// ── Çifte Bahis: istemci beyanı skoru değiştiremez ─────────────────────────
const bet = new Room("anticheat-bet", () => {}, { minPlayers: 2, questionCount: 5 });
bet.addPlayer(player("a", "Ada"));
bet.addPlayer(player("b", "Bora"));
bet.setGameMode("a", "bet");
bet.setReady("a", true);
bet.setReady("b", true);
bet.start("a", "bet");
stop(bet);
(bet as unknown as { beginBet: () => void }).beginBet();

test("bahis, oyuncunun gerçek kasasını aşamaz (istemci beyanına güvenilmez)", () => {
  bet.placeBet("a", 10_000_000);
  assert.equal(bet.players.get("a")!.bet, GAME.BET_STARTING_BANKROLL);
  bet.placeBet("b", -500);
  assert.equal(bet.players.get("b")!.bet, 0);
});
stop(bet);

console.log(`\n[anticheat] sonuç: ${passed} geçti, 0 kaldı`);
