const fs = require("fs");
const qp = "server/data/questions.json",
  cp = "server/src/circle.ts";
const qs = JSON.parse(fs.readFileSync(qp, "utf8")),
  add = JSON.parse(fs.readFileSync("new-classic-cografya-ek.json", "utf8"));
const ct = fs.readFileSync(cp, "utf8"),
  prompts = JSON.parse(fs.readFileSync("new-circle-cografya-ek.json", "utf8"));
if (add.some((x) => qs.some((q) => q.id === x.id))) throw new Error("Classic ID collision");
if (prompts.some((x) => ct.includes(`answer: "${x.answer}", category: "${x.category}"`)))
  throw new Error("Circle collision");
const marker = /\r?\n\];\r?\n\r?\nexport const normalizeCircleAnswer/;
if (!marker.test(ct)) throw new Error("Circle array end not found");
fs.writeFileSync(qp, JSON.stringify([...qs, ...add], null, 2) + "\n");
const lines = prompts
  .map(
    (x) =>
      `  { letter: ${JSON.stringify(x.letter)}, clue: ${JSON.stringify(x.clue)}, answer: ${JSON.stringify(x.answer)}, category: ${JSON.stringify(x.category)}, difficulty: ${JSON.stringify(x.difficulty)}, letterEn: ${JSON.stringify(x.letterEn)}, clueEn: ${JSON.stringify(x.clueEn)}, answerEn: ${JSON.stringify(x.answerEn)} },`,
  )
  .join("\n");
fs.writeFileSync(cp, ct.replace(marker, `\n${lines}\n];\n\nexport const normalizeCircleAnswer`));
