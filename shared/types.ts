// Sunucu ile istemcinin ortak sözlüğü. Oyunun tek gerçek durumu sunucuda yaşar;
// istemciye her zaman bu sanitize edilmiş görünüm gönderilir (doğru cevap,
// question fazındayken asla payload'a girmez).

/** `bet` yalnızca Çifte Bahis modunda vardır: soru açılmadan önce oyuncular
 *  kategoriyi görüp bankrollerinden yatırır. Sıra: countdown → (bet → question →
 *  reveal)* → podium. Diğer modlar bet fazına hiç girmez. */
export type Phase = "lobby" | "countdown" | "bet" | "question" | "reveal" | "podium";
/** `quiz` eski istemciler icin uyumluluk aliasidir; yeni Activity Klasik/Fitil kullanir.
 *  `bet` (Çifte Bahis): klasik sorular; her soru öncesi bahis fazı, doğru cevap
 *  yatırılanı katlar, yanlış yakar — skor = bankroll, aşağı da inebilir.
 *  `team` (Takım): klasik sorular + puanlama; oyuncular 2 takıma bölünür, puanlar
 *  takım havuzunda toplanır, yüksek toplamlı takım kazanır. */
export type GameMode = "quiz" | "classic" | "lightning" | "circle" | "bet" | "team";
/** Soru/prompt zorluk seviyesi. Klasik ve Çember havuzlarındaki her içerik
 *  bununla etiketlenir; gelecekteki zorluk-modu seçimi (basit/orta/zor) bu
 *  alanı filtre olarak kullanacak — içerik önceden ayrılmış, yeniden
 *  sınıflandırma gerekmez. */
export type Difficulty = "kolay" | "orta" | "zor";

export interface PublicPlayer {
  id: string;
  /** Stable table position; never changes when scores are re-sorted. */
  seat: number;
  name: string;
  avatarUrl: string | null;
  score: number;
  connected: boolean;
  /** True only after the player confirms they are ready in the lobby. */
  ready: boolean;
  isBot: boolean;
  /** Bu soruda cevap verdi mi (hangi şık olduğu reveal'a kadar gizli) */
  answered: boolean;
  /** Maç ortasında katıldı, bir sonraki sorudan itibaren oynayacak */
  waiting: boolean;
  /** Üst üste doğru sayısı (güncel seri); istemci eşik üstünde alev gösterir. */
  streak: number;
  /** Takım modu: oyuncunun takımı (0 veya 1). Otomatik dengeli atanır, host
   *  değiştirebilir. Diğer modlarda anlamsızdır (yine de atanır, kullanılmaz). */
  team: number;
}

export interface QuestionPayload {
  category: string;
  text: string;
  choices: string[];
  /** İngilizce arayüz için çeviri; istemci `language`'a göre bunu ya da
   *  yukarıdaki Türkçe alanları gösterir. Çember modu bilinçli olarak
   *  çevrilmez (harf-kelime eşleşmesine dayanır), bu yalnız klasik moddadır. */
  textEn: string;
  choicesEn: string[];
  /** Epoch ms — istemci geri sayımı serverNow offset'iyle bundan hesaplar */
  deadline: number;
  durationMs: number;
  /** Opsiyonel: verilmişse istemci /questions/<image>'ı soru metninin üstünde gösterir. */
  image?: string;
}

export interface RevealPayload {
  correctIndex: number;
  /** Şık başına o şıkkı seçen oyuncu id'leri */
  picks: string[][];
  /** Oyuncu id → bu sorudan kazanılan puan */
  gains: Record<string, number>;
  until: number;
  /** Reveal sahnesinin toplam süresi; istemci ilerleme çizgisini bundan hesaplar */
  durationMs: number;
}

export interface CirclePayload {
  letter: string;
  clue: string;
  category: string;
  deadline: number;
  durationMs: number;
}

/** Maç soru açılmadan önce, tüm istemcilerin aynı anda oynattığı geri sayım. */
export interface CountdownPayload {
  deadline: number;
  durationMs: number;
}

/** Çifte Bahis: bahis fazı. Soru metni/şıkları GÖNDERİLMEZ — yalnız kategori
 *  görünür; oyuncu bankrolünden bir oran yatırıp kilitler. */
export interface BetPayload {
  category: string;
  /** Oyuncunun bu tur bahse yatırabileceği en yüksek tutar (güncel bankrolü). */
  bankroll: number;
  deadline: number;
  durationMs: number;
}

export interface CircleRevealPayload {
  answer: string;
  /** Doğru cevap verenler, sunucunun doğruladığı hız sırasıyla */
  rankedPlayerIds: string[];
  gains: Record<string, number>;
  until: number;
  /** Reveal sahnesinin toplam süresi; istemci ilerleme çizgisini bundan hesaplar */
  durationMs: number;
}

