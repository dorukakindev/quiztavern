import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIFFICULTIES, type Question } from "./questions";

export interface QuestionPackMeta {
  id: string;
  name: string;
  count: number;
  categories: string[];
  createdAt: number;
  createdBy: string;
}

export interface StoredPack extends QuestionPackMeta {
  questions: Question[];
}

const PACKS_DIR = fileURLToPath(new URL("../data/packs", import.meta.url));
const packs = new Map<string, StoredPack>();

export interface PackValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Tek bir soru öğesini Faz 1.4 doğrulayıcısının alan kurallarına göre denetler.
 * Hata listesi döner; `where` rapordaki konum etiketi (ör. "paket[3] (id42)").
 */
export function checkQuestionShape(q: Question, where: string): string[] {
  const errors: string[] = [];
  if (!DIFFICULTIES.includes(q.difficulty)) errors.push(`${where}: difficulty "${q.difficulty}" geçersiz`);
  if (q.choices.length !== 4 || q.choicesEn.length !== 4) errors.push(`${where}: TR ve EN şık sayısı 4 olmalı`);
  if (new Set(q.choices).size !== q.choices.length) errors.push(`${where}: TR şıklar tekrar ediyor`);
  if (new Set(q.choicesEn).size !== q.choicesEn.length) errors.push(`${where}: EN şıklar tekrar ediyor`);
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    errors.push(`${where}: correctIndex 0-3 dışında`);
  } else {
    if (!q.choices[q.correctIndex]) errors.push(`${where}: doğru cevap TR şıklar arasında yok`);
    if (!q.choicesEn[q.correctIndex]) errors.push(`${where}: doğru cevap EN şıklar arasında yok`);
  }
  return errors;
}

/** Paket bütününde denetim: alan kuralları + paket-içi tekrarlar. */
export function validatePackQuestions(questions: Question[]): PackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!questions.length) errors.push("paket boş — en az 1 soru gerekli");
  const seenIds = new Set<string>();
  const seenTexts = new Map<string, string>();
  questions.forEach((q, i) => {
    const where = `paket[${i}]${q.id ? ` (${q.id})` : ""}`;
    if (typeof q.id !== "string" || !q.id) errors.push(`${where}: id eksik`);
    else if (seenIds.has(q.id)) errors.push(`${where}: id tekrar ediyor`);
    if (q.id) seenIds.add(q.id);
    if (typeof q.category !== "string" || !q.category) errors.push(`${where}: category eksik`);
    if (typeof q.text !== "string" || q.text.length < 5) errors.push(`${where}: text eksik`);
    if (typeof q.textEn !== "string" || q.textEn.length < 5) errors.push(`${where}: textEn eksik`);
    if (!Array.isArray(q.choices) || !Array.isArray(q.choicesEn)) {
      errors.push(`${where}: şıklar dizi olmalı`);
    } else {
      errors.push(...checkQuestionShape(q, where));
    }
    const textKey = (q.text ?? "").trim().toLocaleLowerCase("tr-TR");
    if (textKey && seenTexts.has(textKey)) warnings.push(`${where}: "${seenTexts.get(textKey)}" ile aynı soru metni`);
    if (textKey) seenTexts.set(textKey, where);
  });
  return { errors, warnings };
}

/**
 * CSV paket biçimi (ilk satır başlık):
 *   text,textEn,category,difficulty,c1,c2,c3,c4,c1En,c2En,c3En,c4En,correctIndex
 * EN sütunları boş bırakılırsa TR değerler kopyalanır. Ayracı ; veya , olabilir.
 */
export function parseCsvQuestions(content: string): Question[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const rows = lines.map(parseCsvLine(delimiter));
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const index = { text: col("text"), textEn: col("texten"), category: col("category"), difficulty: col("difficulty"), correctIndex: col("correctindex") };
  if (index.text < 0 || index.category < 0 || index.correctIndex < 0) {
    throw new Error("CSV başlığı en az text, category, correctIndex içermeli");
  }
  const choiceCols = [1, 2, 3, 4].map((n) => col(`c${n}`));
  const choiceEnCols = [1, 2, 3, 4].map((n) => col(`c${n}en`));
  if (choiceCols.some((c) => c < 0)) throw new Error("CSV başlığı c1..c4 şık sütunlarını içermeli");
  return rows.slice(1).map((cells, i) => {
    const text = (cells[index.text] ?? "").trim();
    const textEn = index.textEn >= 0 ? (cells[index.textEn] ?? "").trim() : "";
    const choices = choiceCols.map((c) => (cells[c] ?? "").trim());
    const choicesEn = choiceEnCols.some((c) => c >= 0)
      ? choiceEnCols.map((c) => (c >= 0 ? (cells[c] ?? "").trim() : ""))
      : [];
    const filledEn = choicesEn.length === 4 && choicesEn.every((c) => c.length > 0) ? choicesEn : [...choices];
    return {
      id: `csv-${i + 1}`,
      category: (cells[index.category] ?? "").trim(),
      text,
      textEn: textEn || text,
      choices,
      choicesEn: filledEn,
      correctIndex: Number((cells[index.correctIndex] ?? "").trim()),
      difficulty: (index.difficulty >= 0 ? (cells[index.difficulty] ?? "").trim() : "orta") as Question["difficulty"],
    } satisfies Question;
  });
}

