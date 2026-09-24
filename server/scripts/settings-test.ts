import { strict as assert } from 'node:assert'
import { GameError } from '../src/errors'
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
const internals = (room: Room) => room as unknown as {
  reveal: () => void
  questionDeadline: number
  players: Map<string, { ready: boolean; score: number }>
}

const lobby = (id: string, ids: string[] = ['a', 'b']) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 5 })
  for (const [i, pid] of ids.entries()) r.addPlayer(player(pid, `P${i}`))
  for (const pid of ids) r.setReady(pid, true)
  return r
}

console.log('Masa ayarları regresyonları')

test('Host değilse süre değiştiremez', () => {
  const r = lobby('s-host')
  assert.throws(() => r.setQuestionTime('b', 10_000), (e: unknown) => e instanceof GameError && e.key === 'err.timeHostOnly')
})

test('Geçersiz süre reddedilir', () => {
  const r = lobby('s-invalid')
  assert.throws(() => r.setQuestionTime('a', 7_000), (e: unknown) => e instanceof GameError && e.key === 'err.timeInvalid')
})

test('Süre ayarı soruya uygulanır', () => {
  const r = lobby('s-time')
  r.setQuestionTime('a', 10_000)
  r.setReady('a', true); r.setReady('b', true)
  r.start('a', 'classic')
  stop(r)
  begin(r)
  const inner = internals(r)
  assert.ok(inner.questionDeadline - Date.now() <= 10_500, `deadline ${inner.questionDeadline - Date.now()} 10sn üstünde`)
  assert.ok(inner.questionDeadline - Date.now() > 9_000)
})

test('Ayar değişince hazırlar sıfırlanır', () => {
  const r = lobby('s-unready')
  r.setQuestionTime('a', 20_000)
  assert.equal(internals(r).players.get('b')!.ready, false)
  assert.equal(r.stateFor('a', true).questionTimeMs, 20_000)
})

test('Hız bonusu kapalıyken doğru cevap yalnız taban puan verir', () => {
  const r = lobby('s-flat')
  r.setTableFlag('a', 'speedBonus', false)
  r.setReady('a', true); r.setReady('b', true)
  r.start('a', 'classic')
  stop(r)
  begin(r)
  r.answer('a', r.currentQuestion()!.correctIndex)
  const inner = internals(r)
  inner.reveal()
  // Taban 700; hız bonusu açık olsaydı erken cevap ~1000 olurdu.
  assert.equal(inner.players.get('a')!.score, 700, `skor 700 olmalı, ${inner.players.get('a')!.score}`)
})

test('Hız bonusu açıkken erken doğru cevap taban üstü verir', () => {
  const r = lobby('s-speed')
  r.setReady('a', true); r.setReady('b', true)
  r.start('a', 'classic')
  stop(r)
  begin(r)
  r.answer('a', r.currentQuestion()!.correctIndex)
  internals(r).reveal()
  assert.ok(internals(r).players.get('a')!.score > 700)
})

test('Sadece resimli: seçilen tüm soruların görseli var', () => {
  const r = lobby('s-img', ['a'])
  r.setTableFlag('a', 'imageOnly', true)
  r.setReady('a', true)
  r.start('a', 'classic')
  for (const q of r.questions) assert.ok(q.image, `resimsiz soru: ${q.id}`)
  assert.equal(r.stateFor('a', true).imageOnly, true)
})

test('Non-boolean bayrak reddedilir', () => {
  const r = lobby('s-flag')
  assert.throws(() => r.setTableFlag('a', 'imageOnly', 'yes'), (e: unknown) => e instanceof GameError && e.key === 'err.settingInvalid')
})

console.log(`settings-test: ${passed}/8 OK`)
