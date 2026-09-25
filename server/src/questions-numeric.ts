import fs from "node:fs";
import type { Difficulty } from "../../shared/types";

/** Yakın Tahmin (§6.1) soru tipi: cevap bir sayı. Klasik `Question`'dan ayrı
 *  havuz — şık/correctIndex yok, `answer` reveal'a dek istemciye gönderilmez. */
export interface NumericQuestion {
  id: string;
  category: string;
  text: string;
  textEn: string;
  /** Yanıt birimi — istemci giriş kutusunun yanında gösterir. */
  unit: string;
  unitEn: string;
  answer: number;
  difficulty: Difficulty;
  fact?: string;
  factEn?: string;
}

// Şema kontrolü questions.ts ile aynı sözleşmede: bozuk dosyada sunucu hiç
// ayağa kalkmasın, sessizce yanlış sayı göstermektense.
function load(): NumericQuestion[] {
  const url = new URL("../data/questions-numeric.json", import.meta.url);
  const raw = JSON.parse(fs.readFileSync(url, "utf-8"));
  if (!Array.isArray(raw)) throw new Error("questions-numeric.json bir dizi olmalı");
  const seen = new Set<string>();
  raw.forEach((q, i) => {
    const where = `questions-numeric.json[${i}]${q?.id ? ` (${q.id})` : ""}`;
    if (typeof q.id !== "string" || !q.id) throw new Error(`${where}: id eksik`);
    if (seen.has(q.id)) throw new Error(`${where}: id tekrar ediyor`);
    seen.add(q.id);
    if (typeof q.category !== "string" || !q.category) throw new Error(`${where}: category eksik`);
    if (typeof q.text !== "string" || q.text.length < 5) throw new Error(`${where}: text eksik`);
    if (typeof q.textEn !== "string" || q.textEn.length < 5) throw new Error(`${where}: textEn eksik`);
    if (typeof q.unit !== "string" || !q.unit) throw new Error(`${where}: unit eksik`);
    if (typeof q.unitEn !== "string" || !q.unitEn) throw new Error(`${where}: unitEn eksik`);
    if (typeof q.answer !== "number" || !Number.isFinite(q.answer)) throw new Error(`${where}: answer sayı olmalı`);
    if (!(["kolay", "orta", "zor"] as const).includes(q.difficulty))
      throw new Error(`${where}: difficulty "${q.difficulty}" geçersiz`);
  });
  return raw as NumericQuestion[];
}

export const ALL_NUMERIC: NumericQuestion[] = load();

/** Maç için `count` soru çeker; havuz yetmezse `seen`'i yok sayarak
 *  tamamlar (klasik `sampleQuestions` ile aynı tüketme sözleşmesi). */
export function sampleNumericQuestions(count: number, seen: Set<string> = new Set()): NumericQuestion[] {
  const pool = ALL_NUMERIC.filter((q) => !seen.has(q.id));
  const fresh = pool.length >= count ? pool : ALL_NUMERIC.slice();
  const bag = fresh.slice();
  const out: NumericQuestion[] = [];
  while (out.length < count && bag.length) {
    out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    seen.add(out[out.length - 1].id);
  }
  return out;
}