/** Basit CSV satır ayrıştırıcı: "..." alanları ve "" kaçışını destekler. */
function parseCsvLine(delimiter: string) {
  return (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; }
          else quoted = false;
        } else current += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { cells.push(current); current = ""; }
      else current += ch;
    }
    cells.push(current);
    return cells;
  };
}

/** JSON paket gövdesini Question[] biçimine normalize eder; eksik id'ler üretilir. */
export function parseJsonQuestions(content: unknown): Question[] {
  const list = Array.isArray(content) ? content : (content as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) throw new Error("JSON bir soru dizisi ya da { questions: [...] } olmalı");
  return list.map((raw, i) => {
    const q = raw as Partial<Question>;
    const choices = Array.isArray(q.choices) ? q.choices.map(String) : [];
    const choicesEn = Array.isArray(q.choicesEn) && q.choicesEn.every((c) => String(c).trim()) ? q.choicesEn.map(String) : [...choices];
    return {
      id: typeof q.id === "string" && q.id ? q.id : `q-${i + 1}`,
      category: String(q.category ?? ""),
      text: String(q.text ?? ""),
      textEn: typeof q.textEn === "string" && q.textEn ? q.textEn : String(q.text ?? ""),
      choices,
      choicesEn,
      correctIndex: Number(q.correctIndex),
      difficulty: q.difficulty as Question["difficulty"],
      ...(typeof q.image === "string" && q.image ? { image: q.image } : {}),
    } satisfies Question;
  });
}

function slugify(name: string): string {
  const slug = name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşöçıi]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "paket";
}

function persist(pack: StoredPack): void {
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PACKS_DIR, `${pack.id}.json`), JSON.stringify(pack, null, 2));
}

function loadAll(): void {
  if (!fs.existsSync(PACKS_DIR)) return;
  for (const file of fs.readdirSync(PACKS_DIR).filter((name) => name.endsWith(".json"))) {
    try {
      const pack = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, file), "utf-8")) as StoredPack;
      const { errors } = validatePackQuestions(pack.questions ?? []);
      if (!pack.id || !pack.name || !Array.isArray(pack.questions) || errors.length) {
        console.warn(`[paketler] ${file} atlandı (${errors[0] ?? "bozuk paket"})`);
        continue;
      }
      packs.set(pack.id, pack);
    } catch (error) {
      console.warn(`[paketler] ${file} okunamadı:`, error);
    }
  }
}

loadAll();
if (packs.size) console.log(`[paketler] ${packs.size} özel soru paketi yüklendi`);

export function listPacks(): QuestionPackMeta[] {
  return [...packs.values()].map(({ questions: _questions, ...meta }) => meta);
}

export function getPack(id: string): StoredPack | null {
  return packs.get(id) ?? null;
}

/** Doğrulanmış soru listesini yeni paket olarak kaydeder; meta'yı döner. */
export function addPack(name: string, questions: Question[], createdBy: string): QuestionPackMeta {
  const base = slugify(name);
  let id = base;
  for (let i = 2; packs.has(id); i++) id = `${base}-${i}`;
  const pack: StoredPack = {
    id,
    name: name.slice(0, 60),
    count: questions.length,
    categories: [...new Set(questions.map((q) => q.category))],
    createdAt: Date.now(),
    createdBy,
    questions,
  };
  packs.set(id, pack);
  persist(pack);
  const { questions: _q, ...meta } = pack;
  return meta;
}

function shuffle<T>(items: T[]): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * Paketten n soru örnekler: taze (önceki maçlarda görülmemiş) sorular önce,
 * yetmezse görülenlerle tamamlanır — maç hiç boş kalmaz.
 */
export function samplePackQuestions(n: number, questions: Question[], exclude: Set<string>): Question[] {
  const fresh = shuffle(questions.filter((q) => !exclude.has(q.id)));
  const used = shuffle(questions.filter((q) => exclude.has(q.id)));
  return [...fresh, ...used].slice(0, n);
}
