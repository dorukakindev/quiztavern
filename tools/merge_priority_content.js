const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const allFiles = fs.readdirSync(root);
const classicFiles = allFiles.filter((f) => /^new-classic-.*\.json$/.test(f));
const circleFiles = allFiles.filter((f) => /^new-circle-.*\.json$/.test(f));
const questionsPath = 'server/data/questions.json';
const circlePath = 'server/src/circle.ts';
const classics = classicFiles.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const circles = circleFiles.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

function fail(message) { throw new Error(message); }
for (const q of classics) {
  if (!q.id || !q.textEn || !Array.isArray(q.choices) || q.choices.length !== 4 || !Array.isArray(q.choicesEn) || q.choicesEn.length !== 4) fail(`Invalid classic question: ${q.id}`);
}
if (new Set(classics.map((q) => q.id)).size !== classics.length) fail('Duplicate IDs in incoming classic questions');
// Onceki oturumlarda bazi kategoriler (dizi-tv, doga, uzay, video-oyunlari)
// zaten tam olarak eklenmis olabilir — tekil ID bazinda atla, geri kalanini ekle.
const existingIds = new Set(questions.map((q) => q.id));
const newClassics = classics.filter((q) => !existingIds.has(q.id));
const skippedClassicIds = classics.filter((q) => existingIds.has(q.id)).map((q) => q.id);

const circleText = fs.readFileSync(circlePath, 'utf8');
for (const p of circles) {
  if (!p.letter || !p.clue || !p.answer || !p.category || !p.letterEn || !p.clueEn || !p.answerEn || p.answer.includes(' ')) fail(`Invalid circle prompt: ${p.answer}`);
}
if (new Set(circles.map((p) => `${p.category}|${p.answer}`)).size !== circles.length) fail('Duplicate incoming circle answers');
// Mevcut girdiler İKİ farklı bicimde olabilir: elle yazilmis `answer: "X", category: "Y"`
// (bosluklu) VE onceki merge_priority_content.js kosularinin JSON.stringify ciktisi
// `"answer":"X","category":"Y"` (bosluksuz). Yalnizca bosluklu deseni aramak onceden
// eklenmis compact-format girdileri kacirip sessizce yeniden ekliyordu (bulunan hata).
const existingCircleKeys = new Set();
for (const m of circleText.matchAll(/answer:\s*"((?:\\.|[^"\\])*)",\s*category:\s*"((?:\\.|[^"\\])*)"/g)) {
  existingCircleKeys.add(`${JSON.parse(`"${m[2]}"`)}|${JSON.parse(`"${m[1]}"`)}`);
}
for (const m of circleText.matchAll(/"answer":"((?:\\.|[^"\\])*)","category":"((?:\\.|[^"\\])*)"/g)) {
  existingCircleKeys.add(`${JSON.parse(`"${m[2]}"`)}|${JSON.parse(`"${m[1]}"`)}`);
}
// Ayni tekil-atlama mantigi cember tarafinda da: cevap+kategori zaten varsa atla.
const newCircles = circles.filter((p) => !existingCircleKeys.has(`${p.category}|${p.answer}`));
const skippedCircles = circles.filter((p) => existingCircleKeys.has(`${p.category}|${p.answer}`)).map((p) => `${p.category}|${p.answer}`);

const insertion = newCircles.map((p) => `  ${JSON.stringify(p)},`).join('\n');
const closingPattern = /\r?\n\];\r?\n\r?\nexport const normalizeCircleAnswer/;
if (!closingPattern.test(circleText)) fail('Circle array closing marker not found');
if (newClassics.length) fs.writeFileSync(questionsPath, `${JSON.stringify([...questions, ...newClassics], null, 2)}\n`);
if (newCircles.length) fs.writeFileSync(circlePath, circleText.replace(closingPattern, `\n${insertion},\n];\n\nexport const normalizeCircleAnswer`));
console.log(JSON.stringify({ classicFiles, circleFiles, classicAdded: newClassics.length, classicSkipped: skippedClassicIds, circleAdded: newCircles.length, circleSkipped: skippedCircles }, null, 2));
