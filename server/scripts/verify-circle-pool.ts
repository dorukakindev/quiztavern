/** Çember havuzu bütünlüğü: answer gerçekten letter ile başlamalı (Türkçe I/İ),
 *  tek kelime küçük harf, benzersiz category|answer, kategori başına yeterli. */
import { ALL_CIRCLE_PROMPTS } from "../src/circle";

let errors = 0;
const seen = new Set<string>();
const byCat = new Map<string, number>();
for (const p of ALL_CIRCLE_PROMPTS) {
  const firstUpper = p.answer.charAt(0).toLocaleUpperCase("tr-TR");
  if (firstUpper !== p.letter) {
    console.log(`✗ HARF UYUŞMAZ: '${p.answer}' -> ilk '${firstUpper}' ama letter '${p.letter}' (${p.category})`);
    errors++;
  }
  const key = `${p.category}|${p.answer}`;
  if (seen.has(key)) { console.log(`✗ TEKRAR anahtar: ${key}`); errors++; }
  seen.add(key);
  byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
  if (p.answer !== p.answer.toLocaleLowerCase("tr-TR")) { console.log(`✗ küçük harf değil: ${p.answer}`); errors++; }
  if (/\s/.test(p.answer)) { console.log(`✗ boşluk içeriyor: ${p.answer}`); errors++; }
}
console.log(`Toplam: ${ALL_CIRCLE_PROMPTS.length} prompt`);
console.log("Dağılım:", [...byCat.entries()].sort().map(([c, n]) => `${c}:${n}`).join(", "));
const thin = [...byCat.entries()].filter(([, n]) => n < 3);
if (thin.length) { console.log("⚠ 3'ten az:", thin); errors++; }
console.log(errors === 0 ? "✓ Harf-cevap tutarlı, tekrar yok, kategoriler yeterli" : `✗ ${errors} HATA`);
process.exit(errors === 0 ? 0 : 1);
