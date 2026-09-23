import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  LeagueKey,
  ProgressBadge,
  ProgressSnapshot,
  SeasonBoard,
  XpGain,
} from "../../shared/types";

/**
 * Kalıcı ilerleme meta'sı (XP / seviye / lig / sezon / günlük seri).
 *
 * Tek kalıcı dosya: `server/data/xp.db` (XP_DB_PATH ile ezilebilir).
 * Hesaplamalar tamamen SUNUCUDA yapılır — istemci yalnızca okur; puanı
 * istemcinin beyanı değil masanın otoriter maç sonucu belirler (anti-hile).
 *
 * Sezon = UTC ayı ("YYYY-MM"). Her ayın lider tablosu `season_points`'te
 * ayrı birikir; ay dönünce yeni satırlar açılır, eski ay arşivde kalır.
 */

// ── Ekonomi sabitleri ────────────────────────────────────────────────────
export const XP_MATCH_BASE = 20;        // maçı tamamlayana katılım ödülü
export const XP_PER_CORRECT = 10;
export const XP_STREAK_POINT = 3;       // maç içi en iyi seri başına (10'a kadar)
export const XP_WIN = 50;               // maçı kazanma (tekli) veya takım galibiyeti
export const XP_RUNNER_UP = 25;         // 2.
export const XP_THIRD = 10;             // 3.
export const XP_LEVEL_STEP = 100;       // seviye atlama maliyeti her adımda bu kadar artar

/** Lig eşikleri toplam XP üzerinden — büyükten küçüğe sıralı tutulur. */
export const LEAGUE_THRESHOLDS: readonly { key: LeagueKey; minXp: number }[] = [
  { key: "efsane", minXp: 15_000 },
  { key: "usta", minXp: 6_000 },
  { key: "kalfa", minXp: 2_000 },
  { key: "cirak", minXp: 500 },
  { key: "acemi", minXp: 0 },
];

export function leagueFor(xp: number): LeagueKey {
  for (const tier of LEAGUE_THRESHOLDS) if (xp >= tier.minXp) return tier.key;
  return "acemi";
}

/**
 * Seviye eğrisi: L. seviyeye ulaşmak için toplam 100·(L-1)·L/2 XP gerekir
 * (1→2: 100, 2→3: 300, 3→4: 600 …). Formülün tersinden seviye hesaplanır.
 */
export function levelFor(xp: number): number {
  const level = Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / XP_LEVEL_STEP)) / 2);
  return Math.max(1, level);
}

/** Seviye başlangıcındaki toplam XP tabanı. */
function levelFloor(level: number): number {
  return (XP_LEVEL_STEP * (level - 1) * level) / 2;
}

/** UTC ay anahtarı — sezon sınırları bununla ölçülür. */
export function seasonKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** UTC gün anahtarı — "art arda oynama" serisi bununla ölçülür. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function previousDayKey(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Odanın maç sonunda ilettiği tek oyuncu özeti. `total` = eligible olduğu tur. */
export interface MatchFinishedEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  correct: number;
  total: number;
  bestStreak: number;
  /** Maç içi skor sırası (1 = en yüksek). */
  placement: number;
  /** Tekli modda placement===1; takım modunda galip takımın üyesi. */
  won: boolean;
}

/** Tek maçın XP'si — saf fonksiyon, testlerde de doğrulanır. AFK (total=0) kazanamaz. */
export function xpForMatch(entry: MatchFinishedEntry): number {
  if (entry.total <= 0) return 0;
  let gained = XP_MATCH_BASE + entry.correct * XP_PER_CORRECT;
  gained += Math.min(entry.bestStreak, 10) * XP_STREAK_POINT;
  if (entry.won) gained += XP_WIN;
  if (entry.placement === 2) gained += XP_RUNNER_UP;
  else if (entry.placement === 3) gained += XP_THIRD;
  return gained;
}

export interface XpStore {
  /** Oyuncu kartı rozeti; hiç maç bitirmemişse null. */
  badge(userId: string): ProgressBadge | null;
  /** Tam ilerleme görünümü (XP bar + sezon sırası + günlük seri). */
  snapshot(userId: string, now?: Date): ProgressSnapshot | null;
  /** Maç sonuçlarını kalıcı yazar; oyuncu → kazanım haritası döner. */
  recordMatch(entries: MatchFinishedEntry[], now?: Date): Map<string, XpGain>;
  /** Güncel sezonun ilk `limit` sırası. */
  seasonBoard(limit?: number, now?: Date): SeasonBoard;
  close(): void;
}

interface PlayerRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  xp: number;
  matches: number;
  wins: number;
  correct_total: number;
  best_streak: number;
  streak_days: number;
  last_day: string | null;
}

