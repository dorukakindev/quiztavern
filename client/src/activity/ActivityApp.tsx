import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { sfx } from "../lib/sfx";
import { storageGet, storageSet } from "../lib/storage";
import {
  CARD_TYPES,
  CIRCLE_COUNTS,
  COUNTLESS_MODES,
  EMOTE_KEYS,
  MODE_CONTRACT,
  LEAGUE_ORDER,
  QUESTION_COUNTS,
  QUESTION_TIMES,
  TABLE_THEMES,
  RECONNECT_GRACE_MS,
  type CardType,
  type CategoryOption,
  type CirclePayload,
  type Difficulty,
  type EmoteKey,
  type GameMode,
  type GameState,
  type LeagueKey,
  type MatchSummary,
  type PodiumEntry,
  type ProgressBadge,
  type ProgressSnapshot,
  type PublicPlayer,
  type NumericQuestionPayload,
  type QuestionPayload,
  type ReviewItem,
  type BadgeKey,
  type TableTheme,
  type WordPayload,
  type XpGain,
} from "../../../shared/types";
import { getDevIdentity, useRealtimeGame, type LiveEmote } from "../lib/realtime";
import { useDiscordActivity } from "./useDiscordActivity";
import { AmbientShader } from "./AmbientShader";
import {
  I18nContext,
  categoryLabel,
  formatNumber,
  formatPercent,
  translate,
  useI18n,
  type ActivityLanguage,
  type StringKey,
} from "./i18n";
import { MusicToggle, TableBackdrop, TableLogo } from "./TableScenery";
import { PodiumCharacter } from "./PodiumCharacter";
import { CategoryIcon, Icon, type IconName } from "./icons";
import {
  BET_MIN_STAKE_PCT,
  betOptionSpecs,
  bothTeamsPresent,
  isSuddenDeath,
  circleAnswerIsLocked,
  circleInputShouldFocus,
  nextMenuIndex,
  questionIsLocked,
  shortcutIndex,
  isPlainShortcut,
} from "./gameLogic";
import {
  deletePack,
  getPack,
  listPacks,
  savePack,
  uploadPack,
  type PackAuth,
  type PackQuestion,
  type PackUploadResult,
  type QuestionPackMeta,
} from "./packs";

/** Seri alevi: ikon setindeki ateş, sıcak renkte (CSS .qt-flame). */
function FlameIcon() {
  return <Icon name="flame" weight="fill" className="qt-flame" />;
}

/** Lig anahtarı → i18n anahtarı (tek tablo: sunucu lig adını değil anahtarı yollar,
 *  ad her istemcide kendi dilinde yazılır). */
const LEAGUE_KEYS: Record<LeagueKey, StringKey> = {
  acemi: "league.acemi",
  cirak: "league.cirak",
  kalfa: "league.kalfa",
  usta: "league.usta",
  efsane: "league.efsane",
};

/** Kompakt lig+seviye rozeti: lig renginde nokta + "Sv N" (verbose'da lig adı). */
function LeagueBadge({ badge, verbose = false }: { badge: ProgressBadge; verbose?: boolean }) {
  const { t } = useI18n();
  const league = LEAGUE_KEYS[badge.league] ?? "league.acemi";
  return (
    <span className={`qt-league is-${badge.league}`} title={t(league)}>
      <i aria-hidden="true" />
      {verbose ? t(league) : t("progress.level", { n: badge.level })}
    </span>
  );
}

/** Lobide "SENİN KOLTUĞUN" altındaki ince XP şeridi: seviye, lig ve sonraki
 *  seviyeye kalan bar; art-arda-gün serisi varsa küçük alevle gösterilir. */
