/**
 * Aşama 1 DoD testi — iki istemcili tam maç döngüsü + kes-bağlan senaryoları.
 * Sunucuyu boş bir loopback portunda başlatır, socket.io-client ile sürer.
 * Çalıştırma: npx tsx scripts/dod-test.ts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, type EmotePayload, type GameState, type ToastPayload } from "../../shared/types";
import { GAME } from "../src/config";
import { findFreePort } from "./test-port";

let baseUrl = "";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

interface Client {
  socket: Socket;
  state: GameState | null;
  emotes: EmotePayload[];
  toasts: ToastPayload[];
}

function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = { socket: io(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { roomId, devId, devName },
  }), state: null, emotes: [], toasts: [] };
  client.socket.on(EV.STATE, (s: GameState) => { client.state = s; });
  client.socket.on(EV.EMOTE, (e: EmotePayload) => client.emotes.push(e));
  client.socket.on(EV.TOAST, (t: ToastPayload) => client.toasts.push(t));
  return client;
}

function waitFor(client: Client, predicate: (s: GameState) => boolean, label: string, timeoutMs = 15_000): Promise<GameState> {
  return new Promise((resolve, reject) => {
    if (client.state && predicate(client.state)) return resolve(client.state);
    const timer = setTimeout(() => {
      client.socket.off(EV.STATE, handler);
      reject(new Error(`Zaman aşımı: ${label} (son faz: ${client.state?.phase})`));
    }, timeoutMs);
    const handler = (s: GameState) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      client.socket.off(EV.STATE, handler);
      resolve(s);
    };
    client.socket.on(EV.STATE, handler);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  console.log("[dod] sunucu başlatılıyor…");
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ALLOW_MOCK_AUTH: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const killServer = () => {
    if (server.pid === undefined) return;
    server.kill();
  };

  try {
    // Sunucu ayağa kalkana kadar bekle
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch { /* henüz hazır değil */ }
      await sleep(250);
      if (i === 39) throw new Error("Sunucu 10 sn içinde açılmadı.");
    }
    console.log("[dod] sunucu hazır.\n");

    // ── Senaryo 1: tam maç döngüsü (fitil: 5 soru) ──────────────────────
    console.log("Senaryo 1 — tam maç döngüsü (lightning, 5 soru)");
    const a = connect("dod-mac", "player-aaaa-0001", "Ayşe");
    const b = connect("dod-mac", "player-bbbb-0002", "Baran");
    await waitFor(a, (s) => s.players.length === 2, "iki oyuncu lobide");
    assert(a.state!.phase === "lobby", "başlangıç fazı lobby");
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "herkes hazır");
    const hostId = a.state!.hostId;
    const host = hostId === a.state!.youId ? a : b;
    // Mod masa ayarıdır ve HERKESE yayınlanır: host olmayan da aynı modu görür.
    const guest = hostId === a.state!.youId ? b : a;
    host.socket.emit(EV.SET_MODE, { mode: "lightning" });
    await waitFor(guest, (s) => s.gameMode === "lightning", "mod değişimi host olmayana da yayınlandı");
    assert(guest.state!.questionCount === 5, `mod değişince soru sayısı doğal değere döndü (${guest.state!.questionCount})`);
    assert(guest.state!.players.every((p) => !p.ready), "mod değişince hazır onayları sıfırlandı");
    guest.socket.emit(EV.SET_MODE, { mode: "circle" });
    await sleep(300);
    assert(guest.state!.gameMode === "lightning", "host olmayanın mod değişikliği reddedildi");
    assert(guest.toasts.some((t) => t.key === "err.modeHostOnly"), "ret anahtarla bildirildi");
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "mod sonrası herkes yeniden hazır");
    // Soru sayısı masa ayarıdır (5/10/15); testi kısa tutmak için 5 zaten seçili.
    assert(a.state!.questionCount === 5, "questionCount durum paketinde");
    // Ayar değişince herkesin hazır durumu sıfırlanır — tekrar onayla.
    a.socket.emit(EV.READY, true);
    b.socket.emit(EV.READY, true);
    await waitFor(a, (s) => s.players.every((p) => p.ready), "ayar sonrası herkes yeniden hazır");
    // START içindeki çelişkili istemci beyanı paylaşılan masa modunu atlayamamalı.
    host.socket.emit(EV.START, { mode: "classic" });
    await waitFor(a, (s) => s.phase === "countdown", "countdown başladı");
    assert(a.state!.gameMode === "lightning", "START payload'ı yetkili masa modunu değiştirmedi");
    assert(a.state!.countdown !== null && a.state!.countdown.durationMs === 3000, "countdown payload'ı dolu");
    let scoringProven = false;

    for (let round = 0; round < 5; round++) {
      const q = await waitFor(a, (s) => s.phase === "question" && s.round.index === round, `soru ${round + 1} açıldı`, 20_000);
      assert(q.question !== null && q.question.choices.length === 4, `soru ${round + 1} payload'ı geçerli`);
      a.socket.emit(EV.ANSWER, 0);
      b.socket.emit(EV.ANSWER, 1);
      const reveal = await waitFor(a, (s) => s.phase === "reveal" && s.round.index === round, `reveal ${round + 1}`, 12_000);
      assert(reveal.reveal !== null, `reveal ${round + 1} payload'ı var`);
      // Sabiti tekrar yazma: config tek kaynak. 3500'ü elle yazdığımız için
      // REVEAL_MS 3000'e çekilince test "yanlış" diye patlamıştı.
      assert(reveal.reveal!.durationMs === GAME.REVEAL_MS, `reveal ${round + 1} durationMs=${GAME.REVEAL_MS}`);
      const pickTotal = reveal.reveal!.picks.flat().length;
      assert(pickTotal === 2, `reveal ${round + 1} iki oyuncunun seçimini taşıyor`);
      // Puanlama değişmezi: doğru şıkkı seçen puan alır, seçmeyen almaz.
      const { correctIndex, picks, gains } = reveal.reveal!;
      const winners = picks[correctIndex];
      const scoredRight = winners.every((id) => (gains[id] ?? 0) > 0);
      const losersZero = Object.entries(gains).every(([id, gain]) => winners.includes(id) || gain === 0);
      assert(scoredRight && losersZero, `reveal ${round + 1} puanlama tutarlı (${winners.length} doğru, kazanç: ${JSON.stringify(gains)})`);
      if (winners.length) scoringProven = true;
    }
    console.log(`  · bu maçta doğru cevap ${scoringProven ? "çıktı" : "çıkmadı"} (iki istemci 4 şıkkın 2'sini deniyor)`);
    await waitFor(a, (s) => s.phase === "podium", "podium", 12_000);
    assert(a.state!.podium !== null && a.state!.podium.length === 2, "podyumda iki oyuncu");
    console.log("");

    // ── Senaryo 2: maç ortası kopma + grace içinde dönüş ────────────────
    console.log("Senaryo 2 — maç ortası kopma, grace içinde dönüş");
    // Regresyon: kopan oyuncunun ready'si sıfırlanıyor, podyumda hazır düğmesi
    // olmadığı için "tekrar oyna" bir daha çalışmıyordu. Podyumdan başlatma
    // masa sahibinin kararıdır; hazır kapısı yalnızca lobide geçerlidir.
    b.socket.disconnect();
    await sleep(500);
    const bRejoin = connect("dod-mac", "player-bbbb-0002", "Baran");
    await waitFor(bRejoin, (s) => s.phase === "podium", "B podyuma geri döndü");
    assert(!bRejoin.state!.players.find((p) => p.id === bRejoin.state!.youId)!.ready, "dönen oyuncunun ready'si sıfır (kurulum)");
    const hostAfter = bRejoin.state!.hostId === bRejoin.state!.youId ? bRejoin : a;
    hostAfter.socket.emit(EV.PLAY_AGAIN);
    await waitFor(a, (s) => s.phase === "countdown" || s.phase === "question", "hazır olmayan oyuncuya rağmen tekrar oyna çalıştı", 8_000);
    assert(true, "podyumdan 'tekrar oyna' reconnect sonrası kilitlenmiyor");

    // Yeni başlayan bu maçın üstünden grace senaryosunu sürelim.
    await waitFor(a, (s) => s.phase === "question", "yeni maçın ilk sorusu", 25_000);
    const bScoreBefore = a.state!.players.find((p) => p.id === bRejoin.state!.youId)!.score;
    const bSeatBefore = a.state!.players.find((p) => p.id === bRejoin.state!.youId)!.seat;
    bRejoin.socket.disconnect();
    await waitFor(a, (s) => s.players.some((p) => !p.connected), "A, B'nin koptuğunu görüyor");
    assert(a.state!.players.length === 2, "grace: B masadan silinmedi");
    const b2 = connect("dod-mac", "player-bbbb-0002", "Baran");
    await waitFor(b2, (s) => s.phase === "question" || s.phase === "reveal", "B yeniden bağlandı, maç durumunu aldı");
    await waitFor(a, (s) => s.players.every((p) => p.connected), "A, B'nin döndüğünü görüyor");
    const bAfter = a.state!.players.find((p) => p.id === b2.state!.youId)!;
    assert(bAfter.score === bScoreBefore, "B'nin skoru korundu");
    assert(bAfter.seat === bSeatBefore, "B'nin koltuğu korundu");
    // Reconnect reveal anına denk geldiyse kritik cevap senaryosunu atlama;
    // bir sonraki oynanabilir soruyu bekleyip iki istemciyle gerçekten cevapla.
    const playable = await waitFor(a, (s) => s.phase === "question", "reconnect sonrası oynanabilir soru", 25_000);
    await waitFor(b2, (s) => s.phase === "question" && s.round.index === playable.round.index, "B aynı oynanabilir soruyu gördü", 5_000);
    const currentRound = playable.round.index;
    a.socket.emit(EV.ANSWER, 0);
    b2.socket.emit(EV.ANSWER, 0);
    await waitFor(a, (s) => s.phase === "reveal" && s.round.index === currentRound, "reconnect sonrası tur ilerledi", 12_000);
    assert(true, "B reconnect sonrası cevap verebildi");
    a.socket.emit(EV.LEAVE_GAME);
    b2.socket.emit(EV.LEAVE_GAME);
    await sleep(400);
    console.log("");

    // ── Senaryo 3: aynı kullanıcı yeni socket → eski düşer ──────────────
    console.log("Senaryo 3 — aynı kullanıcının yeni bağlantısı eskisini düşürür");
    const c = connect("dod-takeover", "player-cccc-0003", "Ceren");
    const d = connect("dod-takeover", "player-dddd-0004", "Deniz");
    await waitFor(c, (s) => s.players.length === 2, "iki oyuncu masada");
    const cOldDisconnected = new Promise<void>((resolve) => c.socket.once("disconnect", () => resolve()));
    const c2 = connect("dod-takeover", "player-cccc-0003", "Ceren");
    await cOldDisconnected;
    assert(true, "eski C socket'i sunucu tarafından düşürüldü");
    await waitFor(c2, (s) => s.players.length === 2, "yeni C bağlandı");
    await sleep(400); // eski socket'in geç disconnect'i yeni bağlantıyı bozmamalı
    assert(d.state!.players.length === 2, "oyuncu çiftlenmedi, masada hâlâ 2 kişi");
    assert(d.state!.players.every((p) => p.connected), "geç disconnect yeni bağlantıyı düşürmedi");
    console.log("");

    // ── Senaryo 4: lobide kopma = anında silinme + koltuk geri kullanımı ─
    console.log("Senaryo 4 — lobide kopan anında silinir, koltuğu yeni gelene açılır");
    d.socket.disconnect();
    await waitFor(c2, (s) => s.players.length === 1, "D lobiden anında silindi");
    const e = connect("dod-takeover", "player-eeee-0005", "Efe");
    await waitFor(c2, (s) => s.players.length === 2, "E masaya katıldı");
    const eSeat = c2.state!.players.find((p) => p.name === "Efe")!.seat;
    assert(eSeat === 1, `E, D'nin boşalttığı 1 numaralı koltuğu aldı (seat=${eSeat})`);
    console.log("");

    // ── Senaryo 4b: bot, kısa turda (Fitil, 8 sn) süresinde cevaplıyor ──
    // Regresyon: bot gecikmesi sabit 15 sn'ye göre hesaplanınca botlar
    // Fitil turlarını tamamen kaçırıyor, maç 0-0 bitiyordu.
    console.log("Senaryo 4b — bot Fitil turlarını kaçırmıyor");
    const f = connect("dod-bot", "player-ffff-0006", "Figen");
    await waitFor(f, (s) => s.players.length >= 1, "F masada");
    f.socket.emit(EV.ADD_BOT);
    await waitFor(f, (s) => s.players.some((p) => p.isBot), "bot masaya eklendi");
    f.socket.emit(EV.SET_QUESTION_COUNT, { count: 5 });
    await waitFor(f, (s) => s.questionCount === 5, "bot maçı 5 soruya ayarlandı");
    f.socket.emit(EV.READY, true);
    await waitFor(f, (s) => s.players.every((p) => p.ready), "masa hazır");
    f.socket.emit(EV.START, { mode: "lightning" });
    let botAnsweredRounds = 0;
    for (let round = 0; round < 5; round++) {
      await waitFor(f, (s) => s.phase === "question" && s.round.index === round, `bot turu ${round + 1}`, 20_000);
      f.socket.emit(EV.ANSWER, round % 4);
      const rev = await waitFor(f, (s) => s.phase === "reveal" && s.round.index === round, `bot reveal ${round + 1}`, 12_000);
      const bot = rev.players.find((p) => p.isBot)!;
      if (rev.reveal!.picks.flat().includes(bot.id)) botAnsweredRounds += 1;
    }
    assert(botAnsweredRounds === 5, `bot 5 Fitil turunun tamamında cevap verdi (${botAnsweredRounds}/5)`);
    await waitFor(f, (s) => s.phase === "podium", "bot maçı bitti", 12_000);
    const botScore = f.state!.podium!.find((p) => p.name !== "Figen")?.score ?? 0;
    assert(botScore >= 0, `bot maçı puanla bitirdi (${botScore})`);

    // Regresyon: tek insan koparsa sahiplik bota geçiyordu; insan dönünce
    // maçı bir daha başlatamıyordu ("Maçı yalnızca oda sahibi başlatabilir").
    const humanId = f.state!.youId;
    assert(f.state!.hostId === humanId, "masa sahibi insan");
    f.socket.disconnect();
    await sleep(600);
    const f2 = connect("dod-bot", "player-ffff-0006", "Figen");
    await waitFor(f2, (s) => s.players.length >= 2, "F geri döndü");
    assert(f2.state!.hostId === humanId, `dönen insan sahipliği geri aldı, bota geçmedi (host: ${f2.state!.hostId})`);
    assert(!f2.state!.players.find((p) => p.id === f2.state!.hostId)?.isBot, "masa sahibi bot değil");
    f2.socket.emit(EV.LEAVE_GAME);
    await sleep(400);
    console.log("");

    // ── Senaryo 5: emote, kick, transfer-host ───────────────────────────
    console.log("Senaryo 5 — emote yayını, sahiplik devri, kick");
    c2.socket.emit(EV.EMOTE, { emote: "flame" });
    c2.socket.emit(EV.EMOTE, { emote: "star" }); // hız sınırına takılmalı
    c2.socket.emit(EV.EMOTE, { emote: "kalpazan" }); // geçersiz anahtar
    await sleep(400);
    assert(e.emotes.length === 1 && e.emotes[0].emote === "flame", "emote yayınlandı; spam ve geçersiz anahtar elendi");
    e.socket.emit(EV.TRANSFER_HOST, { targetId: c2.state!.youId }); // host değil → hata
    await sleep(300);
    assert(e.toasts.some((t) => t.key === "err.transferHostOnly"), "host olmayanın devri reddedildi (anahtar geldi, düz metin değil)");
    const cId = c2.state!.youId;
    const eId = e.state!.youId;
    c2.socket.emit(EV.TRANSFER_HOST, { targetId: eId });
    await waitFor(e, (s) => s.hostId === eId, "sahiplik E'ye devredildi");
    const cKicked = new Promise<void>((resolve) => c2.socket.once("disconnect", () => resolve()));
    e.socket.emit(EV.KICK, { targetId: cId });
    await cKicked;
    assert(c2.toasts.some((t) => t.key === "info.kicked"), "atılan oyuncu anahtarla bilgilendirildi");
    await waitFor(e, (s) => s.players.length === 1, "C masadan atıldı");
    // Kick ban: atılan tek tıkla geri dönemez — yoksa kick boş bir jest olur.
    const c3 = connect("dod-takeover", "player-cccc-0003", "Ceren");
    await sleep(800);
    assert(e.state!.players.length === 1, "atılan oyuncu yeniden giremedi (5 dk ban)");
    assert(c3.toasts.some((t) => t.key === "err.kicked"), "yasak anahtarla bildirildi");
    c3.socket.disconnect();
    e.socket.emit(EV.LEAVE_GAME);
    await sleep(300);

    for (const cl of [a, b, c, d, c2, e]) cl.socket.disconnect();
  } finally {
    killServer();
  }

  console.log(`\n[dod] sonuç: ${passed} geçti, ${failed} kaldı`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n[dod] HATA: ${err.message}`);
  process.exit(1);
});
