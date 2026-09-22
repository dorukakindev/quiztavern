import { strict as assert } from 'node:assert'
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

console.log('Çifte Bahis + Takım edge-case regresyonları')

const teamRoom = new Room('edge-team', () => {}, { minPlayers: 2, questionCount: 5 })
teamRoom.addPlayer(player('a', 'Ada'))
teamRoom.addPlayer(player('b', 'Bora'))
teamRoom.addPlayer(player('c', 'Cem'))
teamRoom.setGameMode('a', 'team')
teamRoom.setTeam('a', 'b', 0)
teamRoom.setTeam('a', 'c', 0)
teamRoom.setReady('a', true)
teamRoom.setReady('b', true)
teamRoom.setReady('c', true)

test('boş takımla Takım maçı başlatılamaz', () => {
  assert.throws(
    () => teamRoom.start('a', 'team'),
    (error: unknown) => error instanceof GameError && error.key === 'err.teamNeedsBothSides',
  )
  assert.equal(teamRoom.phase, 'lobby')
})

teamRoom.setTeam('a', 'b', 1)
teamRoom.start('a', 'team')
stop(teamRoom)
;(teamRoom as unknown as { beginQuestion: () => void }).beginQuestion()
const correct = teamRoom.currentQuestion()!.correctIndex
teamRoom.answer('a', correct)
teamRoom.answer('b', (correct + 1) % 4)
teamRoom.answer('c', (correct + 1) % 4)

const scoredState = teamRoom.stateFor('a', true)
const earnedTeamScores = [...scoredState.teamScores] as [number, number]
assert.ok(earnedTeamScores[0] > 0)

test('puan kazanan oyuncu ayrılınca takım havuzu eksilmez', () => {
  teamRoom.removePlayer('a')
  assert.deepEqual(teamRoom.stateFor('b', true).teamScores, earnedTeamScores)
})

teamRoom.players.get('b')!.score = 500
teamRoom.players.get('c')!.score = 100
;(teamRoom as unknown as { finish: () => void }).finish()
const frozenPodium = teamRoom.stateFor('b', true).podium!

test('podyumdaki ayrılma sıralamayı, MVPyi ve takım sonucunu değiştirmez', () => {
  teamRoom.removePlayer('b')
  const after = teamRoom.stateFor('c', true)
  assert.deepEqual(after.podium, frozenPodium)
  assert.deepEqual(after.teamScores, earnedTeamScores)
  assert.equal(after.podium?.[0]?.id, 'b')
})
stop(teamRoom)

const replayRoom = new Room('edge-team-replay', () => {}, { minPlayers: 2 })
replayRoom.addPlayer(player('r1', 'Replay One'))
replayRoom.addPlayer(player('r2', 'Replay Two'))
replayRoom.setGameMode('r1', 'team')
replayRoom.setTeam('r1', 'r2', 0)
;(replayRoom as unknown as { phase: 'podium' }).phase = 'podium'

test('podyum ayrılıkları bir takımı boşalttıysa tekrar oyunda bağlı koltuklar dengelenir', () => {
  replayRoom.start('r1', 'team')
  const teams = replayRoom.stateFor('r1', true).players.map((item) => item.team).sort()
  assert.deepEqual(teams, [0, 1])
})
stop(replayRoom)

const betRoom = new Room('edge-bet', () => {}, { minPlayers: 2, questionCount: 5 })
betRoom.addPlayer(player('h', 'Host'))
betRoom.addPlayer(player('g', 'Guest'))
betRoom.setGameMode('h', 'bet')
betRoom.setQuestionCount('h', 5)
betRoom.setReady('h', true)
betRoom.setReady('g', true)
betRoom.start('h', 'bet')

test('bahis countdownında katılan oyuncu başlangıç bakiyesini alır', () => {
  const countdownJoiner = betRoom.addPlayer(player('countdown', 'Countdown'))
  assert.equal(countdownJoiner.score, 1000)
  assert.equal(countdownJoiner.eligibleFrom, 0)
})

stop(betRoom)
;(betRoom as unknown as { beginBet: () => void }).beginBet()
const late = betRoom.addPlayer(player('late', 'Late'))

test('aktif bahis maçına sonradan oturan oyuncu sonraki maça kadar bekler', () => {
  assert.equal(late.score, 0)
  assert.equal(late.eligibleFrom, 5)
  assert.equal(betRoom.stateFor('late', true).players.find((item) => item.id === 'late')?.waiting, true)
})

;(betRoom as unknown as { finish: () => void }).finish()
betRoom.start('h', 'bet')

test('bekleyen bahis oyuncusu yeni maçta başlangıç bakiyesiyle etkinleşir', () => {
  const restarted = betRoom.players.get('late')!
  assert.equal(restarted.score, 1000)
  assert.equal(restarted.eligibleFrom, 0)
})
stop(betRoom)

console.log(`\n[bet-team-edge] sonuç: ${passed} geçti, 0 kaldı`)
