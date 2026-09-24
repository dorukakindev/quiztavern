import crypto from "node:crypto";
import { resolve } from "node:path";
import { RECONNECT_GRACE_MS } from "../../shared/types";
import { log } from "./logger";

// .env varsa yükle (Node 21+ yerleşik desteği; dosya yoksa sessizce geç)
try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* .env yok — env değişkenleri veya varsayılanlar kullanılır */
}

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : v === "1" || v.toLowerCase() === "true";

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const HOST = process.env.HOST?.trim() || "127.0.0.1";

// Asıl güvenlik sınırı: sahte (mock) kimlikle bağlantı SADECE bu bayrak
// açıkça true iken kabul edilir. Varsayılan ve tanımsız hali: reddet
// (fail-closed). Yalnızca yerel geliştirmede ALLOW_MOCK_AUTH=1 verilir;
// secret'ların varlığına/yokluğuna göre asla kendiliğinden açılmaz.
export const ALLOW_MOCK_AUTH = bool(process.env.ALLOW_MOCK_AUTH, false);

const configuredPort = process.env.PORT ?? "3001";
export const PORT = Number(configuredPort);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error(`PORT must be an integer between 1 and 65535 (received: ${configuredPort}).`);
}

const normalizePublicBaseUrl = (value: string | undefined) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
};

export const PUBLIC_BASE_URL = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL)
  || (IS_PRODUCTION ? "" : `http://localhost:${PORT}`);
export const DISCORD_OAUTH_REDIRECT_URI = PUBLIC_BASE_URL
  ? `${PUBLIC_BASE_URL}/auth/discord/callback`
  : "";

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => normalizePublicBaseUrl(origin.trim()))
  .filter(Boolean);
export const ALLOWED_ORIGINS = [...new Set([
  ...configuredOrigins,
  ...(PUBLIC_BASE_URL ? [PUBLIC_BASE_URL] : []),
])];

export function isAllowedProductionOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".discordsays.com");
  } catch {
    return false;
  }
}

export const SESSION_SECRET =
  process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET && !ALLOW_MOCK_AUTH) {
  log.warn("SESSION_SECRET tanımlı değil; her yeniden başlatmada oturumlar geçersiz olur.");
}

if (IS_PRODUCTION) {
  const missing = [
    !DISCORD_CLIENT_ID && "DISCORD_CLIENT_ID",
    !DISCORD_CLIENT_SECRET && "DISCORD_CLIENT_SECRET",
    !DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !process.env.SESSION_SECRET && "SESSION_SECRET",
    (!PUBLIC_BASE_URL.startsWith("https://")) && "PUBLIC_BASE_URL (https)",
  ].filter(Boolean);
  if (ALLOW_MOCK_AUTH) {
    throw new Error("ALLOW_MOCK_AUTH cannot be enabled in production.");
  }
  if (missing.length) {
    throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  }
}

