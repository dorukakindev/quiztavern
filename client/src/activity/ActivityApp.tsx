import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { sfx } from '../lib/sfx'
import { storageGet, storageSet } from '../lib/storage'
import { EMOTE_KEYS, QUESTION_COUNTS, RECONNECT_GRACE_MS, type CategoryOption, type CirclePayload, type Difficulty, type EmoteKey, type GameMode, type GameState, type LeagueKey, type MatchSummary, type PodiumEntry, type ProgressBadge, type ProgressSnapshot, type PublicPlayer, type ReviewItem, type BadgeKey, type XpGain } from '../../../shared/types'
import { getDevIdentity, useRealtimeGame, type LiveEmote } from '../lib/realtime'
import { useDiscordActivity } from './useDiscordActivity'
import { AmbientShader } from './AmbientShader'
import { I18nContext, categoryLabel, formatNumber, formatPercent, translate, useI18n, type ActivityLanguage, type StringKey } from './i18n'
import { GalaxyLoop, MusicToggle, TableBackdrop, TableLogo } from './TableScenery'
import { PodiumCharacter } from './PodiumCharacter'
import { CATEGORY_ICON_PATHS } from './categoryIcons'
import { betOptionSpecs, bothTeamsPresent, circleAnswerIsLocked, circleInputShouldFocus, nextMenuIndex, questionIsLocked, shortcutIndex } from './gameLogic'
import { deletePack, getPack, listPacks, savePack, uploadPack, type PackAuth, type PackQuestion, type PackUploadResult, type QuestionPackMeta } from './packs'

