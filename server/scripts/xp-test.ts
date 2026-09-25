import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Room } from "../src/rooms";
import {
  createXpStore,
  leagueFor,
  levelFor,
  seasonKey,
  xpForMatch,
  XP_MATCH_BASE,
  XP_PER_CORRECT,
  XP_WIN,
  type MatchFinishedEntry,
} from "../src/xp";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const player = (id: string) => ({ id, name: id, avatarUrl: null, socketId: `s-${id}`, isBot: false });
const stop = (room: Room) => (room as unknown as { clearTimer(): void }).clearTimer();
const readyAll = (room: Room) => {
  for (const id of room.players.keys()) room.setReady(id, true);
};
const entry = (over: Partial<MatchFinishedEntry> = {}): MatchFinishedEntry => ({
  userId: "u1",
  name: "u1",
  avatarUrl: null,
  correct: 0,
  total: 5,
  bestStreak: 0,
  placement: 4,
  won: false,
  ...over,
});

test("seviye eğrisi: 1→2 100, 2→3 300, 3→4 600 XP", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(levelFor(299), 2);
  assert.equal(levelFor(300), 3);
  assert.equal(levelFor(599), 3);
  assert.equal(levelFor(600), 4);
  assert.equal(levelFor(1000), 5);
  assert.equal(levelFor(-50), 1); // negatif güvenli
});

test("lig eşikleri: acemi < çırak < kalfa < usta < efsane", () => {
  assert.equal(leagueFor(0), "acemi");
  assert.equal(leagueFor(499), "acemi");
  assert.equal(leagueFor(500), "cirak");
  assert.equal(leagueFor(1999), "cirak");
  assert.equal(leagueFor(2000), "kalfa");
  assert.equal(leagueFor(6000), "usta");
  assert.equal(leagueFor(14999), "usta");
  assert.equal(leagueFor(15000), "efsane");
});

test("maç XP'si: AFK kazanamaz, kazanan bonusu ve sıralama primi", () => {
  assert.equal(xpForMatch(entry({ total: 0 })), 0); // hiç eligible tur oynamamış
  // 3 doğru, seri 3, 1. sıra, kazandı
  const won = xpForMatch(entry({ correct: 3, bestStreak: 3, placement: 1, won: true }));
  assert.equal(won, XP_MATCH_BASE + 3 * XP_PER_CORRECT + 3 * 3 + XP_WIN);
  // 2. sıra primi kazandıya eklenir
  const second = xpForMatch(entry({ correct: 3, bestStreak: 0, placement: 2, won: false }));
  assert.equal(second, XP_MATCH_BASE + 3 * XP_PER_CORRECT + 25);
  assert.equal(xpForMatch(entry({ placement: 3 })), XP_MATCH_BASE + 10);
  assert.equal(xpForMatch(entry({ placement: 5 })), XP_MATCH_BASE);
});

test("depo: recordMatch birikimli XP yazar, rozet/snapshot dolar", () => {
  const store = createXpStore(":memory:");
  const now = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
  assert.equal(store.badge("u1"), null); // hiç maç yok
  const gains = store.recordMatch([entry({ correct: 5, bestStreak: 5, placement: 1, won: true })], now);
  const g = gains.get("u1")!;
  assert.equal(g.gained, XP_MATCH_BASE + 50 + 15 + XP_WIN); // 20+50+15+50 = 135
  assert.equal(g.xp, g.gained);
  assert.equal(g.level, 2); // 135 ≥ 100 → L2
  assert.equal(g.league, "acemi");
  assert.equal(g.leveledUp, true); // L1 → L2
  store.close();
});

test("birikimli maçlar seviye/lig atlatır, seri günleri sayılır", () => {
  const store = createXpStore(":memory:");
  const day1 = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
  const day2 = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
  const day4 = new Date(Date.UTC(2026, 8, 25, 12, 0, 0)); // day3 atlanıyor
  const big = entry({ correct: 10, bestStreak: 10, placement: 1, won: true });
  const g1 = store.recordMatch([big], day1).get("u1")!;
  assert.equal(g1.leveledUp, true); // 20+100+30+50=200 → L3 olamaz (L3=300); L2'ye çıktı
  assert.equal(g1.xp, 200);
  assert.equal(g1.level, 2);
  const g2 = store.recordMatch([big], day1).get("u1")!; // aynı gün 2. maç
  assert.equal(g2.xp, 400);
  assert.equal(store.snapshot("u1", day1)!.streakDays, 1); // gün içinde seri artmaz
  store.recordMatch([big], day2);
  assert.equal(store.snapshot("u1", day2)!.streakDays, 2); // art arda gün
  store.recordMatch([big], day4);
  assert.equal(store.snapshot("u1", day4)!.streakDays, 1); // gün atlandı → sıfırlandı
  const snap = store.snapshot("u1", day4)!;
  assert.equal(snap.xp, 800);
  assert.equal(snap.league, "cirak"); // 800 >= 500
  assert.equal(snap.season, "2026-09");
  assert.equal(snap.seasonXp, 800);
  assert.equal(snap.seasonRank, 1);
  store.close();
});