// Oyun sabitleri — playtest sonrası buradan ayarlanır
export const GAME = {
  COUNTDOWN_MS: 3_000,
  QUESTION_MS: 15_000,
  CIRCLE_QUESTION_MS: 12_000,
  BLUR_QUESTION_MS: 12_000,
  // Fitil: soru 8 sn'den başlar; maçta her doğru cevap veren tur fitili 0,5 sn
  // kısaltır (4 sn tabanı). Gerilim maç ilerledikçe büyür.
  LIGHTNING_START_MS: 8_000,
  LIGHTNING_STEP_MS: 500,
  LIGHTNING_MIN_MS: 4_000,
  // Kelime Oyunu: 14 tur (4-10 harf × 2), tek ortak zaman havuzu, harf başına 100.
  WORD_ROUNDS: 14,
  WORD_LETTER_POINTS: 100,
  WORD_POOL_MS: 360_000,
  WORD_ROUND_MS: 45_000,
  // 3000: geri sayim cizgisi ilk karede "3 sn" gosterir. 3500 iken Math.ceil
  // yukari yuvarlayip "4 saniye" yaziyordu, spec "3 saniye" diyordu (belge).
  REVEAL_MS: 3_000,
  QUESTIONS_PER_MATCH: 10,
  /** Soru yazarı turu: maç başına karışan oyuncu-yazarı soru üst sınırı. */
  WRITTEN_PER_MATCH: 4,
  CIRCLE_PROMPTS_PER_MATCH: 20,
  // Çifte Bahis: soru öncesi bahis fazının süresi + herkesin başladığı bankroll.
  // Bu modda skor = para: doğru cevap bahsi katlar (+bahis), yanlış bahsi yakar
  // (−bahis), yani skor aşağı da inebilir.
  BET_MS: 9_000,
  BET_STARTING_BANKROLL: 1000,
  // Bakiyesi 0'a düşen oyuncu elenmiş gibi kalmasın: bahis yapamaz ama o
  // soruyu doğru bilirse bu kadar kazanır (kurtarma turu).
  BET_BROKE_REWARD: 50,
  /** "Hepsi" bahsi kazanırsa toplam iade çarpanı (bahis dahil): 1000 → +1500. */
  BET_ALL_IN_MULTIPLIER: 2.5,

  /** Son Masa: oyuncu başına can. Yanlış ya da cevapsız tur 1 can götürür;
   *  0'a düşen elenir, son kalan kazanır. */
  ELIM_LIVES: 3,
  /** Düello (§6.1): 1'e 1, 7 soru — masadaki ilk iki oyuncu kapışır, gerisi
   *  izleyici olarak kazananı tahmin eder. */
  DUEL_QUESTIONS: 7,
  /** Zil (§6.1): zili kazananın cevap penceresi (üstü ayrıca turun genel
   *  süresiyle sınırlı). */
  ZIL_ANSWER_MS: 5_000,
  /** Zil: doğru cevabın değeri her denemede bu kadar düşer (1. deneme taban). */
  ZIL_BASE: 500,
  ZIL_DECAY: 100,
  ZIL_MIN: 100,
  /** Yanlış cevaplayan basanın kaybı (§6.1: "yanlışsa −puan"). */
  ZIL_PENALTY: 200,
  /** Yakın Tahmin (§6.1): en yakın tahmine taban puan; tam isabete bonus eklenir. */
  NUMERIC_BASE: 400,
  NUMERIC_EXACT: 200,
  /** D/Y Blitz (§6.1): tek 60 sn'lik pencere; herkes kendi hızında ilerler.
   *  Puan = BASE + STEP·min(seri-1, CAP); yanlış seriyi sıfırlar. Havuz,
   *  oyuncu başına düşen akışı besleyecek kadar büyük örneklenir. */
  BLITZ_TOTAL_MS: 60_000,
  BLITZ_BASE: 100,
  BLITZ_STREAK_STEP: 25,
  BLITZ_STREAK_CAP: 4,
  BLITZ_POOL: 30,
  /** Zaman Çizelgesi (§6.1): 4 olayı sıralama süresi; her doğru pozisyon ayrı puan. */
  TIMELINE_MS: 20_000,
  TIMELINE_PER_POS: 100,
  /** Tavern Panosu: hücre seçim süresi (sırası gelen oyuncu için). */
  PICK_MS: 10_000,
  /** Pano sütun sayısı ve satır değerleri (değer arttıkça soru zorlaşır). */
  BOARD_COLS: 5,
  BOARD_VALUES: [100, 200, 300, 400, 500] as const,
  /** Tavern kartı Dondur: yiyen oyuncunun cevap süresi bu kadar kısalır. */
  CARD_FREEZE_MS: 3_000,
  /** İzleyici kazanan tahmini: doğru bilene verilen XP. */
  PREDICT_XP: 25,
  /** Kategori ustalığı (§6.4): kategori başına bu kadar doğruyu geçen
   *  oyuncu o kategorinin ustası olur — rozeti + kategori ikonunda işaret. */
  MASTERY_CORRECT: 50,
  MAX_PLAYERS: 8,
  // Solo oynanabilir: masa arkadaş beklemek zorunda değil, tek kişi de oyuncudur.
  MIN_PLAYERS: 1,
  /** Takım modunda doğru takım cevabı kazandırır (çoğunluk oyu, bağda kaptan). */
  TEAM_VOTE_PTS: 100,
  BASE_POINTS: 700,
  SPEED_POINTS: 300,
  /** Zorluk bonusu: tabana eklenir (hız bileşeni ayrı kalır — hız hâlâ saf
   *  süreyle ölçülür). Karışık maçta zor soru daha çok kazandırır.
   *  Yalnız klasik şemalı modlar: zil/pano/blitz/bahis kendi değer
   *  şemasını kullanır, bunlara dokunmaz. */
  DIFF_BONUS: { kolay: 0, orta: 60, zor: 120 } as const,
  // Çember: yalnız en hızlı 3 doğru puanlanır — gerisi +0 (doğru bilen 4.+ puansız kalır).
  CIRCLE_RANK_POINTS: [450, 320, 220] as const,
  // Tek kaynak: istemci de aynı sabitten sayar (bkz. shared/types.ts).
  RECONNECT_GRACE_MS,
  ROOM_TTL_MS: 5 * 60_000,
} as const;

if (ALLOW_MOCK_AUTH) {
  log.warn("ALLOW_MOCK_AUTH açık — Discord kimlik doğrulaması atlanıyor, sahte oyuncular ve botlar aktif. ÜRETİMDE ASLA KULLANMAYIN.");
} else {
  if (!DISCORD_CLIENT_SECRET) {
    log.warn(
      "Mock auth kapalı ve DISCORD_CLIENT_SECRET tanımsız — hiçbir istemci doğrulanamaz. " +
        "Yerel geliştirme için ALLOW_MOCK_AUTH=1, üretim için Discord kimlik bilgilerini tanımlayın."
    );
  }
  if (!DISCORD_BOT_TOKEN) {
    log.warn("DISCORD_BOT_TOKEN tanımsız — Activity Instance doğrulaması yapılamayacağı için bağlantılar REDDEDİLİR (fail-closed).");
  }
}
