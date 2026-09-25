import { strict as assert } from 'node:assert'
import { GameError } from '../src/errors'
import { Room } from '../src/rooms'
import { questionPoolIds } from '../src/questions'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` })
const internals = (room: Room) => room as unknown as {
  players: Map<string, { score: number; team: number; stats: { total: number; correct: number } }>
  questions: { id: string; correctIndex: number }[]
  qIndex: number
  beginQuestion(): void
  reveal(): void
  phase: string
}
const good = (over: Partial<{ text: string; choices: string[]; correctIndex: number }> = {}) => ({
  text: 'Test sorusu metni?', choices: ['a1', 'b2', 'c3', 'd4'], correctIndex: 1, ...over,
})

const lobby = (id: string, ids: string[] = ['a', 'b']) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 5 })
  for (const [i, pid] of ids.entries()) r.addPlayer(player(pid, `P${i}`))
  for (const pid of ids) r.setReady(pid, true)
  return r
}

console.log('Soru yazarı turu regresyonları')

test('Lobide geçerli soru state.writers listesine düşer', () => {
  const r = lobby('w-submit')
  r.submitQuestion('a', good())
  assert.deepEqual(r.stateFor('a', true).writers, ['a'])
  assert.deepEqual(r.stateFor('b', true).writers, ['a'])
})

test('Geçersiz soru reddedilir (kısa metin, 3 şık, bozuk index, tekrarlı şık)', () => {
  const r = lobby('w-invalid')
  assert.throws(() => r.submitQuestion('a', good({ text: 'kısa' })), GameError)
  assert.throws(() => r.submitQuestion('a', good({ choices: ['a', 'b', 'c'] })), GameError)
  assert.throws(() => r.submitQuestion('a', good({ correctIndex: 4 })), GameError)
  assert.throws(() => r.submitQuestion('a', good({ choices: ['x', 'x', 'y', 'z'] })), GameError)
  assert.throws(() => r.submitQuestion('a', null), GameError)
  assert.equal(r.stateFor('a', true).writers.length, 0)
})

test('Lobi dışında yazamaz; silme lobide çalışır', () => {
  const r = lobby('w-phase')
  r.submitQuestion('a', good())
  r.start('a', 'classic')
  assert.throws(() => r.submitQuestion('a', good({ text: 'ikinci soru burada' })), GameError)
})

test('removeQuestion lobide kaydı siler', () => {
  const r = lobby('w-delete')
  r.submitQuestion('a', good())
  r.removeQuestion('a')
  assert.equal(r.stateFor('a', true).writers.length, 0)
})

test('Klasik maçta yazılan soru havuza karışır (written-<id>)', () => {
  const r = lobby('w-inject')
  r.submitQuestion('a', good())
  r.start('a', 'classic')
  const inner = internals(r)
  assert.ok(inner.questions.some((q) => q.id === 'written-a'), 'written-a havuzda yok')
  // En fazla WRITTEN_PER_MATCH soru karışır — burada tek yazardan 1.
  assert.equal(inner.questions.filter((q) => q.id.startsWith('written-')).length, 1)
})

test('Yazar kendi sorusunda cevap veremez; ortalama kazanç alır', () => {
  const r = lobby('w-round')
  r.submitQuestion('a', good())
  r.start('a', 'classic')
  const inner = internals(r)
  const idx = inner.questions.findIndex((q) => q.id === 'written-a')
  assert.ok(idx >= 0)
  inner.qIndex = idx
  inner.beginQuestion()
  // Yazar cevap vermeye çalışır — reddedilir (sessiz).
  r.answer('a', 0)
  assert.equal(inner.players.get('a')!.score, 0)
  // Diğer oyuncu doğru cevaplar → yazar ortalama alır (tek kişi → onun kazancı).
  // (Şık sırası enjeksiyonda karıştırılır — doğru index sorudan okunur.)
  r.answer('b', inner.questions[idx].correctIndex)
  inner.reveal()
  const writer = inner.players.get('a')!
  const other = inner.players.get('b')!
  assert.ok(other.score > 0, 'b puan almalı')
  assert.equal(writer.score, other.score, 'yazar kazananın ortalamasını almalı (tek kişide = kazancı)')
  // Yazarın istatistiğine tur işlenmez — oynamadı.
  assert.equal(writer.stats.total, 0)
})

test('Yazar turu reveal state\'inde yazar adı ve writtenByYou işaretlenir', () => {
  const r = lobby('w-tag')
  r.submitQuestion('a', good())
  r.start('a', 'classic')
  const inner = internals(r)
  const idx = inner.questions.findIndex((q) => q.id === 'written-a')
  inner.qIndex = idx
  inner.beginQuestion()
  const forB = r.stateFor('b', true).question
  const forA = r.stateFor('a', true).question
  assert.equal(forB?.writtenByName, 'P0')
  assert.equal(forB?.writtenByYou, false)
  assert.equal(forA?.writtenByYou, true)
})

test('Çember/bahis modunda yazılan sorular havuza girmez', () => {
  const r = lobby('w-modes')
  r.submitQuestion('a', good())
  r.start('a', 'circle')
  const inner = internals(r)
  assert.ok(!inner.questions.some((q) => q.id === 'written-a'))
})

test('İkinci gönderim üzerine yazar; masadan çıkınca kayıt düşer', () => {
  const r = lobby('w-overwrite')
  r.submitQuestion('a', good())
  r.submitQuestion('a', good({ text: 'yeni soru metni tamam mı' }))
  assert.equal(r.stateFor('a', true).writers.length, 1)
  r.removePlayer('a')
  assert.equal(r.stateFor('b', true).writers.length, 0)
})

test('Dar havuzda yazar slotu dizi sınırını aşmaz — delik yok (B59)', () => {
  // Slotlar roundLimit'ten örnekleniyordu; questions dar havuzda kısa kalınca
  // slot ≥ length yazımı sparse delik açar ve maç ilk delikte biterdi.
  const r = new Room('w-thin', () => {}, { minPlayers: 1, questionCount: 15 })
  for (const pid of ['a', 'b', 'c', 'd']) { r.addPlayer(player(pid, `P${pid}`)); }
  // Görülmemiş yalnız 2 soru kalsın — questions.length=2 < roundLimit=15.
  const seen = (r as unknown as { seenQuestionIds: Set<string> }).seenQuestionIds
  for (const id of questionPoolIds().slice(2)) seen.add(id)
  for (const pid of ['a', 'b', 'c', 'd']) { r.setReady(pid, true); r.submitQuestion(pid, good({ text: `yazar ${pid} sorusu uzun metin` })) }
  r.start('a', 'classic')
  const inner = internals(r)
  assert.equal(inner.questions.length, inner.questions.filter(Boolean).length, 'sparse delik yok')
  const written = inner.questions.filter((q) => String(q.id).startsWith('written-'))
  assert.ok(written.length >= 1, 'yazar sorusu dizide')
})

console.log(`writer-test: ${passed} geçti`)
assert.equal(passed, 10)