type IconName = 'chevron' | 'spark' | 'bolt' | 'circle' | 'lock' | 'check' | 'close' | 'arrow' | 'people' | 'crown' | 'exit' | 'globe' | 'mic' | 'eye' | 'coin' | 'more' | 'flag' | 'calendar'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    chevron: 'm6 9 6 6 6-6',
    spark: 'M12 2 14 9l7 3-7 3-2 7-3-7-7-3 7-3 3-7Z',
    bolt: 'm13 2-9 12h7l-1 8 9-12h-7l1-8Z',
    circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4 10-4 3-4-3m4-7v10',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3m-11 0h12v9H6v-9Z',
    check: 'm5 12 4 4L19 6',
    close: 'M6 6l12 12M18 6 6 18',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    people: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m14-8a4 4 0 1 0 0-8m5 16v-1a4 4 0 0 0-3-3.87',
    crown: 'm3 7 4 3 5-6 5 6 4-3-2 10H5L3 7Z',
    exit: 'M10 17l5-5-5-5m5 5H3m11-7V3h6v18h-6v-2',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21c-2.2-2.5-3.3-5.5-3.3-9S9.8 5.5 12 3Z',
    // Lider taç değil ALTIN MİKROFON taşır — gece yarısı yayın teması.
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3m-4 0h8',
    // Çifte Bahis jetonu: madeni para + içinde işaret.
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m3-8h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9',
    // Diğer modlar tetikleyicisi: üç kare (Fitil/Bahis/Takım'ı temsilen "daha fazla").
    more: 'M4 5h6v6H4V5Zm10 0h6v6h-6V5ZM4 15h6v6H4v-6Zm10 0h6v6h-6v-6Z',
    // Soru bildirimi bayrağı (reveal köşesinde küçük buton).
    flag: 'M5 21V4m0 1h12l-3 4 3 4H5',
    // Günlük meydan okuma: takvim.
    calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  }
  // Göz: izleyici kimliği sürdükçe nazik, seyrek göz kırpma (idle · loop seyrek).
  return <svg className={`qt-icon ${name === 'eye' ? 'qt-icon--eye' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

let flameGradSeq = 0
/** Seri alevi: emoji değil, turuncu→altın gradyanlı çizgi ikon (İkon Seti tasarımı).
 *  Gradient id her örnekte benzersiz olmalı (şeritte birden fazla oyuncu aynı anda alev taşıyabilir). */
function FlameIcon() {
  const gradId = useMemo(() => `qt-flame-grad-${flameGradSeq++}`, [])
  return <svg viewBox="0 0 32 32" aria-hidden="true" style={{ width: 13, height: 13 }}>
    <defs><linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ef8674" /><stop offset="1" stopColor="#f3c362" /></linearGradient></defs>
    <path d="M16 4c2.3 4 6 6.2 6 11.2a6 6 0 0 1-12 0c0-1.8.5-3 1.5-4.4.3 1.5 1.2 2.3 2.5 2.6-1-4 .7-7.6 2-9.4Z" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
}

/** Lig anahtarı → i18n anahtarı (tek tablo: sunucu lig adını değil anahtarı yollar,
 *  ad her istemcide kendi dilinde yazılır). */
const LEAGUE_KEYS: Record<LeagueKey, StringKey> = {
  acemi: 'league.acemi', cirak: 'league.cirak', kalfa: 'league.kalfa', usta: 'league.usta', efsane: 'league.efsane',
}

/** Kompakt lig+seviye rozeti: lig renginde nokta + "Sv N" (verbose'da lig adı). */
function LeagueBadge({ badge, verbose = false }: { badge: ProgressBadge; verbose?: boolean }) {
  const { t } = useI18n()
  const league = LEAGUE_KEYS[badge.league] ?? 'league.acemi'
  return <span className={`qt-league is-${badge.league}`} title={t(league)}><i aria-hidden="true" />{verbose ? t(league) : t('progress.level', { n: badge.level })}</span>
}

/** Lobide "SENİN KOLTUĞUN" altındaki ince XP şeridi: seviye, lig ve sonraki
 *  seviyeye kalan bar; art-arda-gün serisi varsa küçük alevle gösterilir. */
function XpStrip({ snapshot }: { snapshot: ProgressSnapshot | null }) {
  const { t } = useI18n()
  if (!snapshot) return null
  const pct = Math.min(100, Math.round((snapshot.intoLevel / Math.max(1, snapshot.levelSize)) * 100))
  const remaining = Math.max(0, snapshot.levelSize - snapshot.intoLevel)
  return <div className="qt-xp-strip">
    <div className="qt-xp-strip__head">
      <LeagueBadge badge={snapshot} verbose />
      <b>{t('progress.level', { n: snapshot.level })}</b>
      {snapshot.streakDays > 1 && <span className="qt-xp-streak" title={t('progress.streak', { n: snapshot.streakDays })}><FlameIcon />{snapshot.streakDays}</span>}
    </div>
    <div className="qt-xp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
    <small>{t('progress.nextLevel', { xp: remaining })}</small>
    {snapshot.badges.length > 0 && <div className="qt-badge-row" aria-label={t('badge.title')}>
      {snapshot.badges.map((badge) => <span key={badge} className="qt-badge" title={t(`badge.${badge}.hint` as StringKey)}><Icon name="spark" /> {t(`badge.${badge}` as StringKey)}</span>)}
    </div>}
  </div>
}

/** Maçta ilk kez kazanılan rozetler — podyumda XP kazanımının yanında
 *  parlayan altın haplar; isim değil koşulu tooltip'te. */
function NewBadgeChips({ gain }: { gain: XpGain }) {
  const { t } = useI18n()
  if (!gain.newBadges?.length) return null
  return <span className="qt-badge-new-row" role="status" aria-label={t('badge.new')}>
    {gain.newBadges.map((badge) => <em key={badge} className="qt-badge-new" title={t(`badge.${badge}.hint` as StringKey)}><Icon name="spark" /> {t(`badge.${badge}` as StringKey)}</em>)}
  </span>
}

/** Lobide güncel sezonun ilk 5'i + sıralamada olmayan senin satırın. */
function SeasonStrip({ state }: { state: GameState }) {
  const { t, language } = useI18n()
  const board = state.seasonBoard
  if (!board) return null
  const yourRank = state.progress?.seasonRank ?? null
  const youIn = board.entries.some((entry) => entry.userId === state.youId)
  return <div className="qt-season">
    <div className="qt-season__head"><span>{t('season.title', { season: board.season })}</span></div>
    {board.entries.length
      ? <ol className="qt-season__list">
        {board.entries.map((entry) => <li key={entry.userId} className={entry.userId === state.youId ? 'is-you' : ''}>
          <b>#{entry.rank}</b><i className={`qt-league-dot is-${entry.league}`} aria-hidden="true" /><span title={entry.name}>{entry.name}</span><em>{formatNumber(language, entry.xp)} XP</em>
        </li>)}
        {!youIn && yourRank !== null && state.progress && <li className="is-you">
          <b>#{yourRank}</b><i className={`qt-league-dot is-${state.progress.league}`} aria-hidden="true" /><span>{t('podium.you')}</span><em>{formatNumber(language, state.progress.seasonXp)} XP</em>
        </li>}
      </ol>
      : <small className="qt-season__empty">{t('season.empty')}</small>}
  </div>
}

function LanguagePicker({ language, onChange }: { language: ActivityLanguage; onChange: (language: ActivityLanguage) => void }) {
  const { t } = useI18n()
  return <label className="qt-language-picker" title={t('lang.label')}>
    <Icon name="globe" />
    <select value={language} onChange={(event) => onChange(event.target.value as ActivityLanguage)} aria-label={t('lang.label')}>
      <option value="tr">TR</option>
      <option value="en">EN</option>
    </select>
  </label>
}

/** Mod adları ve etiketleri tek yerden; her fazda aynı sözlükten okunur. */
const MODE_KEYS = {
  classic: { name: 'mode.classic', meta: 'mode.classic.meta', tag: 'mode.classic.tag', icon: 'spark' },
  lightning: { name: 'mode.lightning', meta: 'mode.lightning.meta', tag: 'mode.lightning.tag', icon: 'bolt' },
  circle: { name: 'mode.circle', meta: 'mode.circle.meta', tag: 'mode.circle.tag', icon: 'circle' },
  bet: { name: 'mode.bet', meta: 'mode.bet.meta', tag: 'mode.bet.tag', icon: 'coin' },
  team: { name: 'mode.team', meta: 'mode.team.meta', tag: 'mode.team.tag', icon: 'people' },
} as const

function modeKeyOf(mode: GameMode): keyof typeof MODE_KEYS {
  return mode === 'circle' ? 'circle' : mode === 'lightning' ? 'lightning' : mode === 'bet' ? 'bet' : mode === 'team' ? 'team' : 'classic'
}

/**
 * Maket 1a: her oyuncunun avatarı kendi renginde (S amber, E mint, B mercan…).
 * Renk seatColorOf'tan gelir — lobideki koltuklar ve podyum zaten onu
 * kullanıyor, yani aynı oyuncu her ekranda aynı renkte. (Kendi paletimi
 * yazmıştım; iki palet zamanla ayrışır ve oyuncu lobide başka, masada başka
 * renk olurdu.)
 */
function Avatar({ player, compact = false, mode }: { player: PublicPlayer; compact?: boolean; mode?: GameMode }) {
  return <div className={`qt-avatar ${playerColorClass(player, mode)} ${compact ? 'qt-avatar--compact' : ''}`} title={player.name}>{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : player.name.slice(0, 1).toUpperCase()}</div>
}

/**
 * Sunucu saatini yerele sabitler. Offset yalnızca yeni durum paketi geldiğinde
 * güncellenir; aradaki her karede yerel saat akar. (Offset'i her render'da
 * yeniden hesaplamak, sayacı son push'ta dondurur.)
 */
function useServerNow(serverNow?: number, intervalMs = 100): number {
  const [offset, setOffset] = useState(0)
  const [, force] = useState(0)
  useEffect(() => { if (serverNow !== undefined) setOffset(serverNow - Date.now()) }, [serverNow])
  // Zamanlayıcı yalnızca yeniden çizimi tetikler; DEĞER her render'da taze
  // okunur. Zamanı state'te tutmak, sekme arka plandayken (interval kısılır)
  // sayacı bayat bir değerde dondurur — 8 saniyelik tur "25 sn" görünür.
  useEffect(() => { const timer = window.setInterval(() => force((tick) => tick + 1), intervalMs); return () => window.clearInterval(timer) }, [intervalMs])
  return Date.now() + offset
}

function useClock(deadline?: number, serverNow?: number) {
  const now = useServerNow(serverNow, 200)
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setReduced(query.matches)
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    }
    const legacyQuery = query as unknown as { addListener: (listener: () => void) => void; removeListener: (listener: () => void) => void }
    legacyQuery.addListener(onChange)
    return () => legacyQuery.removeListener(onChange)
  }, [])
  return reduced
}

function useMinWidth(px: number) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(`(min-width: ${px}px)`).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(`(min-width: ${px}px)`)
    if (!query) return
    const onChange = () => setMatches(query.matches)
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    }
    const legacyQuery = query as unknown as { addListener: (listener: () => void) => void; removeListener: (listener: () => void) => void }
    legacyQuery.addListener(onChange)
    return () => legacyQuery.removeListener(onChange)
  }, [px])
  return matches
}

/**
 * 0'dan hedefe easeOutCubic ile akan sayı. Değeri, reveal'ın sunucu saatinden
 * ölçülen geçmiş süresinden türetir — kendi zamanlayıcısını kurmaz. Böylece
 * sekme gizliyken (rAF/timer kısılırken) ya da maç ortasında bağlanıldığında
 * sayı "0'da takılı" kalmaz, her zaman ait olduğu değeri gösterir.
 */
function countUpValue(target: number, elapsedMs: number, reduced: boolean, ms = 700) {
  if (reduced || elapsedMs >= ms) return target
  if (elapsedMs <= 0) return 0
  const progress = elapsedMs / ms
  return Math.round(target * (1 - Math.pow(1 - progress, 3)))
}

/** Mount anından itibaren rAF ile hedefe sayar (podyum skoru gibi tek seferlik).
 *  reduced-motion'da anında hedefe oturur. countUpValue'nin eğrisini kullanır. */
function useCountUp(target: number, reduced: boolean, ms = 900) {
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const tick = () => {
      const elapsed = performance.now() - start
      setValue(countUpValue(target, elapsed, false, ms))
      if (elapsed < ms) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced, ms])
  return value
}

function Timer({ deadline, durationMs, serverNow, frozen = false }: { deadline?: number; durationMs?: number; serverNow?: number; frozen?: boolean }) {
  const { t } = useI18n()
  const now = useServerNow(serverNow, 200)
  const seconds = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0
  const ratio = deadline && durationMs ? Math.max(0, Math.min(1, (deadline - now) / durationMs)) : 1
  const urgent = !frozen && seconds <= 3
  const soon = !frozen && seconds <= 5 && seconds > 3
  const visibleRatio = frozen ? 0 : ratio
  return <div className={`qt-timer ${urgent ? 'is-urgent' : soon ? 'is-soon' : ''} ${frozen ? 'is-frozen' : ''}`} style={{ '--progress-turn': `${visibleRatio}turn`, '--timer-angle': `${1 - visibleRatio}turn` } as CSSProperties} role="timer" aria-label={`${frozen ? 0 : seconds} ${t('game.seconds')}`}>
    <i className="qt-timer__sweep" aria-hidden="true" />
    <span>{frozen ? 0 : seconds}</span>
    <small>{t('game.seconds')}</small>
  </div>
}

/** Soru kabuğu açılmadan önce, aynı deadline'a bağlı kısa ortak başlangıç sahnesi. */
function StartCountdown({ state }: { state: GameState }) {
  const { t } = useI18n()
  const countdown = state.countdown
  const seconds = useClock(countdown?.deadline, state.serverNow)
  const mode = MODE_KEYS[modeKeyOf(state.gameMode)]
  return <main className="qt-activity qt-start-countdown" style={{ '--countdown-art': `url('/assets/discord-activity/${state.gameMode === 'circle' ? 'activity-circle-table.webp' : 'activity-classic-stage.webp'}')` } as CSSProperties}>
    <div className="qt-start-countdown__backdrop" />
    <section className="qt-start-countdown__stage" aria-live="polite">
      <div className="qt-start-countdown__mode"><Icon name={mode.icon} /> {t(mode.tag)}</div>
      <p>{t('countdown.tableReady')}</p>
      {/* Rozet tek haneli rakama göre ölçülü; "BAŞLA"/"GO" yazıya döndüğünde
          font küçülmezse çemberden taşar (madde: kutunun içinde kalmalı). */}
      <div className={`qt-start-countdown__number ${seconds ? `is-${seconds}` : 'is-go'}`} key={seconds}>{seconds || t('countdown.go')}</div>
      <div className="qt-start-countdown__players" aria-label={t('countdown.players')}>
        {[...state.players].sort((a, b) => a.seat - b.seat).map((player) => <div key={player.id} className={player.id === state.youId ? 'is-you' : ''}><Avatar player={player} compact /><span title={player.name}>{player.name}</span></div>)}
      </div>
    </section>
  </main>
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
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null)
    // previous ÖNCE yakalandı (üstte); odağı ŞİMDİ içeri al. autoFocus KULLANMA:
    // React commit'te odağı effect'ten önce içeri taşırsa previous yanlış olur
    // (kapanışta restore sökülen düğüme gider). Tercih: [data-autofocus], yoksa ilki.
    if (!node.contains(document.activeElement)) (node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? node).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => { node.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [active])
  return ref
}

/** Zorluk segmenti (Kategori Kartları tasarımı): kategorinin baskın zorluğunu
 *  3 çubuktan kaçının dolu olduğuyla gösterir — kolay=1, orta=2, zor=3 dolu,
 *  renk de zorlukla eşleşir (nane/altın/mercan). İçerik yoksa (kilitli) hepsi boş. */
function DifficultySegments({ difficulty }: { difficulty: Difficulty | null }) {
  const filled = difficulty === 'kolay' ? 1 : difficulty === 'orta' ? 2 : difficulty === 'zor' ? 3 : 0
  return <span className={`qt-category-card__diff ${difficulty ? `is-${difficulty}` : ''}`} aria-hidden="true">
    {[0, 1, 2].map((i) => <i key={i} className={i < filled ? 'is-filled' : ''} />)}
  </span>
}

function CategoryPicker({ categories, selection, disabled, hint, mode, onMixed, onToggle }: { categories: CategoryOption[]; selection: string[]; disabled: boolean; hint: string; mode: GameMode; onMixed: () => void; onToggle: (name: string) => void }) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trapRef = useFocusTrap<HTMLDivElement>(open)
  // Sahiplik devredilirse (ya da alınırsa) açık pencere elde kalmasın.
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  // Her açılışta arama temiz başlasın.
  useEffect(() => { if (!open) setQuery('') }, [open])
  // Escape ile kapat (dışa tık backdrop ile çalışıyor).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const summary = selection.length ? selection.map((name) => categoryLabel(language, name)).join(', ') : t('category.mixed')
  // Türkçe-duyarlı, aksan/harf toleranslı arama (İ/ı dahil).
  const q = query.trim().toLocaleLowerCase('tr-TR')
  const filtered = q ? categories.filter((category) => category.name.toLocaleLowerCase('tr-TR').includes(q)) : categories
  // Seçili kategoriler arama boşken en başta görünsün (sekmeden bakınca anlaşılır).
  const ordered = q ? filtered : [...filtered].sort((a, b) => Number(selection.includes(b.name)) - Number(selection.includes(a.name)))
  return <div className="qt-category-picker">
    <button type="button" className={`qt-category-trigger ${open ? 'is-open' : ''}`} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span>{summary}</span>
      <Icon name="chevron" />
    </button>
    {open && createPortal(
      // Backdrop'a (dialog'un kendisine değil) tıklayınca kapanır.
      <div className="qt-category-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
        <div ref={trapRef} className="qt-category-modal" role="dialog" aria-modal="true" aria-label={t('category.title')}>
          <div className="qt-category-modal__head">
            <div><b>{t('category.title')}</b><small>{hint}</small></div>
            <button type="button" className="qt-category-modal__close" aria-label={t('category.close')} onClick={() => setOpen(false)}><Icon name="close" /></button>
          </div>
          {/* Çok kategori için arama: yazdıkça filtreler (İ/ı duyarlı). */}
          <input className="qt-category-modal__search" type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('category.search')} aria-label={t('category.search')} data-autofocus />
          {/* "Karışık" sıfırlama seçeneği: yalnız arama boşken üstte durur. */}
          {!q && <button type="button" className={`qt-category-chip qt-category-reset ${!selection.length ? 'is-selected' : ''}`} aria-pressed={!selection.length} onClick={onMixed}>{t('category.mixed')}</button>}
          <div className="qt-category-modal__grid">
            {ordered.map((category) => {
              const soon = category.classicCount === 0 && category.circleCount === 0
              const count = mode === 'circle' ? category.circleCount : category.classicCount
              const selected = selection.includes(category.name)
              return <button type="button" key={category.name} className={`qt-category-card ${selected ? 'is-selected' : ''} ${soon ? 'is-soon' : ''}`} aria-pressed={selected} disabled={soon} title={soon ? t('category.soon') : undefined} onClick={() => onToggle(category.name)}>
                {soon && <div className="qt-category-card__lock" aria-hidden="true"><Icon name="lock" /><span>{t('category.soonBadge')}</span></div>}
                <div className="qt-category-card__top">
                  <i className="qt-category-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={CATEGORY_ICON_PATHS[category.name] ?? 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'} /></svg></i>
                  {selected && <span className="qt-category-card__check" aria-hidden="true"><Icon name="check" /></span>}
                </div>
                <b className="qt-category-card__name">{categoryLabel(language, category.name)}</b>
                <div className="qt-category-card__foot">
                  <DifficultySegments difficulty={category.difficulty} />
                  <span className="qt-category-card__count">{soon ? '—' : t('category.questionCount', { count })}</span>
                </div>
              </button>
            })}
            {q && !filtered.length && <span className="qt-category-modal__empty">{t('category.noResults')}</span>}
          </div>
          <button type="button" className="qt-button qt-button--primary qt-category-modal__done" onClick={() => setOpen(false)}>{t('category.done')}</button>
        </div>
      </div>,
      document.body
    )}
  </div>
}

/** Modlar arasında Klasik + Çember her zaman görünür (en sık kullanılan ikisi);
 *  geri kalanı (Fitil/Çifte Bahis/Takım) CategoryPicker ile aynı desende
 *  (tetikleyici kart -> açılır modal -> seçilebilir kartlar) katlanır — 5 modu
 *  hep açık göstermek satır taşırıyor + gözü dağıtıyordu. */
const OTHER_MODES = ['lightning', 'bet', 'team'] as const
function ModePicker({ mode, isHost, onSetMode }: { mode: GameMode; isHost: boolean; onSetMode: (mode: GameMode) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>(open)
  useEffect(() => { if (!isHost) setOpen(false) }, [isHost])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const activeOther = (OTHER_MODES as readonly GameMode[]).includes(mode) ? mode as (typeof OTHER_MODES)[number] : null
  const triggerIcon = activeOther ? MODE_KEYS[activeOther].icon : 'more'
  const triggerLabel = activeOther ? t(MODE_KEYS[activeOther].name) : t('mode.more')
  return <>
    <button type="button" className={`qt-mode-card qt-mode-card--other ${activeOther ? 'is-selected' : ''}`} disabled={!isHost} aria-haspopup="dialog" aria-expanded={open} title={activeOther ? t(MODE_KEYS[activeOther].meta) : t('mode.more')} onClick={() => setOpen(true)}>
      <i className="qt-mode-card__tile" aria-hidden="true"><Icon name={triggerIcon} /></i>
      <b>{triggerLabel}</b>
    </button>
    {open && createPortal(
      <div className="qt-category-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
        <div ref={trapRef} className="qt-category-modal" role="dialog" aria-modal="true" aria-label={t('mode.more')}>
          <div className="qt-category-modal__head">
            <div><b>{t('mode.more')}</b><small>{t('mode.more.hint')}</small></div>
            <button type="button" className="qt-category-modal__close" aria-label={t('category.close')} onClick={() => setOpen(false)}><Icon name="close" /></button>
          </div>
          <div className="qt-category-modal__grid">
            {OTHER_MODES.map((item) => <button type="button" key={item} className={`qt-category-chip ${mode === item ? 'is-selected' : ''}`} aria-pressed={mode === item} onClick={() => { onSetMode(item); setOpen(false) }}>{t(MODE_KEYS[item].name)}</button>)}
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
}

function GameLeaveButton({ onLeave, floating = false }: { onLeave: () => void; floating?: boolean }) {
  const { t } = useI18n()
  // Etiket ayrı span'de: dar ekranda CSS yalnız ikonu bırakır (buton iki satıra
  // kırılıp başlığı ezmesin); ad title/aria-label'da kalır.
  return <button type="button" className={`qt-game-exit ${floating ? 'qt-game-exit--floating' : ''}`} onClick={onLeave} title={t('game.leave')} aria-label={t('game.leave')}><Icon name="exit" /><span className="qt-game-exit__label">{t('game.leave')}</span></button>
}

/** İzleyici çubuğu: oyun/podyum fazlarında izleyene "izliyorsun" der ve boş koltuk
 *  varsa "Oyna" ile oturtur (lobide bu iş you-panel'de). Sabit alt overlay. */
function SpectatorBar({ canSit, onTakeSeat }: { canSit: boolean; onTakeSeat: () => void }) {
  const { t } = useI18n()
  return <div className="qt-spectator-bar" role="status">
    <span><Icon name="eye" /> {t('spectator.watching')}</span>
    <button type="button" className="qt-button qt-button--primary" disabled={!canSit} onClick={onTakeSeat}>
      {canSit ? <><Icon name="people" /> {t('spectator.play')}</> : t('spectator.full')}
    </button>
  </div>
}

/**
 * Soldaki masa listesi. Reveal'de puan çipini de bu liste taşır: eskiden alttaki
 * nabız rafındaydı, o raf oyuncuları ikinci kez gösterdiği için kaldırıldı —
 * ama puanın sayarak akması (madde 4) rafın değil, oyuncunun yanına aitti.
 */
function RoomStrip({ state, beats, speakingIds }: { state: GameState; beats: RevealBeats; speakingIds?: ReadonlySet<string> }) {
  const { t, language } = useI18n()
  // Taç: state.players zaten skora göre azalan sıralı; birinci puanı 0'dan büyükse
  // liderdir. Puan değişince liste yeniden sıralanır -> taç otomatik lidere geçer.
  const leaderId = (state.players[0]?.score ?? 0) > 0 ? state.players[0].id : null
  const isTeam = state.gameMode === 'team'
  const [teamA, teamB] = state.teamScores
  return <aside className="qt-table-strip" aria-label={t('game.tablePlayers')}>
    {isTeam
      ? <div className="qt-strip-teams">
          <span className="qt-strip-team is-team0"><b>{t('team.a')}</b><em>{formatNumber(language, teamA)}</em></span>
          <span className="qt-strip-team is-team1"><b>{t('team.b')}</b><em>{formatNumber(language, teamB)}</em></span>
        </div>
      : <div className="qt-strip-title"><span>{t('game.table')}</span><b>{state.players.length} / 8</b></div>}
    <div className="qt-player-stack">
      {state.players.slice(0, 8).map((player) => <div className={`qt-player-card ${playerColorClass(player, state.gameMode)} ${player.id === state.youId ? 'is-you' : ''} ${player.answered ? 'is-locked' : ''} ${(state.phase === 'question' || state.phase === 'bet') && !player.answered && !player.waiting && player.connected ? 'is-awaiting' : ''} ${player.id === state.firstAnswerId ? 'is-first' : ''} ${player.id === leaderId ? 'is-leader' : ''} ${speakingIds?.has(player.id) ? 'is-speaking' : ''}`} key={player.id}>
        <span className="qt-avatar-slot">
          {player.id === leaderId && <span className="qt-strip-crown" aria-hidden="true" title={t('game.leader')}><Icon name="crown" /></span>}
          <Avatar player={player} compact mode={state.gameMode} />
          {player.streak >= 3 && <span className="qt-streak-flame" aria-hidden="true" title={t('game.streak', { count: player.streak })}><FlameIcon /></span>}
        </span>
        <div><b title={player.name}>{player.name}</b>{player.progress && <LeagueBadge badge={player.progress} />}<small>{player.waiting ? t('game.nextRound') : player.answered ? t('game.locked') : beats.active ? t('game.missed') : player.connected ? t('game.thinking') : t('game.connecting')}</small></div>
        <b className="qt-player-score">{formatNumber(language, player.score)}</b>
        {player.answered && !beats.gains && <Icon name="check" />}
      </div>)}
    </div>
  </aside>
}

/* GainChip kaldırıldı (denetim: reveal sadeleştirme): puan artışı yalnız sağ büyük
   kutuda (.qt-your-gain) gösterilir; skor şeridi yalnız güncel TOPLAM skoru taşır. */

/** Reveal sahnesinin ritmi. Sunucunun deadline'ından türer, yerel zamanlayıcıdan değil:
 *  maç ortasında bağlanan istemci koreografiyi baştan oynatmaz, kaldığı yerden görür. */
interface RevealBeats { active: boolean; cards: boolean; voters: boolean; gains: boolean; progress: number; remainingMs: number; elapsedMs: number }
const BEAT_CARDS_MS = 200
const BEAT_VOTERS_MS = 250
const BEAT_GAINS_MS = 650

function useRevealBeats(state: GameState): RevealBeats {
  const payload = state.reveal ?? state.circleReveal
  const now = useServerNow(state.serverNow, 60)
  if (state.phase !== 'reveal' || !payload) return { active: false, cards: false, voters: false, gains: false, progress: 1, remainingMs: 0, elapsedMs: 0 }
  const remainingMs = Math.max(0, payload.until - now)
  const elapsedMs = payload.durationMs - remainingMs
  return {
    active: true,
    cards: elapsedMs >= BEAT_CARDS_MS,
    voters: elapsedMs >= BEAT_VOTERS_MS,
    gains: elapsedMs >= BEAT_GAINS_MS,
    progress: Math.max(0, Math.min(1, remainingMs / payload.durationMs)),
    remainingMs,
    elapsedMs,
  }
}

/**
 * "{letter} ile başlar" / "Starts with {letter}". Harf iki dilde cümlenin farklı
 * yerinde durduğu için metni birleştiremeyiz: şablonu yer tutucudan bölüp
 * vurgulu harfi araya koyarız. Böylece kelime sırası her dilde doğru kalır.
 */
/** Şıkkın altına yerleşen avatar rafı. Mutlak konumlu: akışta yer kaplamaz,
 *  böylece avatarlar belirince kart ne büyür ne de metni sıkıştırır (madde 1/9). */
function VoterDock({ voters, correct, beats }: { voters: PublicPlayer[]; correct: boolean; beats: RevealBeats }) {
  if (!beats.voters || !voters.length) return null
  const overflow = voters.length - 4
  return <span className={`qt-voters ${correct ? 'is-right' : 'is-wrong'}`} aria-hidden="true">
    {voters.slice(0, 4).map((player) => <Avatar key={player.id} player={player} compact />)}
    {overflow > 0 && <small>+{overflow}</small>}
  </span>
}

/** Oyuncu rengi kimliğinden türetilir: aynı oyuncu her masada aynı renkte oturur. */
const SEAT_COLORS = ['gold', 'mint', 'peach', 'lavender', 'sky', 'pink'] as const
function seatColorOf(playerId: string) {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0
  return SEAT_COLORS[hash % SEAT_COLORS.length]
}
/** Takım modunda renk kişiye değil TAKIMA bağlıdır (2 renk) — masaya bakınca
 *  kimin hangi takımda olduğu bir bakışta okunur. Diğer modlarda kişiye özel ton. */
function playerColorClass(player: PublicPlayer, mode?: GameMode) {
  return mode === 'team' ? `is-team${player.team}` : `is-${seatColorOf(player.id)}`
}
// Kategori renk aksanı (4e): sayaç halkası + kart kenarı geçerli sorunun
// kategorisinin tonuna kayar. Ad kararlı bir tona düşer (aynı kategori hep aynı
// renk — seatColorOf ile aynı felsefe). SADECE renk: düzen değişmez, 0px kuralı
// korunur. Paletteki tonlar marka aksanları; tasarım 4e mint/altın/gök gösteriyor.
const CATEGORY_ACCENTS = ['#5ce7ef', '#5ee6c1', '#f3c362', '#85d9ff', '#b3a7f0'] as const
function categoryAccent(name: string | undefined) {
  if (!name) return CATEGORY_ACCENTS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length]
}

/** Üç sütun bu genişliğin altında masanın ALTINA iner (CSS ile aynı eşik). */
const STACK_WIDTH = 1000

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
    if (typeof window === 'undefined') return 520
    const stacked = window.innerWidth <= STACK_WIDTH
    // Kısa-yatay (telefon yatay / alçak pencere): masa ile "senin koltuğun"
    // paneli YAN YANA durur (CSS ile aynı eşik). Eskiden burada da dikey yığın
    // formülü (yüksekliğin yarısı) kullanılıyordu: 844×390'da masa 230px'e
    // çöküyor, koltuklar diskin üstüne biniyordu.
    if (stacked && window.innerHeight <= 560 && window.innerWidth >= 680) {
      const side = Math.min(300, Math.max(230, window.innerWidth * 0.36))
      return Math.max(230, Math.min(460, window.innerWidth - side - 56, window.innerHeight - 28))
    }
    // Üç sütunda orta sütuna kalan yer; altına inince tüm genişlik.
    const widthBudget = stacked ? window.innerWidth - 40 : window.innerWidth - 640
    // Mobil/dikey (stacked): masa üstte; ALTINDA koltuk kartı + CTA ilk ekranda
    // görünmeli → yüksekliğin ~yarısını aşma (kalanı CTA'ya). Masaüstü 3-sütun:
    // neredeyse tüm yükseklik masaya. Kısa-yatay ekranda (390px) eski taban 300
    // taşma yapıyordu (audit) — taban 230'a indi, height budget zaten sınırlıyor.
    const heightBudget = stacked ? Math.round(window.innerHeight * 0.5) : window.innerHeight - 68
    return Math.max(230, Math.min(560, Math.min(widthBudget, heightBudget)))
  }
  const [size, setSize] = useState(measure)
  useEffect(() => {
    const onResize = () => setSize(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
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
function OrbitSeats({ state, radius, onInvite, viewerIsHost, onManage, openManageId, speakingIds }: { state: GameState | null; radius: number; onInvite: () => void; viewerIsHost: boolean; onManage: (player: PublicPlayer, x: number, y: number, trigger: HTMLElement) => void; openManageId: string | null; speakingIds?: ReadonlySet<string> }) {
  const { t } = useI18n()
  // Bir koltuk boş->dolu olduğunda o koltukta kısa bir patlama: dikkat yeni
  // gelen oyuncuya çekilir. İlk mount'ta (sayfa yüklenirken zaten oturanlar
  // için) tetiklenmesin diye mountedOnce bayrağıyla korunuyor.
  const prevOccupants = useRef<Record<number, string>>({})
  const mountedOnce = useRef(false)
  const joinTimers = useRef<Set<number>>(new Set())
  const [justJoined, setJustJoined] = useState<Record<number, number>>({})
  useEffect(() => () => {
    for (const timer of joinTimers.current) window.clearTimeout(timer)
    joinTimers.current.clear()
  }, [])
  useEffect(() => {
    const next: Record<number, string> = {}
    const joined: number[] = []
    for (let seat = 0; seat < 8; seat++) {
      const occupant = state?.players.find((item) => item.seat === seat)
      if (!occupant) continue
      next[seat] = occupant.id
      if (mountedOnce.current && prevOccupants.current[seat] !== occupant.id) joined.push(seat)
    }
    prevOccupants.current = next
    mountedOnce.current = true
    if (!joined.length) return
    setJustJoined((current) => { const updated = { ...current }; joined.forEach((seat) => { updated[seat] = Date.now() }); return updated })
    joined.forEach((seat) => {
      const timer = window.setTimeout(() => {
        joinTimers.current.delete(timer)
        setJustJoined((current) => { const { [seat]: _drop, ...rest } = current; return rest })
      }, 700)
      joinTimers.current.add(timer)
    })
  }, [state?.players])
  return <>{Array.from({ length: 8 }, (_, seat) => {
    const angle = seat * 45
    const player = state?.players.find((item) => item.seat === seat)
    const transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`
    if (!player) {
      return <button key={seat} className="qt-seat qt-seat--empty" style={{ transform }} onClick={onInvite} title={t('table.emptySeat')}>
        <i aria-hidden="true">+</i>
        <span>{t('table.invite')}</span>
      </button>
    }
    const isHost = player.id === state?.hostId
    // Taç zaten "masa sahibi" der; ayrıca rozet yazmak hem tekrar hem yer israfı.
    // Rozet kalkınca hazır durumu SADECE işaretle taşınır — bu yüzden işaret
    // artık masa sahibinde de gösterilir, yoksa onun durumu görünmez olurdu.
    const badge = isHost ? null : player.ready ? t('table.readyBadge') : t('table.preparingBadge')
    // Host araçları (4a): sahip, KENDİSİ olmayan bir koltuğa tık/sağ-tık ile
    // menü açar. Yetki sunucuda; burası yalnızca menüyü konumlandırır.
    const manageable = viewerIsHost && player.id !== state?.youId
    const manage = manageable ? (event: React.MouseEvent<HTMLElement>) => { event.preventDefault(); onManage(player, event.clientX, event.clientY, event.currentTarget) } : undefined
    // Klavye: Enter/Space menüyü koltuğun MERKEZİNDEN açar (mouse koordinatı yok).
    // role="button"+tabIndex tek başına yetmez — native <div> tuşta click üretmez.
    const manageKey = manageable ? (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      onManage(player, rect.left + rect.width / 2, rect.top + rect.height / 2, event.currentTarget as HTMLElement)
    } : undefined
    return <div key={seat} className={`qt-seat qt-seat--filled ${playerColorClass(player, state?.gameMode)} ${isHost ? 'is-host' : ''} ${player.ready ? 'is-ready' : ''} ${player.id === state?.youId ? 'is-you' : ''} ${manageable ? 'is-manageable' : ''} ${justJoined[seat] ? 'is-joining' : ''} ${speakingIds?.has(player.id) ? 'is-speaking' : ''}`} style={{ transform, '--seat-delay': `${seat * 60}ms` } as CSSProperties} onClick={manage} onContextMenu={manage} onKeyDown={manageKey} {...(manageable ? { role: 'button', tabIndex: 0, title: t('host.hint'), 'aria-haspopup': 'menu' as const, 'aria-expanded': player.id === openManageId, 'aria-controls': player.id === openManageId ? `qt-host-menu-${player.id}` : undefined } : {})}>
      <div className="qt-seat__token">
        {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : player.name.slice(0, 1).toUpperCase()}
        {isHost && <svg className="qt-seat__crown" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 3.5 2.5L12 5l4.5 5.5L20 8l-1.6 8H5.6L4 8Z" /></svg>}
        {player.ready
          ? <span className="qt-seat__check" aria-hidden="true"><Icon name="check" /></span>
          : <span className="qt-seat__prep" aria-hidden="true" />}
        {justJoined[seat] && <Burst triggerKey={justJoined[seat]} />}
      </div>
      <div className="qt-seat__label"><b>{player.name}</b>{badge && <small>{badge}</small>}</div>
    </div>
  })}</>
}

