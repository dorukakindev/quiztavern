/**
 * Teste unitário do aceite de respostas do Çember: normalizeCircleAnswer +
 * matchesCircleAnswer (aliases). Roda sem servidor.
 * Execução: npx tsx scripts/circle-alias-test.ts
 */
import { ALL_CIRCLE_PROMPTS, matchesCircleAnswer, normalizeCircleAnswer } from "../src/circle";

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

console.log("normalizeCircleAnswer:");
assert(normalizeCircleAnswer("Ziraat Bankası") === "ziraatbankasi", "espaço/maiúscula/diakritik removidos");
assert(normalizeCircleAnswer("Iguanodon") === "iguanodon", "I maiúsculo trava como i (não ı)");
assert(normalizeCircleAnswer("  çanakkale  ") === normalizeCircleAnswer("canakkale"), "ç≈c");

const ayasofya = ALL_CIRCLE_PROMPTS.find((p) => p.answer === "ayasofya");
const sultanahmet = ALL_CIRCLE_PROMPTS.find((p) => p.answer === "sultanahmet");
const ziraat = ALL_CIRCLE_PROMPTS.find((p) => p.answer === "ziraatbankası");
const kapadokya = ALL_CIRCLE_PROMPTS.find((p) => p.answer === "kapadokya");

console.log("\nmatchesCircleAnswer — resposta principal:");
assert(!!ayasofya && !!sultanahmet && !!ziraat && !!kapadokya, "entradas de dados localizadas");
assert(matchesCircleAnswer(ayasofya!, "Ayasofya"), "answer exato");
assert(matchesCircleAnswer(kapadokya!, "  Kapadokya "), "espaços ao redor tolerados");
assert(!matchesCircleAnswer(kapadokya!, ""), "vazio nunca aceita");
assert(!matchesCircleAnswer(kapadokya!, "capadócia"), "forma errada recusada");

console.log("\nmatchesCircleAnswer — aliases:");
assert(matchesCircleAnswer(ayasofya!, "Ayasofya Camii"), "alias com sufixo (ayasofyacamii)");
assert(matchesCircleAnswer(sultanahmet!, "Sultanahmet Camii"), "alias de sultanahmet");
assert(matchesCircleAnswer(ziraat!, "Ziraat"), "apelido 'ziraat' aceita");
assert(matchesCircleAnswer(ziraat!, "ziraat bankası"), "answer ainda aceita");
assert(!matchesCircleAnswer(ziraat!, "iş bankası"), "outro banco recusado");
assert(!matchesCircleAnswer(kapadokya!, "göreme"), "prompt sem aliases não aceita outros nomes");

console.log("\nmatchesCircleAnswer — tolerância de digitação (Levenshtein):");
assert(matchesCircleAnswer({ answer: "mcdonalds" }, "mac donalds"), "'mac donalds' ≈ mcdonalds (1 edição)");
assert(matchesCircleAnswer({ answer: "mcdonalds" }, "mcdonald"), "1 letra faltando");
assert(matchesCircleAnswer({ answer: "kapadokya" }, "kapadokia"), "troca de 1 letra (6+ chars)");
assert(matchesCircleAnswer({ answer: "ayasofya" }, "ayasofya"), "exato continua aceito");
assert(!matchesCircleAnswer({ answer: "kapadokya" }, "kabadokya ekstra"), "distância grande recusada");
assert(matchesCircleAnswer({ answer: "roma" }, "roma "), "curto: exato após trim continua aceito");
assert(!matchesCircleAnswer({ answer: "roma" }, "romo"), "curto: 1 edição NÃO aceita");
assert(matchesCircleAnswer({ answer: "fotosentez" }, "foto sentez"), "espaço já era normalizado");
assert(matchesCircleAnswer({ answer: "istiklal caddesi" }, "istiklal cadessi"), "12+ chars: 2 edições ok");
assert(!matchesCircleAnswer({ answer: "mcdonalds" }, "macdanolds"), "9 chars: 2 edições recusada");

console.log(`\n[circle-alias] resultado: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
