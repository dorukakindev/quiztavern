import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { questionPoolIds, setQuestionCalibration } from '../src/questions'
import { ALL_QUESTIONS } from '../src/questions'
import { createXpStore } from '../src/xp'
import { Room } from '../src/rooms'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` })
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer()
const begin = (room: Room) => (room as unknown as { beginQuestion: () => void }).beginQuestion()
const internals = (room: Room) => room as unknown as { reveal: () => void; advanceFromReveal: () => void; qIndex: number; revealUntil: number; phase: string }

const store = createXpStore(join(mkdtempSync(join(tmpdir(), 'calib-')), 'xp.db'))
const someQuestion = ALL_QUESTIONS.find((q) => q.difficulty === 'kolay')!
const someMedium = ALL_QUESTIONS.find((q) => q.difficulty === 'orta')!
const someHard = ALL_QUESTIONS.find((q) => q.difficulty === 'zor')!

console.log('Zorluk kalibrasyonu regresyonları')

test('Soru istatistiği yazılır ve toplanır', () => {
  store.recordQuestionStats([{ questionId: 'x1', asked: 10, correct: 4 }])
  store.recordQuestionStats([{ questionId: 'x1', asked: 10, correct: 2 }])
  const row = store.questionStats().find((r) => r.questionId === 'x1')!
  assert.deepEqual({ asked: row.asked, correct: row.correct }, { asked: 20, correct: 6 })
})

test('Düşük doğruluk: kolay etiket ortaya kalibre edilir', () => {
  setQuestionCalibration([{ questionId: someQuestion.id, asked: 30, correct: 5 }])
  assert.ok(!questionPoolIds([], 'kolay').includes(someQuestion.id), 'kolay havuzdan düşmeli')
  assert.ok(questionPoolIds([], 'orta').includes(someQuestion.id), 'orta havuza girmeli')
  setQuestionCalibration([])
})

test('Yüksek doğruluk: orta etiket kolaya kalibre edilir', () => {
  setQuestionCalibration([{ questionId: someMedium.id, asked: 40, correct: 38 }])
  assert.ok(questionPoolIds([], 'kolay').includes(someMedium.id))
  setQuestionCalibration([])
})

test('Az örneklem kalibrasyonu tetiklemez', () => {
  setQuestionCalibration([{ questionId: someQuestion.id, asked: 19, correct: 1 }])
  assert.ok(questionPoolIds([], 'kolay').includes(someQuestion.id))
  setQuestionCalibration([])
})

test('Zor en üst kademe — daha zora çıkmaz', () => {
  setQuestionCalibration([{ questionId: someHard.id, asked: 30, correct: 2 }])
  assert.ok(questionPoolIds([], 'zor').includes(someHard.id))
  setQuestionCalibration([])
})

test('Maç sonu oda istatistikleri store’a yazar (botlar sayılmaz)', () => {
  const s2 = createXpStore(join(mkdtempSync(join(tmpdir(), 'calib-')), 'xp.db'))
  const r = new Room('calib-room', () => {}, { minPlayers: 1, questionCount: 5 })
  r.setProgressStore(s2)
  r.addPlayer(player('u1', 'U1'))
  r.addPlayer({ id: 'bot1', name: 'Bot', avatarUrl: null, socketId: 's:bot1', isBot: true })
  r.setReady('u1', true)
  r.start('u1', 'classic')
  stop(r)
  begin(r)
  // u1 ilk soruyu doğru bildi; bot'un cevabı istatistiğe girmemeli.
  r.answer('u1', r.currentQuestion()!.correctIndex)
  const inner = internals(r)
  inner.reveal()
  inner.revealUntil = 0
  inner.qIndex = r.stateFor('u1', true).round.total - 1
  inner.advanceFromReveal()
  assert.equal(inner.phase, 'podium')
  const stats = s2.questionStats()
  const q0 = stats.find((x) => x.questionId === r.questions[0].id)!
  assert.ok(q0.asked >= 1)
  assert.equal(q0.correct, 1)
  s2.close()
})

test('Cevapsız tur asked sayar, correct saymaz', () => {
  const s3 = createXpStore(join(mkdtempSync(join(tmpdir(), 'calib-')), 'xp.db'))
  const r = new Room('calib-skip', () => {}, { minPlayers: 1, questionCount: 5 })
  r.setProgressStore(s3)
  r.addPlayer(player('u2', 'U2'))
  r.setReady('u2', true)
  r.start('u2', 'classic')
  stop(r)
  begin(r)
  const inner = internals(r)
  inner.reveal()
  inner.revealUntil = 0
  inner.qIndex = r.stateFor('u2', true).round.total - 1
  inner.advanceFromReveal()
  const q0 = s3.questionStats().find((x) => x.questionId === r.questions[0].id)!
  assert.equal(q0.asked, 1)
  assert.equal(q0.correct, 0)
  s3.close()
})

test('Bilinmeyen soru id’si kalibrasyonu bozmaz', () => {
  setQuestionCalibration([{ questionId: 'yok-boyle-soru', asked: 99, correct: 0 }])
  assert.ok(questionPoolIds([], 'kolay').includes(someQuestion.id))
  setQuestionCalibration([])
})

console.log(`calib-test: ${passed}/8 OK`)
store.close()
