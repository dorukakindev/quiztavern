import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Room } from "../src/rooms";
import { createDailyStore, dailyDateKey, dailyDayNumber, dailyPattern, dailyQuestions, dailyShareText, DAILY_QUESTION_COUNT } from "../src/daily";

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}`); throw error; }
}

const player = (id: string) => ({ id, name: id, avatarUrl: null, socketId: `s-${id}`, isBot: false });
const stop = (room: Room) => (room as unknown as { clearTimer(): void }).clearTimer();
const readyAll = (room: Room) => { for (const id of room.players.keys()) room.setReady(id, true); };

test("aynı gün aynı sorular: tarih tohumu deterministiktir", () => {
  const day = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
  const a = dailyQuestions(day);
  const b = dailyQuestions(day);
  const c = dailyQuestions(new Date(Date.UTC(2026, 8, 22, 23, 59, 59))); // aynı UTC günü
  const next = dailyQuestions(new Date(Date.UTC(2026, 8, 23, 0, 0, 1)));
  assert.equal(a.length, DAILY_QUESTION_COUNT);
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.deepEqual(a.map((q) => q.id), c.map((q) => q.id));
  assert.notDeepEqual(a.map((q) => q.id), next.map((q) => q.id));
  assert.equal(new Set(a.map((q) => q.id)).size, a.length); // tekrar yok
});

test("gün numarası epoch'tan sayılır ve paylaşım metni biçimli", () => {
  assert.equal(dailyDayNumber(new Date(Date.UTC(2026, 0, 1, 0, 0, 0))), 1);
  assert.equal(dailyDayNumber(new Date(Date.UTC(2026, 8, 22, 10, 0, 0))), 265);
  assert.equal(dailyDateKey(new Date(Date.UTC(2026, 8, 22, 10, 0, 0))), "2026-09-22");
  assert.equal(dailyShareText(42, "🟩🟩🟥🟩🟩"), "🟩🟩🟥🟩🟩 Triviara #42");
});

test("desen: doğru 🟩, yanlış 🟥, cevapsız ⬜", () => {
  const questions = dailyQuestions(new Date());
  const answers = questions.map((q) => q.correctIndex);
  assert.equal(dailyPattern(answers, questions), "🟩".repeat(questions.length));
  const mixed = [questions[0].correctIndex, (questions[1].correctIndex + 1) % 4, null, questions[3].correctIndex, 0] as (number | null)[];
  mixed[4] = questions[4].correctIndex === 0 ? 1 : 0;
  assert.equal(dailyPattern(mixed, questions), "🟩🟥⬜🟩🟥");
});

test("depo: kullanıcı+gün tek kayıt; has() tekrar kapısını sürer", () => {
  const store = createDailyStore(":memory:");
  assert.equal(store.has("u1", 265), false);
  store.record({ day: 265, userId: "u1", name: "u1", pattern: "🟩🟩🟥🟩🟩", score: 2100 });
  assert.equal(store.has("u1", 265), true);
  assert.equal(store.has("u1", 266), false);
  assert.equal(store.has("u2", 265), false);
  store.record({ day: 265, userId: "u1", name: "u1", pattern: "🟥🟥🟥🟥🟥", score: 0 }); // UNIQUE ezer, ilk kayıt kalır
  const rows = store.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pattern, "🟩🟩🟥🟩🟩");
  store.close();
});

test("günlük maç: 5 soru, klasik kurallar, state.daily taşınır", () => {
  const room = new Room("r-daily", () => {}, { minPlayers: 1, questionCount: 10 });
  try {
    room.join(player("host")); room.join(player("p2"));
    readyAll(room);
    room.gameMode = "lightning"; // günlük mod seçimini ezer: klasik kurallar
    room.start("host", "lightning", { daily: true, completed: () => false });
    assert.equal(room.gameMode, "classic");
    assert.equal(room.phase, "countdown");
    assert.equal(room.questions.length, DAILY_QUESTION_COUNT);
    const state = room.stateFor("host", true);
    assert.deepEqual(state.daily, { day: dailyDayNumber(), pattern: null });
    assert.equal(state.round.total, DAILY_QUESTION_COUNT);
    // Aynı gün üretilen set ile maç soruları birebir aynı.
    assert.deepEqual(room.questions.map((q) => q.id), dailyQuestions().map((q) => q.id));
  } finally { stop(room); }
});

test("bugün tamamlayan oyuncu izleyiciye iner; herkes tamamladıysa err.dailyDone", () => {
  const room = new Room("r-done", () => {}, { minPlayers: 1, questionCount: 10 });
  try {
    room.join(player("host")); room.join(player("p2")); room.join(player("p3"));
    readyAll(room);
    room.start("host", "classic", { daily: true, completed: (id) => id === "p2" });
    const state = room.stateFor("p2", true);
    assert.equal(state.youAreSpectator, true);
    assert.equal(state.players.some((p) => p.id === "p2"), false);
    stop(room);

    // Tamamen tamamlanmış masa başlatamaz.
    const room2 = new Room("r-alldone", () => {}, { minPlayers: 1, questionCount: 10 });
    try {
      room2.join(player("a")); readyAll(room2);
      assert.throws(() => room2.start("a", "classic", { daily: true, completed: () => true }), /err\.dailyDone/);
      assert.equal(room2.players.has("a"), true); // hata fırlatınca koltuk yerinde kalır
    } finally { stop(room2); }
  } finally { stop(room); }
});

test("maç sonu desenleri üretilir ve onDailyFinished kancası ateşlenir", () => {
  const room = new Room("r-finish", () => {}, { minPlayers: 1, questionCount: 10 });
  try {
    room.join(player("solo")); readyAll(room);
    let entries: { userId: string; pattern: string; score: number; day: number }[] = [];
    room.onDailyFinished = (list) => { entries = list; };
    room.start("solo", "classic", { daily: true, completed: () => false });
    assert.equal(entries.length, 0); // henüz podyum yok
    // Tur geçmişi answers dizisinde birikir: 0. soru doğru, 1. yanlış.
    const p = room.players.get("solo")!;
    p.answers[0] = room.questions[0].correctIndex;
    p.answers[1] = (room.questions[1].correctIndex + 1) % 4;
    (room as unknown as { finish(): void }).finish();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].userId, "solo");
    assert.equal(entries[0].day, dailyDayNumber());
    assert.equal([...entries[0].pattern].slice(0, 2).join(""), "🟩🟥");
    assert.equal([...entries[0].pattern].length, DAILY_QUESTION_COUNT);
    const state = room.stateFor("solo", true);
    assert.equal(state.daily?.pattern, entries[0].pattern);
  } finally { stop(room); }
});

test("lider tablosu: skor sırası, kendi sırası ve seri", () => {
  const store = createDailyStore(":memory:");
  try {
    const day = dailyDayNumber();
    store.record({ day, userId: "a", name: "Ayşe", pattern: "🟩🟩🟩🟩🟩", score: 500 });
    store.record({ day, userId: "b", name: "Bora", pattern: "🟩🟥🟩⬜🟩", score: 300 });
    store.record({ day, userId: "c", name: "Cem", pattern: "🟥🟥⬜🟩🟥", score: 100 });
    const leaders = store.leaders(day, 5);
    assert.equal(leaders.length, 3);
    assert.deepEqual(leaders.map((row) => row.userId), ["a", "b", "c"]);
    assert.equal(leaders[0].rank, 1);
    assert.equal(leaders[0].name, "Ayşe");
    assert.equal(store.userRank("b", day), 2);
    assert.equal(store.userRank("yok", day), null);
    // Seri: bugün + önceki 2 gün art arda = 3; bir gün boşluk kırar.
    store.record({ day: day - 1, userId: "a", name: "Ayşe", pattern: "🟩🟩🟩🟩🟩", score: 400 });
    store.record({ day: day - 2, userId: "a", name: "Ayşe", pattern: "🟩🟩🟩🟩🟩", score: 400 });
    store.record({ day: day - 4, userId: "a", name: "Ayşe", pattern: "🟩🟩🟩🟩🟩", score: 400 });
    assert.equal(store.streak("a", day), 3);
    // Bugün de oynamışsa seri bugün dahil sayılır.
    store.record({ day: day - 1, userId: "b", name: "Bora", pattern: "🟩🟩🟩🟩🟩", score: 200 });
    store.record({ day: day - 2, userId: "b", name: "Bora", pattern: "🟩🟩🟩🟩🟩", score: 200 });
    assert.equal(store.streak("b", day), 3);
    // Bugün oynamamış ama dün başlayan seri de sayılır.
    store.record({ day: day - 1, userId: "d", name: "Derin", pattern: "🟩🟩🟩🟩🟩", score: 200 });
    store.record({ day: day - 2, userId: "d", name: "Derin", pattern: "🟩🟩🟩🟩🟩", score: 200 });
    assert.equal(store.streak("d", day), 2);
    assert.equal(store.streak("yok", day), 0);
  } finally { store.close(); }
});

test("eski şema: name sütunu olmayan veritabanı ALTER ile geçirilir", () => {
  const tmp = join(mkdtempSync(join(tmpdir(), "qt-daily-")), "old.db");
  const raw = new Database(tmp);
  raw.exec(`CREATE TABLE daily_results (id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL,
    user_id TEXT NOT NULL, pattern TEXT NOT NULL, score INTEGER NOT NULL, completed_at INTEGER NOT NULL,
    UNIQUE (user_id, day))`);
  raw.prepare("INSERT INTO daily_results (day, user_id, pattern, score, completed_at) VALUES (1, 'x', '🟩', 10, 1)").run();
  raw.close();
  const store = createDailyStore(tmp);
  try {
    assert.equal(store.list().length, 1); // eski kayıt duruyor
    store.record({ day: 2, userId: "x", name: "Yeni", pattern: "🟩", score: 5 });
    assert.equal(store.leaders(2, 1)[0].name, "Yeni");
    assert.equal(store.leaders(1, 1)[0].name, ""); // eski kayıtta boş ad
  } finally { store.close(); }
});

console.log(`\n[daily] sonuç: ${passed} geçti, 0 kaldı`);