/** Masanın imza öğesi: seçilen mod, disk üzerinde kendi fiziksel nesnesine dönüşür. */
function ModeTableScene({ mode }: { mode: GameMode }) {
  const scene = mode === 'circle' ? 'circle' : mode === 'lightning' ? 'lightning' : 'classic'
  return <div className={`qt-mode-scene qt-mode-scene--${scene}`} data-mode={mode} aria-hidden="true">
    {scene === 'classic' && <div className="qt-scene-deck"><i /><i /><i /><b>Q</b></div>}
    {scene === 'lightning' && <div className="qt-scene-clock"><i className="qt-scene-clock__marks" /><i className="qt-scene-clock__hand" /><b><Icon name="bolt" /></b></div>}
    {scene === 'circle' && <div className="qt-scene-letters">{['A', 'B', 'Ç', 'D', 'E', 'F', 'G', 'H'].map((letter, index) => <i key={letter} style={{ '--letter-angle': `${index * 45}deg`, '--letter-counter-angle': `${index * -45}deg` } as CSSProperties}>{letter}</i>)}<b>?</b></div>}
  </div>
}

/**
 * Host araçları menüsü (4a). Tık noktasına yerleşir (context-menu gibi),
 * viewport kenarına sığacak şekilde kırpılır. Dışa tık / Escape kapatır.
 * Bota sahiplik devri anlamsız — transfer yalnızca gerçek oyuncuda.
 */
function HostMenu({ player, x, y, trigger, mode, onTransfer, onKick, onSetTeam, onClose }: { player: PublicPlayer; x: number; y: number; trigger: HTMLElement; mode?: GameMode; onTransfer: (id: string) => void; onKick: (id: string) => void; onSetTeam: (id: string, team: number) => void; onClose: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  // Konumu GERÇEK boyuttan hesapla: sabit tahminle (132px) kısa Discord
  // ekranında menü alttan taşıyordu. Ölçene kadar görünmez, sonra sığdır.
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: x, top: y, ready: false })
  useLayoutEffect(() => {
    if (!ref.current) return
    // offset* KULLAN, getBoundingClientRect DEĞİL: açılış animasyonu menüyü
    // scale(.9) ile ölçüyor; rect küçülmüş boyutu verince clamp yanlış hesaplayıp
    // animasyon bitince menü kenardan taşıyordu. offsetWidth transform'u yok sayar.
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
      ready: true,
    })
  }, [x, y])
  const closeAndRestore = () => {
    onClose()
    window.setTimeout(() => { if (trigger.isConnected) trigger.focus() }, 0)
  }
  useEffect(() => {
    if (!pos.ready) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [pos.ready])
  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAndRestore() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [onClose, trigger])
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (event.key === 'Tab') { event.preventDefault(); closeAndRestore(); return }
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = nextMenuIndex(current, event.key, items.length)
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }
  // Portal ile body'ye: menü sahnenin parçası değil, viewport overlay'i. Böylece
  // lobinin ".qt-lobby > * { position: relative }" kuralına ve .qt-activity'nin
  // overflow:hidden kırpmasına takılmadan gerçekten fixed konumlanır.
  return createPortal(<div id={`qt-host-menu-${player.id}`} ref={ref} className="qt-host-menu" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' } as CSSProperties} role="menu" aria-label={t('host.menuTitle')} onKeyDown={onMenuKeyDown}>
    <div className="qt-host-menu__head"><Avatar player={player} compact mode={mode} /><div><b title={player.name}>{player.name}</b><small>{t('host.menuTitle')}</small></div></div>
    {mode === 'team' && <button className="qt-host-menu__item is-team" role="menuitem" onClick={() => { onSetTeam(player.id, player.team === 1 ? 0 : 1); closeAndRestore() }}><Icon name="people" /> {t('team.swap', { team: player.team === 1 ? t('team.a') : t('team.b') })}</button>}
    {!player.isBot && <button className="qt-host-menu__item is-transfer" role="menuitem" onClick={() => { onTransfer(player.id); closeAndRestore() }}><Icon name="crown" /> {t('host.transfer')}</button>}
    <button className="qt-host-menu__item is-kick" role="menuitem" onClick={() => { onKick(player.id); closeAndRestore() }}><Icon name="exit" /> {t('host.kick')}</button>
  </div>, document.body)
}

/** Ses efektleri aç/kapa. Müzik toggle'ıyla aynı stil; varsayılan AÇIK. */
function SfxToggle() {
  const { t } = useI18n()
  const [on, setOn] = useState(() => sfx.isOn())
  return <button className={`qt-music-toggle ${on ? 'is-on' : ''}`} onClick={() => setOn(sfx.toggle())} title={t('sfx.toggle')} aria-label={t('sfx.toggle')} aria-pressed={on}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
    {!on && <i className="qt-music-toggle__slash" aria-hidden="true" />}
  </button>
}

/** Paket yükleme formu (yalnız host görür): JSON/CSV yapıştır + isteğe bağlı
 *  yönetici belirteci. Sunucu Faz 1.4 kurallarıyla doğrular; hatalar listelenir. */
function PackUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [content, setContent] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PackUploadResult | null>(null)
  const submit = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await uploadPack({ name: name.trim(), content, format, token: token.trim() || undefined })
      setResult(res)
      if (res.ok) {
        setContent('')
        onUploaded()
      }
    } catch {
      setResult({ ok: false, message: t('pack.failed') })
    }
    setBusy(false)
  }
  return <div className="qt-pack-form">
    <input className="qt-pack-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pack.name')} maxLength={60} />
    <div className="qt-count-row">
      {(['json', 'csv'] as const).map((item) => <button key={item} className={`qt-count-chip ${format === item ? 'is-selected' : ''}`} aria-pressed={format === item} onClick={() => setFormat(item)}>{item.toUpperCase()}</button>)}
    </div>
    <textarea className="qt-pack-input" value={content} onChange={(event) => setContent(event.target.value)} rows={4} placeholder={t(format === 'csv' ? 'pack.pasteCsv' : 'pack.pasteJson')} spellCheck={false} />
    <input className="qt-pack-input" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={t('pack.token')} autoComplete="off" />
    <button className="qt-button qt-pack-submit" disabled={busy || !name.trim() || !content.trim()} onClick={() => void submit()}>{t('pack.submit')}</button>
    {result && !result.ok && <div className="qt-pack-feedback is-error">
      {result.message && <span>{result.message}</span>}
      {result.errors?.slice(0, 4).map((error) => <span key={error}>{error}</span>)}
      {(result.errors?.length ?? 0) > 4 && <span>+{(result.errors?.length ?? 0) - 4}</span>}
    </div>}
    {result?.ok && <div className="qt-pack-feedback is-ok">{t('pack.done', { count: result.pack?.count ?? 0 })}{result.warnings?.length ? ` · ${result.warnings.length} ⚠` : ''}</div>}
  </div>
}

function emptyPackQuestion(): PackQuestion {
  return { id: '', category: '', text: '', textEn: '', choices: ['', '', '', ''], choicesEn: ['', '', '', ''], correctIndex: 0, difficulty: 'orta' }
}

/** Uygulama içi paket editörü: JSON/CSV yazmadan soru kartlarıyla paket kurar.
 *  Sahiplik sunucuda doğrulanır — tam içerik (doğru şıklar dahil) yalnızca
 *  paketi oluşturan kişiye döner; burada "Paketlerim" yalnız kendi paketlerini
 *  listeler. EN alanları boş bırakılırsa kaydetme sırasında TR'den kopyalanır. */