function XpStrip({
  snapshot,
  title,
  onTitle,
}: {
  snapshot: ProgressSnapshot | null;
  title?: BadgeKey | null;
  onTitle?: (title: BadgeKey | null) => void;
}) {
  const { t } = useI18n();
  if (!snapshot) return null;
  const pct = Math.min(100, Math.round((snapshot.intoLevel / Math.max(1, snapshot.levelSize)) * 100));
  const remaining = Math.max(0, snapshot.levelSize - snapshot.intoLevel);
  return (
    <div className="qt-xp-strip">
      <div className="qt-xp-strip__head">
        <LeagueBadge badge={snapshot} verbose />
        <b>{t("progress.level", { n: snapshot.level })}</b>
        {snapshot.streakDays > 1 && (
          <span className="qt-xp-streak" title={t("progress.streak", { n: snapshot.streakDays })}>
            <FlameIcon />
            {snapshot.streakDays}
          </span>
        )}
      </div>
      <div className="qt-xp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <small>{t("progress.nextLevel", { xp: remaining })}</small>
      {(snapshot.badges.length > 0 || snapshot.badgeProgress.length > 0) && (
        <div className="qt-badge-row" aria-label={t("badge.title")}>
          {snapshot.badges.map((badge) => {
            const selected = badge === title;
            // Unvan: kazanılmış rozet tıklanınca takılır, takılı olana tıklanınca
            // kaldırılır. onTitle yoksa (başkasının görünümü) salt görüntü.
            const label = t(`badge.${badge}` as StringKey);
            const hint = `${t(`badge.${badge}.hint` as StringKey)} · ${t(selected ? "title.unset" : "title.pick")}`;
            return onTitle ? (
              <button
                key={badge}
                type="button"
                className={`qt-badge ${selected ? "is-title" : ""}`}
                title={hint}
                aria-pressed={selected}
                onClick={() => onTitle(selected ? null : badge)}
              >
                <Icon name="medal" weight="fill" /> {label}
              </button>
            ) : (
              <span key={badge} className="qt-badge" title={t(`badge.${badge}.hint` as StringKey)}>
                <Icon name="medal" weight="fill" /> {label}
              </span>
            );
          })}
          {snapshot.badgeProgress.map((entry) => {
            // Kilitli rozet: hedefe ne kadar yaklaşıldığı mini barla görünür;
            // tıklanamaz (kazanılmamış rozet unvan olamaz).
            const label = t(`badge.${entry.key}` as StringKey);
            const goalPct = Math.min(100, Math.round((entry.current / entry.target) * 100));
            return (
              <span key={entry.key} className="qt-badge is-locked" title={t(`badge.${entry.key}.hint` as StringKey)}>
                <Icon name="lock" /> {label}
                <i className="qt-badge__bar">
                  <i style={{ width: `${goalPct}%` }} />
                </i>
                <em>
                  {entry.current}/{entry.target}
                </em>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** İsmin yanındaki küçük altın unvan etiketi — takılı rozetin adını taşır. */
function TitleTag({ title }: { title?: BadgeKey | null }) {
  const { t } = useI18n();
  if (!title) return null;
  return (
    <em className="qt-title" title={t(`badge.${title}.hint` as StringKey)}>
      {t(`badge.${title}` as StringKey)}
    </em>
  );
}

/** Maçta ilk kez kazanılan rozetler — podyumda XP kazanımının yanında
 *  parlayan altın haplar; isim değil koşulu tooltip'te. */
function NewBadgeChips({ gain }: { gain: XpGain }) {
  const { t } = useI18n();
  if (!gain.newBadges?.length) return null;
  return (
    <span className="qt-badge-new-row" role="status" aria-label={t("badge.new")}>
      {gain.newBadges.map((badge) => (
        <em key={badge} className="qt-badge-new" title={t(`badge.${badge}.hint` as StringKey)}>
          <Icon name="medal" weight="fill" /> {t(`badge.${badge}` as StringKey)}
        </em>
      ))}
    </span>
  );
}

/** Lobide güncel sezonun ilk 5'i + sıralamada olmayan senin satırın. */
function SeasonStrip({
  state,
  weekly = false,
  allTime = false,
}: {
  state: GameState;
  weekly?: boolean;
  allTime?: boolean;
}) {
  const { t, language } = useI18n();
  const board = allTime ? state.allTimeBoard : weekly ? state.weeklyBoard : state.seasonBoard;
  if (!board) return null;
  const yourRank = allTime
    ? (state.progress?.allTimeRank ?? null)
    : weekly
      ? null
      : (state.progress?.seasonRank ?? null);
  const yourXp = allTime ? state.progress?.xp : state.progress?.seasonXp;
  const youIn = board.entries.some((entry) => entry.userId === state.youId);
  return (
    <div className={`qt-season ${weekly ? "qt-season--weekly" : ""}`}>
      <div className="qt-season__head">
        <span>
          {allTime
            ? t("prestige.title")
            : weekly
              ? t("weekly.title", { week: board.season })
              : t("season.title", { season: board.season })}
        </span>
      </div>
      {board.entries.length ? (
        <ol className="qt-season__list">
          {board.entries.map((entry) => (
            <li key={entry.userId} className={entry.userId === state.youId ? "is-you" : ""}>
              <b>#{entry.rank}</b>
              <i className={`qt-league-dot is-${entry.league}`} aria-hidden="true" />
              <span title={entry.name}>{entry.name}</span>
              <em>{formatNumber(language, entry.xp)} XP</em>
            </li>
          ))}
          {!youIn && yourRank !== null && yourXp !== undefined && state.progress && (
            <li className="is-you">
              <b>#{yourRank}</b>
              <i className={`qt-league-dot is-${state.progress.league}`} aria-hidden="true" />
              <span>{t("podium.you")}</span>
              <em>{formatNumber(language, yourXp)} XP</em>
            </li>
          )}
        </ol>
      ) : (
        <small className="qt-season__empty">{t("season.empty")}</small>
      )}
    </div>
  );
}

/** Özel masa kartı: kod gir → web-<kod> odasına düşersin; arkadaşlar kodu
 *  başka Discord kanalında ya da web misafir kapısında aynı odaya girer. */
function PrivateRoomCard({
  state,
  onJoin,
  onLeave,
}: {
  state: GameState | null;
  onJoin: (code: string) => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const inPrivate = !!state?.roomId?.startsWith("web-");
  const roomCode = (state?.roomId ?? "").replace(/^web-/, "");
  const clean = code.trim().toLowerCase();
  const codeValid = /^[a-z0-9][a-z0-9-]{0,23}$/.test(clean);
  const genCode = () => {
    // Okunabilir kısa kod — karışan i/l/o/0/1 dışarıda.
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };
  return (
    <details className="qt-privroom">
      <summary className="qt-privroom__head">
        <span>{t("private.title")}</span>
        {inPrivate && <b className="qt-privroom__chip">{roomCode}</b>}
      </summary>
      {inPrivate ? (
        <div className="qt-privroom__body">
          <small>{t("private.hint")}</small>
          <div className="qt-privroom__actions">
            <button
              type="button"
              className="qt-button qt-writer-delete"
              onClick={() => void navigator.clipboard?.writeText(roomCode)}
            >
              {t("private.copy")}
            </button>
            <button type="button" className="qt-button qt-daily-share__copy" onClick={onLeave}>
              {t("private.leave")}
            </button>
          </div>
        </div>
      ) : (
        <div className="qt-privroom__body">
          <small>{t("private.hint")}</small>
          <input
            className="qt-privroom__input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && codeValid) onJoin(clean);
            }}
            placeholder={t("private.code")}
            aria-label={t("private.code")}
            maxLength={24}
            autoComplete="off"
          />
          <div className="qt-privroom__actions">
            <button
              type="button"
              className="qt-button qt-daily-share__copy"
              disabled={!codeValid}
              onClick={() => onJoin(clean)}
            >
              {t("private.join")}
            </button>
            <button type="button" className="qt-button qt-writer-delete" onClick={() => onJoin(genCode())}>
              {t("private.create")}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}

/** Bugünün günlük lider tablosu — skor sırası + Wordle deseni + seri rozeti. */
function DailyStrip({ state }: { state: GameState }) {
  const { t } = useI18n();
  const board = state.dailyBoard;
  if (!board) return null;
  const youIn = board.entries.some((entry) => entry.userId === state.youId);
  return (
    <div className="qt-season qt-daily">
      <div className="qt-season__head">
        <span>{t("daily.board", { day: board.day })}</span>
        {board.streak > 1 && (
          <em className="qt-daily-streak" title={t("daily.streakTitle")}>
            {t("daily.streak", { count: board.streak })}
          </em>
        )}
      </div>
      {board.entries.length ? (
        <ol className="qt-season__list">
          {board.entries.map((entry) => (
            <li key={entry.userId} className={entry.userId === state.youId ? "is-you" : ""}>
              <b>#{entry.rank}</b>
              <span title={entry.name}>{entry.name}</span>
              <i className="qt-daily-pattern" aria-hidden="true">
                {entry.pattern}
              </i>
              <em>{entry.score}</em>
            </li>
          ))}
          {!youIn && board.userRank !== null && (
            <li className="is-you">
              <b>#{board.userRank}</b>
              <span>{t("podium.you")}</span>
              <em></em>
            </li>
          )}
        </ol>
      ) : (
        <small className="qt-season__empty">{t("daily.empty")}</small>
      )}
    </div>
  );
}

function LanguagePicker({
  language,
  onChange,
}: {
  language: ActivityLanguage;
  onChange: (language: ActivityLanguage) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="qt-language-picker" title={t("lang.label")}>
      <Icon name="globe" />
      <select
        value={language}
        onChange={(event) => onChange(event.target.value as ActivityLanguage)}
        aria-label={t("lang.label")}
      >
        <option value="tr">TR</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}

/** Mod adları ve etiketleri tek yerden; her fazda aynı sözlükten okunur. */
const MODE_KEYS = {
  classic: { name: "mode.classic", meta: "mode.classic.meta", tag: "mode.classic.tag", icon: "cards" },
  lightning: { name: "mode.lightning", meta: "mode.lightning.meta", tag: "mode.lightning.tag", icon: "fuse" },
  circle: { name: "mode.circle", meta: "mode.circle.meta", tag: "mode.circle.tag", icon: "letters" },
  bet: { name: "mode.bet", meta: "mode.bet.meta", tag: "mode.bet.tag", icon: "coins" },
  team: { name: "mode.team", meta: "mode.team.meta", tag: "mode.team.tag", icon: "teams" },
  elim: { name: "mode.elim", meta: "mode.elim.meta", tag: "mode.elim.tag", icon: "heart" },
  blur: { name: "mode.blur", meta: "mode.blur.meta", tag: "mode.blur.tag", icon: "eye" },
  word: { name: "mode.word", meta: "mode.word.meta", tag: "mode.word.tag", icon: "scroll" },
  duel: { name: "mode.duel", meta: "mode.duel.meta", tag: "mode.duel.tag", icon: "sword" },
  zil: { name: "mode.zil", meta: "mode.zil.meta", tag: "mode.zil.tag", icon: "bolt" },
  numeric: { name: "mode.numeric", meta: "mode.numeric.meta", tag: "mode.numeric.tag", icon: "target" },
  blitz: { name: "mode.blitz", meta: "mode.blitz.meta", tag: "mode.blitz.tag", icon: "scale" },
  timeline: { name: "mode.timeline", meta: "mode.timeline.meta", tag: "mode.timeline.tag", icon: "clock" },
  board: { name: "mode.board", meta: "mode.board.meta", tag: "mode.board.tag", icon: "board" },
} as const;

function modeKeyOf(mode: GameMode): keyof typeof MODE_KEYS {
  return mode === "circle"
    ? "circle"
    : mode === "lightning"
      ? "lightning"
      : mode === "bet"
        ? "bet"
        : mode === "team"
          ? "team"
          : mode === "elim"
            ? "elim"
            : mode === "blur"
              ? "blur"
              : mode === "word"
                ? "word"
                : mode === "duel"
                  ? "duel"
                  : mode === "zil"
                    ? "zil"
                    : mode === "numeric"
                      ? "numeric"
                      : mode === "blitz"
                        ? "blitz"
                        : mode === "timeline"
                          ? "timeline"
                          : mode === "board"
                            ? "board"
                            : "classic";
}

/**
 * Maket 1a: her oyuncunun avatarı kendi renginde (S amber, E mint, B mercan…).
 * Renk seatColorOf'tan gelir — lobideki koltuklar ve podyum zaten onu
 * kullanıyor, yani aynı oyuncu her ekranda aynı renkte. (Kendi paletimi
 * yazmıştım; iki palet zamanla ayrışır ve oyuncu lobide başka, masada başka
 * renk olurdu.)
 */
function Avatar({ player, compact = false, mode }: { player: PublicPlayer; compact?: boolean; mode?: GameMode }) {
  // Lig çerçevesi: kozmetik kimlik, progress.league'den beslenir (botta/rozet
  // kaydı olmayanda çerçeve yok). Koltuk rengi (--seat border) ile çakışmamak
  // için iç border'a değil dış outline halkasına yazılır.
  const frame = player.progress?.league;
  return (
    <div
      className={`qt-avatar ${playerColorClass(player, mode)} ${compact ? "qt-avatar--compact" : ""} ${frame ? `is-frame-${frame}` : ""}`}
      title={player.name}
    >
      <AvatarImage url={player.avatarUrl} name={player.name} />
    </div>
  );
}

/** Kırık avatar resmi → ismin baş harfi. Büyük harf görüntüleyenin diline
 *  göre üretilir (TR'de i→İ, EN'de i→I). url değişince yeniden dener. */
function AvatarImage({ url, name }: { url: string | null; name: string }) {
  const { language } = useI18n();
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (url && brokenUrl !== url) return <img src={url} alt="" onError={() => setBrokenUrl(url)} />;
  return <>{name.slice(0, 1).toLocaleUpperCase(language === "en" ? "en-US" : "tr-TR")}</>;
}

/**
 * Sunucu saatini yerele sabitler. Offset yalnızca yeni durum paketi geldiğinde
 * güncellenir; aradaki her karede yerel saat akar. (Offset'i her render'da
 * yeniden hesaplamak, sayacı son push'ta dondurur.)
 */
function useServerNow(serverNow?: number, intervalMs = 100): number {
  const [offset, setOffset] = useState(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (serverNow !== undefined) setOffset(serverNow - Date.now());
  }, [serverNow]);
  // Zamanlayıcı yalnızca yeniden çizimi tetikler; DEĞER her render'da taze
  // okunur. Zamanı state'te tutmak, sekme arka plandayken (interval kısılır)
  // sayacı bayat bir değerde dondurur — 8 saniyelik tur "25 sn" görünür.
  useEffect(() => {
    const timer = window.setInterval(() => force((tick) => tick + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return Date.now() + offset;
}

function useClock(deadline?: number, serverNow?: number) {
  const now = useServerNow(serverNow, 200);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    const legacyQuery = query as unknown as {
      addListener: (listener: () => void) => void;
      removeListener: (listener: () => void) => void;
    };
    legacyQuery.addListener(onChange);
    return () => legacyQuery.removeListener(onChange);
  }, []);
  return reduced;
}

function useMinWidth(px: number) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(`(min-width: ${px}px)`).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(`(min-width: ${px}px)`);
    if (!query) return;
    const onChange = () => setMatches(query.matches);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    const legacyQuery = query as unknown as {
      addListener: (listener: () => void) => void;
      removeListener: (listener: () => void) => void;
    };
    legacyQuery.addListener(onChange);
    return () => legacyQuery.removeListener(onChange);
  }, [px]);
  return matches;
}

/**
 * 0'dan hedefe easeOutCubic ile akan sayı. Değeri, reveal'ın sunucu saatinden
 * ölçülen geçmiş süresinden türetir — kendi zamanlayıcısını kurmaz. Böylece
 * sekme gizliyken (rAF/timer kısılırken) ya da maç ortasında bağlanıldığında
 * sayı "0'da takılı" kalmaz, her zaman ait olduğu değeri gösterir.
 */
function countUpValue(target: number, elapsedMs: number, reduced: boolean, ms = 700) {
  if (reduced || elapsedMs >= ms) return target;
  if (elapsedMs <= 0) return 0;
  const progress = elapsedMs / ms;
  return Math.round(target * (1 - Math.pow(1 - progress, 3)));
}

/** Mount anından itibaren rAF ile hedefe sayar (podyum skoru gibi tek seferlik).
 *  reduced-motion'da anında hedefe oturur. countUpValue'nin eğrisini kullanır. */
function useCountUp(target: number, reduced: boolean, ms = 900) {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      setValue(countUpValue(target, elapsed, false, ms));
      if (elapsed < ms) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, ms]);
  return value;
}

function Timer({
  deadline,
  durationMs,
  serverNow,
  frozen = false,
  compact = false,
}: {
  deadline?: number;
  durationMs?: number;
  serverNow?: number;
  frozen?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const now = useServerNow(serverNow, 200);
  const seconds = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const ratio = deadline && durationMs ? Math.max(0, Math.min(1, (deadline - now) / durationMs)) : 1;
  const urgent = !frozen && seconds <= 3;
  const soon = !frozen && seconds <= 5 && seconds > 3;
  const visibleRatio = frozen ? 0 : ratio;
  return (
    <div
      className={`qt-timer ${compact ? "qt-timer--mini" : ""} ${urgent ? "is-urgent" : soon ? "is-soon" : ""} ${frozen ? "is-frozen" : ""}`}
      style={{ "--progress-turn": `${visibleRatio}turn`, "--timer-angle": `${1 - visibleRatio}turn` } as CSSProperties}
      role="timer"
      aria-label={`${frozen ? 0 : seconds} ${t("game.seconds")}`}
    >
      <i className="qt-timer__sweep" aria-hidden="true" />
      <span>{frozen ? 0 : seconds}</span>
      <small>{t("game.seconds")}</small>
    </div>
  );
}

/** Soru kabuğu açılmadan önce, aynı deadline'a bağlı kısa ortak başlangıç sahnesi. */
function StartCountdown({ state }: { state: GameState }) {
  const { t } = useI18n();
  const countdown = state.countdown;
  const seconds = useClock(countdown?.deadline, state.serverNow);
  const mode = MODE_KEYS[modeKeyOf(state.gameMode)];
  return (
    <main
      className="qt-activity qt-start-countdown"
      style={
        {
          "--countdown-art": `url('/assets/discord-activity/${state.gameMode === "circle" ? "activity-circle-table.webp" : "activity-classic-stage.webp"}')`,
        } as CSSProperties
      }
    >
      <div className="qt-start-countdown__backdrop" />
      <section className="qt-start-countdown__stage" aria-live="polite">
        <div className="qt-start-countdown__mode">
          <Icon name={mode.icon} weight="duotone" /> {t(mode.tag)}
        </div>
        <p>{t("countdown.tableReady")}</p>
        {/* Rozet tek haneli rakama göre ölçülü; "BAŞLA"/"GO" yazıya döndüğünde
          font küçülmezse çemberden taşar (madde: kutunun içinde kalmalı). */}
        <div className={`qt-start-countdown__number ${seconds ? `is-${seconds}` : "is-go"}`} key={seconds}>
          {seconds || t("countdown.go")}
        </div>
        <div className="qt-start-countdown__players" aria-label={t("countdown.players")}>
          {[...state.players]
            .sort((a, b) => a.seat - b.seat)
            .map((player) => (
              <div key={player.id} className={player.id === state.youId ? "is-you" : ""}>
                <Avatar player={player} compact />
                <span title={player.name}>
                  {player.name}
                  <TitleTag title={player.title} />
                </span>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}

/**
 * Maket: 11 çip yerine tek satırlık tetikleyici; seçim üstte açılan katmanda.
 * Panelde ~200px yer kazandırır ve seçili kategoriyi tek bakışta okutur.
 */
/**
 * Kategori seçimi. Tetikleyici tıklanınca ORTADA açılan bir modal pencerede
 * seçim yapılır (eski inline katman değil): kategori sayısı arttıkça pencere
 * kendi içinde kaydırılır, masa ayarları panelini taşırmaz. Portal ile body'ye:
 * panelin overflow/stacking kurallarına takılmadan tam ekran overlay olur.
 */
/** Modal odak tuzağı (erişilebilirlik): açılınca odak içeride kalır, Tab döngüde
 *  dolaşır, kapanınca odak tetikleyici öğeye döner. Escape'i çağıran yönetir. */
function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    // previous ÖNCE yakalandı (üstte); odağı ŞİMDİ içeri al. autoFocus KULLANMA:
    // React commit'te odağı effect'ten önce içeri taşırsa previous yanlış olur
    // (kapanışta restore sökülen düğüme gider). Tercih: [data-autofocus], yoksa ilki.
    if (!node.contains(document.activeElement))
      (node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? node).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [active]);
  return ref;
}

/** Zorluk segmenti (Kategori Kartları tasarımı): kategorinin baskın zorluğunu
 *  3 çubuktan kaçının dolu olduğuyla gösterir — kolay=1, orta=2, zor=3 dolu,
 *  renk de zorlukla eşleşir (nane/altın/mercan). İçerik yoksa (kilitli) hepsi boş. */
function DifficultySegments({ difficulty }: { difficulty: Difficulty | null }) {
  const filled = difficulty === "kolay" ? 1 : difficulty === "orta" ? 2 : difficulty === "zor" ? 3 : 0;
  return (
    <span className={`qt-category-card__diff ${difficulty ? `is-${difficulty}` : ""}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < filled ? "is-filled" : ""} />
      ))}
    </span>
  );
}

function CategoryPicker({
  categories,
  selection,
  disabled,
  hint,
  mode,
  mastery,
  onMixed,
  onToggle,
}: {
  categories: CategoryOption[];
  selection: string[];
  disabled: boolean;
  hint: string;
  mode: GameMode;
  /** §6.4: oyuncunun ustalık kazandığı kategoriler (50+ doğru) — ikonda işaret. */ mastery?: string[];
  onMixed: () => void;
  onToggle: (name: string) => void;
}) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  // Sahiplik devredilirse (ya da alınırsa) açık pencere elde kalmasın.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  // Her açılışta arama temiz başlasın.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  // Escape ile kapat (dışa tık backdrop ile çalışıyor).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const summary = selection.length
    ? selection.map((name) => categoryLabel(language, name)).join(", ")
    : t("category.mixed");
  // Türkçe-duyarlı, aksan/harf toleranslı arama (İ/ı dahil).
  const q = query.trim().toLocaleLowerCase("tr-TR");
  // Hem Türkçe anahtar hem ekrandaki (EN) adla ara — EN arayüzde "geo" bulunmuyordu.
  const filtered = q
    ? categories.filter(
        (category) =>
          category.name.toLocaleLowerCase("tr-TR").includes(q) ||
          categoryLabel(language, category.name)
            .toLocaleLowerCase(language === "en" ? "en-US" : "tr-TR")
            .includes(q),
      )
    : categories;
  // Seçili kategoriler arama boşken en başta görünsün (sekmeden bakınca anlaşılır).
  const ordered = q
    ? filtered
    : [...filtered].sort((a, b) => Number(selection.includes(b.name)) - Number(selection.includes(a.name)));
  return (
    <div className="qt-category-picker">
      <button
        type="button"
        className={`qt-category-trigger ${open ? "is-open" : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{summary}</span>
        <Icon name="chevron" />
      </button>
      {open &&
        createPortal(
          // Backdrop'a (dialog'un kendisine değil) tıklayınca kapanır.
          <div
            className="qt-category-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={trapRef}
              className="qt-category-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("category.title")}
            >
              <div className="qt-category-modal__head">
                <div>
                  <b>{t("category.title")}</b>
                  <small>{hint}</small>
                </div>
                <button
                  type="button"
                  className="qt-category-modal__close"
                  aria-label={t("category.close")}
                  onClick={() => setOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {/* Çok kategori için arama: yazdıkça filtreler (İ/ı duyarlı). */}
              <input
                className="qt-category-modal__search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("category.search")}
                aria-label={t("category.search")}
                data-autofocus
              />
              {/* "Karışık" sıfırlama seçeneği: yalnız arama boşken üstte durur. */}
              {!q && (
                <button
                  type="button"
                  className={`qt-category-chip qt-category-reset ${!selection.length ? "is-selected" : ""}`}
                  aria-pressed={!selection.length}
                  onClick={onMixed}
                >
                  {t("category.mixed")}
                </button>
              )}
              <div className="qt-category-modal__grid">
                {ordered.map((category) => {
                  const soon = category.classicCount === 0 && category.circleCount === 0;
                  const count = mode === "circle" ? category.circleCount : category.classicCount;
                  const minContent = mode === "circle" ? 25 : 40;
                  const low = !soon && count < minContent;
                  const selected = selection.includes(category.name);
                  return (
                    <button
                      type="button"
                      key={category.name}
                      className={`qt-category-card ${selected ? "is-selected" : ""} ${soon ? "is-soon" : ""}`}
                      aria-pressed={selected}
                      disabled={soon}
                      title={soon ? t("category.soon") : undefined}
                      onClick={() => onToggle(category.name)}
                    >
                      {soon && (
                        <div className="qt-category-card__lock" aria-hidden="true">
                          <Icon name="lock" />
                          <span>{t("category.soonBadge")}</span>
                        </div>
                      )}
                      <div className="qt-category-card__top">
                        <i className="qt-category-card__icon" aria-hidden="true">
                          <CategoryIcon name={category.name} />
                          {mastery?.includes(category.name) && (
                            <span className="qt-category-card__mastery" title={t("category.mastered")}>
                              <Icon name="star" />
                            </span>
                          )}
                        </i>
                        {selected && (
                          <span className="qt-category-card__check" aria-hidden="true">
                            <Icon name="check" />
                          </span>
                        )}
                      </div>
                      <b className="qt-category-card__name">{categoryLabel(language, category.name)}</b>
                      <div className="qt-category-card__foot">
                        <DifficultySegments difficulty={category.difficulty} />
                        <span className="qt-category-card__count">
                          {soon ? "—" : t("category.questionCount", { count })}
                        </span>
                        {low && (
                          <span className="qt-category-card__low" title={t("category.lowContentHint")}>
                            {t("category.lowContent")}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {q && !filtered.length && <span className="qt-category-modal__empty">{t("category.noResults")}</span>}
              </div>
              <button
                type="button"
                className="qt-button qt-button--primary qt-category-modal__done"
                onClick={() => setOpen(false)}
              >
                {t("category.done")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Modlar arasında Klasik + Çember her zaman görünür (en sık kullanılan ikisi);
 *  geri kalanı (Fitil/Çifte Bahis/Takım) CategoryPicker ile aynı desende
 *  (tetikleyici kart -> açılır modal -> seçilebilir kartlar) katlanır — 5 modu
 *  hep açık göstermek satır taşırıyor + gözü dağıtıyordu. */
const OTHER_MODES = [
  "lightning",
  "bet",
  "team",
  "elim",
  "blur",
  "word",
  "duel",
  "zil",
  "numeric",
  "blitz",
  "timeline",
  "board",
] as const;
// Tripo'dan üretilip aynı kamera/ışıkla render edilen mod nesneleri (webp,
// şeffaf). Bu listede olmayan modlar ikonla gösterilir.
const MODE_EMBLEMS: Partial<Record<GameMode, string>> = {
  classic: "/emblems/classic.webp",
  circle: "/emblems/circle.webp",
  lightning: "/emblems/lightning.webp",
  bet: "/emblems/bet.webp",
  team: "/emblems/team.webp",
  elim: "/emblems/elim.webp",
  blur: "/emblems/blur.webp",
  word: "/emblems/word.webp",
  duel: "/emblems/duel.webp",
  zil: "/emblems/zil.webp",
  numeric: "/emblems/numeric.webp",
  blitz: "/emblems/blitz.webp",
  timeline: "/emblems/timeline.webp",
  board: "/emblems/board.webp",
};
function ModePicker({
  mode,
  isHost,
  onSetMode,
}: {
  mode: GameMode;
  isHost: boolean;
  onSetMode: (mode: GameMode) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  useEffect(() => {
    if (!isHost) setOpen(false);
  }, [isHost]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const activeOther = (OTHER_MODES as readonly GameMode[]).includes(mode)
    ? (mode as (typeof OTHER_MODES)[number])
    : null;
  const triggerIcon = activeOther ? MODE_KEYS[activeOther].icon : "more";
  const triggerLabel = activeOther ? t(MODE_KEYS[activeOther].name) : t("mode.more");
  return (
    <>
      <button
        type="button"
        className={`qt-mode-card qt-mode-card--other ${activeOther ? "is-selected" : ""}`}
        disabled={!isHost}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={activeOther ? t(MODE_KEYS[activeOther].meta) : t("mode.more")}
        onClick={() => setOpen(true)}
      >
        <i className="qt-mode-card__tile" aria-hidden="true">
          {activeOther && MODE_EMBLEMS[activeOther] ? (
            <img src={MODE_EMBLEMS[activeOther]} alt="" />
          ) : (
            <Icon name={triggerIcon} weight="duotone" />
          )}
        </i>
        <b>{triggerLabel}</b>
        {/* Köşedeki chevron 'daha fazla seçenek' anlamını taşır — Klasik/Çember
          kartlarından ayrışır, tıklanabilir olduğu belli olur. */}
        <i className="qt-mode-card__chev" aria-hidden="true">
          <Icon name="chevron" />
        </i>
      </button>
      {open &&
        createPortal(
          <div
            className="qt-category-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={trapRef}
              className="qt-category-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("mode.more")}
            >
              <div className="qt-category-modal__head">
                <div>
                  <b>{t("mode.more")}</b>
                  <small>{t("mode.more.hint")}</small>
                </div>
                <button
                  type="button"
                  className="qt-category-modal__close"
                  aria-label={t("category.close")}
                  onClick={() => setOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="qt-mode-options">
                {OTHER_MODES.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={`qt-mode-option is-${item} ${mode === item ? "is-selected" : ""}`}
                    aria-pressed={mode === item}
                    onClick={() => {
                      onSetMode(item);
                      setOpen(false);
                    }}
                  >
                    <i className="qt-mode-option__icon" aria-hidden="true">
                      {MODE_EMBLEMS[item] ? (
                        <img src={MODE_EMBLEMS[item]} alt="" />
                      ) : (
                        <Icon name={MODE_KEYS[item].icon} weight="duotone" />
                      )}
                    </i>
                    <b>{t(MODE_KEYS[item].name)}</b>
                    <small>{t(MODE_KEYS[item].meta)}</small>
                    {mode === item && (
                      <span className="qt-mode-option__check" aria-hidden="true">
                        <Icon name="check" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function GameLeaveButton({ onLeave, floating = false }: { onLeave: () => void; floating?: boolean }) {
  const { t } = useI18n();
  // Etiket ayrı span'de: dar ekranda CSS yalnız ikonu bırakır (buton iki satıra
  // kırılıp başlığı ezmesin); ad title/aria-label'da kalır.
  return (
    <button
      type="button"
      className={`qt-game-exit qt-game-exit--danger ${floating ? "qt-game-exit--floating" : ""}`}
      onClick={onLeave}
      title={t("game.leave")}
      aria-label={t("game.leave")}
    >
      <Icon name="exit" />
      <span className="qt-game-exit__label">{t("game.leave")}</span>
    </button>
  );
}

/** Oyun-içi "?": aktif modun kısa kuralını küçük bir diyalogda açar. Diyalog
 *  `role="dialog"` taşır — klavye kısayolları (1-4, zil Space) açıkken yutulur. */
function GameHelpButton({ mode }: { mode: GameMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="qt-game-exit qt-game-help"
        onClick={() => setOpen(true)}
        title={t("game.help")}
        aria-label={t("game.help")}
      >
        <Icon name="info" />
      </button>
      {open && <ModeHelpDialog mode={mode} onClose={() => setOpen(false)} />}
    </>
  );
}

function ModeHelpDialog({ mode, onClose }: { mode: GameMode; onClose: () => void }) {
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLElement>(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="qt-howto-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={trapRef}
        className="qt-howto-modal qt-howto-modal--mode"
        role="dialog"
        aria-modal="true"
        aria-label={t("game.help")}
      >
        <div className="qt-howto-modal__head">
          <div>
            <span>{t("game.help")}</span>
            <b>{t(`mode.${mode}` as StringKey)}</b>
          </div>
          <button type="button" className="qt-howto-modal__close" onClick={onClose} aria-label={t("leave.cancel")}>
            <Icon name="close" />
          </button>
        </div>
        <p className="qt-mode-help__body">{t(`mode.${mode}.howto` as StringKey)}</p>
      </section>
    </div>
  );
}

/** İzleyici çubuğu: oyun/podyum fazlarında izleyene "izliyorsun" der ve boş koltuk
 *  varsa "Oyna" ile oturtur (lobide bu iş you-panel'de). Sabit alt overlay. */
function SpectatorBar({
  state,
  canSit,
  onTakeSeat,
  onPredict,
}: {
  state: GameState;
  canSit: boolean;
  onTakeSeat: () => void;
  onPredict: (targetId: string) => void;
}) {
  const { t } = useI18n();
  const pick = state.yourPrediction;
  const picked = pick ? state.players.find((p) => p.id === pick) : null;
  const ownGain = state.phase === "podium" && pick ? state.xpGains?.[state.youId] : null;
  return (
    <div className="qt-spectator-bar" role="status">
      <span>
        <Icon name="eye" /> {t("spectator.watching")}
      </span>
      {/* Kazanan tahmini (§6.3): pencere maç başında açık, bilene podyumda +XP. */}
      {state.predictOpen &&
        (picked ? (
          <span className="qt-predict-yours">
            <Icon name="check" /> {t("predict.yours", { name: picked.name })}
          </span>
        ) : (
          <span className="qt-predict-bar">
            <small>{t("predict.title")}</small>
            {state.players
              .filter((p) => state.gameMode !== "duel" || !p.waiting)
              .map((p) => (
                <button key={p.id} type="button" className="qt-predict-chip" onClick={() => onPredict(p.id)}>
                  <Avatar player={p} compact />
                  {p.name}
                </button>
              ))}
          </span>
        ))}
      {ownGain && (
        <span className="qt-predict-win">
          <Icon name="check" /> {t("predict.win", { xp: ownGain.gained })}
        </span>
      )}
      <button type="button" className="qt-button qt-button--primary" disabled={!canSit} onClick={onTakeSeat}>
        {canSit ? (
          <>
            <Icon name="people" /> {t("spectator.play")}
          </>
        ) : (
          t("spectator.full")
        )}
      </button>
    </div>
  );
}

/**
 * Soldaki masa listesi. Reveal'de puan çipini de bu liste taşır: eskiden alttaki
 * nabız rafındaydı, o raf oyuncuları ikinci kez gösterdiği için kaldırıldı —
 * ama puanın sayarak akması (madde 4) rafın değil, oyuncunun yanına aitti.
 */
function RoomStrip({
  state,
  beats,
  speakingIds,
}: {
  state: GameState;
  beats: RevealBeats;
  speakingIds?: ReadonlySet<string>;
}) {
  const { t, language } = useI18n();
  // Taç: state.players zaten skora göre azalan sıralı; birinci puanı 0'dan büyükse
  // liderdir. Puan değişince liste yeniden sıralanır -> taç otomatik lidere geçer.
  // Eşitlikte taç kimseye verilmez; Çifte Bahis'te herkes 1.000 ile başladığı
  // için eskiden alfabetik ilk oyuncu "lider" görünüyordu.
  const [top, runnerUp] = state.players;
  const baseline = state.gameMode === "bet" ? BET_STARTING_BANKROLL : 0;
  const leaderId = top && top.score > baseline && (!runnerUp || top.score > runnerUp.score) ? top.id : null;
  const isTeam = state.gameMode === "team";
  const [teamA, teamB] = state.teamScores;
  return (
    <aside className="qt-table-strip" aria-label={t("game.tablePlayers")}>
      {isTeam ? (
        <div className="qt-strip-teams">
          <span className="qt-strip-team is-team0">
            <b>{t("team.a")}</b>
            <em key={teamA}>{formatNumber(language, teamA)}</em>
          </span>
          <span className="qt-strip-team is-team1">
            <b>{t("team.b")}</b>
            <em key={teamB}>{formatNumber(language, teamB)}</em>
          </span>
        </div>
      ) : (
        <div className="qt-strip-title">
          <span>{t("game.table")}</span>
          <b>{state.players.length} / 8</b>
        </div>
      )}
      <div className="qt-player-stack">
        {state.players.slice(0, 8).map((player) => (
          <div
            className={`qt-player-card ${playerColorClass(player, state.gameMode)} ${player.id === state.youId ? "is-you" : ""} ${player.answered ? "is-locked" : ""} ${(state.phase === "question" || state.phase === "bet") && !player.answered && !player.waiting && player.connected && !(state.gameMode === "elim" && (player.lives ?? 1) <= 0) ? "is-awaiting" : ""} ${state.gameMode === "elim" && !player.waiting && player.lives === 0 ? "is-dead" : ""} ${player.id === state.firstAnswerId ? "is-first" : ""} ${player.id === leaderId ? "is-leader" : ""} ${speakingIds?.has(player.id) ? "is-speaking" : ""}`}
            key={player.id}
          >
            <span className="qt-avatar-slot">
              {player.id === leaderId && (
                <span className="qt-strip-crown" aria-hidden="true" title={t("game.leader")}>
                  <Icon name="crown" />
                </span>
              )}
              <Avatar player={player} compact mode={state.gameMode} />
              {player.streak >= 3 && (
                // key=streak: her artışta yeniden mount → burst animasyonu her tur oynar;
                // 5+ seri "inferno" varyantına geçer (daha sıcak, hafif sallanan alev).
                <span
                  key={player.streak}
                  className={`qt-streak-flame ${player.streak >= 5 ? "qt-streak-flame--inferno" : ""}`}
                  aria-hidden="true"
                  title={t("game.streak", { count: player.streak })}
                >
                  <FlameIcon />
                </span>
              )}
            </span>
            <div>
              <b title={player.name}>{player.name}</b>
              <TitleTag title={player.title} />
              {player.progress && <LeagueBadge badge={player.progress} />}
              <small>
                {player.waiting
                  ? t("game.nextRound")
                  : state.gameMode === "elim" && player.lives === 0
                    ? t("elim.out")
                    : player.answered
                      ? t("game.locked")
                      : beats.active
                        ? t("game.missed")
                        : player.connected
                          ? t("game.thinking")
                          : t("game.connecting")}
              </small>
            </div>
            {state.gameMode === "elim" && player.lives !== undefined && (
              <span className="qt-player-lives" title={t("elim.lives")}>
                {Array.from({ length: 3 }, (_, i) => (
                  <i key={i} className={i < player.lives! ? "is-full" : ""}>
                    <Icon name="heart" weight="fill" />
                  </i>
                ))}
              </span>
            )}
            {state.gameMode === "bet" &&
              (state.betStakes?.[player.id] !== undefined ||
                (beats.active && state.reveal?.bets?.[player.id] !== undefined)) && (
                <span
                  className={`qt-player-bet ${state.betStakes ? "qt-bet-stake-reveal" : ""}`}
                  title={t("bet.stakedTitle")}
                >
                  <Icon name="coins" />
                  {formatNumber(language, state.betStakes?.[player.id] ?? state.reveal!.bets![player.id])}
                </span>
              )}
            {player.cardPlayed && (
              <span className="qt-card-played" title={t("card.played")}>
                <Icon name="deck" />
              </span>
            )}
            <span className="qt-player-scorecol" title={t("game.totalScore")}>
              <b className="qt-player-score">{formatNumber(language, player.score)}</b>
              <small className="qt-player-total">{t("game.total")}</small>
            </span>
            {player.answered && !beats.gains && <Icon name="check" />}
          </div>
        ))}
      </div>
    </aside>
  );
}

/* GainChip kaldırıldı (denetim: reveal sadeleştirme): puan artışı yalnız sağ büyük
   kutuda (.qt-your-gain) gösterilir; skor şeridi yalnız güncel TOPLAM skoru taşır. */

/** Reveal sahnesinin ritmi. Sunucunun deadline'ından türer, yerel zamanlayıcıdan değil:
 *  maç ortasında bağlanan istemci koreografiyi baştan oynatmaz, kaldığı yerden görür. */
interface RevealBeats {
  active: boolean;
  cards: boolean;
  voters: boolean;
  gains: boolean;
  progress: number;
  remainingMs: number;
  elapsedMs: number;
}
const BEAT_CARDS_MS = 200;
const BEAT_VOTERS_MS = 250;
const BEAT_GAINS_MS = 650;

function useRevealBeats(state: GameState): RevealBeats {
  const payload = state.reveal ?? state.circleReveal ?? state.wordReveal;
  const now = useServerNow(state.serverNow, 60);
  if (state.phase !== "reveal" || !payload)
    return { active: false, cards: false, voters: false, gains: false, progress: 1, remainingMs: 0, elapsedMs: 0 };
  const remainingMs = Math.max(0, payload.until - now);
  const elapsedMs = payload.durationMs - remainingMs;
  return {
    active: true,
    cards: elapsedMs >= BEAT_CARDS_MS,
    voters: elapsedMs >= BEAT_VOTERS_MS,
    gains: elapsedMs >= BEAT_GAINS_MS,
    progress: Math.max(0, Math.min(1, remainingMs / payload.durationMs)),
    remainingMs,
    elapsedMs,
  };
}

/**
 * "{letter} ile başlar" / "Starts with {letter}". Harf iki dilde cümlenin farklı
 * yerinde durduğu için metni birleştiremeyiz: şablonu yer tutucudan bölüp
 * vurgulu harfi araya koyarız. Böylece kelime sırası her dilde doğru kalır.
 */
/** Şıkkın altına yerleşen avatar rafı. Mutlak konumlu: akışta yer kaplamaz,
 *  böylece avatarlar belirince kart ne büyür ne de metni sıkıştırır (madde 1/9). */
function VoterDock({ voters, correct, beats }: { voters: PublicPlayer[]; correct: boolean; beats: RevealBeats }) {
  if (!beats.voters || !voters.length) return null;
  const overflow = voters.length - 4;
  return (
    <span className={`qt-voters ${correct ? "is-right" : "is-wrong"}`} aria-hidden="true">
      {voters.slice(0, 4).map((player) => (
        <Avatar key={player.id} player={player} compact />
      ))}
      {overflow > 0 && <small>+{overflow}</small>}
    </span>
  );
}

/** Oyuncu rengi kimliğinden türetilir: aynı oyuncu her masada aynı renkte oturur. */
const SEAT_COLORS = ["gold", "mint", "peach", "lavender", "sky", "pink"] as const;
function seatColorOf(playerId: string) {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  return SEAT_COLORS[hash % SEAT_COLORS.length];
}
/** Takım modunda renk kişiye değil TAKIMA bağlıdır (2 renk) — masaya bakınca
 *  kimin hangi takımda olduğu bir bakışta okunur. Diğer modlarda kişiye özel ton. */
function playerColorClass(player: PublicPlayer, mode?: GameMode) {
  return mode === "team" ? `is-team${player.team}` : `is-${seatColorOf(player.id)}`;
}
// Kategori renk aksanı (4e): sayaç halkası + kart kenarı geçerli sorunun
// kategorisinin tonuna kayar. Ad kararlı bir tona düşer (aynı kategori hep aynı
// renk — seatColorOf ile aynı felsefe). SADECE renk: düzen değişmez, 0px kuralı
// korunur. Paletteki tonlar marka aksanları; tasarım 4e mint/altın/gök gösteriyor.
const CATEGORY_ACCENTS = ["#5ce7ef", "#5ee6c1", "#f3c362", "#85d9ff", "#b3a7f0"] as const;
function categoryAccent(name: string | undefined) {
  if (!name) return CATEGORY_ACCENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
}

/** Üç sütun bu genişliğin altında masanın ALTINA iner (CSS ile aynı eşik). */
/** Sunucudaki GAME.BET_STARTING_BANKROLL ile aynı (lider tacı eşiği). */
const BET_STARTING_BANKROLL = 1000;

const STACK_WIDTH = 1000;

/**
 * Yörünge, hem yüksekliğe hem genişliğe sığmak zorunda.
 *
 * Discord'un Activity iframe'i masaüstünde bile ALÇAKTIR (~530-730px) ve
 * Windows'ta %125 ölçekleme yüzünden beklenenden dar gelir. Yalnızca yüksekliğe
 * bakmak yetmiyordu: dar ekranda sütunlar masanın altına inince içerik uzuyor
 * ve kaydırma çubuğu çıkıyordu. Şimdi iki bütçenin küçüğü kazanır — masa her
 * zaman ekrana sığar ve (tasarımın kuralı) ortada kalır, ofsetle kaydırılmaz.
 */
function useOrbitSize() {
  const measure = () => {
    if (typeof window === "undefined") return 520;
    const stacked = window.innerWidth <= STACK_WIDTH;
    // Kısa-yatay (telefon yatay / alçak pencere): masa ile "senin koltuğun"
    // paneli YAN YANA durur (CSS ile aynı eşik). Eskiden burada da dikey yığın
    // formülü (yüksekliğin yarısı) kullanılıyordu: 844×390'da masa 230px'e
    // çöküyor, koltuklar diskin üstüne biniyordu.
    if (stacked && window.innerHeight <= 560 && window.innerWidth >= 680) {
      const side = Math.min(300, Math.max(230, window.innerWidth * 0.36));
      return Math.max(230, Math.min(460, window.innerWidth - side - 56, window.innerHeight - 28));
    }
    // Üç sütunda orta sütuna kalan yer; altına inince tüm genişlik.
    const widthBudget = stacked ? window.innerWidth - 40 : window.innerWidth - 640;
    // Mobil/dikey (stacked): masa üstte; ALTINDA koltuk kartı + CTA ilk ekranda
    // görünmeli → yüksekliğin ~yarısını aşma (kalanı CTA'ya). Masaüstü 3-sütun:
    // neredeyse tüm yükseklik masaya. Kısa-yatay ekranda (390px) eski taban 300
    // taşma yapıyordu (audit) — taban 230'a indi, height budget zaten sınırlıyor.
    const heightBudget = stacked ? Math.round(window.innerHeight * 0.5) : window.innerHeight - 68;
    return Math.max(230, Math.min(560, Math.min(widthBudget, heightBudget)));
  };
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/**
 * Masanın etrafındaki 8 koltuk. Geometri tasarımın kuralı: tek daire, tepeden
 * saat yönünde 45° adım, kesikli ring ile birebir hizalı.
 *
 * Yerleşim `rotate(θ) translateY(-R) rotate(-θ)` ile yapılır — koltuğun BOYUTU
 * konumunu etkilemez, merkezi her zaman tam ring üstündedir. İsim ve rozet
 * balonun altına mutlak konumlanır; akışta yer kaplasalardı çapayı kaydırıp
 * balonu ring'in üstünden düşürürlerdi.
 */
function OrbitSeats({
  state,
  radius,
  onInvite,
  viewerIsHost,
  onManage,
  openManageId,
  speakingIds,
  onAddBot,
}: {
  state: GameState | null;
  radius: number;
  onInvite: () => void;
  /** Yalnız yerel mock modda (Discord/web misafiri değil) verilir: host boş
   *  koltuğa tıklayınca davet yerine bot oturur. Yetki yine sunucuda
   *  (ALLOW_MOCK_AUTH + host). Takım modu gibi 2+ kişi isteyen modlar
   *  böylece tek tarayıcıda denenebilir. */
  onAddBot?: () => void;
  viewerIsHost: boolean;
  onManage: (player: PublicPlayer, x: number, y: number, trigger: HTMLElement) => void;
  openManageId: string | null;
  speakingIds?: ReadonlySet<string>;
}) {
  const { t } = useI18n();
  // Bir koltuk boş->dolu olduğunda o koltukta kısa bir patlama: dikkat yeni
  // gelen oyuncuya çekilir. İlk mount'ta (sayfa yüklenirken zaten oturanlar
  // için) tetiklenmesin diye mountedOnce bayrağıyla korunuyor.
  const prevOccupants = useRef<Record<number, string>>({});
  const mountedOnce = useRef(false);
  const joinTimers = useRef<Set<number>>(new Set());
  const [justJoined, setJustJoined] = useState<Record<number, number>>({});
  useEffect(
    () => () => {
      for (const timer of joinTimers.current) window.clearTimeout(timer);
      joinTimers.current.clear();
    },
    [],
  );
  useEffect(() => {
    const next: Record<number, string> = {};
    const joined: number[] = [];
    for (let seat = 0; seat < 8; seat++) {
      const occupant = state?.players.find((item) => item.seat === seat);
      if (!occupant) continue;
      next[seat] = occupant.id;
      if (mountedOnce.current && prevOccupants.current[seat] !== occupant.id) joined.push(seat);
    }
    prevOccupants.current = next;
    mountedOnce.current = true;
    if (!joined.length) return;
    setJustJoined((current) => {
      const updated = { ...current };
      joined.forEach((seat) => {
        updated[seat] = Date.now();
      });
      return updated;
    });
    joined.forEach((seat) => {
      const timer = window.setTimeout(() => {
        joinTimers.current.delete(timer);
        setJustJoined((current) => {
          const { [seat]: _drop, ...rest } = current;
          return rest;
        });
      }, 700);
      joinTimers.current.add(timer);
    });
  }, [state?.players]);
  return (
    <>
      {Array.from({ length: 8 }, (_, seat) => {
        const angle = seat * 45;
        const player = state?.players.find((item) => item.seat === seat);
        const transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`;
        if (!player) {
          const seatsBot = !!onAddBot && viewerIsHost;
          return (
            <button
              key={seat}
              className={`qt-seat qt-seat--empty ${seatsBot ? "is-bot-seat" : ""}`}
              style={{ transform }}
              onClick={seatsBot ? onAddBot : onInvite}
              title={t(seatsBot ? "table.addBotTitle" : "table.emptySeat")}
            >
              <i aria-hidden="true">
                <Icon name={seatsBot ? "people" : "seat"} />
              </i>
              <span>{t(seatsBot ? "table.addBot" : "table.invite")}</span>
            </button>
          );
        }
        const isHost = player.id === state?.hostId;
        // Taç zaten "masa sahibi" der; ayrıca rozet yazmak hem tekrar hem yer israfı.
        // Rozet kalkınca hazır durumu SADECE işaretle taşınır — bu yüzden işaret
        // artık masa sahibinde de gösterilir, yoksa onun durumu görünmez olurdu.
        const badge = player.inResults
          ? t("table.resultsBadge")
          : isHost
            ? null
            : player.ready
              ? t("table.readyBadge")
              : t("table.preparingBadge");
        // Host araçları (4a): sahip, KENDİSİ olmayan bir koltuğa tık/sağ-tık ile
        // menü açar. Yetki sunucuda; burası yalnızca menüyü konumlandırır.
        const manageable = viewerIsHost && player.id !== state?.youId;
        const manage = manageable
          ? (event: React.MouseEvent<HTMLElement>) => {
              event.preventDefault();
              onManage(player, event.clientX, event.clientY, event.currentTarget);
            }
          : undefined;
        // Klavye: Enter/Space menüyü koltuğun MERKEZİNDEN açar (mouse koordinatı yok).
        // role="button"+tabIndex tek başına yetmez — native <div> tuşta click üretmez.
        const manageKey = manageable
          ? (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              onManage(
                player,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                event.currentTarget as HTMLElement,
              );
            }
          : undefined;
        return (
          <div
            key={seat}
            className={`qt-seat qt-seat--filled ${playerColorClass(player, state?.gameMode)} ${isHost ? "is-host" : ""} ${player.ready ? "is-ready" : ""} ${player.id === state?.youId ? "is-you" : ""} ${manageable ? "is-manageable" : ""} ${justJoined[seat] ? "is-joining" : ""} ${speakingIds?.has(player.id) ? "is-speaking" : ""}`}
            style={{ transform, "--seat-delay": `${seat * 60}ms` } as CSSProperties}
            onClick={manage}
            onContextMenu={manage}
            onKeyDown={manageKey}
            {...(manageable
              ? {
                  role: "button",
                  tabIndex: 0,
                  title: t("host.hint"),
                  "aria-haspopup": "menu" as const,
                  "aria-expanded": player.id === openManageId,
                  "aria-controls": player.id === openManageId ? `qt-host-menu-${player.id}` : undefined,
                }
              : {})}
          >
            <div className={`qt-seat__token ${player.progress?.league ? `is-frame-${player.progress.league}` : ""}`}>
              <AvatarImage url={player.avatarUrl} name={player.name} />
              {isHost && <Icon name="crown" weight="fill" className="qt-seat__crown" />}
              {player.captain && (
                <Icon name="star" weight="fill" className="qt-seat__captain" aria-label={t("team.captain")} />
              )}
              {player.ready ? (
                <span className="qt-seat__check" aria-hidden="true">
                  <Icon name="check" />
                </span>
              ) : (
                <span className="qt-seat__prep" aria-hidden="true" />
              )}
              {justJoined[seat] && <Burst triggerKey={justJoined[seat]} />}
            </div>
            <div className="qt-seat__label">
              <b>
                {player.name}
                <TitleTag title={player.title} />
              </b>
              {badge && <small>{badge}</small>}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Masanın imza öğesi: seçilen mod, disk üzerinde kendi fiziksel nesnesine dönüşür. */
function ModeTableScene({ mode }: { mode: GameMode }) {
  const scene =
    mode === "circle"
      ? "circle"
      : mode === "lightning"
        ? "lightning"
        : mode === "bet"
          ? "bet"
          : mode === "team"
            ? "team"
            : mode === "elim"
              ? "elim"
              : mode === "blur"
                ? "blur"
                : mode === "word"
                  ? "word"
                  : mode === "duel"
                    ? "duel"
                    : mode === "zil"
                      ? "zil"
                      : mode === "numeric"
                        ? "numeric"
                        : "classic";
  return (
    <div className={`qt-mode-scene qt-mode-scene--${scene}`} data-mode={mode} aria-hidden="true">
      {MODE_EMBLEMS[scene] && (
        <div className={`qt-scene-emblem is-${scene} is-art`}>
          <img src={MODE_EMBLEMS[scene]} alt="" />
        </div>
      )}
    </div>
  );
}

/**
 * Host araçları menüsü (4a). Tık noktasına yerleşir (context-menu gibi),
 * viewport kenarına sığacak şekilde kırpılır. Dışa tık / Escape kapatır.
 * Bota sahiplik devri anlamsız — transfer yalnızca gerçek oyuncuda.
 */
function HostMenu({
  player,
  x,
  y,
  trigger,
  mode,
  onTransfer,
  onKick,
  onSetTeam,
  onClose,
}: {
  player: PublicPlayer;
  x: number;
  y: number;
  trigger: HTMLElement;
  mode?: GameMode;
  onTransfer: (id: string) => void;
  onKick: (id: string) => void;
  onSetTeam: (id: string, team: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // Konumu GERÇEK boyuttan hesapla: sabit tahminle (132px) kısa Discord
  // ekranında menü alttan taşıyordu. Ölçene kadar görünmez, sonra sığdır.
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: x, top: y, ready: false });
  useLayoutEffect(() => {
    if (!ref.current) return;
    // offset* KULLAN, getBoundingClientRect DEĞİL: açılış animasyonu menüyü
    // scale(.9) ile ölçüyor; rect küçülmüş boyutu verince clamp yanlış hesaplayıp
    // animasyon bitince menü kenardan taşıyordu. offsetWidth transform'u yok sayar.
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
      ready: true,
    });
  }, [x, y]);
  const closeAndRestore = () => {
    onClose();
    window.setTimeout(() => {
      if (trigger.isConnected) trigger.focus();
    }, 0);
  };
  useEffect(() => {
    if (!pos.ready) return;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [pos.ready]);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestore();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, trigger]);
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (event.key === "Tab") {
      event.preventDefault();
      closeAndRestore();
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextMenuIndex(current, event.key, items.length);
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };
  // Portal ile body'ye: menü sahnenin parçası değil, viewport overlay'i. Böylece
  // lobinin ".qt-lobby > * { position: relative }" kuralına ve .qt-activity'nin
  // overflow:hidden kırpmasına takılmadan gerçekten fixed konumlanır.
  return createPortal(
    <div
      id={`qt-host-menu-${player.id}`}
      ref={ref}
      className="qt-host-menu"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" } as CSSProperties}
      role="menu"
      aria-label={t("host.menuTitle")}
      onKeyDown={onMenuKeyDown}
    >
      <div className="qt-host-menu__head">
        <Avatar player={player} compact mode={mode} />
        <div>
          <b title={player.name}>
            {player.name}
            <TitleTag title={player.title} />
          </b>
          <small>{t("host.menuTitle")}</small>
        </div>
      </div>
      {mode === "team" && (
        <button
          className="qt-host-menu__item is-team"
          role="menuitem"
          onClick={() => {
            onSetTeam(player.id, player.team === 1 ? 0 : 1);
            closeAndRestore();
          }}
        >
          <Icon name="people" /> {t("team.swap", { team: player.team === 1 ? t("team.a") : t("team.b") })}
        </button>
      )}
      {!player.isBot && (
        <button
          className="qt-host-menu__item is-transfer"
          role="menuitem"
          onClick={() => {
            onTransfer(player.id);
            closeAndRestore();
          }}
        >
          <Icon name="crown" /> {t("host.transfer")}
        </button>
      )}
      <button
        className="qt-host-menu__item is-kick"
        role="menuitem"
        onClick={() => {
          onKick(player.id);
          closeAndRestore();
        }}
      >
        <Icon name="exit" /> {t("host.kick")}
      </button>
    </div>,
    document.body,
  );
}

/** Ses efektleri aç/kapa. Müzik toggle'ıyla aynı stil; varsayılan AÇIK. */
function SfxToggle() {
  const { t } = useI18n();
  const [on, setOn] = useState(() => sfx.isOn());
  return (
    <button
      className={`qt-music-toggle ${on ? "is-on" : ""}`}
      onClick={() => setOn(sfx.toggle())}
      title={t("sfx.toggle")}
      aria-label={t("sfx.toggle")}
      aria-pressed={on}
    >
      <Icon name={on ? "speaker" : "speakerOff"} />
    </button>
  );
}

/** Paket yükleme formu (yalnız host görür): JSON/CSV yapıştır + isteğe bağlı
 *  yönetici belirteci. Sunucu Faz 1.4 kurallarıyla doğrular; hatalar listelenir. */
function PackUploadForm({ auth, onUploaded }: { auth: PackAuth; onUploaded: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [content, setContent] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PackUploadResult | null>(null);
  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      // Elle yapıştırılan token öncelikli (başka oturumun sahipliği); boşsa
      // bileşen auth'u — mock modda devId düşer, yoksa 401 (B57).
      const pasted = token.trim();
      const res = await uploadPack({
        name: name.trim(),
        content,
        format,
        auth: pasted ? { sessionToken: pasted } : auth,
      });
      setResult(res);
      if (res.ok) {
        setContent("");
        onUploaded();
      }
    } catch {
      setResult({ ok: false, message: t("pack.failed") });
    }
    setBusy(false);
  };
  return (
    <div className="qt-pack-form">
      <input
        className="qt-pack-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("pack.name")}
        maxLength={60}
      />
      <div className="qt-count-row">
        {(["json", "csv"] as const).map((item) => (
          <button
            key={item}
            className={`qt-count-chip ${format === item ? "is-selected" : ""}`}
            aria-pressed={format === item}
            onClick={() => setFormat(item)}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      <textarea
        className="qt-pack-input"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={4}
        placeholder={t(format === "csv" ? "pack.pasteCsv" : "pack.pasteJson")}
        spellCheck={false}
      />
      <input
        className="qt-pack-input"
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder={t("pack.token")}
        autoComplete="off"
      />
      <button
        className="qt-button qt-pack-submit"
        disabled={busy || !name.trim() || !content.trim()}
        onClick={() => void submit()}
      >
        {t("pack.submit")}
      </button>
      {result && !result.ok && (
        <div className="qt-pack-feedback is-error">
          {result.message && <span>{result.message}</span>}
          {result.errors?.slice(0, 4).map((error) => (
            <span key={error}>{error}</span>
          ))}
          {(result.errors?.length ?? 0) > 4 && <span>+{(result.errors?.length ?? 0) - 4}</span>}
        </div>
      )}
      {result?.ok && (
        <div className="qt-pack-feedback is-ok">
          {t("pack.done", { count: result.pack?.count ?? 0 })}
          {result.warnings?.length ? ` · ${result.warnings.length} ⚠` : ""}
        </div>
      )}
    </div>
  );
}

function emptyPackQuestion(): PackQuestion {
  return {
    id: "",
    category: "",
    text: "",
    textEn: "",
    choices: ["", "", "", ""],
    choicesEn: ["", "", "", ""],
    correctIndex: 0,
    difficulty: "orta",
  };
}

/** Uygulama içi paket editörü: JSON/CSV yazmadan soru kartlarıyla paket kurar.
 *  Sahiplik sunucuda doğrulanır — tam içerik (doğru şıklar dahil) yalnızca
 *  paketi oluşturan kişiye döner; burada "Paketlerim" yalnız kendi paketlerini
 *  listeler. EN alanları boş bırakılırsa kaydetme sırasında TR'den kopyalanır. */
function PackEditor({
  packs,
  myId,
  auth,
  categories,
  onSaved,
}: {
  packs: QuestionPackMeta[];
  myId: string;
  auth: PackAuth;
  categories: string[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const mine = packs.filter((pack) => pack.createdBy === myId || (!auth.sessionToken && pack.createdBy === "dev"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState<PackQuestion[]>([emptyPackQuestion()]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<PackUploadResult | null>(null);

  const startNew = () => {
    setEditingId(null);
    setName("");
    setQuestions([emptyPackQuestion()]);
    setResult(null);
    setConfirmDelete(false);
  };
  const loadPack = async (id: string) => {
    setBusy(true);
    setResult(null);
    setConfirmDelete(false);
    const pack = await getPack(id, auth);
    if (!pack) {
      setResult({ ok: false, message: t("pack.loadFailed") });
      setBusy(false);
      return;
    }
    setEditingId(pack.id);
    setName(pack.name);
    // EN alanı TR ile aynıysa boş göster — "boş = TR kopya" kuralı görünür kalsın.
    setQuestions(
      pack.questions.map((q) => ({
        ...q,
        choices: [...q.choices],
        textEn: q.textEn === q.text ? "" : q.textEn,
        choicesEn: q.choices.map((c, i) => (q.choicesEn?.[i] && q.choicesEn[i] !== c ? q.choicesEn[i] : "")),
      })),
    );
    setBusy(false);
  };

  const patchQ = (i: number, patch: Partial<PackQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const patchChoice = (i: number, ci: number, value: string, en = false) =>
    setQuestions((qs) =>
      qs.map((q, j) => {
        if (j !== i) return q;
        const list = [...(en ? q.choicesEn : q.choices)];
        list[ci] = value;
        return en ? { ...q, choicesEn: list } : { ...q, choices: list };
      }),
    );

  const ready =
    !busy &&
    !!name.trim() &&
    questions.length > 0 &&
    questions.every((q) => q.text.trim() && q.category.trim() && q.choices.every((c) => c.trim()));
  const save = async () => {
    setBusy(true);
    setResult(null);
    const normalized = questions.map((q, i) => ({
      ...q,
      id: q.id.trim() || `q-${i + 1}`,
      category: q.category.trim(),
      text: q.text.trim(),
      textEn: q.textEn.trim() || q.text.trim(),
      choices: q.choices.map((c) => c.trim()),
      choicesEn: q.choices.map((c, ci) => q.choicesEn[ci]?.trim() || c.trim()),
    }));
    const res = await savePack({ id: editingId, name: name.trim(), questions: normalized, auth });
    setResult(res);
    if (res.ok) {
      setEditingId(res.pack?.id ?? editingId);
      setQuestions(normalized);
      onSaved();
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!editingId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const ok = await deletePack(editingId, auth);
    setBusy(false);
    if (ok) {
      startNew();
      setResult({ ok: true, message: t("pack.deleted") });
      onSaved();
    } else setResult({ ok: false, message: t("pack.failed") });
  };

  return (
    <div className="qt-pack-form qt-pack-editor">
      {mine.length > 0 && (
        <div className="qt-count-row qt-pack-mine">
          <button className={`qt-count-chip ${editingId === null ? "is-selected" : ""}`} onClick={startNew}>
            {t("pack.new")}
          </button>
          {mine.map((pack) => (
            <button
              key={pack.id}
              className={`qt-count-chip ${editingId === pack.id ? "is-selected" : ""}`}
              disabled={busy}
              onClick={() => void loadPack(pack.id)}
            >
              {pack.name}
              <small>{pack.count}</small>
            </button>
          ))}
        </div>
      )}
      <input
        className="qt-pack-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("pack.name")}
        maxLength={60}
      />
      <datalist id="qt-pack-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {questions.map((q, i) => (
        <div className="qt-pack-qcard" key={i}>
          <div className="qt-pack-qcard__head">
            <b>{t("pack.question", { n: i + 1 })}</b>
            <button
              className="qt-icon-button"
              onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              disabled={questions.length <= 1}
              aria-label={t("pack.qDelete")}
              title={t("pack.qDelete")}
            >
              <Icon name="close" />
            </button>
          </div>
          <input
            className="qt-pack-input"
            value={q.text}
            onChange={(event) => patchQ(i, { text: event.target.value })}
            placeholder={t("pack.qText")}
            maxLength={240}
          />
          <div className="qt-pack-qcard__row">
            <input
              className="qt-pack-input"
              value={q.category}
              onChange={(event) => patchQ(i, { category: event.target.value })}
              placeholder={t("pack.qCategory")}
              list="qt-pack-cats"
              maxLength={40}
            />
            <div className="qt-count-row">
              {(["kolay", "orta", "zor"] as const).map((d) => (
                <button
                  key={d}
                  className={`qt-count-chip ${q.difficulty === d ? "is-selected" : ""}`}
                  aria-pressed={q.difficulty === d}
                  onClick={() => patchQ(i, { difficulty: d })}
                >
                  {t(d === "kolay" ? "difficulty.easy" : d === "orta" ? "difficulty.medium" : "difficulty.hard")}
                </button>
              ))}
            </div>
          </div>
          <div className="qt-pack-choices">
            {q.choices.map((choice, ci) => (
              <label key={ci} className={`qt-pack-choice ${q.correctIndex === ci ? "is-correct" : ""}`}>
                <input
                  type="radio"
                  name={`qt-pack-correct-${i}`}
                  checked={q.correctIndex === ci}
                  onChange={() => patchQ(i, { correctIndex: ci })}
                  aria-label={t("pack.correct")}
                  title={t("pack.correct")}
                />
                <input
                  className="qt-pack-input"
                  value={choice}
                  onChange={(event) => patchChoice(i, ci, event.target.value)}
                  placeholder={t("pack.choice", { n: ci + 1 })}
                  maxLength={120}
                />
              </label>
            ))}
          </div>
          <details className="qt-pack-en">
            <summary>{t("pack.enOptional")}</summary>
            <input
              className="qt-pack-input"
              value={q.textEn}
              onChange={(event) => patchQ(i, { textEn: event.target.value })}
              placeholder={t("pack.qTextEn")}
              maxLength={240}
            />
            {q.choicesEn.map((choice, ci) => (
              <input
                key={ci}
                className="qt-pack-input"
                value={choice}
                onChange={(event) => patchChoice(i, ci, event.target.value, true)}
                placeholder={t("pack.choice", { n: ci + 1 })}
                maxLength={120}
              />
            ))}
          </details>
        </div>
      ))}
      <div className="qt-pack-actions">
        <button className="qt-count-chip" onClick={() => setQuestions((qs) => [...qs, emptyPackQuestion()])}>
          {t("pack.addQuestion")}
        </button>
        <button className="qt-button qt-pack-submit" disabled={!ready} onClick={() => void save()}>
          {t("pack.save")}
        </button>
        {editingId && (
          <button
            className={`qt-count-chip ${confirmDelete ? "is-danger" : ""}`}
            disabled={busy}
            onClick={() => void remove()}
          >
            {confirmDelete ? t("pack.deleteConfirm") : t("pack.deletePack")}
          </button>
        )}
      </div>
      {result && !result.ok && (
        <div className="qt-pack-feedback is-error">
          {result.message && <span>{result.message}</span>}
          {result.errors?.slice(0, 4).map((error) => (
            <span key={error}>{error}</span>
          ))}
          {(result.errors?.length ?? 0) > 4 && <span>+{(result.errors?.length ?? 0) - 4}</span>}
        </div>
      )}
      {result?.ok && (
        <div className="qt-pack-feedback is-ok">
          {result.message ?? t("pack.saved", { count: result.pack?.count ?? 0 })}
          {result.warnings?.length ? ` · ${result.warnings.length} ⚠` : ""}
        </div>
      )}
    </div>
  );
}

/** Soru yazarı formu (§6.3): metin + 4 şık + doğru şık. Yerel state —
 *  gönderim sunucuda doğrulanır; geçerliyse oyun state'indeki writers'a düşer. */
function WriterForm({
  hasWritten,
  onSubmit,
  onDelete,
}: {
  hasWritten: boolean;
  onSubmit: (q: { text: string; choices: string[]; correctIndex: number }) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const valid =
    text.trim().length >= 8 &&
    choices.every((c) => c.trim().length > 0) &&
    new Set(choices.map((c) => c.trim().toLocaleLowerCase("tr"))).size === 4;
  return (
    <form
      className="qt-writer-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ text: text.trim(), choices: choices.map((c) => c.trim()), correctIndex });
      }}
    >
      <input
        className="qt-writer-input"
        value={text}
        maxLength={200}
        placeholder={t("writeQ.prompt")}
        aria-label={t("writeQ.prompt")}
        onChange={(e) => setText(e.target.value)}
      />
      {choices.map((choice, i) => (
        <label key={i} className={`qt-writer-choice ${correctIndex === i ? "is-correct" : ""}`}>
          <input
            type="radio"
            name="qt-writer-correct"
            checked={correctIndex === i}
            onChange={() => setCorrectIndex(i)}
            aria-label={`${t("writeQ.correct")} ${"ABCD"[i]}`}
          />
          <input
            className="qt-writer-input"
            value={choice}
            maxLength={80}
            placeholder={t("writeQ.choice", { n: "ABCD"[i] })}
            onChange={(e) => setChoices(choices.map((c, ci) => (ci === i ? e.target.value : c)))}
          />
        </label>
      ))}
      <small className="qt-writer-hint">
        <Icon name="info" /> {t("writeQ.modes")}
      </small>
      <div className="qt-writer-actions">
        <button type="submit" className="qt-button qt-button--primary" disabled={!valid}>
          {t("writeQ.submit")}
        </button>
        {hasWritten && (
          <button type="button" className="qt-button qt-writer-delete" onClick={onDelete}>
            {t("writeQ.delete")}
          </button>
        )}
      </div>
    </form>
  );
}

function ActivityLobby({
  state,
  status,
  identity,
  language,
  onLanguageChange,
  onReady,
  onStart,
  onSetCategories,
  onSetQuestionCount,
  onSetDifficulty,
  onStartDaily,
  onSetPack,
  onSetQuestionTime,
  onSetSpeedBonus,
  onSetImageOnly,
  onSetTableTheme,
  onSetTitle,
  onSetMode,
  onSetTeam,
  onShuffleTeams,
  onKick,
  onTransferHost,
  onInvite,
  onSpectate,
  onTakeSeat,
  onSubmitQuestion,
  onDeleteQuestion,
  speakingIds,
  onHelp,
  onJoinPrivateRoom,
  onLeavePrivateRoom,
  onAddBot,
}: {
  state: GameState | null;
  status: string;
  identity: ReturnType<typeof useDiscordActivity>["identity"];
  speakingIds?: ReadonlySet<string>;
  language: ActivityLanguage;
  onLanguageChange: (language: ActivityLanguage) => void;
  onReady: (ready: boolean) => void;
  onStart: (mode: GameMode) => void;
  onStartDaily: () => void;
  onSetCategories: (categories: string[]) => void;
  onSetQuestionCount: (count: number) => void;
  onSetDifficulty: (difficulty: Difficulty | null) => void;
  onSetPack: (packId: string | null) => void;
  onSetQuestionTime: (ms: number | null) => void;
  onSetSpeedBonus: (value: boolean) => void;
  onSetImageOnly: (value: boolean) => void;
  onSetTableTheme: (theme: TableTheme) => void;
  onSetTitle: (title: BadgeKey | null) => void;
  onSetMode: (mode: GameMode) => void;
  onSetTeam: (id: string, team: number) => void;
  onShuffleTeams: () => void;
  onKick: (id: string) => void;
  onTransferHost: (id: string) => void;
  onInvite: (message: string) => Promise<boolean>;
  onSpectate: () => void;
  onTakeSeat: () => void;
  onSubmitQuestion: (q: { text: string; choices: string[]; correctIndex: number }) => void;
  /** Özel masa: kodu girilen web- odasına bağlanır; undefined kanala döner. */
  onJoinPrivateRoom: (code: string) => void;
  onLeavePrivateRoom: () => void;
  onDeleteQuestion: () => void;
  onHelp?: () => void;
  /** Yerel mock mod: boş koltuk bot oturtur (bkz. OrbitSeats). */
  onAddBot?: () => void;
}) {
  const { t } = useI18n();
  // Mod masa AYARIDIR ve sunucudan okunur: yerel state olsaydı host Fitil'i
  // seçtiğinde diğer oyuncuların merkez diski Klasik göstermeye devam ederdi.
  const mode: GameMode = state?.gameMode === "quiz" ? "classic" : (state?.gameMode ?? "classic");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hostMenu, setHostMenu] = useState<{ player: PublicPlayer; x: number; y: number; trigger: HTMLElement } | null>(
    null,
  );
  const self = state?.players.find((player) => player.id === state?.youId);
  const isHost = state?.hostId === state?.youId;
  const isSpectator = !!state?.youAreSpectator;
  const tableFull = (state?.players.length ?? 0) >= 8;
  const teamsReady = !!state && bothTeamsPresent(mode, state.players);
  // Sunucuyla aynı kural (rooms.ts start): host'un kendisi ve hâlâ sonuç
  // ekranına bakanlar "hazır" beklemez.
  const mustBeReady = (state?.players ?? []).filter(
    (player) => player.connected && player.id !== state?.hostId && !player.inResults,
  );
  const everyoneReady = mustBeReady.every((player) => player.ready);
  const enoughPlayers = !!state && state.players.filter((player) => player.connected).length >= state.minPlayers;
  const canStart = !!state && state.hostId === state.youId && enoughPlayers && everyoneReady && teamsReady;
  // Günlük her zaman Klasik oynanır: takım dengesi şartı ona uygulanmaz.
  const canStartDaily = !!state && state.hostId === state.youId && enoughPlayers && everyoneReady;
  const inResultsCount = (state?.players ?? []).filter((player) => player.inResults).length;
  // canStart false->true'ya döndüğü AN'da Başlat butonunda küçük bir patlama:
  // altın nabzın (is-launch-ready) yanına ek bir noktalama.
  const wasCanStart = useRef(canStart);
  const [startBurst, setStartBurst] = useState(0);
  useEffect(() => {
    if (canStart && !wasCanStart.current) setStartBurst(Date.now());
    wasCanStart.current = canStart;
  }, [canStart]);
  const compatible = (category: CategoryOption) =>
    mode === "circle" ? category.circleCount > 0 : category.classicCount > 0;
  // Oynanabilir kategoriler + henüz tamamen boş (planlanmış) kategoriler. Boşlar
  // pasif "yakında" gösterilir; soru eklenince otomatik oynanabilir olur.
  const categories = (state?.availableCategories || []).filter(
    (category) => compatible(category) || (category.classicCount === 0 && category.circleCount === 0),
  );
  const selectedCategories = (state?.categorySelection || []).filter((name) =>
    categories.some((category) => category.name === name),
  );
  const categorySummaryLabel = selectedCategories.length
    ? selectedCategories.map((name) => categoryLabel(language, name)).join(" · ")
    : t("category.mixed");
  const maxCategories = mode === "lightning" ? 1 : mode === "circle" ? 2 : 3;
  const orbitSize = useOrbitSize();
  const orbitRadius = Math.round(orbitSize / 2 - 30);
  // Masaüstünde ayarlar paneli hep açık olmalı. CSS-only zorlama (display:grid
  // !important) yetmiyor: <details> kapalıyken Chromium içindeki içeriği kendi
  // kutu boyutuna KATMIYOR (display override'a rağmen) — body görünmez taşma
  // olarak render olup üst kapsayıcının overflow:auto'suyla kırpılıyor. Gerçek
  // `open` özniteliğini imperatif olarak set etmek şart; controlled prop olarak
  // her render'da geçirmek DE olmaz (mobilde kullanıcının tıklamasını her state
  // güncellemesinde geri kapatırdı) — bu yüzden ref + tek seferlik efekt.
  const isDesktopSettings = useMinWidth(1001);
  const settingsPanelRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (isDesktopSettings && settingsPanelRef.current) settingsPanelRef.current.open = true;
  }, [isDesktopSettings]);
  // Uyumlu seti sunucunun seçimiyle karşılaştır: uzunluk eşitliği farklı
  // kategorileri yakalayamazdı (ör. [Tarih]→[Spor]); anahtarlar üzerinden
  // karşılaştırma hem bunu düzeltir hem her yayında efektin koşmasını keser.
  const selectedKey = selectedCategories.join("\u0000");
  const serverSelectionKey = (state?.categorySelection ?? []).join("\u0000");
  useEffect(() => {
    if (!isHost || selectedKey === serverSelectionKey) return;
    onSetCategories(selectedCategories);
  }, [isHost, onSetCategories, selectedCategories, selectedKey, serverSelectionKey]);
  const toggleCategory = (name: string) => {
    if (!isHost) return;
    const selectedNow = state?.categorySelection || [];
    const next = selectedNow.includes(name)
      ? selectedNow.filter((item) => item !== name)
      : [...selectedNow.filter((item) => categories.some((category) => category.name === item)), name].slice(
          -maxCategories,
        );
    onSetCategories(next);
  };
  // Soru sayısını modun doğal değerine döndürme işi SUNUCUDA (setGameMode):
  // tek olay, atomik değişim — istemciden çifte emit yarışı yok.
  const readyCount = mustBeReady.filter((player) => player.ready).length;
  // Özel soru paketleri (FAZ 4.4): liste HTTP'den; seçim masa ayarı olarak
  // state.pack üzerinden yayınlanır. Yükleme sonrası liste tazelenir.
  const [packs, setPacks] = useState<QuestionPackMeta[]>([]);
  useEffect(() => {
    let alive = true;
    void listPacks().then((list) => {
      if (alive) setPacks(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="qt-activity qt-lobby">
      <TableBackdrop />
      <img className="qt-lobby-owl" src="/emblems/owl.webp" alt="" aria-hidden="true" />
      {/* Marka şeridi yok: Discord uygulamanın adını zaten kendi arayüzünde
        gösteriyor, içeride tekrarı alçak iframe'de masadan yer çalıyordu.
        İşlevsel olanlar (müzik, dil) köşede yüzer; bağlantı rozeti yalnızca
        Discord DIŞINDA anlamlı — orada mock modda olduğunu bilmek gerekir. */}
      <div className="qt-lobby-controls">
        {!identity.isDiscord && (
          <div className={`qt-connection is-${status}`}>
            <i />
            {t(identity.webGuest ? "conn.guest" : "conn.local")}
          </div>
        )}
        <SfxToggle />
        <MusicToggle />
        <LanguagePicker language={language} onChange={onLanguageChange} />
        {onHelp && (
          <button
            type="button"
            className="qt-music-toggle qt-help-toggle"
            onClick={onHelp}
            title={t("table.howTo")}
            aria-label={t("table.howTo")}
          >
            ?
          </button>
        )}
      </div>

      <section className="qt-table-shell">
        {/* Sol: masa ayarları — yalnızca masa sahibi değiştirir, diğerleri salt-okunur görür */}
        <aside className="qt-settings" aria-label={t("table.settings")}>
          <details className="qt-settings-panel" ref={settingsPanelRef}>
            <summary className="qt-settings__head">
              <i aria-hidden="true">
                <Icon name="sliders" />
              </i>
              <div>
                <span>{t("table.settings")}</span>
                <b>
                  {t(MODE_KEYS[modeKeyOf(mode)].name)} · {categorySummaryLabel}
                </b>
              </div>
              <span className="qt-settings__chevron" aria-hidden="true">
                <Icon name="chevron" />
              </span>
            </summary>
            <div className="qt-settings__body">
              <div className="qt-settings__group">
                <span>{t("table.mode")}</span>
                {/* Klasik + Çember hep açık (en sık kullanılanlar); geri kalan üç mod
              (Fitil/Çifte Bahis/Takım) ModePicker'ın açılır panelinde — 5 kartı
              hep göstermek satır taşırıyor + gözü dağıtıyordu. */}
                <div className="qt-mode-list">
                  {(["classic", "circle"] as const).map((item) => (
                    <button
                      className={`qt-mode-card qt-mode-card--${item} ${mode === item ? "is-selected" : ""}`}
                      key={item}
                      disabled={!isHost}
                      aria-pressed={mode === item}
                      title={t(MODE_KEYS[item].meta)}
                      onClick={() => onSetMode(item)}
                    >
                      <i className="qt-mode-card__tile" aria-hidden="true">
                        <img src={MODE_EMBLEMS[item]} alt="" />
                      </i>
                      <b>{t(MODE_KEYS[item].name)}</b>
                    </button>
                  ))}
                  <ModePicker mode={mode} isHost={isHost} onSetMode={onSetMode} />
                </div>
              </div>

              {/* Takım modu: host tek dokunuşla takımları yeniden dağıtır. */}
              {mode === "team" && (
                <div className="qt-settings__group">
                  <span>{t("team.shuffleLabel")}</span>
                  <button className="qt-count-chip" disabled={!isHost} onClick={onShuffleTeams}>
                    <Icon name="shuffle" /> {t("team.shuffle")}
                  </button>
                </div>
              )}

              {/* Zorluk: mod'dan bağımsız, tüm modlara uygulanır. Karışık = tüm zorluklar. */}
              <div className="qt-settings__group">
                <span>{t("table.difficulty")}</span>
                <div className="qt-count-row qt-difficulty-row">
                  {([null, "kolay", "orta", "zor"] as const).map((d) => {
                    const selected = (state?.difficulty ?? null) === d;
                    const label =
                      d === null
                        ? "difficulty.mixed"
                        : d === "kolay"
                          ? "difficulty.easy"
                          : d === "orta"
                            ? "difficulty.medium"
                            : "difficulty.hard";
                    return (
                      <button
                        key={d ?? "mixed"}
                        className={`qt-count-chip ${selected ? "is-selected" : ""}`}
                        disabled={!isHost}
                        aria-pressed={selected}
                        onClick={() => onSetDifficulty(d)}
                      >
                        {t(label)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="qt-settings__group">
                <span>{t("category.label")}</span>
                <CategoryPicker
                  categories={categories}
                  selection={state?.categorySelection ?? []}
                  disabled={!isHost}
                  hint={
                    mode === "circle"
                      ? t("category.limit.two")
                      : mode === "lightning"
                        ? t("category.limit.one")
                        : t("category.limit.three")
                  }
                  mode={mode}
                  mastery={state?.progress?.categoryMastery}
                  onMixed={() => onSetCategories([])}
                  onToggle={toggleCategory}
                />
                <small className="qt-settings__note">
                  {mode === "circle"
                    ? t("category.limit.two")
                    : mode === "lightning"
                      ? t("category.limit.one")
                      : t("category.limit.three")}{" "}
                  · {t("table.timeFixed")}
                </small>
              </div>

              {/* İnce ayarlar: ikincil ayarlar katlanır bölüme taşındı — panel
            kısa ve okunaklı; yalnız mod/zorluk/kategori hep açık kalır. */}
              <details className="qt-fine">
                <summary className="qt-fine__head">
                  <span>{t("settings.fine")}</span>
                </summary>
                <div className="qt-fine__body">
                  {/* Çember'de aynı ayar tur sayısını taşır (10/15/20). Sayının anlam
                taşımadığı modlarda (duel/word/blitz/board) grup gizlenir — çip
                ölü kontrol olmasın. */}
                  {!COUNTLESS_MODES.includes(mode) && (
                    <div className="qt-settings__group">
                      <span>{t(mode === "circle" ? "table.roundCount" : "table.questionCount")}</span>
                      <div className="qt-count-row">
                        {(mode === "circle" ? CIRCLE_COUNTS : QUESTION_COUNTS).map((count) => (
                          <button
                            key={count}
                            className={`qt-count-chip ${state?.questionCount === count ? "is-selected" : ""}`}
                            disabled={!isHost}
                            aria-pressed={state?.questionCount === count}
                            onClick={() => onSetQuestionCount(count)}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Masa teması (§6.3): host'un ligi kilitleri açar; tema tüm masada. */}
                  <div className="qt-settings__group">
                    <span>{t("theme.label")}</span>
                    <div className="qt-count-row qt-theme-row">
                      {TABLE_THEMES.map((theme) => {
                        const unlocked =
                          LEAGUE_ORDER.indexOf(state?.progress?.league ?? "acemi") >=
                          LEAGUE_ORDER.indexOf(theme.league);
                        const selected = (state?.tableTheme ?? "tavern") === theme.key;
                        return (
                          <button
                            key={theme.key}
                            className={`qt-count-chip qt-theme-chip is-${theme.key} ${selected ? "is-selected" : ""}`}
                            disabled={!isHost || !unlocked}
                            aria-pressed={selected}
                            title={!unlocked ? t("theme.locked", { league: t(`league.${theme.league}`) }) : undefined}
                            onClick={() => onSetTableTheme(theme.key)}
                          >
                            {!unlocked && <Icon name="lock" />}
                            {t(`theme.${theme.key}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Süre/bonus/resim ayarları: süreye bağlı modlar (Çember/Fitil/
                Bulanık/Kelime) kendi sabitini kullanır; yalnız soru modlarında. */}
                  {MODE_CONTRACT[mode].tableTuning && (
                    <>
                      <div className="qt-settings__group">
                        <span>{t("table.questionTime")}</span>
                        <div className="qt-count-row">
                          {QUESTION_TIMES.map((ms) => (
                            <button
                              key={ms}
                              className={`qt-count-chip ${(state?.questionTimeMs ?? 15000) === ms ? "is-selected" : ""}`}
                              disabled={!isHost}
                              aria-pressed={(state?.questionTimeMs ?? 15000) === ms}
                              onClick={() => onSetQuestionTime(ms)}
                            >
                              {ms / 1000}sn
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="qt-settings__group">
                        <span>{t("table.speedBonus")}</span>
                        <div className="qt-count-row">
                          {[true, false].map((v) => (
                            <button
                              key={String(v)}
                              className={`qt-count-chip ${(state?.speedBonus ?? true) === v ? "is-selected" : ""}`}
                              disabled={!isHost}
                              aria-pressed={(state?.speedBonus ?? true) === v}
                              onClick={() => onSetSpeedBonus(v)}
                            >
                              {t(v ? "settings.on" : "settings.off")}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="qt-settings__group">
                        <span>{t("table.imageOnly")}</span>
                        <div className="qt-count-row">
                          {[true, false].map((v) => (
                            <button
                              key={String(v)}
                              className={`qt-count-chip ${(state?.imageOnly ?? false) === v ? "is-selected" : ""}`}
                              disabled={!isHost}
                              aria-pressed={(state?.imageOnly ?? false) === v}
                              onClick={() => onSetImageOnly(v)}
                            >
                              {t(v ? "settings.on" : "settings.off")}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Özel soru paketi (FAZ 4.4): Çember kendi prompt havuzunu kullandığı
            için grup yalnız soru modlarında gösterilir. Seçim masa ayarıdır. */}
                  {mode !== "circle" && (
                    <div className="qt-settings__group">
                      <span>{t("pack.label")}</span>
                      <div className="qt-count-row qt-pack-row">
                        <button
                          className={`qt-count-chip ${!state?.pack ? "is-selected" : ""}`}
                          disabled={!isHost}
                          aria-pressed={!state?.pack}
                          onClick={() => onSetPack(null)}
                        >
                          {t("pack.default")}
                        </button>
                        {packs.map((pack) => (
                          <button
                            key={pack.id}
                            className={`qt-count-chip qt-pack-chip ${state?.pack?.id === pack.id ? "is-selected" : ""}`}
                            disabled={!isHost}
                            aria-pressed={state?.pack?.id === pack.id}
                            title={t("pack.count", { count: pack.count })}
                            onClick={() => onSetPack(pack.id)}
                          >
                            {pack.name}
                            <small>{pack.count}</small>
                          </button>
                        ))}
                        {state?.pack && !packs.some((pack) => pack.id === state.pack?.id) && (
                          <span className="qt-count-chip is-selected qt-pack-chip">{state.pack.name}</span>
                        )}
                      </div>
                      {isHost && (
                        <details className="qt-pack-upload">
                          <summary>{t("pack.editor")}</summary>
                          <PackEditor
                            packs={packs}
                            myId={identity.user?.id ?? `dev:${getDevIdentity().id}`}
                            auth={{
                              sessionToken: identity.sessionToken ?? null,
                              devId: identity.isDiscord ? null : getDevIdentity().id,
                            }}
                            categories={(state?.availableCategories ?? []).map((c) => c.name)}
                            onSaved={() => void listPacks().then(setPacks)}
                          />
                        </details>
                      )}
                      {isHost && (
                        <details className="qt-pack-upload">
                          <summary>{t("pack.upload")}</summary>
                          <PackUploadForm
                            auth={{
                              sessionToken: identity.sessionToken ?? null,
                              devId: identity.isDiscord ? null : getDevIdentity().id,
                            }}
                            onUploaded={() => void listPacks().then(setPacks)}
                          />
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </details>
            </div>
          </details>
        </aside>

        {/* Orta: masa. Tasarımın kuralı — masa ortada kalır, ofsetle kaydırılmaz. */}
        {/* is-compact: küçük masada koltuk jetonları ve disk orantılı küçülür —
          sabit 58px jetonlar 230-400px'lik yörüngede diske biniyordu. */}
        <div
          data-theme={state?.tableTheme ?? "tavern"}
          className={`qt-orbit ${orbitSize < 400 ? "is-compact" : ""}`}
          style={{ "--orbit-size": `${orbitSize}px` } as CSSProperties}
          aria-label={t("table.seats")}
        >
          <div className="qt-orbit__shadow" aria-hidden="true" />
          <div className="qt-orbit__ring" aria-hidden="true" />
          <div className="qt-orbit__ring-inner" aria-hidden="true" />
          {/* Disk: mod amblemi + altında seçili mod/kategori özeti — sayfanın
            en büyük alanı boş kalmamalı (tasarım incelemesi). Hazır sayısı
            başlat butonunun altında kalır. */}
          <div className="qt-orbit__disc">
            <ModeTableScene mode={mode} />
            <div className="qt-orbit__meta" aria-hidden="true">
              <b>{t(MODE_KEYS[modeKeyOf(mode)].name)}</b>
              <span>{categorySummaryLabel}</span>
            </div>
          </div>
          <OrbitSeats
            state={state}
            radius={orbitRadius}
            onInvite={async () => {
              if (!(await onInvite(t("invite.shareText")))) setPickerOpen(true);
            }}
            viewerIsHost={isHost}
            onManage={(player, x, y, trigger) => setHostMenu({ player, x, y, trigger })}
            openManageId={hostMenu?.player.id ?? null}
            speakingIds={speakingIds}
            onAddBot={onAddBot}
          />
        </div>

        {/* Sağ: senin koltuğun — kendi kontrolün */}
        <aside className="qt-you-panel" aria-label={t("table.yourSeat")}>
          <TableLogo />
          <div className="qt-you-panel__head">
            <span>{t("table.yourSeat")}</span>
          </div>
          {/* İzleyiciyken koltuğun yok: kart "izliyorsun" der, buton "Oyna" (boş
            koltuğa oturt). Oyuncuyken normal hazır/başlat + "İzleyici ol". */}
          <div className="qt-you-card">
            {isSpectator ? (
              <>
                <i className="qt-you-card__eye" aria-hidden="true">
                  <Icon name="eye" />
                </i>
                <div>
                  <b>{t("spectator.watching")}</b>
                  <small>{t("spectator.count", { count: state?.spectatorCount ?? 1 })}</small>
                </div>
              </>
            ) : self ? (
              <>
                <Avatar player={self} />
                <div>
                  <b>
                    {self.name}
                    <TitleTag title={self.title} />
                  </b>
                  <small>{isHost ? t("lobby.host") : self.ready ? t("lobby.ready") : t("lobby.preparing")}</small>
                </div>
              </>
            ) : (
              <div className="qt-loading-line">{t("lobby.joining")}</div>
            )}
          </div>
          {isSpectator ? (
            <div className="qt-you-cta">
              <button className="qt-button qt-button--primary" disabled={tableFull} onClick={onTakeSeat}>
                <Icon name="people" /> {tableFull ? t("spectator.full") : t("spectator.play")}
              </button>
            </div>
          ) : (
            <>
              <div className="qt-you-cta">
                {!isHost && (
                  <button
                    className={`qt-button ${self?.ready ? "is-ready" : "qt-button--primary"}`}
                    disabled={!self}
                    onClick={() => onReady(!self?.ready)}
                  >
                    {self?.ready ? (
                      <>
                        <Icon name="check" /> {t("lobby.readyState")}
                      </>
                    ) : (
                      t("lobby.readyButton")
                    )}
                  </button>
                )}
                {/* Başlat: "Hazırım"ın altında. Sahip değilsen gösterilmez. */}
                {isHost && (
                  <>
                    <button
                      className={`qt-button qt-button--gold qt-start-table ${canStart ? "is-launch-ready" : ""}`}
                      disabled={!canStart}
                      onClick={() => onStart(mode)}
                    >
                      {t("table.start")}
                      {canStart && <Burst triggerKey={startBurst} />}
                    </button>
                    <button
                      className="qt-button qt-daily-start"
                      disabled={!canStartDaily}
                      title={t("daily.meta")}
                      onClick={onStartDaily}
                    >
                      <Icon name="calendar" /> {t("daily.start")}
                    </button>
                    {!canStart && (
                      <small className="qt-orbit__ready">
                        <i aria-hidden="true" />
                        {mode === "team" && !teamsReady
                          ? t("team.needBoth")
                          : t("table.readyCount", { ready: readyCount, total: mustBeReady.length })}
                      </small>
                    )}
                    {inResultsCount > 0 && (
                      <small className="qt-orbit__ready is-results">
                        <i aria-hidden="true" />
                        {t("lobby.inResults", { count: inResultsCount })}
                      </small>
                    )}
                  </>
                )}
              </div>
              {/* Oyuncu koltuğu bırakıp izleyebilir; izleyici sayısı da burada. */}
              {self && (
                <button className="qt-button qt-btn-home qt-spectate-btn" onClick={onSpectate}>
                  {t("spectator.become")}
                </button>
              )}
              {(state?.spectatorCount ?? 0) > 0 && (
                <small className="qt-spectator-count">
                  <Icon name="eye" /> {t("spectator.count", { count: state!.spectatorCount })}
                </small>
              )}
              {/* Soru yazarı turu (§6.3): lobide herkes bir soru yazabilir; sorular
                Klasik/Fitil/Takım/Son Masa maçlarına karışır. Yazar kendi turunda
                oynamaz, puan kazananların ortalamasını alır. */}
              {self && (
                <div className="qt-writer">
                  <details className="qt-writer__box">
                    <summary className="qt-button qt-writer__toggle">
                      <Icon name="scroll" /> {state?.writers?.includes(self.id) ? t("writeQ.done") : t("writeQ.button")}
                    </summary>
                    <WriterForm
                      hasWritten={!!state?.writers?.includes(self.id)}
                      onSubmit={onSubmitQuestion}
                      onDelete={onDeleteQuestion}
                    />
                  </details>
                  {(state?.writers?.length ?? 0) > 0 && (
                    <small className="qt-writer__count" title={t("writeQ.modes")}>
                      {t("writeQ.count", { count: state!.writers.length })}
                    </small>
                  )}
                </div>
              )}
            </>
          )}
          {/* Profil: ilerleme istatistikleri (XP/lig, rozetler, sezon/hafta/
            günlük tabloları) katlanabilir kartta — başlıkta seviye rozeti
            görünür kalır, liste lobi akışını şişirmez. */}
          {(state?.progress ||
            state?.seasonBoard ||
            state?.weeklyBoard ||
            state?.allTimeBoard ||
            state?.dailyBoard) && (
            <details className="qt-profile">
              <summary className="qt-profile__head">
                <span className="qt-profile__title">{t("profile.title")}</span>
                {state?.progress && (
                  <span className="qt-profile__chips">
                    <LeagueBadge badge={state.progress} />
                    <b>{t("progress.level", { n: state.progress.level })}</b>
                  </span>
                )}
              </summary>
              <div className="qt-profile__body">
                {state?.progress && <XpStrip snapshot={state.progress} title={self?.title} onTitle={onSetTitle} />}
                {state?.seasonBoard && <SeasonStrip state={state} />}
                {state?.weeklyBoard && <SeasonStrip state={state} weekly />}
                {state?.allTimeBoard && <SeasonStrip state={state} allTime />}
                {state?.dailyBoard && <DailyStrip state={state} />}
              </div>
            </details>
          )}
          {/* Özel masa: misafirler zaten ?room= koduyla gelir — kartı yalnız
            Discord/dev oyuncusuna göster. */}
          {!identity.webGuest && (
            <PrivateRoomCard state={state} onJoin={onJoinPrivateRoom} onLeave={onLeavePrivateRoom} />
          )}
          <div className="qt-howto">
            <span>{t("table.howTo")}</span>
            <p>{t("table.howToBody")}</p>
          </div>
        </aside>
      </section>
      {pickerOpen && (
        <div className="qt-invite-hint" role="status" onClick={() => setPickerOpen(false)}>
          {identity.isDiscord
            ? t("invite.failed")
            : identity.webGuest
              ? `${t("web.shareHint")}: ${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(
                  (state?.roomId ?? "").replace(/^web-/, ""),
                )}`
              : `${t("table.invite")}: ${state?.roomId}`}
        </div>
      )}
      {/* Menü yalnızca sen host isen VE hedef hâlâ masadaysa. Sahiplik devredince
        isHost düşer, at'ınca hedef listeden çıkar — ikisi de menüyü kapatır. */}
      {hostMenu && isHost && state?.players.some((player) => player.id === hostMenu.player.id) && (
        <HostMenu
          player={state.players.find((player) => player.id === hostMenu.player.id)!}
          x={hostMenu.x}
          y={hostMenu.y}
          trigger={hostMenu.trigger}
          mode={mode}
          onTransfer={onTransferHost}
          onKick={onKick}
          onSetTeam={onSetTeam}
          onClose={() => setHostMenu(null)}
        />
      )}
    </main>
  );
}

/**
 * Soru ve reveal tek ve aynı board'dur. Faz değişince hiçbir kart unmount olmaz;
 * sadece sınıflar ve rezerve alanların içeriği değişir. Kartların ölçüsü/konumu
 * her iki fazda birebir aynıdır (madde 1/9) — reveal, ayrı bir ekran değil,
 * aynı masanın ışıklarının yanmasıdır. Geçişi sunucu yapar; buradaki hiçbir
 * animasyon durumu ilerletmez (madde 8).
 */
/**
 * Son soru sinematiği (5b): son soru başlarken ışık kısılır, altın "SON SORU"
 * belirir. pointer-events YOK ve hızlıca solar — cevap süresini YEMEZ, altındaki
 * soruya baştan tıklanabilir; yalnız görsel bir vurgu. Süre oyun saatinden
 * (serverNow) türetilir, setTimeout değil: arka plan sekmesinde takılmaz.
 * Harflerin sırayla yükselmesi (tasarım notu) Adım 5 Motion'a bırakıldı.
 */
/** Soru metni uzunluğuna göre başlık ölçeği: puntoyu yalnız ekran boyutu değil
 *  metin de belirler — 200+ karakterlik soru 43px'te 6-7 satıra taşıp şıkları itiyordu. */
function questionLengthClass(text: string) {
  const len = text.length;
  return len > 170 ? "is-xlong" : len > 120 ? "is-long" : len > 80 ? "is-mid" : "";
}

const FINAL_INTRO_MS = 1500;
function FinalIntro({
  deadline,
  durationMs,
  serverNow,
}: {
  deadline?: number;
  durationMs?: number;
  serverNow?: number;
}) {
  const { t } = useI18n();
  const now = useServerNow(serverNow, 100);
  if (!deadline || !durationMs) return null;
  const elapsed = now - (deadline - durationMs);
  if (elapsed < 0 || elapsed >= FINAL_INTRO_MS) return null;
  const opacity = elapsed < 450 ? 1 : Math.max(0, 1 - (elapsed - 450) / (FINAL_INTRO_MS - 450));
  return (
    <div className="qt-final-intro" style={{ opacity }} aria-hidden="true">
      <span className="qt-final-intro__kicker">{t("final.kicker")}</span>
      <h1 className="qt-final-intro__title">{t("final.title")}</h1>
      <p className="qt-final-intro__sub">{t("final.subtitle")}</p>
    </div>
  );
}

/**
 * "Herkes doğru bildi" anı (6b): reveal'de HERKES doğru bildiğinde koltuk
 * avatarları masayı saran mint çembere dizilir + "Herkes bildi.". Ayrı bir
 * overlay (mutlak) — şık kartlarını KIMILDATMAZ (0px). "Herkes doğru" istemcide
 * türetilir: picks[doğru].length === eligibleCount (sunucu değişmedi). Bonus
 * sayısı YOK: gerçek puan mekaniği olmayan "+6" uydurma olurdu. Segmentlerin
 * birleşme animasyonu Adım 5 Motion'a bırakıldı.
 */
function GameBoard({
  state,
  onAnswer,
  onCircleAnswer,
  onWordAnswer,
  onWordLetter,
  onNumericAnswer,
  onOrderAnswer,
  onUseCard,
  onLeave,
  onSpectate,
  onReport,
  onPredict,
  onBuzz,
  speakingIds,
  emoteBar,
}: {
  state: GameState;
  onAnswer: (choice: number) => void;
  onCircleAnswer: (value: string) => void;
  onWordAnswer: (value: string) => void;
  onWordLetter: () => void;
  onNumericAnswer?: (value: number) => void;
  onOrderAnswer?: (order: number[]) => void;
  onUseCard: (type: CardType, targetId?: string) => void;
  onLeave: () => void;
  onSpectate: () => void;
  onReport: () => void;
  onPredict?: (targetId: string) => void;
  onBuzz?: () => void;
  speakingIds?: ReadonlySet<string>;
  emoteBar?: React.ReactNode;
}) {
  const youAreSpectator = state.youAreSpectator;
  const self = state.players.find((player) => player.id === state.youId);
  // Son Masa'da elenen oyuncu da cevap veremez — bekleme durumuyla aynı
  // kilit davranışını alır; metni 'Elendin' olarak ayrışır (aşağıda).
  const waiting = !!self?.waiting || (state.gameMode === "elim" && !!self && (self.lives ?? 0) <= 0);
  const { t, language } = useI18n();
  const isCircle = state.gameMode === "circle";
  const isWord = state.gameMode === "word";
  const isNumeric = state.gameMode === "numeric";
  const numeric = state.numeric;
  const isBlitz = state.gameMode === "blitz";
  const isTimeline = state.gameMode === "timeline";
  const [orderPick, setOrderPick] = useState<number[]>([]);
  useEffect(() => {
    setOrderPick([]);
  }, [state.timeline?.deadline]);
  const isZil = state.gameMode === "zil";
  const zilWinner = state.zil?.winnerId ?? null;
  const zilWinnerName = zilWinner ? state.players.find((p) => p.id === zilWinner)?.name : null;
  const zilYouWon = !!self && zilWinner === self.id;
  const zilYouFailed = !!self && !!state.zil?.failedIds.includes(self.id);
  const question = state.question;
  const circle = state.circle;
  const word = state.word;
  const beats = useRevealBeats(state);
  const [circleAnswer, setCircleAnswer] = useState("");
  const circleInputRef = useRef<HTMLInputElement>(null);
  // Her yeni çember/kelime turunda kutuyu temizle. Bağımlılık `circle?.deadline` /
  // `word?.deadline`: her tur değişir. (Eski `question?.deadline` çember modunda hep
  // undefined'dı — ölü bağımlılık; `circle?.letter` de ardışık turlar aynı harfi
  // taşıyınca tetiklenmiyordu.)
  useEffect(() => setCircleAnswer(""), [circle?.deadline, word?.deadline]);

  // Kelime Oyunu: birisi harf aldığında (açık harf sayısı arttıkça) hafif bir tik —
  // sosyal ipucu: "biri harf aldı" sessiz geçmesin. Kendi tıklama 'lock' çalar;
  // yeni turda maske sıfırlanır, tik yok.
  const wordOpenCount = useRef(0);
  const wordLettersKey = word?.letters.join(""); // maske dizisi yerine içerik anahtarı
  useEffect(() => {
    const open = word?.letters.filter(Boolean).length ?? 0;
    if (open > wordOpenCount.current && state.phase === "question") sfx.play("tick");
    wordOpenCount.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kasıtlı: harf İÇERİĞİ tetikler, dizi referansı değil
  }, [wordLettersKey, state.phase]);

  // Reveal'da soru/şık metinleri payload'dan düşer; son turu ekranda tutmak için saklarız.
  const lastRound = useRef<QuestionPayload | null>(null);
  if (question) lastRound.current = question;
  const shown = question ?? lastRound.current;
  const lastCircle = useRef<CirclePayload | null>(null);
  if (circle) lastCircle.current = circle;
  const shownCircle = circle ?? lastCircle.current;
  const lastWord = useRef<WordPayload | null>(null);
  if (word) lastWord.current = word;
  const lastNumeric = useRef<NumericQuestionPayload | null>(null);
  if (numeric) lastNumeric.current = numeric;
  const shownWord = word ?? lastWord.current;
  const shownNumeric = numeric ?? lastNumeric.current;
  useEffect(() => {
    if (state.phase !== "reveal" && state.phase !== "question") {
      lastRound.current = null;
      lastCircle.current = null;
      lastWord.current = null;
      lastNumeric.current = null;
    }
  }, [state.phase]);

  // "Bu soru hatalı": buton reveal'da görünür; her turda yalnız bir kez
  // tıklanabilir (sunucu tarafı da oyuncu+soru başına tek rapor tutar).
  const [reported, setReported] = useState(false);
  useEffect(() => setReported(false), [state.round.index]);

  // Sıradaki turun görseli reveal sırasında arka planda iner: soru açıldığında
  // sayaç görsel yüklemesini beklemeden başlar (sunucu nextImage'ı yollar).
  useEffect(() => {
    const next = state.reveal?.nextImage;
    if (next) new Image().src = `/questions/${next}`;
  }, [state.reveal?.nextImage]);

  // Resimli soru lightbox'ı: görsele tıkla → büyük önizle + kredi; ESC ya da
  // arka plan tıklaması kapatır. Yanıt kısayollarıyla çakışmasın diye açıkken
  // dialog rolü taşır (kısayol dinleyicisi dialog varsa erken çıkıyor).
  const [lightbox, setLightbox] = useState<{ src: string; credit?: string } | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lightbox) return;
    const root = lightboxRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Odak dialoga alınır ve Tab/Shift+Tab içinde döner — klavye kullanıcısı
    // arka plandaki cevap düğmelerine kaçamaz; kapanınca odak geri verilir.
    const focusables = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
            (el) => !el.hasAttribute("disabled"),
          )
        : [];
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(null);
        return;
      }
      if (event.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [lightbox]);

  // Tavern kartları (joker): yalnız Klasik/Takım, soru fazında, cevaptan önce,
  // tur başına bir. Dondur için rakip hedefi isteyen küçük seçici.
  const [freezePick, setFreezePick] = useState(false);
  useEffect(() => {
    setFreezePick(false);
  }, [state.round.index]);
  const correctIndex = state.reveal?.correctIndex;
  const selected = state.yourChoice;
  // Her soru tipi kendi deadline'ını taşır: numeric/blitz/timeline payload'ları
  // da deadline+durationMs gönderir — önceden yalnız circle/word/shown okunuyordu,
  // bu modlarda köşedeki mini sayaç hiç doğmuyordu.
  const deadline = isCircle
    ? shownCircle?.deadline
    : isWord
      ? shownWord?.deadline
      : isNumeric
        ? shownNumeric?.deadline
        : isBlitz
          ? state.blitz?.deadline
          : isTimeline
            ? state.timeline?.deadline
            : shown?.deadline;
  const durationMs = isCircle
    ? shownCircle?.durationMs
    : isWord
      ? shownWord?.durationMs
      : isNumeric
        ? shownNumeric?.durationMs
        : isBlitz
          ? state.blitz?.durationMs
          : isTimeline
            ? state.timeline?.durationMs
            : shown?.durationMs;
  // SFX tetikleri (Web Audio, dosyasız). Her olay BİR kez: geçişleri ref ile
  // yakala. Saat zaten var; tik için ayrı bir okuma (250ms yeter).
  const sfxNow = useServerNow(state.serverNow, 250);
  const secLeft = deadline ? Math.max(0, Math.ceil((deadline - sfxNow) / 1000)) : 99;
  // Süre sunucu saatine göre doldu: şıklar/kutu kilitlensin — sunucu geç
  // cevabı zaten yutar (err.lateAnswer toast'ı düşer), basılı tutan buton yanıltır.
  const expired = !!deadline && secLeft === 0;
  const locked = questionIsLocked({ selected, revealing: beats.active, spectator: youAreSpectator, waiting, expired });
  const circleLocked = circleAnswerIsLocked({
    answered: state.yourCircleAnswer !== null,
    revealing: beats.active,
    spectator: youAreSpectator,
    waiting,
    expired,
  });
  const wordLocked = circleAnswerIsLocked({
    answered: state.yourWordAnswer !== null,
    revealing: beats.active,
    spectator: youAreSpectator,
    waiting,
    expired,
  });
  const numericLocked = circleAnswerIsLocked({
    answered: state.yourNumericGuess !== null,
    revealing: beats.active,
    spectator: youAreSpectator,
    waiting,
    expired,
  });
  const cardsEnabled =
    (state.gameMode === "classic" || state.gameMode === "team") &&
    state.phase === "question" &&
    !waiting &&
    !youAreSpectator;
  const cardLocked =
    !cardsEnabled || selected !== null || state.yourCardUsed !== null || state.yourCards <= 0 || beats.active;
  // Ondalık virgülle de yazılabilir — gönderimde noktaya çevrilir.
  const numericParsed = Number(circleAnswer.trim().replace(",", "."));
  const numericReady = circleAnswer.trim() !== "" && Number.isFinite(numericParsed);
  // Çember reveal: kutuda oyuncunun KENDİ cevabı kalır; bildiyse yeşil, bilemediyse
  // kırmızı. Doğru cevap alttaki satırda yazar (eskiden kutu herkes için doğru
  // cevapla dolup yeşile dönüyordu — yanlış yazan kendini doğru sanıyordu).
  const circleVerdict: "right" | "wrong" | null =
    !beats.active || state.yourCircleAnswer === null
      ? null
      : state.circleReveal?.rankedPlayerIds.includes(state.youId)
        ? "right"
        : "wrong";
  const wordVerdict: "right" | "wrong" | null =
    !beats.active || state.yourWordAnswer === null
      ? null
      : state.wordReveal?.rankedPlayerIds.includes(state.youId)
        ? "right"
        : "wrong";
  useEffect(() => {
    if (
      !circleInputShouldFocus({
        hasPrompt: !!circle || !!word || !!numeric,
        locked: circle ? circleLocked : word ? wordLocked : numericLocked,
      })
    )
      return;
    const frame = window.requestAnimationFrame(() => circleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [circle?.deadline, word?.deadline, numeric?.deadline, circleLocked, wordLocked, numericLocked]);
  // Hic cevap vermeden reveal'a girdiysen sahne hafifce sallanir — tek sikkin
  // is-wrong sarsintisindan ayri, "hic secmedin" icin daha dramatik bir isaret.
  const youMissed = beats.cards && !isCircle && selected === null && !youAreSpectator;
  // Cevap dağılımı (5a): kaç kişi hangi şıkkı seçti. picks[index] = o şıkkı
  // seçenlerin id listesi. Yüzde tabanı = cevap verenlerin toplamı ("%60 B dedi").
  const totalPicks = (state.reveal?.picks ?? []).reduce((sum, ids) => sum + ids.length, 0);
  const accent = categoryAccent(isCircle ? shownCircle?.category : isWord ? shownWord?.category : shown?.category);
  const playerById = (id: string) => state.players.find((item) => item.id === id);

  // Reveal'de sayacın köşesine tur sonucu rozeti: sayaç yok olmak yerine
  // ✓/✗ durumuna geçer (ekranlar arası düzen tutarlı kalır). İzleyici ya da
  // turu bekleyen oyuncuda sonuç yok — rozet gösterilmez.
  const yourGain = (state.reveal?.gains ?? state.circleReveal?.gains ?? state.wordReveal?.gains)?.[state.youId];
  const resultMark: "right" | "wrong" | null =
    !beats.active || waiting || youAreSpectator
      ? null
      : isCircle
        ? circleVerdict === "right"
          ? "right"
          : "wrong"
        : isWord
          ? wordVerdict === "right"
            ? "right"
            : "wrong"
          : yourGain === undefined
            ? null
            : yourGain > 0
              ? "right"
              : "wrong";

  // Bulanık Resim: görsel soru süresi boyunca netleşir. Oran sunucu saatinden
  // türer (sfxNow), transform:scale kenar sızdırmazlığı için blur'le birlikte
  // azalır. Reveal'da (faz=question değil) görsel tamamen net.
  const suddenDeath = state.gameMode === "elim" && !beats.active && isSuddenDeath(state.players);
  const blurRemain =
    state.gameMode === "blur" && state.phase === "question" && deadline && durationMs
      ? Math.max(0, Math.min(1, (deadline - sfxNow) / durationMs))
      : 0;
  const blurPx = Math.round(blurRemain * 18 * 10) / 10;
  // Bulanık Resim'de soru fazındayken istemciye yalnız önceden bulanıklaştırılmış
  // varyant iner — orijinal dosya reveal'a kadar ağa hiç çıkmaz (CSS blur'u
  // devtools'tan silmek artık cevabı sızdırmaz).
  const questionImageSrc = (name: string | undefined) =>
    state.gameMode === "blur" && state.phase === "question" ? `/questions-blur/${name}` : `/questions/${name}`;
  const sfxRef = useRef({ revealed: false, gained: false, tick: -1 });
  useEffect(() => {
    const s = sfxRef.current;
    if (beats.active) {
      if (!s.revealed) {
        s.revealed = true;
        sfx.play("reveal");
      }
      if (beats.gains && !s.gained) {
        s.gained = true;
        const answered = isCircle
          ? state.yourCircleAnswer !== null
          : isWord
            ? state.yourWordAnswer !== null
            : state.yourChoice !== null;
        if (answered)
          sfx.play(
            (
              isCircle
                ? state.circleReveal?.rankedPlayerIds.includes(state.youId)
                : isWord
                  ? state.wordReveal?.rankedPlayerIds.includes(state.youId)
                  : ((state.reveal?.gains ?? state.circleReveal?.gains ?? state.wordReveal?.gains)?.[state.youId] ??
                      0) > 0
            )
              ? "correct"
              : "wrong",
          );
      }
    } else {
      s.revealed = false;
      s.gained = false;
      // Son 3sn'de tik'in üstüne giderek ağırlaşan kalp atışı katmanlanır — saat
      // yalnız görünmez, hissedilir de.
      if (secLeft >= 1 && secLeft <= 3 && s.tick !== secLeft) {
        s.tick = secLeft;
        sfx.play("tick");
        sfx.play(secLeft === 1 ? "heart3" : secLeft === 2 ? "heart2" : "heart");
      }
      if (secLeft > 3) s.tick = -1;
    }
  }, [
    beats.active,
    beats.gains,
    secLeft,
    isCircle,
    isWord,
    state.reveal,
    state.circleReveal,
    state.wordReveal,
    state.yourChoice,
    state.yourCircleAnswer,
    state.yourWordAnswer,
    state.youId,
  ]);

  // Zil: Space (veya B) fiziksel buton gibi — tıklamayla aynı şartlarda BAS
  // yapar. Yarış hızlı olduğu için klavyeden basmak fareyi bulmaktan adil.
  useEffect(() => {
    if (!isZil || beats.active || zilYouWon || waiting || zilWinner || zilYouFailed || !self) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key !== " " && event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      sfx.play("lock");
      onBuzz?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isZil, beats.active, zilYouWon, waiting, zilWinner, zilYouFailed, self, onBuzz]);

  // Klavye kısayolu: A/B/C/D veya 1/2/3/4 tıklamayla aynı işi yapar (kilitler).
  // Çember modunda serbest metin girişi var, kısayol orada devre dışı. Bir form
  // alanına yazarken ya da masadan-ayrıl onay kutusu açıkken de sessizce yutar.
  // removedChoices dep'te — %50 jokeri şıkkı sildikten sonra bayat closure
  // silinmiş index'i hâlâ kilitleyebilirdi.
  useEffect(() => {
    if (isCircle || locked) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!isPlainShortcut(event)) return;
      const index = shortcutIndex(event.key, 4);
      if (index === null || state.removedChoices.includes(index)) return;
      sfx.play("lock");
      onAnswer(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCircle, locked, onAnswer, state.removedChoices]);

  // Sahne görseli geri geldi: elipsi bunlarda sanıp kaldırmıştım, meğer
  // .qt-timer::after ekrana kaçıyormuş — görsellerin suçu yokmuş.
  return (
    <main
      className={`qt-activity qt-game qt-game--${state.gameMode} ${beats.active ? "is-revealing" : ""} ${shown?.fuseCritical ? "qt-game--fuse-critical" : ""}`}
      style={
        {
          "--game-art": `url('/assets/discord-activity/${isCircle ? "activity-circle-table.webp" : "activity-classic-stage.webp"}')`,
          "--cat-accent": accent,
        } as CSSProperties
      }
    >
      <div className="qt-game-background" />
      {/* Son soru sinematiği (5b): yalnız son turda, soru fazında; yıldırım hariç
        (o mod hıza dayanır, 1.5sn'lik vurgu orada orantısız). */}
      {state.round.index === state.round.total - 1 && !beats.active && state.gameMode !== "lightning" && (
        <FinalIntro deadline={deadline} durationMs={durationMs} serverNow={state.serverNow} />
      )}
      <div className="qt-game-head">
        <header className="qt-game-top">
          <div>
            <b>{t(MODE_KEYS[modeKeyOf(state.gameMode)].tag)}</b>
            {/* Nokta çubuğu zaten turu gösteriyor — 'Soru 3/10' aynı bilgiyi
              tekrarlıyordu. Metin yalnız noktaların okunamadığı çok-turlu
              modlarda (Çember, >12 tur) ve Blitz'te (doğru sayısı da taşır) kalır. */}
            {state.gameMode === "blitz" || state.round.total > PROGRESS_DOT_LIMIT ? (
              <span>
                {state.gameMode === "blitz"
                  ? state.blitz
                    ? t("blitz.progress", { n: state.blitz.index + 1, c: state.blitz.correct })
                    : t(MODE_KEYS.blitz.name)
                  : t(isCircle ? "game.roundOf" : "game.questionOf", {
                      index: state.round.index + 1,
                      total: state.round.total,
                    })}
              </span>
            ) : null}
          </div>
          {/* Blitz'te round.index hep 0 / total havuz boyutu — 'Soru 1/30' yanıltıcı;
            bar kendi ilerlemesini izler (B54). */}
          <RoundProgress
            index={state.gameMode === "blitz" ? (state.blitz?.index ?? 0) : state.round.index}
            total={state.round.total}
          />
          <span className="qt-game-summary">
            <span className="qt-game-summary__full">
              {beats.active
                ? t("game.revealed")
                : t("game.lockedCount", { answered: state.answeredCount, total: state.eligibleCount })}
            </span>
            <span className="qt-game-summary__short" aria-hidden="true">
              {beats.active ? (
                <Icon name="check" />
              ) : (
                <>
                  <Icon name="lock" />
                  {state.answeredCount}/{state.eligibleCount}
                </>
              )}
            </span>
          </span>
        </header>
        <div className="qt-game-controls">
          {!youAreSpectator && (
            <button
              type="button"
              className="qt-game-exit qt-game-spectate"
              onClick={onSpectate}
              title={t("spectator.become")}
            >
              {t("spectator.become")}
            </button>
          )}
          <GameHelpButton mode={state.gameMode} />
          <GameLeaveButton onLeave={onLeave} />
        </div>
      </div>
      <div className="qt-game-grid">
        <RoomStrip state={state} beats={beats} speakingIds={speakingIds} />
        <section className={`qt-question-stage ${youMissed ? "qt-stage-shake" : ""}`}>
          {/* Sayaç soru kartının sağ üst köşesinde mini rozet: ayrı sağ sütun
            kaldırıldı, kart merkezi tek odak. Reveal'de yerini sonuç/gain alır. */}
          {!beats.active && deadline ? (
            <Timer deadline={deadline} durationMs={durationMs} serverNow={state.serverNow} compact />
          ) : null}
          {resultMark ? (
            <div
              className={`qt-result-mark is-${resultMark}`}
              role="img"
              aria-label={t(resultMark === "right" ? "reveal.markRight" : "reveal.markWrong")}
              title={t(resultMark === "right" ? "reveal.markRight" : "reveal.markWrong")}
            >
              <Icon name={resultMark === "right" ? "check" : "close"} weight="bold" />
            </div>
          ) : null}
          {isCircle && shownCircle ? (
            <>
              <div className="qt-question-head qt-question-head--circle">
                <span className="qt-category">{categoryLabel(language, shownCircle.category)}</span>
                <span className="qt-circle-letter" aria-hidden="true" key={shownCircle.deadline}>
                  {language === "en" && shownCircle.letterEn ? shownCircle.letterEn : shownCircle.letter}
                </span>
                <p>{language === "en" && shownCircle.clueEn ? shownCircle.clueEn : shownCircle.clue}</p>
              </div>
              <div className="qt-circle-entry">
                <input
                  ref={circleInputRef}
                  value={beats.active ? (state.yourCircleAnswer ?? "") : (state.yourCircleAnswer ?? circleAnswer)}
                  disabled={circleLocked}
                  maxLength={48}
                  onChange={(event) => setCircleAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && circleAnswer.trim() && !circleLocked) {
                      event.preventDefault();
                      sfx.play("lock");
                      onCircleAnswer(circleAnswer);
                    }
                  }}
                  placeholder={beats.active ? t("review.noAnswer") : t("circle.placeholder")}
                  aria-label={t("circle.placeholder")}
                  className={
                    circleVerdict === "right"
                      ? "is-correct"
                      : circleVerdict === "wrong"
                        ? "is-wrong"
                        : state.yourCircleAnswer !== null
                          ? "is-locked"
                          : ""
                  }
                />
                <button
                  className={`qt-button ${circleLocked ? "qt-circle-lock is-locked" : "qt-button--primary qt-circle-lock"}`}
                  disabled={!circleAnswer.trim() || circleLocked}
                  onClick={() => {
                    sfx.play("lock");
                    onCircleAnswer(circleAnswer);
                  }}
                >
                  {circleLocked && state.yourCircleAnswer !== null ? (
                    <>
                      <Icon name="check" /> {t("circle.lockedShort")}
                    </>
                  ) : (
                    <>
                      <Icon name="lock" /> {t("circle.lock")}
                    </>
                  )}
                </button>
              </div>
              <p className="qt-locked-note" data-empty={!state.yourCircleAnswer && !beats.active && !waiting}>
                {beats.active ? (
                  <>
                    <span className="qt-check-draw">
                      <Icon name="check" />
                    </span>{" "}
                    {t("circle.correctAnswer")}{" "}
                    <b>
                      {language === "en" && state.circleReveal?.answerEn
                        ? state.circleReveal.answerEn
                        : state.circleReveal?.answer}
                    </b>
                  </>
                ) : waiting ? (
                  t("game.waitingNextRound")
                ) : state.yourCircleAnswer ? (
                  <>
                    <Icon name="check" /> {t("circle.answerLocked")}
                  </>
                ) : null}
              </p>
            </>
          ) : isWord && shownWord ? (
            <>
              {/* Kelime Oyunu: harf kutuları + ipucu + değer + ortak havuz. Reveal'da
            kutular tam cevabı gösterir (maskenin son hâli yerine). */}
              <div className="qt-question-head qt-question-head--word">
                <span className="qt-category">{categoryLabel(language, shownWord.category)}</span>
                <div className="qt-word-letters" aria-label={t("word.lettersLabel")}>
                  {(beats.active && state.wordReveal
                    ? [
                        ...(language === "en" && state.wordReveal.answerEn
                          ? state.wordReveal.answerEn
                          : state.wordReveal.answer),
                      ]
                    : language === "en" && shownWord.lettersEn?.length
                      ? shownWord.lettersEn
                      : shownWord.letters
                  ).map((ch, i) => (
                    <i key={i} className={ch ? "is-open" : ""}>
                      {ch ?? ""}
                    </i>
                  ))}
                </div>
                <p className="qt-word-clue">
                  {language === "en" && shownWord.clueEn ? shownWord.clueEn : shownWord.clue}
                </p>
                <div className="qt-word-meta">
                  <span className="qt-word-value" title={t("word.value")}>
                    <Icon name="coins" />
                    {formatNumber(language, shownWord.value)}
                  </span>
                  <span className="qt-word-pool" title={t("word.pool")}>
                    <Icon name="fuse" />
                    {t("word.poolValue", { s: Math.max(0, Math.ceil(shownWord.poolMs / 1000)) })}
                  </span>
                  <button
                    type="button"
                    className="qt-button qt-word-letter"
                    disabled={wordLocked || beats.active}
                    onClick={() => {
                      sfx.play("lock");
                      onWordLetter();
                    }}
                  >
                    <Icon name="scroll" /> {t("word.takeLetter")}
                  </button>
                </div>
              </div>
              <div className="qt-circle-entry">
                <input
                  ref={circleInputRef}
                  value={beats.active ? (state.yourWordAnswer ?? "") : (state.yourWordAnswer ?? circleAnswer)}
                  disabled={wordLocked}
                  maxLength={48}
                  onChange={(event) => setCircleAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && circleAnswer.trim() && !wordLocked) {
                      event.preventDefault();
                      sfx.play("lock");
                      onWordAnswer(circleAnswer);
                    }
                  }}
                  placeholder={beats.active ? t("review.noAnswer") : t("word.placeholder")}
                  aria-label={t("word.placeholder")}
                  className={
                    wordVerdict === "right"
                      ? "is-correct"
                      : wordVerdict === "wrong"
                        ? "is-wrong"
                        : state.yourWordAnswer !== null
                          ? "is-locked"
                          : ""
                  }
                />
                <button
                  className={`qt-button ${wordLocked ? "qt-circle-lock is-locked" : "qt-button--primary qt-circle-lock"}`}
                  disabled={!circleAnswer.trim() || wordLocked}
                  onClick={() => {
                    sfx.play("lock");
                    onWordAnswer(circleAnswer);
                  }}
                >
                  {wordLocked && state.yourWordAnswer !== null ? (
                    <>
                      <Icon name="check" /> {t("circle.lockedShort")}
                    </>
                  ) : (
                    <>
                      <Icon name="lock" /> {t("circle.lock")}
                    </>
                  )}
                </button>
              </div>
              <p className="qt-locked-note" data-empty={!state.yourWordAnswer && !beats.active && !waiting}>
                {beats.active ? (
                  <>
                    <span className="qt-check-draw">
                      <Icon name="check" />
                    </span>{" "}
                    {t("circle.correctAnswer")}{" "}
                    <b>
                      {language === "en" && state.wordReveal?.answerEn
                        ? state.wordReveal.answerEn
                        : state.wordReveal?.answer}
                    </b>
                  </>
                ) : waiting ? (
                  t("game.waitingNextRound")
                ) : state.yourWordAnswer ? (
                  <>
                    <Icon name="check" /> {t("circle.answerLocked")}
                  </>
                ) : null}
              </p>
            </>
          ) : isNumeric && shownNumeric ? (
            <>
              {/* Yakın Tahmin (§6.1): soru metni + sayı kutusu. Reveal'da sayı
            doğrusu — tahminler mesafe sırasında, kazanan(lar) vurgulu. */}
              <div className="qt-question-head qt-question-head--numeric">
                <span className="qt-category">{categoryLabel(language, shownNumeric.category)}</span>
                <h1 className={questionLengthClass(language === "en" ? shownNumeric.textEn : shownNumeric.text)}>
                  {language === "en" ? shownNumeric.textEn : shownNumeric.text}
                </h1>
              </div>
              {beats.active && state.reveal?.numeric ? (
                <div className="qt-numeric-board" role="list">
                  {(() => {
                    const nr = state.reveal.numeric;
                    const unit = language === "en" ? nr.unitEn : nr.unit;
                    const rows = Object.entries(nr.guesses)
                      .map(([id, guess]) => ({ id, guess, dist: Math.abs(guess - nr.answer) }))
                      .sort((a, b) => a.dist - b.dist);
                    const range = Math.max(Math.abs(nr.answer), ...rows.map((r) => Math.abs(r.guess)), 1);
                    return (
                      <>
                        <p className="qt-numeric-answer">
                          <Icon name="check" /> {t("numeric.answer")}{" "}
                          <b>
                            {formatNumber(language, nr.answer)} {unit}
                          </b>
                        </p>
                        {rows.map((row) => {
                          const player = state.players.find((p) => p.id === row.id);
                          const won = nr.winnerIds.includes(row.id);
                          const runnerUp = !won && (nr.runnerUpIds ?? []).includes(row.id);
                          const pct = Math.min(100, (Math.abs(row.guess) / range) * 100);
                          return (
                            <div key={row.id} role="listitem" className={`qt-numeric-row ${won ? "is-winner" : ""}`}>
                              <span className="qt-numeric-name">{player ? player.name : row.id}</span>
                              <span className="qt-numeric-guess">
                                {formatNumber(language, row.guess)} <em>{unit}</em>
                              </span>
                              <span className="qt-numeric-bar" aria-hidden="true">
                                <i style={{ width: `${pct}%` }} />
                              </span>
                              <span className="qt-numeric-dist">
                                {won
                                  ? t("numeric.closest")
                                  : runnerUp
                                    ? t("numeric.runnerUp")
                                    : `±${formatNumber(language, Math.round(row.dist * 100) / 100)}`}
                              </span>
                            </div>
                          );
                        })}
                        {rows.length === 0 ? <p className="qt-locked-note">{t("numeric.noGuesses")}</p> : null}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="qt-circle-entry">
                  <input
                    ref={circleInputRef}
                    inputMode="decimal"
                    value={state.yourNumericGuess !== null ? String(state.yourNumericGuess) : circleAnswer}
                    disabled={numericLocked}
                    maxLength={16}
                    onChange={(event) => setCircleAnswer(event.target.value.replace(/[^0-9,.−-]/g, ""))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && numericReady && !numericLocked) {
                        event.preventDefault();
                        sfx.play("lock");
                        onNumericAnswer?.(numericParsed);
                      }
                    }}
                    placeholder={t("numeric.placeholder")}
                    aria-label={t("numeric.placeholder")}
                    className={state.yourNumericGuess !== null ? "is-locked" : ""}
                  />
                  <span className="qt-numeric-unit">{language === "en" ? shownNumeric.unitEn : shownNumeric.unit}</span>
                  <button
                    className={`qt-button ${numericLocked ? "qt-circle-lock is-locked" : "qt-button--primary qt-circle-lock"}`}
                    disabled={!numericReady || numericLocked}
                    onClick={() => {
                      sfx.play("lock");
                      onNumericAnswer?.(numericParsed);
                    }}
                  >
                    {numericLocked && state.yourNumericGuess !== null ? (
                      <>
                        <Icon name="check" /> {t("circle.lockedShort")}
                      </>
                    ) : (
                      <>
                        <Icon name="lock" /> {t("circle.lock")}
                      </>
                    )}
                  </button>
                </div>
              )}
              {!beats.active ? (
                <p className="qt-locked-note" data-empty={state.yourNumericGuess === null}>
                  {state.yourNumericGuess !== null ? (
                    <>
                      <Icon name="check" /> {t("circle.answerLocked")}
                    </>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : isBlitz ? (
            <>
              {/* D/Y Blitz (§6.1): herkes kendi ifade akışında ilerler — ortak 60 sn
            penceresi + seri çarpanı. `blitz.statement` izleyenin kişisel ifadesi;
            truth istemciye hiç gelmez. Reveal'da skor-sıralı özet tablosu. */}
              {state.blitzSummary ? (
                <div className="qt-blitz-board" role="list">
                  {state.blitzSummary.rows.map((row, rank) => {
                    const player = state.players.find((p) => p.id === row.id);
                    return (
                      <div
                        key={row.id}
                        role="listitem"
                        className={`qt-blitz-row ${rank === 0 ? "is-correct" : ""} ${row.id === self?.id ? "is-you" : ""}`}
                      >
                        <span className="qt-blitz-mark">{rank === 0 ? <Icon name="crown" /> : rank + 1}</span>
                        <span className="qt-blitz-label">{player ? player.name : row.id}</span>
                        <span className="qt-blitz-pickers">
                          {row.correct}/{row.answered} {t("blitz.correctShort")} · {formatNumber(language, row.score)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : state.blitz?.statement ? (
                <>
                  <div className="qt-question-head">
                    <span className="qt-category">{categoryLabel(language, state.blitz.statement.category)}</span>
                    <h1
                      className={questionLengthClass(
                        language === "en" && state.blitz.statement.textEn
                          ? state.blitz.statement.textEn
                          : state.blitz.statement.text,
                      )}
                    >
                      {language === "en" && state.blitz.statement.textEn
                        ? state.blitz.statement.textEn
                        : state.blitz.statement.text}
                    </h1>
                  </div>
                  <p className="qt-blitz-claim" key={state.blitz.index}>
                    <span>{t("blitz.claim")}</span>
                    <b>
                      {language === "en" && state.blitz.statement.claimEn
                        ? state.blitz.statement.claimEn
                        : state.blitz.statement.claim}
                    </b>
                  </p>
                  <p className="qt-blitz-meta">
                    <span title={t("blitz.streak")}>
                      <Icon name="flame" /> ×{state.blitz.streak}
                    </span>
                    {state.blitz.streakAtCap ? (
                      <span className="qt-blitz-max" title={t("blitz.maxStreak")}>
                        {t("blitz.maxStreak")}
                      </span>
                    ) : null}
                    <span>{t("blitz.progress", { n: state.blitz.index + 1, c: state.blitz.correct })}</span>
                  </p>
                  <div className="qt-blitz-btns" role="group" aria-label={t("mode.blitz")}>
                    {[0, 1].map((idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`qt-blitz-btn ${idx === 0 ? "qt-blitz-btn--true" : "qt-blitz-btn--false"}`}
                        disabled={waiting}
                        onClick={() => {
                          sfx.play("lock");
                          onAnswer(idx);
                        }}
                      >
                        {idx === 0 ? (
                          <>
                            <Icon name="check" /> {t("blitz.true")}
                          </>
                        ) : (
                          <>
                            <Icon name="close" /> {t("blitz.false")}
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="qt-locked-note">{state.blitz ? t("blitz.done") : t("game.waitingNextRound")}</p>
              )}
            </>
          ) : isTimeline ? (
            <>
              {/* Zaman Çizelgesi (§6.1): 4 olayı en eskiden yeniye sırayla dokun.
            Yıllar soru fazında gizli; her doğru pozisyon +100. Reveal'da doğru
            sıra yıllarıyla açılır, herkesin dizimi ve isabeti listelenir. */}
              {state.timelineReveal ? (
                <div className="qt-order-board">
                  <ol className="qt-order-sol" role="list">
                    {state.timelineReveal.ordered.map((e, i) => (
                      <li key={i} className="qt-order-solrow">
                        <span className="qt-order-rank">{i + 1}</span>
                        <span className="qt-order-label">{language === "en" && e.labelEn ? e.labelEn : e.label}</span>
                        <em className="qt-order-when">{language === "en" && e.whenEn ? e.whenEn : e.when}</em>
                      </li>
                    ))}
                  </ol>
                  <div className="qt-order-results">
                    {state.players
                      .filter((p) => !p.waiting)
                      .map((p) => {
                        const order = state.timelineReveal!.orders[p.id];
                        const seq =
                          order && state.timeline
                            ? order
                                .map((ev) => {
                                  const disp = state.timeline!.orderIdx.indexOf(ev);
                                  const label =
                                    language === "en" && state.timeline!.itemsEn
                                      ? state.timeline!.itemsEn[disp]
                                      : state.timeline!.items[disp];
                                  return label;
                                })
                                .join(" → ")
                            : "—";
                        return (
                          <div key={p.id} className={`qt-order-row ${p.id === self?.id ? "is-you" : ""}`}>
                            <span className="qt-order-hit">{state.timelineReveal!.hits[p.id] ?? 0}/4</span>
                            <span className="qt-blitz-label">{p.name}</span>
                            <span className="qt-blitz-pickers">{seq}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : state.timeline ? (
                <>
                  <div className="qt-question-head">
                    <span className="qt-category">{categoryLabel(language, state.timeline.category)}</span>
                    <h1
                      className={questionLengthClass(
                        language === "en" && state.timeline.textEn ? state.timeline.textEn : state.timeline.text,
                      )}
                    >
                      {language === "en" && state.timeline.textEn ? state.timeline.textEn : state.timeline.text}
                    </h1>
                  </div>
                  <p className="qt-order-hint">{t("order.hint")}</p>
                  <ol className="qt-order-list" role="list">
                    {state.timeline.items.map((label, i) => {
                      const pos = orderPick.indexOf(state.timeline!.orderIdx[i]);
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            disabled={state.yourOrder !== null || waiting}
                            className={`qt-order-item ${pos >= 0 ? "is-picked" : ""}`}
                            onClick={() => {
                              const ev = state.timeline!.orderIdx[i];
                              let next: number[];
                              if (pos >= 0)
                                next = orderPick.slice(0, pos); // geri al: sonrasını sil
                              else next = [...orderPick, ev];
                              setOrderPick(next);
                              sfx.play("lock");
                              if (next.length === state.timeline!.items.length) onOrderAnswer?.(next);
                            }}
                          >
                            {pos >= 0 && <span className="qt-order-badge">{pos + 1}</span>}
                            {language === "en" && state.timeline!.itemsEn ? state.timeline!.itemsEn[i] : label}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="qt-locked-note" data-empty={state.yourOrder === null}>
                    {state.yourOrder !== null ? (
                      <>
                        <Icon name="check" /> {t("circle.answerLocked")}
                      </>
                    ) : (
                      t("order.progress", { n: orderPick.length, total: state.timeline.items.length })
                    )}
                  </p>
                </>
              ) : null}
            </>
          ) : shown ? (
            <>
              <div className={`qt-question-head ${shown.image ? "has-image" : ""}`} key={shown.text}>
                <span className="qt-sr-only" role="status" aria-live="polite">
                  {language === "en" ? shown.textEn : shown.text}
                </span>
                <span className="qt-category">
                  {categoryLabel(language, shown.category)}
                  {/* Son Masa ani ölüm: masa ikiye indiyse ya da iki kişilik masada
                    ikisinin de tek canı kaldıysa (isSuddenDeath). Eskiden sahnenin
                    üst kenarına mutlak konumluydu: kaydırma kabı onu kırpıyor,
                    telefonda bu çipin üstüne biniyordu — artık çipin parçası. */}
                  {suddenDeath ? (
                    <em className="qt-sudden-death" role="note">
                      <Icon name="heart" weight="fill" />
                      {t("elim.suddenDeath")}
                    </em>
                  ) : null}
                  {shown.dailyDouble ? (
                    <em className="qt-dd-tag" role="note" aria-label={t("board.dailyDoubleAria")}>
                      <Icon name="star" />
                      {t("board.dailyDouble")}
                    </em>
                  ) : null}
                  {shown.writtenByName ? (
                    <em className="qt-writer-tag">
                      <Icon name="scroll" />
                      {t("writeQ.tag", { name: shown.writtenByName })}
                    </em>
                  ) : null}
                </span>
                <div className="qt-question-body">
                  {shown.image && (
                    <figure className="qt-question-figure">
                      <button
                        type="button"
                        className="qt-question-imagebtn"
                        onClick={() => {
                          sfx.play("lock");
                          setLightbox({ src: questionImageSrc(shown.image), credit: shown.imageCredit });
                        }}
                        aria-label={t("game.imageZoom")}
                      >
                        <img
                          className="qt-question-image"
                          src={questionImageSrc(shown.image)}
                          alt={t("game.imageAlt")}
                          fetchPriority="high"
                          style={blurPx > 0.2 ? { filter: `blur(${blurPx}px)`, transform: "scale(1.08)" } : undefined}
                        />
                      </button>
                      {shown.imageCredit && (
                        <figcaption className="qt-question-credit">
                          <Icon name="info" />
                          <span>{shown.imageCredit}</span>
                        </figcaption>
                      )}
                    </figure>
                  )}
                  <h1 className={questionLengthClass(language === "en" ? shown.textEn : shown.text)}>
                    {language === "en" ? shown.textEn : shown.text}
                  </h1>
                </div>
              </div>
              {cardsEnabled ? (
                <div className="qt-card-bar">
                  <span className={`qt-card-count ${state.yourCards <= 0 ? "is-empty" : ""}`} title={t("card.title")}>
                    <Icon name="deck" />
                    <b>{t("card.deck")}</b>
                    <em>×{state.yourCards}</em>
                  </span>
                  {CARD_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`qt-card is-${type} ${freezePick && type === "freeze" ? "is-picking" : ""}`}
                      title={t(`card.${type}.hint`)}
                      aria-label={t(`card.${type}.hint`)}
                      disabled={cardLocked}
                      onClick={() => {
                        if (type === "freeze") {
                          setFreezePick((open) => !open);
                          return;
                        }
                        sfx.play("lock");
                        onUseCard(type);
                      }}
                    >
                      <Icon
                        name={
                          type === "fifty"
                            ? "percent"
                            : type === "double"
                              ? "double"
                              : type === "shield"
                                ? "shield"
                                : "snowflake"
                        }
                      />
                      <b>{t(`card.${type}`)}</b>
                    </button>
                  ))}
                  {state.yourCardUsed ? (
                    <em className="qt-card-tag">
                      <Icon name="check" />
                      {t(`card.${state.yourCardUsed}`)}
                    </em>
                  ) : null}
                  {state.youFrozen ? (
                    <em className="qt-card-tag is-frozen">
                      <Icon name="snowflake" />
                      {t("card.frozenYou")}
                    </em>
                  ) : null}
                  {freezePick && !cardLocked ? (
                    <div className="qt-card-targets" role="group" aria-label={t("card.freeze.pick")}>
                      {state.players
                        .filter(
                          (item) =>
                            item.id !== state.youId &&
                            item.connected &&
                            !item.waiting &&
                            !item.answered &&
                            (state.gameMode !== "team" ||
                              item.team === undefined ||
                              item.team !== state.players.find((p) => p.id === state.youId)?.team),
                        )
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="qt-card-target"
                            onClick={() => {
                              sfx.play("lock");
                              onUseCard("freeze", item.id);
                              setFreezePick(false);
                            }}
                          >
                            <Avatar player={item} compact />
                            {item.name}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {/* Zil (§6.1): henüz kimse basmadıysa herkes BAS'a yarışır; zili
            kazanan şıkları görür, diğerleri "X cevaplıyor" izler. Reveal'de
            grid herkese döner (sonuç gösterimi). */}
              {isZil && !beats.active && !zilYouWon && !waiting ? (
                <div className="qt-zil-panel" role="status">
                  {zilWinnerName ? (
                    <p className="qt-zil-status">
                      <Icon name="bolt" weight="fill" /> {t("zil.answering", { name: zilWinnerName })}
                    </p>
                  ) : zilYouFailed ? (
                    <p className="qt-zil-status is-out">
                      <Icon name="close" /> {t("zil.out")}
                    </p>
                  ) : self ? (
                    <button
                      type="button"
                      className="qt-zil-buzz"
                      onClick={() => {
                        sfx.play("lock");
                        onBuzz?.();
                      }}
                    >
                      <Icon name="bolt" weight="fill" /> {t("zil.buzz")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isZil && !beats.active && zilYouWon ? (
                <p className="qt-zil-status is-you">
                  <Icon name="bolt" weight="fill" /> {t("zil.yourTurn")}
                </p>
              ) : null}
              {shown.writtenByYou || (isZil && !beats.active && !zilYouWon) ? (
                shown.writtenByYou ? (
                  <p className="qt-writer-note">
                    <Icon name="eye" /> {t("writeQ.youWrote")}
                  </p>
                ) : null
              ) : (
                <div className="qt-answers">
                  {(language === "en" ? shown.choicesEn : shown.choices).map((choice, index) => {
                    const removed = state.removedChoices.includes(index);
                    // %50 jokerinin sildiği şık artık hiç render edilmez —
                    // soluk boş kutu "doldurulmamış C/D" gibi okunuyordu.
                    if (removed) return null;
                    const isCorrect = beats.cards && index === correctIndex;
                    const isWrong = beats.cards && selected === index && index !== correctIndex;
                    const isDimmed = beats.cards && !isCorrect;
                    const picks = state.reveal?.picks[index] ?? [];
                    const voters = picks.map(playerById).filter((item): item is PublicPlayer => !!item);
                    const pct = totalPicks ? Math.round((picks.length / totalPicks) * 100) : 0;
                    // Dağılım yalnız puan beat'inde (650ms) belirir; mutlak+transform, kartı
                    // KIMILDATMAZ (0px kuralı). Çubuk kartın alt kenarında scaleX ile açılır.
                    const showDist = beats.gains && totalPicks > 0;
                    // Kimsenin seçmediği yanlış şıkta "%0" rozeti bilgi değil gürültü.
                    const showPct = showDist && (picks.length > 0 || index === correctIndex);
                    return (
                      <button
                        className={`qt-answer ${selected === index ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""} ${isDimmed || removed ? "is-dimmed" : ""} ${removed ? "is-removed" : ""}`}
                        disabled={locked || removed}
                        aria-pressed={selected === index}
                        data-answer-state={
                          isCorrect ? "correct" : isWrong ? "wrong" : selected === index ? "locked" : "idle"
                        }
                        onClick={() => {
                          sfx.play("lock");
                          onAnswer(index);
                        }}
                        style={{ "--i": index } as CSSProperties}
                        key={index}
                      >
                        <b>{"ABCD"[index]}</b>
                        <span className="qt-answer__text">{choice}</span>
                        {showDist && (
                          <i
                            className={`qt-answer__dist ${index === correctIndex ? "is-right" : ""}`}
                            style={{ "--pct": pct / 100 } as CSSProperties}
                            aria-hidden="true"
                          />
                        )}
                        {/* Reveal'de doğru ✓ / (kendi) yanlış ✗ rozeti renkten bağımsız
                  işaretlenir (renk-körlüğü erişilebilirliği). Slot sabit 24px:
                  ikon gelince kart kımıldamaz. */}
                        <i className="qt-answer__mark" aria-hidden="true">
                          {beats.cards && isCorrect ? (
                            <span className="qt-verdict-pop is-right">
                              <Icon name="check" />
                            </span>
                          ) : beats.cards && isWrong ? (
                            <span className="qt-verdict-pop is-wrong">
                              <Icon name="close" />
                            </span>
                          ) : !beats.cards && selected === index && !beats.active ? (
                            <span className="qt-lock-pop" key="lock">
                              <Icon name="check" />
                            </span>
                          ) : null}
                        </i>
                        {/* Yüzde + oy veren avatarlar TEK rozet olarak kartın alt kenarına
                  oturur (mutlak, 0px). Eskiden yüzde sağ-üstte ✓/✗ rozetinin,
                  avatarlar alt kenarda bir alttaki kartın üstüne biniyordu. */}
                        {(showPct || (beats.voters && voters.length > 0)) && (
                          <span className={`qt-answer__tally ${index === correctIndex ? "is-right" : ""}`}>
                            {showPct && (
                              <b className="qt-answer__pct" title={t("reveal.pctHint", { pct })}>
                                {formatPercent(language, pct)}
                              </b>
                            )}
                            <VoterDock voters={voters} correct={index === correctIndex} beats={beats} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {beats.active && state.reveal?.fact ? (
                <p className="qt-locked-note qt-reveal-fact">
                  <Icon name="info" /> <b>{t("reveal.factTitle")}</b>{" "}
                  {language === "en" && state.reveal.factEn ? state.reveal.factEn : state.reveal.fact}
                </p>
              ) : (
                <>
                  {/* Düello izleyicisi: cevap veremez ama kazanana tahmin koyabilir. */}
                  {state.gameMode === "duel" && waiting && onPredict ? (
                    <div className="qt-duel-watch">
                      {state.yourPrediction ? (
                        <span className="qt-predict-yours">
                          <Icon name="check" />{" "}
                          {t("predict.yours", {
                            name: state.players.find((p) => p.id === state.yourPrediction)?.name ?? "",
                          })}
                        </span>
                      ) : state.predictOpen ? (
                        <span className="qt-predict-bar">
                          <small>{t("predict.title")}</small>
                          {state.players
                            .filter((p) => !p.waiting)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="qt-predict-chip"
                                onClick={() => onPredict(p.id)}
                              >
                                <Avatar player={p} compact />
                                {p.name}
                              </button>
                            ))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="qt-locked-note" data-empty={selected === null && !beats.active && !waiting}>
                    {beats.active ? null : waiting ? (
                      t(
                        state.gameMode === "bet"
                          ? "bet.waitingNextMatch"
                          : state.gameMode === "elim" && (self?.lives ?? 1) <= 0
                            ? "elim.waitingNextMatch"
                            : state.gameMode === "duel"
                              ? "duel.watching"
                              : "game.waitingNextRound",
                      )
                    ) : selected !== null ? (
                      <>
                        <Icon name="check" /> {t("game.answerLocked")}
                      </>
                    ) : null}
                  </p>
                </>
              )}
            </>
          ) : null}
          {beats.active && !isCircle ? (
            <button
              type="button"
              className="qt-report-flag"
              title={t("report.flag")}
              aria-label={t("report.flag")}
              disabled={reported}
              onClick={() => {
                onReport();
                setReported(true);
              }}
            >
              <Icon name="flag" />
            </button>
          ) : null}
        </section>
        <aside className="qt-game-side">
          {/* Reveal'de tur kazancı; soru fazında emote rayı aynı sütuna oturur
            (eski sabit sağ-alt bar grid'le hizasız asılı duruyordu). */}
          {beats.active ? <YourGain state={state} beats={beats} /> : null}
          {!beats.active && state.phase === "question" ? emoteBar : null}
          <RevealProgress beats={beats} />
        </aside>
      </div>
      {lightbox && (
        <div
          ref={lightboxRef}
          className="qt-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("game.imageZoom")}
          onClick={() => setLightbox(null)}
        >
          <figure className="qt-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="qt-lightbox-close"
              onClick={() => setLightbox(null)}
              aria-label={t("game.imageClose")}
            >
              <Icon name="close" />
            </button>
            <img
              src={lightbox.src}
              alt={t("game.imageAlt")}
              style={blurPx > 0.2 ? { filter: `blur(${blurPx}px)`, transform: "scale(1.08)" } : undefined}
            />
            {lightbox.credit && (
              <figcaption className="qt-question-credit">
                <Icon name="info" />
                <span>{lightbox.credit}</span>
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </main>
  );
}

/**
 * Çifte Bahis — bahis fazı. Soru açılmadan önce yalnız KATEGORİ görünür (soru
 * metni/şıkları sunucudan gelmez); oyuncu bankrolünden bir oran yatırır
 * (Pas / ¼ / ½ / Hepsi). Kilitleyince sunucu bağlı herkesi bekler ya da süre
 * dolar, sonra soru açılır. Kabuk GameBoard ile aynı (art + header + RoomStrip)
 * — faz değişse de masa yerinde kalır (0px).
 */
function BetBoard({
  state,
  onBet,
  onLeave,
  onSpectate,
  speakingIds,
}: {
  state: GameState;
  onBet: (amount: number) => void;
  onLeave: () => void;
  onSpectate: () => void;
  speakingIds?: ReadonlySet<string>;
}) {
  const { t, language } = useI18n();
  const beats = useRevealBeats(state);
  const youAreSpectator = state.youAreSpectator;
  const self = state.players.find((player) => player.id === state.youId);
  const bankroll = state.bet?.bankroll ?? 0;
  const locked = state.yourBet !== null;
  const waiting = !!self?.waiting;
  const accent = categoryAccent(state.bet?.category);
  // Final bahsi (son soru, Jeopardy usulü): çipler yerine serbest tutar slider'ı.
  const isFinal = !!state.bet?.final;
  const [wager, setWager] = useState(0);
  useEffect(() => {
    setWager(Math.max(Math.ceil(bankroll * BET_MIN_STAKE_PCT), Math.round(bankroll / 2)));
  }, [isFinal, bankroll]);
  const optionSpecs = useMemo(() => betOptionSpecs(bankroll), [bankroll]);
  const options = optionSpecs.map((option) => ({ ...option, label: t(`bet.${option.key}` as StringKey) }));
  const canBet = !locked && !youAreSpectator && !waiting && state.phase === "bet";
  useEffect(() => {
    if (!canBet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!isPlainShortcut(event)) return;
      if (isFinal) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        sfx.play("lock");
        onBet(wager);
        return;
      }
      const index = shortcutIndex(event.key, optionSpecs.length);
      if (index === null) return;
      event.preventDefault();
      sfx.play("lock");
      onBet(optionSpecs[index].amount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canBet, onBet, optionSpecs, isFinal, wager]);
  return (
    <main
      className="qt-activity qt-game qt-game--bet"
      style={
        {
          "--game-art": `url('/assets/discord-activity/activity-classic-stage.webp')`,
          "--cat-accent": accent,
        } as CSSProperties
      }
    >
      <div className="qt-game-background" />
      <div className="qt-game-head">
        <header className="qt-game-top">
          <div>
            <b>{t(MODE_KEYS.bet.tag)}</b>
            <span>{t("game.questionOf", { index: state.round.index + 1, total: state.round.total })}</span>
          </div>
          <RoundProgress index={state.round.index} total={state.round.total} />
          <span className="qt-game-summary">
            <span className="qt-game-summary__full">
              {t("bet.lockedCount", { locked: state.answeredCount, total: state.eligibleCount })}
            </span>
            <span className="qt-game-summary__short" aria-hidden="true">
              <Icon name="lock" />
              {state.answeredCount}/{state.eligibleCount}
            </span>
          </span>
        </header>
        <div className="qt-game-controls">
          {!youAreSpectator && (
            <button
              type="button"
              className="qt-game-exit qt-game-spectate"
              onClick={onSpectate}
              title={t("spectator.become")}
            >
              {t("spectator.become")}
            </button>
          )}
          <GameHelpButton mode={state.gameMode} />
          <GameLeaveButton onLeave={onLeave} />
        </div>
      </div>
      <div className="qt-game-grid">
        <RoomStrip state={state} beats={beats} speakingIds={speakingIds} />
        <section className="qt-question-stage qt-bet-stage">
          <div className="qt-question-head">
            <span className="qt-category">
              {state.bet?.category ? categoryLabel(language, state.bet.category) : ""}
            </span>
            {isFinal && <em className="qt-bet-final-tag">{t("bet.finalTag")}</em>}
            <h1>{t("bet.heading")}</h1>
            <p>{isFinal ? t("bet.finalHint") : t("bet.subheading")}</p>
          </div>
          <div className="qt-bet-bank">
            <Icon name="coins" weight="duotone" />
            <b>{formatNumber(language, bankroll)}</b>
            <span>{t("bet.bankroll")}</span>
            {state.bet?.insured ? <em className="qt-bet-insured">{t("bet.insured")}</em> : null}
          </div>
          {youAreSpectator ? (
            <p className="qt-locked-note">
              <Icon name="eye" /> {t("spectator.watching")}
            </p>
          ) : waiting ? (
            <p className="qt-locked-note">{t("bet.waitingNextMatch")}</p>
          ) : // Bakiye 0: bahis yok, sunucu bahsi 0'a kilitledi. Doğru cevap sabit ödül.
          state.bet?.broke ? (
            <div className="qt-bet-rescue" role="status">
              <b>{t("bet.broke.title")}</b>
              <span>{t("bet.broke.body", { points: formatNumber(language, state.bet.brokeReward) })}</span>
              <small>
                <Icon name="lock" /> {t("bet.broke.locked")}
              </small>
            </div>
          ) : (
            <>
              {isFinal ? (
                <div className="qt-bet-final" role="group" aria-label={t("bet.finalTag")}>
                  <input
                    type="range"
                    className="qt-bet-slider"
                    min={Math.ceil(bankroll * BET_MIN_STAKE_PCT)}
                    max={bankroll}
                    step={Math.max(10, Math.round(bankroll / 40 / 10) * 10)}
                    value={wager}
                    disabled={!canBet}
                    aria-label={t("bet.wagerAria")}
                    onChange={(event) => setWager(Number(event.target.value))}
                  />
                  <div className="qt-bet-final__amount">
                    <b>{formatNumber(language, wager)}</b>
                    {wager === bankroll && bankroll > 0 && <em className="qt-bet-final__allin">{t("bet.all")}</em>}
                  </div>
                  <button
                    type="button"
                    className="qt-bet-lock"
                    disabled={!canBet}
                    onClick={() => {
                      sfx.play("lock");
                      onBet(wager);
                    }}
                  >
                    <Icon name="lock" /> {t("bet.lockWager")}
                  </button>
                </div>
              ) : (
                <div className="qt-bet-options" role="group" aria-label={t("bet.heading")}>
                  {options.map((option, index) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`qt-bet-option ${locked && state.yourBet === option.amount ? "is-selected" : ""}`}
                      disabled={!canBet}
                      onClick={() => {
                        sfx.play("lock");
                        onBet(option.amount);
                      }}
                    >
                      <kbd aria-hidden="true">{index + 1}</kbd>
                      <b>{option.label}</b>
                      <span>{formatNumber(language, option.amount)}</span>
                      {option.key === "all" && <em className="qt-bet-boost">{t("bet.allBoost")}</em>}
                    </button>
                  ))}
                </div>
              )}
              <p className="qt-locked-note" data-empty={!locked}>
                {locked ? (
                  <>
                    <Icon name="lock" /> {t("bet.locked", { amount: formatNumber(language, state.yourBet ?? 0) })}
                  </>
                ) : null}
              </p>
            </>
          )}
        </section>
        <aside className="qt-game-side">
          <Timer
            deadline={state.bet?.deadline}
            durationMs={state.bet?.durationMs}
            serverNow={state.serverNow}
            frozen={false}
          />
        </aside>
      </div>
    </main>
  );
}

/**
 * Tavern Panosu (§6.1) pick fazı: 5 kategori sütunu × değer hücreleri.
 * Sırası gelen oyuncu tıklayarak açar; herkes aynı panoyu görür ama yalnız
 * picker'ın düğmeleri aktif. Hücre metni sunucudan gelmez — yalnız değer +
 * kullanılmışlık; soru ancak hücre açılıp question fazına geçince düşer.
 * Süre dolunca sunucu rastgele hücre açar (board.autoPick).
 */
function PickBoard({
  state,
  onPickCell,
  onLeave,
  onSpectate,
  speakingIds,
}: {
  state: GameState;
  onPickCell?: (cell: number) => void;
  onLeave: () => void;
  onSpectate: () => void;
  speakingIds?: ReadonlySet<string>;
}) {
  const { t, language } = useI18n();
  const beats = useRevealBeats(state);
  const youAreSpectator = state.youAreSpectator;
  const self = state.players.find((player) => player.id === state.youId);
  const waiting = !!self?.waiting;
  const board = state.board;
  if (!board) return null;
  const cols = Math.max(1, board.categories.length);
  const rows = Math.ceil(board.cells.length / cols);
  const youPick = !youAreSpectator && !waiting && board.pickerId === state.youId;
  return (
    <main className="qt-activity qt-game qt-game--board">
      <div className="qt-game-background" />
      <div className="qt-game-head">
        <header className="qt-game-top">
          <div>
            <b>{t(MODE_KEYS.board.tag)}</b>
            <span>
              {t("board.cellsLeft", { left: board.cells.filter((c) => !c.used).length, total: board.cells.length })}
            </span>
          </div>
          <RoundProgress index={state.round.index} total={state.round.total} />
        </header>
        <div className="qt-game-controls">
          {!youAreSpectator && (
            <button
              type="button"
              className="qt-game-exit qt-game-spectate"
              onClick={onSpectate}
              title={t("spectator.become")}
            >
              {t("spectator.become")}
            </button>
          )}
          <GameHelpButton mode={state.gameMode} />
          <GameLeaveButton onLeave={onLeave} />
        </div>
      </div>
      <div className="qt-game-grid">
        <RoomStrip state={state} beats={beats} speakingIds={speakingIds} />
        <section className="qt-question-stage qt-board-stage">
          <div className="qt-question-head">
            <h1>{t("board.heading")}</h1>
            <p>{youPick ? t("board.youPick") : t("board.otherPick", { name: board.pickerName })}</p>
          </div>
          <div className="qt-board" role="grid" aria-label={t("board.heading")}>
            {board.categories.map((category, ci) => (
              <div className="qt-board-col" role="row" key={category}>
                <div className="qt-board-col__head" role="columnheader">
                  {categoryLabel(language, category)}
                </div>
                {Array.from({ length: rows }, (_, ri) => {
                  const index = ci * rows + ri;
                  const cell = board.cells[index];
                  if (!cell)
                    return (
                      <div key={ri} className="qt-board-cell qt-board-cell--gap" role="gridcell" aria-hidden="true" />
                    );
                  return (
                    <button
                      key={ri}
                      type="button"
                      role="gridcell"
                      className={`qt-board-cell ${cell.used ? "is-used" : ""} ${cell.dailyDouble ? "is-dd" : ""} ${youPick && !cell.used ? "is-pickable" : ""}`}
                      disabled={cell.used || !youPick}
                      aria-label={
                        cell.dailyDouble
                          ? t("board.dailyDoubleAria")
                          : cell.used
                            ? t("board.cellUsed")
                            : t("board.cellAria", { value: cell.value })
                      }
                      onClick={() => {
                        sfx.play("lock");
                        onPickCell?.(index);
                      }}
                    >
                      {cell.dailyDouble ? <Icon name="star" /> : cell.used ? "·" : cell.value}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {youAreSpectator ? (
            <p className="qt-locked-note">
              <Icon name="eye" /> {t("spectator.watching")}
            </p>
          ) : youPick ? (
            <p className="qt-locked-note">{t("board.youPickNote")}</p>
          ) : (
            <p className="qt-locked-note">{t("board.otherPickNote", { name: board.pickerName })}</p>
          )}
        </section>
        <aside className="qt-game-side">
          <Timer deadline={board.deadline} durationMs={board.durationMs} serverNow={state.serverNow} frozen={false} />
        </aside>
      </div>
    </main>
  );
}

/** Turun sana ne kazandırdığı. Tasarımda "Sonraki →" butonunun durduğu köşe:
 *  buton koymuyoruz — geçişi sunucu yapar ve masa hep birlikte ilerler. */
function YourGain({ state, beats }: { state: GameState; beats: RevealBeats }) {
  const { t, language } = useI18n();
  const reduced = usePrefersReducedMotion();
  const gain = (state.reveal?.gains ?? state.circleReveal?.gains ?? state.wordReveal?.gains)?.[state.youId] ?? 0;
  const rescued = state.gameMode === "bet" && !!state.reveal?.rescued?.includes(state.youId);
  if (!beats.gains) return <div className="qt-your-gain" aria-hidden="true" />;
  if (rescued && gain <= 0)
    return (
      <div className="qt-your-gain is-zero">
        <b>{t("reveal.noGain")}</b>
        <small>{t("reveal.betRescueMiss")}</small>
      </div>
    );
  // Çifte Bahis'te yanlış cevap bahsi YAKAR: sıfır değil, eksi göster (kayıp).
  if (state.gameMode === "bet" && gain < 0)
    return (
      <div className="qt-your-gain is-loss" aria-live="polite" aria-atomic="true">
        <span className="qt-sr-only">{t("reveal.betLost", { points: -gain })}</span>
        <b className="qt-score-flight" aria-hidden="true">
          −{formatNumber(language, countUpValue(-gain, beats.elapsedMs - BEAT_GAINS_MS, reduced))}
        </b>
        <small>{t("reveal.betLostNote")}</small>
      </div>
    );
  if (gain <= 0)
    return (
      <div className="qt-your-gain is-zero">
        <b>{t("reveal.noGain")}</b>
      </div>
    );
  return (
    <div className="qt-your-gain" aria-live="polite" aria-atomic="true">
      <span className="qt-sr-only">{t("reveal.gainPoints", { points: gain })}</span>
      <b className="qt-score-flight" aria-hidden="true">
        +{formatNumber(language, countUpValue(gain, beats.elapsedMs - BEAT_GAINS_MS, reduced))}
      </b>
      <small>
        {rescued
          ? t("reveal.betRescued")
          : state.gameMode === "bet"
            ? t("reveal.betWon")
            : `${t("reveal.speedIncluded")} · ${t("reveal.thisQuestion")}`}
      </small>
    </div>
  );
}

/**
 * Tur ilerlemesi. Nokta sayısı tur sayısına eşit olduğu için Çember'de (20 tur)
 * noktalar kıymık gibi kalıyordu; eşiğin üstünde tek ince çubuğa döner.
 * Eşik tur sayısına bakar, ekran boyutuna değil: 20 nokta her ekranda kalabalık.
 */
const PROGRESS_DOT_LIMIT = 12;
function RoundProgress({ index, total }: { index: number; total: number }) {
  if (total > PROGRESS_DOT_LIMIT) {
    return (
      <div className="qt-progress-bar" role="presentation">
        <i>
          <b style={{ transform: `scaleX(${Math.min(1, (index + 1) / total)})` }} />
        </i>
      </div>
    );
  }
  return (
    <div className="qt-progress">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i <= index ? "is-done" : ""} />
      ))}
    </div>
  );
}

/** "Yeni soru geliyor" çizgisi. Tamamen kozmetiktir: geçişi sunucu yapar, bu bar değil. */
function RevealProgress({ beats }: { beats: RevealBeats }) {
  const { t } = useI18n();
  const seconds = Math.max(1, Math.ceil(beats.remainingMs / 1000));
  return (
    <div className="qt-reveal-progress" data-active={beats.active} aria-live="polite">
      <span>{beats.active ? t("reveal.nextIn", { seconds }) : ""}</span>
      <i>
        <b style={{ transform: `scaleX(${beats.active ? beats.progress : 1})` }} />
      </i>
    </div>
  );
}

function Podium({
  state,
  onAgain,
  onRematch,
  onBackToLobby,
  onLeave,
  speakingIds,
  isDiscord,
  onShare,
}: {
  state: GameState;
  onAgain?: () => void;
  onRematch?: () => void;
  onBackToLobby: () => void;
  onLeave: () => void;
  speakingIds?: ReadonlySet<string>;
  isDiscord?: boolean;
  onShare?: (message: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const winner = state.podium?.[0];
  const rest = state.podium?.slice(1) ?? [];
  useEffect(() => {
    sfx.play("podium");
  }, []); // maç sonu fanfarı (bir kez)
  // Maç özeti (4d) ayrı bir sekmede: kısa ekranda sıralama + tüm istatistik
  // kartı yan yana sığmaz. Sunucu özet göndermezse (eski istemci/veri yok) sekme
  // hiç görünmez, podyum eskisi gibi çalışır.
  const summary = state.matchSummary;
  const [tab, setTab] = useState<"rank" | "summary" | "review">("rank");
  // Sunucu özet göndermezse (eski istemci/veri yok) sekmeler görünmez, podyum
  // eskisi gibi çalışır. İnceleme sekmesi yalnızca kaydedilmiş tur varsa.
  const active = summary ? tab : "rank";
  const hasReview = !!summary?.review.length;
  return (
    <main
      className="qt-activity qt-podium"
      style={{ "--podium-art": "url('/assets/discord-activity/activity-podium-stage.webp')" } as CSSProperties}
    >
      <GameLeaveButton onLeave={onLeave} floating />
      {summary && (
        <div className="qt-podium-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={active === "rank"}
            className={active === "rank" ? "is-active" : ""}
            onClick={() => setTab("rank")}
          >
            {t("podium.tabRank")}
          </button>
          <button
            role="tab"
            aria-selected={active === "summary"}
            className={active === "summary" ? "is-active" : ""}
            onClick={() => setTab("summary")}
          >
            {t("podium.tabSummary")}
          </button>
          {hasReview && (
            <button
              role="tab"
              aria-selected={active === "review"}
              className={active === "review" ? "is-active" : ""}
              onClick={() => setTab("review")}
            >
              {t("review.tab")}
            </button>
          )}
        </div>
      )}
      {active === "summary" && summary ? (
        <MatchSummaryCard
          state={state}
          summary={summary}
          onAgain={onAgain}
          onRematch={onRematch}
          onBackToLobby={onBackToLobby}
        />
      ) : active === "review" && summary ? (
        <MatchReview review={summary.review} />
      ) : (
        <>
          {state.moments?.length ? (
            <div className="qt-moments" aria-label={t("moment.title")}>
              {state.moments.map((m) => (
                <span key={`${m.key}:${m.playerId}`} className={`qt-moment is-${m.key}`}>
                  <Icon
                    name={
                      m.key === "fastest"
                        ? "flame"
                        : m.key === "streak"
                          ? "bolt"
                          : m.key === "bigBet"
                            ? "coins"
                            : "medal"
                    }
                  />
                  {t(`moment.${m.key}`, { name: m.name, n: m.value })}
                </span>
              ))}
            </div>
          ) : null}
          <PodiumRanking
            state={state}
            winner={winner}
            rest={rest}
            onAgain={onAgain}
            onRematch={onRematch}
            onBackToLobby={onBackToLobby}
            speakingIds={speakingIds}
            isDiscord={isDiscord}
            onShare={onShare}
          />
        </>
      )}
    </main>
  );
}

/**
 * Maç incelemesi zaman çizgisi (6a): her tur bir düğüm (doğru=mint, yanlış=mercan),
 * tıklanınca o turun detayı (senin cevabın vs doğru). Veri izleyene özel
 * (sunucu stateFor'da eligible olduğun turları derliyor).
 */
function MatchReview({ review }: { review: ReviewItem[] }) {
  const { t, language } = useI18n();
  // Varsayılan seçim: ilk yanlış (öğrenmek istediğin), yoksa ilk tur.
  const firstWrong = review.findIndex((item) => !item.correct);
  const [sel, setSel] = useState(firstWrong >= 0 ? firstWrong : 0);
  const item = review[Math.min(sel, review.length - 1)];
  const correctCount = review.filter((entry) => entry.correct).length;
  // promptEn/yourAnswerEn/correctAnswerEn yalnız klasik turlarda dolu (çember çevrilmez).
  const prompt = language === "en" && item?.promptEn ? item.promptEn : item?.prompt;
  const yourAnswer = language === "en" && item?.yourAnswerEn !== undefined ? item.yourAnswerEn : item?.yourAnswer;
  const correctAnswer = language === "en" && item?.correctAnswerEn ? item.correctAnswerEn : item?.correctAnswer;
  return (
    <div className="qt-review-card">
      <div className="qt-review-head">
        <span className="qt-review-kicker">{t("review.kicker")}</span>
        <span className="qt-review-acc">{t("review.hits", { correct: correctCount, total: review.length })}</span>
      </div>
      <div className="qt-review-timeline" role="tablist">
        {review.map((entry, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === sel}
            className={`qt-review-node ${entry.correct ? "is-correct" : "is-wrong"} ${index === sel ? "is-active" : ""}`}
            onClick={() => setSel(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      {item && (
        <div className={`qt-review-detail ${item.correct ? "is-correct" : "is-wrong"}`}>
          <span className="qt-review-cat">
            {categoryLabel(language, item.category)} · {t("review.q", { n: sel + 1 })}
          </span>
          <h3>{prompt}</h3>
          <div className="qt-review-answers">
            {!item.correct && (
              <div className="qt-review-answer is-wrong">
                <Icon name="close" /> {yourAnswer ? `${t("review.yours")}: ${yourAnswer}` : t("review.noAnswer")}
              </div>
            )}
            <div className="qt-review-answer is-correct">
              <Icon name="check" /> {t("review.correct")}: {correctAnswer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Noktasal patlama: Confetti'nin tam-ekran versiyonundan farklı olarak belirli
 * bir olayın olduğu NOKTADAN çıkar (koltuk, "Başlat" butonu) — dikkati oraya
 * çeker. Ebeveyn position:relative/absolute olmalı; bu inset:0 ile onu kaplar.
 * triggerKey her patlamada YENİ bir değer (Date.now()) — key değişince React
 * elemanı yeniden kurar, animasyon baştan oynar.
 */
function Burst({ triggerKey }: { triggerKey: number }) {
  const reduced = usePrefersReducedMotion();
  const pieces = useMemo(() => {
    if (reduced || !triggerKey) return [];
    const hues = ["#f3c362", "#5ee6c1", "#62e8df", "#ff9ec4"];
    return Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 24 + Math.random() * 16;
      return {
        hue: hues[i % hues.length],
        x: Math.round(Math.cos(angle) * dist),
        y: Math.round(Math.sin(angle) * dist),
        delay: (Math.random() * 0.06).toFixed(2),
      };
    });
  }, [triggerKey, reduced]);
  if (!pieces.length) return null;
  return (
    <span className="qt-burst" aria-hidden="true" key={triggerKey}>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              "--bx": `${p.x}px`,
              "--by": `${p.y}px`,
              background: p.hue,
              animationDelay: `${p.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Podyum konfetisi: kütüphanesiz, CSP-safe — birkaç span parçacık aşağı düşer.
 *  reduced-motion'da hiç render edilmez (global CSS de animasyonu ayrıca kısar). */
function Confetti() {
  const reduced = usePrefersReducedMotion();
  const pieces = useMemo(() => {
    if (reduced) return [];
    const hues = ["#f3c362", "#5ee6c1", "#62e8df", "#ff9ec4", "#8fb0ff"];
    return Array.from({ length: 28 }, (_, i) => ({
      left: Math.round(Math.random() * 100),
      delay: (Math.random() * 0.6).toFixed(2),
      dur: (2 + Math.random() * 1.6).toFixed(2),
      hue: hues[i % hues.length],
      rot: Math.round(Math.random() * 540) - 270,
    }));
  }, [reduced]);
  if (!pieces.length) return null;
  return (
    <div className="qt-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              background: p.hue,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              "--rot": `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function PodiumRanking({
  state,
  winner,
  rest,
  onAgain,
  onRematch,
  onBackToLobby,
  speakingIds,
  isDiscord,
  onShare,
}: {
  state: GameState;
  winner: PodiumEntry | undefined;
  rest: PodiumEntry[];
  onAgain?: () => void;
  onRematch?: () => void;
  onBackToLobby: () => void;
  speakingIds?: ReadonlySet<string>;
  isDiscord?: boolean;
  onShare?: (message: string) => Promise<boolean>;
}) {
  const { t, language } = useI18n();
  const reduced = usePrefersReducedMotion();
  const winnerScore = useCountUp(winner?.score ?? 0, reduced);
  const isHost = state.youId === state.hostId;
  // Yarışma sıralaması: eşit puan = eşit sıra (500/500 → iki #1, sonraki #3).
  const podiumScores = (state.podium ?? []).map((player) => player.score);
  const rankOf = (score: number) => 1 + podiumScores.filter((other) => other > score).length;
  // Takım modu: birincil sonuç TAKIM toplamıdır; bireysel kazanan "MVP" olarak kalır.
  const isTeam = state.gameMode === "team";
  const [teamA, teamB] = state.teamScores;
  const teamWinner = teamA === teamB ? null : teamA > teamB ? 0 : 1;
  const colorClass = (id: string) => {
    const found = state.players.find((player) => player.id === id);
    if (found) return playerColorClass(found, state.gameMode);
    const podiumPlayer = state.podium?.find((player) => player.id === id);
    return isTeam && podiumPlayer?.team !== undefined ? `is-team${podiumPlayer.team}` : `is-${seatColorOf(id)}`;
  };
  // Maket 3a: kazanan SOLDA spot ışığında, 2-5 SAĞDA liste; iki sütun genişliği kullanır.
  // Tek kişilik masada 2-5 listesi yok (is-solo): sağ boş kalıp buton asılı durmasın.
  return (
    <div className={`qt-podium-glass ${rest.length ? "" : "is-solo"}`}>
      <Confetti />
      <section className="qt-podium-spot">
        <span>
          {t("podium.kicker")} · {t(MODE_KEYS[modeKeyOf(state.gameMode)].tag)}
        </span>
        {isTeam && (
          <div className="qt-podium-teams">
            <div className={`qt-podium-team is-team0 ${teamWinner === 0 ? "is-won" : ""}`}>
              <b>{t("team.a")}</b>
              <em>{formatNumber(language, teamA)}</em>
            </div>
            <span className="qt-podium-teams__result">
              {teamWinner === null
                ? t("team.tie")
                : t("team.won", { team: teamWinner === 0 ? t("team.a") : t("team.b") })}
            </span>
            <div className={`qt-podium-team is-team1 ${teamWinner === 1 ? "is-won" : ""}`}>
              <b>{t("team.b")}</b>
              <em>{formatNumber(language, teamB)}</em>
            </div>
          </div>
        )}
        {/* Lider altın mikrofonu taşır: taç değil — gece yarısı yayın teması.
            (Makette kupa var; mikrofon bilinçli bir tema kararıydı, duruyor.) */}
        {/* 3B taverna karakteri: kutlama dekoru; model-viewer yalnızca bu
            fazda dinamik yüklenir, yüklenmezse boş kalır (avatar yeter). */}
        <PodiumCharacter />
        {winner && (
          <>
            <div
              className={`qt-avatar qt-podium-winner ${colorClass(winner.id)} ${winner.league ? `is-frame-${winner.league} qt-winner--${winner.league}` : ""}`}
            >
              <AvatarImage url={winner.avatarUrl} name={winner.name} />
            </div>
            <b title={winner.name}>
              {winner.name}
              <TitleTag title={winner.title} />
              {winner.crowdFavorite && (
                <i className="qt-crowd-fav" title={t("podium.crowdFavorite")}>
                  <Icon name="heart" /> {t("podium.crowdFavorite")}
                </i>
              )}
            </b>
            <small>
              {isTeam ? t("team.mvp") : "#1"} · {t("podium.points", { score: formatNumber(language, winnerScore) })}
            </small>
            {state.xpGains?.[winner.id] && (
              <em className="qt-xp-gain">{t("podium.xpGain", { xp: state.xpGains[winner.id].gained })}</em>
            )}
            {state.xpGains?.[winner.id] && <NewBadgeChips gain={state.xpGains[winner.id]} />}
          </>
        )}
      </section>
      <section className="qt-podium-side">
        <div className="qt-podium-list">
          {rest.map((player, index) => (
            <div
              key={player.id}
              className={`${player.id === state.youId ? "is-you" : ""} ${speakingIds?.has(player.id) ? "is-speaking" : ""}`}
              style={{ "--row-delay": `${index * 90}ms` } as CSSProperties}
            >
              <b>#{rankOf(player.score)}</b>
              <div className={`qt-avatar ${colorClass(player.id)} ${player.league ? `is-frame-${player.league}` : ""}`}>
                <AvatarImage url={player.avatarUrl} name={player.name} />
              </div>
              <span title={player.name}>
                {player.name}
                <TitleTag title={player.title} />
                {player.crowdFavorite && (
                  <i className="qt-crowd-fav" title={t("podium.crowdFavorite")}>
                    <Icon name="heart" />
                  </i>
                )}
                {player.id === state.youId && <i>· {t("podium.you")}</i>}
              </span>
              <strong>{formatNumber(language, player.score)}</strong>
              {state.xpGains?.[player.id] && (
                <em className="qt-xp-gain">{t("podium.xpGain", { xp: state.xpGains[player.id].gained })}</em>
              )}
              {state.xpGains?.[player.id] && <NewBadgeChips gain={state.xpGains[player.id]} />}
            </div>
          ))}
        </div>
        {/* Altın: token kuralı "altın = eylem & zafer (CTA, taç, kazanan)".
            Turkuazdı; maket 3a da altın gösteriyor. */}
        {/* onAgain yoksa oda zaten lobiye dönmüş: yeni maç lobiden başlar. */}
        {onAgain &&
          (isHost ? (
            <button className="qt-button qt-button--gold qt-podium-again" onClick={onAgain}>
              {t("podium.again")} <Icon name="arrow" />
            </button>
          ) : (
            <div className="qt-podium-wait" role="status">
              {t("podium.waitHost")}
            </div>
          ))}
        {/* Rövanş oylaması (§6.3): masadakilerin yarısından fazlası basarsa
            sunucu host'u beklemeden yeni maçı başlatır. Izleyiciler oy kullanamaz. */}
        {state.rematch && !state.youAreSpectator && onRematch && (
          <button
            className={`qt-button qt-podium-rematch ${state.rematch.youVoted ? "is-voted" : ""}`}
            onClick={onRematch}
            disabled={state.rematch.youVoted}
            aria-pressed={state.rematch.youVoted}
          >
            <Icon name="refresh" /> {t("podium.rematch")}{" "}
            <b>
              {state.rematch.votes}/{state.rematch.needed}
            </b>
          </button>
        )}
        {/* Kanala paylaş: SDK shareLink sonuç kartı (metin + aktivite linki);
            Discord dışında (yerel test) SDK yok — buton gizlenir. */}
        {isDiscord && onShare && winner && (
          <button
            className="qt-button qt-podium-share"
            onClick={() =>
              onShare(
                t("share.message", {
                  name: winner.name,
                  score: formatNumber(language, winner.score),
                  mode: t(MODE_KEYS[modeKeyOf(state.gameMode)].name),
                }),
              )
            }
          >
            <Icon name="globe" /> {t("podium.share")}
          </button>
        )}
        <button className="qt-button qt-btn-home qt-podium-home" onClick={onBackToLobby}>
          <Icon name="arrowBack" /> {t("podium.home")}
        </button>
      </section>
    </div>
  );
}

/** Maç özeti kartı (4d). İstatistikler izleyene özel (sunucu stateFor'da hesaplar);
 *  "en hızlı parmak" masa geneli. "Kartı kopyala" YOK: Discord iframe'inde pano/
 *  canvas izin-kısıtlı, düşük değer — kullanıcı onayıyla atlandı. */
/** Günlük sonuç satırı: Wordle deseni + kopyalanabilir metin. Discord
 *  iframe'inde pano izni kısıtlı olabilir — metni seçilebilir tutarız ve
 *  clipboard denemesi başarısız olursa kendisi seçilir (elle kopyalanır). */
function DailyShare({ day, pattern }: { day: number; pattern: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const text = `${pattern} Triviara #${day}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      textRef.current?.select();
    }
  };
  return (
    <div className="qt-daily-share">
      <b className="qt-daily-share__pattern" aria-hidden="true">
        {pattern}
      </b>
      <input
        ref={textRef}
        className="qt-daily-share__text"
        value={text}
        readOnly
        onFocus={(event) => event.target.select()}
        aria-label={t("daily.share")}
      />
      <button type="button" className="qt-button qt-daily-share__copy" onClick={copy}>
        {copied ? (
          <>
            <Icon name="check" /> {t("daily.copied")}
          </>
        ) : (
          t("daily.copy")
        )}
      </button>
    </div>
  );
}

function MatchSummaryCard({
  state,
  summary,
  onAgain,
  onRematch,
  onBackToLobby,
}: {
  state: GameState;
  summary: MatchSummary;
  onAgain?: () => void;
  onRematch?: () => void;
  onBackToLobby: () => void;
}) {
  const { t, language } = useI18n();
  const winner = state.podium?.[0];
  const isHost = state.youId === state.hostId;
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  const cats = summary.perCategory.filter((item) => item.total > 0);
  return (
    <div className="qt-summary-card">
      <div className="qt-summary-head">
        <div className="qt-summary-brand">
          <img src="/table/quiztavern-logo.png" alt="" />
          <div>
            <b>{t("brand.name")}</b>
            <small>
              {t(MODE_KEYS[modeKeyOf(state.gameMode)].name)} ·{" "}
              {t("summary.questions", { count: state.gameMode === "blitz" ? summary.total : state.round.total })}
            </small>
          </div>
        </div>
        {winner && (
          <span className="qt-summary-winner" title={t("summary.winner", { name: winner.name })}>
            <Icon name="crown" />{" "}
            <span className="qt-summary-winner__label">{t("summary.winner", { name: winner.name })}</span>
          </span>
        )}
      </div>
      <div className="qt-summary-tiles">
        <div className="qt-summary-tile is-accuracy">
          <small>{t("summary.accuracy")}</small>
          <div>
            <b>
              {summary.correct} / {summary.total}
            </b>
            <span>{formatPercent(language, pct)}</span>
          </div>
        </div>
        <div className="qt-summary-tile is-streak">
          <small>{t("summary.streak")}</small>
          <div>
            <b>{summary.bestStreak}</b>
            <span>
              {t("summary.streakUnit")}
              {summary.bestStreak >= 2 && <FlameIcon />}
            </span>
          </div>
        </div>
        {summary.fastest ? (
          <div className="qt-summary-tile is-fast">
            <small>{t("summary.fastest")}</small>
            <div>
              <b>{summary.fastest.name}</b>
              <span>
                {(summary.fastest.ms / 1000).toFixed(1)} {t("summary.sec")}
              </span>
            </div>
          </div>
        ) : (
          <div className="qt-summary-tile">
            <small>{t("summary.fastest")}</small>
            <div>
              <b>—</b>
            </div>
          </div>
        )}
      </div>
      {(() => {
        // Kalıcı ilerleme kazancı: bu maçtan alınan XP + seviye/lig geçişi.
        // levelFloor formülü sunucudakiyle aynı (xp.ts: 100·(L-1)·L/2).
        const gain = state.xpGains?.[state.youId];
        if (!gain) return null;
        const intoLevel = gain.xp - (100 * (gain.level - 1) * gain.level) / 2;
        const pct = Math.min(100, Math.round((intoLevel / Math.max(1, 100 * gain.level)) * 100));
        return (
          <div className="qt-summary-xp">
            <div className="qt-summary-xp__head">
              <small>{t("summary.xpGain")}</small>
              <b>{t("podium.xpGain", { xp: gain.gained })}</b>
              {gain.leveledUp && <span className="qt-summary-xp__flag">{t("podium.levelUp")}</span>}
              {gain.leagueChanged && (
                <span className="qt-summary-xp__flag is-league">
                  {t("podium.newLeague", { league: t(LEAGUE_KEYS[gain.league] ?? "league.acemi") })}
                </span>
              )}
              <NewBadgeChips gain={gain} />
            </div>
            <div className="qt-xp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <small className="qt-summary-xp__foot">
              {t("progress.level", { n: gain.level })} · {t(LEAGUE_KEYS[gain.league] ?? "league.acemi")}
            </small>
          </div>
        );
      })()}
      {cats.length > 0 && (
        <div className="qt-summary-cats">
          {cats.map((item) => (
            <div key={item.category} className="qt-summary-cat">
              <small>{categoryLabel(language, item.category)}</small>
              <div className="qt-summary-bar">
                <i style={{ width: `${Math.round((item.correct / item.total) * 100)}%` }} />
              </div>
              <small>
                {item.correct}/{item.total}
              </small>
            </div>
          ))}
        </div>
      )}
      {state.daily?.pattern && <DailyShare day={state.daily.day} pattern={state.daily.pattern} />}
      {onAgain &&
        (isHost ? (
          <button className="qt-button qt-button--gold qt-summary-again" onClick={onAgain}>
            {t("podium.again")} <Icon name="arrow" />
          </button>
        ) : (
          <div className="qt-podium-wait" role="status">
            {t("podium.waitHost")}
          </div>
        ))}
      {state.rematch && !state.youAreSpectator && onRematch && (
        <button
          className={`qt-button qt-podium-rematch ${state.rematch.youVoted ? "is-voted" : ""}`}
          onClick={onRematch}
          disabled={state.rematch.youVoted}
          aria-pressed={state.rematch.youVoted}
        >
          <Icon name="refresh" /> {t("podium.rematch")}{" "}
          <b>
            {state.rematch.votes}/{state.rematch.needed}
          </b>
        </button>
      )}
      <button className="qt-button qt-btn-home qt-summary-home" onClick={onBackToLobby}>
        <Icon name="arrowBack" /> {t("podium.home")}
      </button>
    </div>
  );
}

/**
 * Yükleme iskeleti (3d): soru/oyun gelene kadar boş kart yerine oyun düzeninin
 * shimmer'lı taslağı — durum şeridi + oyuncu paneli + soru kartı (kategori, iki
 * metin satırı, 2×2 şık) + sayaç dairesi. Bloklar dekoratiftir (aria-hidden);
 * durum, görsel olmayan role="status" metniyle duyurulur.
 */
function GameSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <main className="qt-activity qt-skeleton">
      <span className="qt-sr-only" role="status">
        {loadingLabel}
      </span>
      <div className="qt-skeleton__strip qt-shimmer" aria-hidden="true" />
      <div className="qt-skeleton__grid" aria-hidden="true">
        <div className="qt-skeleton__side qt-shimmer" />
        <div className="qt-skeleton__card">
          <span className="qt-shimmer qt-skeleton__chip" />
          <span className="qt-shimmer qt-skeleton__line" style={{ width: "70%" }} />
          <span className="qt-shimmer qt-skeleton__line" style={{ width: "52%" }} />
          <div className="qt-skeleton__answers">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="qt-shimmer" />
            ))}
          </div>
        </div>
        <div className="qt-skeleton__timer qt-shimmer" />
      </div>
    </main>
  );
}

/**
 * PIP: küçük yüzen pencere (~320×180). Masa buraya SIĞMAZ ve küçültülmez —
 * bambaşka, tek bakışta okunan bir kart gösterilir. Tek işi şu soruya cevap
 * vermek: "geri dönmem gerekiyor mu?" Bu yüzden soru fazında kilitlemediysen
 * kart seni yanıp sönerek geri çağırır; koreografi ve masa burada yoktur.
 */
function PipCard({ state }: { state: GameState | null }) {
  const { t } = useI18n();
  const beats = useRevealBeats(state ?? ({ phase: "lobby" } as GameState));
  const seconds = useClock(
    state?.question?.deadline ?? state?.circle?.deadline ?? state?.bet?.deadline ?? state?.countdown?.deadline,
    state?.serverNow,
  );
  if (!state) return null;

  const self = state.players.find((player) => player.id === state.youId);
  const gain = (state.reveal?.gains ?? state.circleReveal?.gains ?? state.wordReveal?.gains)?.[state.youId] ?? 0;
  const answered = !!self?.answered;

  let tag: string;
  let body: React.ReactNode;
  if (state.phase === "lobby") {
    tag = t("pip.lobby");
    const ready = state.players.filter((player) => player.ready).length;
    body = (
      <div className="qt-pip__stack">
        <b className="qt-pip__big">
          {ready}/{state.players.length}
        </b>
        <span>{t("pip.ready")}</span>
        <em>{t(MODE_KEYS[modeKeyOf(state.gameMode)].name)}</em>
      </div>
    );
  } else if (state.phase === "countdown") {
    tag = t("pip.starting");
    body = <b className="qt-pip__big is-count">{seconds || t("countdown.go")}</b>;
  } else if (state.phase === "podium") {
    tag = t("podium.kicker");
    const rank = (state.podium?.findIndex((player) => player.id === state.youId) ?? -1) + 1;
    body = (
      <div className="qt-pip__stack">
        <em>{t("pip.rank", { rank: rank || state.players.length })}</em>
        <b className="qt-pip__big">{self?.score ?? 0}</b>
        <span>{t("pip.yourScore")}</span>
      </div>
    );
  } else if (state.phase === "bet") {
    tag = t(MODE_KEYS.bet.tag);
    const locked = state.yourBet !== null;
    body = (
      <div className="qt-pip__row">
        <b className={`qt-pip__big ${seconds <= 3 ? "is-urgent" : ""}`}>{seconds}</b>
        <span className={`qt-pip__lock ${locked ? "is-locked" : "is-open"}`}>
          {state.bet?.broke ? (
            t("bet.broke.locked")
          ) : locked ? (
            <>
              <Icon name="check" /> {t("pip.locked")}
            </>
          ) : (
            t("bet.pipPlace")
          )}
        </span>
      </div>
    );
  } else if (beats.active) {
    // Uzun cevap metni 320px karta sığmaz: doğru şıkkın HARFİ gösterilir.
    const letter = state.reveal
      ? "ABCD"[state.reveal.correctIndex]
      : (state.circleReveal?.answer.slice(0, 1).toUpperCase() ?? "?");
    tag = t(MODE_KEYS[modeKeyOf(state.gameMode)].tag);
    body = (
      <div className="qt-pip__stack">
        <em className={gain > 0 ? "is-right" : "is-wrong"}>{gain > 0 ? t("pip.correct") : t("pip.result")}</em>
        <b className="qt-pip__big is-letter">{letter}</b>
        <span>{gain > 0 ? t("pip.gained", { score: gain }) : gain < 0 ? `−${gain * -1}` : t("pip.noPoints")}</span>
      </div>
    );
  } else {
    tag =
      state.gameMode === "blitz"
        ? state.blitz
          ? t("blitz.progress", { n: state.blitz.index + 1, c: state.blitz.correct })
          : t(MODE_KEYS.blitz.name)
        : t("pip.round", { index: state.round.index + 1, total: state.round.total });
    body = (
      <div className="qt-pip__row">
        <b className={`qt-pip__big ${seconds <= 3 ? "is-urgent" : ""}`}>{seconds}</b>
        <span className={`qt-pip__lock ${answered ? "is-locked" : "is-open"}`}>
          {answered ? (
            <>
              <Icon name="check" /> {t("pip.locked")}
            </>
          ) : (
            t("pip.answerNow")
          )}
        </span>
      </div>
    );
  }

  return (
    <main className="qt-pip" aria-live="polite">
      {/* Tasarım 3c: baş bölünür — marka solda (yüzen pencere hangi uygulama?),
        durum sağda. Eskiden "Q + tur" tek blok soldaydı, wordmark yoktu. */}
      <div className="qt-pip__head">
        <div className="qt-pip__brand">
          <img src="/table/quiztavern-logo.png" alt="" />
          <b>{t("brand.name")}</b>
        </div>
        <span className="qt-pip__tag">{tag}</span>
      </div>
      <div className="qt-pip__body">{body}</div>
      <small className="qt-pip__hint">{t("pip.tapToReturn")}</small>
    </main>
  );
}

/**
 * Web misafir kapısı: Discord'suz tarayıcı oyuncusu isim + oda kodu girer.
 * İsim girilene kadar socket hiç bağlanmaz (realtime kapısı) — bu ekran
 * masanın önündeki tek zorunlu adımdır. Oda kodu değişirse ?room= yeniden
 * yazılarak sayfa yüklenir (identity oradan kurulur).
 */
function GuestGate({ roomCode, onJoin }: { roomCode: string; onJoin: (name: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [code, setCode] = useState(roomCode === "dev-ana-lobi" ? "" : roomCode);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextCode = code.trim().toLowerCase();
    if (nextCode && nextCode !== roomCode) {
      const url = new URL(window.location.href);
      url.searchParams.set("room", nextCode);
      url.searchParams.set("name", trimmed.slice(0, 24));
      window.location.assign(url.toString());
      return;
    }
    onJoin(trimmed);
  };
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomCode === "dev-ana-lobi" ? "ana-lobi" : roomCode)}`;
  return (
    <main className="qt-activity qt-guest-gate">
      <header className="qt-activity-bar">
        <div className="qt-brand-mark">
          <img src="/table/quiztavern-logo.png" alt="" />
          <b>{t("brand.name")}</b>
        </div>
      </header>
      <form className="qt-guest-gate__card" onSubmit={submit}>
        <h1>{t("web.gateTitle")}</h1>
        <p className="qt-guest-gate__intro">{t("web.gateIntro")}</p>
        <label>
          <span>{t("web.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder={t("web.namePlaceholder")}
            autoFocus
            required
          />
        </label>
        <label>
          <span>{t("web.roomCode")}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={24}
            placeholder="ana-lobi"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="qt-button qt-button--primary" disabled={!name.trim()}>
          <Icon name="people" /> {t("web.join")}
        </button>
        <p className="qt-guest-gate__note">{t("web.guestNote")}</p>
        <p className="qt-guest-gate__share">
          {t("web.shareHint")}: <code>{shareUrl}</code>
        </p>
      </form>
    </main>
  );
}

function ActivityHome({ onRejoin }: { onRejoin: () => void }) {
  const { t } = useI18n();
  return (
    <main
      className="qt-activity qt-return-home"
      style={{ "--home-art": "url('/assets/discord-activity/activity-classic-stage.webp')" } as CSSProperties}
    >
      <div className="qt-return-home__haze" />
      <header className="qt-activity-bar">
        <div className="qt-brand-mark">
          <img src="/table/quiztavern-logo.png" alt="" />
          <b>{t("brand.name")}</b>
        </div>
      </header>
      <section className="qt-return-home__card">
        <span>{t("home.kicker")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
        <button className="qt-button qt-button--primary" onClick={onRejoin}>
          <Icon name="people" /> {t("home.rejoin")}
        </button>
      </section>
    </main>
  );
}

/**
 * Bağlantı koptu. Sunucu maç sırasında koltuğu 30 sn tutar; buradaki sayaç o
 * sürenin GÖSTERGESİDİR, kararı vermez — bağlantı kopukken sunucunun deadline'ını
 * öğrenmenin yolu yoktur, o yüzden aynı paylaşılan sabitten yerel olarak sayarız.
 * Gerçek karar her zaman sunucunundur; sayaç bitse bile socket.io denemeye devam
 * eder ve sunucu hâlâ kabul ediyorsa oyuncu masaya döner.
 */
function ReconnectOverlay({
  droppedAt,
  inMatch,
  onReconnect,
  onLeave,
}: {
  droppedAt: number;
  inMatch: boolean;
  onReconnect: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [, force] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => force((tick) => tick + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, RECONNECT_GRACE_MS - (Date.now() - droppedAt));
  const seconds = Math.ceil(remaining / 1000);
  const ratio = remaining / RECONNECT_GRACE_MS;
  const expired = remaining <= 0;
  return (
    <div
      ref={trapRef}
      className="qt-drop-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qt-reconnect-title"
      aria-live="assertive"
      tabIndex={-1}
    >
      <section className="qt-drop-card">
        {inMatch && (
          <div className="qt-drop-ring" style={{ "--ratio": String(ratio) } as CSSProperties}>
            <div className="qt-drop-ring__face">
              <b>{seconds}</b>
              <small>{t("drop.seconds")}</small>
            </div>
          </div>
        )}
        <span className="qt-drop-kicker">{t("drop.kicker")}</span>
        <h1 id="qt-reconnect-title">
          {inMatch && !expired ? t("drop.title") : t("drop.retrying")}
          <em>.</em>
        </h1>
        <p>{expired ? t("drop.expired") : inMatch ? t("drop.body") : t("drop.bodyLobby")}</p>
        <div className="qt-drop-actions">
          <button type="button" className="qt-button" data-autofocus onClick={onReconnect}>
            <Icon name="arrow" /> {t("drop.reconnect")}
          </button>
          <button type="button" className="qt-button qt-button--danger" onClick={onLeave}>
            <Icon name="exit" /> {t("game.leave")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Masaya kısa tepki. Gönderim hız sınırı SUNUCUDA; burası sadece arayüz. */
function EmoteBar({
  emotes,
  players,
  onSend,
}: {
  emotes: LiveEmote[];
  players: PublicPlayer[];
  onSend: (emote: EmoteKey) => void;
}) {
  const { t } = useI18n();
  const glyphs: Record<EmoteKey, React.ReactNode> = {
    flame: <Icon name="flame" weight="fill" />,
    heart: <Icon name="heart" weight="fill" />,
    star: <Icon name="star" weight="fill" />,
    clap: <Icon name="clap" weight="fill" />,
    laugh: <Icon name="laugh" weight="fill" />,
    crown: <Icon name="crown" weight="fill" />,
    sword: <Icon name="sword" weight="fill" />,
    skull: <Icon name="skull" weight="fill" />,
  };
  const labels: Record<EmoteKey, StringKey> = {
    flame: "emote.flame",
    heart: "emote.heart",
    star: "emote.star",
    clap: "emote.clap",
    laugh: "emote.laugh",
    crown: "emote.crown",
    sword: "emote.sword",
    skull: "emote.skull",
  };
  return (
    <>
      <div className="qt-emote-bar" aria-label={t("emote.label")}>
        {EMOTE_KEYS.map((key) => (
          <button
            key={key}
            className={`qt-emote-btn is-${key}`}
            title={t(labels[key])}
            aria-label={t(labels[key])}
            onClick={() => onSend(key)}
          >
            {glyphs[key]}
          </button>
        ))}
      </div>
      <div className="qt-emote-feed" aria-hidden="true">
        {emotes.map((emote) => (
          <span key={emote.uid} className={`qt-emote-fly is-${emote.emote}`}>
            {glyphs[emote.emote]}
            <i>{players.find((player) => player.id === emote.playerId)?.name ?? ""}</i>
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Ayrılmanın sonucu masada başka insan olup olmamasına bağlı, o yüzden metin de
 * öyle: yalnızsan masa kapanır ve kuruluma dönersin; başkası varsa masa devam
 * eder ve sen çıkarsın. Tek bir sabit metin ikisinden birinde yalan olurdu
 * (eskiden "Ayrıl ve ana lobiye dön" diyordu; öyle bir yer yok).
 */
/**
 * Açılış perdesi: her oturumda EN AZ 1.5sn görünür (bkz. ActivityApp'teki
 * booted zamanlayıcısı) — bağlantı ne kadar hızlı olursa olsun marka anı
 * atlanmaz. fading=true olunca opacity 0'a iner, üst bileşen kısa süre
 * sonra bunu tamamen unmount eder.
 */
function BootCurtain({ fading }: { fading: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`qt-boot-curtain ${fading ? "is-fading" : ""}`} aria-hidden="true">
      <img className="qt-boot-curtain__logo" src="/table/owl-logo.webp" alt="" />
      <b className="qt-boot-curtain__title">{t("brand.name")}</b>
      <small className="qt-boot-curtain__sub">{t("boot.subtitle")}</small>
    </div>
  );
}

/** İlk ziyarette (qt-howto-seen localStorage'da yoksa) bir kez açılan 3 adımlık tanıtım. */
function HowToPlayModal({ onClose }: { onClose: (dontShow: boolean) => void }) {
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLElement>(true);
  const [dontShow, setDontShow] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(dontShow);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dontShow]);
  const steps: { icon: IconName; color: string; title: StringKey; body: StringKey }[] = [
    { icon: "cards", color: "#f3c362", title: "howto.step1Title", body: "howto.step1Body" },
    { icon: "lock", color: "#62e8df", title: "howto.step2Title", body: "howto.step2Body" },
    { icon: "trophy", color: "#f3c362", title: "howto.step3Title", body: "howto.step3Body" },
  ];
  return (
    <div
      className="qt-howto-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(dontShow);
      }}
    >
      <section ref={trapRef} className="qt-howto-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
        <div className="qt-howto-modal__head">
          <div>
            <span>{t("table.howTo")}</span>
            <b id="howto-title">{t("howto.title")}</b>
          </div>
          <button
            type="button"
            className="qt-howto-modal__close"
            onClick={() => onClose(dontShow)}
            aria-label={t("leave.cancel")}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="qt-howto-modal__steps">
          {steps.map((step, index) => (
            <div className="qt-howto-modal__step" key={index}>
              <div className="qt-howto-modal__step-head">
                <span className="qt-howto-modal__step-icon" style={{ "--step-color": step.color } as CSSProperties}>
                  <Icon name={step.icon} />
                </span>
                <b className="qt-howto-modal__step-num">{index + 1}</b>
              </div>
              <b>{t(step.title)}</b>
              <small>{t(step.body)}</small>
            </div>
          ))}
        </div>
        <div className="qt-howto-modal__foot">
          <button
            type="button"
            className={`qt-howto-modal__dontshow ${dontShow ? "is-checked" : ""}`}
            onClick={() => setDontShow((value) => !value)}
            aria-pressed={dontShow}
          >
            <span className="qt-howto-modal__checkbox" aria-hidden="true">
              {dontShow ? <Icon name="check" /> : null}
            </span>
            {t("howto.dontShow")}
          </button>
          <button type="button" className="qt-button qt-button--gold" onClick={() => onClose(dontShow)}>
            {t("howto.close")}
          </button>
        </div>
      </section>
    </div>
  );
}

function LeaveConfirm({ alone, onCancel, onConfirm }: { alone: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const trapRef = useFocusTrap<HTMLElement>(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      className="qt-leave-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section ref={trapRef} className="qt-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
        <span>{t("leave.kicker")}</span>
        <h2 id="leave-title">{t("leave.title")}</h2>
        <p>{t(alone ? "leave.bodyAlone" : "leave.body")}</p>
        <div>
          <button className="qt-button" onClick={onCancel}>
            {t("leave.cancel")}
          </button>
          <button className="qt-button qt-button--danger" onClick={onConfirm}>
            <Icon name="exit" /> {t(alone ? "leave.confirmAlone" : "leave.confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ActivityApp() {
  const activity = useDiscordActivity();
  const roomId = activity.identity.instanceId || "ana-lobi";
  // Özel masa: Discord/dev oyuncusu kod girince sunucu onu web-<kod> odasına
  // yerleştirir (üyelik doğrulaması hâlâ instanceId üzerinden koşar). Socket
  // privateRoom değişince yeniden kurulur — oda değişimi = yeniden bağlanma.
  const [privateRoom, setPrivateRoom] = useState<string | null>(null);
  const game = useRealtimeGame(roomId, activity.identity, activity.retry, privateRoom);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [hasLeftGame, setHasLeftGame] = useState(false);
  // "Sonucu gördüm" işareti: bu maç kimliği için sonuç ekranı bir daha açılmaz.
  const [seenMatchId, setSeenMatchId] = useState<number | null>(null);
  // Açılış perdesi: her oturumda EN AZ 1.5sn — bağlantı ne kadar hızlı olursa
  // olsun marka anı atlanmaz. booted true olunca fade başlar, fade bitince
  // (500ms sonra, CSS transition süresiyle eşleşir) tamamen unmount olur.
  const [booted, setBooted] = useState(false);
  const [showCurtain, setShowCurtain] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!booted) return;
    const timer = window.setTimeout(() => setShowCurtain(false), 500);
    return () => window.clearTimeout(timer);
  }, [booted]);
  // "Nasıl oynanır": perde kapandıktan kısa süre sonra, yalnızca daha önce
  // kapatılıp "bir daha gösterme" işaretlenmemişse bir kez açılır.
  const [howToOpen, setHowToOpen] = useState(false);
  useEffect(() => {
    if (!booted) return;
    const seen = storageGet("qt-howto-seen") === "1";
    if (seen) return;
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) setHowToOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [booted]);
  const closeHowTo = (dontShow: boolean) => {
    if (dontShow) storageSet("qt-howto-seen", "1");
    setHowToOpen(false);
  };
  // Dil kalıcılığı YALNIZ kullanıcının açık seçiminden yazılır; aksi halde
  // ilk açılış 'tr'yi hemen saklar ve Discord locale önerisi sonsuza kör kalır.
  const [language, setLanguageState] = useState<ActivityLanguage>(() =>
    storageGet("qt-ui-language") === "en" ? "en" : "tr",
  );
  const setLanguage = useCallback((next: ActivityLanguage) => {
    storageSet("qt-ui-language", next);
    setLanguageState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  // Kullanıcı hiç dil seçmediyse Discord istemcisinin diline uy (userSettingsGetLocale).
  useEffect(() => {
    if (storageGet("qt-ui-language") || !activity.identity.locale) return;
    setLanguageState(activity.identity.locale.toLowerCase().startsWith("tr") ? "tr" : "en");
  }, [activity.identity.locale]);
  // Sözlük tek yerden sağlanır; her bileşen useI18n() ile okur, prop zinciri yok.
  const i18n = useMemo(
    () => ({
      language,
      t: (key: StringKey, params?: Record<string, string | number>) => translate(language, key, params),
    }),
    [language],
  );
  // Discord Rich Presence: durum çubuğunda masa fazı (yalnız kozmetik; SDK
  // setActivity her state paketinde değil, yalnız anlamlı geçişte çağrılır).
  const phase = game.state?.phase;
  const roundIndex = game.state?.round.index;
  const roundTotal = game.state?.round.total;
  const spectating = !!game.state && !game.state.players.some((player) => player.id === game.state!.youId);
  useEffect(() => {
    if (!activity.identity.isDiscord || !phase) return;
    if (spectating) {
      activity.setPresence(i18n.t("presence.spectating"));
      return;
    }
    if (phase === "lobby") activity.setPresence(i18n.t("presence.lobby"));
    else if (phase === "podium") activity.setPresence(i18n.t("presence.podium"));
    else activity.setPresence(i18n.t("presence.playing", { current: (roundIndex ?? 0) + 1, total: roundTotal ?? 0 }));
  }, [activity.identity.isDiscord, activity.setPresence, phase, roundIndex, roundTotal, spectating, i18n]);
  // Reaktif SFX: rakip eylemleri de sesle duyulur — zil kazanımı, pano hücresi
  // açılışı (pick→question), eliminasyon, gelen emote. Her olay BİR kez;
  // son görülen değerler ref'te tutulur. Etkileşim sesleri ('lock') ayrıca var;
  // bu katman yalnızca "görmeden duy" bildirimleri içindir.
  const zilWinner = game.state?.zil?.winnerId ?? null;
  const emoteTopUid = game.emotes.length ? game.emotes[game.emotes.length - 1].uid : 0;
  const livesKey = game.state?.players.map((p) => `${p.id}:${p.lives ?? -1}`).join(",") ?? "";
  const reactRef = useRef<{
    buzz: string | null;
    prevPhase: string | undefined;
    dead: ReadonlySet<string>;
    emoteUid: number;
  }>({ buzz: null, prevPhase: undefined, dead: new Set(), emoteUid: 0 });
  useEffect(() => {
    const r = reactRef.current;
    const st = game.state;
    if (!st) return;
    if (zilWinner && r.buzz !== zilWinner) {
      r.buzz = zilWinner;
      sfx.play("buzz");
    }
    if (!zilWinner) r.buzz = null;
    if (st.gameMode === "board" && r.prevPhase === "pick" && st.phase === "question") sfx.play("flip");
    r.prevPhase = st.phase;
    const deadNow = new Set(st.players.filter((p) => p.lives === 0).map((p) => p.id));
    deadNow.forEach((id) => {
      if (!r.dead.has(id)) sfx.play("elim");
    });
    r.dead = deadNow;
    if (emoteTopUid > r.emoteUid) {
      r.emoteUid = emoteTopUid;
      sfx.play("pop");
    }
  }, [zilWinner, phase, livesKey, emoteTopUid, game.state]);
  const isLoading = activity.status === "booting" || !game.state;
  const body = useMemo(() => {
    // Web misafiri henüz ad yazmadıysa kapı ekranı: isim olmadan socket
    // zaten bağlanmaz (realtime kapısı), lobiyi hiç göstermeyiz.
    if (activity.identity.webGuest && !activity.identity.user?.name)
      return <GuestGate roomCode={activity.identity.instanceId} onJoin={activity.setGuestName} />;
    // PIP tüm fazların önüne geçer: masa o pencereye sığmadığı için hiçbir
    // faz ekranı orada render edilmez.
    if (activity.layoutMode === "pip" && !isLoading && !hasLeftGame) return <PipCard state={game.state} />;
    if (hasLeftGame)
      return (
        <ActivityHome
          onRejoin={() => {
            game.rejoinGame();
            setHasLeftGame(false);
          }}
        />
      );
    // Hata varsa iskelet değil metin: shimmer sonsuza dek dönüp sorunu gizlemesin.
    // Yükleme (hatasız): boş spinner yerine oyun düzeninin iskeleti (3d).
    if (isLoading) {
      // Socket kesin olarak düştüyse iskeleti sonsuza döndürme: bağlantı
      // hatasını göster. activity.retry YOK — o Discord OAuth'u baştan kurar;
      // yalnız socket'i yeniden bağlamak yeterli (reconnectNow).
      if (!activity.error && game.status === "offline") {
        const detail = game.connectionError?.code ?? game.connectionError?.message;
        return (
          <main className="qt-activity qt-boot">
            <div className="qt-boot-orbit" />
            <h1>{i18n.t("boot.unreachable")}</h1>
            <p>{detail ? `${i18n.t("err.connection")} (${detail})` : i18n.t("err.connection")}</p>
            <button type="button" className="qt-button qt-button--primary" onClick={game.reconnectNow}>
              {i18n.t("boot.retry")}
            </button>
          </main>
        );
      }
      return activity.error ? (
        <main className="qt-activity qt-boot">
          <div className="qt-boot-orbit" />
          <h1>{i18n.t("boot.title")}</h1>
          <p>{activity.error}</p>
          <button type="button" className="qt-button qt-button--primary" onClick={activity.retry}>
            {i18n.t("boot.retry")}
          </button>
        </main>
      ) : (
        <GameSkeleton loadingLabel={i18n.t("app.loading")} />
      );
    }
    // Oda lobiye dönmüş olabilir ama bu oyuncu sonuç ekranından henüz çıkmadı:
    // son maçı lastMatch'ten çizmeye devam et (başkası "Lobiye dön" dedi diye
    // kimsenin ekranı zorla değişmez).
    const lm = game.state!.lastMatch;
    if (game.state!.phase === "lobby" && lm && lm.id !== seenMatchId) {
      const resultsState: GameState = {
        ...game.state!,
        phase: "podium",
        gameMode: lm.gameMode,
        teamScores: lm.teamScores,
        podium: lm.podium,
        matchSummary: lm.matchSummary,
        xpGains: lm.xpGains,
        daily: lm.daily,
        round: { index: Math.max(0, lm.roundTotal - 1), total: lm.roundTotal },
      };
      return (
        <Podium
          state={resultsState}
          speakingIds={activity.speakingIds}
          isDiscord={activity.identity.isDiscord}
          onShare={activity.share}
          onBackToLobby={() => {
            setSeenMatchId(lm.id);
            game.returnToLobby();
          }}
          onLeave={() => setLeaveConfirmOpen(true)}
        />
      );
    }
    if (game.state!.phase === "lobby")
      return (
        <ActivityLobby
          state={game.state}
          status={game.status}
          identity={activity.identity}
          speakingIds={activity.speakingIds}
          language={language}
          onLanguageChange={setLanguage}
          onReady={game.ready}
          onStart={game.start}
          onStartDaily={game.startDaily}
          onSetCategories={game.setCategories}
          onSetQuestionCount={game.setQuestionCount}
          onSetDifficulty={game.setDifficulty}
          onSetPack={game.setPack}
          onSetQuestionTime={game.setQuestionTime}
          onSetSpeedBonus={game.setSpeedBonus}
          onSetImageOnly={game.setImageOnly}
          onSetTableTheme={game.setTableTheme}
          onSetTitle={game.setTitle}
          onSubmitQuestion={game.submitQuestion}
          onDeleteQuestion={game.deleteQuestion}
          onSetMode={game.setMode}
          onSetTeam={game.setTeam}
          onShuffleTeams={game.shuffleTeams}
          onKick={game.kick}
          onTransferHost={game.transferHost}
          onInvite={activity.invite}
          onSpectate={game.spectate}
          onTakeSeat={game.takeSeat}
          onHelp={() => setHowToOpen(true)}
          onJoinPrivateRoom={(code) => setPrivateRoom(code)}
          onLeavePrivateRoom={() => setPrivateRoom(null)}
          // Yalnız yerel mock mod: Discord iframe'inde ya da üretimdeki web
          // misafirinde boş koltuk her zamanki gibi davet açar.
          onAddBot={activity.identity.isDiscord || activity.identity.webGuest ? undefined : game.addBot}
        />
      );

    if (game.state!.phase === "countdown") return <StartCountdown state={game.state!} />;
    // Çifte Bahis: soru öncesi bahis fazı — kendi board'u (kategori + bahis arayüzü).
    if (game.state!.phase === "bet")
      return (
        <BetBoard
          state={game.state!}
          onBet={game.placeBet}
          onLeave={() => setLeaveConfirmOpen(true)}
          onSpectate={game.spectate}
          speakingIds={activity.speakingIds}
        />
      );
    // Tavern Panosu: hücre seçme fazı — sırası gelen panodan değer seçer.
    if (game.state!.phase === "pick")
      return (
        <PickBoard
          state={game.state!}
          onPickCell={game.pickCell}
          onLeave={() => setLeaveConfirmOpen(true)}
          onSpectate={game.spectate}
          speakingIds={activity.speakingIds}
        />
      );
    // Soru ve reveal aynı board: faz değişse de bileşen unmount olmaz, kartlar yerinde kalır.
    if (game.state!.phase === "question" || game.state!.phase === "reveal")
      return (
        <GameBoard
          state={game.state!}
          onAnswer={game.answer}
          onCircleAnswer={game.answerCircle}
          onWordAnswer={game.answerWord}
          onWordLetter={game.wordLetter}
          onUseCard={game.useCard}
          onLeave={() => setLeaveConfirmOpen(true)}
          onSpectate={game.spectate}
          onReport={() => game.reportQuestion()}
          onPredict={game.predict}
          onBuzz={game.buzz}
          onNumericAnswer={game.answerNumeric}
          onOrderAnswer={game.answerOrder}
          speakingIds={activity.speakingIds}
          emoteBar={
            !hasLeftGame ? (
              <EmoteBar emotes={game.emotes} players={game.state!.players} onSend={game.sendEmote} />
            ) : null
          }
        />
      );
    // Podyum: "Lobiye dön" odada KALIR ve sahipliği korur (RETURN_TO_LOBBY).
    // Eskiden bu düğme masadan ayrılıyordu: sahiplik devrediliyor, geri gelen
    // yine podyuma düşüyor, herkes tıklamadan kimse lobiye ulaşamıyordu.
    // Gerçek ayrılma sağ üstteki onaylı "Masadan ayrıl"da.
    const matchId = game.state!.lastMatchId;
    return (
      <Podium
        state={game.state!}
        speakingIds={activity.speakingIds}
        isDiscord={activity.identity.isDiscord}
        onShare={activity.share}
        onAgain={() => game.start(game.state!.gameMode)}
        onRematch={game.rematch}
        onBackToLobby={() => {
          if (matchId !== null) setSeenMatchId(matchId);
          game.returnToLobby();
        }}
        onLeave={() => setLeaveConfirmOpen(true)}
      />
    );
  }, [
    activity.error,
    activity.identity,
    activity.layoutMode,
    activity.setGuestName,
    activity.status,
    game,
    hasLeftGame,
    i18n,
    isLoading,
    language,
    seenMatchId,
  ]);
  /**
   * Discord Activity'de instance = masa; gidilecek ayrı bir "ana sayfa" yok.
   * O yüzden ayrılmanın anlamı masadaki başka insana bağlı:
   *  - Son insan bensem sunucu odayı siler (rooms.ts: "Gerçek oyuncu kalmadıysa
   *    ... odayı kapat"). Hemen geri bağlanmak taze bir lobi verir — kullanıcının
   *    beklediği "ana sayfaya dön" bu.
   *  - Başkaları varsa masa devam eder; geri bağlanmak beni maça geri sokardı.
   *    Bu durumda bekleme ekranı doğru cevap.
   * Kararı istemci verebilir: durum paketinde zaten kim insan, kim bot yazıyor.
   */
  // Bağlantısı kopmuş (grace'te bekleyen) insan "masada başkası var" sayılmaz.
  const aloneAtTable = !game.state?.players.some(
    (player) => player.id !== game.state!.youId && !player.isBot && player.connected,
  );
  const confirmLeave = () => {
    game.leaveGame(aloneAtTable);
    setLeaveConfirmOpen(false);
    if (!aloneAtTable) setHasLeftGame(true);
  };
  const isPip = activity.layoutMode === "pip";
  // Kopma ekranı yalnızca oyuncu masadayken anlamlı: kendi isteğiyle ayrıldıysa
  // ya da PIP'teyse gösterme. Grace yalnızca maç sırasında işler.
  const showDrop = !isPip && !hasLeftGame && game.droppedAt !== null && !!game.state;
  const inMatch = game.state ? game.state.phase !== "lobby" && game.state.phase !== "podium" : false;
  // Lobi dışındaki her sahne "oyun sahnesi": arka planı sade kalır.
  const onGameScene = !!game.state && game.state.phase !== "lobby";
  const showSpectatorBar = !isPip && !showDrop && !!game.state?.youAreSpectator && game.state.phase !== "lobby";
  // Grid için ayrı tasarım yok: focused'ın dar hali gibi davranır, responsive iskelet karşılar.
  return (
    <I18nContext.Provider value={i18n}>
      {/* Yörünge animasyonu lobiye ait: orada masayı anlatıyor, oyun sahnelerinde
        ise şıkların ve sayacın üzerinden geçen dev bir elipse dönüşüyordu. */}
      <div
        className={`qt-activity-root is-${activity.layoutMode} ${showSpectatorBar ? "has-spectator-bar" : ""}`}
        // Lig rütbesi masanın malzemesini belirler (tavern→void, lonca teması).
        data-theme={game.state?.tableTheme ?? "tavern"}
      >
        {!isPip && !onGameScene && !activity.lowPower && <AmbientShader />}
        {body}
      </div>

      {/* İzleyici çubuğu: oyun/podyum fazlarında (lobide you-panel hallediyor). */}
      {showSpectatorBar && (
        <SpectatorBar
          state={game.state!}
          canSit={game.state!.players.length < 8}
          onTakeSeat={game.takeSeat}
          onPredict={game.predict}
        />
      )}
      {showDrop && (
        <ReconnectOverlay
          droppedAt={game.droppedAt!}
          inMatch={inMatch}
          onReconnect={game.reconnectNow}
          onLeave={confirmLeave}
        />
      )}
      {!isPip && !showDrop && leaveConfirmOpen && (
        <LeaveConfirm alone={aloneAtTable} onCancel={() => setLeaveConfirmOpen(false)} onConfirm={confirmLeave} />
      )}
      {!isPip && showCurtain && <BootCurtain fading={booted} />}
      {!isPip && howToOpen && game.state?.phase === "lobby" && <HowToPlayModal onClose={closeHowTo} />}
      {!isPip && game.message && (
        <button type="button" className="qt-toast" role="status" aria-live="polite" onClick={game.dismissMessage}>
          {i18n.t(game.message.key, game.message.params)}
        </button>
      )}
    </I18nContext.Provider>
  );
}
