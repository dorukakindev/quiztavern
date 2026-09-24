import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { Room } from '../src/rooms'
import { createXpStore, weekKey, prevWeekKey } from '../src/xp'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const entry = (userId: string, name: string, placement: number, correct: number) => ({
  userId, name, avatarUrl: null, correct, total: 10, bestStreak: correct, placement, won: placement === 1,
})
const mkStore = () => createXpStore(join(mkdtempSync(join(tmpdir(), 'weekly-')), 'xp.db'))
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` })

console.log('Haftalık turnuva regresyonları')

test('weekKey ISO-8601 Pazartesi başlangıçlı', () => {
  assert.equal(weekKey(new Date('2026-09-22T12:00:00Z')), '2026-W39')
  assert.equal(weekKey(new Date('2026-09-21T00:00:00Z')), '2026-W39')
  assert.equal(weekKey(new Date('2026-09-20T23:00:00Z')), '2026-W38')
  assert.equal(prevWeekKey(new Date('2026-09-22T12:00:00Z')), '2026-W38')
})

test('Maç XPsi haftalık tabloya yazar ve sıralanır', () => {
  const store = mkStore()
  store.recordMatch([entry('a', 'Ali', 1, 8), entry('b', 'Bora', 2, 5)], new Date('2026-09-22T12:00:00Z'))
  const board = store.weeklyBoard(5, new Date('2026-09-22T13:00:00Z'))
  assert.equal(board.season, '2026-W39')
  assert.equal(board.entries[0].userId, 'a')
  assert.ok(board.entries[0].xp > board.entries[1].xp)
  store.close()
})

test('Farklı haftanın puanı ayrı tutulur', () => {
  const store = mkStore()
  store.recordMatch([entry('a', 'Ali', 1, 8)], new Date('2026-09-20T12:00:00Z'))
  store.recordMatch([entry('a', 'Ali', 1, 8)], new Date('2026-09-22T12:00:00Z'))
  const w38 = store.weeklyBoard(5, new Date('2026-09-20T13:00:00Z'))
  const w39 = store.weeklyBoard(5, new Date('2026-09-22T13:00:00Z'))
  assert.equal(w38.season, '2026-W38')
  assert.equal(w39.season, '2026-W39')
  store.close()
})

test('Geçen haftanın şampiyonu haftaSampiyonu rozetini kazanır', () => {
  const store = mkStore()
  store.recordMatch([entry('a', 'Ali', 1, 9)], new Date('2026-09-20T12:00:00Z'))
  const gains = store.recordMatch([entry('a', 'Ali', 1, 9)], new Date('2026-09-22T12:00:00Z'))
  const badges = gains.get('a')!.newBadges ?? []
  assert.ok(badges.includes('haftaSampiyonu'), `rozetler: ${badges}`)
  store.close()
})

test('Şampiyon olmayan rozet kazanmaz', () => {
  const store = mkStore()
  store.recordMatch([entry('a', 'Ali', 1, 9), entry('b', 'Bora', 2, 3)], new Date('2026-09-20T12:00:00Z'))
  const gains = store.recordMatch([entry('b', 'Bora', 1, 9)], new Date('2026-09-22T12:00:00Z'))
  const badges = gains.get('b')!.newBadges ?? []
  assert.ok(!badges.includes('haftaSampiyonu'))
  store.close()
})

test('GameState weeklyBoard taşır', () => {
  const store = mkStore()
  const r = new Room('wk-1', () => {}, { minPlayers: 1, questionCount: 3 })
  r.addPlayer(player('a', 'Ali'))
  r.setProgressStore(store)
  store.recordMatch([entry('a', 'Ali', 1, 8)], new Date())
  const state = r.stateFor('a', true)
  assert.ok(state.weeklyBoard)
  assert.equal(state.weeklyBoard!.entries[0].userId, 'a')
  store.close()
})

test('Store yoksa weeklyBoard null', () => {
  const r = new Room('wk-2', () => {}, { minPlayers: 1, questionCount: 3 })
  r.addPlayer(player('a', 'Ali'))
  assert.equal(r.stateFor('a', true).weeklyBoard, null)
})

console.log(`weekly-test: ${passed}/7 OK`)
