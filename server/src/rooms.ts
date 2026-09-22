import { GAME } from "./config";
import { GameError } from "./errors";
import { QUESTION_COUNTS } from "../../shared/types";
import { circlePoolKeys, normalizeCircleAnswer, sampleCirclePrompts, type CirclePrompt } from "./circle";
import { resetExhaustedSubpools, sampleQuestions, type Question } from "./questions";
import { getPack, samplePackQuestions } from "./packs";
import { CATEGORY_CATALOG, CATEGORY_NAMES } from "./categories";
import { dailyDayNumber, dailyPattern, dailyQuestions, type DailyResultEntry } from "./daily";
import type {
  BetPayload,
  CirclePayload,
  CircleRevealPayload,
  CountdownPayload,
  Difficulty,
  GameMode,
  GameState,
  MatchSummary,
  PodiumEntry,
  PublicPlayer,
  ReviewItem,
  QuestionCount,
  QuestionPayload,
  RevealPayload,
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
  /** Maç özeti (4d) için birikenler. Her reveal'de güncellenir, start()'ta sıfırlanır. */
  stats: MatchStats;
  /** Zaman çizgisi incelemesi (6a): tur başına cevap. Klasik = şık indeksi,
   *  çember = yazılan metin. Yalnız reveal'de o turun gözü doldurulur. */
  answers: (number | null)[];
  typed: (string | null)[];
}

/** Bir oyuncunun tek maçtaki performansı. Maç özeti kartını (4d) besler. */
interface MatchStats {
  correct: number;
  total: number;
  currentStreak: number;
  bestStreak: number;
  /** Doğru cevapların en hızlısı (ms, soru başlangıcına göre). Cevap yoksa null. */
  fastestMs: number | null;
  perCategory: Map<string, { correct: number; total: number }>;
}

function emptyStats(): MatchStats {
  return { correct: 0, total: 0, currentStreak: 0, bestStreak: 0, fastestMs: null, perCategory: new Map() };
}

type Broadcast = () => void;
type QuestionStarted = (room: Room) => void;

