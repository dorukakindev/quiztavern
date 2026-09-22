import { ALL_CIRCLE_PROMPTS } from '../src/circle';

console.log('=== ANSWERS WITH HYPHENS/DASHES ===');
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (p.answer.includes('-')) console.log('  ['+i+'] ' + p.answer + ' | letter=' + p.letter + ' cat=' + p.category);
});

console.log('');
console.log('=== ANSWERS WITH SPECIAL CHARS (not a-z/0-9/Turkish) ===');
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (/[^a-zA-Z0-9]/u.test(p.answer)) {
    console.log('  ['+i+'] ' + p.answer + ' | letter=' + p.letter + ' cat=' + p.category);
  }
});

console.log('');
console.log('=== ANSWERS LONGER THAN 15 CHARS ===');
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (p.answer.length > 15) {
    console.log('  ['+i+'] ' + p.answer + ' (' + p.answer.length + ' chars) | letter=' + p.letter + ' cat=' + p.category);
  }
});

console.log('');
console.log('=== LETTERS NOT IN TURKISH ALPHABET ===');
const tr = 'ABC\u00c7DEFG\u011eHI\u0130JKLMNO\u00d6PRS\u015eTU\u00dcVYZ';
const trSet = new Set(tr.split(''));
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (!trSet.has(p.letter)) {
    console.log('  ['+i+'] letter=' + p.letter + ' answer=' + p.answer + ' cat=' + p.category);
  }
});

console.log('');
console.log('=== EN ANSWERS WITH SPACES ===');
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (p.answerEn && /\s/.test(p.answerEn)) {
    console.log('  ['+i+'] EN=' + p.answerEn + ' TR=' + p.answer + ' cat=' + p.category);
  }
});

console.log('');
console.log('=== EN LETTER vs ANSWER MISMATCH ===');
ALL_CIRCLE_PROMPTS.forEach((p,i) => {
  if (p.letterEn && p.answerEn) {
    const first = p.answerEn.charAt(0).toLowerCase();
    const expected = p.letterEn.toLowerCase();
    if (first !== expected) {
      console.log('  ['+i+'] EN answer=' + p.answerEn + ' EN letter=' + p.letterEn + ' | TR=' + p.answer + ' cat=' + p.category);
    }
  }
});