test("sezon tablosu: aylık ayrı birikir, sıralama XP'ye göre", () => {
  const store = createXpStore(":memory:");
  const sep = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
  const oct = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
  store.recordMatch(
    [entry({ userId: "u1", correct: 2, placement: 1, won: true }), entry({ userId: "u2", correct: 1, placement: 2 })],
    sep,
  );
  store.recordMatch([entry({ userId: "u2", correct: 5, placement: 1, won: true })], oct);
  const sepBoard = store.seasonBoard(5, sep);
  assert.equal(sepBoard.season, "2026-09");
  assert.equal(sepBoard.entries.length, 2);
  assert.equal(sepBoard.entries[0].userId, "u1"); // 20+20+50=90 > u2'nin 20+10+25=55
  assert.equal(sepBoard.entries[0].rank, 1);
  const octBoard = store.seasonBoard(5, oct);
  assert.equal(octBoard.season, "2026-10");
  assert.equal(octBoard.entries.length, 1); // u1 ekimde oynamadı
  assert.equal(octBoard.entries[0].userId, "u2");
  const snap = store.snapshot("u1", oct)!;
  assert.equal(snap.season, "2026-10");
  assert.equal(snap.seasonXp, 0); // yeni sezonda sıfır
  assert.equal(snap.seasonRank, null);
  assert.equal(snap.xp > 0, true); // toplam XP korunur
  store.close();
});

