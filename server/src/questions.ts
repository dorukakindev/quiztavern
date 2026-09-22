import fs from "node:fs";
import type { Difficulty } from "../../shared/types";

const DIFFICULTIES: readonly Difficulty[] = ["kolay", "orta", "zor"];

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
  });
  return raw as Question[];
}

export const ALL_QUESTIONS: Question[] = load();
console.log(`[sorular] ${ALL_QUESTIONS.length} soru yüklendi`);

/** Havuzdan n soruyu, şık sırasını da karıştırarak örnekler */
function shuffle<T>(items: T[]): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Kategori + zorluk filtresini uygular. Zorluk seçili ama o havuz boşsa (dar
 *  kategori+zorluk kombinasyonu) kategori havuzuna düşer — maç boş kalmasın. */
function effectiveQuestionPool(categories: string[], difficulty: Difficulty | null): Question[] {
  const byCat = categories.length ? ALL_QUESTIONS.filter((q) => categories.includes(q.category)) : ALL_QUESTIONS;
  const catPool = byCat.length ? byCat : ALL_QUESTIONS;
  if (!difficulty) return catPool;
  const byDiff = catPool.filter((q) => q.difficulty === difficulty);
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
 */
export function sampleQuestions(n: number, categories: string[] = [], exclude: Set<string> = new Set(), difficulty: Difficulty | null = null): Question[] {
  const source = effectiveQuestionPool(categories, difficulty);
  // Resimli/resimsiz havuzları AYRI karıştır: her birinde taze-önce sırası
  // korunur, sonra hedef sayıda resimli soru diğerleriyle harmanlanır.
  // Kategori/zorluk filtresi resimli soru içermiyorsa hedef otomatik 0'a
  // düşer (min(havuz, hedef)) — zorlama yok, maç normal devam eder.
  const pictures = source.filter((q) => q.image);
  const texts = source.filter((q) => !q.image);
  const pictureFresh = shuffle(pictures.filter((q) => !exclude.has(q.id)));
  const pictureUsed = shuffle(pictures.filter((q) => exclude.has(q.id)));
  const picturePool = [...pictureFresh, ...pictureUsed];
  const textFresh = shuffle(texts.filter((q) => !exclude.has(q.id)));
  const textUsed = shuffle(texts.filter((q) => exclude.has(q.id)));
  const textPool = [...textFresh, ...textUsed];
  const { min, max } = pictureQuota(n);
  const pictureTarget = Math.min(picturePool.length, n, randomInt(min, max));
  const selected = [...picturePool.slice(0, pictureTarget), ...textPool.slice(0, n - pictureTarget)];
  // Resimli sorular maçın sabit bir yerinde (ör. hep ilk sıralarda) kümelenmesin
  // diye seçilenler tekrar karıştırılır — sıra tamamen rastgele.
  const pool = shuffle(selected);
  // Maç-İÇİ TEKRAR YOK: benzersiz döner (en çok n). Havuz n'den küçükse (dar
  // kategori/zorluk) maç kısalır ama aynı soru iki kez çıkmaz — eski modulo
  // tek-kategoride tekrar ediyordu. Çağıran gerçek uzunluğu sonuç.length'ten okur
  // (rooms: klasik roundLimit = questions.length). Çemberle aynı davranış.
  return pool.slice(0, n).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      ...q,
      choices: order.map((k) => q.choices[k]),
      choicesEn: order.map((k) => q.choicesEn[k]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
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
export function resetExhaustedSubpools(categories: string[], difficulty: Difficulty | null, seen: Set<string>, lastIds: Set<string>, roundLimit: number): Set<string> {
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
