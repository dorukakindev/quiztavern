// Sunucu ile istemcinin ortak sözlüğü. Oyunun tek gerçek durumu sunucuda yaşar;
// istemciye her zaman bu sanitize edilmiş görünüm gönderilir (doğru cevap,
// question fazındayken asla payload'a girmez).

/** `bet` yalnızca Çifte Bahis modunda vardır: soru açılmadan önce oyuncular
 *  kategoriyi görüp bankrollerinden yatırır. Sıra: countdown → (bet → question →
 *  reveal)* → podium. Diğer modlar bet fazına hiç girmez. */
export type Phase = "lobby" | "countdown" | "bet" | "pick" | "question" | "reveal" | "podium";
/** `quiz` eski istemciler icin uyumluluk aliasidir; yeni Activity Klasik/Fitil kullanir.
 *  `bet` (Çifte Bahis): klasik sorular; her soru öncesi bahis fazı, doğru cevap
 *  yatırılanı katlar, yanlış yakar — skor = bankroll, aşağı da inebilir.
 *  `team` (Takım): klasik sorular + puanlama; oyuncular 2 takıma bölünür, puanlar
 *  takım havuzunda toplanır, yüksek toplamlı takım kazanır.
 *  `elim` (Son Masa): 3 canla başlanır; yanlış/cevapsız tur 1 can götürür,
 *  son kalan kazanır, elenenler izler.
 *  `blur` (Bulanık Resim): yalnız resimli sorular; görsel süre boyunca
 *  netleşir — erken cevap = çok puan (hız bonusu mekaniği).
 *  `word` (Kelime Oyunu): 4→10 harfli kelime turları; "harf al" ortak bir
 *  harfi açar ama soru değerini düşürür (kalan harf × 100). Maç tek bir ortak
 *  zaman havuzundan beslenir — havuz bitince oyun biter. */
export type GameMode =
  | "quiz"
  | "classic"
  | "lightning"
  | "circle"
  | "bet"
  | "team"
  | "elim"
  | "blur"
  | "word"
  | "duel"
  | "zil"
  | "numeric"
  | "blitz"
  | "timeline"
  | "board";

/** Mod sözleşmesi (§7.2): her modun hangi girdiyi/özelliği kabul ettiği tek
 *  tabloda durur — dağınık `gameMode === "x" || === "y"` listeleri yerine
 *  buraya bakılır. Yeni mod eklerken satırını doldurmak sözleşmeyi de kurar. */
export interface ModeContract {
  /** answer() çağrısında şık indeksini (0..3) kabul eder. */
  choiceAnswers: boolean;
  /** Lobide soru-sayısı çipleri anlamlı (yoksa sözleşme/havuz sabitler). */
  questionCountEditable: boolean;
  /** Özel soru paketi kaynağı olabilir. */
  packCompatible: boolean;
  /** Yazar turu soruları havuza karışır. */
  writerCompatible: boolean;
  /** Tur verisi soru-kalibrasyon istatistiğine yazar. */
  feedsCalibration: boolean;
  /** Tavern kartları (joker) kullanır. */
  usesCards: boolean;
  /** Can sistemi kullanır (Son Masa). */
  usesLives: boolean;
  /** Lobide masa ayar çipleri (soru süresi, hız bonusu, sadece resimli)
   *  görünür. false ise mod değişiminde bu ayarlar varsayılana döner —
   *  gizli kalmış bir "kapalı" diğer modun mekaniğini sessizce bozmasın. */
  tableTuning: boolean;
}

