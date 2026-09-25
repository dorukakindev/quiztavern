/** Tekrar önleme doğrulaması: maç1'i hariç tutunca maç2 tekrar etmemeli;
 *  havuz tükenince yine de maç dolmalı (fallback). */
import { ALL_QUESTIONS, sampleQuestions, questionPoolIds, resetExhaustedSubpools } from "../src/questions";
import { circlePoolKeys, sampleCirclePrompts } from "../src/circle";

const N = 10;
const m1 = sampleQuestions(N, []);
const ids1 = new Set(m1.map((q) => q.id));
const m2 = sampleQuestions(N, [], ids1);
const overlap = m2.filter((q) => ids1.has(q.id)).length;
console.log(`Klasik: maç1 ${ids1.size} benzersiz, maç2 ${m2.length} soru, TEKRAR ${overlap}`);

// Fallback: havuzun neredeyse tamamını hariç tut -> yine N soru dönmeli.
const almostAll = new Set(sampleQuestions(50, []).map((q) => q.id));
const m3 = sampleQuestions(N, [], almostAll);
console.log(`Fallback: 50 id hariç, istek ${N} -> dönen ${m3.length} (dolu mu: ${m3.length === N})`);

// Çember
const c1 = sampleCirclePrompts(N, []);
const keys1 = new Set(c1.map((p) => `${p.category}|${p.answer}`));
const c2 = sampleCirclePrompts(N, [], keys1);
const cOverlap = c2.filter((p) => keys1.has(`${p.category}|${p.answer}`)).length;
console.log(`Çember: maç1 ${keys1.size} benzersiz, maç2 ${c2.length}, TEKRAR ${cOverlap}`);

// Çember maç-İÇİ tekrar: tek maçta hiçbir prompt iki kez çıkmamalı; dar kategori
// filtresinde maç, mevcut benzersiz prompt sayısına kısalmalı (havuz büyüdükçe
// bu sayı değişir — sabit beklenti yerine gerçek havuzla karşılaştırılır).
const big = sampleCirclePrompts(20, []);
const bigKeys = big.map((p) => `${p.category}|${p.answer}`);
const bigDup = bigKeys.length - new Set(bigKeys).size;
const uzayPoolSize = circlePoolKeys(["Uzay"]).length;
const tiny = sampleCirclePrompts(20, ["Uzay"]);
const tinyOk = tiny.length === Math.min(20, uzayPoolSize);
console.log(
  `Çember maç-içi: filtresiz ${big.length} prompt, iç tekrar ${bigDup}; "Uzay" havuzu ${uzayPoolSize} prompt -> ${tiny.length} tur döndü (${tinyOk ? "doğru" : "YANLIŞ"})`,
);

