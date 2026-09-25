import fs from "node:fs";
import type { Difficulty } from "../../shared/types";
import { log } from "./logger";

export const DIFFICULTIES: readonly Difficulty[] = ["kolay", "orta", "zor"];

export interface Question {
  id: string;
  category: string;
  text: string;
  choices: string[];
  /** İngilizce arayüz için çeviri; kategori adı istemcide sabit sözlükle çevrilir. */
  textEn: string;
  choicesEn: string[];
  correctIndex: number;
  difficulty: Difficulty;
  /** Opsiyonel: client/public/questions/<image> altındaki dosya adı. Varsa
   *  soru ekranında metnin üstünde gösterilir. Yoksa (çoğu soru) hiç render edilmez. */
  image?: string;
  /** Opsiyonel: görselin kredi/atıf satırı; `image` varken anlamlı, istemci ⓘ ile gösterir. */
  imageCredit?: string;
  /** Opsiyonel: doğru cevapla ilgili kısa trivia notu — reveal'da "Biliyor muydun?" satırı olarak gösterilir. */
  fact?: string;
  /** fact'in İngilizce karşılığı. */
  factEn?: string;
}

// Sorular başlangıçta bir kez yüklenir ve şema kontrolünden geçirilir.
// Bozuk bir soru dosyasıyla sunucu hiç ayağa kalkmamalı — sessizce yanlış
// cevap göstermekten iyidir.
function load(): Question[] {
  const url = new URL("../data/questions.json", import.meta.url);
  const raw = JSON.parse(fs.readFileSync(url, "utf-8"));
  if (!Array.isArray(raw)) throw new Error("questions.json bir dizi olmalı");

  const seen = new Set<string>();
  raw.forEach((q, i) => {
    const where = `questions.json[${i}]${q?.id ? ` (${q.id})` : ""}`;
    if (typeof q.id !== "string" || !q.id) throw new Error(`${where}: id eksik`);
    if (seen.has(q.id)) throw new Error(`${where}: id tekrar ediyor`);
    seen.add(q.id);
    if (typeof q.category !== "string" || !q.category)
      throw new Error(`${where}: category eksik`);
    if (typeof q.text !== "string" || q.text.length < 5)
      throw new Error(`${where}: text eksik`);
    if (!Array.isArray(q.choices) || q.choices.length !== 4)
      throw new Error(`${where}: tam 4 şık olmalı`);
    if (new Set(q.choices).size !== 4)
      throw new Error(`${where}: şıklar birbirinden farklı olmalı`);
    if (typeof q.textEn !== "string" || q.textEn.length < 5)
      throw new Error(`${where}: textEn eksik`);
    if (!Array.isArray(q.choicesEn) || q.choicesEn.length !== 4)
      throw new Error(`${where}: tam 4 İngilizce şık olmalı`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3)
      throw new Error(`${where}: correctIndex 0-3 arasında olmalı`);
    if (!DIFFICULTIES.includes(q.difficulty))
      throw new Error(`${where}: difficulty "kolay" | "orta" | "zor" olmalı`);
    if (q.image !== undefined && (typeof q.image !== "string" || !q.image))
      throw new Error(`${where}: image verilmişse boş olmayan bir dosya adı olmalı`);
    if (q.imageCredit !== undefined && (typeof q.imageCredit !== "string" || !q.imageCredit))
      throw new Error(`${where}: imageCredit verilmişse boş olmayan bir metin olmalı`);
    if (q.fact !== undefined && (typeof q.fact !== "string" || !q.fact))
      throw new Error(`${where}: fact verilmişse boş olmayan bir metin olmalı`);
    if (q.factEn !== undefined && (typeof q.factEn !== "string" || !q.factEn))
      throw new Error(`${where}: factEn verilmişse boş olmayan bir metin olmalı`);
  });
  return raw as Question[];
}

export const ALL_QUESTIONS: Question[] = load();
log.info({ count: ALL_QUESTIONS.length }, "sorular yüklendi");

/** Havuzdan n soruyu, şık sırasını da karıştırarak örnekler */
function shuffle<T>(items: T[]): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Tek bir sorunun şık sırasını karıştırır; doğru index yeni yerine taşınır.
 *  Standart havuz, özel paket, oyuncu-yazarı ve günlük soruların hepsi bundan
 *  geçer — verideki pozisyon eğriliği (ilk şık ağırlığı) oyuna sızmasın. */
