import { strict as assert } from 'node:assert'
import { GAME } from '../src/config'
import { GameError } from '../src/errors'
import { Room } from '../src/rooms'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false })
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer()
const begin = (room: Room) => (room as unknown as { beginQuestion: () => void }).beginQuestion()
const reveal = (room: Room) => (room as unknown as { reveal: () => void }).reveal()
const internals = (room: Room) => room as unknown as {
  advanceFromReveal: () => void
  qIndex: number
  players: Map<string, { cards: number; eligibleFrom: number; stats: { currentStreak: number } }>
}

const room = (id: string, mode?: string) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 5 })
  r.addPlayer(player('a', 'Ada'))
  r.addPlayer(player('b', 'Bora'))
  r.setReady('a', true)
  r.setReady('b', true)
  r.start('a', mode as 'classic' | undefined)
  stop(r)
  begin(r)
  return r
}

console.log('Tavern kartları (joker) regresyonları')

test('Klasik maçta herkes 1 kartla başlar; state yourCards/removedChoices taşır', () => {
  const r = room('cards-start')
  const s = r.stateFor('a', true)
  assert.equal(s.yourCards, 1)
  assert.deepEqual(s.removedChoices, [])
  assert.equal(s.yourCardUsed, null)
  assert.equal(s.players.find((p) => p.id === 'b')?.cards, 1)
})

test('%50: iki yanlış şık silinir, doğru şık silinmez, kart 1 harcanır', () => {
  const r = room('cards-fifty')
  const correct = r.currentQuestion()!.correctIndex
  r.useCard('a', 'fifty')
  const s = r.stateFor('a', true)
  assert.equal(s.removedChoices.length, 2)
  assert.ok(!s.removedChoices.includes(correct))
  assert.equal(s.yourCards, 0)
  assert.equal(s.yourCardUsed, 'fifty')
  // Silinmiş şık seçilemez; doğru şık seçilebilir.
  r.answer('a', s.removedChoices[0])
  assert.equal(r.stateFor('a', true).yourChoice, null)
  r.answer('a', correct)
  assert.equal(r.stateFor('a', true).yourChoice, correct)
  // Silinenler yalnız kullananın payload'ında — rakip boş liste görür.
  assert.deepEqual(r.stateFor('b', true).removedChoices, [])
})

test('tur başına bir kart: ikinci kullanım reddedilir', () => {
  const r = room('cards-once')
  r.useCard('a', 'double')
  assert.throws(() => r.useCard('a', 'shield'), (e) => e instanceof GameError && e.key === 'err.cardUsed')
})

test('kart yoksa err.cardEmpty', () => {
  const r = room('cards-none')
  internals(r).players.get('a')!.cards = 0
  assert.throws(() => r.useCard('a', 'fifty'), (e) => e instanceof GameError && e.key === 'err.cardEmpty')
})

test('cevap kilitlendikten sonra err.cardLate', () => {
  const r = room('cards-late')
  r.answer('a', r.currentQuestion()!.correctIndex)
  assert.throws(() => r.useCard('a', 'fifty'), (e) => e instanceof GameError && e.key === 'err.cardLate')
})

test('Çifte: doğru cevabın kazancı ×2 olur', () => {
  const r = room('cards-double')
  const correct = r.currentQuestion()!.correctIndex
  r.useCard('a', 'double')
  r.answer('a', correct)
  r.answer('b', correct)
  reveal(r)
  const gains = r.stateFor('a', true).reveal!.gains
  assert.ok(gains.a > 0 && gains.b > 0)
  assert.equal(gains.a, gains.b * 2)
})

test('Kalkan: yanlış cevap seriyi bozmaz', () => {
  const r = room('cards-shield')
  internals(r).players.get('a')!.stats.currentStreak = 2
  const correct = r.currentQuestion()!.correctIndex
  r.useCard('a', 'shield')
  r.answer('a', (correct + 1) % 4)
  r.answer('b', correct)
  reveal(r)
  assert.equal(internals(r).players.get('a')!.stats.currentStreak, 2)
})

test('Dondur: hedefin süresi kısalır ve kişisel deadline gider', () => {
  const r = room('cards-freeze')
  r.useCard('a', 'freeze', 'b')
  const bState = r.stateFor('b', true)
  const aState = r.stateFor('a', true)
  assert.equal(bState.youFrozen, true)
  assert.equal(aState.youFrozen, false)
  assert.equal(bState.question!.deadline, aState.question!.deadline - GAME.CARD_FREEZE_MS)
  // Kendini ya da geçersiz hedefi donduramaz.
  assert.throws(() => r.useCard('b', 'freeze', 'b'), (e) => e instanceof GameError && e.key === 'err.invalidTarget')
})

test("3'lü seride +1 kart kazanılır", () => {
  const r = new Room('cards-streak', () => {}, { minPlayers: 1, questionCount: 10 })
  r.addPlayer(player('a', 'Ada'))
  r.addPlayer(player('b', 'Bora'))
  r.setReady('a', true)
  r.setReady('b', true)
  r.start('a')
  stop(r)
  for (let i = 0; i < 3; i++) {
    begin(r)
    r.answer('a', r.currentQuestion()!.correctIndex)
    reveal(r)
    internals(r).advanceFromReveal()
    internals(r).qIndex += 1
  }
  assert.equal(internals(r).players.get('a')!.cards, 2)
})

test('kartlar yalnız Klasik/Takım: Çember modunda err.cardMode', () => {
  const r = new Room('cards-mode', () => {}, { minPlayers: 1, questionCount: 10 })
  r.addPlayer(player('a', 'Ada'))
  r.setReady('a', true)
  r.start('a', 'circle')
  stop(r)
  begin(r)
  assert.throws(() => r.useCard('a', 'fifty'), (e) => e instanceof GameError && e.key === 'err.cardMode')
})

test('soru dışı fazda err.cardPhase', () => {
  const r = new Room('cards-phase', () => {}, { minPlayers: 1, questionCount: 5 })
  r.addPlayer(player('a', 'Ada'))
  internals(r).players.get('a')!.cards = 1
  assert.throws(() => r.useCard('a', 'fifty'), (e) => e instanceof GameError && e.key === 'err.cardPhase')
})

test('yeni turda kart etkileri sıfırlanır', () => {
  const r = room('cards-reset')
  r.useCard('a', 'fifty')
  r.answer('a', r.currentQuestion()!.correctIndex)
  reveal(r)
  internals(r).advanceFromReveal()
  internals(r).qIndex += 1
  begin(r)
  const s = r.stateFor('a', true)
  assert.equal(s.yourCardUsed, null)
  assert.deepEqual(s.removedChoices, [])
  assert.equal(s.youFrozen, false)
})

test("3'lü seri kart kazanımı oyuncuya toast olarak gider", () => {
  const r = new Room('cards-toast', () => {}, { minPlayers: 1, questionCount: 10 })
  const seen: [string, string][] = []
  r.setToastHandler((playerId, key) => seen.push([playerId, key]))
  r.addPlayer(player('a', 'Ada'))
  r.addPlayer(player('b', 'Bora'))
  r.setReady('a', true)
  r.setReady('b', true)
  r.start('a')
  stop(r)
  for (let i = 0; i < 3; i++) {
    begin(r)
    r.answer('a', r.currentQuestion()!.correctIndex)
    reveal(r)
    internals(r).advanceFromReveal()
    internals(r).qIndex += 1
  }
  assert.deepEqual(seen, [['a', 'info.cardEarned']])
})

console.log(`\n${passed} test geçti — Tavern kartları`)
