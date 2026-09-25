import { GAME } from "./config";
import { GameError } from "./errors";
import { CIRCLE_COUNTS, QUESTION_COUNTS, QUESTION_TIMES, TABLE_THEMES, type TableTheme, LEAGUE_ORDER } from "../../shared/types";
import { circlePoolKeys, matchesCircleAnswer, sampleCirclePrompts, sampleWordPrompts, wordPoolKeys, type CirclePrompt } from "./circle";
import { effectiveDifficulty, resetExhaustedSubpools, sampleQuestions, setQuestionCalibration, shuffleChoices, type Question } from "./questions";
import { sampleNumericQuestions, type NumericQuestion } from "./questions-numeric";
import { sampleOrderQuestions, type OrderQuestion } from "./questions-order";
import { sampleBoardCells, type BoardCellSpec } from "./questions-board";
import { botSkill } from "./bots";
import { getPack, samplePackQuestions } from "./packs";
import { CATEGORY_CATALOG, CATEGORY_NAMES } from "./categories";
import { dailyDayNumber, dailyPattern, dailyQuestions, type DailyBoard, type DailyResultEntry } from "./daily";
import type { MatchFinishedEntry } from "./xp";
import type {
  BadgeKey,
  BetPayload,
  CardType,
  CirclePayload,
  CircleRevealPayload,
  CountdownPayload,
  Difficulty,
  GameMode,
  GameState,
  LastMatch,
  MatchMoment,
  MatchSummary,
  NumericQuestionPayload,
  BlitzLivePayload,
  BlitzSummaryPayload,
  TimelineQuestionPayload,
  TimelineRevealPayload,
  BoardPayload,
  NumericRevealPayload,
  PodiumEntry,
  ProgressBadge,
  ProgressSnapshot,
  PublicPlayer,
  ReviewItem,
  QuestionCount,
  QuestionPayload,
  ToastKey,
  RevealPayload,
  SeasonBoard,
  WordPayload,
  XpGain,
} from "../../shared/types";

export interface RoomPlayer {
  id: string;
  seat: number;
  name: string;
  avatarUrl: string | null;
  socketId: string | null;
  score: number;
  connected: boolean;
  ready: boolean;
  isBot: boolean;
  eligibleFrom: number;
  choice: number | null;
  answeredAt: number | null;
  circleAnswer: string | null;
  circleCorrectAt: number | null;
  /** Çifte Bahis: bu tur kilitlenen bahis (null = henüz yatırmadı). Her tur sıfırlanır. */
  bet: number | null;
  /** Takım modu: oyuncunun takımı (0/1). Katılınca küçük takıma atanır; host değiştirebilir. */
  team: number;
  /** Maç sırasında bağlantısı kopan oyuncunun grace süresinin başlangıcı */
  disconnectedAt: number | null;
  /** Emote hız sınırı OYUNCUYA bağlıdır; socket'e bağlansa yeniden bağlanan sınırı sıfırlar. */
  lastEmoteAt: number;
  /** Takılan unvan — kazanılmış rozetlerden biri; ProgressStore'dan yüklenir. */
  title: BadgeKey | null;
  /** Son Masa: kalan can (start'ta GAME.ELIM_LIVES'a kurulur; 0 = elenmiş). */
  lives: number;
  /** Kelime Oyunu: doğru cevap anındaki donmuş değer (kalan harf × 100).
   *  Harf sonradan açılsa da erken cevaplayan yüksek değerini korur. */
  wordGain: number;
  /** Tavern kartı (joker) sayısı — maç başı 1, 3'lü seride +1. Klasik/Takım. */
  cards: number;
  /** Bu tur kullanılan joker (tur başına bir; tur başında sıfırlanır). */
  cardUsed: CardType | null;
  /** %50 jokeriyle silinen şık indeksleri (yalnız kullananın payload'ında). */
  fiftyRemoved: number[];
  /** Dondur jokeri yiyen oyuncu — bu tur deadline'ı CARD_FREEZE_MS kısalır. */
  frozen: boolean;
  /** Maç özeti (4d) için birikenler. Her reveal'de güncellenir, start()'ta sıfırlanır. */
  stats: MatchStats;
  /** Zaman çizgisi incelemesi (6a): tur başına cevap. Klasik = şık indeksi,
   *  çember = yazılan metin. Yalnız reveal'de o turun gözü doldurulur. */
  answers: (number | null)[];
  typed: (string | null)[];
  /** D/Y Blitz (§6.1): oyuncunun bağımsız ifade akışı — herkes kendi hızında
   *  ilerler; pencere ortak 60 sn, seri çarpanıyla puanlanır. */
  blitzIdx: number;
  blitzStreak: number;
  blitzCorrect: number;
  blitzAnswered: number;
  blitzScore: number;
  /** Oyuncunun o anki ifadesi (truth yalnız sunucuda; istemciye sızmadan). */
  blitzClaim: { truth: boolean; claim: string; claimEn?: string; text: string; textEn?: string; category: string } | null;
  /** Maç-sonu incelemesi: oyuncunun bu maçta gördüğü ifadeler + kararı. */
  blitzTrail: { text: string; textEn?: string; claim: string; claimEn?: string; truth: boolean; choice: number }[];
  /** Zaman Çizelgesi: tur başına oyuncunun dizimi (null = cevap vermedi). */
  orderAnswers: (number[] | null)[];
}

/** Bir oyuncunun tek maçtaki performansı. Maç özeti kartını (4d) besler. */
interface MatchStats {
  correct: number;
  total: number;
  currentStreak: number;
  bestStreak: number;
  /** Doğru cevapların en hızlısı (ms, soru başlangıcına göre). Cevap yoksa null. */
  fastestMs: number | null;
  /** Tek turda en yüksek kazanç — anlar kartı "en büyük bahis" (§6.3). */
  maxGain: number;
  perCategory: Map<string, { correct: number; total: number }>;
}

function emptyStats(): MatchStats {
  return { correct: 0, total: 0, currentStreak: 0, bestStreak: 0, fastestMs: null, maxGain: 0, perCategory: new Map() };
}

type Broadcast = () => void;
type QuestionStarted = (room: Room) => void;

/** Kalıcı ilerleme deposunun odaya görünen yüzü (server/src/xp.ts uygular).
 *  Enjekte edilmezse XP/lig/sezon özellikleri tamamen kapalı kalır —
 *  testler ve saf oyun mantığı depodan bağımsız çalışır. */
export interface ProgressStore {
  badge(userId: string): ProgressBadge | null;
  snapshot(userId: string): ProgressSnapshot | null;
  seasonBoard(limit?: number): SeasonBoard;
  weeklyBoard(limit?: number): SeasonBoard;
  recordMatch(entries: MatchFinishedEntry[]): Map<string, XpGain>;
  /** Maç dışı küçük XP grantı — izleyici kazanan tahmini. Sayaçlara yazmaz. */
  bonusXp(entry: { userId: string; name: string; avatarUrl: string | null; amount: number }): XpGain;
  /** Ustalık kazanılan kategori adları — kategori ikonu işareti için. */
  categoryMastery(userId: string): string[];
  /** Soru istatistiği artışı (§6.3 kalibrasyon girişi). */
  recordQuestionStats(rows: { questionId: string; asked: number; correct: number }[]): void;
  /** Kalibrasyon için tüm soru istatistikleri. */
  questionStats(): { questionId: string; asked: number; correct: number }[];
  title(userId: string): BadgeKey | null;
  setTitle(userId: string, title: BadgeKey | null): boolean;
}

/** Sunucunun otorite olduğu tek bir eşzamanlı maç odası. */

/** Soru yazarı turunun puan-akışlı modları — bu modlarda yazılan sorular maça
 *  karışır; bahis/çember/kelime/bulanık kendi mekaniğine sahip olduğu için dışarıda. */
const WRITTEN_MODES = new Set(["classic", "lightning", "elim", "team", "duel"]);

/** ANSWER (şık indeksi) kabul eden modlar — numeric/timeline/circle/word kendi
 *  giriş yollarını kullanır; onlarda choice emit'i state'i kirletir
 *  (firstAnswerId kaçak set olur, choice anlamsız dolar). */
const CHOICE_MODES = new Set(["classic", "lightning", "bet", "team", "elim", "blur", "duel", "zil", "blitz", "board"]);

