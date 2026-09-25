/**
 * Kelime Oyunu sözleşme testi. Doğrudan Room'a sürer (socket yok) —
 * tavanda `circle-test`'le aynı pattern.
 */
import { strict as assert } from "node:assert";
import { Room } from "../src/rooms";
import { GameError } from "../src/errors";
import { GAME } from "../src/config";
import { sampleWordPrompts } from "../src/circle";

function player(id: string): Parameters<Room["addPlayer"]>[0] {
  return { id, name: id, avatarUrl: null, socketId: null, isBot: false };
}
function ready(room: Room, ...ids: string[]) {
  for (const id of ids) room.setReady(id, true);
}
function stop(room: Room) {
  (room as unknown as { clearTimer(): void }).clearTimer();
}
const inner = (room: Room) => room as unknown as { beginQuestion(): void };
function next(room: Room) {
  (room as unknown as { revealUntil: number }).revealUntil = 0;
  (room as unknown as { advanceFromReveal(): void }).advanceFromReveal();
}
const stateOf = (room: Room, id: string) => room.stateFor(id, false);

// 1) Yalnızca host mod seçebilir; word seçimi geçerli.
{
  const room = new Room("w1", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  assert.throws(
    () => room.setGameMode("a", "word"),
    (e: unknown) => e instanceof GameError && e.key === "err.modeHostOnly",
  );
  room.setGameMode("host", "word");
  assert.equal(stateOf(room, "a").gameMode, "word");
  stop(room);
}

// 2) Maç word havuzundan beslenir: round.total = WORD_ROUNDS, word payload maskeli.
{
  const room = new Room("w2", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  const state = stateOf(room, "a");
  assert.equal(state.phase, "question");
  assert.equal(state.round.total, GAME.WORD_ROUNDS);
  assert.ok(state.word, "word payload");
  assert.equal(state.question, null, "word'de klasik soru yok");
  assert.ok(state.word!.letters.length >= 4 && state.word!.letters.length <= 10);
  assert.ok(
    state.word!.letters.every((ch) => ch === null),
    "tur başında tümü kapalı",
  );
  assert.equal(state.word!.value, state.word!.letters.length * GAME.WORD_LETTER_POINTS);
  assert.ok(state.word!.poolMs > 0 && state.word!.poolMs <= GAME.WORD_POOL_MS);
  stop(room);
}

// 3) "harf al" tek harf açar ve değeri 100 düşürür.
{
  const room = new Room("w3", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.addPlayer(player("c"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  const before = stateOf(room, "a").word!;
  const openBefore = before.letters.filter(Boolean).length;
  room.wordLetter("a");
  const after = stateOf(room, "a").word!;
  const openAfter = after.letters.filter(Boolean).length;
  assert.equal(openAfter, openBefore + 1);
  assert.equal(after.value, before.value - GAME.WORD_LETTER_POINTS);
  // Aynı pozisyon herkese açık (host da aynı maskeyi görür).
  assert.deepEqual(stateOf(room, "host").word!.letters, after.letters);
  stop(room);
}

// 4) Doğru cevap o ANKİ değeri dondurur: sonra harf açılsa da erken cevaplayan korur.
{
  const room = new Room("w4", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.addPlayer(player("c"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  const prompt = (room as unknown as { currentWordPrompt(): { answer: string } }).currentWordPrompt();
  room.wordAnswer("host", prompt.answer); // hiç harf açılmadan
  room.wordLetter("a"); // sonra a harf ister
  room.wordAnswer("a", prompt.answer); // a 1 harf açıkken bilir
  room.reveal();
  const state = stateOf(room, "a");
  assert.equal(state.phase, "reveal");
  assert.ok(state.wordReveal);
  const hostGain = state.wordReveal!.gains["host"];
  const aGain = state.wordReveal!.gains["a"];
  assert.equal(hostGain, prompt.answer.length * GAME.WORD_LETTER_POINTS);
  assert.equal(aGain, (prompt.answer.length - 1) * GAME.WORD_LETTER_POINTS);
  assert.ok(hostGain > aGain);
  stop(room);
}

// 5) Yanlış cevap kilitler (tekrar yazamaz), puan almaz.
{
  const room = new Room("w5", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.addPlayer(player("c"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  room.wordAnswer("host", "kesinlikle yanlış");
  assert.equal(stateOf(room, "host").yourWordAnswer, "kesinlikle yanlış");
  room.wordAnswer("host", "başka deneme");
  assert.equal(stateOf(room, "host").yourWordAnswer, "kesinlikle yanlış");
  room.reveal();
  assert.equal(stateOf(room, "host").wordReveal!.gains["host"], 0);
  stop(room);
}

// 6) Son harf asla açılmaz + harf-alma kişi başı WORD_LETTER_CAP ile sınırlı.
{
  const room = new Room("w6", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  for (const id of ["a", "b", "c", "d", "e"]) room.addPlayer(player(id));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  const len = stateOf(room, "a").word!.letters.length;
  // Kişi başı cap: tek oyuncu WORD_LETTER_CAP'den fazla harf açamaz.
  for (let i = 0; i < 10; i++) room.wordLetter("a");
  const afterCap = stateOf(room, "a").word!.letters.filter(Boolean).length;
  assert.equal(afterCap, GAME.WORD_LETTER_CAP, "tek oyuncu cap'te durur");
  // Cevabını kilitleyen artık harf alamaz.
  room.wordAnswer("host", "yanlis");
  for (let i = 0; i < 3; i++) room.wordLetter("host");
  assert.equal(stateOf(room, "a").word!.letters.filter(Boolean).length, afterCap, "kilitli oyuncu harf açamaz");
  // Yeterli oyuncu dönüşümlü alınca son harf yine de açılmaz.
  const others = ["a", "b", "c", "d", "e"];
  for (let i = 0; i < len * 2; i++) room.wordLetter(others[i % others.length]);
  const letters = stateOf(room, "a").word!.letters;
  assert.equal(
    letters.filter(Boolean).length,
    Math.min(len - 1, others.length * GAME.WORD_LETTER_CAP),
    "en az bir harf kapalı kalır",
  );
  stop(room);
}

// 7) Ortak havuz tükenince maç kalan turları oynamadan biter.
{
  const room = new Room("w7", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.addPlayer(player("c"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  // Havuzu elle sıfırla -> reveal'dan sonra advanceFromReveal finish'e gider.
  (room as unknown as { wordPoolMs: number }).wordPoolMs = 0;
  room.reveal();
  next(room);
  assert.equal(stateOf(room, "a").phase, "podium");
  stop(room);
}

// 8) Maç ortasında katılan beklemede kalır; cevap yazamaz.
{
  const room = new Room("w8", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  room.addPlayer(player("late"));
  room.wordAnswer("late", "x");
  assert.equal(stateOf(room, "late").yourWordAnswer, null);
  stop(room);
}

// 9) İstemci ham cevabı görmez: letters maskesi, reveal öncesi answer alanı yok.
{
  const room = new Room("w9", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  room.setGameMode("host", "word");
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "word");
  inner(room).beginQuestion();
  const raw = JSON.stringify(stateOf(room, "a").word);
  const prompt = (room as unknown as { currentWordPrompt(): { answer: string } }).currentWordPrompt();
  assert.ok(!raw.includes(prompt.answer), "kapalı cevap payload'a sızmasın");
  stop(room);
}

// 9b) Havuz sözleşmesi: örneklenen hiçbir prompt ipucunda/kategoride cevabı sızdırmasın
// (tohumdan bağımsız — w9'un rastgele yakaladığı kusurun kalıcı regresyonu).
{
  const sample = sampleWordPrompts();
  assert.ok(sample.length > 0, "kelime havuzu boş olmasın");
  for (const p of sample) {
    const hay = `${p.clue} ${p.clueEn ?? ""} ${p.category}`.toLowerCase();
    assert.ok(!hay.includes(p.answer.toLowerCase()), `ipucu TR cevabı sızdırmasın: ${p.answer}`);
    assert.ok(!(p.answerEn && hay.includes(p.answerEn.toLowerCase())), `ipucu EN cevabı sızdırmasın: ${p.answerEn}`);
  }
}

// 10) wordLetter/ wordAnswer diğer modlarda no-op.
{
  const room = new Room("w10", () => {}, { minPlayers: 2 });
  room.addPlayer(player("host"));
  room.addPlayer(player("a"));
  ready(room, ...[...room.players.keys()].filter((id) => id !== "host"));
  room.start("host", "classic");
  inner(room).beginQuestion();
  room.wordLetter("a");
  room.wordAnswer("a", "x");
  assert.equal(stateOf(room, "a").word, null);
  assert.equal(stateOf(room, "a").yourWordAnswer, null);
  stop(room);
}

console.log("word-test: 10/10 geçti");