function PackEditor({ packs, myId, auth, categories, onSaved }: { packs: QuestionPackMeta[]; myId: string; auth: PackAuth; categories: string[]; onSaved: () => void }) {
  const { t } = useI18n()
  const mine = packs.filter((pack) => pack.createdBy === myId || (!auth.sessionToken && pack.createdBy === 'dev'))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [questions, setQuestions] = useState<PackQuestion[]>([emptyPackQuestion()])
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [result, setResult] = useState<PackUploadResult | null>(null)

  const startNew = () => {
    setEditingId(null); setName('')
    setQuestions([emptyPackQuestion()])
    setResult(null); setConfirmDelete(false)
  }
  const loadPack = async (id: string) => {
    setBusy(true); setResult(null); setConfirmDelete(false)
    const pack = await getPack(id, auth)
    if (!pack) { setResult({ ok: false, message: t('pack.loadFailed') }); setBusy(false); return }
    setEditingId(pack.id)
    setName(pack.name)
    // EN alanı TR ile aynıysa boş göster — "boş = TR kopya" kuralı görünür kalsın.
    setQuestions(pack.questions.map((q) => ({
      ...q,
      choices: [...q.choices],
      textEn: q.textEn === q.text ? '' : q.textEn,
      choicesEn: q.choices.map((c, i) => (q.choicesEn?.[i] && q.choicesEn[i] !== c ? q.choicesEn[i] : '')),
    })))
    setBusy(false)
  }

  const patchQ = (i: number, patch: Partial<PackQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const patchChoice = (i: number, ci: number, value: string, en = false) =>
    setQuestions((qs) => qs.map((q, j) => {
      if (j !== i) return q
      const list = [...(en ? q.choicesEn : q.choices)]
      list[ci] = value
      return en ? { ...q, choicesEn: list } : { ...q, choices: list }
    }))

  const ready = !busy && !!name.trim() && questions.length > 0
    && questions.every((q) => q.text.trim() && q.category.trim() && q.choices.every((c) => c.trim()))
  const save = async () => {
    setBusy(true); setResult(null)
    const normalized = questions.map((q, i) => ({
      ...q,
      id: q.id.trim() || `q-${i + 1}`,
      category: q.category.trim(),
      text: q.text.trim(),
      textEn: q.textEn.trim() || q.text.trim(),
      choices: q.choices.map((c) => c.trim()),
      choicesEn: q.choices.map((c, ci) => q.choicesEn[ci]?.trim() || c.trim()),
    }))
    const res = await savePack({ id: editingId, name: name.trim(), questions: normalized, auth })
    setResult(res)
    if (res.ok) {
      setEditingId(res.pack?.id ?? editingId)
      setQuestions(normalized)
      onSaved()
    }
    setBusy(false)
  }
  const remove = async () => {
    if (!editingId) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setBusy(true)
    const ok = await deletePack(editingId, auth)
    setBusy(false)
    if (ok) { startNew(); setResult({ ok: true, message: t('pack.deleted') }); onSaved() }
    else setResult({ ok: false, message: t('pack.failed') })
  }

  return <div className="qt-pack-form qt-pack-editor">
    {mine.length > 0 && <div className="qt-count-row qt-pack-mine">
      <button className={`qt-count-chip ${editingId === null ? 'is-selected' : ''}`} onClick={startNew}>{t('pack.new')}</button>
      {mine.map((pack) => <button key={pack.id} className={`qt-count-chip ${editingId === pack.id ? 'is-selected' : ''}`} disabled={busy} onClick={() => void loadPack(pack.id)}>{pack.name}<small>{pack.count}</small></button>)}
    </div>}
    <input className="qt-pack-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pack.name')} maxLength={60} />
    <datalist id="qt-pack-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
    {questions.map((q, i) => <div className="qt-pack-qcard" key={i}>
      <div className="qt-pack-qcard__head">
        <b>{t('pack.question', { n: i + 1 })}</b>
        <button className="qt-icon-button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} disabled={questions.length <= 1} aria-label={t('pack.qDelete')} title={t('pack.qDelete')}><Icon name="close" /></button>
      </div>
      <input className="qt-pack-input" value={q.text} onChange={(event) => patchQ(i, { text: event.target.value })} placeholder={t('pack.qText')} maxLength={240} />
      <div className="qt-pack-qcard__row">
        <input className="qt-pack-input" value={q.category} onChange={(event) => patchQ(i, { category: event.target.value })} placeholder={t('pack.qCategory')} list="qt-pack-cats" maxLength={40} />
        <div className="qt-count-row">{(['kolay', 'orta', 'zor'] as const).map((d) => <button key={d} className={`qt-count-chip ${q.difficulty === d ? 'is-selected' : ''}`} aria-pressed={q.difficulty === d} onClick={() => patchQ(i, { difficulty: d })}>{t(d === 'kolay' ? 'difficulty.easy' : d === 'orta' ? 'difficulty.medium' : 'difficulty.hard')}</button>)}</div>
      </div>
      <div className="qt-pack-choices">
        {q.choices.map((choice, ci) => <label key={ci} className={`qt-pack-choice ${q.correctIndex === ci ? 'is-correct' : ''}`}>
          <input type="radio" name={`qt-pack-correct-${i}`} checked={q.correctIndex === ci} onChange={() => patchQ(i, { correctIndex: ci })} aria-label={t('pack.correct')} title={t('pack.correct')} />
          <input className="qt-pack-input" value={choice} onChange={(event) => patchChoice(i, ci, event.target.value)} placeholder={t('pack.choice', { n: ci + 1 })} maxLength={120} />
        </label>)}
      </div>
      <details className="qt-pack-en">
        <summary>{t('pack.enOptional')}</summary>
        <input className="qt-pack-input" value={q.textEn} onChange={(event) => patchQ(i, { textEn: event.target.value })} placeholder={t('pack.qTextEn')} maxLength={240} />
        {q.choicesEn.map((choice, ci) => <input key={ci} className="qt-pack-input" value={choice} onChange={(event) => patchChoice(i, ci, event.target.value, true)} placeholder={t('pack.choice', { n: ci + 1 })} maxLength={120} />)}
      </details>
    </div>)}
    <div className="qt-pack-actions">
      <button className="qt-count-chip" onClick={() => setQuestions((qs) => [...qs, emptyPackQuestion()])}>{t('pack.addQuestion')}</button>
      <button className="qt-button qt-pack-submit" disabled={!ready} onClick={() => void save()}>{t('pack.save')}</button>
      {editingId && <button className={`qt-count-chip ${confirmDelete ? 'is-danger' : ''}`} disabled={busy} onClick={() => void remove()}>{confirmDelete ? t('pack.deleteConfirm') : t('pack.deletePack')}</button>}
    </div>
    {result && !result.ok && <div className="qt-pack-feedback is-error">
      {result.message && <span>{result.message}</span>}
      {result.errors?.slice(0, 4).map((error) => <span key={error}>{error}</span>)}
      {(result.errors?.length ?? 0) > 4 && <span>+{(result.errors?.length ?? 0) - 4}</span>}
    </div>}
    {result?.ok && <div className="qt-pack-feedback is-ok">{result.message ?? t('pack.saved', { count: result.pack?.count ?? 0 })}{result.warnings?.length ? ` · ${result.warnings.length} ⚠` : ''}</div>}
  </div>
}

function ActivityLobby({ state, status, identity, language, onLanguageChange, onReady, onStart, onSetCategories, onSetQuestionCount, onSetDifficulty, onStartDaily, onSetPack, onSetMode, onSetTeam, onKick, onTransferHost, onInvite, onSpectate, onTakeSeat, speakingIds }: { state: GameState | null; status: string; identity: ReturnType<typeof useDiscordActivity>['identity']; speakingIds?: ReadonlySet<string>; language: ActivityLanguage; onLanguageChange: (language: ActivityLanguage) => void; onReady: (ready: boolean) => void; onStart: (mode: GameMode) => void; onStartDaily: () => void; onSetCategories: (categories: string[]) => void; onSetQuestionCount: (count: number) => void; onSetDifficulty: (difficulty: Difficulty | null) => void; onSetPack: (packId: string | null) => void; onSetMode: (mode: GameMode) => void; onSetTeam: (id: string, team: number) => void; onKick: (id: string) => void; onTransferHost: (id: string) => void; onInvite: (message: string) => Promise<boolean>; onSpectate: () => void; onTakeSeat: () => void }) {
  const { t } = useI18n()
  // Mod masa AYARIDIR ve sunucudan okunur: yerel state olsaydı host Fitil'i
  // seçtiğinde diğer oyuncuların merkez diski Klasik göstermeye devam ederdi.
  const mode: GameMode = state?.gameMode === 'quiz' ? 'classic' : (state?.gameMode ?? 'classic')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hostMenu, setHostMenu] = useState<{ player: PublicPlayer; x: number; y: number; trigger: HTMLElement } | null>(null)
  const self = state?.players.find((player) => player.id === state?.youId)
  const isHost = state?.hostId === state?.youId
  const isSpectator = !!state?.youAreSpectator
  const tableFull = (state?.players.length ?? 0) >= 8
  const teamsReady = !!state && bothTeamsPresent(mode, state.players)
  const canStart = !!state && state.hostId === state.youId && state.players.filter((player) => player.connected).length >= state.minPlayers && state.players.filter((player) => player.connected).every((player) => player.ready) && teamsReady
  // canStart false->true'ya döndüğü AN'da Başlat butonunda küçük bir patlama:
  // altın nabzın (is-launch-ready) yanına ek bir noktalama.
  const wasCanStart = useRef(canStart)
  const [startBurst, setStartBurst] = useState(0)
  useEffect(() => {
    if (canStart && !wasCanStart.current) setStartBurst(Date.now())
    wasCanStart.current = canStart
  }, [canStart])
  const selected = MODE_KEYS[modeKeyOf(mode)]
  const compatible = (category: CategoryOption) => mode === 'circle' ? category.circleCount > 0 : category.classicCount > 0
  // Oynanabilir kategoriler + henüz tamamen boş (planlanmış) kategoriler. Boşlar
  // pasif "yakında" gösterilir; soru eklenince otomatik oynanabilir olur.
  const categories = (state?.availableCategories || []).filter((category) => compatible(category) || (category.classicCount === 0 && category.circleCount === 0))
  const selectedCategories = (state?.categorySelection || []).filter((name) => categories.some((category) => category.name === name))
  const categorySummaryLabel = selectedCategories.length ? selectedCategories.map((name) => categoryLabel(language, name)).join(' · ') : t('category.mixed')
  const maxCategories = mode === 'lightning' ? 1 : mode === 'circle' ? 2 : 3
  const orbitSize = useOrbitSize()
  const orbitRadius = Math.round(orbitSize / 2 - 30)
  // Masaüstünde ayarlar paneli hep açık olmalı. CSS-only zorlama (display:grid
  // !important) yetmiyor: <details> kapalıyken Chromium içindeki içeriği kendi
  // kutu boyutuna KATMIYOR (display override'a rağmen) — body görünmez taşma
  // olarak render olup üst kapsayıcının overflow:auto'suyla kırpılıyor. Gerçek
  // `open` özniteliğini imperatif olarak set etmek şart; controlled prop olarak
  // her render'da geçirmek DE olmaz (mobilde kullanıcının tıklamasını her state
  // güncellemesinde geri kapatırdı) — bu yüzden ref + tek seferlik efekt.
  const isDesktopSettings = useMinWidth(1001)
  const settingsPanelRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (isDesktopSettings && settingsPanelRef.current) settingsPanelRef.current.open = true
  }, [isDesktopSettings])
  useEffect(() => {
    if (!state || !isHost || selectedCategories.length === state.categorySelection.length) return
    onSetCategories(selectedCategories)
  }, [isHost, mode, onSetCategories, selectedCategories, state])
  const toggleCategory = (name: string) => {
    if (!isHost) return
    const selectedNow = state?.categorySelection || []
    const next = selectedNow.includes(name)
      ? selectedNow.filter((item) => item !== name)
      : [...selectedNow.filter((item) => categories.some((category) => category.name === item)), name].slice(-maxCategories)
    onSetCategories(next)
  }
  // Soru sayısını modun doğal değerine döndürme işi SUNUCUDA (setGameMode):
  // tek olay, atomik değişim — istemciden çifte emit yarışı yok.
  const readyCount = state?.players.filter((player) => player.ready).length ?? 0
  // Özel soru paketleri (FAZ 4.4): liste HTTP'den; seçim masa ayarı olarak
  // state.pack üzerinden yayınlanır. Yükleme sonrası liste tazelenir.
  const [packs, setPacks] = useState<QuestionPackMeta[]>([])
  useEffect(() => {
    let alive = true
    void listPacks().then((list) => { if (alive) setPacks(list) })
    return () => { alive = false }
  }, [])

  return <main className="qt-activity qt-lobby">
    <TableBackdrop />
    {/* Marka şeridi yok: Discord uygulamanın adını zaten kendi arayüzünde
        gösteriyor, içeride tekrarı alçak iframe'de masadan yer çalıyordu.
        İşlevsel olanlar (müzik, dil) köşede yüzer; bağlantı rozeti yalnızca
        Discord DIŞINDA anlamlı — orada mock modda olduğunu bilmek gerekir. */}
    <div className="qt-lobby-controls">
      {!identity.isDiscord && <div className={`qt-connection is-${status}`}><i />{t('conn.local')}</div>}
      <SfxToggle />
      <MusicToggle />
      <LanguagePicker language={language} onChange={onLanguageChange} />
    </div>

    <section className="qt-table-shell">
      {/* Sol: masa ayarları — yalnızca masa sahibi değiştirir, diğerleri salt-okunur görür */}
      <aside className="qt-settings" aria-label={t('table.settings')}>
        <details className="qt-settings-panel" ref={settingsPanelRef}>
        <summary className="qt-settings__head"><i aria-hidden="true"><Icon name="spark" /></i><div><span>{t('table.settings')}</span><b>{t(MODE_KEYS[modeKeyOf(mode)].name)} · {categorySummaryLabel}</b></div><span className="qt-settings__chevron" aria-hidden="true"><Icon name="chevron" /></span></summary>
        <div className="qt-settings__body">

        <div className="qt-settings__group"><span>{t('table.mode')}</span>
          {/* Klasik + Çember hep açık (en sık kullanılanlar); geri kalan üç mod
              (Fitil/Çifte Bahis/Takım) ModePicker'ın açılır panelinde — 5 kartı
              hep göstermek satır taşırıyor + gözü dağıtıyordu. */}
          <div className="qt-mode-list">
            {(['classic', 'circle'] as const).map((item) => <button className={`qt-mode-card qt-mode-card--${item} ${mode === item ? 'is-selected' : ''}`} key={item} disabled={!isHost} aria-pressed={mode === item} title={t(MODE_KEYS[item].meta)} onClick={() => onSetMode(item)}>
              <i className="qt-mode-card__tile" aria-hidden="true"><Icon name={MODE_KEYS[item].icon} /></i>
              <b>{t(MODE_KEYS[item].name)}</b>
            </button>)}
            <ModePicker mode={mode} isHost={isHost} onSetMode={onSetMode} />
          </div>
        </div>

        {mode !== 'circle' && <div className="qt-settings__group"><span>{t('table.questionCount')}</span>
          <div className="qt-count-row">{QUESTION_COUNTS.map((count) => <button key={count} className={`qt-count-chip ${state?.questionCount === count ? 'is-selected' : ''}`} disabled={!isHost} aria-pressed={state?.questionCount === count} onClick={() => onSetQuestionCount(count)}>{count}</button>)}</div>
        </div>}

        {/* Zorluk: mod'dan bağımsız, tüm modlara uygulanır. Karışık = tüm zorluklar. */}
        <div className="qt-settings__group"><span>{t('table.difficulty')}</span>
          <div className="qt-count-row qt-difficulty-row">{([null, 'kolay', 'orta', 'zor'] as const).map((d) => {
            const selected = (state?.difficulty ?? null) === d
            const label = d === null ? 'difficulty.mixed' : d === 'kolay' ? 'difficulty.easy' : d === 'orta' ? 'difficulty.medium' : 'difficulty.hard'
            return <button key={d ?? 'mixed'} className={`qt-count-chip ${selected ? 'is-selected' : ''}`} disabled={!isHost} aria-pressed={selected} onClick={() => onSetDifficulty(d)}>{t(label)}</button>
          })}</div>
        </div>

        <div className="qt-settings__group"><span>{t('category.label')}</span>
          <CategoryPicker
            categories={categories}
            selection={state?.categorySelection ?? []}
            disabled={!isHost}
            hint={mode === 'circle' ? t('category.limit.two') : mode === 'lightning' ? t('category.limit.one') : t('category.limit.three')}
            mode={mode}
            onMixed={() => onSetCategories([])}
            onToggle={toggleCategory}
          />
          <small className="qt-settings__note">{mode === 'circle' ? t('category.limit.two') : mode === 'lightning' ? t('category.limit.one') : t('category.limit.three')} · {t('table.timeFixed')}</small>
        </div>

        {/* Özel soru paketi (FAZ 4.4): Çember kendi prompt havuzunu kullandığı
            için grup yalnız soru modlarında gösterilir. Seçim masa ayarıdır. */}
        {mode !== 'circle' && <div className="qt-settings__group"><span>{t('pack.label')}</span>
          <div className="qt-count-row qt-pack-row">
            <button className={`qt-count-chip ${!state?.pack ? 'is-selected' : ''}`} disabled={!isHost} aria-pressed={!state?.pack} onClick={() => onSetPack(null)}>{t('pack.default')}</button>
            {packs.map((pack) => <button key={pack.id} className={`qt-count-chip qt-pack-chip ${state?.pack?.id === pack.id ? 'is-selected' : ''}`} disabled={!isHost} aria-pressed={state?.pack?.id === pack.id} title={t('pack.count', { count: pack.count })} onClick={() => onSetPack(pack.id)}>{pack.name}<small>{pack.count}</small></button>)}
            {state?.pack && !packs.some((pack) => pack.id === state.pack?.id) && <span className="qt-count-chip is-selected qt-pack-chip">{state.pack.name}</span>}
          </div>
          {isHost && <details className="qt-pack-upload">
            <summary>{t('pack.editor')}</summary>
            <PackEditor
              packs={packs}
              myId={identity.user?.id ?? `dev:${getDevIdentity().id}`}
              auth={{ sessionToken: identity.sessionToken ?? null, devId: identity.isDiscord ? null : getDevIdentity().id }}
              categories={(state?.availableCategories ?? []).map((c) => c.name)}
              onSaved={() => void listPacks().then(setPacks)}
            />
          </details>}
          {isHost && <details className="qt-pack-upload">
            <summary>{t('pack.upload')}</summary>
            <PackUploadForm onUploaded={() => void listPacks().then(setPacks)} />
          </details>}
        </div>}
        </div>
        </details>
      </aside>

      {/* Orta: masa. Tasarımın kuralı — masa ortada kalır, ofsetle kaydırılmaz. */}
      {/* is-compact: küçük masada koltuk jetonları ve disk orantılı küçülür —
          sabit 58px jetonlar 230-400px'lik yörüngede diske biniyordu. */}
      <div className={`qt-orbit ${orbitSize < 400 ? 'is-compact' : ''}`} style={{ '--orbit-size': `${orbitSize}px` } as CSSProperties} aria-label={t('table.seats')}>
        <div className="qt-orbit__shadow" aria-hidden="true" />
        <div className="qt-orbit__ring" aria-hidden="true" />
        <div className="qt-orbit__ring-inner" aria-hidden="true" />
        {/* Disk boş: yalnızca galaksi. Mod ve meta zaten "MASA AYARLARI"
            panelinde yazıyordu (fazlalık); hazır sayısı ise başlat butonunun
            altına taşındı — orada bir işe yarıyor, butonun neden pasif
            olduğunu söylüyor. */}
        <div className="qt-orbit__disc">
          <GalaxyLoop />
          <ModeTableScene mode={mode} />
        </div>
        <OrbitSeats state={state} radius={orbitRadius} onInvite={async () => { if (!(await onInvite(t('invite.shareText')))) setPickerOpen(true) }} viewerIsHost={isHost} onManage={(player, x, y, trigger) => setHostMenu({ player, x, y, trigger })} openManageId={hostMenu?.player.id ?? null} speakingIds={speakingIds} />
      </div>

      {/* Sağ: senin koltuğun — kendi kontrolün */}
      <aside className="qt-you-panel" aria-label={t('table.yourSeat')}>
        <TableLogo />
        <div className="qt-you-panel__head"><span>{t('table.yourSeat')}</span></div>
        {/* İzleyiciyken koltuğun yok: kart "izliyorsun" der, buton "Oyna" (boş
            koltuğa oturt). Oyuncuyken normal hazır/başlat + "İzleyici ol". */}
        <div className="qt-you-card">{isSpectator
          ? <><i className="qt-you-card__eye" aria-hidden="true"><Icon name="eye" /></i><div><b>{t('spectator.watching')}</b><small>{t('spectator.count', { count: state?.spectatorCount ?? 1 })}</small></div></>
          : self ? <><Avatar player={self} /><div><b>{self.name}</b><small>{isHost ? t('lobby.host') : self.ready ? t('lobby.ready') : t('lobby.preparing')}</small></div></> : <div className="qt-loading-line">{t('lobby.joining')}</div>}</div>
        {/* Kalıcı ilerleme: seviye/lig çubuğu + sezon lider tablosu —
            sunucu progress deposu bağlıysa dolu gelir, değilse hiç çizilmez. */}
        {state?.progress && <XpStrip snapshot={state.progress} />}
        {isSpectator
          ? <div className="qt-you-cta"><button className="qt-button qt-button--primary" disabled={tableFull} onClick={onTakeSeat}><Icon name="people" /> {tableFull ? t('spectator.full') : t('spectator.play')}</button></div>
          : <>
            <div className="qt-you-cta">
            <button className={`qt-button ${self?.ready ? 'is-ready' : 'qt-button--primary'}`} disabled={!self} onClick={() => onReady(!self?.ready)}>{self?.ready ? <><Icon name="check" /> {t('lobby.readyState')}</> : t('lobby.readyButton')}</button>
            {/* Başlat: "Hazırım"ın altında. Sahip değilsen gösterilmez. */}
            {isHost && <>
              <button className={`qt-button qt-button--gold qt-start-table ${canStart ? 'is-launch-ready' : ''}`} disabled={!canStart} onClick={() => onStart(mode)}>{t('table.start')}{canStart && <Burst triggerKey={startBurst} />}</button>
              <button className="qt-button qt-daily-start" disabled={!canStart} title={t('daily.meta')} onClick={onStartDaily}><Icon name="calendar" /> {t('daily.start')}</button>
              {!canStart && <small className="qt-orbit__ready"><i aria-hidden="true" />{mode === 'team' && !teamsReady ? t('team.needBoth') : t('table.readyCount', { ready: readyCount, total: state?.players.length ?? 0 })}</small>}
            </>}
            </div>
            {/* Oyuncu koltuğu bırakıp izleyebilir; izleyici sayısı da burada. */}
            {self && <button className="qt-button qt-btn-home qt-spectate-btn" onClick={onSpectate}>{t('spectator.become')}</button>}
            {(state?.spectatorCount ?? 0) > 0 && <small className="qt-spectator-count"><Icon name="eye" /> {t('spectator.count', { count: state!.spectatorCount })}</small>}
          </>}
        {state?.seasonBoard && <SeasonStrip state={state} />}
        <div className="qt-howto"><span>{t('table.howTo')}</span><p>{t('table.howToBody')}</p></div>
      </aside>
    </section>
    {pickerOpen && <div className="qt-invite-hint" role="status" onClick={() => setPickerOpen(false)}>{identity.isDiscord ? t('invite.failed') : `${t('table.invite')}: ${state?.roomId}`}</div>}
    {/* Menü yalnızca sen host isen VE hedef hâlâ masadaysa. Sahiplik devredince
        isHost düşer, at'ınca hedef listeden çıkar — ikisi de menüyü kapatır. */}
    {hostMenu && isHost && state?.players.some((player) => player.id === hostMenu.player.id) &&
      <HostMenu player={state.players.find((player) => player.id === hostMenu.player.id)!} x={hostMenu.x} y={hostMenu.y} trigger={hostMenu.trigger} mode={mode} onTransfer={onTransferHost} onKick={onKick} onSetTeam={onSetTeam} onClose={() => setHostMenu(null)} />}
  </main>
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
const FINAL_INTRO_MS = 1500
function FinalIntro({ deadline, durationMs, serverNow }: { deadline?: number; durationMs?: number; serverNow?: number }) {
  const { t } = useI18n()
  const now = useServerNow(serverNow, 100)
  if (!deadline || !durationMs) return null
  const elapsed = now - (deadline - durationMs)
  if (elapsed < 0 || elapsed >= FINAL_INTRO_MS) return null
  const opacity = elapsed < 450 ? 1 : Math.max(0, 1 - (elapsed - 450) / (FINAL_INTRO_MS - 450))
  return <div className="qt-final-intro" style={{ opacity }} aria-hidden="true">
    <span className="qt-final-intro__kicker">{t('final.kicker')}</span>
    <h1 className="qt-final-intro__title">{t('final.title')}</h1>
    <p className="qt-final-intro__sub">{t('final.subtitle')}</p>
  </div>
}

