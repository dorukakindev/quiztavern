import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * "Bu soru hatalı" bildirimleri. Tek SQLite tablosu; kalıcı dosya
 * `server/data/question-reports.db` (REPORTS_DB_PATH ile ezilebilir).
 * Raporlar oda bağımsız birikir — aynı oyuncu aynı soruyu yalnız bir kez
 * bildirebilir (UNIQUE kısıtı), böylece spam tabloyu şişiremez.
 */
export interface QuestionReport {
  roomId: string;
  userId: string;
  userName: string;
  questionId: string;
  questionText: string;
  category: string;
  note: string;
}

export interface QuestionReportRow extends QuestionReport {
  id: number;
  reportedAt: number;
}

export interface QuestionReportsStore {
  /** Ekler. Döndürülen `duplicate` true ise UNIQUE kısıtı vurdu — satır yazılmadı. */
  report(entry: QuestionReport): { ok: true; duplicate: boolean };
  list(): QuestionReportRow[];
  close(): void;
}

const NOTE_LIMIT = 140;
const TEXT_LIMIT = 400;

const clip = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);

export function createReportsStore(file: string): QuestionReportsStore {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS question_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    category TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    reported_at INTEGER NOT NULL,
    UNIQUE (user_id, question_id)
  )`);
  const insert = db.prepare(`INSERT OR IGNORE INTO question_reports
    (room_id, user_id, user_name, question_id, question_text, category, note, reported_at)
    VALUES (@roomId, @userId, @userName, @questionId, @questionText, @category, @note, @reportedAt)`);
  const selectAll = db.prepare("SELECT id, room_id AS roomId, user_id AS userId, user_name AS userName, question_id AS questionId, question_text AS questionText, category, note, reported_at AS reportedAt FROM question_reports ORDER BY id");
  return {
    report(entry) {
      const result = insert.run({
        roomId: clip(entry.roomId, 64),
        userId: clip(entry.userId, 64),
        userName: clip(entry.userName, 64),
        questionId: clip(entry.questionId, 64),
        questionText: clip(entry.questionText, TEXT_LIMIT),
        category: clip(entry.category, 64),
        note: clip(entry.note, NOTE_LIMIT),
        reportedAt: Date.now(),
      });
      return { ok: true, duplicate: result.changes === 0 };
    },
    list() { return selectAll.all() as QuestionReportRow[]; },
    close() { db.close(); },
  };
}
