import { strict as assert } from 'node:assert'
import { GameError } from '../src/errors'
import { Room } from '../src/rooms'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string, isBot = false) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot })
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer()
const begin = (room: Room) => (room as unknown as { beginQuestion: () => void }).beginQuestion()
const reveal = (room: Room) => (room as unknown as { reveal: () => void }).reveal()
const internals = (room: Room) => room as unknown as {
  advanceFromReveal: () => void
  qIndex: number
  revealUntil: number
  phase: string
  players: Map<string, { connected: boolean }>
  rematchVotes: Set<string>
}

/** Son soruya kadar koşup podyuma düşen hazır oda. */
const podiumRoom = (id: string, playerIds: string[] = ['a', 'b']) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 2 })
  for (const [i, pid] of playerIds.entries()) r.addPlayer(player(pid, `P${i}`))
  for (const pid of playerIds) r.setReady(pid, true)
  r.start(playerIds[0], 'classic')
  stop(r)
  begin(r)
  // Son soruya zıpla; reveal -> advanceFromReveal -> finish -> podium.
  const inner = internals(r)
  inner.qIndex = r.stateFor(playerIds[0], true).round.total - 1
  reveal(r)
  inner.revealUntil = 0
  inner.advanceFromReveal()
  assert.equal(internals(r).phase, 'podium', `${id}: podyuma ulaşılamadı`)
  return r
}

console.log('Rövanş oylaması regresyonları')

test('Podyumda oy toplanır; eşik altında maç başlamaz', () => {
  const r = podiumRoom('rematch-half')
  r.voteRematch('a')
  const s = r.stateFor('a', true)
  assert.equal(s.phase, 'podium')
  assert.deepEqual(s.rematch, { votes: 1, needed: 2, youVoted: true })
  // Rakip henüz oy vermedi: onun payload'ında youVoted false.
  assert.equal(r.stateFor('b', true).rematch?.youVoted, false)
})

test('Çoğunluk sağlanınca sunucu yeni maçı host adına başlatır', () => {
  const r = podiumRoom('rematch-pass')
  r.voteRematch('a')
  r.voteRematch('b') // 2/2 ≥ needed → start()
  assert.notEqual(internals(r).phase, 'podium')
  const s = r.stateFor('a', true)
  assert.equal(s.rematch, null) // yeni maçta oylama sıfırlandı
})

test('Aynı oyuncunun ikinci oyu sayılmaz', () => {
  const r = podiumRoom('rematch-dup', ['a', 'b', 'c'])
  r.voteRematch('a')
  r.voteRematch('a')
  assert.equal(r.stateFor('a', true).rematch?.votes, 1)
})

test('Podyum dışında oy reddedilir', () => {
  const r = podiumRoom('rematch-phase')
  internals(r).phase = 'question'
  assert.throws(() => r.voteRematch('a'), (e: unknown) => e instanceof GameError && (e as GameError).key === 'err.rematchPhase')
})

test('Bot ve izleyici oy kullanamaz; eşik yalnız insanları sayar', () => {
  const r = podiumRoom('rematch-bot', ['a', 'b'])
  r.addPlayer(player('bot', 'Bot', true))
  // 2 insan → needed = 2; bot'un oyu geçmez.
  r.voteRematch('bot')
  assert.equal(r.stateFor('a', true).rematch?.votes, 0)
  r.becomeSpectator('b')
  // b izleyici: oy veremez; a tek bağlı insan → needed = 1, tek oyu yeter.
  r.voteRematch('b')
  assert.equal(internals(r).phase, 'podium')
  r.voteRematch('a')
  assert.notEqual(internals(r).phase, 'podium')
})

test('Ayrılan oyuncunun oyu düşer', () => {
  const r = podiumRoom('rematch-leave', ['a', 'b', 'c'])
  r.voteRematch('a')
  r.removePlayer('a')
  assert.equal(r.stateFor('b', true).rematch?.votes, 0)
})

test('Kopan oyuncu eşikten düşer — bekleyen çoğunluk maçı hemen başlatır', () => {
  const r = podiumRoom('rematch-away', ['a', 'b'])
  r.voteRematch('a')                    // 1/2 — henüz yeterli değil
  r.markDisconnected('b')               // tek bağlı insan kaldı → needed=1
  assert.notEqual(internals(r).phase, 'podium') // a'nın saklı oyu başlattı
})

console.log(`\n${passed} test geçti — rövanş oylaması`)

// Odaların asılı zamanlayıcıları process'i açık tutmasın — senkron
// testler bittiğinde çık.
process.exit(0)
