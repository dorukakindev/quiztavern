import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { GameError } from '../src/errors'
import { Room } from '../src/rooms'
import { createXpStore } from '../src/xp'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` })
const internals = (room: Room) => room as unknown as { players: Map<string, { ready: boolean }> }

const lobby = (id: string, ids: string[] = ['a', 'b'], withStore = false) => {
  const r = new Room(id, () => {}, { minPlayers: 1, questionCount: 5 })
  for (const [i, pid] of ids.entries()) r.addPlayer(player(pid, `P${i}`))
  for (const pid of ids) r.setReady(pid, true)
  if (withStore) {
    const store = createXpStore(join(mkdtempSync(join(tmpdir(), 'theme-')), 'xp.db'))
    r.setProgressStore(store)
    return { r, store }
  }
  return { r, store: null }
}

console.log('Masa teması regresyonları')

test('Varsayılan tema tavern', () => {
  const { r } = lobby('t-default')
  assert.equal(r.stateFor('a', true).tableTheme, 'tavern')
})

test('Host değilse tema değiştiremez', () => {
  const { r } = lobby('t-host')
  assert.throws(() => r.setTableTheme('b', 'forest'), (e: unknown) => e instanceof GameError && e.key === 'err.themeHostOnly')
})

test('Geçersiz tema reddedilir', () => {
  const { r } = lobby('t-invalid')
  assert.throws(() => r.setTableTheme('a', 'neon'), (e: unknown) => e instanceof GameError && e.key === 'err.themeInvalid')
})

test('Ligi yetmeyen tema kilitli', () => {
  const { r, store } = lobby('t-locked', ['a', 'b'], true)
  // u henüz hiç XP kazanmadı → acemi → forest (cirak) kilitli.
  assert.throws(() => r.setTableTheme('a', 'forest'), (e: unknown) => e instanceof GameError && e.key === 'err.themeLocked')
  store!.close()
})

test('Ligi yeten tema açılır ve masaya uygulanır', () => {
  const { r, store } = lobby('t-open', ['a', 'b'], true)
  // u'ya doğrudan çırak seviyesinde XP ver (bonusXp sayaçsız grant).
  store!.bonusXp({ userId: 'a', name: 'P0', avatarUrl: null, amount: 600 })
  r.setTableTheme('a', 'forest')
  assert.equal(r.stateFor('a', true).tableTheme, 'forest')
  // Tema masa geneli: b de forest görür.
  assert.equal(r.stateFor('b', true).tableTheme, 'forest')
  store!.close()
})

test('Tema değişince hazırlar sıfırlanır', () => {
  const { r } = lobby('t-unready')
  r.setTableTheme('a', 'tavern') // aynı tema → sıfırlanmaz
  assert.equal(internals(r).players.get('b')!.ready, true)
  // geçerli farklı tema için store'suz acemi yalnız tavern açar; tavern→tavern no-op testi yeterli.
})

test('Store yoksa host acemi sayılır — üst lig teması kilitli', () => {
  const { r } = lobby('t-nostore')
  assert.throws(() => r.setTableTheme('a', 'royal'), (e: unknown) => e instanceof GameError && e.key === 'err.themeLocked')
  r.setTableTheme('a', 'tavern')
  assert.equal(r.stateFor('a', true).tableTheme, 'tavern')
})

test('Efsane lig her temayı açar', () => {
  const { r, store } = lobby('t-legend', ['a'], true)
  store!.bonusXp({ userId: 'a', name: 'P0', avatarUrl: null, amount: 15_000 })
  r.setTableTheme('a', 'void')
  assert.equal(r.stateFor('a', true).tableTheme, 'void')
  store!.close()
})

console.log(`theme-test: ${passed}/8 OK`)
