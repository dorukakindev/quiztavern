/** Zorluk filtresi: seçili zorlukta yalnız o zorluk gelmeli; dar kategori+zorluk
 *  kombinasyonu havuzu boşaltırsa kategori havuzuna düşmeli (maç boş kalmasın). */
import { sampleQuestions } from "../src/questions";
import { sampleCirclePrompts } from "../src/circle";
import type { Difficulty } from "../../shared/types";

let ok = true;
const log = (pass: boolean, m: string) => {
  console.log(`${pass ? "✓" : "✗"} ${m}`);
  ok = ok && pass;
};

for (const d of ["kolay", "orta", "zor"] as Difficulty[]) {
  const qs = sampleQuestions(20, [], new Set(), d);
  const allD = qs.every((q) => q.difficulty === d);
  log(allD, `Klasik "${d}": ${qs.length} soru, hepsi ${d} mi -> ${allD}`);
  const cs = sampleCirclePrompts(20, [], new Set(), d);
  const allC = cs.every((p) => p.difficulty === d);
  log(allC, `Çember "${d}": ${cs.length} prompt, hepsi ${d} mi -> ${allC}`);
}

// Karışık (null): birden çok zorluk gelebilir.
const mixed = sampleQuestions(30, [], new Set(), null);
const diffCount = new Set(mixed.map((q) => q.difficulty)).size;
log(diffCount >= 2, `Karışık: ${diffCount} farklı zorluk karışmış (>=2)`);

// Fallback: çok dar kategori+zorluk -> yine dolu maç (kategori havuzuna düşer).
const narrow = sampleQuestions(10, ["Fizik"], new Set(), "zor");
log(narrow.length === 10, `Fallback: Fizik+zor -> ${narrow.length} soru (dolu mu: ${narrow.length === 10})`);

console.log(ok ? "✓ Zorluk filtresi + fallback çalışıyor" : "✗ SORUN VAR");
process.exit(ok ? 0 : 1);