/** 0..n-1 karışık indeksler — yazılan soruların hangi slotlara düşeceğini belirler. */
function shuffleIdx(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export class Room {
  readonly players = new Map<string, RoomPlayer>();
  questions: Question[];
  readonly minPlayers: number;
  gameMode: GameMode = "classic";
  phase: GameState["phase"] = "lobby";
  qIndex = 0;
  private roundLimit: number = GAME.QUESTIONS_PER_MATCH;
  private circlePrompts: CirclePrompt[] = [];
  // Turun ilk kilitleyeni ("en hızlı parmak"): istemci o oyuncunun şeridinde tek
  // seferlik parıltı gösterir. Her tur başında sıfırlanır.
  private firstAnswerId: string | null = null;
  // İzleyiciler: koltuğu olmayan, oynamayan ama state yayınını alan kişiler.
  // Oyuncu limitine (8) sayılmazlar; ne cevap verir ne emote atar ne host olur.
  private spectators = new Map<string, { id: string; name: string; avatarUrl: string | null; socketId: string | null }>();
  // Tekrar önleme. seen*: bu masada BUGÜNE KADAR görülen tüm soru/prompt'lar
  // birikir -> havuzun tamamı bir kez dolaşılana kadar hiçbiri tekrar etmez,
  // sonra döngü sıfırlanıp havuz yeniden karışır. last*: yalnız son maç; döngü
  // sıfırlanınca bile sınırda aynı maçın hemen tekrarını engeller.
  private seenQuestionIds = new Set<string>();
  private lastQuestionIds = new Set<string>();
  private seenCirclePromptKeys = new Set<string>();
  private lastCirclePromptKeys = new Set<string>();
  categorySelection: string[] = [];
  questionCount: QuestionCount = 10;
  // Zorluk masa ayarı: null = karışık (tüm zorluklar). Mod'dan bağımsız; hem
  // klasik hem çember örneklemesine filtre olarak geçer.
  difficulty: Difficulty | null = null;
  /** Masa teması (§6.3): host'un liginin açtığı görsel kimlik. */
  tableTheme: TableTheme = "tavern";
  /** Masa ayarı: soru süresi (ms); null = mod varsayılanı. */
  questionTimeMs: number | null = null;
  /** Masa ayarı: doğru cevaba hız çarpanı verilsin mi. */
  speedBonus = true;
  /** Masa ayarı: soru havuzu yalnız resimli sorulardan seçilsin mi. */
  imageOnly = false;
  /** Masa ayarı: özel soru paketi id'si; null = standart havuz. Paket seçiliyken
   *  klasik soru havuzu paketin listesiyle değişir (kategori/zorluk filtreleri
   *  atlanır); Çember kendi prompt havuzunu kullandığı için etkilenmez. */
  packId: string | null = null;
  /** Soru yazarı turu (§6.3): lobide oyuncu başına bir yazılan soru; puan-akışlı
   *  modlarda (klasik/fitil/takım/son masa) maça karışır. Yazar kendi turunda
   *  oynamaz; puan kazananların ortalamasını alır. */
  private writtenQuestions = new Map<string, Question>();
  hostId: string | null = null;
  questionStartedAt = 0;
  questionDeadline = 0;
  countdownDeadline = 0;
  /** Çifte Bahis: bahis fazının bitiş zamanı (epoch ms). */
  betDeadline = 0;
  /** Çifte Bahis: bu turun bahis fazı başladığında bakiyesi 0 olanlar (kurtarma turu). */
  private rescueRound = new Set<string>();
  revealUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private botTimers = new Set<NodeJS.Timeout>();
  /** Atılan oyuncular bir süre geri giremez; yoksa kick tek tıkla geri dönülen boş bir jest olur. */
  private kickedUntil = new Map<string, number>();
  private lastReveal: RevealPayload | null = null;
  private lastCircleReveal: CircleRevealPayload | null = null;
  private lastWordReveal: CircleRevealPayload | null = null;
  /** Yakın Tahmin: turun sayı havuzu + oyuncu tahminleri + son reveal. */
  private numericQuestions: NumericQuestion[] = [];
  private orderQuestions: OrderQuestion[] = [];
  private numericGuesses = new Map<string, number>();
  private lastNumericReveal: NumericRevealPayload | null = null;
  /** Zaman Çizelgesi: reveal'da doğru sıra + herkesin dizimi + isabet sayısı. */
  private lastTimelineReveal: TimelineRevealPayload | null = null;
  private orderGuesses = new Map<string, number[]>();
  /** Turun ekran dizilimi: görünen sıra → events indeksi. Herkes aynı karışımı görür. */
  private orderShuffle: number[] = [];
  // Tavern Panosu (§6.1): 5 kategori x 5 değer panosu. Sorular soru fazına
  // kadar sunucuda kalır — pick fazında yalnız değer+kullanılmışlık sızar.
  private boardCells: (BoardCellSpec & { used: boolean })[] = [];
  private boardCategories: string[] = [];
  private boardAsked: Question[] = []; // açılan hücrelerin soruları, açılış sırasıyla
  private boardPickerOrder: string[] = [];
  private boardPickerPos = 0;
  private currentCell = -1;
  private pickDeadline = 0;
  // Kelime Oyunu durumu: prompt dizisi (≤14 tur, 4-10 harf), bu turda açılan
  // harf sayısı, açılış sırası (karışık pozisyonlar) ve maç-geneli ortak zaman
  // havuzu. Havuz her soru fazında tükenir; reveal sırasında saat durur.
  private wordPrompts: CirclePrompt[] = [];
  private wordLettersRevealed = 0;
  private wordOrder: number[] = [];
  private wordPoolMs = 0;
  private wordRoundStartedAt = 0;
  /** Fitil: bu maçta doğru cevap çıkan tur sayısı — her biri fitili bir kademe kısaltır. */
  private lightningBurn = 0;
  /** Podyumda rövanş isteyen oyuncular. Eşik: bağlı insan oyuncuların
   *  yarısından fazlası; aşılınca host'u beklemeden yeni maç başlar. */
  private rematchVotes = new Set<string>();
  /** İzleyici tahminleri (§6.3): spectatorId → kazanan adayı playerId.
   *  Yalnız maç başında (geri sayım + ilk tur) alınır; bilene finish'te XP. */
  private predictions = new Map<string, string>();
  /** Zil (§6.1): bu turda zili kazanan (tek cevap hakkı), yanmış denemeler
   *  ve kazananın cevap penceresi. */
  private buzzWinnerId: string | null = null;
  // D/Y Blitz: pencere kapanınca son özet — reveal fazında istemciye gider.
  private lastBlitzSummary: BlitzSummaryPayload | null = null;
  private buzzFailed = new Set<string>();
  private buzzAttempts = 0;
  private zilTimer: NodeJS.Timeout | null = null;
  /** Team points live independently from player records, so departures cannot erase earned points. */
  private teamScores: [number, number] = [0, 0];
  /** Freeze the finishing order; podium departures must not rewrite the result or MVP. */
  private podiumSnapshot: PodiumEntry[] | null = null;
  /** Günlük Meydan Okuma maçı mı — klasik kurallar, tarih tohumlu sabit soru
   *  seti. Maç sonunda her oyuncu için Wordle deseni üretilir. */
  private dailyMatch = false;
  /** Günlük maç masanın modunu geçici olarak Klasik'e çevirir; masa ayarı burada
   *  saklanır ve günlük bitip lobiye/yeni maça geçilince geri yüklenir. */
  private modeBeforeDaily: GameMode | null = null;
  private dailyDay = 0;
  /** Maç sonunda hesaplanan desenler (userId → "🟩🟥⬜🟩🟩"); podyumda paylaşılır. */
  private dailyResults = new Map<string, string>();
  /** Günlük maç bittiğinde kalıcı depo index.ts tarafından yazılır (kanca). */
  onDailyFinished: ((entries: DailyResultEntry[]) => void) | null = null;
  /** Kalıcı ilerleme deposu (XP/lig/sezon); null = özellik kapalı. */
  private progress: ProgressStore | null = null;
  /** Biten maçın oyuncu başına XP kazanımı — podyum yayınlarında taşınır. */
  private xpGains = new Map<string, XpGain>();
  /** `undefined` = no finished match yet; `null` = the finished match had no correct answer. */
  private fastestFingerSnapshot: { name: string; ms: number } | null | undefined = undefined;
  private momentsSnapshot: import("../../shared/types").MatchMoment[] | null = null;
  /** Son biten maçın dondurulmuş sonucu. Podyumdan lobiye dönülse de sonuç
   *  ekranına hâlâ bakan oyuncular (inResults) onu görmeye devam eder. */
  private matchSeq = 0;
  private lastMatchMeta: { id: number; gameMode: GameMode; roundTotal: number; teamScores: [number, number]; podium: PodiumEntry[]; moments: MatchMoment[] | null; xpGains: Record<string, XpGain> | null; dailyDay: number | null } | null = null;
  /** Lobi günlük lider tablosu — index.ts'den depo erişimiyle bağlanır. */
  private dailyBoardProvider: ((userId: string) => DailyBoard | null) | null = null;
  setDailyBoardProvider(fn: (userId: string) => DailyBoard | null) { this.dailyBoardProvider = fn; }
  private frozenSummaries = new Map<string, MatchSummary>();
  private frozenDaily = new Map<string, string>();
  private inResults = new Set<string>();
  private onQuestionStarted: QuestionStarted | null = null;
  private onEmptied: (() => void) | null = null;
  private onToast: ((playerId: string, key: ToastKey) => void) | null = null;

  constructor(
    readonly id: string,
    private readonly broadcast: Broadcast,
    options: { minPlayers?: number; questionCount?: number } = {}
  ) {
    this.minPlayers = options.minPlayers ?? GAME.MIN_PLAYERS;
    this.questions = sampleQuestions(options.questionCount ?? GAME.QUESTIONS_PER_MATCH);
  }

  addPlayer(player: Omit<RoomPlayer, "seat" | "score" | "connected" | "ready" | "choice" | "answeredAt" | "eligibleFrom" | "circleAnswer" | "circleCorrectAt" | "bet" | "team" | "disconnectedAt" | "lastEmoteAt" | "stats" | "answers" | "typed" | "title" | "lives" | "wordGain" | "cards" | "cardUsed" | "fiftyRemoved" | "frozen" | "blitzIdx" | "blitzStreak" | "blitzCorrect" | "blitzAnswered" | "blitzScore" | "blitzClaim" | "blitzTrail" | "orderAnswers">) {
    this.pruneExpiredKicks();
    const bannedUntil = this.kickedUntil.get(player.id) ?? 0;
    if (Date.now() < bannedUntil) throw new GameError("err.kicked");
    this.kickedUntil.delete(player.id);
    const existing = this.players.get(player.id);
    if (existing) {
      this.clearGrace(existing.id);
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.socketId = player.socketId;
      existing.name = player.name;
      existing.avatarUrl = player.avatarUrl;
      // Unvanı tazele — başka oturumda değiştirilmiş olabilir.
      existing.title = this.progress?.title(player.id) ?? null;
      // Masa sahipsiz kaldıysa (tek insan kopmuştu) dönen oyuncu sahipliği geri alır.
      this.reassignHost();
      this.broadcast();
      return existing;
    }
    if (this.players.size >= GAME.MAX_PLAYERS) throw new GameError("err.roomFull");
    const record: RoomPlayer = {
      ...player,
      seat: this.nextFreeSeat(),
      // Countdown joiners have not missed a round; in Double Bet they need the
      // same opening bankroll as everybody who was seated when start() ran.
      score: this.gameMode === "bet" && this.phase === "countdown" ? GAME.BET_STARTING_BANKROLL : 0,
      connected: true,
      ready: player.isBot,
      choice: null,
      answeredAt: null,
      circleAnswer: null,
      circleCorrectAt: null,
      bet: null,
      team: this.smallerTeam(),
      disconnectedAt: null,
      lastEmoteAt: 0,
      // Countdown da lobi sayılır: 3-2-1 sırasında oturan henüz hiçbir soru
      // görmemiştir, soru 0'dan itibaren oynamalı. (Aksi halde ilk soruyu haksız
      // yere kaçırırdı.) Soru/reveal sırasında katılan ise sıradaki sorudan başlar.
      // A late Double Bet entrant cannot meaningfully play with zero bankroll. Keep
      // them out until the next match, which also prevents spectate/reseat refills.
      // Son Masa'da da geç katılan bu maça alınmaz — canı olmayan bir
      // oyuncunun ortadan girmesi eleme mantığını bozar.
      // Countdown'da katılmak: bet kasasını aldığı için oynar; elim'de canlar,
      // düelloda düellocular maç başında dağıtıldığından o fazda katılan bu
      // maçı izler — yoksa elim'de 0 canlı hayalet, düelloda 3. düellocu olur.
      eligibleFrom: this.phase === "lobby"
        ? 0
        : this.gameMode === "elim" || this.gameMode === "duel"
          ? this.roundLimit
          : this.phase === "countdown"
            ? 0
            : this.gameMode === "bet"
              ? this.roundLimit
              : this.qIndex + 1,
      lives: 0,
      wordGain: 0,
      cards: 0,
      cardUsed: null,
      fiftyRemoved: [],
      frozen: false,
      stats: emptyStats(),
      answers: [],
      typed: [],
      blitzIdx: 0,
      blitzStreak: 0,
      blitzCorrect: 0,
      blitzAnswered: 0,
      blitzScore: 0,
      blitzClaim: null,
      blitzTrail: [],
      orderAnswers: [],
      title: player.isBot ? null : (this.progress?.title(player.id) ?? null),
    };
    this.players.set(record.id, record);
    this.reassignHost();
    this.broadcast();
    return record;
  }

  /**
   * Masa sahibi daima bağlı bir İNSAN olur. Bot asla host olamaz: aksi halde
   * tek insan koptuğunda sahiplik bota geçer ve insan geri döndüğünde maçı
   * bir daha başlatamaz. Mevcut sahip hâlâ uygunsa dokunulmaz.
   */
  private reassignHost() {
    const current = this.hostId ? this.players.get(this.hostId) : null;
    if (current && current.connected && !current.isBot) return;
    this.hostId = [...this.players.values()].find((candidate) => candidate.connected && !candidate.isBot)?.id ?? null;
  }

  /**
   * Socket kopması. Lobide oyuncu anında silinir; maç sırasında 30 sn grace
   * tanınır (skoru ve koltuğu korunur), süre dolunca masadan düşer.
   * `socketId` verilirse yalnızca hâlâ o socket'e bağlı oyuncuyu işaretler —
   * böylece aynı kullanıcının yeni bağlantısı, eski socket'in geç gelen
   * disconnect olayı tarafından düşürülemez.
   */
  markDisconnected(playerId: string, socketId?: string) {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    if (socketId !== undefined && player.socketId !== socketId) return;
    if (this.phase === "lobby") return this.removePlayer(playerId);
    player.connected = false;
    player.ready = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();
    if (this.hostId === playerId) this.reassignHost();
    // Zil kazananı koptuysa denemesi yanmış sayılır — masa beklemesin.
    if (this.buzzWinnerId === playerId) this.zilFailWinner();
    this.checkRematchTrigger();
    this.clearGrace(playerId);
    this.graceTimers.set(playerId, setTimeout(() => {
      this.graceTimers.delete(playerId);
      const current = this.players.get(playerId);
      if (current && !current.connected) this.removePlayer(playerId);
    }, GAME.RECONNECT_GRACE_MS));
    this.broadcast();
    // Kopan oyuncu beklenen son yanıtsa kalanları süre sonuna kadar bekletme.
    this.revealIfEveryoneAnswered();
    this.advanceIfEveryoneBet();
  }

  /** Unvan takma/kaldırma — geçerlilik ProgressStore'da (yalnız kazanılmış
   *  rozet). Depo kapalıysa oturumluk uygulanır; yeniden girişte sıfırlanır. */
  setTitle(playerId: string, title: BadgeKey | null) {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    if (this.progress && !this.progress.setTitle(playerId, title)) {
      throw new GameError("err.title");
    }
    player.title = title;
    this.broadcast();
  }

  /** Oyuncuyu masadan çıkarır (ayrılma, grace bitişi veya kick); kalan masa kesintisiz devam eder. */
  removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.clearGrace(playerId);
    this.players.delete(playerId);
    this.inResults.delete(playerId);
    this.rematchVotes.delete(playerId);
    this.writtenQuestions.delete(playerId);
    // Zil kazananı masadan çıktıysa denemesi yanmış sayılır.
    if (this.buzzWinnerId === playerId) this.zilFailWinner();
    if (this.hostId === playerId) this.reassignHost();
    if (this.handleNoPlayersLeft()) return;
    // Ayrılma eşiği düşürmüş olabilir — bekleyen çoğunluk artık yeterli olabilir.
    this.checkRematchTrigger();
    this.broadcast();
    // Ayrılan oyuncu beklenen son yanıtsa, kalanları gereksizce süre sonuna kadar bekletme.
    this.revealIfEveryoneAnswered();
    this.advanceIfEveryoneBet();
  }

  /** Gerçek (bot olmayan) oyuncu kalmadıysa turu temizler. İZLEYİCİ varsa oda
   *  boş lobiye döner (izleyiciler kalır; sonra "Oyna" ile masayı canlandırabilir),
   *  izleyici de yoksa oda tamamen kapanır. Bir şey yaptıysa true döner. */
  private handleNoPlayersLeft(): boolean {
    if ([...this.players.values()].some((candidate) => !candidate.isBot)) return false;
    this.clearTimer();
    this.clearBotTimers();
    this.clearAllGrace();
    this.players.clear();
    this.hostId = null;
    this.phase = "lobby";
    this.qIndex = 0;
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.lastNumericReveal = null;
    this.lastTimelineReveal = null;
    this.numericGuesses.clear();
    this.orderGuesses.clear();
    this.lastBlitzSummary = null;
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    this.momentsSnapshot = null;
    this.dailyMatch = false;
    this.dailyResults = new Map();
    this.xpGains = new Map();
    this.clearLastMatch();
    if (this.spectators.size === 0) this.onEmptied?.();
    else this.broadcast();
    return true;
  }

  /** Ne oyuncu ne izleyici kaldıysa odayı kapatır (izleyici disconnect yolu). */
  private closeIfEmpty(): boolean {
    if (this.spectators.size > 0 || [...this.players.values()].some((candidate) => !candidate.isBot)) return false;
    this.clearTimer();
    this.clearBotTimers();
    this.clearAllGrace();
    this.players.clear();
    this.hostId = null;
    this.phase = "lobby";
    this.qIndex = 0;
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.lastNumericReveal = null;
    this.lastTimelineReveal = null;
    this.numericGuesses.clear();
    this.lastBlitzSummary = null;
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    this.momentsSnapshot = null;
    this.dailyMatch = false;
    this.dailyResults = new Map();
    this.xpGains = new Map();
    this.clearLastMatch();
    this.onEmptied?.();
    return true;
  }

  // ---- İzleyici (spectator) yönetimi ----

  /** Bağlanan kullanıcıyı oyuncu ya da izleyici olarak kaydeder. Yeniden bağlanan
   *  oyuncu/izleyici tazelenir; yeni gelen için koltuk varsa oyuncu, doluysa
   *  izleyici olur. previousSocketId eski bağlantıyı düşürmek için döner. */
  join(user: { id: string; name: string; avatarUrl: string | null; socketId: string; isBot: boolean }): { role: "player" | "spectator"; previousSocketId: string | null } {
    const prevPlayer = this.players.get(user.id);
    const prevSpectator = this.spectators.get(user.id);
    const previousSocketId = prevPlayer?.socketId ?? prevSpectator?.socketId ?? null;
    // Zaten oyuncuysa (yeniden bağlanma) ya da yeni gelene koltuk varsa: oyuncu.
    if (prevPlayer || (!prevSpectator && this.players.size < GAME.MAX_PLAYERS)) {
      this.addPlayer(user); // yeni/yeniden bağlanmayı, koltuğu, host'u, yayını halleder
      this.spectators.delete(user.id);
      return { role: "player", previousSocketId };
    }
    this.addSpectator(user);
    return { role: "spectator", previousSocketId };
  }

  private addSpectator(user: { id: string; name: string; avatarUrl: string | null; socketId: string }): void {
    this.pruneExpiredKicks();
    const bannedUntil = this.kickedUntil.get(user.id) ?? 0;
    if (Date.now() < bannedUntil) throw new GameError("err.kicked");
    this.spectators.set(user.id, { id: user.id, name: user.name, avatarUrl: user.avatarUrl, socketId: user.socketId });
    this.broadcast();
  }

  /** Oyuncu koltuğu bırakıp izleyiciye geçer. Maç sürüyorsa kalan oyuncularla
   *  devam eder; son oyuncuysa masa boş lobiye döner (izleyiciler kalır). */
  becomeSpectator(userId: string): void {
    const player = this.players.get(userId);
    if (!player || player.isBot) return;
    const { id, name, avatarUrl, socketId } = player;
    this.clearGrace(userId);
    this.players.delete(userId);
    this.rematchVotes.delete(userId);
    this.writtenQuestions.delete(userId);
    if (this.hostId === userId) this.reassignHost();
    if (this.handleNoPlayersLeft()) return;
    this.checkRematchTrigger();
    this.spectators.set(id, { id, name, avatarUrl, socketId }); // artık izleyici olduğu için oda kapanmaz, lobiye döner
    this.broadcast();
    this.revealIfEveryoneAnswered();
    this.advanceIfEveryoneBet();
  }

  /** İzleyici boş koltuğa oturup oyuncu olur. Masa doluysa hata. Maç sürüyorsa
   *  sıradaki turdan itibaren oynar (addPlayer eligibleFrom'u faza göre verir). */
  becomePlayer(user: { id: string; name: string; avatarUrl: string | null; socketId: string }): void {
    if (!this.spectators.has(user.id)) return;
    if (this.players.size >= GAME.MAX_PLAYERS) throw new GameError("err.tableFull");
    this.spectators.delete(user.id);
    this.predictions.delete(user.id); // masaya oturdu — artık tahmin değil oyun
    this.addPlayer({ id: user.id, name: user.name, avatarUrl: user.avatarUrl, socketId: user.socketId, isBot: false });
  }

  /** İzleyici bağlantısı koptu. Grace yok (oynamıyordu). Oda tamamen boşaldıysa kapatır. */
  removeSpectator(userId: string, socketId?: string): void {
    const spectator = this.spectators.get(userId);
    if (!spectator) return;
    if (socketId !== undefined && spectator.socketId !== socketId) return; // eski bağlantının geç disconnect'i
    this.spectators.delete(userId);
    if (this.closeIfEmpty()) return;
    this.broadcast();
  }

  /** State yayını alacak herkes: oyuncular + izleyiciler. Yayıncı (index.ts) her
   *  alıcıya kendi bakış açısıyla (youId) state gönderir. */
  recipients(): Array<{ id: string; socketId: string | null }> {
    return [
      ...[...this.players.values()].map((player) => ({ id: player.id, socketId: player.socketId })),
      ...[...this.spectators.values()].map((spectator) => ({ id: spectator.id, socketId: spectator.socketId })),
    ];
  }

  /** Masa sahibi bir oyuncuyu atar; atılanın socket'ini kapatabilmesi için id'sini döndürür. */
  kick(byId: string, targetId: unknown): string | null {
    this.pruneExpiredKicks();
    if (this.hostId !== byId) throw new GameError("err.kickHostOnly");
    if (typeof targetId !== "string" || targetId === byId) throw new GameError("err.invalidTarget");
    const target = this.players.get(targetId);
    if (!target) throw new GameError("err.notAtTable");
    const socketId = target.socketId;
    // 5 dk yeniden giriş yasağı: kick, tek tıkla geri dönülen boş bir jest olmasın.
    if (!target.isBot) this.kickedUntil.set(targetId, Date.now() + 5 * 60_000);
    this.removePlayer(targetId);
    return socketId;
  }

  transferHost(byId: string, targetId: unknown): void {
    if (this.hostId !== byId) throw new GameError("err.transferHostOnly");
    if (typeof targetId !== "string") throw new GameError("err.invalidTarget");
    const target = this.players.get(targetId);
    if (!target || target.isBot || !target.connected) throw new GameError("err.transferConnectedOnly");
    this.hostId = targetId;
    this.broadcast();
  }

  /**
   * Podyumdan lobiye dönüş. Oyuncu odadan ÇIKMAZ ve host değişmez (eskiden
   * "Ana menüye dön" LEAVE_GAME yapıyordu: oyuncu silinir, sahiplik devredilir,
   * geri gelen yine podyuma düşerdi). İlk dönen odayı lobiye alır; sonuç
   * ekranına hâlâ bakanlar (inResults) istemcide sonucu görmeye devam eder.
   */
  returnToLobby(playerId: string): void {
    if (!this.players.has(playerId)) return;
    this.inResults.delete(playerId);
    if (this.phase !== "podium") { this.broadcast(); return; }
    this.clearTimer();
    this.clearBotTimers();
    this.phase = "lobby";
    this.qIndex = 0;
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    if (this.modeBeforeDaily) { this.gameMode = this.modeBeforeDaily; this.modeBeforeDaily = null; }
    for (const player of this.players.values()) {
      if (!player.isBot) player.ready = false;
      player.eligibleFrom = 0;
    }
    this.rematchVotes.clear();
    this.broadcast();
  }

  /** Zil modu: ilk basan tek cevap hakkı kazanır. Pencere ZIL_ANSWER_MS ile
   *  turun kalan süresinin min'idir; dolarsa deneme yanmış sayılır ve zil
   *  yeniden açılır. İkinci basan kuyruğa girmez — sonrakiler yeniden basar. */
  buzz(playerId: string): void {
    if (this.gameMode !== "zil" || this.phase !== "question" || this.buzzWinnerId) return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    if (!player || player.eligibleFrom > this.qIndex || !player.connected || this.buzzFailed.has(playerId)) return;
    this.buzzWinnerId = playerId;
    this.buzzAttempts += 1;
    const window = Math.min(GAME.ZIL_ANSWER_MS, Math.max(0, this.questionDeadline - Date.now()));
    if (this.zilTimer) clearTimeout(this.zilTimer);
    this.zilTimer = setTimeout(() => this.zilFailWinner(), window);
    // Kazanan botsa cevabını planla (insanlarla aynı pencerede).
    if (player.isBot) {
      const q = this.currentQuestion();
      if (q) {
        const correct = Math.random() < botSkill(player.id) + 0.1;
        const choice = correct
          ? q.correctIndex
          : [0, 1, 2, 3].filter((i) => i !== q.correctIndex)[Math.floor(Math.random() * 3)];
        this.scheduleBotTask(() => this.answer(playerId, choice), 600 + Math.random() * 900);
      }
    }
    this.broadcast();
  }

  /** Zil kazananının cevabı. Doğru → değeri deneme sayısına göre düşmüş
   *  kazançla reveal; yanlış → deneme yanar, herkes denediyse reveal,
   *  değilse zil yeniden açılır. */
  private zilAnswer(playerId: string, choice: number, player: RoomPlayer) {
    if (playerId !== this.buzzWinnerId) return;
    player.choice = choice;
    player.answeredAt = Date.now();
    const correct = this.currentQuestion()?.correctIndex === choice;
    this.buzzWinnerId = null;
    if (this.zilTimer) { clearTimeout(this.zilTimer); this.zilTimer = null; }
    if (correct) return this.reveal();
    this.buzzFailed.add(playerId);
    const remaining = this.eligiblePlayers().filter((p) => p.connected && !this.buzzFailed.has(p.id));
    if (!remaining.length) return this.reveal();
    this.broadcast();
    this.scheduleZilBots();
  }

  /** Zil kazananı pencerede cevap vermedi ya da koptu: denemesi yanar,
   *  uygun oyuncu kalmadıysa reveal, varsa zil yeniden açılır. */
  private zilFailWinner() {
    const winner = this.buzzWinnerId;
    if (!winner || this.phase !== "question") return;
    this.buzzWinnerId = null;
    this.buzzFailed.add(winner);
    const remaining = this.eligiblePlayers().filter((p) => p.connected && !this.buzzFailed.has(p.id));
    if (!remaining.length) return this.reveal();
    this.broadcast();
    this.scheduleZilBots();
  }

  /** Zil'de botlar rastgele gecikmeyle basar; yalnız henüz yanmamış olanlar. */
  private scheduleZilBots() {
    if (this.gameMode !== "zil" || this.phase !== "question" || this.buzzWinnerId) return;
    for (const p of this.players.values()) {
      if (!p.isBot || p.eligibleFrom > this.qIndex || !p.connected || this.buzzFailed.has(p.id)) continue;
      this.scheduleBotTask(() => this.buzz(p.id), 400 + Math.random() * Math.max(600, this.questionDuration() * 0.35));
    }
  }

  /** Bu denemede doğru cevabın değeri: 1. deneme ZIL_BASE, sonra DECAY. */
  private zilValue() {
    return Math.max(GAME.ZIL_MIN, GAME.ZIL_BASE - GAME.ZIL_DECAY * Math.max(0, this.buzzAttempts - 1));
  }

  /** Tahmin penceresi: geri sayım ve ilk tur açıkken (soru/bahis fazı, qIndex 0)
   *  izleyici kazananı seçebilir. İlk reveal'den sonra oynamış bilgiyle tahmin
   *  hile olur — kapanır. */
  private predictOpen(): boolean {
    if (this.phase === "countdown") return true;
    return (this.phase === "question" || this.phase === "bet") && this.qIndex === 0;
  }

  /** İzleyici kazanan tahmini (§6.3). Tek izleyici tek hedef; değiştirilebilir
   *  (pencere açıkken). Doğru bilenler finish'te GAME.PREDICT_XP alır. */
  predict(spectatorId: string, targetId: unknown): void {
    // Düello'da masadaki fazla oyuncular da izleyici sayılır (eligibleFrom=
    // roundLimit): kazananı tahmin ederler. Diğer modlarda tahmin izleyiciye özel.
    const watcher = this.players.get(spectatorId);
    const isDuelWatcher = this.gameMode === "duel" && !!watcher && !watcher.isBot && watcher.eligibleFrom >= this.roundLimit;
    if (!this.spectators.has(spectatorId) && !isDuelWatcher) return;
    if (!this.predictOpen()) throw new GameError("err.predictPhase");
    if (typeof targetId !== "string" || !this.players.has(targetId)) throw new GameError("err.invalidTarget");
    this.predictions.set(spectatorId, targetId);
    this.broadcast();
  }

  /** Rövanş için gereken oy: masadaki bağlı İNSAN oyuncuların yarısından fazlası. */
  private rematchNeeded(): number {
    const eligible = [...this.players.values()].filter((player) => player.connected && !player.isBot);
    return Math.floor(eligible.length / 2) + 1;
  }

  /** Podyumda "Rövanş?" oyu (§6.3). Oy bir kez sayılır; eşik aşılınca sunucu
   *  masanın host'u adına aynı ayarlarla yeni maçı başlatır — `start()`'ın tüm
   *  doğrulamaları (min oyuncu, takım dengesi) korunur. Botlar ve izleyiciler
   *  oy kullanamaz; ayrılanların oyu düşer. */
  voteRematch(playerId: string): void {
    if (this.phase !== "podium") throw new GameError("err.rematchPhase");
    const player = this.players.get(playerId);
    if (!player || player.isBot || !player.connected || this.rematchVotes.has(playerId)) return;
    this.rematchVotes.add(playerId);
    this.checkRematchTrigger();
    if (this.phase === "podium") this.broadcast();
  }

  /** Eşik sağlandıysa rövanşı başlatır — yalnız oy anında değil, kopma/ayrılma
   *  sonrası da denetlenir: bağlı insan azaldığında bekleyen çoğunluk zaten
   *  yeterli olabilir (masa gereksiz yere host beklemesin). */
  private checkRematchTrigger(): void {
    if (this.phase !== "podium" || !this.rematchVotes.size) return;
    if (this.rematchVotes.size < this.rematchNeeded()) return;
    this.rematchVotes.clear();
    const by = this.hostId && this.players.has(this.hostId) ? this.hostId : this.rematchVotes.values().next().value;
    // Oylar temizlendi; tetikleyici kalmadıysa ilk bağlı oyuncu adına başlat.
    const requester = by ?? [...this.players.values()].find((p) => p.connected && !p.isBot)?.id;
    if (!requester) return;
    try {
      this.start(requester, this.gameMode);
    } catch {
      // Örn. takım dengesi bozuldu — podyum açık kalır, host elle başlatabilir.
    }
  }

  private clearLastMatch() {
    this.lastMatchMeta = null;
    this.frozenSummaries = new Map();
    this.frozenDaily = new Map();
    this.inResults = new Set();
  }

  /** İzleyene özel maç özeti (canlı istatistikten). */
  private summaryFor(player: RoomPlayer): MatchSummary {
    return {
      correct: player.stats.correct,
      total: player.stats.total,
      bestStreak: player.stats.bestStreak,
      perCategory: [...player.stats.perCategory.entries()].map(([category, value]) => ({ category, correct: value.correct, total: value.total })),
      fastest: this.fastestFingerSnapshot !== undefined ? this.fastestFingerSnapshot : this.fastestFinger(),
      review: this.buildReview(player),
    };
  }

  setEmptiedHandler(handler: () => void) {
    this.onEmptied = handler;
  }

  /** Odaya ait gecikmeli bot işi; oda/tur kapanınca topluca iptal edilir. */
  scheduleBotTask(task: () => void, delayMs: number): void {
    let timer: NodeJS.Timeout;
    timer = setTimeout(() => {
      this.botTimers.delete(timer);
      task();
    }, delayMs);
    this.botTimers.add(timer);
  }

  /** Sunucu kapanışı veya odanın Map'ten silinmesi için tam kaynak temizliği. */
  dispose(): void {
    this.clearTimer();
    this.clearBotTimers();
    this.clearAllGrace();
    this.kickedUntil.clear();
    this.onQuestionStarted = null;
    this.onEmptied = null;
    this.onToast = null;
  }

  setReady(playerId: string, ready: boolean): void {
    if (this.phase !== "lobby") return;
    const player = this.players.get(playerId);
    if (!player || player.isBot || !player.connected) return;
    if (player.ready === ready) return;
    player.ready = ready;
    this.broadcast();
  }

  /**
   * Masa ayarı: mod. Yayınlanan masa durumudur — her istemcinin yerel seçimi
   * olsaydı host Fitil'i seçtiğinde diğerlerinin ekranı Klasik göstermeye devam
   * ederdi. Mod değişince soru sayısı o modun doğal değerine döner ve (diğer
   * masa ayarları gibi) herkesin hazır onayı sıfırlanır.
   */
  setGameMode(playerId: string, mode: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.modeHostOnly");
    if (mode !== "classic" && mode !== "lightning" && mode !== "circle" && mode !== "bet" && mode !== "team" && mode !== "elim" && mode !== "blur" && mode !== "word" && mode !== "duel" && mode !== "zil" && mode !== "numeric" && mode !== "blitz" && mode !== "timeline" && mode !== "board") throw new GameError("err.modeInvalid");
    if (this.gameMode === mode) return;
    this.gameMode = mode;
    if (mode === "classic") this.questionCount = 10;
    if (mode === "lightning") this.questionCount = 5;
    if (mode === "bet") this.questionCount = 10;
    if (mode === "team") this.questionCount = 10;
    if (mode === "elim") this.questionCount = 10;
    if (mode === "blur") this.questionCount = 10;
    if (mode === "word") this.questionCount = 10;
    // Düello hep 7 soru — host'a sayı seçtirilmez (QUESTION_COUNTS dışı olduğu
    // için setQuestionCount zaten reddeder).
    if (mode === "duel") this.questionCount = GAME.DUEL_QUESTIONS as QuestionCount;
    if (mode === "zil") this.questionCount = 10;
    if (mode === "numeric") this.questionCount = 10;
    if (mode === "blitz") this.questionCount = 10;
    if (mode === "timeline") this.questionCount = 10;
    if (mode === "board") this.questionCount = 25 as QuestionCount; // 5x5 pano — fiili limit hücre sayısı
    if (mode === "circle") this.questionCount = 20;
    const maxCategories = mode === "lightning" ? 1 : mode === "circle" ? 2 : 3;
    this.categorySelection = this.categorySelection
      .filter((name) => {
        const category = CATEGORY_CATALOG.find((item) => item.name === name);
        return mode === "circle" ? !!category?.circleCount : !!category?.classicCount;
      })
      .slice(-maxCategories);
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Yeni katılan oyuncunun atanacağı takım: üye sayısı az olan (eşitse 0). */
  private smallerTeam(): number {
    let a = 0, b = 0;
    for (const player of this.players.values()) player.team === 1 ? (b += 1) : (a += 1);
    return a <= b ? 0 : 1;
  }

  /**
   * Takım modu: host bir oyuncunun takımını değiştirir. Hazır onayını SIFIRLAMAZ
   * — host masayı düzenlerken her takas herkesi tekrar onaylatırsa can sıkar.
   * (Mod/sayı/kategori gibi genel ayarlar sıfırlar; takım kişiye özel oturmadır.)
   */
  setTeam(byId: string, targetId: unknown, team: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== byId) throw new GameError("err.teamHostOnly");
    if (typeof targetId !== "string") throw new GameError("err.invalidTarget");
    if (team !== 0 && team !== 1) throw new GameError("err.teamInvalid");
    const target = this.players.get(targetId);
    if (!target) throw new GameError("err.notAtTable");
    if (target.team === team) return;
    target.team = team;
    this.broadcast();
  }

  /**
   * Takım modu: host tek dokunuşla takımları yeniden karıştırır. Hazır onayını
   * sıfırlamaz (setTeam ile aynı gerekçe). Rastgele ve dengeli: |A−B| ≤ 1 —
   * dönüşümlü atama iki tarafın da güçsüz kalmasını önler.
   */
  shuffleTeams(byId: string): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== byId) throw new GameError("err.teamHostOnly");
    if (this.gameMode !== "team") throw new GameError("err.teamInvalid");
    const seated = [...this.players.values()];
    for (let i = seated.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seated[i], seated[j]] = [seated[j], seated[i]];
    }
    seated.forEach((player, index) => { player.team = index % 2; });
    this.broadcast();
  }

  /**
   * Masa ayarı: sonraki maçın soru sayısı. Süre moda sabittir; sayı değil.
   * Çember'de aynı alan tur sayısı olarak okunur (10/15/20).
   */
  setQuestionCount(playerId: string, count: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.countHostOnly");
    // Çember'de aynı alan tur sayısını taşır: 10/15/20.
    const valid = this.gameMode === "circle" ? CIRCLE_COUNTS : QUESTION_COUNTS;
    if (!(valid as readonly number[]).includes(count as number)) throw new GameError("err.countInvalid");
    if (this.questionCount === count) return;
    this.questionCount = count as QuestionCount;
    // Kategori değişimiyle aynı kural: masa ayarı değişince herkes tekrar onaylar.
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Masa teması: host'un ligi tema kapısını açar; tema tüm masaya uygulanır. */
  setTableTheme(playerId: string, theme: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.themeHostOnly");
    const def = TABLE_THEMES.find((t) => t.key === theme);
    if (!def) throw new GameError("err.themeInvalid");
    const league = this.progress?.badge(playerId)?.league ?? "acemi";
    const order = LEAGUE_ORDER as readonly string[];
    if (order.indexOf(league) < order.indexOf(def.league)) throw new GameError("err.themeLocked", { league: def.league });
    if (this.tableTheme === def.key) return;
    this.tableTheme = def.key;
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Zorluk ayarı: "kolay"|"orta"|"zor" ya da null (karışık). Yalnız host, lobide. */
  setDifficulty(playerId: string, value: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.difficultyHostOnly");
    const next = value === null ? null : value === "kolay" || value === "orta" || value === "zor" ? value : undefined;
    if (next === undefined) throw new GameError("err.difficultyInvalid");
    if (this.difficulty === next) return;
    this.difficulty = next;
    // Masa ayarı değişti; herkes tekrar onaylasın (kategori/sayı ile aynı kural).
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Masa ayarı: soru süresi; null = mod varsayılanı. Yalnız host, lobide. */
  setQuestionTime(playerId: string, ms: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.timeHostOnly");
    if (ms !== null && !(QUESTION_TIMES as readonly number[]).includes(ms as number)) throw new GameError("err.timeInvalid");
    if (this.questionTimeMs === ms) return;
    this.questionTimeMs = ms as number | null;
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Masa ayarı: hız bonusu ve yalnız-resimli bayrakları (aç/kapa). */
  setTableFlag(playerId: string, flag: "speedBonus" | "imageOnly", value: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.settingHostOnly");
    if (typeof value !== "boolean") throw new GameError("err.settingInvalid");
    if (this[flag] === value) return;
    this[flag] = value;
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  /** Soru yazarı turu: oyuncu lobide bir soru yazar; metin + 4 farklı şık + doğru şık.
   *  İkinci gönderim eskisinin üstüne yazar (düzeltme). */
  submitQuestion(playerId: string, q: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    const player = this.players.get(playerId);
    if (!player || player.isBot) throw new GameError("err.notAtTable");
    const text = typeof (q as { text?: unknown })?.text === "string" ? (q as { text: string }).text.trim() : "";
    const choices = Array.isArray((q as { choices?: unknown })?.choices) ? (q as { choices: unknown[] }).choices : [];
    const correctIndex = (q as { correctIndex?: unknown })?.correctIndex;
    if (text.length < 8 || text.length > 200
      || choices.length !== 4
      || choices.some((c) => typeof c !== "string" || !(c as string).trim() || (c as string).length > 80)
      || new Set(choices.map((c) => (c as string).trim().toLocaleLowerCase("tr"))).size !== 4
      || !Number.isInteger(correctIndex) || (correctIndex as number) < 0 || (correctIndex as number) > 3) {
      throw new GameError("err.questionInvalid");
    }
    this.writtenQuestions.set(playerId, {
      id: `written-${playerId}`,
      category: "community",
      text, textEn: text,
      choices: choices.map((c) => (c as string).trim()),
      choicesEn: choices.map((c) => (c as string).trim()),
      correctIndex: correctIndex as number,
      // Kalibre edilmemiş topluluk sorusu — zorluk bonusu vermesin.
      difficulty: "kolay",
    });
    this.broadcast();
  }

  /** Yazılan soruyu geri alır (yalnız lobi, yalnız kendi sorunu). */
  removeQuestion(playerId: string): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.writtenQuestions.delete(playerId)) this.broadcast();
  }

  /** Özel soru paketi ayarı: id ya da null (standart havuza dön). Yalnız host, lobide. */
  setPack(playerId: string, packId: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.packHostOnly");
    const next = packId === null ? null : typeof packId === "string" ? packId : undefined;
    if (next === undefined) throw new GameError("err.packUnknown");
    if (next !== null && !getPack(next)) throw new GameError("err.packUnknown");
    if (this.packId === next) return;
    this.packId = next;
    // Masa ayarı değişti; herkes tekrar onaylasın (kategori/sayı ile aynı kural).
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  setCategories(playerId: string, categories: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.categoryHostOnly");
    if (!Array.isArray(categories)) throw new GameError("err.categoryInvalid");
    const maxCategories = this.gameMode === "lightning" ? 1 : this.gameMode === "circle" ? 2 : 3;
    const next = [...new Set(categories.filter((value): value is string => typeof value === "string"))]
      .filter((name) => {
        if (!CATEGORY_NAMES.has(name)) return false;
        const category = CATEGORY_CATALOG.find((item) => item.name === name);
        return this.gameMode === "circle" ? !!category?.circleCount : !!category?.classicCount;
      })
      .slice(-maxCategories);
    if (next.join("|") === this.categorySelection.join("|")) return;
    this.categorySelection = next;
    // Seçim değiştiğinde herkes yeni masa ayarını görüp tekrar onay vermeli.
    for (const player of this.players.values()) if (!player.isBot) player.ready = false;
    this.broadcast();
  }

  start(requestedBy: string, gameMode: GameMode = "classic", options?: { daily?: boolean; completed?: (userId: string) => boolean }): void {
    // Lobiden ilk başlatma ya da podyumdan "tekrar oyna" — ikisi de yeni maç açar.
    if (this.phase !== "lobby" && this.phase !== "podium") throw new GameError("err.alreadyStarted");
    if (this.hostId !== requestedBy) throw new GameError("err.startHostOnly");
    const connectedPlayers = [...this.players.values()].filter((player) => player.connected);
    if (connectedPlayers.length < this.minPlayers) {
      throw new GameError("err.needPlayers", { count: this.minPlayers });
    }
    // Günlük: bugün tamamlayan oyuncu koltuktan inip izler; hiç katılımcı
    // kalmadıysa başlatmayı tamamen reddet (masa zaten bugünkünü oynadı).
    const daily = options?.daily === true;
    if (daily) {
      const done = connectedPlayers.filter((player) => !player.isBot && options.completed?.(player.id));
      // Katılımcı = oynayabilecek İNSAN. Masada yalnız bot + tamamlamış insan
      // kalırsa başlatma odayı sıfırlar (becomeSpectator -> handleNoPlayersLeft).
      const participants = connectedPlayers.filter((player) => !done.includes(player) && !player.isBot);
      if (!participants.length) throw new GameError("err.dailyDone");
      if (participants.length < this.minPlayers) throw new GameError("err.needPlayers", { count: this.minPlayers });
      for (const player of done) this.becomeSpectator(player.id);
    }
    // Günlükten sonra "Aynı masayla devam" masanın KENDİ moduna dönmeli.
    if (!daily && this.modeBeforeDaily) gameMode = this.modeBeforeDaily;
    const normalizedMode = daily ? "classic" : gameMode === "quiz" ? "classic" : gameMode;
    // Düello en az 2 koltuk ister; fazlası izler (state mutasyonundan önce).
    if (normalizedMode === "duel" && connectedPlayers.length < 2) {
      throw new GameError("err.needPlayers", { count: 2 });
    }
    if (normalizedMode === "team") {
      let hasTeamA = connectedPlayers.some((player) => player.team === 0);
      let hasTeamB = connectedPlayers.some((player) => player.team === 1);
      // Podium has no team editor. If departures emptied one side, a replay must
      // recover instead of trapping the new host: rebalance only the connected seats.
      if (this.phase === "podium" && connectedPlayers.length >= 2 && (!hasTeamA || !hasTeamB)) {
        connectedPlayers.sort((a, b) => a.seat - b.seat).forEach((player, index) => { player.team = index % 2; });
        hasTeamA = true;
        hasTeamB = true;
      }
      if (!hasTeamA || !hasTeamB) throw new GameError("err.teamNeedsBothSides");
    }
    // "Hazır" kapısı yalnızca lobinin kuralıdır. Podyumdan "tekrar oyna" masa
    // sahibinin kararıdır: aksi halde maç sırasında bağlantısı kopan (ready'si
    // sıfırlanan) bir oyuncu yüzünden masa kilitlenirdi — podyumda hazır
    // düğmesi olmadığı için o durumdan çıkış da yoktu.
    // Host başlatma düğmesine basarak zaten hazır olduğunu söylüyor; ondan ayrıca
    // "Hazırım" beklemek anlamsız bir ikinci tıktı. Sonuç ekranına hâlâ bakanlar
    // (inResults) da masayı kilitlemesin — "Aynı masayla devam" gibi maça alınırlar.
    if (this.phase === "lobby" && [...this.players.values()]
      .filter((player) => player.connected && player.id !== requestedBy && !this.inResults.has(player.id))
      .some((player) => !player.ready)) {
      throw new GameError("err.everyoneReady");
    }
    this.clearLastMatch();
    this.rescueRound = new Set();
    this.lightningBurn = 0;
    this.rematchVotes.clear();
    this.predictions.clear();
    this.modeBeforeDaily = daily ? (this.modeBeforeDaily ?? this.gameMode) : null;
    this.gameMode = normalizedMode;
    this.dailyMatch = daily;
    this.dailyDay = daily ? dailyDayNumber() : 0;
    this.dailyResults = new Map();
    this.xpGains = new Map();
    this.qIndex = 0;
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    this.momentsSnapshot = null;
    // Soru sayısı masa ayarıdır; Çember'de aynı alan tur sayısı olarak okunur.
    this.roundLimit = this.questionCount;
    const compatibleCategories = this.categorySelection.filter((name) => {
      const category = CATEGORY_CATALOG.find((item) => item.name === name);
      return this.gameMode === "circle" ? !!category?.circleCount : !!category?.classicCount;
    });
    if (this.categorySelection.length && !compatibleCategories.length) {
      throw new GameError("err.categoryEmpty");
    }
    // Tekrar önleme: görülenleri biriktir; bir alt-havuz (resimli/resimsiz)
    // dolduracak kadar görülmemiş soru kalmadıysa SADECE o alt-havuzun
    // geçmişini sıfırla (son maçı hariç tutarak) — diğer alt-havuzun tekrar
    // döngüsünü bozmadan. Böylece her iki havuz da kendi TAM turunu
    // dolaşmadan aynı soru gelmez (bkz. resetExhaustedSubpools).
    if (daily) {
      // Günlük set tarih tohumundan gelir: masa ayarındaki kategori/zorluk
      // filtresi uygulanmaz (aynı soru herkes için aynı). Sorular yine görülmüş
      // işaretlenir ki günlüğü oynayan normal maçta aynı soruları görmesin.
      this.questions = dailyQuestions();
      this.lastQuestionIds = new Set(this.questions.map((q) => q.id));
      this.questions.forEach((q) => this.seenQuestionIds.add(q.id));
    } else {
      this.seenQuestionIds = resetExhaustedSubpools(compatibleCategories, this.difficulty, this.seenQuestionIds, this.lastQuestionIds, this.roundLimit);
      // Özel paket seçiliyse (Çember ve Bulanık Resim hariç — çemberin kendi
      // prompt havuzu, bulanığın resimli-soru zorunluluğu var) sorular paketin
      // listesinden çekilir; kategori/zorluk filtreleri paket için uygulanmaz.
      const pack = this.packId && this.gameMode !== "circle" && this.gameMode !== "blur" && this.gameMode !== "word" && this.gameMode !== "timeline" && this.gameMode !== "board" ? getPack(this.packId) : null;
      if (this.packId && this.gameMode !== "circle" && this.gameMode !== "blur" && this.gameMode !== "word" && this.gameMode !== "timeline" && this.gameMode !== "board" && !pack) throw new GameError("err.packUnknown");
      if (pack && !pack.questions.length) throw new GameError("err.packEmpty");
      this.numericQuestions = this.gameMode === "numeric" ? sampleNumericQuestions(this.roundLimit, this.seenQuestionIds) : [];
      this.orderQuestions = this.gameMode === "timeline" ? sampleOrderQuestions(this.roundLimit, this.seenQuestionIds) : [];
      // Tavern Panosu: sorular hücrelerde oturur; questions dizisi boş kalır —
      // currentQuestion açık hücreden okur, buildReview açılış sırasını izler.
      if (this.gameMode === "board") {
        const spec = sampleBoardCells(compatibleCategories, this.seenQuestionIds, this.lastQuestionIds);
        this.boardCells = spec.cells.map((cell) => ({ ...cell, used: false }));
        this.boardCategories = spec.categories;
        this.boardAsked = [];
        this.currentCell = -1;
        this.boardPickerPos = 0;
        this.boardPickerOrder = this.eligiblePlayers().map((player) => player.id);
        if (!this.boardCells.length) throw new GameError("err.categoryEmpty");
      }
      this.questions = this.gameMode === "word" || this.gameMode === "numeric" || this.gameMode === "timeline" || this.gameMode === "board"
        ? []
        : pack
          ? samplePackQuestions(this.roundLimit, pack.questions, this.seenQuestionIds)
          : sampleQuestions(this.gameMode === "blitz" ? GAME.BLITZ_POOL : this.roundLimit, compatibleCategories, this.seenQuestionIds, this.difficulty, this.gameMode === "blur" || this.imageOnly);
      this.lastQuestionIds = new Set(this.questions.map((q) => q.id));
      this.questions.forEach((q) => this.seenQuestionIds.add(q.id));
      // Soru yazarı turu: oturan yazarların soruları rastgele soru slotlarına
      // karışır (yer değiştirir, toplam soru sayısı değişmez). Yazar kendi
      // turunda oynamaz — reveal'de yazara puan kazananların ortalaması yazılır.
      if (WRITTEN_MODES.has(this.gameMode) && this.writtenQuestions.size) {
        const pool = [...this.players.keys()]
          .filter((id) => this.writtenQuestions.has(id))
          .map((id) => this.writtenQuestions.get(id)!);
        const count = Math.min(GAME.WRITTEN_PER_MATCH, this.roundLimit, pool.length);
        if (count > 0) {
          const slots = shuffleIdx(this.roundLimit).slice(0, count);
          shuffleIdx(pool.length).slice(0, count).forEach((poolIdx, i) => {
            // Şık sırası da karışır — yazan "doğru hep ilk sırada" diye
            // arkadaşına pozisyonla cevabı işaret edemesin.
            this.questions[slots[i]] = shuffleChoices(pool[poolIdx]);
          });
        }
      }
    }

    // Dar havuz benzersiz çekildi -> istenen sayıdan az olabilir. Klasik round.total
    // ve maç-sonu GERÇEK soru sayısını yansıtsın (çemberdeki circlePrompts.length gibi).
    if (this.gameMode !== "circle" && this.gameMode !== "word") this.roundLimit =
      this.gameMode === "numeric" ? this.numericQuestions.length
      : this.gameMode === "timeline" ? this.orderQuestions.length
      : this.gameMode === "board" ? this.boardCells.length
      : this.questions.length;

    if (this.gameMode === "circle") {
      const unseenC = circlePoolKeys(compatibleCategories, this.difficulty).filter((k) => !this.seenCirclePromptKeys.has(k)).length;
      if (unseenC < this.roundLimit) this.seenCirclePromptKeys = new Set(this.lastCirclePromptKeys);
      this.circlePrompts = sampleCirclePrompts(this.roundLimit, compatibleCategories, this.seenCirclePromptKeys, this.difficulty);
      this.lastCirclePromptKeys = new Set(this.circlePrompts.map((p) => `${p.category}|${p.answer}`));
      this.circlePrompts.forEach((p) => this.seenCirclePromptKeys.add(`${p.category}|${p.answer}`));
      this.wordPrompts = [];
    } else if (this.gameMode === "word") {
      this.circlePrompts = [];
      // Havuz Çember'le aynı seen-set'ini paylaşır: bir modda görülen prompt
      // diğerinde de tekrar etmez (masa hangi modda olursa olsun taze içerik).
      const unseenW = wordPoolKeys(compatibleCategories, this.difficulty).filter((k) => !this.seenCirclePromptKeys.has(k)).length;
      if (unseenW < GAME.WORD_ROUNDS) this.seenCirclePromptKeys = new Set(this.lastCirclePromptKeys);
      this.wordPrompts = sampleWordPrompts(compatibleCategories, this.seenCirclePromptKeys, this.difficulty);
      this.lastCirclePromptKeys = new Set(this.wordPrompts.map((p) => `${p.category}|${p.answer}`));
      this.wordPrompts.forEach((p) => this.seenCirclePromptKeys.add(`${p.category}|${p.answer}`));
      this.roundLimit = this.wordPrompts.length;
      this.wordPoolMs = GAME.WORD_POOL_MS; // yeni maç = dolu havuz
    } else {
      this.circlePrompts = [];
      this.wordPrompts = [];
    }
    for (const player of this.players.values()) {
      // Çifte Bahis'te skor = bankroll: herkes eşit parayla başlar (0 değil).
      player.score = this.gameMode === "bet" ? GAME.BET_STARTING_BANKROLL : 0;
      player.choice = null;
      player.answeredAt = null;
      player.circleAnswer = null;
      player.circleCorrectAt = null;
      player.bet = null;
      player.wordGain = 0;
      player.lives = this.gameMode === "elim" ? GAME.ELIM_LIVES : 0;
      // Tavern kartları: Klasik/Takım maçında herkes 1 jokerle başlar;
      // diğer modlarda kart mekaniği yok (sıfırda kalır, kazanılamaz da).
      player.cards = this.gameMode === "classic" || this.gameMode === "team" ? 1 : 0;
      player.cardUsed = null;
      player.fiftyRemoved = [];
      player.frozen = false;
      player.eligibleFrom = 0;
      player.stats = emptyStats();
      player.answers = [];
      player.typed = [];
      player.orderAnswers = [];
    }
    // Düello (§6.1): masadaki ilk iki oyuncu kapışır; fazlası izleyici olur —
    // oturma sırası karar verir, ayrılanların yerine yeni düellocu çekilmez.
    if (this.gameMode === "duel") {
      const bySeat = [...this.players.values()].sort((a, b) => a.seat - b.seat);
      for (const watcher of bySeat.slice(2)) watcher.eligibleFrom = this.roundLimit;
    }
    this.beginCountdown();
  }

  answer(playerId: string, choice: number): void {
    if (!CHOICE_MODES.has(this.gameMode) || this.phase !== "question" || !Number.isInteger(choice) || choice < 0 || choice > (this.gameMode === "blitz" ? 1 : 3)) return;
    // Karar deadline'a göre: timer gecikmiş olsa bile süre dolduysa cevap yerine reveal işler.
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    if (!player || player.eligibleFrom > this.qIndex || player.choice !== null) return;
    if (this.gameMode === "zil") return this.zilAnswer(playerId, choice, player);
    if (this.gameMode === "blitz") return this.blitzAnswer(playerId, choice, player);
    // Soru yazarı turu: yazar kendi sorusunda oynamaz.
    if (this.currentQuestion()?.id === `written-${playerId}`) return;
    // Dondur jokeri: yiyen oyuncunun süresi genel deadline'dan önce dolar.
    if (Date.now() >= this.deadlineFor(player)) return;
    if (this.gameMode === "elim" && player.lives <= 0) return;
    if (player.fiftyRemoved.includes(choice)) return; // %50 ile silinmiş şık seçilemez
    player.choice = choice;
    player.answeredAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    this.revealIfEveryoneAnswered();
  }

  answerCircle(playerId: string, answer: string): void {
    if (this.gameMode !== "circle" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    const prompt = this.currentCirclePrompt();
    const clean = answer.trim().slice(0, 48);
    if (!player || !prompt || player.eligibleFrom > this.qIndex || player.circleAnswer !== null || !clean) return;
    player.circleAnswer = clean;
    if (matchesCircleAnswer(prompt, clean)) player.circleCorrectAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    // İlk doğru cevap turu bitirmez; tüm oyuncular kilitlediğinde veya süre dolunca reveal yapılır.
    this.revealIfEveryoneAnswered();
  }

  /**
   * Kelime Oyunu cevabı. Çember'le aynı matcher'ı kullanır; doğru cevaplayan
   * O ANKİ değeri (gizli harf × 100) dondurur — sonradan harf açılsa bile
   * erken cevaplayan yüksek değerini korur.
   */
  wordAnswer(playerId: string, answer: string): void {
    if (this.gameMode !== "word" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    const prompt = this.currentWordPrompt();
    const clean = answer.trim().slice(0, 48);
    if (!player || !prompt || player.eligibleFrom > this.qIndex || player.circleAnswer !== null || !clean) return;
    player.circleAnswer = clean;
    if (matchesCircleAnswer(prompt, clean)) {
      player.circleCorrectAt = Date.now();
      player.wordGain = Math.max(0, prompt.answer.length - this.wordLettersRevealed) * GAME.WORD_LETTER_POINTS;
    }
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    this.revealIfEveryoneAnswered();
  }

  /**
   * "Harf al": rastgele sıradaki bir sonraki harfi HERKES için açar ve soru
   *  değerini 100 düşürür. Son harf açılmaz (tüm kelime bedavaya gelmez).
   */
  wordLetter(playerId: string): void {
    if (this.gameMode !== "word" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    const prompt = this.currentWordPrompt();
    if (!player || !prompt || player.eligibleFrom > this.qIndex) return;
    if (this.wordLettersRevealed >= prompt.answer.length - 1) return;
    this.wordLettersRevealed += 1;
    this.broadcast();
  }

  addBot(name: string): void {
    if (this.players.size >= GAME.MAX_PLAYERS) throw new GameError("err.roomFull");
    const id = `bot:${crypto.randomUUID()}`;
    this.addPlayer({ id, name, avatarUrl: null, socketId: null, isBot: true });
  }

  currentQuestion(): Question | null {
    if (this.gameMode === "board") return this.currentCell >= 0 ? this.boardCells[this.currentCell]?.question ?? null : null;
    return this.gameMode !== "circle" && this.gameMode !== "word" && this.qIndex < this.roundLimit ? this.questions[this.qIndex] ?? null : null;
  }

  currentCirclePrompt(): CirclePrompt | null {
    return this.gameMode === "circle" ? this.circlePrompts[this.qIndex] ?? null : null;
  }

  currentWordPrompt(): CirclePrompt | null {
    return this.gameMode === "word" ? this.wordPrompts[this.qIndex] ?? null : null;
  }

  /** Yakın Tahmin: turun sayı sorusu (mod dışında null). */
  currentNumeric(): NumericQuestion | null {
    return this.gameMode === "numeric" ? this.numericQuestions[this.qIndex] ?? null : null;
  }

  /** Zaman Çizelgesi: turun sıralama sorusu (mod dışında null). */
  currentOrder(): OrderQuestion | null {
    return this.gameMode === "timeline" ? this.orderQuestions[this.qIndex] ?? null : null;
  }

  /** Zaman Çizelgesi: doğru kronolojik dizim (events indeksleri, eski→yeni). */
  orderSolution(): number[] | null {
    const q = this.currentOrder();
    return q ? q.events.map((_, i) => i).sort((a, b) => q.events[a].year - q.events[b].year) : null;
  }

  /**
   * D/Y Blitz: oyuncuya sıradaki ifadeyi atar. Havuz tükenirse null — oyuncu
   * pencerenin kalanında yalnız izler (nadir: 30'luk havuz 60 sn'de biter).
   */
  private blitzAssign(player: RoomPlayer) {
    const q = this.questions[player.blitzIdx];
    if (!q) { player.blitzClaim = null; return; }
    const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex);
    const idx = Math.random() < 0.5 ? q.correctIndex : wrong[Math.floor(Math.random() * wrong.length)];
    player.blitzClaim = { truth: idx === q.correctIndex, claim: q.choices[idx], ...(q.choicesEn ? { claimEn: q.choicesEn[idx] } : {}), text: q.text, textEn: q.textEn, category: q.category };
  }

  /**
   * D/Y Blitz cevabı (§6.1): choice 0=Doğru 1=Yanlış. Doğru seriyi büyütür ve
   * seri basamaklı kazanç yazar; yanlış seriyi sıfırlar. Ardından oyuncu kendi
   * akışında bir sonraki ifadeye geçer — tur sonu herkes için aynı penceredir.
   */
  private blitzAnswer(playerId: string, choice: number, player: RoomPlayer) {
    const claim = player.blitzClaim;
    if (!claim) return;
    const right = (choice === 0) === claim.truth;
    player.blitzAnswered++;
    if (right) {
      player.blitzStreak++;
      const gain = GAME.BLITZ_BASE + GAME.BLITZ_STREAK_STEP * Math.min(player.blitzStreak - 1, GAME.BLITZ_STREAK_CAP);
      player.score += gain;
      player.blitzScore += gain;
      player.blitzCorrect++;
      if (gain > player.stats.maxGain) player.stats.maxGain = gain;
      if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    } else {
      player.blitzStreak = 0;
    }
    player.blitzTrail.push({ text: claim.text, textEn: claim.textEn, claim: claim.claim, claimEn: claim.claimEn, truth: claim.truth, choice });
    this.recordStat(player, right, claim.category, right ? Date.now() - this.questionStartedAt : null);
    player.blitzIdx++;
    this.blitzAssign(player);
    this.broadcast();
  }

  /** D/Y Blitz kapanışı: canlı akışlar donar, skor sıralı özet taşınır. */
  private revealBlitz() {
    if (this.phase !== "question") return;
    this.clearTimer();
    this.clearBotTimers();
    for (const player of this.players.values()) player.blitzClaim = null;
    const rows = [...this.players.values()]
      .filter((p) => p.eligibleFrom <= this.qIndex)
      .map((p) => ({ id: p.id, score: p.blitzScore, correct: p.blitzCorrect, answered: p.blitzAnswered }))
      .sort((a, b) => b.score - a.score || b.correct - a.correct);
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    this.lastReveal = { correctIndex: -1, picks: [[], [], [], []], gains: Object.fromEntries(rows.map((r) => [r.id, r.score])), until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.lastBlitzSummary = { rows, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
  }

  /** Oyuncuya giden toast: socket katmanına index.ts köprüler. */
  setToastHandler(handler: (playerId: string, key: ToastKey) => void) {
    this.onToast = handler;
  }

  setQuestionStartedHandler(handler: QuestionStarted) {
    this.onQuestionStarted = handler;
  }

  /** Kalıcı ilerleme deposunu bağlar; null geçilirse özellik kapanır. */
  setProgressStore(store: ProgressStore | null) {
    this.progress = store;
  }

  stateFor(youId: string, devMode: boolean): GameState {
    const self = this.players.get(youId);
    const question = this.currentQuestion();
    const circlePrompt = this.currentCirclePrompt();
    const wordPrompt = this.currentWordPrompt();
    const numericPrompt = this.currentNumeric();
    const inQuestion = this.phase === "question" && question && this.gameMode !== "blitz" && this.gameMode !== "timeline";
    const inCircle = this.phase === "question" && circlePrompt;
    const inWord = this.phase === "question" && wordPrompt;
    const inNumeric = this.phase === "question" && numericPrompt;
    const writerId = question && question.id.startsWith("written-") ? question.id.slice(8) : null;
    const questionPayload: QuestionPayload | null = inQuestion
      ? {
          category: question.category,
          text: question.text,
          choices: question.choices,
          textEn: question.textEn,
          choicesEn: question.choicesEn,
          // Dondur jokeri yiyen oyuncuya kişisel (kısaltılmış) deadline gider;
          // diğer herkes genel deadline'ı görür.
          deadline: self ? this.deadlineFor(self) : this.questionDeadline,
          durationMs: this.questionDuration(),
          ...(question.image ? { image: question.image } : {}),
          ...(question.imageCredit ? { imageCredit: question.imageCredit } : {}),
          ...(writerId ? { writtenByName: this.players.get(writerId)?.name ?? null, writtenByYou: writerId === youId } : {}),
        }
      : null;
    const circle: CirclePayload | null = inCircle
      ? {
          letter: circlePrompt.letter, clue: circlePrompt.clue, category: circlePrompt.category, deadline: this.questionDeadline, durationMs: GAME.CIRCLE_QUESTION_MS,
          ...(circlePrompt.clueEn && circlePrompt.letterEn ? { letterEn: circlePrompt.letterEn, clueEn: circlePrompt.clueEn } : {}),
        }
      : null;
    // Kelime Oyunu: harf maske sunucuda üretilir — istemci ham cevabı hiç görmez.
    // Maske her iki dil için aynı POZİSYONU açar (cevap uzunlukları farklıysa
    // EN maskesi kendi sınırında kırpılır). Değer ve havuz anlık hesaplanır.
    const openSet = new Set(this.wordOrder.slice(0, this.wordLettersRevealed));
    const maskOf = (a?: string) => a ? [...a].map((ch, i) => (openSet.has(i) && i < a.length ? ch : null)) : [];
    const word: WordPayload | null = inWord
      ? {
          letters: maskOf(wordPrompt.answer),
          ...(wordPrompt.answerEn ? { lettersEn: maskOf(wordPrompt.answerEn) } : {}),
          clue: wordPrompt.clue,
          ...(wordPrompt.clueEn ? { clueEn: wordPrompt.clueEn } : {}),
          category: wordPrompt.category,
          value: Math.max(0, wordPrompt.answer.length - this.wordLettersRevealed) * GAME.WORD_LETTER_POINTS,
          poolMs: Math.max(0, this.wordPoolMs - (Date.now() - this.wordRoundStartedAt)),
          deadline: this.questionDeadline,
          durationMs: GAME.WORD_ROUND_MS,
        }
      : null;
    // Yakın Tahmin: doğru sayı sunucuda kalır — payload yalnız birim + süre taşır.
    const numeric: NumericQuestionPayload | null = inNumeric
      ? {
          category: numericPrompt.category, text: numericPrompt.text, textEn: numericPrompt.textEn,
          unit: numericPrompt.unit, unitEn: numericPrompt.unitEn,
          deadline: this.questionDeadline, durationMs: this.questionDuration(),
        }
      : null;
    // D/Y Blitz: KİŞİSEL canlı durum — herkesin ifadesi farklıdır; truth
    // istemciye hiç çıkmaz. Reveal'da akış donar, özet blitzSummary'de gider.
    const selfBlitz = self ?? null;
    const blitz: BlitzLivePayload | null = this.gameMode === "blitz" && this.phase === "question"
      ? {
          deadline: this.questionDeadline, durationMs: GAME.BLITZ_TOTAL_MS,
          statement: selfBlitz?.blitzClaim
            ? { text: selfBlitz.blitzClaim.text, textEn: selfBlitz.blitzClaim.textEn, claim: selfBlitz.blitzClaim.claim, claimEn: selfBlitz.blitzClaim.claimEn, category: selfBlitz.blitzClaim.category }
            : null,
          index: selfBlitz?.blitzIdx ?? 0,
          correct: selfBlitz?.blitzCorrect ?? 0,
          streak: selfBlitz?.blitzStreak ?? 0,
        }
      : null;
    const blitzSummary: BlitzSummaryPayload | null = this.gameMode === "blitz" && this.phase === "reveal" ? this.lastBlitzSummary : null;
    // Zaman Çizelgesi: karışık dizilim (yıllar gizli) soru+reveal fazında;
    // çözüm timelineReveal'da yıllarıyla açılır.
    const orderPrompt = this.currentOrder();
    const timeline: TimelineQuestionPayload | null = this.gameMode === "timeline" && (this.phase === "question" || this.phase === "reveal") && orderPrompt
      ? {
          category: orderPrompt.category, text: orderPrompt.text, textEn: orderPrompt.textEn,
          items: this.orderShuffle.map((i) => orderPrompt.events[i].label),
          itemsEn: orderPrompt.events.every((e) => e.labelEn) ? this.orderShuffle.map((i) => orderPrompt.events[i].labelEn) : undefined,
          orderIdx: this.orderShuffle,
          deadline: this.questionDeadline, durationMs: GAME.TIMELINE_MS,
        }
      : null;
    const timelineReveal: TimelineRevealPayload | null = this.gameMode === "timeline" && this.phase === "reveal" ? this.lastTimelineReveal : null;
    const countdown: CountdownPayload | null = this.phase === "countdown"
      ? { deadline: this.countdownDeadline, durationMs: GAME.COUNTDOWN_MS }
      : null;
    // Çifte Bahis bahis fazı: yalnız kategori + oyuncunun bankrolü sızar; soru gizli.
    const self0 = this.players.get(youId);
    const bet: BetPayload | null = this.phase === "bet" && question
      ? { category: question.category, bankroll: Math.max(0, self0?.score ?? 0), deadline: this.betDeadline, durationMs: GAME.BET_MS, broke: this.rescueRound.has(youId), brokeReward: GAME.BET_BROKE_REWARD, ...(this.qIndex === this.roundLimit - 1 ? { final: true } : {}) }
      : null;
    // Tavern Panosu: pick fazında pano — yalnız değer+kullanılmışlık (soru sızıntısı yok).
    const pickerId = this.boardPickerId();
    const board: BoardPayload | null = this.gameMode === "board" && this.phase === "pick"
      ? {
          categories: this.boardCategories,
          cells: this.boardCells.map((cell) => ({ value: cell.value, used: cell.used })),
          pickerId,
          pickerName: (pickerId && this.players.get(pickerId)?.name) || "",
          deadline: this.pickDeadline,
          durationMs: GAME.PICK_MS,
        }
      : null;
    const podium: PodiumEntry[] | null = this.phase === "podium"
      ? this.podiumSnapshot ?? this.snapshotPodium()
      : null;
    // Maç bitince dondurulan özet önceliklidir: podyumda masadan çıkıp geri
    // dönen oyuncunun kaydı yenilense de kendi sonucunu görmeye devam eder.
    const matchSummary: MatchSummary | null = this.phase === "podium"
      ? this.frozenSummaries.get(youId) ?? (self ? this.summaryFor(self) : null)
      : null;
    const moments = this.phase === "podium" ? this.momentsSnapshot : null;
    const meta = this.lastMatchMeta;
    const lastMatch: LastMatch | null = this.phase === "lobby" && meta && this.inResults.has(youId)
      ? {
          id: meta.id,
          gameMode: meta.gameMode,
          roundTotal: meta.roundTotal,
          teamScores: meta.teamScores,
          podium: meta.podium,
          matchSummary: this.frozenSummaries.get(youId) ?? null,
          moments: meta.moments,
          xpGains: meta.xpGains,
          daily: meta.dailyDay !== null ? { day: meta.dailyDay, pattern: this.frozenDaily.get(youId) ?? null } : null,
        }
      : null;
    return {
      phase: this.phase,
      gameMode: this.gameMode,
      roomId: this.id,
      hostId: this.hostId,
      youId,
      players: this.sortedPlayers().map((player) => this.publicPlayer(player)),
      teamScores: this.teamScores,
      round: { index: this.qIndex, total: this.gameMode === "circle" ? this.circlePrompts.length : this.roundLimit },
      question: questionPayload,
      circle,
      countdown,
      bet,
      yourBet: self?.bet ?? null,
      yourChoice: self?.choice ?? null,
      yourCircleAnswer: self?.circleAnswer ?? null,
      yourWordAnswer: this.gameMode === "word" ? self?.circleAnswer ?? null : null,
      yourCards: self?.cards ?? 0,
      yourCardUsed: self?.cardUsed ?? null,
      removedChoices: self?.fiftyRemoved ?? [],
      youFrozen: self?.frozen ?? false,
      reveal: this.phase === "reveal" ? this.lastReveal : null,
      circleReveal: this.phase === "reveal" ? this.lastCircleReveal : null,
      wordReveal: this.phase === "reveal" ? this.lastWordReveal : null,
      word,
      numeric,
      blitz,
      blitzSummary,
      timeline,
      timelineReveal,
      yourNumericGuess: this.numericGuesses.get(youId) ?? null,
      yourOrder: this.orderGuesses.get(youId) ?? null,
      board,
      podium,
      matchSummary,
      moments,
      lastMatch,
      lastMatchId: this.phase === "podium" && meta ? meta.id : null,
      daily: this.dailyMatch ? { day: this.dailyDay, pattern: this.dailyResults.get(youId) ?? null } : null,
      // Bahis fazında "kilitleyen" = bahsini yatıran; diğer fazlarda = cevaplayan.
      answeredCount: this.eligiblePlayers().filter((player) => this.phase === "bet" ? player.bet !== null : this.hasAnswered(player)).length,
      eligibleCount: this.eligiblePlayers().length,
      firstAnswerId: this.firstAnswerId,
      youAreSpectator: this.spectators.has(youId),
      spectatorCount: this.spectators.size,
      rematch: this.phase === "podium"
        ? { votes: this.rematchVotes.size, needed: this.rematchNeeded(), youVoted: this.rematchVotes.has(youId) }
        : null,
      writers: [...this.writtenQuestions.keys()],
      yourPrediction: this.predictions.get(youId) ?? null,
      predictOpen: this.predictOpen(),
      zil: this.gameMode === "zil" ? { winnerId: this.buzzWinnerId, failedIds: [...this.buzzFailed] } : null,
      minPlayers: this.minPlayers,
      questionCount: this.questionCount,
      difficulty: this.difficulty,
      tableTheme: this.tableTheme,
      questionTimeMs: this.questionTimeMs,
      speedBonus: this.speedBonus,
      imageOnly: this.imageOnly,
      categorySelection: this.categorySelection,
      pack: this.packId ? { id: this.packId, name: getPack(this.packId)?.name ?? this.packId } : null,
      availableCategories: CATEGORY_CATALOG,
      devMode,
      progress: this.progress?.snapshot(youId) ?? null,
      xpGains: this.phase === "podium" && this.progress && this.xpGains.size
        ? Object.fromEntries(this.xpGains)
        : null,
      seasonBoard: this.progress?.seasonBoard(5) ?? null,
      weeklyBoard: this.progress?.weeklyBoard(5) ?? null,
      dailyBoard: this.dailyBoardProvider?.(youId) ?? null,
      serverNow: Date.now(),
    };
  }

  private beginQuestion() {
    const round = this.gameMode === "circle" ? this.currentCirclePrompt() : this.gameMode === "word" ? this.currentWordPrompt() : this.gameMode === "numeric" ? this.currentNumeric() : this.gameMode === "timeline" ? this.currentOrder() : this.currentQuestion();
    if (!round) return this.finish();
    this.clearTimer();
    this.clearBotTimers();
    this.phase = "question";
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.lastNumericReveal = null;
    this.lastTimelineReveal = null;
    // Yakın Tahmin: yeni turda tahminler sıfırlanır.
    this.numericGuesses.clear();
    // Zaman Çizelgesi: yeni turda dizimler sıfırlanır — yoksa 2. turdan
    // itibaren order() hepsini "zaten cevapladı" sanıp yutar.
    this.orderGuesses.clear();
    this.lastBlitzSummary = null;
    // Kelime Oyunu: yeni tur kapalı kelimeyle başlar; harfler karışık sırada açılır.
    if (this.gameMode === "word" && round) {
      this.wordLettersRevealed = 0;
      const wordRound = round as CirclePrompt;
      this.wordOrder = Array.from({ length: wordRound.answer.length }, (_, i) => i);
      for (let i = this.wordOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.wordOrder[i], this.wordOrder[j]] = [this.wordOrder[j], this.wordOrder[i]];
      }
      this.wordRoundStartedAt = this.questionStartedAt = Date.now();
    }
    // Zaman Çizelgesi (§6.1): 4 olay karışık dizilir; yıllar istemciye sızmadan
    // gizli kalır — doğru sıra reveal'da yıllarıyla açılır, her doğru pozisyon puan.
    if (this.gameMode === "timeline") {
      const q = round as OrderQuestion | null;
      if (q) this.orderShuffle = shuffleIdx(q.events.length);
    }
    this.questionStartedAt = Date.now();
    this.firstAnswerId = null; // yeni tur: en hızlı parmak yeniden yarışır
    this.buzzWinnerId = null; // yeni tur: zil yeniden açık
    this.buzzFailed.clear();
    this.buzzAttempts = 0;
    // D/Y Blitz (§6.1): tek 60 sn'lik pencere; herkes kendi ifade akışında
    // bağımsız ilerler — ortak tur sırası yok, seri çarpanıyla puanlanır.
    if (this.gameMode === "blitz") {
      for (const player of this.players.values()) {
        player.blitzIdx = 0;
        player.blitzStreak = 0;
        player.blitzCorrect = 0;
        player.blitzAnswered = 0;
        player.blitzScore = 0;
        player.blitzTrail = [];
        player.blitzClaim = null;
        if (player.eligibleFrom <= this.qIndex && player.connected) this.blitzAssign(player);
      }
    }
    const duration = this.questionDuration();
    this.questionDeadline = this.questionStartedAt + duration;
    for (const player of this.players.values()) {
      player.choice = null;
      player.answeredAt = null;
      player.circleAnswer = null;
      player.circleCorrectAt = null;
      // Jokerler tur başına bir: önceki turun etkileri burada sıfırlanır.
      player.cardUsed = null;
      player.fiftyRemoved = [];
      player.frozen = false;
    }
    this.broadcast();
    this.onQuestionStarted?.(this);
    if (this.gameMode === "zil") this.scheduleZilBots();
    this.timer = setTimeout(() => this.reveal(), duration);
  }

  /** Tüm istemcilere tek bir deadline gönderir; animasyon yerelde aksa bile tur eşzamanlı başlar. */
  private beginCountdown() {
    this.clearTimer();
    this.phase = "countdown";
    this.countdownDeadline = Date.now() + GAME.COUNTDOWN_MS;
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.broadcast();
    this.timer = setTimeout(() => {
      if (this.phase !== "countdown") return;
      // Çifte Bahis: sorudan önce bahis fazı gelir; diğer modlar doğrudan soruya.
      this.gameMode === "bet" ? this.beginBet() : this.gameMode === "board" ? this.beginPick() : this.beginQuestion();
    }, GAME.COUNTDOWN_MS);
  }

  /**
   * Çifte Bahis: soru açılmadan önceki bahis fazı. Oyuncu yalnız kategoriyi görür
   * (soru metni/şıkları sızmaz — stateFor bet fazında question payload üretmez) ve
   * bankrolünden bir tutar kilitler. Süre dolunca ya da herkes yatırınca soruya geçer.
   */
  private beginBet() {
    const question = this.currentQuestion();
    if (!question) return this.finish();
    this.clearTimer();
    this.phase = "bet";
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.betDeadline = Date.now() + GAME.BET_MS;
    this.rescueRound = new Set();
    for (const player of this.eligiblePlayers()) {
      player.bet = null;
      // Parası bitmiş oyuncu bahis yapamaz: bahsi 0'a kilitlenir, doğru cevap
      // GAME.BET_BROKE_REWARD kazandırır. Masa onu 9 sn beklemez.
      if (player.score <= 0) {
        player.bet = 0;
        this.rescueRound.add(player.id);
      }
    }
    // Botlar hemen yatırır: bankrollerinin rastgele bir dilimini (¼–hepsi arası).
    for (const player of this.eligiblePlayers()) {
      if (!player.isBot || this.rescueRound.has(player.id)) continue;
      const fraction = 0.25 + Math.random() * 0.75;
      player.bet = Math.max(0, Math.min(player.score, Math.round(player.score * fraction)));
    }
    this.broadcast();
    // Herkes zaten kilitliyse (ör. tüm masa kurtarma turunda) bekletmeden soruya geç.
    this.advanceIfEveryoneBet();
    if (this.phase !== "bet") return;
    this.timer = setTimeout(() => {
      if (this.phase !== "bet") return;
      this.beginQuestion();
    }, GAME.BET_MS);
  }

  /** Çifte Bahis: oyuncu bu tur bahsini kilitler (0..bankroll). */
  placeBet(playerId: string, amount: number): void {
    if (this.gameMode !== "bet" || this.phase !== "bet") return;
    if (Date.now() >= this.betDeadline) return; // süre doldu; timer soruya geçirecek
    const player = this.players.get(playerId);
    if (!player || player.eligibleFrom > this.qIndex || player.bet !== null) return;
    if (!Number.isFinite(amount)) return;
    player.bet = Math.max(0, Math.min(Math.round(amount), Math.max(0, player.score)));
    this.broadcast();
    this.advanceIfEveryoneBet();
  }

  /** Bağlı herkes bahsini kilitlediyse süre sonunu beklemeden soruya geç. */
  private advanceIfEveryoneBet() {
    if (this.phase !== "bet") return;
    const waiting = this.eligiblePlayers().filter((player) => player.connected);
    if (waiting.length && waiting.every((player) => player.bet !== null)) this.beginQuestion();
  }

  /** Tavern Panosu: bu turda hücre seçecek oyuncu (dönüşümlü sıra). */
  private boardPickerId(): string | null {
    return this.boardPickerOrder.length ? this.boardPickerOrder[this.boardPickerPos % this.boardPickerOrder.length] : null;
  }

  /** Tavern Panosu pick fazı: sırası gelen hücre seçer; süre dolunca sunucu
   *  rastgele kalan hücreyi açar (bot ya da pasif oyuncu maçı kilitlemesin). */
  private beginPick() {
    // Tamamen ayrılan seçicinin sırası kalıcı kaybedilir — yoksa o slot her
    // turda PICK_MS kadar boşa bekletir. Kopan ama masada kalan (grace'teki)
    // oyuncu atlanmaz: süre yeniden bağlanma penceresi olarak da çalışır.
    let guard = 0;
    while (guard++ < this.boardPickerOrder.length && !this.players.has(this.boardPickerId()!)) this.boardPickerPos += 1;
    if (!this.boardCells.some((cell) => !cell.used)) return this.finish();
    this.clearTimer();
    this.phase = "pick";
    this.lastReveal = null;
    this.pickDeadline = Date.now() + GAME.PICK_MS;
    this.broadcast();
    // Sıradaki botsa kendi hücresini seçer (1–3 sn); pasif insan için süre
    // sonunda sunucu rastgele açar — pick fazı maçı asla kilitlemez.
    const picker = this.boardPickerId();
    if (picker && this.players.get(picker)?.isBot) {
      this.scheduleBotTask(() => {
        if (this.phase !== "pick") return;
        const open = this.boardCells.map((cell, i) => (!cell.used ? i : -1)).filter((i) => i >= 0);
        if (open.length) this.openCell(open[Math.floor(Math.random() * open.length)]);
      }, 1_000 + Math.random() * 2_000);
    }
    this.timer = setTimeout(() => {
      if (this.phase !== "pick") return;
      // Sıradaki pasif kalırsa masa beklemez: kalan hücrelerden biri rastgele açılır.
      const open = this.boardCells.map((cell, i) => (!cell.used ? i : -1)).filter((i) => i >= 0);
      if (open.length) this.openCell(open[Math.floor(Math.random() * open.length)]);
    }, GAME.PICK_MS);
  }

  /** Tavern Panosu: yalnız sırası gelen oyuncu, açık bir hücreyi seçebilir. */
  pickCell(playerId: string, cell: number): void {
    if (this.gameMode !== "board" || this.phase !== "pick") return;
    if (this.boardPickerId() !== playerId) return;
    if (!Number.isInteger(cell) || cell < 0 || cell >= this.boardCells.length) return;
    if (this.boardCells[cell].used) return;
    this.openCell(cell);
  }

  /** Hücreyi açıp soruya geçer: açılan hücrenin sorusu currentQuestion üzerinden
   *  question payload'ına düşer; seçim sırası bir sonraki oyuncuya geçer. */
  private openCell(cell: number) {
    const entry = this.boardCells[cell];
    if (!entry || entry.used) return;
    entry.used = true;
    this.currentCell = cell;
    this.boardAsked.push(entry.question);
    this.boardPickerPos += 1;
    this.beginQuestion();
  }

  /** Bir turun sonucunu oyuncunun maç istatistiğine işler (4d özet kartı). */
  private recordStat(player: RoomPlayer, correct: boolean, category: string, correctElapsedMs: number | null, preserveStreak = false): void {
    const s = player.stats;
    s.total += 1;
    const cat = s.perCategory.get(category) ?? { correct: 0, total: 0 };
    cat.total += 1;
    if (correct) {
      s.correct += 1;
      cat.correct += 1;
      s.currentStreak += 1;
      if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
      if (correctElapsedMs !== null) s.fastestMs = s.fastestMs === null ? correctElapsedMs : Math.min(s.fastestMs, correctElapsedMs);
      // Tavern kartları: her 3'lü seride 1 joker (yalnız Klasik/Takım).
      if ((this.gameMode === "classic" || this.gameMode === "team") && s.currentStreak % 3 === 0) {
        player.cards += 1;
        this.onToast?.(player.id, "info.cardEarned");
      }
    } else if (!preserveStreak) {
      s.currentStreak = 0;
    }
    s.perCategory.set(category, cat);
  }

  /** Oyuncunun bu turdaki cevap deadline'ı — dondur jokeri yiyende kısalır. */
  private deadlineFor(player: RoomPlayer): number {
    return this.questionDeadline - (player.frozen ? GAME.CARD_FREEZE_MS : 0);
  }

  /**
   * Tavern kartı (joker) kullanımı. Klasik/Takım, soru fazında, cevaptan önce,
   * tur başına bir. Sunucu doğrular; etkiler tur sonuna kadar saklanır.
   */
  useCard(playerId: string, type: CardType, targetId?: string): void {
    if (this.gameMode !== "classic" && this.gameMode !== "team") throw new GameError("err.cardMode");
    if (this.phase !== "question") throw new GameError("err.cardPhase");
    const player = this.players.get(playerId);
    const question = this.currentQuestion();
    if (!player || !question || player.eligibleFrom > this.qIndex) return;
    if (player.choice !== null) throw new GameError("err.cardLate");
    if (player.cardUsed !== null) throw new GameError("err.cardUsed");
    if (player.cards <= 0) throw new GameError("err.cardEmpty");
    if (type === "fifty") {
      // Yanlış iki şık oyuncu için silinir — indeksler yalnız kendi payload'ında görünür.
      const wrong = [0, 1, 2, 3].filter((index) => index !== question.correctIndex);
      for (let i = wrong.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
      }
      player.fiftyRemoved = wrong.slice(0, 2);
    } else if (type === "freeze") {
      const target = targetId ? this.players.get(targetId) : null;
      if (!target || target.id === playerId || target.eligibleFrom > this.qIndex || !target.connected || target.choice !== null) {
        throw new GameError("err.invalidTarget");
      }
      target.frozen = true;
    }
    // double/shield: işaret yeter — etki reveal'de uygulanır.
    player.cardUsed = type;
    player.cards -= 1;
    this.broadcast();
  }

  /** Zaman çizgisi incelemesi (6a): izleyenin eligible olduğu her tur, sırayla. */
  private buildReview(player: RoomPlayer): ReviewItem[] {
    const items: ReviewItem[] = [];
    if (this.gameMode === "circle" || this.gameMode === "word") {
      const prompts = this.gameMode === "word" ? this.wordPrompts : this.circlePrompts;
      prompts.forEach((prompt, i) => {
        if (player.eligibleFrom > i) return;
        const typed = player.typed[i] ?? null;
        const correct = typed !== null && matchesCircleAnswer(prompt, typed);
        items.push({ category: prompt.category, prompt: prompt.clue, correct, yourAnswer: typed ?? "", correctAnswer: prompt.answer });
      });
    } else if (this.gameMode === "blitz") {
      // Herkes kendi akışını gördü — inceleme kişisel iz sürümü üzerinden.
      player.blitzTrail.forEach((e) => {
        items.push({
          category: e.truth ? "blitz" : "blitz",
          prompt: `${e.text} — “${e.claim}”`,
          correct: (e.choice === 0) === e.truth,
          yourAnswer: e.choice === 0 ? "Doğru" : "Yanlış",
          correctAnswer: e.truth ? "Doğru" : "Yanlış",
          promptEn: `${e.textEn ?? e.text} — “${e.claimEn ?? e.claim}”`,
          yourAnswerEn: e.choice === 0 ? "True" : "False",
          correctAnswerEn: e.truth ? "True" : "False",
        });
      });
    } else if (this.gameMode === "timeline") {
      this.orderQuestions.slice(0, this.roundLimit).forEach((prompt, i) => {
        if (player.eligibleFrom > i) return;
        const order = player.orderAnswers[i] ?? null;
        const sol = prompt.events.map((_, k) => k).sort((a, b) => prompt.events[a].year - prompt.events[b].year);
        const hits = order ? order.filter((ev, pos) => ev === sol[pos]).length : 0;
        items.push({
          category: prompt.category,
          prompt: prompt.text,
          correct: hits === prompt.events.length,
          yourAnswer: `${hits}/${prompt.events.length}`,
          correctAnswer: prompt.events.slice().sort((a, b) => a.year - b.year).map((e) => e.label).join(" → "),
          promptEn: prompt.textEn,
          yourAnswerEn: `${hits}/${prompt.events.length}`,
          correctAnswerEn: prompt.events.slice().sort((a, b) => a.year - b.year).map((e) => e.labelEn).join(" → "),
        });
      });
    } else if (this.gameMode === "board") {
      this.boardAsked.forEach((question, i) => {
        if (player.eligibleFrom > i) return;
        const choice = player.answers[i] ?? null;
        items.push({
          category: question.category,
          prompt: question.text,
          correct: choice === question.correctIndex,
          yourAnswer: choice !== null ? question.choices[choice] : "",
          correctAnswer: question.choices[question.correctIndex],
          promptEn: question.textEn,
          yourAnswerEn: choice !== null ? question.choicesEn[choice] : "",
          correctAnswerEn: question.choicesEn[question.correctIndex],
        });
      });
    } else {
      this.questions.slice(0, this.roundLimit).forEach((question, i) => {
        if (player.eligibleFrom > i) return;
        if (question.id === `written-${player.id}`) return; // kendi sorusu — oynamadı
        const choice = player.answers[i] ?? null;
        items.push({
          category: question.category,
          prompt: question.text,
          correct: choice === question.correctIndex,
          yourAnswer: choice !== null ? question.choices[choice] : "",
          correctAnswer: question.choices[question.correctIndex],
          promptEn: question.textEn,
          yourAnswerEn: choice !== null ? question.choicesEn[choice] : "",
          correctAnswerEn: question.choicesEn[question.correctIndex],
        });
      });
    }
    return items;
  }

  /** Masa geneli en hızlı doğru cevap — 4d "en hızlı parmak". Yoksa null. */
  private fastestFinger(): { name: string; ms: number } | null {
    let best: { name: string; ms: number } | null = null;
    for (const player of this.players.values()) {
      if (player.stats.fastestMs === null) continue;
      if (!best || player.stats.fastestMs < best.ms) best = { name: player.name, ms: player.stats.fastestMs };
    }
    return best;
  }

  /** §6.3 anlar kartı: maçın unutulmaz anları (masa geneli, podyumda gösterilir). */
  private matchMoments(): MatchMoment[] {
    const humans = [...this.players.values()].filter((player) => !player.isBot && player.stats.total > 0);
    const moments: MatchMoment[] = [];
    const flawless = humans.find((player) => player.stats.total >= 5 && player.stats.correct === player.stats.total);
    if (flawless) moments.push({ key: "flawless", playerId: flawless.id, name: flawless.name, value: flawless.stats.total });
    let bigBet: RoomPlayer | null = null;
    for (const player of humans) if (!bigBet || player.stats.maxGain > bigBet.stats.maxGain) bigBet = player;
    if (bigBet && bigBet.stats.maxGain > 0) moments.push({ key: "bigBet", playerId: bigBet.id, name: bigBet.name, value: bigBet.stats.maxGain });
    let streak: RoomPlayer | null = null;
    for (const player of humans) if (!streak || player.stats.bestStreak > streak.stats.bestStreak) streak = player;
    if (streak && streak.stats.bestStreak >= 3) moments.push({ key: "streak", playerId: streak.id, name: streak.name, value: streak.stats.bestStreak });
    let fastest: RoomPlayer | null = null;
    for (const player of humans) {
      if (player.stats.fastestMs === null) continue;
      if (!fastest || player.stats.fastestMs < fastest.stats.fastestMs!) fastest = player;
    }
    if (fastest) moments.push({ key: "fastest", playerId: fastest.id, name: fastest.name, value: fastest.stats.fastestMs! });
    return moments;
  }

  private reveal() {
    if (this.phase !== "question") return;
    this.clearBotTimers();
    if (this.gameMode === "circle") return this.revealCircle();
    if (this.gameMode === "word") return this.revealWord();
    if (this.gameMode === "numeric") return this.revealNumeric();
    if (this.gameMode === "blitz") return this.revealBlitz();
    if (this.gameMode === "timeline") return this.revealTimeline();
    this.clearTimer();
    const question = this.currentQuestion();
    if (!question) return this.finish();
    const picks = [[], [], [], []] as string[][];
    const gains: Record<string, number> = {};
    // Çifte Bahis: reveal'de herkesin bahsi görünür (masadaki gerçek kumar hissi).
    const bets: Record<string, number> = {};
    const writerId = question.id.startsWith("written-") ? question.id.slice(8) : null;
    for (const player of this.eligiblePlayers()) {
      // Soru yazarı turu: yazar bu turda oynamaz — sonradan ortalama kazanç alır.
      if (player.id === writerId) continue;
      if (player.choice !== null) picks[player.choice].push(player.id);
      const correct = player.choice === question.correctIndex;
      const elapsed = Math.max(0, (player.answeredAt ?? this.questionDeadline) - this.questionStartedAt);
      const duration = this.questionDuration();
      const speedRatio = Math.max(0, 1 - elapsed / duration);
      let gain: number;
      if (this.gameMode === "bet") {
        bets[player.id] = player.bet ?? 0;
        // Çifte Bahis: doğru → yatırılan katlanır (+bahis), yanlış → yanar (−bahis).
        // Hız bonusu yok; mekanik bahsin kendisi. Bahis bankrolle sınırlı, skor <0 olmaz.
        const stake = player.bet ?? 0;
        // "Hepsi": bakiyenin tamamı yatırıldıysa kazanç ×2.5 iade (bahis+1.5×).
        // score hâlâ tur öncesi bakiye — bahis kilidinde düşülmediği için eşitlik güvenli.
        const allIn = stake > 0 && stake === player.score;
        gain = this.rescueRound.has(player.id)
          ? (correct ? GAME.BET_BROKE_REWARD : 0)
          : (correct ? (allIn ? Math.round(stake * (GAME.BET_ALL_IN_MULTIPLIER - 1)) : stake) : -stake);
        player.score = Math.max(0, player.score + gain);
      } else {
        // Zorluk bonusu tabana eklenir (hız bileşeni saf süre kalır); kalibre
        // zorluk varsa o sayılır. Zil/pano kendi şemasıyla üstünü yazar.
        const base = (this.gameMode === "lightning" ? 520 : GAME.BASE_POINTS) + GAME.DIFF_BONUS[effectiveDifficulty(question)];
        const speed = !this.speedBonus ? 0 : this.gameMode === "lightning" ? 420 : GAME.SPEED_POINTS;
        gain = correct ? Math.round(base + speed * speedRatio) : 0;
        // Zil: hız bonusu yok — değer kaçıncı denemede doğru bilindiğine göre
        // düşer; yanlış basan puan kaybeder (§6.1 "yanlışsa −puan").
        if (this.gameMode === "zil") gain = correct ? this.zilValue() : -GAME.ZIL_PENALTY;
        // Tavern Panosu: hücrenin sabit değeri — hız bonusu yok, Jeopardy usulü.
        if (this.gameMode === "board") gain = correct ? this.boardCells[this.currentCell]?.value ?? 0 : 0;
        // Tavern kartı Çifte: bu sorunun kazancı ×2 (yalnız doğruysa).
        if (correct && player.cardUsed === "double") gain *= 2;
        // Skor negatife inmez — Zil'in -200 cezası düşük skorlu oyuncuyu eksiye taşırdı.
        if (gain) player.score = Math.max(0, player.score + gain);
        // Son Masa: yanlış ya da cevapsız tur 1 can götürür; doğruya puan yok
        // sayılmaz — hayatta kalmak oyunun kendisi, puan klasik gibi işler.
        if (this.gameMode === "elim" && !correct) player.lives = Math.max(0, player.lives - 1);
      }
      gains[player.id] = gain;
      if (gain > player.stats.maxGain) player.stats.maxGain = gain;
      // Maç özeti (4d): en hızlı yalnızca gerçekten cevaplanan doğrularda sayılır
      // (deadline'a düşen cevapsız tur "hız" değil).
      // Tavern kartı Kalkan: yanlış cevap seriyi bozmaz (istatistikte yanlış
      // sayılır ama currentStreak korunur).
      this.recordStat(player, correct, question.category, correct && player.answeredAt !== null ? elapsed : null, player.cardUsed === "shield");
      player.answers[this.qIndex] = player.choice; // 6a zaman çizgisi
    }
    // Soru yazarı turu: yazar, o soruda puan alanların ortalamasını kazanır.
    if (writerId) {
      const writer = this.players.get(writerId);
      if (writer) {
        const earned = Object.entries(gains).filter(([id, g]) => id !== writerId && g > 0).map(([, g]) => g);
        const writerGain = earned.length ? Math.round(earned.reduce((a, b) => a + b, 0) / earned.length) : 0;
        writer.score += writerGain;
        gains[writerId] = writerGain;
        if (writerGain > writer.stats.maxGain) writer.stats.maxGain = writerGain;
      }
    }
    // Takım modu (§6.2): takım puanı kişisel kazançların toplamı değil, takımın
    // TEK cevabının doğruluğu — üyeler çoğunluk oyu verir, eşitlikte kaptanın
    // (en düşük seat'li bağlı üye) seçimi geçerli. Böylece büyük takım doğuştan
    // avantajlı olmaz; koordinasyon ödüllendirilir.
    if (this.gameMode === "team") {
      for (const team of [0, 1] as const) {
        const members = [...this.players.values()].filter(
          (p) => p.team === team && p.connected && p.eligibleFrom <= this.qIndex,
        );
        if (!members.length) continue;
        const votes = [0, 0, 0, 0];
        for (const m of members) if (m.choice !== null) votes[m.choice]++;
        const max = Math.max(...votes);
        if (max === 0) continue;
        const tied = votes.filter((v) => v === max).length > 1;
        const captain = members.find((m) => m.id === this.teamCaptainId(team)) ?? members.reduce((a, b) => (a.seat <= b.seat ? a : b));
        const teamChoice = tied && captain.choice !== null ? captain.choice : votes.indexOf(max);
        if (teamChoice === question.correctIndex) this.teamScores[team] += GAME.TEAM_VOTE_PTS;
      }
    }
    // Fitil: doğru cevap çıkan her tur fitili bir kademe kısaltır.
    if (this.gameMode === "lightning" && picks[question.correctIndex].length > 0) this.lightningBurn++;
    this.phase = "reveal";
    // Trivia notu taşıyan turda reveal 2 sn uzar — satırı okumaya vakit kalsın.
    const revealMs = GAME.REVEAL_MS + (question.fact ? 2_000 : 0);
    this.revealUntil = Date.now() + revealMs;
    this.lastReveal = {
      correctIndex: question.correctIndex, picks, gains, until: this.revealUntil, durationMs: revealMs,
      ...(this.gameMode === "bet" && this.rescueRound.size ? { rescued: [...this.rescueRound] } : {}),
      ...(this.gameMode === "bet" ? { bets } : {}),
      ...(question.fact ? { fact: question.fact, factEn: question.factEn } : {}),
    };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), revealMs);
  }

  private revealCircle() {
    if (this.phase !== "question") return;
    this.clearTimer();
    const prompt = this.currentCirclePrompt();
    if (!prompt) return this.finish();
    const correct = this.eligiblePlayers()
      .filter((player) => player.circleCorrectAt !== null)
      .sort((a, b) => (a.circleCorrectAt ?? 0) - (b.circleCorrectAt ?? 0));
    const gains: Record<string, number> = {};
    correct.forEach((player, rank) => {
      // Yalnız en hızlı 3 puanlanır — sıralama listesi tüm doğruları taşır, 4.+ +0.
      const gain = rank < GAME.CIRCLE_RANK_POINTS.length ? GAME.CIRCLE_RANK_POINTS[rank] : 0;
      player.score += gain;
      gains[player.id] = gain;
    });
    for (const player of this.eligiblePlayers()) if (!(player.id in gains)) gains[player.id] = 0;
    // Maç özeti (4d): çemberde doğru = zamanında doğru cevap kilitlemiş olmak.
    for (const player of this.eligiblePlayers()) {
      const isCorrect = player.circleCorrectAt !== null;
      const elapsed = isCorrect ? Math.max(0, (player.circleCorrectAt as number) - this.questionStartedAt) : null;
      this.recordStat(player, isCorrect, prompt.category, elapsed);
      player.typed[this.qIndex] = player.circleAnswer; // 6a zaman çizgisi
    }
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    this.lastCircleReveal = { answer: prompt.answer, ...(prompt.answerEn && prompt.clueEn ? { answerEn: prompt.answerEn } : {}), rankedPlayerIds: correct.map((player) => player.id), gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
  }

  /**
   * Yakın Tahmin cevabı (§6.1): herkes sayı girer, en yakın kazanır. Kilitli
   *  tahmin değiştirilemez; süre dolunca ya da herkes girince reveal olur.
   */
  numericAnswer(playerId: string, value: number): void {
    if (this.gameMode !== "numeric" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    const prompt = this.currentNumeric();
    if (!player || !prompt || player.eligibleFrom > this.qIndex || !player.connected || this.numericGuesses.has(playerId)) return;
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) return; // saçma girişleri yut
    this.numericGuesses.set(playerId, value);
    player.answeredAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    this.revealIfEveryoneAnswered();
  }

  private revealNumeric() {
    if (this.phase !== "question") return;
    this.clearTimer();
    const prompt = this.currentNumeric();
    if (!prompt) return this.finish();
    // En yakın mesafe kazanır; aynı mesafede beraberlik — hepsi kazanan sayılır.
    let best = Infinity;
    for (const guess of this.numericGuesses.values()) best = Math.min(best, Math.abs(guess - prompt.answer));
    const winnerIds = best < Infinity
      ? [...this.numericGuesses.entries()].filter(([, guess]) => Math.abs(guess - prompt.answer) === best).map(([id]) => id)
      : [];
    const gains: Record<string, number> = {};
    for (const player of this.eligiblePlayers()) {
      const guessed = this.numericGuesses.get(player.id);
      const isWinner = winnerIds.includes(player.id);
      // Tam isabet bonusu yalnız kazanana — eşit mesafede ama tam tutturamayan bonus almaz.
      const exact = isWinner && guessed === prompt.answer;
      const gain = isWinner ? GAME.NUMERIC_BASE + (exact ? GAME.NUMERIC_EXACT : 0) : 0;
      player.score += gain;
      gains[player.id] = gain;
      const elapsed = guessed !== undefined && isWinner ? Math.max(0, (player.answeredAt ?? this.questionDeadline) - this.questionStartedAt) : null;
      this.recordStat(player, isWinner, prompt.category, elapsed);
    }
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    const guesses: Record<string, number> = {};
    for (const [id, guess] of this.numericGuesses) guesses[id] = guess;
    this.lastReveal = {
      correctIndex: -1, picks: [[], [], [], []], gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS,
      numeric: { answer: prompt.answer, unit: prompt.unit, unitEn: prompt.unitEn, guesses, winnerIds },
      ...(prompt.fact ? { fact: prompt.fact, factEn: prompt.factEn ?? "" } : {}),
    };
    this.lastNumericReveal = this.lastReveal.numeric ?? null;
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
  }

  /**
   * Zaman Çizelgesi cevabı (§6.1): `order` = oyuncunun dizdiği events
   * indeksleri, en eskiden yeniye — [0,1,2,3]'ün permütasyonu olmalı.
   * Kilitleme tek seferlik; süre dolunca ya da herkes dizince reveal olur.
   */
  orderAnswer(playerId: string, order: unknown): void {
    if (this.gameMode !== "timeline" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.lateReveal(playerId);
    const player = this.players.get(playerId);
    const prompt = this.currentOrder();
    if (!player || !prompt || player.eligibleFrom > this.qIndex || !player.connected || this.orderGuesses.has(playerId)) return;
    const n = prompt.events.length;
    if (!Array.isArray(order) || order.length !== n
      || !order.every((v): v is number => Number.isInteger(v) && v >= 0 && v < n)
      || new Set(order as number[]).size !== n) return; // permütasyon değilse yut
    this.orderGuesses.set(playerId, order as number[]);
    player.answeredAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    this.revealIfEveryoneAnswered();
  }

  /** Zaman Çizelgesi reveal'ı: doğru sıra açılır, her doğru pozisyon
   *  TIMELINE_PER_POS puan yazar (§6.1 — kısmi puan). */
  private revealTimeline() {
    if (this.phase !== "question") return;
    this.clearTimer();
    const prompt = this.currentOrder();
    if (!prompt) return this.finish();
    const correctOrder = this.orderSolution()!;
    const orders: Record<string, number[]> = {};
    const hits: Record<string, number> = {};
    const gains: Record<string, number> = {};
    for (const player of this.eligiblePlayers()) {
      const order = this.orderGuesses.get(player.id);
      let hit = 0;
      if (order) {
        orders[player.id] = order;
        order.forEach((evIdx, pos) => { if (evIdx === correctOrder[pos]) hit++; });
      }
      player.orderAnswers[this.qIndex] = order ?? null;
      hits[player.id] = hit;
      const gain = hit * GAME.TIMELINE_PER_POS;
      player.score += gain;
      gains[player.id] = gain;
      if (gain > player.stats.maxGain) player.stats.maxGain = gain;
      const elapsed = order && hit === prompt.events.length
        ? Math.max(0, (player.answeredAt ?? this.questionDeadline) - this.questionStartedAt) : null;
      this.recordStat(player, hit === prompt.events.length, prompt.category, elapsed);
    }
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    const ordered = correctOrder.map((i) => {
      const e = prompt.events[i];
      return { label: e.label, labelEn: e.labelEn, when: e.when, whenEn: e.whenEn };
    });
    this.lastReveal = { correctIndex: -1, picks: [[], [], [], []], gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.lastTimelineReveal = { ordered, orders, hits, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
  }

  private revealWord() {
    if (this.phase !== "question") return;
    this.clearTimer();
    const prompt = this.currentWordPrompt();
    if (!prompt) return this.finish();
    // Ortak havuzdan bu turun tükettiği süre düşer (reveal saati durur).
    this.wordPoolMs = Math.max(0, this.wordPoolMs - (Date.now() - this.wordRoundStartedAt));
    const correct = this.eligiblePlayers()
      .filter((player) => player.circleCorrectAt !== null)
      .sort((a, b) => (a.circleCorrectAt ?? 0) - (b.circleCorrectAt ?? 0));
    const gains: Record<string, number> = {};
    for (const player of this.eligiblePlayers()) {
      const gain = player.circleCorrectAt !== null ? player.wordGain : 0;
      player.score += gain;
      gains[player.id] = gain;
      const isCorrect = player.circleCorrectAt !== null;
      const elapsed = isCorrect ? Math.max(0, (player.circleCorrectAt as number) - this.questionStartedAt) : null;
      this.recordStat(player, isCorrect, prompt.category, elapsed);
      player.typed[this.qIndex] = player.circleAnswer;
    }
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    this.lastWordReveal = { answer: prompt.answer, ...(prompt.answerEn && prompt.clueEn ? { answerEn: prompt.answerEn } : {}), rankedPlayerIds: correct.map((player) => player.id), gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
  }

  /**
   * Reveal'dan sonraki soruya geçiş. Faz koruması + deadline kararı: bayat ya da
   * erken uyanan bir timer asla çifte geçiş yapamaz; animasyonların durumu
   * geçişleri hiçbir koşulda etkilemez (istemci tamamen pasif izleyicidir).
   */
  private advanceFromReveal() {
    if (this.phase !== "reveal") return;
    if (Date.now() < this.revealUntil) {
      this.clearTimer();
      this.timer = setTimeout(() => this.advanceFromReveal(), this.revealUntil - Date.now());
      return;
    }
    // Son Masa: ayakta 1'den az/1 kişi kaldıysa maç burada biter — elenenler
    // izleyici kalır, son kalan kazanır. Soru havuzu biterse de beginQuestion
    // currentQuestion null ile finish'e düşer.
    if (this.gameMode === "elim" && this.eligiblePlayers().length <= 1) return this.finish();
    // Kelime Oyunu: ortak havuz bittiyse kalan turlar oynanmadan maç biter.
    if (this.gameMode === "word" && this.wordPoolMs <= 0) return this.finish();
    // D/Y Blitz tek 60 sn'lik penceredir — özeti gösterdikten sonra maç biter.
    if (this.gameMode === "blitz") return this.finish();
    this.qIndex += 1;
    // Tavern Panosu: hücre kaldıysa sıradaki oyuncu seçer, bittiyse podyum.
    if (this.gameMode === "board") {
      return this.boardCells.some((cell) => !cell.used) ? this.beginPick() : this.finish();
    }
    // Çifte Bahis'te her sorunun önünde yeniden bahis fazı vardır.
    this.gameMode === "bet" ? this.beginBet() : this.beginQuestion();
  }

  private finish() {
    this.clearTimer();
    this.clearBotTimers();
    if (this.dailyMatch) {
      // Wordle deseni her koltuktaki oyuncu için hesaplanır (cevaplanmamış
      // tur ⬜); kalıcı kayıt onDailyFinished kancası üzerinden index.ts'de.
      const questions = this.questions.slice(0, this.roundLimit);
      const entries: DailyResultEntry[] = [];
      for (const player of this.players.values()) {
        if (player.isBot) continue;
        const pattern = dailyPattern(player.answers, questions);
        this.dailyResults.set(player.id, pattern);
        entries.push({ day: this.dailyDay, userId: player.id, name: player.name, pattern, score: player.score });
      }
      if (entries.length) {
        try { this.onDailyFinished?.(entries); }
        catch (error) { console.error("[daily] günlük sonuç yazılamadı:", error); }
      }
    }
    if (this.progress) {
      // Kalıcı ilerleme: kazananı ve sıralamayı otoriter maç sonucundan hesapla.
      // Takım modunda galibiyet takım puanına göredir (beraberlikte galip yok).
      const order = this.sortedPlayers();
      const winningTeam = this.gameMode === "team" && this.teamScores[0] !== this.teamScores[1]
        ? (this.teamScores[0] > this.teamScores[1] ? 0 : 1)
        : -1;
      const matchEntries = order
        .map((player, index) => ({ player, placement: index + 1 }))
        .filter(({ player }) => !player.isBot && player.stats.total > 0)
        .map(({ player, placement }): MatchFinishedEntry => ({
          userId: player.id,
          name: player.name,
          avatarUrl: player.avatarUrl,
          correct: player.stats.correct,
          total: player.stats.total,
          bestStreak: player.stats.bestStreak,
          placement,
          won: this.gameMode === "team" ? player.team === winningTeam : placement === 1,
          gameMode: this.gameMode,
          perCategory: [...player.stats.perCategory.entries()]
            .map(([category, value]) => ({ category, correct: value.correct })),
        }));
      if (matchEntries.length) {
        try { this.xpGains = this.progress.recordMatch(matchEntries); }
        catch (error) { console.error("[xp] maç sonucu yazılamadı:", error); }
      }
      // §6.3 zorluk kalibrasyonu: her soru için kimlere soruldu / kimler bildi.
      // Bot cevapları istatistiği bozmasın diye yalnız gerçek oyuncular sayılır.
      if (this.questions.length) {
        try {
          const rows = new Map<string, { questionId: string; asked: number; correct: number }>();
          this.questions.forEach((question, index) => {
            const row = rows.get(question.id) ?? { questionId: question.id, asked: 0, correct: 0 };
            for (const player of this.players.values()) {
              if (player.isBot || player.eligibleFrom > index) continue;
              row.asked += 1;
              if (player.answers[index] === question.correctIndex) row.correct += 1;
            }
            rows.set(question.id, row);
          });
          this.progress.recordQuestionStats([...rows.values()]);
          setQuestionCalibration(this.progress.questionStats());
        } catch (error) { console.error("[xp] soru istatistiği yazılamadı:", error); }
      }
    }
    this.podiumSnapshot = this.snapshotPodium();
    this.fastestFingerSnapshot = this.fastestFinger();
    this.momentsSnapshot = this.matchMoments();
    // İzleyici tahmini: podyum birincisini bilenlere XP (sayaçlara yazmaz).
    if (this.progress && this.predictions.size) {
      const winnerId = this.podiumSnapshot?.[0]?.id;
      for (const [spectatorId, target] of this.predictions) {
        if (target !== winnerId) continue;
        const spectator = this.spectators.get(spectatorId) ?? this.players.get(spectatorId);
        if (!spectator) continue;
        try {
          const gain = this.progress.bonusXp({ userId: spectator.id, name: spectator.name, avatarUrl: spectator.avatarUrl, amount: GAME.PREDICT_XP });
          this.xpGains.set(spectatorId, gain);
        } catch (error) { console.error("[xp] izleyici tahmin ödülü yazılamadı:", error); }
      }
    }
    const humans = [...this.players.values()].filter((player) => !player.isBot);
    this.lastMatchMeta = {
      id: ++this.matchSeq,
      gameMode: this.gameMode,
      roundTotal: this.gameMode === "circle" ? this.circlePrompts.length : this.roundLimit,
      teamScores: [this.teamScores[0], this.teamScores[1]],
      podium: this.podiumSnapshot,
      moments: this.momentsSnapshot,
      xpGains: this.progress && this.xpGains.size ? Object.fromEntries(this.xpGains) : null,
      dailyDay: this.dailyMatch ? this.dailyDay : null,
    };
    this.frozenSummaries = new Map(humans.map((player) => [player.id, this.summaryFor(player)]));
    this.frozenDaily = new Map(this.dailyResults);
    this.inResults = new Set(humans.map((player) => player.id));
    this.phase = "podium";
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.lastWordReveal = null;
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.zilTimer) clearTimeout(this.zilTimer);
    this.zilTimer = null;
  }

  private clearGrace(playerId: string) {
    const timer = this.graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(playerId);
  }

  private clearAllGrace() {
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
  }

  private clearBotTimers() {
    for (const timer of this.botTimers) clearTimeout(timer);
    this.botTimers.clear();
  }

  private pruneExpiredKicks(now = Date.now()) {
    for (const [playerId, until] of this.kickedUntil) {
      if (now >= until) this.kickedUntil.delete(playerId);
    }
  }

  /** En küçük boş koltuğu verir; ayrılan oyuncunun koltuğu yeni gelene açılır, çakışma olmaz. */
  private nextFreeSeat(): number {
    const taken = new Set([...this.players.values()].map((player) => player.seat));
    let seat = 0;
    while (taken.has(seat)) seat += 1;
    return seat;
  }

  /** Süresi geçmiş eylem: turu reveal'a taşır VE oyuncuya geç kaldığını
   *  bildirir — sessiz yutulursa oyuncu basmasının neden tutmadığını anlamaz. */
  private lateReveal(playerId: string) {
    this.onToast?.(playerId, "err.lateAnswer");
    this.reveal();
  }

  private revealIfEveryoneAnswered() {
    if (this.phase !== "question") return;
    // BEKLEME listesi ≠ puanlama listesi: bağlantısı kopan oyuncu cevap veremez,
    // o yüzden onu bekleme dışı bırak — bağlı herkes cevaplayınca tur deadline'ı
    // beklemeden reveal olur. (Kopan oyuncu yine eligible; o tur 0 alır.)
    const waiting = this.eligiblePlayers().filter((player) => player.connected);
    if (waiting.length && waiting.every((candidate) => this.hasAnswered(candidate))) this.reveal();
  }

  private eligiblePlayers() {
    return [...this.players.values()].filter((player) => player.eligibleFrom <= this.qIndex
      && (this.gameMode !== "elim" || player.lives > 0));
  }

  private sortedPlayers() {
    // Son Masa'da sıralama önce hayatta kalmaya göredir: elenenler puanları ne
    // olursa olsun ayakta kalanların altına düşer; can eşitse skor konuşur.
    return [...this.players.values()].sort((a, b) => this.gameMode === "elim"
      ? (b.lives - a.lives) || b.score - a.score || a.name.localeCompare(b.name, "tr")
      : b.score - a.score || a.name.localeCompare(b.name, "tr"));
  }

  private snapshotPodium(): PodiumEntry[] {
    return this.sortedPlayers()
      .filter((player) => this.gameMode !== "duel" || player.eligibleFrom < this.roundLimit)
      .map(({ id, name, avatarUrl, score, team, title }) => {
      const league = this.progress?.badge(id)?.league;
      return { id, name, avatarUrl, score, team, ...(title ? { title } : {}), ...(league ? { league } : {}) };
    });
  }

  private hasAnswered(player: RoomPlayer) {
    if (this.gameMode === "numeric") return this.numericGuesses.has(player.id);
    if (this.gameMode === "blitz") return player.blitzAnswered > 0;
    if (this.gameMode === "timeline") return this.orderGuesses.has(player.id);
    return this.gameMode === "circle" || this.gameMode === "word" ? player.circleAnswer !== null : player.choice !== null;
  }

  /** Aktif modun soru süresi. Botlar cevap gecikmesini buna göre planlar. */
  questionDuration() {
    if (this.gameMode === "circle") return GAME.CIRCLE_QUESTION_MS;
    if (this.gameMode === "blur") return GAME.BLUR_QUESTION_MS;
    if (this.gameMode === "blitz") return GAME.BLITZ_TOTAL_MS;
    if (this.gameMode === "timeline") return GAME.TIMELINE_MS;
    // Kelime Oyunu: tur tavanı 45 sn ama ortak havuzdan fazla yiyemez.
    if (this.gameMode === "word") return Math.min(GAME.WORD_ROUND_MS, Math.max(0, this.wordPoolMs));
    if (this.gameMode === "lightning") {
      // Her doğrulu tur fitili 0,5 sn kısaltır; 4 sn'de durur.
      return Math.max(GAME.LIGHTNING_MIN_MS, GAME.LIGHTNING_START_MS - this.lightningBurn * GAME.LIGHTNING_STEP_MS);
    }
    return this.questionTimeMs ?? GAME.QUESTION_MS;
  }

  /** Takım kaptanı (§6.2): takımın bağlı üyeleri içinde en düşük seat'li;
   *  kimse bağlı değilse null. Oy eşitliğinde kaptanın seçimi takım cevabıdır. */
  private teamCaptainId(team: number): string | null {
    const members = [...this.players.values()].filter((p) => p.team === team && p.connected);
    if (!members.length) return null;
    return members.reduce((a, b) => (a.seat <= b.seat ? a : b)).id;
  }

  private publicPlayer(player: RoomPlayer): PublicPlayer {
    return {
      id: player.id,
      seat: player.seat,
      name: player.name,
      avatarUrl: player.avatarUrl,
      score: player.score,
      connected: player.connected,
      ready: player.ready,
      isBot: player.isBot,
      // Bahis fazında "kilitledi" = bahsini yatırdı; aksi halde şeritte herkes
      // bahis yatırsa da "Düşünüyor" görünüyordu.
      answered: this.phase === "bet" ? player.bet !== null : this.hasAnswered(player),
      waiting: player.eligibleFrom > this.qIndex,
      ...(this.gameMode === "elim" ? { lives: player.lives } : {}),
      streak: player.stats.currentStreak,
      team: player.team,
      ...(this.gameMode === "team" ? { captain: this.teamCaptainId(player.team) === player.id } : {}),
      ...(this.phase === "lobby" && this.inResults.has(player.id) ? { inResults: true } : {}),
      cards: player.cards,
      // Joker kullanımı görünür ama kart türü gizli kalır.
      ...(player.cardUsed ? { cardPlayed: true } : {}),
      ...(player.isBot ? {} : {
        progress: this.progress?.badge(player.id) ?? undefined,
        ...(player.title ? { title: player.title } : {}),
      }),
    };
  }
}
