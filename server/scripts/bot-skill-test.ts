import assert from "node:assert";
import { botSkill, BOT_NAMES } from "../src/bots.js";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log("Bot becerisi regresyonları");

test("beceri deterministik — aynı id her çağrıda aynı değer", () => {
  for (const name of BOT_NAMES) assert.equal(botSkill(name), botSkill(name));
});

test("beceri 0.30–0.60 aralığında", () => {
  for (const name of BOT_NAMES) {
    const s = botSkill(name);
    assert.ok(s >= 0.3 && s <= 0.6, `${name}: ${s}`);
  }
});

test("8 bot isminde en az 2 farklı beceri değeri", () => {
  const distinct = new Set(BOT_NAMES.map(botSkill));
  assert.ok(distinct.size >= 2, `tek değer: ${[...distinct]}`);
});

console.log(`\n[bot-skill] sonuç: ${passed} geçti, 0 kaldı`);
