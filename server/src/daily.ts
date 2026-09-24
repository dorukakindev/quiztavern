import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_QUESTIONS, type Question } from "./questions";
import type { DailyBoard, DailyBoardEntry } from "../../shared/types";

/**
 * Günlük Meydan Okuma: UTC gününe tohumlanmış, DÜNYADA HERKES için aynı
 * 5 soruluk maç. Soru seçimi tarihten türetilir — istemciye ya da odaya özel
 * değildir; farklı sunucu örnekleri aynı havuzla aynı soruları üretir.
 * Günde bir kez: tamamlanan maç `daily_results` tablosuna işlenir ve aynı
 * gün tekrar katılım engellenir (oyuncu izleyici kalır).
 */
export const DAILY_QUESTION_COUNT = 5;
/** 1 Ocak 2026 = Triviara #1 — paylaşım satırındaki gün numarası buradan sayılır. */
const DAILY_EPOCH_MS = Date.UTC(2026, 0, 1);

/** UTC tarih anahtarı — "günde bir kez" sınırı bu günle ölçülür. */
export function dailyDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Epoch'tan bu yana kaçıncı gün (1'den başlar): `Triviara #42` yazısında kullanılır. */
export function dailyDayNumber(now: Date = new Date()): number {
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAILY_EPOCH_MS) / 86_400_000) + 1;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Tarih tohumlu deterministik 5 soru — aynı günde her çağrı aynı diziyi üretir. */
export function dailyQuestions(now: Date = new Date(), pool: Question[] = ALL_QUESTIONS): Question[] {
  const rnd = seededRandom(hashKey(dailyDateKey(now)));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(DAILY_QUESTION_COUNT, shuffled.length));
}

/** Wordle tarzı sonuç satırı: doğru 🟩, yanlış şık 🟥, cevapsız tur ⬜. */
export function dailyPattern(answers: (number | null)[], questions: Question[]): string {
  return questions.map((question, i) => {
    const answer = answers[i];
    if (answer === null || answer === undefined) return "⬜";
    return answer === question.correctIndex ? "🟩" : "🟥";
  }).join("");
}

export function dailyShareText(day: number, pattern: string): string {
  return `${pattern} Triviara #${day}`;
}

export interface DailyResultEntry {
  day: number;
  userId: string;
  /** Görünen ad — tablo satırında saklanır; xp.db'deki isim değişse bile
      günün kaydı o günkü adla listelenir. */
  name: string;
  pattern: string;
  score: number;
}

export type { DailyBoard, DailyBoardEntry };

export interface DailyStore {
  /** Oyuncu BUGÜN bir günlük maç tamamladı mı — tekrar katılım kapısı bununla durur. */
  has(userId: string, day: number): boolean;
  record(entry: DailyResultEntry): void;
  list(): (DailyResultEntry & { id: number; completedAt: number })[];
  /** Günün en iyi skorları — önce skor, sonra bitiriş sırası. */
  leaders(day: number, limit: number): DailyBoardEntry[];
  /** İzleyenin gün içi sırası; oynamadıysa null. */
  userRank(userId: string, day: number): number | null;
  /** Üst üste oynanan gün sayısı; bugün oynanmadıysa dünden geriye sayar. */
  streak(userId: string, day: number): number;
  close(): void;
}

export function createDailyStore(file: string): DailyStore {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS daily_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    pattern TEXT NOT NULL,
    score INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    UNIQUE (user_id, day)
  )`);
  // Eski veritabanları: name sütunu yoksa ekle (sıfır-downtime ALTER).
  const columns = db.prepare("PRAGMA table_info(daily_results)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "name")) {
    db.exec("ALTER TABLE daily_results ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO daily_results (day, user_id, name, pattern, score, completed_at)
    VALUES (@day, @userId, @name, @pattern, @score, @completedAt)`);
  const exists = db.prepare("SELECT 1 FROM daily_results WHERE user_id = ? AND day = ?");
  const selectAll = db.prepare("SELECT id, day, user_id AS userId, name, pattern, score, completed_at AS completedAt FROM daily_results ORDER BY id");
  const leadersQuery = db.prepare(`SELECT user_id AS userId, name, pattern, score FROM daily_results
    WHERE day = ? ORDER BY score DESC, completed_at ASC, user_id ASC LIMIT ?`);
  const myRow = db.prepare("SELECT score, completed_at AS completedAt FROM daily_results WHERE user_id = ? AND day = ?");
  const rankAhead = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM daily_results
    WHERE day = ? AND (score > @score OR (score = @score AND completed_at < @completedAt))`);
  const daysOf = db.prepare("SELECT day FROM daily_results WHERE user_id = ?");
  return {
    has(userId, day) { return exists.get(userId, day) !== undefined; },
    record(entry) { insert.run({ ...entry, completedAt: Date.now() }); },
    list() { return selectAll.all() as (DailyResultEntry & { id: number; completedAt: number })[]; },
    leaders(day, limit) {
      const rows = leadersQuery.all(day, limit) as Omit<DailyBoardEntry, "rank">[];
      return rows.map((row, i) => ({ rank: i + 1, ...row }));
    },
    userRank(userId, day) {
      const row = myRow.get(userId, day) as { score: number; completedAt: number } | undefined;
      if (!row) return null;
      return (rankAhead.get(day, row) as { rank: number }).rank;
    },
    streak(userId, day) {
      const days = new Set((daysOf.all(userId) as { day: number }[]).map((row) => row.day));
      let cursor = days.has(day) ? day : day - 1;
      while (days.has(cursor)) cursor -= 1;
      return day - 1 - cursor + (days.has(day) ? 1 : 0);
    },
    close() { db.close(); },
  };
}

/** Lobideki günlük lider tablosu: ilk beş + izleyenin sırası/serisi. */
export function dailyBoard(store: DailyStore, day: number, userId: string, limit = 5): DailyBoard {
  return {
    day,
    entries: store.leaders(day, limit),
    userRank: store.userRank(userId, day),
    streak: store.streak(userId, day),
  };
}
