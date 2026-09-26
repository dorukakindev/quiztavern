import { strict as assert } from "node:assert";
import { GAME } from "../src/config";
import { GameError } from "../src/errors";
import { Room } from "../src/rooms";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false });
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer();
const inner = (room: Room) =>
  room as unknown as {
    beginQuestion: () => void;
    finish: () => void;
    advanceFromReveal: () => void;
  };
// Reveal deadline'ını geçmişe çekip bir sonraki tura geçer (advanceFromReveal
// süre dolmadan erken çıkar; test zamanı beklemez).
const next = (room: Room) => {
  room.revealUntil = 0;
  inner(room).advanceFromReveal();
};

console.log("Son Masa (eleme) regresyonları");

const room = new Room("elim-1", () => {}, { minPlayers: 2, questionCount: 10 });
room.addPlayer(player("a", "Ada"));
room.addPlayer(player("b", "Bora"));
room.addPlayer(player("c", "Cem"));

test("host olmayan modu değiştiremez; geçersiz mod reddedilir", () => {
  assert.throws(
    () => room.setGameMode("b", "elim"),
    (e: unknown) => e instanceof GameError && e.key === "err.modeHostOnly",
  );
  assert.throws(
    () => room.setGameMode("a", "hurd"),
    (e: unknown) => e instanceof GameError && e.key === "err.modeInvalid",
  );
});

room.setGameMode("a", "elim");
room.setReady("a", true);
room.setReady("b", true);
room.setReady("c", true);
room.start("a", "elim");
stop(room);

test("maç başında herkes 3 canlıdır", () => {
  const state = room.stateFor("a", true);
  for (const p of state.players) assert.equal(p.lives, GAME.ELIM_LIVES);
});

inner(room).beginQuestion();
stop(room);

// a doğru, b yanlış, c cevapsız → b ve c 1 can kaybeder
const q1 = room.currentQuestion()!;
room.answer("a", q1.correctIndex);
room.answer("b", (q1.correctIndex + 1) % 4);
(room as unknown as { reveal: () => void }).reveal();

test("yanlış ve cevapsız 1 can götürür; doğru can tutar", () => {
  assert.equal(room.players.get("a")!.lives, 3);
  assert.equal(room.players.get("b")!.lives, 2);
  assert.equal(room.players.get("c")!.lives, 2);
});

// İki tur daha: b her seferinde yanlış → elenir
for (let i = 0; i < 2; i++) {
  next(room);
  const q = room.currentQuestion()!;
  room.answer("a", q.correctIndex);
  room.answer("b", (q.correctIndex + 1) % 4);
  room.answer("c", q.correctIndex);
  (room as unknown as { reveal: () => void }).reveal();
}

test("canı biten oyuncu elenir (lives = 0)", () => {
  assert.equal(room.players.get("b")!.lives, 0);
  const state = room.stateFor("a", true);
  assert.equal(state.players.find((p) => p.id === "b")!.lives, 0);
});

next(room);

test("elenen oyuncu cevap veremez", () => {
  room.answer("b", 0);
  assert.equal(room.players.get("b")!.choice, null);
});

test('elenen oyuncu "beklenenler" arasına girmez (erken reveal engellemesi yok)', () => {
  const q = room.currentQuestion()!;
  room.answer("a", q.correctIndex);
  // c henüz cevaplamadı ama bağlı; erken reveal'ı engellememek için b'nin
  // dışlanması doğru — tur ancak herkes cevaplayınca biter.
  assert.equal(room.phase, "question");
  room.answer("c", q.correctIndex);
  assert.equal(room.phase, "reveal"); // bağlı herkes cevapladı → beklemeden reveal
});

// c yanlış, a doğru → c 1 can kaybeder; a ve c hâlâ canlı
next(room);

// a elenip gidince maç hemen biter (≤1 canlı)
const room2 = new Room("elim-2", () => {}, { minPlayers: 2, questionCount: 10 });
room2.addPlayer(player("x", "Xen"));
room2.addPlayer(player("y", "Yon"));
room2.setGameMode("x", "elim");
room2.setReady("x", true);
room2.setReady("y", true);
room2.start("x", "elim");
stop(room2);
inner(room2).beginQuestion();

// y üç kez üst üste yanlış → 0 can; x 3 canlı kalır → maç biter
for (let i = 0; i < 3; i++) {
  const q = room2.currentQuestion()!;
  room2.answer("x", q.correctIndex);
  room2.answer("y", (q.correctIndex + 1) % 4);
  (room2 as unknown as { reveal: () => void }).reveal();
  next(room2);
}

test("tek canlı kalınca maç podyuma çıkar", () => {
  assert.equal(room2.players.get("y")!.lives, 0);
  assert.equal(room2.phase, "podium");
});

test("podyum birincisi hayatta kalan oyuncudur", () => {
  const podium = room2.stateFor("x", true).podium!;
  assert.equal(podium[0].id, "x");
  assert.equal(podium[1].id, "y");
});

// Herkes aynı turda elenirse de maç biter (kimse kalamazsa sonuç yine de düşer)
const room3 = new Room("elim-3", () => {}, { minPlayers: 2, questionCount: 10 });
room3.addPlayer(player("m", "Mel"));
room3.addPlayer(player("n", "Nil"));
room3.setGameMode("m", "elim");
room3.setReady("m", true);
room3.setReady("n", true);
room3.players.get("m")!.lives = 1;
room3.players.get("n")!.lives = 1;
inner(room3).beginQuestion();
const q3 = room3.currentQuestion()!;
room3.answer("m", (q3.correctIndex + 1) % 4);
room3.answer("n", (q3.correctIndex + 1) % 4);
(room3 as unknown as { reveal: () => void }).reveal();
next(room3);

