/**
 * FAZ 2 güvenilirlik kanıtları — reconnect grace, oda kapasitesi, soru
 * tekrarını önleme. Room + soru havuzu üzerinde doğrudan sürülür.
 * Çalıştırma: npx tsx scripts/reliability-test.ts
 */
import { strict as assert } from 'node:assert'
import { GAME } from '../src/config'
import { GameError } from '../src/errors'
import { Room } from '../src/rooms'
import { questionPoolIds, resetExhaustedSubpools, sampleQuestions } from '../src/questions'

let passed = 0
const test = (name: string, run: () => void) => {
  run()
  passed += 1
  console.log(`  ✓ ${name}`)
}
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}`, isBot: false })
const stop = (room: Room) => (room as unknown as { clearTimer: () => void }).clearTimer()

console.log('Güvenilirlik testleri (reconnect / kapasite / tekrar önleme)')

// ── Reconnect ──────────────────────────────────────────────────────────────
const room = new Room('rel-reconnect', () => {}, { minPlayers: 2, questionCount: 5 })
room.addPlayer(player('a', 'Ada'))
room.addPlayer(player('b', 'Bora'))
room.setReady('a', true)
room.setReady('b', true)
room.start('a', 'classic')
stop(room)
;(room as unknown as { beginQuestion: () => void }).beginQuestion()
const aSeat = room.players.get('a')!.seat
const aScore = (room.players.get('a')!.score = 500)

test('maç sırasında kopan oyuncunun koltuğu ve skoru korunur', () => {
  room.markDisconnected('a')
  const seatless = room.players.get('a')!
  assert.equal(seatless.connected, false)
  assert.equal(seatless.seat, aSeat)
  assert.equal(seatless.score, aScore)
})

test('30 sn içinde dönen oyuncu aynı koltuk + skorla devam eder', () => {
  const rejoined = room.join({ ...player('a', 'Ada'), socketId: 'socket:a-new' })
  assert.equal(rejoined.role, 'player')
  const back = room.players.get('a')!
  assert.equal(back.connected, true)
  assert.equal(back.seat, aSeat)
  assert.equal(back.score, aScore)
})

test('eski socketin geç disconnecti yeniden bağlananı düşürmez', () => {
  room.markDisconnected('a', 'socket:a') // stale socket id
  assert.equal(room.players.get('a')!.connected, true)
})

test('grace süresi dolunca koltuk boşalır', () => {
  // Grace callback'ini gerçek 30 sn beklemeden yakalayıp hemen çalıştır.
  const originalSetTimeout = global.setTimeout
  let graceCb: (() => void) | null = null
  ;(global as unknown as { setTimeout: unknown }).setTimeout = (cb: () => void) => {
    graceCb = cb
    return 0 as unknown as NodeJS.Timeout
  }
  try {
    room.markDisconnected('a')
  } finally {
    ;(global as unknown as { setTimeout: unknown }).setTimeout = originalSetTimeout
  }
  assert.ok(graceCb, 'grace timer kuruldu')
  graceCb!()
  assert.ok(!room.players.has('a'), 'grace bitiminde oyuncu masadan düştü')
})

// ── Lobide kopma ───────────────────────────────────────────────────────────
const lobbyRoom = new Room('rel-lobby', () => {}, { minPlayers: 1 })
lobbyRoom.addPlayer(player('x', 'Xen'))
test('lobide kopan oyuncu grace olmadan anında silinir', () => {
  lobbyRoom.markDisconnected('x')
  assert.ok(!lobbyRoom.players.has('x'))
})
stop(lobbyRoom)
stop(room)

// ── Kapasite ───────────────────────────────────────────────────────────────
const capRoom = new Room('rel-cap', () => {}, { minPlayers: 1 })
for (let i = 0; i < GAME.MAX_PLAYERS; i += 1) capRoom.addPlayer(player(`p${i}`, `P${i}`))

test(`${GAME.MAX_PLAYERS} kişilik masa Discord limitiyle aynı`, () => {
  assert.equal(capRoom.players.size, GAME.MAX_PLAYERS)
  assert.equal(GAME.MAX_PLAYERS, 8)
})

test('dolu odaya 9. kişi izleyici düşer; koltuk isteyince tableFull', () => {
  const ninth = capRoom.join(player('p9', 'P9'))
  assert.equal(ninth.role, 'spectator')
  assert.equal(capRoom.players.size, GAME.MAX_PLAYERS)
  assert.throws(
    () => capRoom.becomePlayer(player('p9', 'P9')),
    (error: unknown) => error instanceof GameError && error.key === 'err.tableFull',
  )
})

test('doluyken addPlayer doğrudan çağrısı roomFull hatası verir (bot dahil)', () => {
  assert.throws(
    () => capRoom.addPlayer(player('p10', 'P10')),
    (error: unknown) => error instanceof GameError && error.key === 'err.roomFull',
  )
})
stop(capRoom)

// ── Soru tekrarını önleme ──────────────────────────────────────────────────
const CATEGORY = 'Markalar'
const poolIds = new Set(questionPoolIds([CATEGORY]))
assert.ok(poolIds.size > 0 && poolIds.size <= 40, `Markalar havuzu küçük (${poolIds.size})`)

test('havuz bitene kadar aynı masa tekrar sormaz (alt-havuz başına)', () => {
  // rooms.ts ile aynı döngü: resetExhaustedSubpools → sampleQuestions(exclude=seen).
  // Resimli/resimsiz alt-havuzlar bağımsız döner — tekrar ancak kendi
  // alt-havuzu tükendikten sonra yasaldır.
  const byId = new Map(sampleQuestions(poolIds.size, [CATEGORY]).map((q) => [q.id, q]))
  const seen = new Set<string>()
  const asked = new Set<string>()
  let lastIds = new Set<string>()
  const rounds = Math.ceil(poolIds.size / 10) + 2
  for (let match = 0; match < rounds; match += 1) {
    const unseenTextsAtStart = [...poolIds].filter((id) => !byId.get(id)?.image && !seen.has(id)).length
    const unseenImagesAtStart = [...poolIds].filter((id) => byId.get(id)?.image && !seen.has(id)).length
    const nextSeen = resetExhaustedSubpools([CATEGORY], null, seen, lastIds, 10)
    const picked = sampleQuestions(10, [CATEGORY], nextSeen)
    const texts = picked.filter((q) => !q.image)
    const images = picked.filter((q) => q.image)
    const freshTexts = texts.filter((q) => !asked.has(q.id)).length
    const freshImages = images.filter((q) => !asked.has(q.id)).length
    assert.ok(
      freshTexts >= Math.min(unseenTextsAtStart, texts.length),
      `maç ${match + 1}: ${freshTexts}/${texts.length} taze metin (unseen=${unseenTextsAtStart})`,
    )
    assert.ok(
      freshImages >= Math.min(unseenImagesAtStart, images.length),
      `maç ${match + 1}: ${freshImages}/${images.length} taze resim (unseen=${unseenImagesAtStart})`,
    )
    picked.forEach((q) => { seen.add(q.id); asked.add(q.id) })
    lastIds = new Set(picked.map((q) => q.id))
    if (asked.size >= poolIds.size) break
  }
  assert.equal(asked.size, poolIds.size, 'havuzun tamamı bir turda soruldu')
})
