import fs from "node:fs";
import type { Difficulty } from "../../shared/types";

/** Zaman Çizelgesi (§6.1) soru tipi: 4 olay kronolojik sıraya dizilir.
 *  `year` sıralama anahtarı (MÖ negatif); `when` reveal'da gösterilen etiket.
 *  Klasik `Question`'dan ayrı havuz — doğru sıra reveal'a dek sızıntısız. */
export interface OrderEvent {
  label: string;
  labelEn: string;
  year: number;
  when: string;
  whenEn: string;
}
export interface OrderQuestion {
  id: string;
  category: string;
  text: string;
  textEn: string;
  events: OrderEvent[];
  difficulty: Difficulty;
}

function load(): OrderQuestion[] {
  const url = new URL("../data/questions-order.json", import.meta.url);
  const raw = JSON.parse(fs.readFileSync(url, "utf-8"));
  if (!Array.isArray(raw)) throw new Error("questions-order.json bir dizi olmalı");
  const seen = new Set<string>();
  raw.forEach((q, i) => {
    const where = `questions-order.json[${i}]${q?.id ? ` (${q.id})` : ""}`;
    if (typeof q.id !== "string" || !q.id) throw new Error(`${where}: id eksik`);
    if (seen.has(q.id)) throw new Error(`${where}: id tekrar ediyor`);
    seen.add(q.id);
    if (typeof q.category !== "string" || !q.category) throw new Error(`${where}: category eksik`);
    if (typeof q.text !== "string" || q.text.length < 5) throw new Error(`${where}: text eksik`);
    if (typeof q.textEn !== "string" || q.textEn.length < 5) throw new Error(`${where}: textEn eksik`);
    if (!Array.isArray(q.events) || q.events.length !== 4) throw new Error(`${where}: events 4 olmalı`);
    const years = new Set<number>();
    q.events.forEach((e: Partial<OrderEvent>, j: number) => {
      const ew = `${where}.events[${j}]`;
      if (typeof e.label !== "string" || !e.label) throw new Error(`${ew}: label eksik`);
      if (typeof e.labelEn !== "string" || !e.labelEn) throw new Error(`${ew}: labelEn eksik`);
      if (typeof e.year !== "number" || !Number.isFinite(e.year)) throw new Error(`${ew}: year sayı olmalı`);
      if (years.has(e.year)) throw new Error(`${ew}: year tekrar ediyor — belirsiz sıra`);
      years.add(e.year);
      if (typeof e.when !== "string" || !e.when) throw new Error(`${ew}: when eksik`);
      if (typeof e.whenEn !== "string" || !e.whenEn) throw new Error(`${ew}: whenEn eksik`);
    });
    if (!(["kolay", "orta", "zor"] as const).includes(q.difficulty))
      throw new Error(`${where}: difficulty "${q.difficulty}" geçersiz`);
  });
  return raw as OrderQuestion[];
}

export const ALL_ORDER: OrderQuestion[] = load();

/** Maç için `count` soru çeker; havuz yetmezse `seen`'i yok sayarak tamamlar. */
export function sampleOrderQuestions(count: number, seen: Set<string> = new Set()): OrderQuestion[] {
  const pool = ALL_ORDER.filter((q) => !seen.has(q.id));
  const fresh = pool.length >= count ? pool : ALL_ORDER.slice();
  const bag = fresh.slice();
  const out: OrderQuestion[] = [];
  while (out.length < count && bag.length) {
    out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    seen.add(out[out.length - 1].id);
  }
  return out;
}