export function shuffleChoices(q: Question): Question {
  const order = shuffle([0, 1, 2, 3]);
  return {
    ...q,
    choices: order.map((k) => q.choices[k]),
    choicesEn: order.map((k) => q.choicesEn[k]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

/** §6.3 zorluk kalibrasyonu: istatistiğe göre etiketi düzeltilen sorular.
 *  question_id → kalibre zorluk. Server açılışında ve her maç sonrası tazelenir. */
const calibrated = new Map<string, Difficulty>();
/** Rapor döngüsü: en az N farklı oyuncu bildirdiğinde soru servis dışı
 *  kalır. index.ts her yeni rapor ve açılışta tazeler. */
const suppressed = new Set<string>();
export function setSuppressedQuestions(ids: Set<string>): void {
  suppressed.clear();
  ids.forEach((id) => suppressed.add(id));
}
const DIFF_ORDER: readonly Difficulty[] = ["kolay", "orta", "zor"];
/** En az bu kadar sorulmuş soru kalibre edilir (az örnekle etiket değiştirme). */
const CALIBRATION_MIN_ASKED = 20;
const CALIBRATION_HARD_RATE = 0.25; // altı: etiketten daha zor
const CALIBRATION_EASY_RATE = 0.85; // üstü: etiketten daha kolay

/** Ham istatistik satırlarından kalibrasyon haritasını kurar (bir kademe kaydırır). */
export function setQuestionCalibration(stats: readonly { questionId: string; asked: number; correct: number }[]): void {
  calibrated.clear();
  const labelOf = new Map(ALL_QUESTIONS.map((q) => [q.id, q.difficulty] as const));
  for (const row of stats) {
    if (row.asked < CALIBRATION_MIN_ASKED) continue;
    const label = labelOf.get(row.questionId);
    if (!label) continue;
    const rate = row.correct / row.asked;
    const i = DIFF_ORDER.indexOf(label);
    if (rate < CALIBRATION_HARD_RATE && i < DIFF_ORDER.length - 1) calibrated.set(row.questionId, DIFF_ORDER[i + 1]);
    else if (rate > CALIBRATION_EASY_RATE && i > 0) calibrated.set(row.questionId, DIFF_ORDER[i - 1]);
  }
}

/** Etiket yerine kalibre değer varsa onu döner. Puanlama da aynı etkin
 *  zorluğu kullanır (etiket yanlışsa ödül de düzelir). */
export function effectiveDifficulty(q: Question): Difficulty {
  return calibrated.get(q.id) ?? q.difficulty;
}

/** Kategori + zorluk filtresini uygular. Zorluk seçili ama o havuz boşsa (dar
 *  kategori+zorluk kombinasyonu) kategori havuzuna düşer — maç boş kalmasın. */
function effectiveQuestionPool(categories: string[], difficulty: Difficulty | null): Question[] {
  // Bildirilen sorular havuzdan düşer; havuz tamamen boşalarsa fallback olarak
  // ham havuza döner (soru hatası maçı hiç kilitlemesin).
  const visible = ALL_QUESTIONS.filter((q) => !suppressed.has(q.id));
  const base = visible.length ? visible : ALL_QUESTIONS;
  const byCat = categories.length ? base.filter((q) => categories.includes(q.category)) : base;
  const catPool = byCat.length ? byCat : base;
  if (!difficulty) return catPool;
  const byDiff = catPool.filter((q) => effectiveDifficulty(q) === difficulty);
  return byDiff.length ? byDiff : catPool;
}

/** n'e göre resimli soru kotası: her maçta en az 1 (varsa), uzun maçta biraz
 *  daha fazlasına izin — ama hiçbir zaman baskın olmasın (bkz. sampleQuestions). */
function pictureQuota(n: number): { min: number; max: number } {
  if (n <= 5) return { min: 1, max: 1 };
  if (n <= 10) return { min: 1, max: 2 };
  return { min: 1, max: 3 };
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @param exclude Önceki maçta kullanılan soru id'leri. "Aynı masayla devam"
 *   ederken art arda maçların tekrar olmaması için TAZE sorular önce gelir;
 *   taze olanlar n'e yetmezse kullanılanlarla tamamlanır (maç hep dolu kalır).
 * @param difficulty null = karışık (tüm zorluklar).
 * @param imageOnly Bulanık Resim: havuz yalnız resimli sorulardan kurulur ve
 *   kota n'e çekilir (resimli soru resimsizle harmanlanmaz). Kategori/zorluk
 *   filtresi resimli soru içermiyorsa tüm resimli havuza düşer.
 */
export function sampleQuestions(n: number, categories: string[] = [], exclude: Set<string> = new Set(), difficulty: Difficulty | null = null, imageOnly = false): Question[] {
  let source = effectiveQuestionPool(categories, difficulty);
  if (imageOnly) {
    const pictured = source.filter((q) => q.image);
    source = pictured.length ? pictured : ALL_QUESTIONS.filter((q) => q.image);
  }
  // Resimli/resimsiz havuzları AYRI karıştır: her birinde taze-önce sırası
  // korunur, sonra hedef sayıda resimli soru diğerleriyle harmanlanır.
  // Kategori/zorluk filtresi resimli soru içermiyorsa hedef otomatik 0'a
  // düşer (min(havuz, hedef)) — zorlama yok, maç normal devam eder.
  const pictures = source.filter((q) => q.image);
  const { min, max } = imageOnly ? { min: n, max: n } : pictureQuota(n);
  const pictureTarget = Math.min(pictures.length, n, randomInt(min, max));
  // Kategori dengesi: birden çok kategori seçiliyken (ya da seçim yokken tüm
  // havuzda) sorular havuz boyutuna ORANLI değil, kategorilere NÖBETLEŞEREK
  // dağılır — küçük kategori de maçta yerini alır. Her kategori için
  // resimli/resimsiz alt-havuz ayrı tutulur: taze-önce sırası ve resim kotası
  // korunur; bir kategorinin alt-havuzu tükenince sıra diğerlerine geçer.
  const perCat = new Map<string, { pics: Question[]; texts: Question[] }>();
  for (const q of source) {
    const entry = perCat.get(q.category) ?? { pics: [], texts: [] };
    (q.image ? entry.pics : entry.texts).push(q);
    perCat.set(q.category, entry);
  }
  // Taze-önce garantisi GLOBAL kalır: önce tüm kategorilerin taze kuyrukları
  // nöbetleşerek çekilir; toplam taze sayı yetmezse kullanılmış kuyruklar da
  // aynı nöbetle devam eder. Böylece bir kategorinin tazesi bitince diğer
  // kategorilerde hâlâ taze varken erken tekrar başlamaz (küresel semantik).
  const subpools = shuffle([...perCat.keys()]).map((name) => {
    const entry = perCat.get(name)!;
    const split = (list: Question[]) => ({
      fresh: shuffle(list.filter((q) => !exclude.has(q.id))),
      used: shuffle(list.filter((q) => exclude.has(q.id))),
    });
    return { pics: split(entry.pics), texts: split(entry.texts) };
  });
  const drawRoundRobin = (key: "pics" | "texts", count: number): Question[] => {
    const out: Question[] = [];
    let remaining = count;
    for (const queue of ["fresh", "used"] as const) {
      while (remaining > 0) {
        let progressed = false;
        for (const sub of subpools) {
          if (remaining <= 0) break;
          const q = sub[key][queue].shift();
          if (q) { out.push(q); remaining -= 1; progressed = true; }
        }
        if (!progressed) break;
      }
      if (remaining <= 0) break;
    }
    return out;
  };
  const selected = [...drawRoundRobin("pics", pictureTarget), ...drawRoundRobin("texts", n - pictureTarget)];
  // Resimli sorular maçın sabit bir yerinde (ör. hep ilk sıralarda) kümelenmesin
  // diye seçilenler tekrar karıştırılır — sıra tamamen rastgele.
  const pool = shuffle(selected);
  // Maç-İÇİ TEKRAR YOK: benzersiz döner (en çok n). Havuz n'den küçükse (dar
  // kategori/zorluk) maç kısalır ama aynı soru iki kez çıkmaz — eski modulo
  // tek-kategoride tekrar ediyordu. Çağıran gerçek uzunluğu sonuç.length'ten okur
  // (rooms: klasik roundLimit = questions.length). Çemberle aynı davranış.
  return pool.slice(0, n).map(shuffleChoices);
}

/** Verilen kategori+zorluk için etkin havuzdaki TÜM soru id'leri (sampleQuestions
 *  ile aynı seçim mantığı). Tekrar önleme döngüsü havuz boyutunu buradan bilir. */
export function questionPoolIds(categories: string[] = [], difficulty: Difficulty | null = null): string[] {
  return effectiveQuestionPool(categories, difficulty).map((question) => question.id);
}

/**
 * Çağıran (rooms.ts), TÜM havuz bir kez dolaşılana kadar tekrar olmasın diye
 * "unseen < roundLimit" olunca seenQuestionIds'i sıfırlardı. Ama resimli
 * sorular havuzun küçük bir dilimi (~%8-15) iken sampleQuestions her maçta
 * orantısız yüksek bir oranda (kota: bkz. pictureQuota) çekiyor — bu yüzden
 * resimli ALT-HAVUZ, resimsiz alt-havuzdan çok daha erken tükenir.
 *
 * Blanket bir sıfırlama (tüm seen'i temizleyip son turu hariç tutmak) YANLIŞ:
 * küçük resim havuzu erken tükendiğinde tüm resimsiz geçmişi de silip koca
 * metin havuzunun ERKEN tekrar etmesine yol açar (canlı ölçüldü: bir
 * sıfırlamadan sonra bile aynı turda 4, sonraki turlarda sürekli 4-9 tekrar).
 *
 * Bu yüzden iki alt-havuz BAĞIMSIZ döner: hangisi tükendiyse SADECE onun
 * görülmüş id'leri silinir (son tur hariç, sınırda hemen tekrar etmesin),
 * diğer alt-havuzun geçmişi dokunulmadan kalır.
 *
 * ÖNEMLİ (bulunan ikinci hata): eşik "unseen < max" (yani "belki yetmez"
 * kuşku payıyla ERKEN sıfırla) idi. Ama sampleQuestions zaten yetersiz taze
 * kaldığında used havuzundan tamamlıyor (graceful fallback, aşağıya bkz.) —
 * yani erken sıfırlamaya GEREK yok. Erken sıfırlama üstelik ZARARLI: unseen
 * birkaç maçta hemen tekrar "< max" eşiğinin altına düşüp sürekli sıfırlanan
 * bir döngüye kilitleniyor, böylece havuzun son 1-2 kalan sorusu HİÇBİR ZAMAN
 * kendi sırasını bulamıyor ve tur asla gerçek anlamda tamamlanmıyor (canlı
 * ölçüldü: 356 resimlik havuzda unseen=1'e inince sıfırlama ateşliyor, ardından
 * her maç ~2-4 arası kalıp yeniden sıfırlanıyor — döngü hiç bitmiyor, ~%100
 * tekrar oranına kilitleniyor). Doğru eşik: sadece TAM tükenince (unseen=0)
 * sıfırla; ara sırada eksik kalan taze sayıyı sampleQuestions'ın used-fallback'i
 * karşılar (bu, bir turun son 1-2 maçında en fazla birkaç erken tekrara yol
 * açabilir — sürekli/sistemik tekrardan çok daha iyi).
 */
export function resetExhaustedSubpools(categories: string[], difficulty: Difficulty | null, seen: Set<string>, lastIds: Set<string>, _roundLimit: number): Set<string> {
  const source = effectiveQuestionPool(categories, difficulty);
  const pictureIds = new Set(source.filter((q) => q.image).map((q) => q.id));
  const textIds = new Set(source.filter((q) => !q.image).map((q) => q.id));
  const unseenPictures = [...pictureIds].filter((id) => !seen.has(id)).length;
  const unseenTexts = [...textIds].filter((id) => !seen.has(id)).length;
  let next = seen;
  if (pictureIds.size && unseenPictures === 0) {
    next = new Set([...next].filter((id) => !pictureIds.has(id) || lastIds.has(id)));
  }
  if (textIds.size && unseenTexts === 0) {
    next = new Set([...next].filter((id) => !textIds.has(id) || lastIds.has(id)));
  }
  return next;
}
