/**
 * İçerik doğrulayıcı (DEVIN_PLAN 1.4): questions.json + çember prompt'larını
 * şema ve içerik kurallarına göre denetler. Hatalar çıkış kodunu 1 yapar;
 * uyarılar yalnızca raporlanır.
 * Çalıştırma: npx tsx tools/validate-questions.ts   (repo kökünden)
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ALL_QUESTIONS } from "../server/src/questions";
import { ALL_CIRCLE_PROMPTS, normalizeCircleAnswer } from "../server/src/circle";
import { ALL_NUMERIC } from "../server/src/questions-numeric";
import { ALL_ORDER } from "../server/src/questions-order";
import { EXTRA_CATEGORIES } from "../server/src/categories";
import type { Difficulty } from "../shared/types";

const DIFFICULTIES: readonly Difficulty[] = ["kolay", "orta", "zor"];
const errors: string[] = [];
const warnings: string[] = [];

const err = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

// Tanımlı kategori evreni: EXTRA_CATEGORIES (içeriksiz de gösterilenler) ∪
// istemcinin EN etiket sözlüğü. Dışında kalan ad büyük ihtimalle yazım hatası
// veya EN etiketi/ikonu eksik yeni kategori.
const i18nSource = fs.readFileSync(fileURLToPath(new URL("../client/src/activity/i18n.ts", import.meta.url)), "utf-8");
const enLabelBlock = i18nSource.match(/CATEGORY_LABELS_EN[^{]*\{([\s\S]*?)\}/);
const EN_LABEL_NAMES = new Set([...(enLabelBlock?.[1].matchAll(/'([^']+)':/g) ?? [])].map((m) => m[1]));
const DEFINED_CATEGORIES = new Set<string>([...EXTRA_CATEGORIES, ...EN_LABEL_NAMES]);

// ── Klasik sorular ──────────────────────────────────────────────────────────
const seenIds = new Set<string>();
const seenTexts = new Map<string, string>();
const publicQuestionsDir = fileURLToPath(new URL("../client/public/questions/", import.meta.url));

for (const q of ALL_QUESTIONS) {
  const where = q.id || "(id yok)";
  if (seenIds.has(q.id)) err(`${where}: id tekrar ediyor`);
  seenIds.add(q.id);

  if (!DIFFICULTIES.includes(q.difficulty)) err(`${where}: difficulty "${q.difficulty}" geçersiz`);
  if (!DEFINED_CATEGORIES.has(q.category)) {
    warn(
      `${where}: kategori "${q.category}" tanımlı değil — EXTRA_CATEGORIES'a ve EN etiket/ikon ekleyin (yazım hatası olabilir)`,
    );
  }

  if (q.choices.length !== 4 || q.choicesEn.length !== 4) err(`${where}: TR ve EN şık sayısı 4 olmalı`);
  if (new Set(q.choices).size !== q.choices.length) err(`${where}: TR şıklar tekrar ediyor`);
  if (new Set(q.choicesEn).size !== q.choicesEn.length) err(`${where}: EN şıklar tekrar ediyor`);
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    err(`${where}: correctIndex 0-3 dışında`);
  } else {
    if (!q.choices[q.correctIndex]) err(`${where}: doğru cevap TR şıklar arasında yok`);
    if (!q.choicesEn[q.correctIndex]) err(`${where}: doğru cevap EN şıklar arasında yok`);
  }

  const textKey = q.text.trim().toLocaleLowerCase("tr-TR");
  const priorText = seenTexts.get(textKey);
  if (priorText !== undefined) {
    // Aynı metin + farklı görsel = bilinçli desen (logo/görsel soruları metni
    // paylaşır); yalnız iki kayıt da görsel taşıyorsa uyarı üretme.
    const priorHadImage = priorText.endsWith("|img");
    const bothHaveImage = priorHadImage && Boolean(q.image);
    if (!bothHaveImage) warn(`${where}: "${priorText.split("|")[0]}" ile aynı soru metni`);
  }
  seenTexts.set(textKey, `${where}${q.image ? "|img" : ""}`);

  for (const choice of q.choices) {
    if (choice.length > 40) warn(`${where}: şık 40 karakterden uzun ("${choice.slice(0, 30)}…")`);
  }
  if (q.image) {
    if (!fs.existsSync(`${publicQuestionsDir}${q.image}`)) {
      warn(`${where}: image "${q.image}" client/public/questions altında yok`);
    }
  }
}

// ── Çember prompt'ları ──────────────────────────────────────────────────────
const seenCircle = new Set<string>();
const seenCircleEn = new Set<string>();
for (const p of ALL_CIRCLE_PROMPTS) {
  const where = `${p.letter} → ${p.answer}`;
  const key = normalizeCircleAnswer(p.answer);
  if (seenCircle.has(key)) warn(`${where}: aynı cevap başka bir prompt'ta da var`);
  seenCircle.add(key);

  if (!DIFFICULTIES.includes(p.difficulty)) err(`${where}: difficulty "${p.difficulty}" geçersiz`);
  if (!DEFINED_CATEGORIES.has(p.category)) {
    warn(
      `${where}: kategori "${p.category}" tanımlı değil — EXTRA_CATEGORIES'a ve EN etiket/ikon ekleyin (yazım hatası olabilir)`,
    );
  }

  // İpucu boşluk/uzunluk: boş ipucu ya da cevabı neredeyse tekrarlayan kısa ipucu.
  if (!p.clue.trim()) err(`${where}: clue boş`);
  else if (p.clue.trim().length < 15) warn(`${where}: clue 15 karakterden kısa ("${p.clue.trim()}")`);

  // TR kuralı: normalize edilmiş cevap, harfle başlamalı.
  const normalizedAnswer = normalizeCircleAnswer(p.answer);
  const normalizedLetter = normalizeCircleAnswer(p.letter);
  if (!normalizedLetter || normalizedLetter.length !== 1) err(`${where}: letter tek harf olmalı`);
  if (!normalizedAnswer.startsWith(normalizedLetter)) {
    err(`${where}: cevap "${normalizedAnswer}" harf "${normalizedLetter}" ile başlamıyor`);
  }

  // Gerçek harf kuralı (normalize etmeden): TR'de i→İ ve ı→I ayrımı korunur —
  // letter:"I" + answer:"istanbul" normalize'da geçer ama gerçekte yanlış.
  const rawFirst = p.answer.trim().toLocaleUpperCase("tr").charAt(0);
  if (rawFirst !== p.letter.trim().toLocaleUpperCase("tr")) {
    err(`${where}: cevap "${p.answer}" ham harf "${p.letter}" ile başlamıyor (I/İ ayrımı)`);
  }

  // EN çifti (varsa) da aynı kurala uymalı; letterEn varsa answerEn/clueEn de olmalı.
  const enFields = [p.letterEn, p.clueEn, p.answerEn].filter(Boolean).length;
  if (enFields > 0 && enFields < 3) {
    err(`${where}: EN alanları eksik (letterEn/clueEn/answerEn birlikte olmalı)`);
  }
  if (p.letterEn && p.answerEn) {
    const enAnswer = normalizeCircleAnswer(p.answerEn);
    const enLetter = normalizeCircleAnswer(p.letterEn);
    if (!enAnswer.startsWith(enLetter)) {
      err(`${where}: EN cevap "${enAnswer}" harf "${enLetter}" ile başlamıyor`);
    }
    // answerEn tekilleştirme: aynı EN cevap iki prompt'ta geçerse EN arayüzde
    // maç içi dedup (B3 düzeltmesi) birini eler — havuz etkin küçülür.
    if (seenCircleEn.has(enAnswer)) warn(`${where}: EN cevap "${enAnswer}" başka bir prompt'ta da var`);
    seenCircleEn.add(enAnswer);
    if (!p.clueEn?.trim()) err(`${where}: clueEn boş`);
  }

  if (p.answer.length > 20) warn(`${where}: cevap 20 karakterden uzun ("${p.answer}")`);
  // aliases alanı FAZ 1.2 ile ekleniyor; yoksa kontrol atlanır.
  const aliases = "aliases" in p ? (p.aliases as string[] | undefined) : undefined;
  if (/\s/.test(p.answer.trim()) && !(aliases ?? []).length) {
    warn(`${where}: çok kelimeli cevap ve aliases yok — alternatif yazımlar düşünün`);
  }
}

// ── Yakın Tahmin (sayısal) ──────────────────────────────────────────────────
const seenNumericTexts = new Map<string, string>();
for (const q of ALL_NUMERIC) {
  const where = q.id || "(id yok)";
  if (!DIFFICULTIES.includes(q.difficulty)) err(`${where}: difficulty "${q.difficulty}" geçersiz`);
  if (!DEFINED_CATEGORIES.has(q.category)) {
    warn(`${where}: kategori "${q.category}" tanımlı değil — EXTRA_CATEGORIES'a ve EN etiket/ikon ekleyin`);
  }
  if (!(q.answer > 0)) warn(`${where}: cevap ${q.answer} — pozitif olmayan değerler UI'da beklenmedik olabilir`);
  const textKey = q.text.trim().toLocaleLowerCase("tr-TR");
  if (seenNumericTexts.has(textKey)) warn(`${where}: "${seenNumericTexts.get(textKey)}" ile aynı soru metni`);
  seenNumericTexts.set(textKey, where);
}

// ── Zaman Çizelgesi ─────────────────────────────────────────────────────────
const seenOrderTexts = new Map<string, string>();
for (const q of ALL_ORDER) {
  const where = q.id || "(id yok)";
  if (!DIFFICULTIES.includes(q.difficulty)) err(`${where}: difficulty "${q.difficulty}" geçersiz`);
  if (!DEFINED_CATEGORIES.has(q.category)) {
    warn(`${where}: kategori "${q.category}" tanımlı değil — EXTRA_CATEGORIES'a ve EN etiket/ikon ekleyin`);
  }
  const textKey = q.text.trim().toLocaleLowerCase("tr-TR");
  if (seenOrderTexts.has(textKey)) warn(`${where}: "${seenOrderTexts.get(textKey)}" ile aynı soru metni`);
  seenOrderTexts.set(textKey, where);
  const labels = new Set(q.events.map((e) => e.label.trim().toLocaleLowerCase("tr-TR")));
  if (labels.size !== q.events.length) err(`${where}: olay etiketleri tekrar ediyor`);
}

// ── Rapor ───────────────────────────────────────────────────────────────────
console.log(
  `[validate] ${ALL_QUESTIONS.length} klasik, ${ALL_CIRCLE_PROMPTS.length} çember, ${ALL_NUMERIC.length} sayısal, ${ALL_ORDER.length} çizelge denetlendi`,
);
for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n[validate] ${errors.length} hata, ${warnings.length} uyarı`);
  process.exit(1);
}
console.log(`[validate] hata yok${warnings.length ? `, ${warnings.length} uyarı` : ""}`);