/**
 * "Herkes doğru bildi" anı (6b): reveal'de HERKES doğru bildiğinde koltuk
 * avatarları masayı saran mint çembere dizilir + "Herkes bildi.". Ayrı bir
 * overlay (mutlak) — şık kartlarını KIMILDATMAZ (0px). "Herkes doğru" istemcide
 * türetilir: picks[doğru].length === eligibleCount (sunucu değişmedi). Bonus
 * sayısı YOK: gerçek puan mekaniği olmayan "+6" uydurma olurdu. Segmentlerin
 * birleşme animasyonu Adım 5 Motion'a bırakıldı.
 */
function GameBoard({ state, onAnswer, onCircleAnswer, onLeave, onSpectate, onReport, speakingIds }: { state: GameState; onAnswer: (choice: number) => void; onCircleAnswer: (value: string) => void; onLeave: () => void; onSpectate: () => void; onReport: () => void; speakingIds?: ReadonlySet<string> }) {
  const youAreSpectator = state.youAreSpectator
  const self = state.players.find((player) => player.id === state.youId)
  const waiting = !!self?.waiting
  const { t, language } = useI18n()
  const isCircle = state.gameMode === 'circle'
  const question = state.question
  const circle = state.circle
  const beats = useRevealBeats(state)
  const [circleAnswer, setCircleAnswer] = useState('')
  const circleInputRef = useRef<HTMLInputElement>(null)
  // Her yeni çember turunda kutuyu temizle. Bağımlılık `circle?.deadline`: her tur
  // değişir. (Eski `question?.deadline` çember modunda hep undefined'dı — ölü bağımlılık;
  // `circle?.letter` de ardışık turlar aynı harfi taşıyınca tetiklenmiyordu.)
  useEffect(() => setCircleAnswer(''), [circle?.deadline])

  // Reveal'da soru/şık metinleri payload'dan düşer; son turu ekranda tutmak için saklarız.
  const lastRound = useRef<{ category: string; text: string; choices: string[]; textEn: string; choicesEn: string[]; deadline: number; durationMs: number; image?: string } | null>(null)
  if (question) lastRound.current = question
  const shown = question ?? lastRound.current
  const lastCircle = useRef<CirclePayload | null>(null)
  if (circle) lastCircle.current = circle
  const shownCircle = circle ?? lastCircle.current
  useEffect(() => { if (state.phase !== 'reveal' && state.phase !== 'question') { lastRound.current = null; lastCircle.current = null } }, [state.phase])

  // "Bu soru hatalı": buton reveal'da görünür; her turda yalnız bir kez
  // tıklanabilir (sunucu tarafı da oyuncu+soru başına tek rapor tutar).
  const [reported, setReported] = useState(false)
  useEffect(() => setReported(false), [state.round.index])

  const correctIndex = state.reveal?.correctIndex
  const selected = state.yourChoice
  const locked = questionIsLocked({ selected, revealing: beats.active, spectator: youAreSpectator, waiting })
  const circleLocked = circleAnswerIsLocked({ answered: state.yourCircleAnswer !== null, revealing: beats.active, spectator: youAreSpectator, waiting })
  useEffect(() => {
    if (!circleInputShouldFocus({ hasPrompt: !!circle, locked: circleLocked })) return
    const frame = window.requestAnimationFrame(() => circleInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [circle?.deadline, circleLocked])
  // Hic cevap vermeden reveal'a girdiysen sahne hafifce sallanir — tek sikkin
  // is-wrong sarsintisindan ayri, "hic secmedin" icin daha dramatik bir isaret.
  const youMissed = beats.cards && !isCircle && selected === null && !youAreSpectator
  // Cevap dağılımı (5a): kaç kişi hangi şıkkı seçti. picks[index] = o şıkkı
  // seçenlerin id listesi. Yüzde tabanı = cevap verenlerin toplamı ("%60 B dedi").
  const totalPicks = (state.reveal?.picks ?? []).reduce((sum, ids) => sum + ids.length, 0)
  const deadline = isCircle ? shownCircle?.deadline : shown?.deadline
  const durationMs = isCircle ? shownCircle?.durationMs : shown?.durationMs
  const accent = categoryAccent(isCircle ? shownCircle?.category : shown?.category)
  const playerById = (id: string) => state.players.find((item) => item.id === id)

  // SFX tetikleri (Web Audio, dosyasız). Her olay BİR kez: geçişleri ref ile
  // yakala. Saat zaten var; tik için ayrı bir okuma (250ms yeter).
  const sfxNow = useServerNow(state.serverNow, 250)
  const secLeft = deadline ? Math.max(0, Math.ceil((deadline - sfxNow) / 1000)) : 99
  const sfxRef = useRef({ revealed: false, gained: false, tick: -1 })
  useEffect(() => {
    const s = sfxRef.current
    if (beats.active) {
      if (!s.revealed) { s.revealed = true; sfx.play('reveal') }
      if (beats.gains && !s.gained) {
        s.gained = true
        const answered = isCircle ? state.yourCircleAnswer !== null : state.yourChoice !== null
        if (answered) sfx.play(((state.reveal?.gains ?? state.circleReveal?.gains)?.[state.youId] ?? 0) > 0 ? 'correct' : 'wrong')
      }
    } else {
      s.revealed = false
      s.gained = false
      // Son 3sn'de tik'in üstüne giderek ağırlaşan kalp atışı katmanlanır — saat
      // yalnız görünmez, hissedilir de.
      if (secLeft >= 1 && secLeft <= 3 && s.tick !== secLeft) { s.tick = secLeft; sfx.play('tick'); sfx.play(secLeft === 1 ? 'heart3' : secLeft === 2 ? 'heart2' : 'heart') }
      if (secLeft > 3) s.tick = -1
    }
  }, [beats.active, beats.gains, secLeft, isCircle, state.reveal, state.circleReveal, state.yourChoice, state.yourCircleAnswer, state.youId])

  // Klavye kısayolu: A/B/C/D veya 1/2/3/4 tıklamayla aynı işi yapar (kilitler).
  // Çember modunda serbest metin girişi var, kısayol orada devre dışı. Bir form
  // alanına yazarken ya da masadan-ayrıl onay kutusu açıkken de sessizce yutar.
  useEffect(() => {
    if (isCircle || locked) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (document.querySelector('[role="dialog"]')) return
      const index = shortcutIndex(event.key, 4)
      if (index === null) return
      sfx.play('lock')
      onAnswer(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCircle, locked, onAnswer])

  // Sahne görseli geri geldi: elipsi bunlarda sanıp kaldırmıştım, meğer
  // .qt-timer::after ekrana kaçıyormuş — görsellerin suçu yokmuş.
  return <main className={`qt-activity qt-game qt-game--${state.gameMode} ${beats.active ? 'is-revealing' : ''}`} style={{ '--game-art': `url('/assets/discord-activity/${isCircle ? 'activity-circle-table.webp' : 'activity-classic-stage.webp'}')`, '--cat-accent': accent } as CSSProperties}>
    <div className="qt-game-background" />
    {/* Son soru sinematiği (5b): yalnız son turda, soru fazında; yıldırım hariç
        (o mod hıza dayanır, 1.5sn'lik vurgu orada orantısız). */}
    {state.round.index === state.round.total - 1 && !beats.active && state.gameMode !== 'lightning' && <FinalIntro deadline={deadline} durationMs={durationMs} serverNow={state.serverNow} />}
    <div className="qt-game-head">
      <header className="qt-game-top">
        <div><b>{t(MODE_KEYS[modeKeyOf(state.gameMode)].tag)}</b><span>{t(isCircle ? 'game.roundOf' : 'game.questionOf', { index: state.round.index + 1, total: state.round.total })}</span></div>
        <RoundProgress index={state.round.index} total={state.round.total} />
        <span className="qt-game-summary"><span className="qt-game-summary__full">{beats.active ? t('game.revealed') : t('game.lockedCount', { answered: state.answeredCount, total: state.eligibleCount })}</span><span className="qt-game-summary__short" aria-hidden="true">{beats.active ? <Icon name="check" /> : <><Icon name="lock" />{state.answeredCount}/{state.eligibleCount}</>}</span></span>
      </header>
      <div className="qt-game-controls">
        {!youAreSpectator && <button type="button" className="qt-game-exit qt-game-spectate" onClick={onSpectate} title={t('spectator.become')}>{t('spectator.become')}</button>}
        <GameLeaveButton onLeave={onLeave} />
      </div>
    </div>
    <div className="qt-game-grid"><RoomStrip state={state} beats={beats} speakingIds={speakingIds} /><section className={`qt-question-stage ${youMissed ? 'qt-stage-shake' : ''}`}>
      {isCircle && shownCircle ? <>
        <div className="qt-question-head qt-question-head--circle"><span className="qt-category">{categoryLabel(language, shownCircle.category)}</span><span className="qt-circle-letter" aria-hidden="true" key={shownCircle.deadline}>{shownCircle.letter}</span><p>{shownCircle.clue}</p></div>
        <div className="qt-circle-entry">
          <input ref={circleInputRef} value={beats.active ? (state.circleReveal?.answer ?? '') : circleAnswer} disabled={circleLocked} maxLength={48} onChange={(event) => setCircleAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && circleAnswer.trim() && !circleLocked) { event.preventDefault(); sfx.play('lock'); onCircleAnswer(circleAnswer) } }} placeholder={t('circle.placeholder')} aria-label={t('circle.placeholder')} className={beats.active ? 'is-correct' : ''} />
          <button className="qt-button qt-button--primary" disabled={!circleAnswer.trim() || circleLocked} onClick={() => { sfx.play('lock'); onCircleAnswer(circleAnswer) }}><Icon name="lock" /> {t('circle.lock')}</button>
        </div>
        <p className="qt-locked-note" data-empty={!state.yourCircleAnswer && !beats.active && !waiting}>{beats.active ? <><span className="qt-check-draw"><Icon name="check" /></span> {t('circle.correctAnswer')} <b>{state.circleReveal?.answer}</b></> : waiting ? t('game.waitingNextRound') : state.yourCircleAnswer ? <><Icon name="check" /> {t('circle.answerLocked')}</> : null}</p>
      </> : shown ? <>
        <div className="qt-question-head" key={shown.text}><span className="qt-category">{categoryLabel(language, shown.category)}</span>{shown.image && <img className="qt-question-image" src={`/questions/${shown.image}`} alt="" />}<h1>{language === 'en' ? shown.textEn : shown.text}</h1></div>
        <div className="qt-answers">
          {(language === 'en' ? shown.choicesEn : shown.choices).map((choice, index) => {
            const isCorrect = beats.cards && index === correctIndex
            const isWrong = beats.cards && selected === index && index !== correctIndex
            const isDimmed = beats.cards && !isCorrect
            const picks = state.reveal?.picks[index] ?? []
            const voters = picks.map(playerById).filter((item): item is PublicPlayer => !!item)
            const pct = totalPicks ? Math.round((picks.length / totalPicks) * 100) : 0
            // Dağılım yalnız puan beat'inde (650ms) belirir; mutlak+transform, kartı
            // KIMILDATMAZ (0px kuralı). Çubuk kartın alt kenarında scaleX ile açılır.
            const showDist = beats.gains && totalPicks > 0
            // Kimsenin seçmediği yanlış şıkta "%0" rozeti bilgi değil gürültü.
            const showPct = showDist && (picks.length > 0 || index === correctIndex)
            return <button
              className={`qt-answer ${selected === index ? 'is-selected' : ''} ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
              disabled={locked}
              aria-pressed={selected === index}
              data-answer-state={isCorrect ? 'correct' : isWrong ? 'wrong' : selected === index ? 'locked' : 'idle'}
              onClick={() => { sfx.play('lock'); onAnswer(index) }}
              style={{ '--i': index } as CSSProperties}
              key={choice}
            >
              <b>{'ABCD'[index]}</b>
              <span className="qt-answer__text">{choice}</span>
              {showDist && <i className={`qt-answer__dist ${index === correctIndex ? 'is-right' : ''}`} style={{ '--pct': pct / 100 } as CSSProperties} aria-hidden="true" />}
              {/* Reveal'de doğru ✓ / (kendi) yanlış ✗ rozeti renkten bağımsız
                  işaretlenir (renk-körlüğü erişilebilirliği). Slot sabit 24px:
                  ikon gelince kart kımıldamaz. */}
              <i className="qt-answer__mark" aria-hidden="true">{beats.cards && isCorrect ? <span className="qt-verdict-pop is-right"><Icon name="check" /></span> : beats.cards && isWrong ? <span className="qt-verdict-pop is-wrong"><Icon name="close" /></span> : !beats.cards && selected === index && !beats.active ? <span className="qt-lock-pop" key="lock"><Icon name="check" /></span> : null}</i>
              {/* Yüzde + oy veren avatarlar TEK rozet olarak kartın alt kenarına
                  oturur (mutlak, 0px). Eskiden yüzde sağ-üstte ✓/✗ rozetinin,
                  avatarlar alt kenarda bir alttaki kartın üstüne biniyordu. */}
              {(showPct || (beats.voters && voters.length > 0)) && <span className={`qt-answer__tally ${index === correctIndex ? 'is-right' : ''}`}>
                {showPct && <b className="qt-answer__pct">{formatPercent(language, pct)}</b>}
                <VoterDock voters={voters} correct={index === correctIndex} beats={beats} />
              </span>}
            </button>
          })}
        </div>
        <p className="qt-locked-note" data-empty={selected === null && !beats.active && !waiting}>{beats.active ? null : waiting ? t(state.gameMode === 'bet' ? 'bet.waitingNextMatch' : 'game.waitingNextRound') : selected !== null ? <><Icon name="check" /> {t('game.answerLocked')}</> : null}</p>
      </> : null}
      {beats.active && !isCircle
        ? <button type="button" className="qt-report-flag" title={t('report.flag')} aria-label={t('report.flag')} disabled={reported} onClick={() => { onReport(); setReported(true) }}><Icon name="flag" /></button>
        : null}
    </section><aside className="qt-game-side">
      {/* Reveal'de donmuş bir sayaç bilgi taşımaz; yerini turun asıl sonucu alır. */}
      {beats.active
        ? <YourGain state={state} beats={beats} />
        : <Timer deadline={deadline} durationMs={durationMs} serverNow={state.serverNow} frozen={false} />}
      <RevealProgress beats={beats} />
    </aside></div>
  </main>
}

/**
 * Çifte Bahis — bahis fazı. Soru açılmadan önce yalnız KATEGORİ görünür (soru
 * metni/şıkları sunucudan gelmez); oyuncu bankrolünden bir oran yatırır
 * (Pas / ¼ / ½ / Hepsi). Kilitleyince sunucu bağlı herkesi bekler ya da süre
 * dolar, sonra soru açılır. Kabuk GameBoard ile aynı (art + header + RoomStrip)
 * — faz değişse de masa yerinde kalır (0px).
 */
function BetBoard({ state, onBet, onLeave, onSpectate, speakingIds }: { state: GameState; onBet: (amount: number) => void; onLeave: () => void; onSpectate: () => void; speakingIds?: ReadonlySet<string> }) {
  const { t, language } = useI18n()
  const beats = useRevealBeats(state)
  const youAreSpectator = state.youAreSpectator
  const self = state.players.find((player) => player.id === state.youId)
  const bankroll = state.bet?.bankroll ?? 0
  const locked = state.yourBet !== null
  const waiting = !!self?.waiting
  const accent = categoryAccent(state.bet?.category)
  const optionSpecs = useMemo(() => betOptionSpecs(bankroll), [bankroll])
  const options = optionSpecs.map((option) => ({ ...option, label: t(`bet.${option.key}` as StringKey) }))
  const canBet = !locked && !youAreSpectator && !waiting && state.phase === 'bet'
  useEffect(() => {
    if (!canBet) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (document.querySelector('[role="dialog"]')) return
      const index = shortcutIndex(event.key, optionSpecs.length)
      if (index === null) return
      event.preventDefault()
      sfx.play('lock')
      onBet(optionSpecs[index].amount)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canBet, onBet, optionSpecs])
  return <main className="qt-activity qt-game qt-game--bet" style={{ '--game-art': `url('/assets/discord-activity/activity-classic-stage.webp')`, '--cat-accent': accent } as CSSProperties}>
    <div className="qt-game-background" />
    <div className="qt-game-head">
      <header className="qt-game-top">
        <div><b>{t(MODE_KEYS.bet.tag)}</b><span>{t('game.questionOf', { index: state.round.index + 1, total: state.round.total })}</span></div>
        <RoundProgress index={state.round.index} total={state.round.total} />
        <span className="qt-game-summary"><span className="qt-game-summary__full">{t('bet.lockedCount', { locked: state.answeredCount, total: state.eligibleCount })}</span><span className="qt-game-summary__short" aria-hidden="true"><Icon name="lock" />{state.answeredCount}/{state.eligibleCount}</span></span>
      </header>
      <div className="qt-game-controls">
        {!youAreSpectator && <button type="button" className="qt-game-exit qt-game-spectate" onClick={onSpectate} title={t('spectator.become')}>{t('spectator.become')}</button>}
        <GameLeaveButton onLeave={onLeave} />
      </div>
    </div>
    <div className="qt-game-grid"><RoomStrip state={state} beats={beats} speakingIds={speakingIds} /><section className="qt-question-stage qt-bet-stage">
      <div className="qt-question-head"><span className="qt-category">{state.bet?.category ? categoryLabel(language, state.bet.category) : ''}</span><h1>{t('bet.heading')}</h1><p>{t('bet.subheading')}</p></div>
      <div className="qt-bet-bank"><Icon name="coin" /><b>{formatNumber(language, bankroll)}</b><span>{t('bet.bankroll')}</span></div>
      {youAreSpectator ? <p className="qt-locked-note"><Icon name="eye" /> {t('spectator.watching')}</p>
        : waiting ? <p className="qt-locked-note">{t('bet.waitingNextMatch')}</p>
        : <>
          <div className="qt-bet-options" role="group" aria-label={t('bet.heading')}>
            {options.map((option, index) => <button key={option.key} type="button" className={`qt-bet-option ${locked && state.yourBet === option.amount ? 'is-selected' : ''}`} disabled={!canBet} onClick={() => { sfx.play('lock'); onBet(option.amount) }}>
              <kbd aria-hidden="true">{'ABCD'[index]}</kbd><b>{option.label}</b><span>{formatNumber(language, option.amount)}</span>
            </button>)}
          </div>
          <p className="qt-locked-note" data-empty={!locked}>{locked ? <><Icon name="lock" /> {t('bet.locked', { amount: formatNumber(language, state.yourBet ?? 0) })}</> : null}</p>
        </>}
    </section><aside className="qt-game-side">
      <Timer deadline={state.bet?.deadline} durationMs={state.bet?.durationMs} serverNow={state.serverNow} frozen={false} />
    </aside></div>
  </main>
}

/** Turun sana ne kazandırdığı. Tasarımda "Sonraki →" butonunun durduğu köşe:
 *  buton koymuyoruz — geçişi sunucu yapar ve masa hep birlikte ilerler. */
function YourGain({ state, beats }: { state: GameState; beats: RevealBeats }) {
  const { t, language } = useI18n()
  const reduced = usePrefersReducedMotion()
  const gain = (state.reveal?.gains ?? state.circleReveal?.gains)?.[state.youId] ?? 0
  if (!beats.gains) return <div className="qt-your-gain" aria-hidden="true" />
  // Çifte Bahis'te yanlış cevap bahsi YAKAR: sıfır değil, eksi göster (kayıp).
  if (state.gameMode === 'bet' && gain < 0) return <div className="qt-your-gain is-loss" aria-live="polite" aria-atomic="true">
    <span className="qt-sr-only">{t('reveal.betLost', { points: -gain })}</span>
    <b className="qt-score-flight" aria-hidden="true">−{formatNumber(language, countUpValue(-gain, beats.elapsedMs - BEAT_GAINS_MS, reduced))}</b>
    <small>{t('reveal.betLostNote')}</small>
  </div>
  if (gain <= 0) return <div className="qt-your-gain is-zero"><b>{t('reveal.noGain')}</b></div>
  return <div className="qt-your-gain" aria-live="polite" aria-atomic="true">
    <span className="qt-sr-only">{t('reveal.gainPoints', { points: gain })}</span>
    <b className="qt-score-flight" aria-hidden="true">+{formatNumber(language, countUpValue(gain, beats.elapsedMs - BEAT_GAINS_MS, reduced))}</b>
    <small>{state.gameMode === 'bet' ? t('reveal.betWon') : t('reveal.speedIncluded')}</small>
  </div>
}

/**
 * Tur ilerlemesi. Nokta sayısı tur sayısına eşit olduğu için Çember'de (20 tur)
 * noktalar kıymık gibi kalıyordu; eşiğin üstünde tek ince çubuğa döner.
 * Eşik tur sayısına bakar, ekran boyutuna değil: 20 nokta her ekranda kalabalık.
 */
const PROGRESS_DOT_LIMIT = 12
function RoundProgress({ index, total }: { index: number; total: number }) {
  if (total > PROGRESS_DOT_LIMIT) {
    return <div className="qt-progress-bar" role="presentation">
      <i><b style={{ transform: `scaleX(${Math.min(1, (index + 1) / total)})` }} /></i>
    </div>
  }
  return <div className="qt-progress">{Array.from({ length: total }, (_, i) => <i key={i} className={i <= index ? 'is-done' : ''} />)}</div>
}

/** "Yeni soru geliyor" çizgisi. Tamamen kozmetiktir: geçişi sunucu yapar, bu bar değil. */
function RevealProgress({ beats }: { beats: RevealBeats }) {
  const { t } = useI18n()
  const seconds = Math.max(1, Math.ceil(beats.remainingMs / 1000))
  return <div className="qt-reveal-progress" data-active={beats.active} aria-live="polite">
    <span>{beats.active ? t('reveal.nextIn', { seconds }) : ''}</span>
    <i><b style={{ transform: `scaleX(${beats.active ? beats.progress : 1})` }} /></i>
  </div>
}

function Podium({ state, onAgain, onLeave, speakingIds, isDiscord, onShare }: { state: GameState; onAgain: () => void; onLeave: () => void; speakingIds?: ReadonlySet<string>; isDiscord?: boolean; onShare?: (message: string) => Promise<boolean> }) {
  const { language, t } = useI18n()
  const winner = state.podium?.[0]
  const rest = state.podium?.slice(1) ?? []
  useEffect(() => { sfx.play('podium') }, []) // maç sonu fanfarı (bir kez)
  // Maç özeti (4d) ayrı bir sekmede: kısa ekranda sıralama + tüm istatistik
  // kartı yan yana sığmaz. Sunucu özet göndermezse (eski istemci/veri yok) sekme
  // hiç görünmez, podyum eskisi gibi çalışır.
  const summary = state.matchSummary
  const [tab, setTab] = useState<'rank' | 'summary' | 'review'>('rank')
  // Sunucu özet göndermezse (eski istemci/veri yok) sekmeler görünmez, podyum
  // eskisi gibi çalışır. İnceleme sekmesi yalnızca kaydedilmiş tur varsa.
  const active = summary ? tab : 'rank'
  const hasReview = !!summary?.review.length
  return <main className="qt-activity qt-podium" style={{ '--podium-art': "url('/assets/discord-activity/activity-podium-stage.webp')" } as CSSProperties}>
    <GameLeaveButton onLeave={onLeave} floating />
    {summary && <div className="qt-podium-tabs" role="tablist">
      <button role="tab" aria-selected={active === 'rank'} className={active === 'rank' ? 'is-active' : ''} onClick={() => setTab('rank')}>{t('podium.tabRank')}</button>
      <button role="tab" aria-selected={active === 'summary'} className={active === 'summary' ? 'is-active' : ''} onClick={() => setTab('summary')}>{t('podium.tabSummary')}</button>
      {hasReview && <button role="tab" aria-selected={active === 'review'} className={active === 'review' ? 'is-active' : ''} onClick={() => setTab('review')}>{t('review.tab')}</button>}
    </div>}
    {active === 'summary' && summary ? <MatchSummaryCard state={state} summary={summary} onAgain={onAgain} onLeave={onLeave} />
      : active === 'review' && summary ? <MatchReview review={summary.review} />
      : <PodiumRanking state={state} winner={winner} rest={rest} onAgain={onAgain} onLeave={onLeave} speakingIds={speakingIds} isDiscord={isDiscord} onShare={onShare} />}
  </main>
}

/**
 * Maç incelemesi zaman çizgisi (6a): her tur bir düğüm (doğru=mint, yanlış=mercan),
 * tıklanınca o turun detayı (senin cevabın vs doğru). Veri izleyene özel
 * (sunucu stateFor'da eligible olduğun turları derliyor).
 */
function MatchReview({ review }: { review: ReviewItem[] }) {
  const { t, language } = useI18n()
  // Varsayılan seçim: ilk yanlış (öğrenmek istediğin), yoksa ilk tur.
  const firstWrong = review.findIndex((item) => !item.correct)
  const [sel, setSel] = useState(firstWrong >= 0 ? firstWrong : 0)
  const item = review[Math.min(sel, review.length - 1)]
  const correctCount = review.filter((entry) => entry.correct).length
  // promptEn/yourAnswerEn/correctAnswerEn yalnız klasik turlarda dolu (çember çevrilmez).
  const prompt = (language === 'en' && item?.promptEn) ? item.promptEn : item?.prompt
  const yourAnswer = (language === 'en' && item?.yourAnswerEn !== undefined) ? item.yourAnswerEn : item?.yourAnswer
  const correctAnswer = (language === 'en' && item?.correctAnswerEn) ? item.correctAnswerEn : item?.correctAnswer
  return <div className="qt-review-card">
    <div className="qt-review-head">
      <span className="qt-review-kicker">{t('review.kicker')}</span>
      <span className="qt-review-acc">{t('review.hits', { correct: correctCount, total: review.length })}</span>
    </div>
    <div className="qt-review-timeline" role="tablist">
      {review.map((entry, index) => <button key={index} role="tab" aria-selected={index === sel} className={`qt-review-node ${entry.correct ? 'is-correct' : 'is-wrong'} ${index === sel ? 'is-active' : ''}`} onClick={() => setSel(index)}>{index + 1}</button>)}
    </div>
    {item && <div className={`qt-review-detail ${item.correct ? 'is-correct' : 'is-wrong'}`}>
      <span className="qt-review-cat">{categoryLabel(language, item.category)} · {t('review.q', { n: sel + 1 })}</span>
      <h3>{prompt}</h3>
      <div className="qt-review-answers">
        {!item.correct && <div className="qt-review-answer is-wrong"><Icon name="close" /> {yourAnswer ? `${t('review.yours')}: ${yourAnswer}` : t('review.noAnswer')}</div>}
        <div className="qt-review-answer is-correct"><Icon name="check" /> {t('review.correct')}: {correctAnswer}</div>
      </div>
    </div>}
  </div>
}

/**
 * Noktasal patlama: Confetti'nin tam-ekran versiyonundan farklı olarak belirli
 * bir olayın olduğu NOKTADAN çıkar (koltuk, "Başlat" butonu) — dikkati oraya
 * çeker. Ebeveyn position:relative/absolute olmalı; bu inset:0 ile onu kaplar.
 * triggerKey her patlamada YENİ bir değer (Date.now()) — key değişince React
 * elemanı yeniden kurar, animasyon baştan oynar.
 */
function Burst({ triggerKey }: { triggerKey: number }) {
  const reduced = usePrefersReducedMotion()
  const pieces = useMemo(() => {
    if (reduced || !triggerKey) return []
    const hues = ['#f3c362', '#5ee6c1', '#62e8df', '#ff9ec4']
    return Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3
      const dist = 24 + Math.random() * 16
      return { hue: hues[i % hues.length], x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist), delay: (Math.random() * 0.06).toFixed(2) }
    })
  }, [triggerKey, reduced])
  if (!pieces.length) return null
  return <span className="qt-burst" aria-hidden="true" key={triggerKey}>
    {pieces.map((p, i) => <i key={i} style={{ '--bx': `${p.x}px`, '--by': `${p.y}px`, background: p.hue, animationDelay: `${p.delay}s` } as CSSProperties} />)}
  </span>
}

/** Podyum konfetisi: kütüphanesiz, CSP-safe — birkaç span parçacık aşağı düşer.
 *  reduced-motion'da hiç render edilmez (global CSS de animasyonu ayrıca kısar). */
function Confetti() {
  const reduced = usePrefersReducedMotion()
  const pieces = useMemo(() => {
    if (reduced) return []
    const hues = ['#f3c362', '#5ee6c1', '#62e8df', '#ff9ec4', '#8fb0ff']
    return Array.from({ length: 28 }, (_, i) => ({
      left: Math.round(Math.random() * 100),
      delay: (Math.random() * 0.6).toFixed(2),
      dur: (2 + Math.random() * 1.6).toFixed(2),
      hue: hues[i % hues.length],
      rot: Math.round(Math.random() * 540) - 270,
    }))
  }, [reduced])
  if (!pieces.length) return null
  return <div className="qt-confetti" aria-hidden="true">
    {pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, background: p.hue, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--rot': `${p.rot}deg` } as CSSProperties} />)}
  </div>
}

function PodiumRanking({ state, winner, rest, onAgain, onLeave, speakingIds, isDiscord, onShare }: { state: GameState; winner: PodiumEntry | undefined; rest: PodiumEntry[]; onAgain: () => void; onLeave: () => void; speakingIds?: ReadonlySet<string>; isDiscord?: boolean; onShare?: (message: string) => Promise<boolean> }) {
  const { language, t } = useI18n()
  const reduced = usePrefersReducedMotion()
  const winnerScore = useCountUp(winner?.score ?? 0, reduced)
  const isHost = state.youId === state.hostId
  // Takım modu: birincil sonuç TAKIM toplamıdır; bireysel kazanan "MVP" olarak kalır.
  const isTeam = state.gameMode === 'team'
  const [teamA, teamB] = state.teamScores
  const teamWinner = teamA === teamB ? null : teamA > teamB ? 0 : 1
  const colorClass = (id: string) => {
    const found = state.players.find((player) => player.id === id)
    if (found) return playerColorClass(found, state.gameMode)
    const podiumPlayer = state.podium?.find((player) => player.id === id)
    return isTeam && podiumPlayer?.team !== undefined ? `is-team${podiumPlayer.team}` : `is-${seatColorOf(id)}`
  }
  // Maket 3a: kazanan SOLDA spot ışığında, 2-5 SAĞDA liste; iki sütun genişliği kullanır.
  // Tek kişilik masada 2-5 listesi yok (is-solo): sağ boş kalıp buton asılı durmasın.
  return <div className={`qt-podium-glass ${rest.length ? '' : 'is-solo'}`}>
      <Confetti />
      <section className="qt-podium-spot">
        <span>{t('podium.kicker')} · {t(MODE_KEYS[modeKeyOf(state.gameMode)].tag)}</span>
        {isTeam && <div className="qt-podium-teams">
          <div className={`qt-podium-team is-team0 ${teamWinner === 0 ? 'is-won' : ''}`}><b>{t('team.a')}</b><em>{formatNumber(language, teamA)}</em></div>
          <span className="qt-podium-teams__result">{teamWinner === null ? t('team.tie') : t('team.won', { team: teamWinner === 0 ? t('team.a') : t('team.b') })}</span>
          <div className={`qt-podium-team is-team1 ${teamWinner === 1 ? 'is-won' : ''}`}><b>{t('team.b')}</b><em>{formatNumber(language, teamB)}</em></div>
        </div>}
        {/* Lider altın mikrofonu taşır: taç değil — gece yarısı yayın teması.
            (Makette kupa var; mikrofon bilinçli bir tema kararıydı, duruyor.) */}
        <i className="qt-podium-mic" aria-hidden="true"><Icon name="mic" /></i>
        {/* 3B taverna karakteri: kutlama dekoru; model-viewer yalnızca bu
            fazda dinamik yüklenir, yüklenmezse boş kalır (avatar yeter). */}
        <PodiumCharacter />
        {winner && <>
          <div className={`qt-avatar qt-podium-winner ${colorClass(winner.id)}`}>{winner.avatarUrl ? <img src={winner.avatarUrl} alt="" /> : winner.name.slice(0, 1).toUpperCase()}</div>
          <b title={winner.name}>{winner.name}</b>
          <small>{isTeam ? t('team.mvp') : '#1'} · {t('podium.points', { score: formatNumber(language, winnerScore) })}</small>
          {state.xpGains?.[winner.id] && <em className="qt-xp-gain">{t('podium.xpGain', { xp: state.xpGains[winner.id].gained })}</em>}
          {state.xpGains?.[winner.id] && <NewBadgeChips gain={state.xpGains[winner.id]} />}
        </>}
      </section>
      <section className="qt-podium-side">
        <div className="qt-podium-list">{rest.map((player, index) => <div key={player.id} className={`${player.id === state.youId ? 'is-you' : ''} ${speakingIds?.has(player.id) ? 'is-speaking' : ''}`} style={{ '--row-delay': `${index * 90}ms` } as CSSProperties}>
          <b>#{index + 2}</b>
          <div className={`qt-avatar ${colorClass(player.id)}`}>{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : player.name.slice(0, 1).toUpperCase()}</div>
          <span title={player.name}>{player.name}{player.id === state.youId && <i>· {t('podium.you')}</i>}</span>
          <strong>{formatNumber(language, player.score)}</strong>
          {state.xpGains?.[player.id] && <em className="qt-xp-gain">{t('podium.xpGain', { xp: state.xpGains[player.id].gained })}</em>}
          {state.xpGains?.[player.id] && <NewBadgeChips gain={state.xpGains[player.id]} />}
        </div>)}</div>
        {/* Altın: token kuralı "altın = eylem & zafer (CTA, taç, kazanan)".
            Turkuazdı; maket 3a da altın gösteriyor. */}
        {isHost
          ? <button className="qt-button qt-button--gold qt-podium-again" onClick={onAgain}>{t('podium.again')} <Icon name="arrow" /></button>
          : <div className="qt-podium-wait" role="status">{t('podium.waitHost')}</div>}
        {/* Kanala paylaş: SDK shareLink sonuç kartı (metin + aktivite linki);
            Discord dışında (yerel test) SDK yok — buton gizlenir. */}
        {isDiscord && onShare && winner && <button className="qt-button qt-podium-share" onClick={() => onShare(t('share.message', { name: winner.name, score: formatNumber(language, winner.score), mode: t(MODE_KEYS[modeKeyOf(state.gameMode)].name) }))}><Icon name="globe" /> {t('podium.share')}</button>}
        <button className="qt-button qt-btn-home qt-podium-home" onClick={onLeave}><Icon name="exit" /> {t('podium.home')}</button>
      </section>
    </div>
}

/** Maç özeti kartı (4d). İstatistikler izleyene özel (sunucu stateFor'da hesaplar);
 *  "en hızlı parmak" masa geneli. "Kartı kopyala" YOK: Discord iframe'inde pano/
 *  canvas izin-kısıtlı, düşük değer — kullanıcı onayıyla atlandı. */
/** Günlük sonuç satırı: Wordle deseni + kopyalanabilir metin. Discord
 *  iframe'inde pano izni kısıtlı olabilir — metni seçilebilir tutarız ve
 *  clipboard denemesi başarısız olursa kendisi seçilir (elle kopyalanır). */
function DailyShare({ day, pattern }: { day: number; pattern: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const textRef = useRef<HTMLInputElement>(null)
  const text = `${pattern} QuizTavern #${day}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true) }
    catch { textRef.current?.select() }
  }
  return <div className="qt-daily-share">
    <b className="qt-daily-share__pattern" aria-hidden="true">{pattern}</b>
    <input ref={textRef} className="qt-daily-share__text" value={text} readOnly onFocus={(event) => event.target.select()} aria-label={t('daily.share')} />
    <button type="button" className="qt-button qt-daily-share__copy" onClick={copy}>{copied ? <><Icon name="check" /> {t('daily.copied')}</> : t('daily.copy')}</button>
  </div>
}

function MatchSummaryCard({ state, summary, onAgain, onLeave }: { state: GameState; summary: MatchSummary; onAgain: () => void; onLeave: () => void }) {
  const { t, language } = useI18n()
  const winner = state.podium?.[0]
  const isHost = state.youId === state.hostId
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0
  const cats = summary.perCategory.filter((item) => item.total > 0)
  return <div className="qt-summary-card">
    <div className="qt-summary-head">
      <div className="qt-summary-brand"><span>Q</span><div><b>{t('brand.name')}</b><small>{t(MODE_KEYS[modeKeyOf(state.gameMode)].name)} · {t('summary.questions', { count: state.round.total })}</small></div></div>
      {winner && <span className="qt-summary-winner" title={t('summary.winner', { name: winner.name })}><Icon name="crown" /> <span className="qt-summary-winner__label">{t('summary.winner', { name: winner.name })}</span></span>}
    </div>
    <div className="qt-summary-tiles">
      <div className="qt-summary-tile is-accuracy"><small>{t('summary.accuracy')}</small><div><b>{summary.correct} / {summary.total}</b><span>{formatPercent(language, pct)}</span></div></div>
      <div className="qt-summary-tile is-streak"><small>{t('summary.streak')}</small><div><b>{summary.bestStreak}</b><span>{t('summary.streakUnit')} 🔥</span></div></div>
      {summary.fastest
        ? <div className="qt-summary-tile is-fast"><small>{t('summary.fastest')}</small><div><b>{summary.fastest.name}</b><span>{(summary.fastest.ms / 1000).toFixed(1)} {t('summary.sec')}</span></div></div>
        : <div className="qt-summary-tile"><small>{t('summary.fastest')}</small><div><b>—</b></div></div>}
    </div>
    {(() => {
      // Kalıcı ilerleme kazancı: bu maçtan alınan XP + seviye/lig geçişi.
      // levelFloor formülü sunucudakiyle aynı (xp.ts: 100·(L-1)·L/2).
      const gain = state.xpGains?.[state.youId]
      if (!gain) return null
      const intoLevel = gain.xp - (100 * (gain.level - 1) * gain.level) / 2
      const pct = Math.min(100, Math.round((intoLevel / Math.max(1, 100 * gain.level)) * 100))
      return <div className="qt-summary-xp">
        <div className="qt-summary-xp__head"><small>{t('summary.xpGain')}</small><b>{t('podium.xpGain', { xp: gain.gained })}</b>
          {gain.leveledUp && <span className="qt-summary-xp__flag">{t('podium.levelUp')}</span>}
          {gain.leagueChanged && <span className="qt-summary-xp__flag is-league">{t('podium.newLeague', { league: t(LEAGUE_KEYS[gain.league] ?? 'league.acemi') })}</span>}
          <NewBadgeChips gain={gain} />
        </div>
        <div className="qt-xp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        <small className="qt-summary-xp__foot">{t('progress.level', { n: gain.level })} · {t(LEAGUE_KEYS[gain.league] ?? 'league.acemi')}</small>
      </div>
    })()}
    {cats.length > 0 && <div className="qt-summary-cats">
      {cats.map((item) => <div key={item.category} className="qt-summary-cat">
        <small>{categoryLabel(language, item.category)}</small>
        <div className="qt-summary-bar"><i style={{ width: `${Math.round((item.correct / item.total) * 100)}%` }} /></div>
        <small>{item.correct}/{item.total}</small>
      </div>)}
    </div>}
    {state.daily?.pattern && <DailyShare day={state.daily.day} pattern={state.daily.pattern} />}
    {isHost
      ? <button className="qt-button qt-button--gold qt-summary-again" onClick={onAgain}>{t('podium.again')} <Icon name="arrow" /></button>
      : <div className="qt-podium-wait" role="status">{t('podium.waitHost')}</div>}
    <button className="qt-button qt-btn-home qt-summary-home" onClick={onLeave}><Icon name="exit" /> {t('podium.home')}</button>
  </div>
}

/**
 * Yükleme iskeleti (3d): soru/oyun gelene kadar boş kart yerine oyun düzeninin
 * shimmer'lı taslağı — durum şeridi + oyuncu paneli + soru kartı (kategori, iki
 * metin satırı, 2×2 şık) + sayaç dairesi. Saf dekor: aria-hidden.
 */
function GameSkeleton() {
  return <main className="qt-activity qt-skeleton" aria-hidden="true">
    <div className="qt-skeleton__strip qt-shimmer" />
    <div className="qt-skeleton__grid">
      <div className="qt-skeleton__side qt-shimmer" />
      <div className="qt-skeleton__card">
        <span className="qt-shimmer qt-skeleton__chip" />
        <span className="qt-shimmer qt-skeleton__line" style={{ width: '70%' }} />
        <span className="qt-shimmer qt-skeleton__line" style={{ width: '52%' }} />
        <div className="qt-skeleton__answers">{[0, 1, 2, 3].map((i) => <span key={i} className="qt-shimmer" />)}</div>
      </div>
      <div className="qt-skeleton__timer qt-shimmer" />
    </div>
  </main>
}

/**
 * PIP: küçük yüzen pencere (~320×180). Masa buraya SIĞMAZ ve küçültülmez —
 * bambaşka, tek bakışta okunan bir kart gösterilir. Tek işi şu soruya cevap
 * vermek: "geri dönmem gerekiyor mu?" Bu yüzden soru fazında kilitlemediysen
 * kart seni yanıp sönerek geri çağırır; koreografi ve masa burada yoktur.
 */
function PipCard({ state }: { state: GameState | null }) {
  const { t } = useI18n()
  const beats = useRevealBeats(state ?? ({ phase: 'lobby' } as GameState))
  const seconds = useClock(state?.question?.deadline ?? state?.circle?.deadline ?? state?.bet?.deadline ?? state?.countdown?.deadline, state?.serverNow)
  if (!state) return null

  const self = state.players.find((player) => player.id === state.youId)
  const gain = (state.reveal?.gains ?? state.circleReveal?.gains)?.[state.youId] ?? 0
  const answered = !!self?.answered

  let tag: string
  let body: React.ReactNode
  if (state.phase === 'lobby') {
    tag = t('pip.lobby')
    const ready = state.players.filter((player) => player.ready).length
    body = <div className="qt-pip__stack">
      <b className="qt-pip__big">{ready}/{state.players.length}</b>
      <span>{t('pip.ready')}</span>
      <em>{t(MODE_KEYS[modeKeyOf(state.gameMode)].name)}</em>
    </div>
  } else if (state.phase === 'countdown') {
    tag = t('pip.starting')
    body = <b className="qt-pip__big is-count">{seconds || t('countdown.go')}</b>
  } else if (state.phase === 'podium') {
    tag = t('podium.kicker')
    const rank = (state.podium?.findIndex((player) => player.id === state.youId) ?? -1) + 1
    body = <div className="qt-pip__stack">
      <em>{t('pip.rank', { rank: rank || state.players.length })}</em>
      <b className="qt-pip__big">{self?.score ?? 0}</b>
      <span>{t('pip.yourScore')}</span>
    </div>
  } else if (state.phase === 'bet') {
    tag = t(MODE_KEYS.bet.tag)
    const locked = state.yourBet !== null
    body = <div className="qt-pip__row">
      <b className={`qt-pip__big ${seconds <= 3 ? 'is-urgent' : ''}`}>{seconds}</b>
      <span className={`qt-pip__lock ${locked ? 'is-locked' : 'is-open'}`}>
        {locked ? <><Icon name="check" /> {t('pip.locked')}</> : t('bet.pipPlace')}
      </span>
    </div>
  } else if (beats.active) {
    // Uzun cevap metni 320px karta sığmaz: doğru şıkkın HARFİ gösterilir.
    const letter = state.reveal ? 'ABCD'[state.reveal.correctIndex] : state.circleReveal?.answer.slice(0, 1).toUpperCase() ?? '?'
    tag = t(MODE_KEYS[modeKeyOf(state.gameMode)].tag)
    body = <div className="qt-pip__stack">
      <em className={gain > 0 ? 'is-right' : 'is-wrong'}>{gain > 0 ? t('pip.correct') : t('pip.result')}</em>
      <b className="qt-pip__big is-letter">{letter}</b>
      <span>{gain > 0 ? t('pip.gained', { score: gain }) : t('pip.noPoints')}</span>
    </div>
  } else {
    tag = t('pip.round', { index: state.round.index + 1, total: state.round.total })
    body = <div className="qt-pip__row">
      <b className={`qt-pip__big ${seconds <= 3 ? 'is-urgent' : ''}`}>{seconds}</b>
      <span className={`qt-pip__lock ${answered ? 'is-locked' : 'is-open'}`}>
        {answered ? <><Icon name="check" /> {t('pip.locked')}</> : t('pip.answerNow')}
      </span>
    </div>
  }

  return <main className="qt-pip" aria-live="polite">
    {/* Tasarım 3c: baş bölünür — marka solda (yüzen pencere hangi uygulama?),
        durum sağda. Eskiden "Q + tur" tek blok soldaydı, wordmark yoktu. */}
    <div className="qt-pip__head"><div className="qt-pip__brand"><span>Q</span><b>{t('brand.name')}</b></div><span className="qt-pip__tag">{tag}</span></div>
    <div className="qt-pip__body">{body}</div>
    <small className="qt-pip__hint">{t('pip.tapToReturn')}</small>
  </main>
}

function ActivityHome({ onRejoin }: { onRejoin: () => void }) {
  const { t } = useI18n()
  return <main className="qt-activity qt-return-home" style={{ '--home-art': "url('/assets/discord-activity/activity-classic-stage.webp')" } as CSSProperties}><div className="qt-return-home__haze" /><header className="qt-activity-bar"><div className="qt-brand-mark"><span>Q</span><b>{t('brand.name')}</b></div></header><section className="qt-return-home__card"><span>{t('home.kicker')}</span><h1>{t('home.title')}</h1><p>{t('home.body')}</p><button className="qt-button qt-button--primary" onClick={onRejoin}><Icon name="people" /> {t('home.rejoin')}</button></section></main>
}

/**
 * Bağlantı koptu. Sunucu maç sırasında koltuğu 30 sn tutar; buradaki sayaç o
 * sürenin GÖSTERGESİDİR, kararı vermez — bağlantı kopukken sunucunun deadline'ını
 * öğrenmenin yolu yoktur, o yüzden aynı paylaşılan sabitten yerel olarak sayarız.
 * Gerçek karar her zaman sunucunundur; sayaç bitse bile socket.io denemeye devam
 * eder ve sunucu hâlâ kabul ediyorsa oyuncu masaya döner.
 */
function ReconnectOverlay({ droppedAt, inMatch, onReconnect, onLeave }: { droppedAt: number; inMatch: boolean; onReconnect: () => void; onLeave: () => void }) {
  const { t } = useI18n()
  const trapRef = useFocusTrap<HTMLDivElement>(true)
  const [, force] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => force((tick) => tick + 1), 250); return () => window.clearInterval(timer) }, [])
  const remaining = Math.max(0, RECONNECT_GRACE_MS - (Date.now() - droppedAt))
  const seconds = Math.ceil(remaining / 1000)
  const ratio = remaining / RECONNECT_GRACE_MS
  const expired = remaining <= 0
  return <div ref={trapRef} className="qt-drop-backdrop" role="dialog" aria-modal="true" aria-labelledby="qt-reconnect-title" aria-live="assertive" tabIndex={-1}>
    <section className="qt-drop-card">
      {inMatch && <div className="qt-drop-ring" style={{ '--ratio': String(ratio) } as CSSProperties}>
        <div className="qt-drop-ring__face"><b>{seconds}</b><small>{t('drop.seconds')}</small></div>
      </div>}
      <span className="qt-drop-kicker">{t('drop.kicker')}</span>
      <h1 id="qt-reconnect-title">{inMatch && !expired ? t('drop.title') : t('drop.retrying')}<em>.</em></h1>
      <p>{expired ? t('drop.expired') : inMatch ? t('drop.body') : t('drop.bodyLobby')}</p>
      <div className="qt-drop-actions">
        <button type="button" className="qt-button" data-autofocus onClick={onReconnect}><Icon name="arrow" /> {t('drop.reconnect')}</button>
        <button type="button" className="qt-button qt-button--danger" onClick={onLeave}><Icon name="exit" /> {t('game.leave')}</button>
      </div>
    </section>
  </div>
}

/** Masaya kısa tepki. Gönderim hız sınırı SUNUCUDA; burası sadece arayüz. */
function EmoteBar({ emotes, players, onSend }: { emotes: LiveEmote[]; players: PublicPlayer[]; onSend: (emote: EmoteKey) => void }) {
  const { t } = useI18n()
  const glyphs: Record<EmoteKey, string> = { flame: '🔥', heart: '💖', star: '⭐' }
  const labels: Record<EmoteKey, StringKey> = { flame: 'emote.flame', heart: 'emote.heart', star: 'emote.star' }
  return <>
    <div className="qt-emote-bar" aria-label={t('emote.label')}>
      {EMOTE_KEYS.map((key) => <button key={key} className={`qt-emote-btn is-${key}`} title={t(labels[key])} aria-label={t(labels[key])} onClick={() => onSend(key)}>{glyphs[key]}</button>)}
    </div>
    <div className="qt-emote-feed" aria-hidden="true">
      {emotes.map((emote) => <span key={emote.uid} className={`qt-emote-fly is-${emote.emote}`}>
        {glyphs[emote.emote]}<i>{players.find((player) => player.id === emote.playerId)?.name ?? ''}</i>
      </span>)}
    </div>
  </>
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
  const { t } = useI18n()
  return <div className={`qt-boot-curtain ${fading ? 'is-fading' : ''}`} aria-hidden="true">
    <img className="qt-boot-curtain__logo" src="/table/owl-logo.webp" alt="" />
    <b className="qt-boot-curtain__title">{t('brand.name')}</b>
    <small className="qt-boot-curtain__sub">{t('boot.subtitle')}</small>
  </div>
}

/** İlk ziyarette (qt-howto-seen localStorage'da yoksa) bir kez açılan 3 adımlık tanıtım. */
function HowToPlayModal({ onClose }: { onClose: (dontShow: boolean) => void }) {
  const { t } = useI18n()
  const trapRef = useFocusTrap<HTMLElement>(true)
  const [dontShow, setDontShow] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(dontShow) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, dontShow])
  const steps: { icon: IconName; color: string; title: StringKey; body: StringKey }[] = [
    { icon: 'spark', color: '#f3c362', title: 'howto.step1Title', body: 'howto.step1Body' },
    { icon: 'bolt', color: '#62e8df', title: 'howto.step2Title', body: 'howto.step2Body' },
    { icon: 'crown', color: '#f3c362', title: 'howto.step3Title', body: 'howto.step3Body' },
  ]
  return <div className="qt-howto-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(dontShow) }}>
    <section ref={trapRef} className="qt-howto-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="qt-howto-modal__head">
        <div><span>{t('table.howTo')}</span><b id="howto-title">{t('howto.title')}</b></div>
        <button type="button" className="qt-howto-modal__close" onClick={() => onClose(dontShow)} aria-label={t('leave.cancel')}><Icon name="close" /></button>
      </div>
      <div className="qt-howto-modal__steps">{steps.map((step, index) => <div className="qt-howto-modal__step" key={index}>
        <div className="qt-howto-modal__step-head">
          <span className="qt-howto-modal__step-icon" style={{ '--step-color': step.color } as CSSProperties}><Icon name={step.icon} /></span>
          <b className="qt-howto-modal__step-num">{index + 1}</b>
        </div>
        <b>{t(step.title)}</b>
        <small>{t(step.body)}</small>
      </div>)}</div>
      <div className="qt-howto-modal__foot">
        <button type="button" className={`qt-howto-modal__dontshow ${dontShow ? 'is-checked' : ''}`} onClick={() => setDontShow((value) => !value)} aria-pressed={dontShow}>
          <span className="qt-howto-modal__checkbox" aria-hidden="true">{dontShow ? '✓' : ''}</span>{t('howto.dontShow')}
        </button>
        <button type="button" className="qt-button qt-button--gold" onClick={() => onClose(dontShow)}>{t('howto.close')}</button>
      </div>
    </section>
  </div>
}

