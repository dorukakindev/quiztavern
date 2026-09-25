import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GAME } from "../src/config.js";
import { createXpStore } from "../src/xp.js";

const dir = mkdtempSync(join(tmpdir(), "qt-mastery-"));
const store = createXpStore(join(dir, "xp.db"));
const base = { name: "Usta", avatarUrl: null, bestStreak: 0, won: false, placement: 2 };
const cat = (n: number) => [{ category: "Tarih", correct: n }];

try {
  // 1. Ustalık eşiğinin altında: kategori listesi boş, rozet yok.
  store.recordMatch([{ ...base, userId: "u", correct: 10, total: 10, perCategory: cat(10) }]);
  assert.deepEqual(store.categoryMastery("u"), []);
  assert.ok(!store.snapshot("u")!.badges.includes("kategoriUstasi"));

  // 2. Eşiği aşınca kategori mastery + rozet.
  store.recordMatch([{ ...base, userId: "u", correct: 41, total: 41, perCategory: cat(41) }]);
  assert.deepEqual(store.categoryMastery("u"), ["Tarih"]);
  assert.ok(store.snapshot("u")!.badges.includes("kategoriUstasi"));
  assert.ok(store.snapshot("u")!.categoryMastery.includes("Tarih"));

  // 3. İkinci kategori ustalaşınca liste büyür; rozet zaten var (tekrar çıkmaz).
  store.recordMatch([{ ...base, userId: "u", correct: 60, total: 60, perCategory: [{ category: "Coğrafya", correct: 60 }] }]);
  assert.deepEqual(store.categoryMastery("u"), ["Coğrafya", "Tarih"]);

  // 4. Farklı oyuncunun sayacı bağımsız.
  assert.deepEqual(store.categoryMastery("v"), []);

  // 5. Kategori yazılmayan maçlar (perCategory yok) ustalığı ilerletmez ama bozmaz.
  store.recordMatch([{ ...base, userId: "u", correct: 5, total: 5 }]);
  assert.deepEqual(store.categoryMastery("u"), ["Coğrafya", "Tarih"]);

  // 6. Eşik: tam MASTERY_CORRECT yeter.
  store.recordMatch([{ ...base, userId: "v", correct: GAME.MASTERY_CORRECT, total: GAME.MASTERY_CORRECT, perCategory: cat(GAME.MASTERY_CORRECT) }]);
  assert.deepEqual(store.categoryMastery("v"), ["Tarih"]);

  // 7. 0 doğru yazılmaz (boş satır kirliliği).
  store.recordMatch([{ ...base, userId: "v", correct: 1, total: 1, perCategory: [{ category: "Spor", correct: 0 }] }]);
  assert.deepEqual(store.categoryMastery("v"), ["Tarih"]);
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log("mastery-test: 7/7 OK");