/**
 * Sunucunun istemciye gösterdiği mesajlar. Sunucu METİN değil ANAHTAR yollar;
 * çeviri istemcide, oyuncunun seçtiği dilde yapılır. Aksi halde arayüz İngilizce
 * olsa bile hatalar Türkçe düşer.
 */
export type ToastKey =
  | "err.roomFull"
  | "err.tableFull"
  | "err.lobbyOnly"
  | "err.categoryHostOnly"
  | "err.categoryInvalid"
  | "err.categoryEmpty"
  | "err.alreadyStarted"
  | "err.startHostOnly"
  | "err.needPlayers"
  | "err.everyoneReady"
  | "err.kickHostOnly"
  | "err.invalidTarget"
  | "err.notAtTable"
  | "err.transferHostOnly"
  | "err.transferConnectedOnly"
  | "err.joinFailed"
  | "err.startFailed"
  | "err.botFailed"
  | "err.categoryFailed"
  | "err.countFailed"
  | "err.difficultyFailed"
  | "err.modeFailed"
  | "err.teamFailed"
  | "err.countHostOnly"
  | "err.countInvalid"
  | "err.difficultyHostOnly"
  | "err.difficultyInvalid"
  | "err.modeHostOnly"
  | "err.modeInvalid"
  | "err.teamHostOnly"
  | "err.teamInvalid"
  | "err.packFailed"
  | "err.packHostOnly"
  | "err.packUnknown"
  | "err.packEmpty"
  | "err.teamNeedsBothSides"
  | "err.kicked"
  | "err.kickFailed"
  | "err.transferFailed"
  | "info.kicked"
  | "report.sent"
  | "report.duplicate"
  | "report.failed"
  /** Sunucu göndermez; bağlantı kurulamadığında istemcinin kendi ürettiği mesaj. */
  | "err.connection";

export interface ToastPayload {
  key: ToastKey;
  /** Şablondaki {ad} yer tutucularını dolduran değerler (ör. { count: 2 }) */
  params?: Record<string, string | number>;
}

/** Masadaki herkese yayınlanan kısa tepki. Sunucu anahtar listesini doğrular ve hız sınırlar. */
export const EMOTE_KEYS = ["flame", "heart", "star"] as const;
export type EmoteKey = (typeof EMOTE_KEYS)[number];

export interface EmotePayload {
  playerId: string;
  emote: EmoteKey;
  /** Sunucu saati (epoch ms); istemci aynı oyuncudan gelen tepkileri sıralamak için kullanır */
  at: number;
}

export interface PodiumEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  team?: number;
}

/** Maç özeti kartı (4d). İzleyen oyuncuya ÖZEL hesaplanır (isabet/seri/kategori
 *  senindir); "fastest" ise masa geneli en hızlı doğru cevaptır. Yalnız podyumda. */
export interface MatchSummary {
  correct: number;
  total: number;
  bestStreak: number;
  perCategory: { category: string; correct: number; total: number }[];
  fastest: { name: string; ms: number } | null;
  /** Zaman çizgisi incelemesi (6a): oyuncunun eligible olduğu her tur, sırayla. */
  review: ReviewItem[];
}

/** Maç incelemesinde tek bir tur (6a düğümü + detayı). İzleyene özeldir. */
export interface ReviewItem {
  category: string;
  /** Soru metni (klasik) veya ipucu (çember). */
  prompt: string;
  correct: boolean;
  /** İzleyenin cevabı — cevaplamadıysa boş. */
  yourAnswer: string;
  correctAnswer: string;
  /** Yalnız klasik moddaki turlarda dolu (çember çevrilmez). */
  promptEn?: string;
  yourAnswerEn?: string;
  correctAnswerEn?: string;
}

/** Lobi kategorileri, hangi modda kaç kullanılabilir içerik olduğunu da taşır. */
export interface CategoryOption {
  name: string;
  classicCount: number;
  circleCount: number;
  /** Kategorinin baskın zorluğu (içeriğin en çok etiketlendiği seviye) — kart
   *  görünümünde segment göstergesi için. İçerik yoksa null (kilitli/"yakında"). */
  difficulty: Difficulty | null;
}

/**
 * Maç sırasında bağlantısı kopan oyuncunun koltuğunun korunduğu süre.
 * Sunucu ile istemci AYNI sabiti kullanmak zorunda: bağlantı kopukken istemci
 * sunucunun deadline'ını öğrenemez (bağlantı yok), sayacı bu sabitten çalıştırır.
 * Gerçek karar her zaman sunucunundur; istemcideki sayaç yalnızca göstergedir.
 */
export const RECONNECT_GRACE_MS = 30_000;

/** Masa sahibinin seçebildiği soru sayıları. Süre moda sabittir, sayı değil. */
export const QUESTION_COUNTS = [5, 10, 15] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

