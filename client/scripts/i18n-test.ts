/**
 * Aşama 6 DoD testi — TR/EN sözlüğünün bütünlüğü.
 * Tip sistemi eksik anahtarı zaten yakalar; bu test onun göremediklerine bakar:
 * boş çeviri, kopyala-yapıştır kalıntısı, ve en sinsisi — yer tutucu paritesi
 * (EN'de {count} unutulursa sayı sessizce kaybolur, derleyici görmez).
 * Çalıştırma: npx tsx scripts/i18n-test.ts
 */
import { STRINGS, translate, type StringKey } from "../src/activity/i18n";
import { BADGE_KEYS } from "../../shared/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

const keys = Object.keys(STRINGS.tr) as StringKey[];
const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");

console.log(`Sözlük — ${keys.length} anahtar × 2 dil\n`);

// 1) Anahtar kümeleri birebir aynı
const trKeys = new Set(Object.keys(STRINGS.tr));
const enKeys = new Set(Object.keys(STRINGS.en));
const onlyTr = [...trKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !trKeys.has(k));
assert(
  onlyTr.length === 0 && onlyEn.length === 0,
  `anahtar kümeleri eşit${onlyTr.length ? ` (yalnız TR: ${onlyTr})` : ""}${onlyEn.length ? ` (yalnız EN: ${onlyEn})` : ""}`,
);

// 2) Hiçbir çeviri boş değil
const empty = keys.filter((k) => !STRINGS.tr[k].trim() || !STRINGS.en[k].trim());
assert(empty.length === 0, `boş çeviri yok${empty.length ? ` (${empty})` : ""}`);

// 3) Yer tutucu paritesi — sessiz veri kaybının tek savunması
const mismatched = keys.filter((k) => placeholders(STRINGS.tr[k]) !== placeholders(STRINGS.en[k]));
assert(
  mismatched.length === 0,
  `yer tutucular iki dilde aynı${mismatched.length ? ` (uyuşmayan: ${mismatched})` : ""}`,
);

// 4) Çevrilmemiş kalıntı: iki dil de aynıysa şüpheli (marka/kısaltma hariç)
const sameBoth = keys.filter((k) => STRINGS.tr[k] === STRINGS.en[k]);
// reveal.betLost: değeri "−{points}" (sadece eksi + sayı) — dile bağımsız, kasıtlı aynı.
// team.mvp: "MVP" evrensel kısaltma; reveal.betLost: "−{points}" dile bağımsız. Kasıtlı aynı.
// bet.allBoost: "×2.5" çarpan işareti — dile bağımsız, kasıtlı aynı.
const allowedSame = new Set<string>([
  "brand.name",
  "category.mixed",
  "err.invalidTarget",
  "reveal.betLost",
  "team.mvp",
  "podium.xpGain",
  "bet.allBoost",
]);
const suspicious = sameBoth.filter((k) => !allowedSame.has(k));
assert(suspicious.length === 0, `çevrilmemiş kalıntı yok${suspicious.length ? ` (${suspicious})` : ""}`);

// 5) İlk listenin 10. maddesi: TR geri sayımda BAŞLA, EN'de GO
assert(STRINGS.tr["countdown.go"] === "BAŞLA", `TR geri sayım sonu "BAŞLA" (${STRINGS.tr["countdown.go"]})`);
assert(STRINGS.en["countdown.go"] === "GO", `EN geri sayım sonu "GO" (${STRINGS.en["countdown.go"]})`);

// 6) Interpolasyon gerçekten dolduruyor
assert(translate("tr", "game.questionOf", { index: 2, total: 5 }) === "Soru 2 / 5", "TR interpolasyon");
assert(translate("en", "game.questionOf", { index: 2, total: 5 }) === "Question 2 / 5", "EN interpolasyon");
// Metnin KENDİSİNİ değil davranışını sına: bu satırın sözleri tasarıma ait ve
// değişiyor (maket 1d "Yeni soru 3 sn içinde" diyor). Birebir eşitlik yazınca
// her metin rötuşunda test "yanlış" diye patlıyor. Önemli olan: sayı yerine
// oturuyor ve yer tutucu geride kalmıyor.
const revealLine = translate("tr", "reveal.nextIn", { seconds: 3 });
assert(revealLine.includes("3") && !revealLine.includes("{"), `TR reveal çizgisi ("${revealLine}")`);
assert(!translate("en", "err.needPlayers", { count: 2 }).includes("{"), "sunucu mesajı parametresi doldu");

// 7) Eksik parametre metni bozmaz (yer tutucu olduğu gibi kalır, patlamaz)
assert(translate("tr", "game.questionOf", { index: 1 }) === "Soru 1 / {total}", "eksik parametre güvenli düşer");

// 8) Rozet × i18n kesişimi: BADGE_KEYS'in her anahtarı ad + hint ister —
// `as StringKey` cast'leri eksik anahtarı derleyiciden saklar, bu kontrol
// "undefined · Unvan olarak tak" tooltip'ini (haftaSampiyonu.desc vakası) yakalar.
const badgeMissing = BADGE_KEYS.flatMap((b) => {
  const name = `badge.${b}` as StringKey;
  const hint = `badge.${b}.hint` as StringKey;
  return [
    STRINGS.tr[name] ? null : `${name} (tr)`,
    STRINGS.en[name] ? null : `${name} (en)`,
    STRINGS.tr[hint] ? null : `${hint} (tr)`,
    STRINGS.en[hint] ? null : `${hint} (en)`,
  ].filter(Boolean) as string[];
});
assert(
  badgeMissing.length === 0,
  `her rozetin adı ve hint'i iki dilde tam${badgeMissing.length ? ` (${badgeMissing})` : ""}`,
);

console.log(`\n[i18n] sonuç: ${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