/** Sunucunun otorite olduğu tek bir eşzamanlı maç odası. */
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
  /** Masa ayarı: özel soru paketi id'si; null = standart havuz. Paket seçiliyken
   *  klasik soru havuzu paketin listesiyle değişir (kategori/zorluk filtreleri
   *  atlanır); Çember kendi prompt havuzunu kullandığı için etkilenmez. */
  packId: string | null = null;
  hostId: string | null = null;
  questionStartedAt = 0;
  questionDeadline = 0;
  countdownDeadline = 0;
  /** Çifte Bahis: bahis fazının bitiş zamanı (epoch ms). */
  betDeadline = 0;
  revealUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private botTimers = new Set<NodeJS.Timeout>();
  /** Atılan oyuncular bir süre geri giremez; yoksa kick tek tıkla geri dönülen boş bir jest olur. */
  private kickedUntil = new Map<string, number>();
  private lastReveal: RevealPayload | null = null;
  private lastCircleReveal: CircleRevealPayload | null = null;
  /** Team points live independently from player records, so departures cannot erase earned points. */
  private teamScores: [number, number] = [0, 0];
  /** Freeze the finishing order; podium departures must not rewrite the result or MVP. */
  private podiumSnapshot: PodiumEntry[] | null = null;
  /** Günlük Meydan Okuma maçı mı — klasik kurallar, tarih tohumlu sabit soru
   *  seti. Maç sonunda her oyuncu için Wordle deseni üretilir. */
  private dailyMatch = false;
  private dailyDay = 0;
  /** Maç sonunda hesaplanan desenler (userId → "🟩🟥⬜🟩🟩"); podyumda paylaşılır. */
  private dailyResults = new Map<string, string>();
  /** Günlük maç bittiğinde kalıcı depo index.ts tarafından yazılır (kanca). */
  onDailyFinished: ((entries: DailyResultEntry[]) => void) | null = null;
  /** `undefined` = no finished match yet; `null` = the finished match had no correct answer. */
  private fastestFingerSnapshot: { name: string; ms: number } | null | undefined = undefined;
  private onQuestionStarted: QuestionStarted | null = null;
  private onEmptied: (() => void) | null = null;

  constructor(
    readonly id: string,
    private readonly broadcast: Broadcast,
    options: { minPlayers?: number; questionCount?: number } = {}
  ) {
    this.minPlayers = options.minPlayers ?? GAME.MIN_PLAYERS;
    this.questions = sampleQuestions(options.questionCount ?? GAME.QUESTIONS_PER_MATCH);
  }

  addPlayer(player: Omit<RoomPlayer, "seat" | "score" | "connected" | "ready" | "choice" | "answeredAt" | "eligibleFrom" | "circleAnswer" | "circleCorrectAt" | "bet" | "team" | "disconnectedAt" | "lastEmoteAt" | "stats" | "answers" | "typed">) {
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
      eligibleFrom: this.phase === "lobby" || this.phase === "countdown"
        ? 0
        : this.gameMode === "bet"
          ? this.roundLimit
          : this.qIndex + 1,
      stats: emptyStats(),
      answers: [],
      typed: [],
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

  /** Oyuncuyu masadan çıkarır (ayrılma, grace bitişi veya kick); kalan masa kesintisiz devam eder. */
  removePlayer(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.clearGrace(playerId);
    this.players.delete(playerId);
    if (this.hostId === playerId) this.reassignHost();
    if (this.handleNoPlayersLeft()) return;
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
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    this.dailyMatch = false;
    this.dailyResults = new Map();
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
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    this.dailyMatch = false;
    this.dailyResults = new Map();
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
    if (this.hostId === userId) this.reassignHost();
    this.spectators.set(id, { id, name, avatarUrl, socketId });
    if (this.handleNoPlayersLeft()) return; // artık izleyici olduğu için oda kapanmaz, lobiye döner
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
    if (mode !== "classic" && mode !== "lightning" && mode !== "circle" && mode !== "bet" && mode !== "team") throw new GameError("err.modeInvalid");
    if (this.gameMode === mode) return;
    this.gameMode = mode;
    if (mode === "classic") this.questionCount = 10;
    if (mode === "lightning") this.questionCount = 5;
    if (mode === "bet") this.questionCount = 10;
    if (mode === "team") this.questionCount = 10;
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
   * Masa ayarı: sonraki maçın soru sayısı. Süre moda sabittir; sayı değil.
   * Çember kendi sabit tur sayısını kullandığı için bu ayardan etkilenmez.
   */
  setQuestionCount(playerId: string, count: unknown): void {
    if (this.phase !== "lobby") throw new GameError("err.lobbyOnly");
    if (this.hostId !== playerId) throw new GameError("err.countHostOnly");
    if (!QUESTION_COUNTS.includes(count as QuestionCount)) throw new GameError("err.countInvalid");
    if (this.questionCount === count) return;
    this.questionCount = count as QuestionCount;
    // Kategori değişimiyle aynı kural: masa ayarı değişince herkes tekrar onaylar.
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
    const normalizedMode = daily ? "classic" : gameMode === "quiz" ? "classic" : gameMode;
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
    if (this.phase === "lobby" && [...this.players.values()].filter((player) => player.connected).some((player) => !player.ready)) {
      throw new GameError("err.everyoneReady");
    }
    this.gameMode = normalizedMode;
    this.dailyMatch = daily;
    this.dailyDay = daily ? dailyDayNumber() : 0;
    this.dailyResults = new Map();
    this.qIndex = 0;
    this.teamScores = [0, 0];
    this.podiumSnapshot = null;
    this.fastestFingerSnapshot = undefined;
    // Soru sayısı masa ayarıdır; Çember kendi sabit tur sayısıyla oynanır.
    this.roundLimit = this.gameMode === "circle" ? GAME.CIRCLE_PROMPTS_PER_MATCH : this.questionCount;
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
      // Özel paket seçiliyse (Çember hariç — kendi prompt havuzu var) sorular
      // paketin listesinden çekilir; kategori/zorluk filtreleri paket için
      // uygulanmaz, paket temalı havuzun kendisidir.
      const pack = this.packId && this.gameMode !== "circle" ? getPack(this.packId) : null;
      if (this.packId && this.gameMode !== "circle" && !pack) throw new GameError("err.packUnknown");
      if (pack && !pack.questions.length) throw new GameError("err.packEmpty");
      this.questions = pack
        ? samplePackQuestions(this.roundLimit, pack.questions, this.seenQuestionIds)
        : sampleQuestions(this.roundLimit, compatibleCategories, this.seenQuestionIds, this.difficulty);
      this.lastQuestionIds = new Set(this.questions.map((q) => q.id));
      this.questions.forEach((q) => this.seenQuestionIds.add(q.id));
    }

    // Dar havuz benzersiz çekildi -> istenen sayıdan az olabilir. Klasik round.total
    // ve maç-sonu GERÇEK soru sayısını yansıtsın (çemberdeki circlePrompts.length gibi).
    if (this.gameMode !== "circle") this.roundLimit = this.questions.length;

    if (this.gameMode === "circle") {
      const unseenC = circlePoolKeys(compatibleCategories, this.difficulty).filter((k) => !this.seenCirclePromptKeys.has(k)).length;
      if (unseenC < GAME.CIRCLE_PROMPTS_PER_MATCH) this.seenCirclePromptKeys = new Set(this.lastCirclePromptKeys);
      this.circlePrompts = sampleCirclePrompts(GAME.CIRCLE_PROMPTS_PER_MATCH, compatibleCategories, this.seenCirclePromptKeys, this.difficulty);
      this.lastCirclePromptKeys = new Set(this.circlePrompts.map((p) => `${p.category}|${p.answer}`));
      this.circlePrompts.forEach((p) => this.seenCirclePromptKeys.add(`${p.category}|${p.answer}`));
    } else {
      this.circlePrompts = [];
    }
    for (const player of this.players.values()) {
      // Çifte Bahis'te skor = bankroll: herkes eşit parayla başlar (0 değil).
      player.score = this.gameMode === "bet" ? GAME.BET_STARTING_BANKROLL : 0;
      player.choice = null;
      player.answeredAt = null;
      player.circleAnswer = null;
      player.circleCorrectAt = null;
      player.bet = null;
      player.eligibleFrom = 0;
      player.stats = emptyStats();
      player.answers = [];
      player.typed = [];
    }
    this.beginCountdown();
  }

  answer(playerId: string, choice: number): void {
    if (this.gameMode === "circle" || this.phase !== "question" || !Number.isInteger(choice) || choice < 0 || choice > 3) return;
    // Karar deadline'a göre: timer gecikmiş olsa bile süre dolduysa cevap yerine reveal işler.
    if (Date.now() >= this.questionDeadline) return this.reveal();
    const player = this.players.get(playerId);
    if (!player || player.eligibleFrom > this.qIndex || player.choice !== null) return;
    player.choice = choice;
    player.answeredAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    this.revealIfEveryoneAnswered();
  }

  answerCircle(playerId: string, answer: string): void {
    if (this.gameMode !== "circle" || this.phase !== "question") return;
    if (Date.now() >= this.questionDeadline) return this.reveal();
    const player = this.players.get(playerId);
    const prompt = this.currentCirclePrompt();
    const clean = answer.trim().slice(0, 48);
    if (!player || !prompt || player.eligibleFrom > this.qIndex || player.circleAnswer !== null || !clean) return;
    player.circleAnswer = clean;
    if (normalizeCircleAnswer(clean) === normalizeCircleAnswer(prompt.answer)) player.circleCorrectAt = Date.now();
    if (this.firstAnswerId === null) this.firstAnswerId = playerId;
    this.broadcast();
    // İlk doğru cevap turu bitirmez; tüm oyuncular kilitlediğinde veya süre dolunca reveal yapılır.
    this.revealIfEveryoneAnswered();
  }

  addBot(name: string): void {
    if (this.players.size >= GAME.MAX_PLAYERS) throw new GameError("err.roomFull");
    const id = `bot:${crypto.randomUUID()}`;
    this.addPlayer({ id, name, avatarUrl: null, socketId: null, isBot: true });
  }

  currentQuestion(): Question | null {
    return this.gameMode !== "circle" && this.qIndex < this.roundLimit ? this.questions[this.qIndex] ?? null : null;
  }

  currentCirclePrompt(): CirclePrompt | null {
    return this.gameMode === "circle" ? this.circlePrompts[this.qIndex] ?? null : null;
  }

  setQuestionStartedHandler(handler: QuestionStarted) {
    this.onQuestionStarted = handler;
  }

  stateFor(youId: string, devMode: boolean): GameState {
    const question = this.currentQuestion();
    const circlePrompt = this.currentCirclePrompt();
    const inQuestion = this.phase === "question" && question;
    const inCircle = this.phase === "question" && circlePrompt;
    const questionPayload: QuestionPayload | null = inQuestion
      ? {
          category: question.category,
          text: question.text,
          choices: question.choices,
          textEn: question.textEn,
          choicesEn: question.choicesEn,
          deadline: this.questionDeadline,
          durationMs: this.questionDuration(),
          ...(question.image ? { image: question.image } : {}),
        }
      : null;
    const circle: CirclePayload | null = inCircle
      ? { letter: circlePrompt.letter, clue: circlePrompt.clue, category: circlePrompt.category, deadline: this.questionDeadline, durationMs: GAME.CIRCLE_QUESTION_MS }
      : null;
    const countdown: CountdownPayload | null = this.phase === "countdown"
      ? { deadline: this.countdownDeadline, durationMs: GAME.COUNTDOWN_MS }
      : null;
    // Çifte Bahis bahis fazı: yalnız kategori + oyuncunun bankrolü sızar; soru gizli.
    const self0 = this.players.get(youId);
    const bet: BetPayload | null = this.phase === "bet" && question
      ? { category: question.category, bankroll: Math.max(0, self0?.score ?? 0), deadline: this.betDeadline, durationMs: GAME.BET_MS }
      : null;
    const podium: PodiumEntry[] | null = this.phase === "podium"
      ? this.podiumSnapshot ?? this.snapshotPodium()
      : null;
    const self = this.players.get(youId);
    const matchSummary: MatchSummary | null = this.phase === "podium" && self
      ? {
          correct: self.stats.correct,
          total: self.stats.total,
          bestStreak: self.stats.bestStreak,
          perCategory: [...self.stats.perCategory.entries()].map(([category, value]) => ({ category, correct: value.correct, total: value.total })),
          fastest: this.fastestFingerSnapshot !== undefined ? this.fastestFingerSnapshot : this.fastestFinger(),
          review: this.buildReview(self),
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
      reveal: this.phase === "reveal" ? this.lastReveal : null,
      circleReveal: this.phase === "reveal" ? this.lastCircleReveal : null,
      podium,
      matchSummary,
      daily: this.dailyMatch ? { day: this.dailyDay, pattern: this.dailyResults.get(youId) ?? null } : null,
      // Bahis fazında "kilitleyen" = bahsini yatıran; diğer fazlarda = cevaplayan.
      answeredCount: this.eligiblePlayers().filter((player) => this.phase === "bet" ? player.bet !== null : this.hasAnswered(player)).length,
      eligibleCount: this.eligiblePlayers().length,
      firstAnswerId: this.firstAnswerId,
      youAreSpectator: this.spectators.has(youId),
      spectatorCount: this.spectators.size,
      minPlayers: this.minPlayers,
      questionCount: this.questionCount,
      difficulty: this.difficulty,
      categorySelection: this.categorySelection,
      pack: this.packId ? { id: this.packId, name: getPack(this.packId)?.name ?? this.packId } : null,
      availableCategories: CATEGORY_CATALOG,
      devMode,
      serverNow: Date.now(),
    };
  }

  private beginQuestion() {
    const round = this.gameMode === "circle" ? this.currentCirclePrompt() : this.currentQuestion();
    if (!round) return this.finish();
    this.clearTimer();
    this.clearBotTimers();
    this.phase = "question";
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.questionStartedAt = Date.now();
    this.firstAnswerId = null; // yeni tur: en hızlı parmak yeniden yarışır
    const duration = this.questionDuration();
    this.questionDeadline = this.questionStartedAt + duration;
    for (const player of this.eligiblePlayers()) {
      player.choice = null;
      player.answeredAt = null;
      player.circleAnswer = null;
      player.circleCorrectAt = null;
    }
    this.broadcast();
    this.onQuestionStarted?.(this);
    this.timer = setTimeout(() => this.reveal(), duration);
  }

  /** Tüm istemcilere tek bir deadline gönderir; animasyon yerelde aksa bile tur eşzamanlı başlar. */
  private beginCountdown() {
    this.clearTimer();
    this.phase = "countdown";
    this.countdownDeadline = Date.now() + GAME.COUNTDOWN_MS;
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.broadcast();
    this.timer = setTimeout(() => {
      if (this.phase !== "countdown") return;
      // Çifte Bahis: sorudan önce bahis fazı gelir; diğer modlar doğrudan soruya.
      this.gameMode === "bet" ? this.beginBet() : this.beginQuestion();
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
    this.betDeadline = Date.now() + GAME.BET_MS;
    for (const player of this.eligiblePlayers()) player.bet = null;
    // Botlar hemen yatırır: bankrollerinin rastgele bir dilimini (¼–hepsi arası).
    for (const player of this.eligiblePlayers()) {
      if (!player.isBot) continue;
      const fraction = 0.25 + Math.random() * 0.75;
      player.bet = Math.max(0, Math.min(player.score, Math.round(player.score * fraction)));
    }
    this.broadcast();
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

  /** Bir turun sonucunu oyuncunun maç istatistiğine işler (4d özet kartı). */
  private recordStat(player: RoomPlayer, correct: boolean, category: string, correctElapsedMs: number | null): void {
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
    } else {
      s.currentStreak = 0;
    }
    s.perCategory.set(category, cat);
  }

  /** Zaman çizgisi incelemesi (6a): izleyenin eligible olduğu her tur, sırayla. */
  private buildReview(player: RoomPlayer): ReviewItem[] {
    const items: ReviewItem[] = [];
    if (this.gameMode === "circle") {
      this.circlePrompts.forEach((prompt, i) => {
        if (player.eligibleFrom > i) return;
        const typed = player.typed[i] ?? null;
        const correct = typed !== null && normalizeCircleAnswer(typed) === normalizeCircleAnswer(prompt.answer);
        items.push({ category: prompt.category, prompt: prompt.clue, correct, yourAnswer: typed ?? "", correctAnswer: prompt.answer });
      });
    } else {
      this.questions.slice(0, this.roundLimit).forEach((question, i) => {
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

  private reveal() {
    if (this.phase !== "question") return;
    this.clearBotTimers();
    if (this.gameMode === "circle") return this.revealCircle();
    this.clearTimer();
    const question = this.currentQuestion();
    if (!question) return this.finish();
    const picks = [[], [], [], []] as string[][];
    const gains: Record<string, number> = {};
    for (const player of this.eligiblePlayers()) {
      if (player.choice !== null) picks[player.choice].push(player.id);
      const correct = player.choice === question.correctIndex;
      const elapsed = Math.max(0, (player.answeredAt ?? this.questionDeadline) - this.questionStartedAt);
      const duration = this.questionDuration();
      const speedRatio = Math.max(0, 1 - elapsed / duration);
      let gain: number;
      if (this.gameMode === "bet") {
        // Çifte Bahis: doğru → yatırılan katlanır (+bahis), yanlış → yanar (−bahis).
        // Hız bonusu yok; mekanik bahsin kendisi. Bahis bankrolle sınırlı, skor <0 olmaz.
        const stake = player.bet ?? 0;
        gain = correct ? stake : -stake;
        player.score = Math.max(0, player.score + gain);
      } else {
        const base = this.gameMode === "lightning" ? 520 : GAME.BASE_POINTS;
        const speed = this.gameMode === "lightning" ? 420 : GAME.SPEED_POINTS;
        gain = correct ? Math.round(base + speed * speedRatio) : 0;
        if (gain) player.score += gain;
        if (this.gameMode === "team" && gain) this.teamScores[player.team === 1 ? 1 : 0] += gain;
      }
      gains[player.id] = gain;
      // Maç özeti (4d): en hızlı yalnızca gerçekten cevaplanan doğrularda sayılır
      // (deadline'a düşen cevapsız tur "hız" değil).
      this.recordStat(player, correct, question.category, correct && player.answeredAt !== null ? elapsed : null);
      player.answers[this.qIndex] = player.choice; // 6a zaman çizgisi
    }
    this.phase = "reveal";
    this.revealUntil = Date.now() + GAME.REVEAL_MS;
    this.lastReveal = { correctIndex: question.correctIndex, picks, gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
    this.broadcast();
    this.timer = setTimeout(() => this.advanceFromReveal(), GAME.REVEAL_MS);
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
      const gain = GAME.CIRCLE_RANK_POINTS[Math.min(rank, GAME.CIRCLE_RANK_POINTS.length - 1)];
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
    this.lastCircleReveal = { answer: prompt.answer, rankedPlayerIds: correct.map((player) => player.id), gains, until: this.revealUntil, durationMs: GAME.REVEAL_MS };
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
    this.qIndex += 1;
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
        entries.push({ day: this.dailyDay, userId: player.id, pattern, score: player.score });
      }
      if (entries.length) {
        try { this.onDailyFinished?.(entries); }
        catch (error) { console.error("[daily] günlük sonuç yazılamadı:", error); }
      }
    }
    this.podiumSnapshot = this.snapshotPodium();
    this.fastestFingerSnapshot = this.fastestFinger();
    this.phase = "podium";
    this.lastReveal = null;
    this.lastCircleReveal = null;
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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

  private revealIfEveryoneAnswered() {
    if (this.phase !== "question") return;
    // BEKLEME listesi ≠ puanlama listesi: bağlantısı kopan oyuncu cevap veremez,
    // o yüzden onu bekleme dışı bırak — bağlı herkes cevaplayınca tur deadline'ı
    // beklemeden reveal olur. (Kopan oyuncu yine eligible; o tur 0 alır.)
    const waiting = this.eligiblePlayers().filter((player) => player.connected);
    if (waiting.length && waiting.every((candidate) => this.hasAnswered(candidate))) this.reveal();
  }

  private eligiblePlayers() {
    return [...this.players.values()].filter((player) => player.eligibleFrom <= this.qIndex);
  }

  private sortedPlayers() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "tr"));
  }

  private snapshotPodium(): PodiumEntry[] {
    return this.sortedPlayers().map(({ id, name, avatarUrl, score, team }) => ({ id, name, avatarUrl, score, team }));
  }

  private hasAnswered(player: RoomPlayer) {
    return this.gameMode === "circle" ? player.circleAnswer !== null : player.choice !== null;
  }

  /** Aktif modun soru süresi. Botlar cevap gecikmesini buna göre planlar. */
  questionDuration() {
    if (this.gameMode === "circle") return GAME.CIRCLE_QUESTION_MS;
    return this.gameMode === "lightning" ? 8_000 : GAME.QUESTION_MS;
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
      answered: this.hasAnswered(player),
      waiting: player.eligibleFrom > this.qIndex,
      streak: player.stats.currentStreak,
      team: player.team,
    };
  }
}