test("oda entegrasyonu: finish() XP yazar, state rozet+kazanım+sezon taşır", () => {
  const store = createXpStore(":memory:");
  const room = new Room("r-xp", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(store);
  try {
    room.join(player("host"));
    room.join(player("p2"));
    room.addBot("BotCenk");
    readyAll(room);
    room.start("host", "classic");
    // host 2 soruyu doğru cevapladı (eligible turlar), p2 hiç oynamadı sayılsın diye total bırak.
    const host = room.players.get("host")!;
    host.stats.total = 5;
    host.stats.correct = 2;
    host.stats.bestStreak = 2;
    host.score = 500;
    const p2 = room.players.get("p2")!;
    p2.stats.total = 5;
    p2.stats.correct = 0;
    p2.score = 100;
    const bot = [...room.players.values()].find((p) => p.isBot)!;
    bot.stats.total = 5;
    bot.stats.correct = 4;
    bot.score = 999; // bot XP alamaz
    (room as unknown as { finish(): void }).finish();
    const state = room.stateFor("host", true);
    assert.equal(state.phase, "podium");
    // Sıralama: bot(999) 1., host(500) 2., p2(100) 3. — bot XP alamaz.
    const gains = state.xpGains!;
    assert.equal(
      Object.keys(gains).some((id) => id.startsWith("bot:")),
      false,
    );
    assert.equal(gains.host.gained, 20 + 2 * 10 + 2 * 3 + 25); // taban + doğru + seri + 2.lik primi
    assert.equal(gains.p2.gained, 20 + 10); // taban + 3.lük primi
    // Rozet oyuncu kartına düştü; botun rozeti yok
    const hostCard = state.players.find((p) => p.id === "host")!;
    assert.equal(hostCard.progress!.level, gains.host.level);
    const botCard = state.players.find((p) => p.isBot)!;
    assert.equal(botCard.progress, undefined);
    // Podyum satırları da ligi taşır (kozmetik çerçeve); botta alan yok.
    const hostPodium = state.podium!.find((p) => p.id === "host")!;
    assert.equal(hostPodium.league, gains.host.league);
    const botPodium = state.podium!.find((p) => p.id === bot.id)!;
    assert.equal(botPodium.league, undefined);
    // İzleyenin snapshot'ı ve sezon tablosu dolu
    assert.equal(state.progress!.xp, gains.host.xp);
    assert.equal(state.seasonBoard!.season, seasonKey());
    assert.equal(state.seasonBoard!.entries[0].userId, "host"); // 71 > p2'nin 30'u
  } finally {
    stop(room);
    store.close();
  }
});

test("takım modu: galibiyet skor sırasına değil kazanan takıma yazılır", () => {
  const store = createXpStore(":memory:");
  const room = new Room("r-team", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(store);
  try {
    room.join(player("a0"));
    room.join(player("b0"));
    readyAll(room);
    room.gameMode = "team";
    room.start("a0", "team");
    const a = room.players.get("a0")!;
    const b = room.players.get("b0")!;
    a.team = 0;
    b.team = 1;
    a.stats.total = 5;
    b.stats.total = 5;
    // b0 maç içi en yüksek bireysel skor (placement 1) ama takımı kaybetti.
    b.score = 900;
    a.score = 100;
    (room as unknown as { teamScores: [number, number] }).teamScores = [500, 400];
    (room as unknown as { finish(): void }).finish();
    const gains = room.stateFor("a0", true).xpGains!;
    // a0: takım galibi (won) + 2.lik primi → 20+50+25 = 95
    assert.equal(gains.a0.gained, 20 + XP_WIN + 25);
    // b0: placement 1 ama takımı kaybetti, won=false → yalnız taban 20
    assert.equal(gains.b0.gained, 20);
  } finally {
    stop(room);
    store.close();
  }
});

test("depo kapalıyken oda değişmez: progress/xpGains/seasonBoard null", () => {
  const room = new Room("r-off", () => {}, { minPlayers: 1, questionCount: 5 });
  try {
    room.join(player("solo"));
    readyAll(room);
    room.start("solo", "classic");
    const state = room.stateFor("solo", true);
    assert.equal(state.progress, null);
    assert.equal(state.xpGains, null);
    assert.equal(state.seasonBoard, null);
    assert.equal(state.players[0].progress, undefined);
  } finally {
    stop(room);
  }
});

test("rozetler: ilk maçta temel başarımlar açılır ve yalnızca bir kez sayılır", () => {
  const store = createXpStore(":memory:");
  try {
    // 5/5 doğru + 5 seri + 1. bitiriş → ilkMac, ilkGalibiyet, seriAvcisi, podyum, tamIsabet
    const gains = store
      .recordMatch([
        entry({
          correct: 5,
          total: 5,
          bestStreak: 5,
          placement: 1,
          won: true,
        }),
      ])
      .get("u1")!;
    assert.deepEqual(gains.newBadges, ["ilkMac", "ilkGalibiyet", "seriAvcisi", "podyum", "tamIsabet"]);
    // Aynı sonuç ikinci maçta rozet döndürmez (kayıt kalıcı, tekrar yok).
    const again = store
      .recordMatch([
        entry({
          correct: 5,
          total: 5,
          bestStreak: 5,
          placement: 1,
          won: true,
        }),
      ])
      .get("u1")!;
    assert.equal(again.newBadges, undefined);
    // Snapshot'ta BADGE_DEFS sırasında listelenir.
    assert.deepEqual(store.snapshot("u1")!.badges, ["ilkMac", "ilkGalibiyet", "seriAvcisi", "podyum", "tamIsabet"]);
  } finally {
    store.close();
  }
});

test("rozetler: kümülatif eşikler (maç sayısı + günlük seri) doğru anda açılır", () => {
  const store = createXpStore(":memory:");
  try {
    const day1 = new Date("2026-09-20T12:00:00Z");
    let last: import("../../shared/types").XpGain | undefined;
    for (let i = 0; i < 10; i++) {
      last = store.recordMatch([entry({ correct: 1, placement: 2 })], day1).get("u1");
    }
    // 10. maç onMac'i açar; ilkMac/podyum zaten 1. maçta alınmıştı → tekrar yok.
    assert.deepEqual(last!.newBadges, ["onMac"]);
    // Günlük seri: 20→21→22 üç ardışık gün, 3. günde gunluk3 (7 değil).
    store.recordMatch([entry({ correct: 1, placement: 2 })], new Date("2026-09-21T12:00:00Z"));
    const g3 = store.recordMatch([entry({ correct: 1, placement: 2 })], new Date("2026-09-22T12:00:00Z")).get("u1")!;
    assert.ok(g3.newBadges!.includes("gunluk3"));
    assert.ok(!g3.newBadges!.includes("gunluk7"));
  } finally {
    store.close();
  }
});

test("rozetler: koşul tutmayan maçta başarım yazılmaz", () => {
  const store = createXpStore(":memory:");
  try {
    // Doğrusuz, sonuncu, yenilmiş maç → yalnız ilkMac.
    const g = store.recordMatch([entry({ correct: 0, placement: 4, won: false })]).get("u1")!;
    assert.deepEqual(g.newBadges, ["ilkMac"]);
    assert.deepEqual(store.snapshot("u1")!.badges, ["ilkMac"]);
  } finally {
    store.close();
  }
});

test("unvan: yalnız kazanılmış rozet takılabilir, null kaldırır, kalıcıdır", () => {
  const store = createXpStore(":memory:");
  try {
    // Hiç kayıt yokken: unvan yok, takma reddedilir, kaldırma idempotent.
    assert.equal(store.title("u1"), null);
    assert.equal(store.setTitle("u1", "keskin"), false);
    assert.equal(store.setTitle("u1", null), true);
    // Rozet kazan → takılabilir.
    store.recordMatch([entry({ correct: 5, total: 5, bestStreak: 5, placement: 1, won: true })]);
    assert.equal(store.setTitle("u1", "tamIsabet"), true);
    assert.equal(store.title("u1"), "tamIsabet");
    // Kazanılmamış rozet reddedilir ve seçimi bozmaz.
    assert.equal(store.setTitle("u1", "ligEfsane"), false);
    assert.equal(store.title("u1"), "tamIsabet");
    // null kaldırır; tekrar kaldırmak da sorunsuz.
    assert.equal(store.setTitle("u1", null), true);
    assert.equal(store.title("u1"), null);
    assert.equal(store.setTitle("u1", null), true);
  } finally {
    store.close();
  }
});

test("unvan: odaya yayınlanır, geçersiz seçim err.title fırlatır", () => {
  const store = createXpStore(":memory:");
  const room = new Room("r-title", () => {}, { minPlayers: 1, questionCount: 5 });
  room.setProgressStore(store);
  try {
    store.recordMatch([entry({ userId: "host", correct: 5, total: 5, bestStreak: 5, placement: 1, won: true })]);
    room.join(player("host"));
    // Girişte depodaki seçim (yok) → title alanı yayında olmaz.
    assert.equal(room.stateFor("host", true).players[0].title, undefined);
    // Kazanılmış rozet takılır → publicPlayer + podyum anlığında görünür.
    room.setTitle("host", "ilkGalibiyet");
    const card = room.stateFor("host", true).players[0];
    assert.equal(card.title, "ilkGalibiyet");
    // Kazanılmamış rozet sunucu tarafında reddedilir.
    assert.throws(() => room.setTitle("host", "ligEfsane"), /err\.title/);
    assert.equal(room.stateFor("host", true).players[0].title, "ilkGalibiyet");
    // null kaldırır.
    room.setTitle("host", null);
    assert.equal(room.stateFor("host", true).players[0].title, undefined);
    // Depo kapalıyken oturumluk takma çalışır (kalıcı değildir).
    const plain = new Room("r-plain", () => {}, { minPlayers: 1 });
    try {
      plain.join(player("solo"));
      plain.setTitle("solo", "keskin");
      assert.equal(plain.stateFor("solo", true).players[0].title, "keskin");
    } finally {
      stop(plain);
    }
  } finally {
    stop(room);
    store.close();
  }
});

test("badgeProgress: hedefli rozetler n/t taşır, kazanılan ve olay rozetleri düşer", () => {
  const store = createXpStore(":memory:");
  try {
    store.recordMatch([entry({ correct: 3, total: 5, bestStreak: 3, placement: 2 })]);
    const snap = store.snapshot("u1")!;
    const byKey = new Map(snap.badgeProgress.map((p) => [p.key, p]));
    assert.equal(byKey.get("onMac")!.current, 1);
    assert.equal(byKey.get("onMac")!.target, 10);
    assert.equal(byKey.get("seriAvcisi")!.current, 3);
    assert.equal(byKey.get("seriAvcisi")!.target, 5);
    assert.equal(byKey.get("keskin")!.current, 3);
    // Olay rozetleri (tek maçta koşulanlar) hedefsizdir, listede yok.
    assert.ok(!byKey.has("podyum"));
    assert.ok(!byKey.has("tekeTek"));
    // Kazanılan hedef rozeti artık listede yok (ilkMac bu maçta alındı).
    assert.ok(!byKey.has("ilkMac"));
    // Sıralama orana göre azalan: en yakın hedef önde.
    const ratios = snap.badgeProgress.map((p) => p.current / p.target);
    assert.ok(ratios.every((r, i) => i === 0 || ratios[i - 1] >= r));
  } finally {
    store.close();
  }
});

test("backup: VACUUM INTO tutarlı kopya üretir; haftalık bakım dosyayı tutar", () => {
  const dir = mkdtempSync(join(tmpdir(), "qt-xp-backup-"));
  try {
    const store = createXpStore(join(dir, "xp.db"));
    try {
      store.recordMatch([entry({ correct: 3, total: 5, bestStreak: 2, placement: 1, won: true })]);
      const dest = join(dir, "xp-backup.db");
      store.backup(dest);
      assert.ok(existsSync(dest));
      const copy = new Database(dest, { readonly: true });
      try {
        const row = copy.prepare("SELECT user_id, xp, wins FROM players WHERE user_id = 'u1'").get() as {
          user_id: string;
          xp: number;
          wins: number;
        };
        assert.equal(row.user_id, "u1");
        assert.equal(row.wins, 1);
        assert.ok(row.xp > 0);
      } finally {
        copy.close();
      }
      // Haftalık bakım yolu: checkpoint+VACUUM sonra kopya yine tutarlı.
      store.backup(dest, true);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

console.log(`\n[xp] sonuç: ${passed} geçti, 0 kaldı`);