export function createXpStore(file: string): XpStore {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    correct_total INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_day TEXT,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS season_points (
    user_id TEXT NOT NULL,
    season TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, season)
  )`);

  const getPlayer = db.prepare("SELECT * FROM players WHERE user_id = ?");
  const upsertPlayer = db.prepare(`INSERT INTO players
      (user_id, name, avatar_url, xp, matches, wins, correct_total, best_streak, streak_days, last_day, updated_at)
    VALUES (@userId, @name, @avatarUrl, @xp, @matches, @wins, @correctTotal, @bestStreak, @streakDays, @lastDay, @updatedAt)
    ON CONFLICT(user_id) DO UPDATE SET
      name = @name, avatar_url = @avatarUrl, xp = @xp, matches = @matches, wins = @wins,
      correct_total = @correctTotal, best_streak = @bestStreak, streak_days = @streakDays,
      last_day = @lastDay, updated_at = @updatedAt`);
  const upsertSeason = db.prepare(`INSERT INTO season_points (user_id, season, xp, matches, name)
    VALUES (@userId, @season, @xp, 1, @name)
    ON CONFLICT(user_id, season) DO UPDATE SET xp = xp + @xp, matches = matches + 1, name = @name`);
  const seasonTop = db.prepare(`SELECT sp.user_id AS userId, sp.name AS name, sp.xp AS xp,
      COALESCE(p.xp, sp.xp) AS totalXp
    FROM season_points sp LEFT JOIN players p ON p.user_id = sp.user_id
    WHERE sp.season = ? ORDER BY sp.xp DESC, sp.user_id ASC LIMIT ?`);
  const seasonRank = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM season_points
    WHERE season = ? AND xp > (SELECT xp FROM season_points WHERE user_id = ? AND season = ?)`);
  const seasonRow = db.prepare("SELECT xp FROM season_points WHERE user_id = ? AND season = ?");

  function rowToBadge(row: PlayerRow): ProgressBadge {
    return { level: levelFor(row.xp), league: leagueFor(row.xp) };
  }

  function snapshotFor(userId: string, now: Date): ProgressSnapshot | null {
    const row = getPlayer.get(userId) as PlayerRow | undefined;
    if (!row) return null;
    const level = levelFor(row.xp);
    const season = seasonKey(now);
    const seasonXp = (seasonRow.get(userId, season) as { xp: number } | undefined)?.xp ?? 0;
    const rankRow = seasonXp > 0
      ? (seasonRank.get(season, userId, season) as { rank: number }).rank
      : null;
    return {
      xp: row.xp,
      level,
      league: leagueFor(row.xp),
      intoLevel: row.xp - levelFloor(level),
      levelSize: XP_LEVEL_STEP * level,
      season,
      seasonXp,
      seasonRank: rankRow,
      streakDays: row.streak_days,
    };
  }

  return {
    badge(userId) {
      const row = getPlayer.get(userId) as PlayerRow | undefined;
      return row ? rowToBadge(row) : null;
    },
    snapshot(userId, now = new Date()) {
      return snapshotFor(userId, now);
    },
    recordMatch(entries, now = new Date()) {
      const season = seasonKey(now);
      const today = dayKey(now);
      const yesterday = previousDayKey(now);
      const gains = new Map<string, XpGain>();
      const writeAll = db.transaction(() => {
        for (const entry of entries) {
          const gained = xpForMatch(entry);
          if (gained <= 0) continue;
          const row = getPlayer.get(entry.userId) as PlayerRow | undefined;
          const oldXp = row?.xp ?? 0;
          const oldLevel = levelFor(oldXp);
          const oldLeague = leagueFor(oldXp);
          const xp = oldXp + gained;
          // Günlük seri: bugün zaten sayıldıysa koru; dün oynadıysa +1; yoksa 1'den başla.
          const streakDays = row?.last_day === today
            ? row.streak_days
            : row?.last_day === yesterday ? row.streak_days + 1 : 1;
          upsertPlayer.run({
            userId: entry.userId,
            name: entry.name,
            avatarUrl: entry.avatarUrl,
            xp,
            matches: (row?.matches ?? 0) + 1,
            wins: (row?.wins ?? 0) + (entry.won ? 1 : 0),
            correctTotal: (row?.correct_total ?? 0) + entry.correct,
            bestStreak: Math.max(row?.best_streak ?? 0, entry.bestStreak),
            streakDays,
            lastDay: today,
            updatedAt: now.getTime(),
          });
          upsertSeason.run({ userId: entry.userId, season, xp: gained, name: entry.name });
          const level = levelFor(xp);
          const league = leagueFor(xp);
          gains.set(entry.userId, {
            gained,
            xp,
            level,
            league,
            leveledUp: level > oldLevel,
            leagueChanged: league !== oldLeague,
          });
        }
      });
      writeAll();
      return gains;
    },
    seasonBoard(limit = 5, now = new Date()) {
      const season = seasonKey(now);
      const rows = seasonTop.all(season, limit) as { userId: string; name: string; xp: number; totalXp: number }[];
      return {
        season,
        entries: rows.map((row, i) => ({
          rank: i + 1,
          userId: row.userId,
          name: row.name,
          xp: row.xp,
          league: leagueFor(row.totalXp),
        })),
      };
    },
    close() { db.close(); },
  };
}
