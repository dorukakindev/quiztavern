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

// §2 kurtarma turu: bakiyesi biten oyuncu masadan düşmez — bahsi otomatik
// 0'a kilitlenir, doğru cevap BET_BROKE_REWARD kazandırır, ertesi turda
// biriken bakiyeyle normal bahse döner.
const brokeRoom = new Room('edge-broke', () => {}, { minPlayers: 2, questionCount: 5 })
brokeRoom.addPlayer(player('br', 'Broke'))
brokeRoom.addPlayer(player('ok', 'Okay'))
brokeRoom.setGameMode('br', 'bet')
brokeRoom.setReady('br', true)
brokeRoom.setReady('ok', true)
brokeRoom.start('br', 'bet')
stop(brokeRoom)
brokeRoom.players.get('br')!.score = 0
;(brokeRoom as unknown as { beginBet: () => void }).beginBet()

test("bakiyesi 0 olanın bahsi otomatik 0'a kilitlenir ve broke bayrağı döner", () => {
  assert.equal(brokeRoom.players.get('br')!.bet, 0)
  const payload = brokeRoom.stateFor('br', true).bet!
  assert.equal(payload.broke, true)
  assert.equal(payload.brokeReward, GAME.BET_BROKE_REWARD)
  assert.equal(brokeRoom.stateFor('ok', true).bet!.broke, false)
})

test('broke oyuncu masayı bet fazında bekletmez (advanceIfEveryoneBet)', () => {
  brokeRoom.placeBet('ok', 100) // br'nin bahsi zaten 0'a kilitli
  assert.equal(brokeRoom.stateFor('br', true).phase, 'question')
})

const brokeCorrect = brokeRoom.currentQuestion()!.correctIndex
brokeRoom.answer('br', brokeCorrect)
brokeRoom.answer('ok', brokeCorrect)
;(brokeRoom as unknown as { reveal: () => void }).reveal()

test('broke turunda doğru cevap BET_BROKE_REWARD kazandırır', () => {
  assert.equal(brokeRoom.players.get('br')!.score, GAME.BET_BROKE_REWARD)
})

;(brokeRoom as unknown as { beginBet: () => void }).beginBet()

test('ertesi turda kurtarılan bakiyeyle normal bahis (broke temizlenir)', () => {
  const payload = brokeRoom.stateFor('br', true).bet!
  assert.equal(payload.broke, false)
  assert.equal(payload.bankroll, GAME.BET_BROKE_REWARD)
  assert.equal(brokeRoom.players.get('br')!.bet, null)
  brokeRoom.placeBet('br', 50)
  assert.equal(brokeRoom.players.get('br')!.bet, 50)
})
stop(brokeRoom)

test('takım karıştırma: dengeli dağıtır, host ve takım modu şart', () => {
  const shuffleRoom = new Room('edge-shuffle', () => {}, { minPlayers: 1 })
  for (const id of ['s1', 's2', 's3', 's4', 's5']) shuffleRoom.addPlayer(player(id, id))
  shuffleRoom.setGameMode('s1', 'team')
  // Host değil → red; takım modu değil → red
  assert.throws(() => shuffleRoom.shuffleTeams('s2'), /teamHostOnly/)
  const classic = new Room('edge-shuffle-kl', () => {}, { minPlayers: 1 })
  classic.addPlayer(player('k', 'k'))
  assert.throws(() => classic.shuffleTeams('k'), /teamInvalid/)
  for (let round = 0; round < 8; round++) {
    shuffleRoom.shuffleTeams('s1')
    const teams = [...shuffleRoom.players.values()].map((p) => p.team)
    assert.ok(teams.every((t) => t === 0 || t === 1))
    const a = teams.filter((t) => t === 0).length
    const b = teams.filter((t) => t === 1).length
    assert.ok(Math.abs(a - b) <= 1 && a + b === 5, `dengesiz dağılım: ${a}-${b}`)
  }
  // Hazır onayları korunur (setTeam kuralıyla aynı)
  shuffleRoom.setReady('s2', true)
  shuffleRoom.shuffleTeams('s1')
  assert.equal(shuffleRoom.players.get('s2')!.ready, true)
})

test('final bahsi: bayrak yalnız son soruda döner', () => {
  const fin = new Room('edge-final', () => {}, { minPlayers: 1, questionCount: 5 })
  fin.addPlayer(player('f', 'F'))
  fin.setGameMode('f', 'bet')
  fin.setReady('f', true)
  fin.start('f', 'bet')
  stop(fin)
  ;(fin as unknown as { beginBet: () => void }).beginBet()
  assert.equal(fin.stateFor('f', true).bet?.final, undefined)
  ;(fin as unknown as { qIndex: number }).qIndex = 9 // bet modu 10 soruya sıfırlar → son soru
  ;(fin as unknown as { beginBet: () => void }).beginBet()
  assert.equal(fin.stateFor('f', true).bet?.final, true)
})
test('reveal bahisleri taşır: bets haritası kilitlenen tutarları gösterir', () => {
  const showRoom = new Room('edge-showbet', () => {}, { minPlayers: 1, questionCount: 5 })
  showRoom.addPlayer(player('p1', 'P1'))
  showRoom.addPlayer(player('p2', 'P2'))
  showRoom.setGameMode('p1', 'bet')
  showRoom.setReady('p1', true)
  showRoom.setReady('p2', true)
  showRoom.start('p1', 'bet')
  stop(showRoom)
  ;(showRoom as unknown as { beginBet: () => void }).beginBet()
  showRoom.placeBet('p1', 250)
  showRoom.placeBet('p2', 0) // pas
  ;(showRoom as unknown as { beginQuestion: () => void }).beginQuestion()
  showRoom.answer('p1', showRoom.currentQuestion()!.correctIndex)
  showRoom.answer('p2', (showRoom.currentQuestion()!.correctIndex + 1) % 4)
  ;(showRoom as unknown as { reveal: () => void }).reveal()
  const reveal = showRoom.stateFor('p1', true).reveal!
  assert.deepEqual(reveal.bets, { p1: 250, p2: 0 })
  // klasik maçta bets alanı olmaz
  const kl = new Room('edge-nobets', () => {}, { minPlayers: 1, questionCount: 5 })
  kl.addPlayer(player('k', 'K'))
  kl.setReady('k', true)
  kl.start('k', 'classic')
  stop(kl)
  ;(kl as unknown as { beginQuestion: () => void }).beginQuestion()
  kl.answer('k', kl.currentQuestion()!.correctIndex)
  assert.equal(kl.stateFor('k', true).reveal!.bets, undefined)
})

console.log(`\n[bet-team-edge] sonuç: ${passed} geçti, 0 kaldı`)