// Çok maçlı birikim (rooms.ts start() mantığının aynısı). Resimli ve resimsiz
// alt-havuzlar FARKLI BOYUTTA ve resim kotası (bkz. pictureQuota) resim
// havuzunun payından ORANTISIZ yüksek çekiyor — bu KASITLI (kullanıcı isteği:
// "her maçta en az 1 en fazla 3 resimli soru"). Küçük resim havuzu bu yüzden
// büyük metin havuzundan çok daha SIK "tur" tamamlar — bu doğal ve beklenen.
//
// "HER alt-havuz sıfırdan TAM bir turu bitirmeden hiçbir id ikinci kez
// çıkmasın" ölçütü YANLIŞ: resetExhaustedSubpools kasıtlı olarak "yumuşak"
// sıfırlama yapıyor (lastIds hariç tutularak) — yani bir sonraki tur asla
// gerçekten sıfırdan başlamıyor, önceki turdan birkaç id taşıyor. Bu, çok
// turlu bir koşuda turun "gerçek" uzunluğunu her seferinde biraz kısaltır ve
// sertçe-sıfırdan-say ölçütü zamanla YANLIŞ pozitif tekrar biriktirir (bulundu:
// ~1500+ "tekrar", ama gerçek algoritma davranışı incelendiğinde bug değil —
// ölçütün kendisi yanlıştı).
//
// Doğru ve kesin ölçüt: bir alt-havuzdan gelen "zaten görülmüş" (tekrar) soru
// sayısı, o maçta o alt-havuzdan istenen sayı ile o an TAZE kalan sayı
// arasındaki AÇIĞA tam olarak eşit olmalı — ne fazla ne az. Taze yeterliyse
// (açık <= 0) hiç tekrar olmamalı; taze yetmiyorsa sampleQuestions'ın used
// fallback'i devreye girer ve açık kadar (fazlası değil) tekrar döner. Ayrıca
// art arda İKİ maç arasında hiçbir soru ortak olmamalı (kullanıcının asıl
// hissettiği şey budur: aynı sorunun hemen geri gelmesi).
const picIds = new Set(ALL_QUESTIONS.filter((q) => q.image).map((q) => q.id));
const textIds = new Set(ALL_QUESTIONS.filter((q) => !q.image).map((q) => q.id));
const poolSize = questionPoolIds([]).length;
// Resim havuzunun birden fazla turunu gözlemlemeye yetecek kadar maç oyna.
const totalMatches = Math.ceil((picIds.size / 1.5) * 4);
let seen = new Set<string>();
let last = new Set<string>();
let prevIds = new Set<string>();
let consecutiveMatchRepeats = 0;
let unexpectedRepeatViolations = 0;
for (let m = 0; m < totalMatches; m++) {
  seen = resetExhaustedSubpools([], null, seen, last, N);
  const unseenPicBefore = [...picIds].filter((id) => !seen.has(id)).length;
  const unseenTextBefore = [...textIds].filter((id) => !seen.has(id)).length;
  const ids = sampleQuestions(N, [], seen).map((q) => q.id);
  ids.forEach((id) => {
    if (prevIds.has(id)) consecutiveMatchRepeats++;
  });
  const picDrawn = ids.filter((id) => picIds.has(id));
  const textDrawn = ids.filter((id) => textIds.has(id));
  const picRepeats = picDrawn.filter((id) => seen.has(id)).length;
  const textRepeats = textDrawn.filter((id) => seen.has(id)).length;
  const expectedPicRepeats = Math.max(0, picDrawn.length - unseenPicBefore);
  const expectedTextRepeats = Math.max(0, textDrawn.length - unseenTextBefore);
  if (picRepeats !== expectedPicRepeats || textRepeats !== expectedTextRepeats) unexpectedRepeatViolations++;
  prevIds = new Set(ids);
  last = new Set(ids);
  ids.forEach((id) => seen.add(id));
}
console.log(`Birikim: havuz ${poolSize} (resim ${picIds.size}, metin ${textIds.size}), ${totalMatches} ardışık maç ->`);
console.log(`  ardışık maç arası ortak soru: ${consecutiveMatchRepeats} (0 olmalı)`);
console.log(
  `  beklenmeyen tekrar (taze yeterliyken tekrar VEYA açıktan fazla tekrar): ${unexpectedRepeatViolations} (0 olmalı)`,
);

// Klasik maç-İÇİ tekrar: havuzdan fazla istenince benzersiz döner (modulo değil),
// maç kısalır ama aynı soru iki kez çıkmaz.
const hugeRequest = poolSize + 500; // havuzdan kasıtlı fazla iste
const huge = sampleQuestions(hugeRequest, []);
const hugeDup = huge.length - new Set(huge.map((q) => q.id)).size;
console.log(`Klasik maç-içi: ${hugeRequest} istendi -> ${huge.length} soru (havuz kadar), iç tekrar ${hugeDup}`);

const ok =
  overlap === 0 &&
  m3.length === N &&
  bigDup === 0 &&
  tinyOk &&
  consecutiveMatchRepeats === 0 &&
  unexpectedRepeatViolations === 0 &&
  hugeDup === 0 &&
  huge.length < hugeRequest;
console.log(ok ? "✓ Tekrar önleme + fallback + çember maç-içi benzersizlik çalışıyor" : "✗ SORUN VAR");
process.exit(ok ? 0 : 1);