export const MODE_CONTRACT: Record<GameMode, ModeContract> = {
  quiz: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  classic: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: true,
    usesLives: false,
    tableTuning: true,
  },
  lightning: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  circle: {
    choiceAnswers: false,
    questionCountEditable: true,
    packCompatible: false,
    writerCompatible: false,
    feedsCalibration: false,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  bet: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: false,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: true,
  },
  team: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: true,
    usesLives: false,
    tableTuning: true,
  },
  elim: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: false,
    usesLives: true,
    tableTuning: true,
  },
  blur: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: false,
    writerCompatible: false,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  word: {
    choiceAnswers: false,
    questionCountEditable: false,
    packCompatible: false,
    writerCompatible: false,
    feedsCalibration: false,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  duel: {
    choiceAnswers: true,
    questionCountEditable: false,
    packCompatible: true,
    writerCompatible: true,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  zil: {
    choiceAnswers: true,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: false,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  numeric: {
    choiceAnswers: false,
    questionCountEditable: true,
    packCompatible: true,
    writerCompatible: false,
    feedsCalibration: false,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  blitz: {
    choiceAnswers: true,
    questionCountEditable: false,
    packCompatible: true,
    writerCompatible: false,
    feedsCalibration: false,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  timeline: {
    choiceAnswers: false,
    questionCountEditable: true,
    packCompatible: false,
    writerCompatible: false,
    feedsCalibration: false,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
  board: {
    choiceAnswers: true,
    questionCountEditable: false,
    packCompatible: false,
    writerCompatible: false,
    feedsCalibration: true,
    usesCards: false,
    usesLives: false,
    tableTuning: false,
  },
};

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
  /** Son Masa: kalan can (3'ten başlar). Yanlış/cevapsız tur 1 can götürür;
   *  0'a düşen elenir. Yalnızca elim modunda yayınlanır. */
  lives?: number;
  /** Lobi: oda lobiye döndü ama bu oyuncu hâlâ son maçın sonuç ekranında. */
  inResults?: boolean;
  /** Takım modunda kaptan: takımın en düşük seat'li bağlı üyesi; oy eşitliğinde takım cevabını belirler. */
  captain?: boolean;
  /** Üst üste doğru sayısı (güncel seri); istemci eşik üstünde alev gösterir. */
  streak: number;
  /** Takım modu: oyuncunun takımı (0 veya 1). Otomatik dengeli atanır, host
   *  değiştirebilir. Diğer modlarda anlamsızdır (yine de atanır, kullanılmaz). */
  team: number;
  /** Kalıcı ilerleme rozeti (seviye + lig). Botlarda ve ilerleme deposu
   *  kapalıyken yoktur; hiç maç oynamamış oyuncuda da boş kalabilir. */
  progress?: ProgressBadge;
  /** Oyuncunun taktığı unvan (kazanılmış rozetlerden biri). Seçilmemişse yok. */
  title?: BadgeKey;
  /** Tavern kartı (joker) sayısı. Maç başında 1, her 3'lü seride +1.
   *  Klasik/Takım dışındaki modlarda 0 kalır. */
  cards?: number;
  /** Bu tur joker oynadı — kart TÜRÜ sızmasın diye yalnız boolean.
   *  İstemci koltukta küçük deste ikonu gösterir. */
  cardPlayed?: boolean;
}

/** Tavern kartı (joker) türleri — Klasik/Takım maçlarında tur başına bir adet. */
export type CardType = "fifty" | "double" | "shield" | "freeze";
export const CARD_TYPES: readonly CardType[] = ["fifty", "double", "shield", "freeze"];

/** Kalıcı ilerleme meta'sı: lig kademeleri. XP eşikleri sunucudaki
 *  sıralamayla aynıdır (server/src/xp.ts LEAGUE_THRESHOLDS). */
export type LeagueKey = "acemi" | "cirak" | "kalfa" | "usta" | "efsane";
export const LEAGUE_ORDER: readonly LeagueKey[] = ["acemi", "cirak", "kalfa", "usta", "efsane"];

/** Oyuncu kartında görünen kompakt ilerleme rozeti. */
export interface ProgressBadge {
  level: number;
  league: LeagueKey;
}

/**
 * Kalıcı başarım rozetleri. Anahtar listesi SUNUCU ile ortaktır
 * (server/src/xp.ts BADGE_DEFS — eşikler ve koşullar orada yaşar); istemci
 * her anahtarın adını/açıklamasını i18n'den üretir (`badge.<key>` +
 * `badge.<key>.hint`). Sunucu meta değil ANAHTAR yollar — aynı
 * ToastKey sözleşmesi.
 */
export const BADGE_KEYS = [
  "haftaSampiyonu",
  "kategoriUstasi",
  "ilkMac",
  "onMac",
  "elliMac",
  "ilkGalibiyet",
  "onGalibiyet",
  "keskin",
  "kartalGoz",
  "seriAvcisi",
  "alev",
  "gunluk3",
  "gunluk7",
  "podyum",
  "tamIsabet",
  "ligKalfa",
  "ligUsta",
  "ligEfsane",
  "tekeTek",
  "zilUstasi",
  "kahin",
  "kronolog",
  "panoFatihi",
  "sozcu",
  "blitzci",
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Henüz kazanılmamış, sayısal hedefi olan rozet — lobide kilitli rozet
 *  olarak `current/target` çubuğuyla gösterilir. Olay rozetleri (tek maçta
 *  koşulanlar: podyum, mod galibiyetleri, tamİsabet) buraya girmez. */
export interface BadgeProgress {
  key: BadgeKey;
  current: number;
  target: number;
}

/** İzleyen oyuncunun kendi ilerleme özeti — lobide XP bar'ı, podyumda
 *  kazanım satırı ve sezon sırası bununla çizilir. */
export interface ProgressSnapshot extends ProgressBadge {
  xp: number;
  /** Bu seviyede katedilen XP / seviye geçişi için gereken toplam — bar genişliği. */
  intoLevel: number;
  levelSize: number;
  /** UTC ay anahtarı "YYYY-MM"; sezon her ay sıfırlanır. */
  season: string;
  seasonXp: number;
  /** Bu sezondaki sıralama (1 = lider); hiç puanı yoksa null. */
  seasonRank: number | null;
  /** Tüm zamanlar XP sıralaması (1 = lider); hiç XP yoksa null. */
  allTimeRank: number | null;
  /** Art arda en az bir maç oynanan UTC günü sayısı. */
  streakDays: number;
  /** Kazanılmış başarım rozetleri (BADGE_KEYS sırasında). */
  badges: BadgeKey[];
  /** Ustalık kazanılan kategori adları (§6.4): kategori başına 50+ doğru. */
  categoryMastery: string[];
  /** Kilitli rozetlerin ilerlemesi — orana göre azalan sırada; hedefsiz
   *  olay rozetleri listeye girmez. */
  badgeProgress: BadgeProgress[];
}

/** Maç bitince bir oyuncuya yazılan kazanım — podyumda "+X XP" animasyonu. */
export interface XpGain {
  gained: number;
  /** Yeni toplam XP (gained dahil). */
  xp: number;
  level: number;
  league: LeagueKey;
  leveledUp: boolean;
  leagueChanged: boolean;
  /** Bu maçta İLK KEZ kazanılan rozetler; yoksa eksik/ dizidir. */
  newBadges?: BadgeKey[];
}

/** Sezon lider tablosunda bir satır. */
export interface SeasonEntry {
  rank: number;
  userId: string;
  name: string;
  /** Bu sezonda kazanılan XP. */
  xp: number;
  league: LeagueKey;
}

/** Güncel sezonun ilk N sırası (lobi ve podyumda gösterilir). */
export interface SeasonBoard {
  season: string;
  entries: SeasonEntry[];
}

export interface DailyBoardEntry {
  rank: number;
  userId: string;
  name: string;
  /** Günlük maçın skoru. */
  score: number;
  /** 🟩🟥⬜ Wordle deseni — hangi turu doğru bildiğini gösterir. */
  pattern: string;
}

/** Bugünün günlük lider tablosu; lobide gösterilir. */
export interface DailyBoard {
  day: number;
  entries: DailyBoardEntry[];
  /** İzleyenin bugünkü sırası; bugün oynamadıysa null. */
  userRank: number | null;
  /** Arka arkaya kaç gündür günlük oynadığı. */
  streak: number;
}

/** Soru yazarı turu istemci → sunucu girdisi. */
export interface WrittenQuestionInput {
  text: string;
  choices: string[];
  correctIndex: number;
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
  /** Opsiyonel: görselin kredi/atıf satırı — resimli soruda ⓘ ile gösterilir. */
  imageCredit?: string;
  /** Soru yazarı turu: soruyu yazan oyuncunun adı (written-* id'li soruda). */
  writtenByName?: string | null;
  /** Soru yazarı turu: bu soruyu SEN yazdın — istemci cevap yerine izleme ekranı gösterir. */
  writtenByYou?: boolean;
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
  /** Çifte Bahis: bu soruda kurtarma turunda olanlar (bakiye 0, doğru = sabit ödül). */
  rescued?: string[];
  /** Çifte Bahis: oyuncu id → bu turda kilitlediği bahis (reveal'de gösterilir). */
  bets?: Record<string, number>;
  /** Opsiyonel: doğru cevapla ilgili kısa trivia notu — reveal'da gösterilir. */
  fact?: string;
  /** İngilizce arayüz için fact çevirisi. */
  factEn?: string;
  /** Sıradaki tur görselliyse görsel dosya adı: istemci reveal sırasında önden
   *  indirir, soru açıldığında sayaç görsel yüklenirken boşa akmaz. */
  nextImage?: string;
  /** Yakın Tahmin: gerçek değer + tahmin dağılımı + kazanan(lar). */
  numeric?: NumericRevealPayload;
}

export interface CirclePayload {
  letter: string;
  clue: string;
  /** İngilizce arayüz için (veride varsa). İstemci dile göre seçer. */
  letterEn?: string;
  clueEn?: string;
  category: string;
  deadline: number;
  durationMs: number;
}

/** Kelime Oyunu tur yükü. Harfler maske olarak sızar: açılan pozisyonlarda
 *  harf, gizli olanlarda null — ham cevap hiçbir zaman istemciye gitmez. */
export interface WordPayload {
  /** Maske: açılmış pozisyonlarda harf, diğerlerinde null. Uzunluk = harf sayısı. */
  letters: (string | null)[];
  /** EN arayüz cevabının maskesi (varsa) — aynı açılan pozisyonlar uygulanır. */
  lettersEn?: (string | null)[];
  clue: string;
  clueEn?: string;
  category: string;
  /** Şu anki soru değeri: gizli kalan harf × 100. "Harf al" düşürür. */
  value: number;
  /** Ortak zaman havuzu: tüm maç için kalan süre (ms). Bitince maç biter. */
  poolMs: number;
  deadline: number;
  durationMs: number;
}

/** Yakın Tahmin (§6.1): sayısal cevap — doğru yanıt reveal'a dek sunucuda kalır. */
export interface NumericQuestionPayload {
  category: string;
  text: string;
  textEn: string;
  /** Yanıt birimi — istemci giriş kutusunun yanında gösterir ("km", "yıl"...). */
  unit: string;
  unitEn: string;
  deadline: number;
  durationMs: number;
}

/** Yakın Tahmin reveal'ı: gerçek değer + herkesin tahmini + en yakın(lar). */
export interface NumericRevealPayload {
  answer: number;
  unit: string;
  unitEn: string;
  /** Oyuncu id → girilen tahmin (yalnız tahmin edenler). */
  guesses: Record<string, number>;
  winnerIds: string[];
}

/** D/Y Blitz canlı durumu (§6.1): herkes KENDİ ifade akışında bağımsız
 *  ilerler — ortak 60 sn'lik pencere + seri çarpanı. `statement` izleyenin
 *  kendi geçerli ifadesi; doğruluk (`truth`) istemciye hiç gönderilmez. */
export interface BlitzLivePayload {
  deadline: number;
  durationMs: number;
  /** null = oyuncu havuzu tüketti (nadir); pencerenin kalanını izler. */
  statement: { text: string; textEn?: string; claim: string; claimEn?: string; category: string } | null;
  index: number;
  correct: number;
  streak: number;
}

/** D/Y Blitz kapanış özeti — reveal fazında dolu; skor sıralı. */
export interface BlitzSummaryPayload {
  rows: { id: string; score: number; correct: number; answered: number }[];
  until: number;
  durationMs: number;
}

/** Zaman Çizelgesi (§6.1): 4 olay kronolojik sıraya dizilir. `items` istemcinin
 *  gördüğü karışık sıra (yıllar gizli); `orderIdx[i]` ekrandaki i. kutunun
 *  events[] içindeki indeksidir — cevap bu dizilimin permütasyonu. */
export interface TimelineQuestionPayload {
  category: string;
  text: string;
  textEn?: string;
  items: string[];
  itemsEn?: string[];
  /** Ekran sırası → orijinal events indeksi. */
  orderIdx: number[];
  deadline: number;
  durationMs: number;
}

/** Zaman Çizelgesi reveal'ı: doğru sıra yıllarıyla açılır; herkesin dizimi
 *  ve kaç pozisyonu doğru tutturduğu görünür. */
export interface TimelineRevealPayload {
  /** Kronolojik doğru sıradaki olaylar (yıl etiketi dahil). */
  ordered: { label: string; labelEn?: string; when: string; whenEn?: string }[];
  /** Oyuncu id → kendi dizimi (events indeksleri, en eskiden yeniye). */
  orders: Record<string, number[]>;
  /** Oyuncu id → doğru pozisyon sayısı (0-4). */
  hits: Record<string, number>;
  until: number;
  durationMs: number;
}

/** Tavern Panosu (§6.1): pick fazında pano durumu. Hücre metni/şıkları
 *  hiç sızıntı etmez — yalnız değer + kullanılmışlık gider; soru ancak hücre
 *  açılıp question fazına geçince question payload'ıyla gelir. */
export interface BoardCellState {
  /** Hücre puan değeri (100..500). */
  value: number;
  used: boolean;
}

export interface BoardPayload {
  /** Sütun başlıkları — kategori adları (istemcide categoryLabel'dan geçer). */
  categories: string[];
  /** Satır-major hücreler: cells[kategoriIdx * 5 + değerIdx]. */
  cells: BoardCellState[];
  /** Bu turda hücre seçecek oyuncu. */
  pickerId: string | null;
  pickerName: string;
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
  /** Bakiye 0: bahis yok (otomatik 0'a kilitli), doğru cevap brokeReward kazandırır. */
  broke: boolean;
  brokeReward: number;
  /** Son soru (Jeopardy usulü final): çipler yerine serbest tutar girilir. */
  final?: boolean;
}

export interface CircleRevealPayload {
  answer: string;
  /** EN ipucu gösterildiyse onun cevabı. */
  answerEn?: string;
  /** Doğru cevap verenler, sunucunun doğruladığı hız sırasıyla */
  rankedPlayerIds: string[];
  gains: Record<string, number>;
  until: number;
  /** Reveal sahnesinin toplam süresi; istemci ilerleme çizgisini bundan hesaplar */
  durationMs: number;
}

/** Son biten maçın dondurulmuş sonucu. Oda lobiye döndükten sonra, sonuç
 *  ekranından henüz çıkmamış oyuncuya gönderilir (podyumu çizmeye devam eder). */
export interface LastMatch {
  id: number;
  gameMode: GameMode;
  roundTotal: number;
  teamScores: readonly [number, number];
  podium: PodiumEntry[];
  matchSummary: MatchSummary | null;
  /** Anlar kartı (§6.3): podyumda masa geneli unutulmaz anlar; yoksa null. */
  moments: MatchMoment[] | null;
  xpGains: Record<string, XpGain> | null;
  daily: { day: number; pattern: string | null } | null;
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
  | "err.countMode"
  | "err.difficultyHostOnly"
  | "err.difficultyInvalid"
  | "err.themeHostOnly"
  | "err.themeInvalid"
  | "err.themeLocked"
  | "err.themeFailed"
  | "err.timeHostOnly"
  | "err.timeInvalid"
  | "err.timeFailed"
  | "err.settingHostOnly"
  | "err.settingInvalid"
  | "err.settingFailed"
  | "err.questionInvalid"
  | "err.modeHostOnly"
  | "err.modeInvalid"
  | "err.teamHostOnly"
  | "err.teamInvalid"
  | "err.packFailed"
  | "err.packHostOnly"
  | "err.packUnknown"
  | "err.packEmpty"
  | "err.teamNeedsBothSides"
  | "err.cardFailed"
  | "err.cardMode"
  | "err.cardPhase"
  | "err.rematchPhase"
  | "err.cardLate"
  | "err.cardUsed"
  | "err.cardEmpty"
  | "err.invalidInput"
  | "err.lateAnswer"
  | "err.predictPhase"
  | "err.predictFailed"
  | "err.kicked"
  | "err.kickFailed"
  | "err.transferFailed"
  | "err.title"
  | "err.dailyDone"
  | "info.kicked"
  | "info.cardEarned"
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
export const EMOTE_KEYS = ["flame", "heart", "star", "clap", "laugh", "crown", "sword", "skull"] as const;
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
  /** Podyum anında takılı unvan (kazanılmış rozetlerden biri). */
  title?: BadgeKey;
  /** Podyum anındaki ligi — kozmetik çerçeve/animasyon için (depo yoksa yok). */
  league?: LeagueKey;
}

/** Maç özeti kartı (4d). İzleyen oyuncuya ÖZEL hesaplanır (isabet/seri/kategori
 *  senindir); "fastest" ise masa geneli en hızlı doğru cevaptır. Yalnız podyumda. */
/** §6.3 anlar kartı: maçın unutulmaz anı — podyumda masa geneli gösterilir. */
export interface MatchMoment {
  key: "fastest" | "streak" | "bigBet" | "flawless";
  playerId: string;
  name: string;
  /** ms (fastest), üst üste doğru (streak), tek tur kazanç (bigBet), maç uzunluğu (flawless). */
  value: number;
}

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
/** Çember'in seçilebilir tur sayıları (klasik setle kesişir ama 20 burada). */
export const CIRCLE_COUNTS = [10, 15, 20] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number] | (typeof CIRCLE_COUNTS)[number];
/** Soru sayısı ayarının anlam taşımadığı modlar — tur sayısı mod sözleşmesi ya da
 *  havuz boyutuyla sabittir: duel hep 7 soru, word/blitz/board sayıyı yok sayar.
 *  Lobi çipi bu modlarda gizlenir; sunucu da isteği reddeder. */
export const COUNTLESS_MODES: readonly GameMode[] = ["duel", "word", "blitz", "board"];
/** §6.3 masa temaları: host'un ligi tema kapısını açar — tema tüm masaya uygulanır. */
export const TABLE_THEMES = [
  { key: "tavern", league: "acemi" },
  { key: "forest", league: "cirak" },
  { key: "ember", league: "kalfa" },
  { key: "royal", league: "usta" },
  { key: "void", league: "efsane" },
] as const;
export type TableTheme = (typeof TABLE_THEMES)[number]["key"];
/** Klasik/Takım/Son Masa/Çifte Bahis'te seçilebilir soru süreleri (ms). Süreye
 *  bağlı modlar (Çember/Fitil/Bulanık/Kelime) kendi sabitini kullanır. */
export const QUESTION_TIMES = [10_000, 15_000, 20_000] as const;
export type QuestionTimeMs = (typeof QUESTION_TIMES)[number];

export interface GameState {
  phase: Phase;
  gameMode: GameMode;
  /** Masa ayarı: sonraki maçın soru sayısı. Çember'de tur sayısı olarak okunur. */
  questionCount: QuestionCount;
  /** Masa ayarı: zorluk filtresi; null = karışık (tüm zorluklar). Tüm modlara uygulanır. */
  difficulty: Difficulty | null;
  /** Masa teması (§6.3): host'un liginin açtığı görsel kimlik, tüm masada. */
  tableTheme: TableTheme;
  /** Masa ayarı: soru süresi (ms); null = mod varsayılanı. Yalnız klasik/takım/
   *  elim/bet'te geçerli. */
  questionTimeMs: number | null;
  /** Masa ayarı: hız bonusu açık mı. Kapalıyken doğru cevap yalnız taban puan. */
  speedBonus: boolean;
  /** Masa ayarı: yalnız resimli sorular. Havuz daralırsa resimli havuza düşer. */
  imageOnly: boolean;
  roomId: string;
  hostId: string | null;
  youId: string;
  players: PublicPlayer[]; // skora göre sıralı
  /** Server-authoritative team pools; earned points survive departures. */
  teamScores: readonly [number, number];
  round: { index: number; total: number };
  question: QuestionPayload | null;
  circle: CirclePayload | null;
  /** Kelime Oyunu turu; yalnız o modda ve question fazında dolu. */
  word: WordPayload | null;
  /** Yakın Tahmin turu; yalnız o modda ve question fazında dolu. */
  numeric: NumericQuestionPayload | null;
  /** D/Y Blitz canlı durumu; o modda question fazında dolu (kişisel). */
  blitz: BlitzLivePayload | null;
  /** D/Y Blitz özet tablosu; o modda reveal fazında dolu. */
  blitzSummary: BlitzSummaryPayload | null;
  /** Zaman Çizelgesi turu; o modda question fazında dolu. */
  timeline: TimelineQuestionPayload | null;
  /** Zaman Çizelgesi çözümü; o modda reveal fazında dolu. */
  timelineReveal: TimelineRevealPayload | null;
  /** Sıralama modunda izleyenin kilitlediği dizim (question fazında). */
  yourOrder: number[] | null;
  /** Tavern Panosu: pick fazında pano; question/reveal'da null. */
  board: BoardPayload | null;
  countdown: CountdownPayload | null;
  /** Yalnız Çifte Bahis'te bet fazında dolu; kategori + bankroll taşır. */
  bet: BetPayload | null;
  /** Çifte Bahis: bu tur kilitlediğin bahis (null = henüz yatırmadın). */
  yourBet: number | null;
  /** Sadece kendi seçimin; başkalarınınki reveal'a kadar görünmez */
  yourChoice: number | null;
  /** Çemberde yalnızca oyuncunun kendi kilitlediği cevap görünür. */
  yourCircleAnswer: string | null;
  /** Kelime Oyunu'nda oyuncunun bu turdaki kilitli cevabı. */
  yourWordAnswer: string | null;
  /** Yakın Tahmin: bu tur kilitlediğin tahmin (null = henüz girmedin). */
  yourNumericGuess: number | null;
  /** Tavern kartları: elindeki joker sayısı (Klasik/Takım'da maç başı 1,
   *  her 3'lü seride +1; diğer modlarda 0). */
  yourCards: number;
  /** Bu tur kullandığın joker türü (tur başına bir kart). */
  yourCardUsed: CardType | null;
  /** %50 jokeriyle silinen şık indeksleri — yalnızca jokeri kullanan görür. */
  removedChoices: number[];
  /** Dondur jokeri yedin: bu tur deadline'ın diğerlerinden kısa. */
  youFrozen: boolean;
  reveal: RevealPayload | null;
  circleReveal: CircleRevealPayload | null;
  /** Kelime Oyunu reveal'ı: tam kelime + kazançlar. Yalnız word modunda dolu. */
  wordReveal: CircleRevealPayload | null;
  podium: PodiumEntry[] | null;
  /** Yalnız podyum fazında; izleyen oyuncuya özel maç özeti (4d). */
  matchSummary: MatchSummary | null;
  /** Podyumda masa geneli anlar kartı (§6.3); başka fazda null. */
  moments: MatchMoment[] | null;
  /** Lobide, sonuç ekranından henüz dönmemiş oyuncuya: son maçın sonucu. */
  lastMatch: LastMatch | null;
  /** Podyum fazında gösterilen maçın kimliği (istemci "sonucu gördüm" işareti). */
  lastMatchId: number | null;
  /** Günlük Meydan Okuma maçıysa: gün numarası + podyumdan sonra bu oyuncunun
   *  Wordle-tarzı deseni. Normal maçta null; oynarken pattern null'dır. */
  daily: { day: number; pattern: string | null } | null;
  answeredCount: number;
  eligibleCount: number;
  /** Bu turun ilk kilitleyeni ("en hızlı parmak"); istemci şeritte tek seferlik
   *  parıltı gösterir. Tur başında null'a döner. */
  firstAnswerId: string | null;
  /** İzleyici misin: koltuğun yok, oynamıyorsun ama masayı ve maçı görüyorsun. */
  youAreSpectator: boolean;
  /** Masayı izleyen (oyuncu olmayan) kişi sayısı. */
  spectatorCount: number;
  /** Podyumda rövanş oylaması; diğer fazlarda null. Oy sayısı bağlı
   *  (oynamayan bot hariç) oyuncuların yarısından fazlasına ulaşınca sunucu
   *  host'u beklemeden yeni maçı başlatır. */
  rematch: { votes: number; needed: number; youVoted: boolean } | null;
  /** İzleyicinin kazanan tahmini (playerId) — oyuncularda her zaman null.
   *  §6.3: maç başında yapılır, bilene +XP. */
  yourPrediction: string | null;
  /** Tahmin penceresi açık mı: geri sayım + ilk tur (ilk reveal'e kadar). */
  predictOpen: boolean;
  minPlayers: number;
  /** Boş dizi, tüm kategorilerin karışık kullanılacağı anlamına gelir. */
  categorySelection: string[];
  /** Masa ayarı: özel soru paketi; null = standart havuz. Çember kendi
   *  prompt havuzunu kullandığı için paket Çember'de etkisizdir. */
  pack: { id: string; name: string } | null;
  availableCategories: CategoryOption[];
  devMode: boolean;
  /** İzleyenin kalıcı ilerlemesi; ilerleme deposu yoksa/null oyuncuda null. */
  progress: ProgressSnapshot | null;
  /** Yalnız podyumda: oyuncu id → bu maçtan kazanılan XP (animasyon için). */
  xpGains: Record<string, XpGain> | null;
  /** Güncel sezon lider tablosu (lobi + podyum); depo kapalıysa null. */
  seasonBoard: SeasonBoard | null;
  /** Haftalık turnuva tablosu (§6.3): geçerli ISO haftası; season alanı 'YYYY-Www'. */
  weeklyBoard: SeasonBoard | null;
  /** Tüm zamanlar prestij tablosu: toplam XP ilk 5; season alanı 'all'. */
  allTimeBoard: SeasonBoard | null;
  /** Soru yazarı turu: lobide soru yazmış oyuncu id'leri. */
  writers: string[];
  /** Zil modu: bu tur zili kazanan oyuncu + bu turda yanlış cevaplamışlar.
   *  Diğer modlarda null. */
  zil: { winnerId: string | null; failedIds: string[] } | null;
  /** Bugünün günlük lider tablosu (lobi); depo kapalıysa null. */
  dailyBoard: DailyBoard | null;
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
  BUZZ: "buzz",
  ANSWER: "answer",
  CIRCLE_ANSWER: "circle-answer",
  /** Kelime Oyunu: { answer } — turun kelime cevabını kilitler */
  WORD_ANSWER: "word-answer",
  /** Kelime Oyunu: payload yok — herkes için ortak bir harf açar, değer düşer */
  WORD_LETTER: "word-letter",
  /** Yakın Tahmin: { value } — turun sayısal tahminini kilitler */
  NUMERIC_ANSWER: "numeric-answer",
  ORDER_ANSWER: "order-answer",
  /** Tavern Panosu: { cell } — sırası gelen oyuncunun seçtiği hücre (düz indeks). */
  PICK_CELL: "pick-cell",
  /** Çifte Bahis: { amount } — bahis fazında yatırılan tutar (0..bankroll) */
  BET: "bet",
  /** Takım modu, yalnız host, lobide: { targetId, team } — oyuncunun takımını değiştirir */
  SET_TEAM: "set-team",
  /** Takım modu, yalnız host, lobide: {} — koltukları rastgele ve dengeli yeniden dağıtır */
  TEAM_SHUFFLE: "team-shuffle",
  /** Tavern kartı: { type: CardType, targetId? } — soru fazında, cevaptan önce, tur başına bir. */
  USE_CARD: "use-card",
  /** Podyumda rövanş oyu: {} — çoğunluk sağlanırsa sunucu yeni maçı başlatır. */
  REMATCH: "rematch",
  /** İzleyici kazanan tahmini: { targetId } — maç başında, pencere kapanmadan. */
  PREDICT: "predict",
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
  SET_THEME: "set-theme",
  SET_QUESTION_TIME: "set-question-time",
  SET_SPEED_BONUS: "set-speed-bonus",
  SET_IMAGE_ONLY: "set-image-only",
  /**
   * Yalnızca masa sahibi: { mode } — masanın modu. Masa AYARIDIR ve yayınlanır:
   * mod her istemcinin yerel seçimi olsaydı, host Fitil'i seçtiğinde diğer
   * oyuncuların merkez diski hâlâ Klasik gösterirdi.
   */
  SET_MODE: "set-mode",
  LEAVE_GAME: "leave-game",
  /** Podyumdan lobiye dön: odada kalınır, host değişmez. */
  RETURN_TO_LOBBY: "return-to-lobby",
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
  /** Unvan seçimi: { title: BadgeKey | null } — yalnız kazanılmış rozet; null kaldırır */
  SET_TITLE: "set-title",
  /** Soru yazarı turu: { text, choices[4], correctIndex } — lobide, oyuncu başına bir; ikinci gönderim üzerine yazar */
  SUBMIT_QUESTION: "submit-question",
  /** Yazılan soruyu geri alır: {} — lobide, yalnız kendi sorunu */
  DELETE_QUESTION: "delete-question",
} as const;
