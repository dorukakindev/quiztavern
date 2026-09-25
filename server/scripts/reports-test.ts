import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReportsStore } from "../src/reports";

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

const entry = {
  roomId: "ana-lobi",
  userId: "u1",
  userName: "Devin",
  questionId: "tarih-001",
  questionText: "İstanbul hangi yılda fethedildi?",
  category: "Tarih",
  note: "şıklar karışık",
};

const file = join(mkdtempSync(join(tmpdir(), "qt-reports-")), "reports.db");
const store = createReportsStore(file);
try {
  test("rapor eklenir ve listelenir (süreli alanlar dahil)", () => {
    assert.equal(store.report(entry).duplicate, false);
    const rows = store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].questionId, "tarih-001");
    assert.equal(rows[0].category, "Tarih");
    assert.equal(rows[0].userName, "Devin");
    assert.ok(rows[0].reportedAt > 0);
  });

  test("aynı oyuncu aynı soruyu ikinci kez bildiremez", () => {
    assert.equal(store.report(entry).duplicate, true);
    assert.equal(store.list().length, 1);
  });

  test("başka oyuncu aynı soruyu bildirebilir", () => {
    assert.equal(store.report({ ...entry, userId: "u2" }).duplicate, false);
    assert.equal(store.list().length, 2);
  });

  test("aynı oyuncu farklı soruyu bildirebilir", () => {
    assert.equal(store.report({ ...entry, questionId: "tarih-002" }).duplicate, false);
    assert.equal(store.list().length, 3);
  });

  test("not ve metin uzunlukları sınırda kırpılır; boşluk sadeleştirilir", () => {
    const rowsBefore = store.list().length;
    store.report({
      ...entry,
      userId: "u3",
      questionId: "tarih-003",
      questionText: `  çok   boşluklu    metin ${"x".repeat(500)}`,
      note: "  " + "y".repeat(500),
    });
    const row = store.list().find((r) => r.questionId === "tarih-003");
    assert.equal(row?.note.length, 140);
    assert.equal(row?.questionText.length, 400);
    assert.match(row?.questionText ?? "", /^çok boşluklu metin/);
    assert.equal(store.list().length, rowsBefore + 1);
  });

  test("bellek içi depo da aynı arayüzü sağlar", () => {
    const mem = createReportsStore(":memory:");
    assert.equal(mem.report(entry).duplicate, false);
    assert.equal(mem.report(entry).duplicate, true);
    assert.equal(mem.list().length, 1);
    mem.close();
  });

  test("suppressedQuestionIds: ≥3 farklı oyuncu bildirince soru havuzdan düşer", () => {
    const mem = createReportsStore(":memory:");
    const q = { ...entry, questionId: "tarih-099" };
    // 2 farklı oyuncu — henüz eşik altı.
    mem.report({ ...q, userId: "a" });
    mem.report({ ...q, userId: "b" });
    assert.equal(mem.suppressedQuestionIds().has("tarih-099"), false);
    // Aynı oyuncunun tekrarı (UNIQUE vurur) eşiği şişirmez.
    mem.report({ ...q, userId: "a" });
    assert.equal(mem.suppressedQuestionIds().has("tarih-099"), false);
    // 3. farklı oyuncu → baskılanır.
    mem.report({ ...q, userId: "c" });
    assert.equal(mem.suppressedQuestionIds().has("tarih-099"), true);
    // Daha yüksek eşik sorusuyla görünmez; 1'lik eşik tek raporu da yakalar.
    assert.equal(mem.suppressedQuestionIds(4).has("tarih-099"), false);
    assert.equal(mem.suppressedQuestionIds(1).has("tarih-099"), true);
    mem.close();
  });

  console.log(`\n[reports] sonuç: ${passed} geçti, 0 kaldı`);
} finally {
  store.close();
  rmSync(file, { force: true, maxRetries: 5, retryDelay: 200 });
}
