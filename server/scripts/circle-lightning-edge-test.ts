import { strict as assert } from 'node:assert'
import { ALL_CIRCLE_PROMPTS, normalizeCircleAnswer, type CirclePrompt } from '../src/circle'
import { Room } from '../src/rooms'
import type { Question } from '../src/questions'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false })
const internals = (room: Room) => room as unknown as {
  circlePrompts: CirclePrompt[]
  questions: Question[]
  lightningBurn: number
  finish: () => void
}

console.log('Çember + Fitil edge-case regresyonları')

test('Çember normalizasyonu ASCII I ve Türkçe İ büyük harflerini birlikte kabul eder', () => {
  assert.equal(normalizeCircleAnswer('IGUANODON'), normalizeCircleAnswer('iguanodon'))
  assert.equal(normalizeCircleAnswer('İSTANBUL'), normalizeCircleAnswer('istanbul'))
})

test('tireli Çember cevabı tire yazılmadan da kabul edilir', () => {
  assert.equal(normalizeCircleAnswer('binge-watch'), normalizeCircleAnswer('binge watch'))
  assert.equal(normalizeCircleAnswer('binge-watch'), normalizeCircleAnswer('bingewatch'))
})

const circleRoom = new Room('edge-circle', () => {}, { minPlayers: 1 })
circleRoom.addPlayer(player('host', 'Host'))
circleRoom.addPlayer(player('peer', 'Peer'))
circleRoom.gameMode = 'circle'
circleRoom.phase = 'question'
circleRoom.qIndex = 0
circleRoom.questionStartedAt = Date.now()
circleRoom.questionDeadline = Date.now() + 10_000
const iguanodon = ALL_CIRCLE_PROMPTS.find((prompt) => prompt.answer === 'iguanodon')!
internals(circleRoom).circlePrompts = [iguanodon]

test('CAPS yazılan doğru Çember cevabı uçtan uca doğru işaretlenir', () => {
  circleRoom.answerCircle('host', 'IGUANODON')
  assert.notEqual(circleRoom.players.get('host')!.circleCorrectAt, null)
})

const late = circleRoom.addPlayer(player('late', 'Late'))
test('aktif Çember turuna geç katılan oyuncu sunucuda sonraki turu bekler', () => {
  assert.equal(late.eligibleFrom, 1)
  circleRoom.answerCircle('late', 'iguanodon')
  assert.equal(late.circleAnswer, null)
  assert.equal(circleRoom.stateFor('late', true).players.find((item) => item.id === 'late')?.waiting, true)
})

const podiumRoom = new Room('edge-lightning-podium', () => {}, { minPlayers: 1 })
podiumRoom.addPlayer(player('fast', 'Ada'))
podiumRoom.addPlayer(player('slow', 'Bora'))
podiumRoom.gameMode = 'lightning'
podiumRoom.players.get('fast')!.score = 100
podiumRoom.players.get('slow')!.score = 50
podiumRoom.players.get('fast')!.stats.fastestMs = 100
podiumRoom.players.get('slow')!.stats.fastestMs = 200
internals(podiumRoom).finish()
const podiumBefore = podiumRoom.stateFor('slow', true)

test('podyumda ayrılan oyuncu en hızlı parmak özetini değiştirmez', () => {
  podiumRoom.removePlayer('fast')
  const after = podiumRoom.stateFor('slow', true)
  assert.deepEqual(after.podium, podiumBefore.podium)
  assert.deepEqual(after.matchSummary?.fastest, { name: 'Ada', ms: 100 })
})

const burnRoom = new Room('edge-lightning-burn', () => {}, { minPlayers: 1 })
burnRoom.addPlayer(player('ace', 'Ace'))
burnRoom.gameMode = 'lightning'
burnRoom.phase = 'question'
burnRoom.qIndex = 0
internals(burnRoom).questions = [{ id: 't1', category: 'x', text: 'test?', choices: ['a', 'b', 'c', 'd'], correctIndex: 2, difficulty: 'kolay', textEn: 'test?', choicesEn: ['a', 'b', 'c', 'd'] }]
burnRoom.questionStartedAt = Date.now()
burnRoom.questionDeadline = Date.now() + 8_000

test('Fitil: doğru cevap çıkan tur fitili 0,5 sn kısaltır (4 sn tabanı)', () => {
  assert.equal(burnRoom.questionDuration(), 8_000)
  burnRoom.answer('ace', 2) // herkes cevapladı → reveal → burn++
  assert.equal(burnRoom.questionDuration(), 8_000 - 500)
  // Taban: burn ne kadar büyük olursa olsun süre 4 sn'nin altına inmez.
  internals(burnRoom).lightningBurn = 99
  assert.equal(burnRoom.questionDuration(), 4_000)
  internals(burnRoom).lightningBurn = 1
})

test('Çember tur sayısı: host 10/15/20 seçebilir, klasik set reddedilir', () => {
  const room = new Room('edge-ccount', () => {}, { minPlayers: 1 })
  room.addPlayer(player('h', 'Host'))
  room.setGameMode('h', 'circle')
  assert.equal(room.stateFor('h', true).questionCount, 20) // moda özel varsayılan
  room.setQuestionCount('h', 15)
  assert.equal(room.stateFor('h', true).questionCount, 15)
  assert.throws(() => room.setQuestionCount('h', 5), /countInvalid/)
  room.setReady('h', true)
  room.start('h', 'circle')
  assert.equal(room.stateFor('h', true).round.total, 15)
})

console.log(`\n[circle-lightning-edge] sonuç: ${passed} geçti, 0 kaldı`)
