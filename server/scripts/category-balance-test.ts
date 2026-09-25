import assert from "node:assert/strict";
import { ALL_QUESTIONS, sampleQuestions } from "../src/questions";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const countByCat = (qs: { category: string }[]) => {
  const m = new Map<string, number>();
  for (const q of qs) m.set(q.category, (m.get(q.category) ?? 0) + 1);
  return m;
};

// Bu üç kategorinin resimli sorusu yok → resim kotası 0'a düşer, dağılım
// temiz 3/3/3 olur (resimli kategori seçimi aşağıdaki testte ayrıca).
const NO_PIC_CATS = ["Bilim Kurgu", "İklim & Hava", "Süper Kahramanlar"];

test("çok-kategori maçı nöbetleşerek dağılır (küçük havuz ezilmez)", () => {
  const qs = sampleQuestions(9, NO_PIC_CATS);
  assert.equal(qs.length, 9);
  const m = countByCat(qs);
  for (const cat of NO_PIC_CATS) assert.equal(m.get(cat), 3, `${cat} 3 almalı`);
});

test("resimli kategori içeren seçimde de tüm kategoriler yerini alır", () => {
  const cats = ["Hayvanlar", "Süper Kahramanlar", "Bitkiler"];
  const qs = sampleQuestions(12, cats);
  assert.equal(qs.length, 12);
  const m = countByCat(qs);
  const counts = cats.map((c) => m.get(c) ?? 0);
  for (const [i, cat] of cats.entries()) assert.ok(counts[i] >= 3, `${cat} en az 3 almalı (${counts[i]})`);
  const spread = Math.max(...counts) - Math.min(...counts);
  assert.ok(spread <= 3, `dağılım dengesiz: ${JSON.stringify([...m])}`);
});

test("tek kategori seçimi davranışı değişmez", () => {
  const qs = sampleQuestions(8, ["Futbol"]);
  assert.ok(qs.length >= 1);
  assert.ok(qs.every((q) => q.category === "Futbol"));
});

test("kategori alt-havuzu tükenince kalanlar diğerinden tamamlanır", () => {
  // 'İklim & Hava'nın 2'si hariç tüm id'lerini exclude'a koy — sampler taze
  // 2'yi önce alır, maçın kalanını Süper Kahramanlar'dan tamamlar.
  const keepFresh = new Set(
    ALL_QUESTIONS.filter((q) => q.category === "İklim & Hava")
      .slice(0, 2)
      .map((q) => q.id),
  );
  const exclude = new Set(
    ALL_QUESTIONS.filter((q) => q.category === "İklim & Hava" && !keepFresh.has(q.id)).map((q) => q.id),
  );
  const qs = sampleQuestions(8, ["İklim & Hava", "Süper Kahramanlar"], exclude);
  assert.equal(qs.length, 8);
  const m = countByCat(qs);
  // İklim yalnız taze 2'sini verir; SH hâlâ taze varken İklim'in
  // kullanılmışlarına dönülmez (küresel taze-önce garantisi).
  const iklim = m.get("İklim & Hava") ?? 0;
  assert.ok(iklim >= 1 && iklim <= 3, `İklim taze payını almalı (${iklim})`);
  assert.ok((m.get("Süper Kahramanlar") ?? 0) >= 5);
});

test("maç-içi tekrar yok: benzersiz id'ler", () => {
  const qs = sampleQuestions(20, ["Tarih", "Coğrafya", "Müzik", "Sinema"]);
  const ids = new Set(qs.map((q) => q.id));
  assert.equal(ids.size, qs.length);
});

console.log(`\n[category-balance] sonuç: ${passed} geçti, 0 kaldı`);