export interface GameState {
  phase: Phase;
  gameMode: GameMode;
  /** Masa ayarı: sonraki maçın soru sayısı (Çember kendi sabitini kullanır) */
  questionCount: QuestionCount;
  /** Masa ayarı: zorluk filtresi; null = karışık (tüm zorluklar). Tüm modlara uygulanır. */
  difficulty: Difficulty | null;
  roomId: string;
  hostId: string | null;
  youId: string;
  players: PublicPlayer[]; // skora göre sıralı
  /** Server-authoritative team pools; earned points survive departures. */
  teamScores: readonly [number, number];
  round: { index: number; total: number };
  question: QuestionPayload | null;
  circle: CirclePayload | null;
  countdown: CountdownPayload | null;
  /** Yalnız Çifte Bahis'te bet fazında dolu; kategori + bankroll taşır. */
  bet: BetPayload | null;
  /** Çifte Bahis: bu tur kilitlediğin bahis (null = henüz yatırmadın). */
  yourBet: number | null;
  /** Sadece kendi seçimin; başkalarınınki reveal'a kadar görünmez */
  yourChoice: number | null;
  /** Çemberde yalnızca oyuncunun kendi kilitlediği cevap görünür. */
  yourCircleAnswer: string | null;
  reveal: RevealPayload | null;
  circleReveal: CircleRevealPayload | null;
  podium: PodiumEntry[] | null;
  /** Yalnız podyum fazında; izleyen oyuncuya özel maç özeti (4d). */
  matchSummary: MatchSummary | null;
  answeredCount: number;
  eligibleCount: number;
  /** Bu turun ilk kilitleyeni ("en hızlı parmak"); istemci şeritte tek seferlik
   *  parıltı gösterir. Tur başında null'a döner. */
  firstAnswerId: string | null;
  /** İzleyici misin: koltuğun yok, oynamıyorsun ama masayı ve maçı görüyorsun. */
  youAreSpectator: boolean;
  /** Masayı izleyen (oyuncu olmayan) kişi sayısı. */
  spectatorCount: number;
  minPlayers: number;
  /** Boş dizi, tüm kategorilerin karışık kullanılacağı anlamına gelir. */
  categorySelection: string[];
  /** Masa ayarı: özel soru paketi; null = standart havuz. Çember kendi
   *  prompt havuzunu kullandığı için paket Çember'de etkisizdir. */
  pack: { id: string; name: string } | null;
  availableCategories: CategoryOption[];
  devMode: boolean;
  /** İstemci saat farkını hesaplasın diye her pakette gönderilir */
  serverNow: number;
}

// Socket.IO olay adları
export const EV = {
  STATE: "state",
  TOAST: "toast",
  /** Aktif socket oturumu doldu; istemci Discord SDK ile yeniden yetkilendirir. */
  AUTH_REQUIRED: "auth-required",
  START: "start",
  ANSWER: "answer",
  CIRCLE_ANSWER: "circle-answer",
  /** Çifte Bahis: { amount } — bahis fazında yatırılan tutar (0..bankroll) */
  BET: "bet",
  /** Takım modu, yalnız host, lobide: { targetId, team } — oyuncunun takımını değiştirir */
  SET_TEAM: "set-team",
  PLAY_AGAIN: "play-again",
  ADD_BOT: "add-bot",
  READY: "ready",
  SET_CATEGORIES: "set-categories",
  /** Yalnızca masa sahibi: { count } — sonraki maçın soru sayısı */
  SET_QUESTION_COUNT: "set-question-count",
  /** Yalnızca masa sahibi: { difficulty } — "kolay"|"orta"|"zor" ya da null (karışık) */
  SET_DIFFICULTY: "set-difficulty",
  /** Yalnızca masa sahibi: { packId } — klasik soru havuzunu özel paketle değiştirir; null temizler */
  SET_PACK: "set-pack",
  /**
   * Yalnızca masa sahibi: { mode } — masanın modu. Masa AYARIDIR ve yayınlanır:
   * mod her istemcinin yerel seçimi olsaydı, host Fitil'i seçtiğinde diğer
   * oyuncuların merkez diski hâlâ Klasik gösterirdi.
   */
  SET_MODE: "set-mode",
  LEAVE_GAME: "leave-game",
  /** İstemci { emote } yollar; sunucu EmotePayload olarak odaya yayınlar */
  EMOTE: "emote",
  /** Yalnızca masa sahibi: { targetId } — oyuncuyu masadan atar */
  KICK: "kick-player",
  /** Yalnızca masa sahibi: { targetId } — masa sahipliğini devreder */
  TRANSFER_HOST: "transfer-host",
  /** Koltuğu bırakıp izleyiciye geçer (oynamadan izlemeye devam) */
  SPECTATE: "spectate",
  /** İzleyiciyken boş koltuğa oturup oyuncu olur */
  TAKE_SEAT: "take-seat",
  /** Reveal'da "bu soru hatalı" bildirimi: { note? } — soru kimliği sunucuda çözülür */
  QUESTION_REPORT: "question-report",
} as const;