test("aynı turda herkes elenirse maç yine de biter (podium)", () => {
  assert.equal(room3.phase, "podium");
});
stop(room3);

// Maç ortası gelen oyuncu bu maça alınmaz
const room4 = new Room("elim-4", () => {}, { minPlayers: 2, questionCount: 10 });
room4.addPlayer(player("p", "Pia"));
room4.addPlayer(player("r", "Ren"));
room4.setGameMode("p", "elim");
room4.setReady("p", true);
room4.setReady("r", true);
room4.start("p", "elim");
stop(room4);
inner(room4).beginQuestion();

test("maç ortasında katılan oyuncu bu maça giremez (waiting)", () => {
  room4.addPlayer(player("z", "Zey"));
  assert.ok(room4.players.get("z")!.eligibleFrom > room4.qIndex);
  const state = room4.stateFor("z", true);
  assert.equal(state.players.find((p) => p.id === "z")!.waiting, true);
});
stop(room4);

// Countdown'da katılan oyuncu can dağıtımını kaçırır — bu maçı izler.
const room5 = new Room("elim-5", () => {}, { minPlayers: 2, questionCount: 10 });
room5.addPlayer(player("p", "Pia"));
room5.addPlayer(player("q", "Qua"));
room5.setGameMode("p", "elim");
room5.setReady("p", true);
room5.setReady("q", true);
room5.start("p", "elim");
const cdJoiner = room5.addPlayer(player("cd", "Cedi"));

test("countdown katılımcısı 0 canlı hayalet olmaz — bu maçı izler", () => {
  assert.ok(cdJoiner.eligibleFrom >= room5.roundLimit, "izleyici");
});
stop(room5);

// Ani ölüm: tam 2 kişi kalınca tur süresi ELIM_SUDDEN_MS'e iner.
const roomSd = new Room("elim-sd", () => {}, { minPlayers: 2, questionCount: 10 });
roomSd.addPlayer(player("x", "Xi"));
roomSd.addPlayer(player("y", "Yi"));
roomSd.addPlayer(player("z", "Zed"));
roomSd.setGameMode("x", "elim");
roomSd.setReady("x", true);
roomSd.setReady("y", true);
roomSd.setReady("z", true);
roomSd.start("x", "elim");
stop(roomSd);

test("3 canlıda süre normal, 2'ye düşünce ani ölüm süresi", () => {
  const int = roomSd as unknown as { players: Map<string, { lives: number }> };
  assert.ok(roomSd.questionDuration() > GAME.ELIM_SUDDEN_MS, "3 kişi normal süre");
  int.players.get("z")!.lives = 0;
  assert.equal(roomSd.questionDuration(), GAME.ELIM_SUDDEN_MS, "ani ölüm");
  int.players.get("y")!.lives = 0;
  assert.ok(roomSd.questionDuration() > GAME.ELIM_SUDDEN_MS, "tek kişi normal süre");
});
stop(roomSd);

// Havuz bittiğinde öndeki ikilinin canı eşitse ani ölüm sorusu oynanır.
const room6 = new Room("elim-6", () => {}, { minPlayers: 2, questionCount: 10 });
room6.addPlayer(player("x", "Xi"));
room6.addPlayer(player("y", "Yi"));
room6.setGameMode("x", "elim");
room6.setReady("x", true);
room6.setReady("y", true);
room6.start("x", "elim");
stop(room6);
const i6 = room6 as unknown as {
  qIndex: number;
  roundLimit: number;
  questions: { correctIndex: number }[];
  players: Map<string, { lives: number }>;
};
i6.qIndex = i6.roundLimit; // havuz bitti — ikisi de 3 canlı (eşit)
inner(room6).beginQuestion();

test("havuz bitip canlar eşitse ani ölüm ek soru örneklenir", () => {
  assert.equal(room6.phase, "question");
  assert.equal(i6.roundLimit, 11);
  assert.equal(i6.questions.length, 11);
});

// Ani ölüm turu: y yanlış → 1 can kaybeder (3→2); beraberlik bozulduğu için
// bir sonraki beginQuestion havuz bittiğinde podyuma çıkar.
const sdQ = room6.currentQuestion()!;
room6.answer("x", sdQ.correctIndex);
room6.answer("y", (sdQ.correctIndex + 1) % 4);
(room6 as unknown as { reveal: () => void }).reveal();
next(room6);

test("ani ölüm turu beraberliği bozar ve maç podyuma çıkar", () => {
  assert.equal(i6.players.get("y")!.lives, 2);
  assert.equal(room6.phase, "podium");
});
stop(room6);

// Canlar eşit değilse havuz bitince sessiz tiebreak yok — önde olan kazanır.
const room7 = new Room("elim-7", () => {}, { minPlayers: 2, questionCount: 10 });
room7.addPlayer(player("x", "Xi"));
room7.addPlayer(player("y", "Yi"));
room7.setGameMode("x", "elim");
room7.setReady("x", true);
room7.setReady("y", true);
room7.start("x", "elim");
stop(room7);
const i7 = room7 as unknown as {
  qIndex: number;
  roundLimit: number;
  players: Map<string, { lives: number }>;
};
i7.players.get("y")!.lives = 1; // x=3, y=1 → eşit değil
i7.qIndex = i7.roundLimit;
inner(room7).beginQuestion();

test("havuz bitip canlar farklıysa maç doğrudan podyuma çıkar", () => {
  assert.equal(room7.phase, "podium");
});
stop(room7);

stop(room);
stop(room2);
console.log(`\n[elim] sonuç: ${passed} geçti, 0 kaldı`);
