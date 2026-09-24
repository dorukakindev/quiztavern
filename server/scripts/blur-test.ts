import { strict as assert } from 'node:assert'
import { GAME } from '../src/config'
import { GameError } from '../src/errors'
import { sampleQuestions } from '../src/questions'
import { Room } from '../src/rooms'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false })
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer()
const inner = (room: Room) => room as unknown as { beginQuestion: () => void }

console.log('Bulanık Resim regresyonları')

const room = new Room('blur-1', () => {}, { minPlayers: 2, questionCount: 10 })
room.addPlayer(player('a', 'Ada'))
room.addPlayer(player('b', 'Bora'))
room.addPlayer(player('c', 'Cem')) // cevaplamaz: a/b cevaplayınca erken reveal tetiklenmesin

test('host olmayan modu değiştiremez; geçersiz mod reddedilir', () => {
  assert.throws(() => room.setGameMode('b', 'blur'), (e: unknown) => e instanceof GameError && e.key === 'err.modeHostOnly')
  assert.throws(() => room.setGameMode('a', 'zoom'), (e: unknown) => e instanceof GameError && e.key === 'err.modeInvalid')
})

room.setGameMode('a', 'blur')
room.setReady('a', true)
room.setReady('b', true)
room.setReady('c', true)
room.start('a', 'blur')
stop(room)

test('blur havuzu yalnız resimli sorulardan kurulur', () => {
  const questions = (room as unknown as { questions: { image?: string }[] }).questions
  assert.ok(questions.length > 0)
  for (const q of questions) assert.ok(q.image, 'her soru image taşımalı')
})

test('tur süresi BLUR_QUESTION_MS (12 sn)', () => {
  assert.equal(room.questionDuration(), GAME.BLUR_QUESTION_MS)
})

inner(room).beginQuestion()
stop(room)

test('soru yükü image alanını istemciye taşır', () => {
  const q = room.stateFor('a', true).question
  assert.ok(q?.image)
})

test('klasik puanlama aynen işler: erken doğru daha çok puan', () => {
  const q = room.currentQuestion()!
  // a hemen, b 6 sn sonra cevaplıyor — ikisi de doğru.
  room.answer('a', q.correctIndex)
  room.answer('b', q.correctIndex)
  // answer() answeredAt'ı Date.now() ile yazar; geç cevabı taklit için geriye al.
  const inner2 = room as unknown as { players: Map<string, { answeredAt: number | null }>; questionStartedAt: number }
  inner2.players.get('b')!.answeredAt = inner2.questionStartedAt + 6_000
  ;(room as unknown as { reveal: () => void }).reveal()
  const pa = room.players.get('a')!.score
  const pb = room.players.get('b')!.score
  assert.ok(pa > pb, `erken cevap (${pa}) geç cevaptan (${pb}) çok olmalı`)
  assert.equal(room.players.get('c')!.score, 0)
})
stop(room)

// imageOnly örnekleyici: dar kategori filtresi resimli soru içermezse tüm resimli havuza düşer
const pictured = sampleQuestions(10, ['definately-not-a-category'], new Set(), null, true)
assert.ok(pictured.length === 10 && pictured.every((q) => q.image))

test('imageOnly: kategori filtresi resimli soru içermiyorsa tüm resimli havuza düşer', () => {})

// Özel paket blur'da yok sayılır — paket sorularının görseli yok
const room2 = new Room('blur-2', () => {}, { minPlayers: 2, questionCount: 10 })
room2.addPlayer(player('p', 'Pia'))
room2.addPlayer(player('r', 'Ren'))
room2.setGameMode('p', 'blur')
room2.setReady('p', true)
room2.setReady('r', true)
// Var olmayan paket id'si: circle/blur dışında hata verirdi, blur'da görmezden gelinir.
;(room2 as unknown as { packId: string }).packId = 'yok-boyle-bir-paket'
room2.start('p', 'blur')
stop(room2)

test('seçili paket blur modunda yok sayılır (resimli havuz kullanılır)', () => {
  const questions = (room2 as unknown as { questions: { image?: string }[] }).questions
  for (const q of questions) assert.ok(q.image)
})
stop(room2)

stop(room)
console.log(`\n[blur] sonuç: ${passed} geçti, 0 kaldı`)