function LeaveConfirm({ alone, onCancel, onConfirm }: { alone: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  const trapRef = useFocusTrap<HTMLElement>(true)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return <div className="qt-leave-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section ref={trapRef} className="qt-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><span>{t('leave.kicker')}</span><h2 id="leave-title">{t('leave.title')}</h2><p>{t(alone ? 'leave.bodyAlone' : 'leave.body')}</p><div><button className="qt-button" onClick={onCancel}>{t('leave.cancel')}</button><button className="qt-button qt-button--danger" onClick={onConfirm}><Icon name="exit" /> {t(alone ? 'leave.confirmAlone' : 'leave.confirm')}</button></div></section></div>
}

export function ActivityApp() {
  const activity = useDiscordActivity()
  const roomId = activity.identity.instanceId || 'ana-lobi'
  const game = useRealtimeGame(roomId, activity.identity, activity.retry)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [hasLeftGame, setHasLeftGame] = useState(false)
  // Açılış perdesi: her oturumda EN AZ 1.5sn — bağlantı ne kadar hızlı olursa
  // olsun marka anı atlanmaz. booted true olunca fade başlar, fade bitince
  // (500ms sonra, CSS transition süresiyle eşleşir) tamamen unmount olur.
  const [booted, setBooted] = useState(false)
  const [showCurtain, setShowCurtain] = useState(true)
  useEffect(() => { const timer = window.setTimeout(() => setBooted(true), 1500); return () => window.clearTimeout(timer) }, [])
  useEffect(() => { if (!booted) return; const timer = window.setTimeout(() => setShowCurtain(false), 500); return () => window.clearTimeout(timer) }, [booted])
  // "Nasıl oynanır": perde kapandıktan kısa süre sonra, yalnızca daha önce
  // kapatılıp "bir daha gösterme" işaretlenmemişse bir kez açılır.
  const [howToOpen, setHowToOpen] = useState(false)
  useEffect(() => {
    if (!booted) return
    const seen = storageGet('qt-howto-seen') === '1'
    if (seen) return
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) setHowToOpen(true)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [booted])
  const closeHowTo = (dontShow: boolean) => {
    if (dontShow) storageSet('qt-howto-seen', '1')
    setHowToOpen(false)
  }
  // Dil kalıcılığı YALNIZ kullanıcının açık seçiminden yazılır; aksi halde
  // ilk açılış 'tr'yi hemen saklar ve Discord locale önerisi sonsuza kör kalır.
  const [language, setLanguageState] = useState<ActivityLanguage>(() => storageGet('qt-ui-language') === 'en' ? 'en' : 'tr')
  const setLanguage = useCallback((next: ActivityLanguage) => {
    storageSet('qt-ui-language', next)
    setLanguageState(next)
  }, [])
  useEffect(() => { document.documentElement.lang = language }, [language])
  // Kullanıcı hiç dil seçmediyse Discord istemcisinin diline uy (userSettingsGetLocale).
  useEffect(() => {
    if (storageGet('qt-ui-language') || !activity.identity.locale) return
    setLanguageState(activity.identity.locale.toLowerCase().startsWith('tr') ? 'tr' : 'en')
  }, [activity.identity.locale])
  // Sözlük tek yerden sağlanır; her bileşen useI18n() ile okur, prop zinciri yok.
  const i18n = useMemo(() => ({ language, t: (key: StringKey, params?: Record<string, string | number>) => translate(language, key, params) }), [language])
  // Discord Rich Presence: durum çubuğunda masa fazı (yalnız kozmetik; SDK
  // setActivity her state paketinde değil, yalnız anlamlı geçişte çağrılır).
  const phase = game.state?.phase
  const roundIndex = game.state?.round.index
  const roundTotal = game.state?.round.total
  const spectating = !!game.state && !game.state.players.some((player) => player.id === game.state!.youId)
  useEffect(() => {
    if (!activity.identity.isDiscord || !phase) return
    if (spectating) { activity.setPresence(i18n.t('presence.spectating')); return }
    if (phase === 'lobby') activity.setPresence(i18n.t('presence.lobby'))
    else if (phase === 'podium') activity.setPresence(i18n.t('presence.podium'))
    else activity.setPresence(i18n.t('presence.playing', { current: roundIndex ?? 0, total: roundTotal ?? 0 }))
  }, [activity.identity.isDiscord, activity.setPresence, phase, roundIndex, roundTotal, spectating, i18n])
  const isLoading = activity.status === 'booting' || !game.state
  const body = useMemo(() => {
    // PIP tüm fazların önüne geçer: masa o pencereye sığmadığı için hiçbir
    // faz ekranı orada render edilmez.
    if (activity.layoutMode === 'pip' && !isLoading && !hasLeftGame) return <PipCard state={game.state} />
    if (hasLeftGame) return <ActivityHome onRejoin={() => { game.rejoinGame(); setHasLeftGame(false) }} />
    // Hata varsa iskelet değil metin: shimmer sonsuza dek dönüp sorunu gizlemesin.
    // Yükleme (hatasız): boş spinner yerine oyun düzeninin iskeleti (3d).
    if (isLoading) {
      // Socket kesin olarak düştüyse iskeleti sonsuza döndürme: bağlantı
      // hatasını göster. activity.retry YOK — o Discord OAuth'u baştan kurar;
      // yalnız socket'i yeniden bağlamak yeterli (reconnectNow).
      if (!activity.error && game.status === 'offline') {
        const detail = game.connectionError?.code ?? game.connectionError?.message
        return <main className="qt-activity qt-boot"><div className="qt-boot-orbit" /><h1>{i18n.t('boot.unreachable')}</h1><p>{detail ? `${i18n.t('err.connection')} (${detail})` : i18n.t('err.connection')}</p><button type="button" className="qt-button qt-button--primary" onClick={game.reconnectNow}>{i18n.t('boot.retry')}</button></main>
      }
      return activity.error
        ? <main className="qt-activity qt-boot"><div className="qt-boot-orbit" /><h1>{i18n.t('boot.title')}</h1><p>{activity.error}</p><button type="button" className="qt-button qt-button--primary" onClick={activity.retry}>{i18n.t('boot.retry')}</button></main>
        : <GameSkeleton />
    }
    if (game.state!.phase === 'lobby') return <ActivityLobby state={game.state} status={game.status} identity={activity.identity} speakingIds={activity.speakingIds} language={language} onLanguageChange={setLanguage} onReady={game.ready} onStart={game.start} onStartDaily={game.startDaily} onSetCategories={game.setCategories} onSetQuestionCount={game.setQuestionCount} onSetDifficulty={game.setDifficulty} onSetPack={game.setPack} onSetMode={game.setMode} onSetTeam={game.setTeam} onKick={game.kick} onTransferHost={game.transferHost} onInvite={activity.invite} onSpectate={game.spectate} onTakeSeat={game.takeSeat} />
    if (game.state!.phase === 'countdown') return <StartCountdown state={game.state!} />
    // Çifte Bahis: soru öncesi bahis fazı — kendi board'u (kategori + bahis arayüzü).
    if (game.state!.phase === 'bet') return <BetBoard state={game.state!} onBet={game.placeBet} onLeave={() => setLeaveConfirmOpen(true)} onSpectate={game.spectate} speakingIds={activity.speakingIds} />
    // Soru ve reveal aynı board: faz değişse de bileşen unmount olmaz, kartlar yerinde kalır.
    if (game.state!.phase === 'question' || game.state!.phase === 'reveal') return <GameBoard state={game.state!} onAnswer={game.answer} onCircleAnswer={game.answerCircle} onLeave={() => setLeaveConfirmOpen(true)} onSpectate={game.spectate} onReport={() => game.reportQuestion()} speakingIds={activity.speakingIds} />
    // Podyumda maç bitti: ayrılmak yıkıcı değil, onay diyaloğu sürtünme. Doğrudan
    // ayrıl (confirmLeave ile aynı iş): tek insan bensem sunucu odayı kapatır,
    // reconnect taze lobi verir ("ana menü"); başkası varsa bekleme ekranı.
    return <Podium state={game.state!} speakingIds={activity.speakingIds} isDiscord={activity.identity.isDiscord} onShare={activity.share} onAgain={() => game.start(game.state!.gameMode)} onLeave={() => {
      const alone = !game.state!.players.some((player) => player.id !== game.state!.youId && !player.isBot)
      game.leaveGame(alone)
      if (!alone) setHasLeftGame(true)
    }} />
  }, [activity.error, activity.identity, activity.layoutMode, activity.status, game, hasLeftGame, i18n, isLoading, language])
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
  const aloneAtTable = !game.state?.players.some((player) => player.id !== game.state!.youId && !player.isBot)
  const confirmLeave = () => {
    game.leaveGame(aloneAtTable)
    setLeaveConfirmOpen(false)
    if (!aloneAtTable) setHasLeftGame(true)
  }
  const isPip = activity.layoutMode === 'pip'
  // Kopma ekranı yalnızca oyuncu masadayken anlamlı: kendi isteğiyle ayrıldıysa
  // ya da PIP'teyse gösterme. Grace yalnızca maç sırasında işler.
  const showDrop = !isPip && !hasLeftGame && game.droppedAt !== null && !!game.state
  const inMatch = game.state ? game.state.phase !== 'lobby' && game.state.phase !== 'podium' : false
  // Emote yalnızca soru fazında: reveal'de sağ alt köşeyi geri sayım çizgisi
  // tutuyor, ikisi üst üste binerdi.
  // hasLeftGame: masadan çıktıysan emote atacak masan yok — bekleme ekranında
  // çubuk görünüyordu.
  const inGame = game.state?.phase === 'question' && !hasLeftGame
  // Lobi dışındaki her sahne "oyun sahnesi": arka planı sade kalır.
  const onGameScene = !!game.state && game.state.phase !== 'lobby'
  const showSpectatorBar = !isPip && !showDrop && !!game.state?.youAreSpectator && game.state.phase !== 'lobby'
  // Grid için ayrı tasarım yok: focused'ın dar hali gibi davranır, responsive iskelet karşılar.
  return <I18nContext.Provider value={i18n}>
    {/* Yörünge animasyonu lobiye ait: orada masayı anlatıyor, oyun sahnelerinde
        ise şıkların ve sayacın üzerinden geçen dev bir elipse dönüşüyordu. */}
    <div className={`qt-activity-root is-${activity.layoutMode} ${showSpectatorBar ? 'has-spectator-bar' : ''}`}>{!isPip && !onGameScene && !activity.lowPower && <AmbientShader />}{body}</div>
    {!isPip && inGame && !showDrop && <EmoteBar emotes={game.emotes} players={game.state!.players} onSend={game.sendEmote} />}
    {/* İzleyici çubuğu: oyun/podyum fazlarında (lobide you-panel hallediyor). */}
    {showSpectatorBar && <SpectatorBar canSit={game.state!.players.length < 8} onTakeSeat={game.takeSeat} />}
    {showDrop && <ReconnectOverlay droppedAt={game.droppedAt!} inMatch={inMatch} onReconnect={game.reconnectNow} onLeave={confirmLeave} />}
    {!isPip && !showDrop && leaveConfirmOpen && <LeaveConfirm alone={aloneAtTable} onCancel={() => setLeaveConfirmOpen(false)} onConfirm={confirmLeave} />}
    {!isPip && showCurtain && <BootCurtain fading={booted} />}
    {!isPip && howToOpen && game.state?.phase === 'lobby' && <HowToPlayModal onClose={closeHowTo} />}
    {!isPip && game.message && <button type="button" className="qt-toast" role="status" aria-live="polite" onClick={game.dismissMessage}>{i18n.t(game.message.key, game.message.params)}</button>}
  </I18nContext.Provider>
}
