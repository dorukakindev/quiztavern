/**
 * FAZ 4.4 — özel soru paketi testi. Üç katman:
 *  1) Birim: JSON/CSV ayrıştırma + Faz 1.4 doğrulama kuralları.
 *  2) HTTP: POST/GET /api/question-packs uçları (mock modda açık).
 *  3) Socket: host SET_PACK → state.pack, start() soruları paketten çeker,
 *     Çember paketi yok sayar, yetkisiz/bilinmeyen paket reddedilir.
 * Çalıştırma: npx tsx scripts/packs-test.ts
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io, type Socket } from "socket.io-client";
import { EV, type GameState, type ToastPayload } from "../../shared/types";
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
  toasts: ToastPayload[];
}

function connect(roomId: string, devId: string, devName: string): Client {
  const client: Client = {
    socket: io(baseUrl, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { roomId, devId, devName },
    }),
    state: null,
    toasts: [],
  };
  client.socket.on(EV.STATE, (s: GameState) => {
    client.state = s;
  });
  client.socket.on(EV.TOAST, (t: ToastPayload) => client.toasts.push(t));
  return client;
}

function waitFor(
  client: Client,
  predicate: (s: GameState) => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<GameState> {
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

// ── Birim katmanı ──────────────────────────────────────────────────────────
async function unitTests() {
  const { parseCsvQuestions, parseJsonQuestions, validatePackQuestions, samplePackQuestions } =
    await import("../src/packs");

  console.log("Birim — ayrıştırma + doğrulama");
  const csv =
    "text,category,difficulty,c1,c2,c3,c4,correctIndex\nTürkiye'nin başkenti?,Coğrafya,kolay,Ankara,İzmir,Bursa,Adana,0\nHangisi bir meyvedir?,Genel,orta,Elma,Ütü,Vapur,Duvar,0";
  const fromCsv = parseCsvQuestions(csv);
  assert(fromCsv.length === 2, "CSV: 2 soru ayrıştı");
  assert(fromCsv[0].choicesEn[0] === "Ankara", "CSV: boş EN şıkları TR'den kopyalandı");
  assert(fromCsv[0].difficulty === "kolay", "CSV: difficulty alındı");

  const fromJson = parseJsonQuestions([
    { text: "Test sorusu?", category: "Genel", choices: ["A", "B", "C", "D"], correctIndex: 1, difficulty: "zor" },
  ]);
  assert(fromJson[0].id === "q-1", "JSON: eksik id üretildi");
  assert(fromJson[0].choicesEn.length === 4, "JSON: eksik EN şıkları TR'den kopyalandı");

  const bad = parseJsonQuestions([
    {
      id: "a",
      text: "Soru?",
      category: "Genel",
      choices: ["A", "B", "C", "D"],
      choicesEn: ["A", "B", "C", "D"],
      correctIndex: 7,
      difficulty: "kolay",
    },
    {
      id: "a",
      text: "Soru?",
      category: "Genel",
      choices: ["A", "B", "C", "D"],
      choicesEn: ["A", "B", "C", "D"],
      correctIndex: 0,
      difficulty: "kolay",
    },
  ]);
  const { errors } = validatePackQuestions(bad);
  assert(
    errors.some((e) => e.includes("correctIndex")),
    "doğrulama: correctIndex>3 hata",
  );
  assert(
    errors.some((e) => e.includes("tekrar")),
    "doğrulama: tekrar eden id hata",
  );
  assert(validatePackQuestions(fromCsv).errors.length === 0, "doğrulama: temiz CSV hatasız geçti");
  assert(validatePackQuestions([]).errors.length > 0, "doğrulama: boş paket hata");

  const sampled = samplePackQuestions(3, fromCsv, new Set());
  assert(sampled.length === 2, "örnekleme: paket 2 soruysa 2 döner (azsa eksik bırakmaz)");
  const seen = new Set(fromCsv.map((q) => q.id));
  const resampled = samplePackQuestions(2, fromCsv, seen);
  assert(resampled.length === 2, "örnekleme: hepsi görülmüşse yine de doldurur");

  // Şık karıştırma: doğru metin korunur ve pozisyon çekilişten çekilişe değişir.
  const mono = Array.from({ length: 4 }, (_, i) => ({
    id: `mono-${i}`,
    text: `Mono soru ${i}?`,
    textEn: `Mono q ${i}?`,
    category: "K",
    difficulty: "kolay" as const,
    choices: ["doğru", "y1", "y2", "y3"],
    choicesEn: ["right", "w1", "w2", "w3"],
    correctIndex: 0,
  }));
  const idxSet = new Set<number>();
  for (let r = 0; r < 8; r++)
    samplePackQuestions(4, mono, new Set()).forEach((q) => {
      assert(q.choices[q.correctIndex] === "doğru", "şık karıştırma: doğru metin korunur");
      idxSet.add(q.correctIndex);
    });
  assert(idxSet.size > 1, "şık karıştırma: doğru hep aynı pozisyonda kalmaz");
}

// ── HTTP + socket katmanı ──────────────────────────────────────────────────
async function main() {
  await unitTests();

  // Önceki koşudan kalan test paketlerini temizle — slug id çakışmasın.
  const { rmSync, readdirSync } = await import("node:fs");
  const packsDir = fileURLToPath(new URL("../src/../data/packs", import.meta.url));
  try {
    for (const file of readdirSync(packsDir))
      if (file.startsWith("test-paketi") || file.startsWith("editor-paketi"))
        rmSync(`${packsDir}/${file}`, { force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* dizin henüz yok */
  }

  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  console.log("\n[packs] sunucu başlatılıyor…");
  const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ALLOW_MOCK_AUTH: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  try {
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch {
        /* henüz hazır değil */
      }
      await sleep(250);
      if (i === 39) throw new Error("Sunucu 10 sn içinde açılmadı.");
    }

    // HTTP: geçersiz paket 422, geçerli paket 201 + listede görünür.
    console.log("\nHTTP — yükleme uçları");
    const badRes = await fetch(`${baseUrl}/api/question-packs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "bozuk",
        format: "json",
        content: [
          {
            id: "x",
            text: "s?",
            category: "Genel",
            choices: ["A", "B"],
            choicesEn: ["A", "B"],
            correctIndex: 9,
            difficulty: "kolay",
          },
        ],
      }),
    });
    assert(badRes.status === 422, "bozuk paket 422 döndü");
    const badBody = (await badRes.json()) as { errors?: string[] };
    assert(Array.isArray(badBody.errors) && badBody.errors.length > 0, "422 gövdesi hata listesi taşıyor");

    const packQuestions = Array.from({ length: 6 }, (_, i) => ({
      id: `tp-${i}`,
      category: "TestKategori",
      text: `Test paketi sorusu ${i + 1}?`,
      textEn: `Test pack question ${i + 1}?`,
      choices: [`Doğru ${i}`, `Yanlış A${i}`, `Yanlış B${i}`, `Yanlış C${i}`],
      choicesEn: [`Right ${i}`, `Wrong A${i}`, `Wrong B${i}`, `Wrong C${i}`],
      correctIndex: 0,
      difficulty: "kolay",
    }));
    const okRes = await fetch(`${baseUrl}/api/question-packs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Paketi", format: "json", content: packQuestions }),
    });
    assert(okRes.status === 201, "geçerli paket 201 döndü");
    const okBody = (await okRes.json()) as { pack?: { id: string; count: number } };
    const packId = okBody.pack?.id ?? "";
    assert(packId === "test-paketi" || /^test-paketi-\d+$/.test(packId), `paket slug id üretildi (${packId})`);

    const listRes = await fetch(`${baseUrl}/api/question-packs`);
    const listBody = (await listRes.json()) as { packs: { id: string; count: number }[] };
    assert(
      listBody.packs.some((p) => p.id === packId && p.count === 6),
      "GET listesi paketi gösteriyor",
    );

    // ── Editör CRUD'u: sahiplik x-dev-id ile, tam içerik yalnız sahibe ──────
    console.log("\nHTTP — editör CRUD + sahiplik");
    const editorAuth = { "content-type": "application/json", "x-dev-id": "editor-user-001" };
    const ownedRes = await fetch(`${baseUrl}/api/question-packs`, {
      method: "POST",
      headers: editorAuth,
      body: JSON.stringify({ name: "Editör Paketi", format: "json", content: packQuestions }),
    });
    assert(ownedRes.status === 201, "oturumlu (dev-id) yükleme 201 döndü");
    const ownedId = ((await ownedRes.json()) as { pack?: { id: string } }).pack?.id ?? "";
    assert(!!ownedId, `editör paketi id üretildi (${ownedId})`);

    const anonGet = await fetch(`${baseUrl}/api/question-packs/${ownedId}`);
    assert(anonGet.status === 403, "kimliksiz GET /:id reddedildi (403)");
    const strangerGet = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      headers: { "x-dev-id": "baska-kullanici" },
    });
    assert(strangerGet.status === 403, "başkasının paketi GET /:id reddedildi (403)");
    const ownerGet = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      headers: { "x-dev-id": "editor-user-001" },
    });
    assert(ownerGet.status === 200, "sahip GET /:id 200 döndü");
    const ownerBody = (await ownerGet.json()) as { pack?: { questions?: { correctIndex: number }[] } };
    assert(ownerBody.pack?.questions?.[0]?.correctIndex === 0, "sahip tam içeriği (correctIndex) aldı");

    const strangerPut = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-dev-id": "baska-kullanici" },
      body: JSON.stringify({ name: "Çalıntı", format: "json", content: packQuestions }),
    });
    assert(strangerPut.status === 403, "başkasının paketi PUT reddedildi (403)");
    const ownerPut = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      method: "PUT",
      headers: editorAuth,
      body: JSON.stringify({ name: "Editör Paketi v2", format: "json", content: packQuestions.slice(0, 3) }),
    });
    assert(ownerPut.status === 200, "sahip PUT 200 döndü");
    const putBody = (await ownerPut.json()) as { pack?: { name: string; count: number } };
    assert(
      putBody.pack?.name === "Editör Paketi v2" && putBody.pack?.count === 3,
      "PUT adı ve soru sayısını güncelledi",
    );
    const badPut = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      method: "PUT",
      headers: editorAuth,
      body: JSON.stringify({
        name: "Bozuk",
        format: "json",
        content: [{ id: "x", text: "s?", category: "G", choices: ["A", "B"], correctIndex: 9, difficulty: "kolay" }],
      }),
    });
    assert(badPut.status === 422, "bozuk PUT gövdesi 422 döndü");

    const strangerDel = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      method: "DELETE",
      headers: { "x-dev-id": "baska-kullanici" },
    });
    assert(strangerDel.status === 403, "başkasının paketi DELETE reddedildi (403)");
    const ownerDel = await fetch(`${baseUrl}/api/question-packs/${ownedId}`, {
      method: "DELETE",
      headers: { "x-dev-id": "editor-user-001" },
    });
    assert(ownerDel.status === 204, "sahip DELETE 204 döndü");
    const afterDel = await fetch(`${baseUrl}/api/question-packs`);
    const afterDelBody = (await afterDel.json()) as { packs: { id: string }[] };
    assert(!afterDelBody.packs.some((p) => p.id === ownedId), "silinen paket listede yok");

    // Socket: host paketi seçer → state.pack; start soruları paketten çeker.
    console.log("\nSocket — masa ayarı + maçta paket havuzu");
    const host = connect("pack-room", "pack-host-00001", "Host");
    await waitFor(host, (s) => s.hostId === "dev:pack-host-00001" && s.players.length === 1, "host masada");
    const guest = connect("pack-room", "pack-guest-0002", "Misafir");
    await waitFor(host, (s) => s.players.length === 2, "iki oyuncu lobide");

    guest.socket.emit(EV.SET_PACK, { packId });
    await sleep(400);
    assert(
      guest.toasts.some((t) => t.key === "err.packHostOnly") || host.toasts.some((t) => t.key === "err.packHostOnly"),
      "host olmayan SET_PACK reddedildi",
    );

    host.socket.emit(EV.SET_PACK, { packId: "olmayan-paket" });
    await sleep(400);
    assert(
      host.toasts.some((t) => t.key === "err.packUnknown"),
      "bilinmeyen paket err.packUnknown döndü",
    );

    host.socket.emit(EV.SET_PACK, { packId });
    await waitFor(host, (s) => s.pack?.id === packId, "state.pack paketi gösteriyor");
    assert(host.state!.pack!.name === "Test Paketi", "paket adı yayınlandı");
    assert(
      host.state!.players.every((p) => !p.isBot || p.ready === false),
      "paket değişince hazırlar sıfırlandı (bot hariç)",
    );

    host.socket.emit(EV.SET_QUESTION_COUNT, { count: 5 });
    await waitFor(host, (s) => s.questionCount === 5, "soru sayısı 5");
    host.socket.emit(EV.READY, true);
    guest.socket.emit(EV.READY, true);
    await waitFor(host, (s) => s.players.every((p) => p.ready || p.isBot), "herkes hazır");
    host.socket.emit(EV.START, { mode: "classic" });
    await waitFor(host, (s) => s.phase === "question", "maç soru fazında");
    assert(host.state!.question!.category === "TestKategori", "soru paketten geldi (kategori eşleşti)");
    assert(host.state!.question!.text.startsWith("Test paketi sorusu"), "soru metni paketten");

    // Tekrar oynatınca paket masa ayarı olarak korunur.
    host.socket.emit(EV.LEAVE_GAME);
    const host2 = connect("pack-room-2", "pack-host-00001", "Host");
    await waitFor(host2, (s) => s.hostId === "dev:pack-host-00001" && s.players.length === 1, "yeni odada host masada");
    const guest2 = connect("pack-room-2", "pack-guest-0002", "Misafir");
    await waitFor(host2, (s) => s.players.length === 2, "yeni oda lobide");
    host2.socket.emit(EV.SET_PACK, { packId });
    await waitFor(host2, (s) => s.pack?.id === packId, "yeni odada paket seçili");
    host2.socket.emit(EV.SET_MODE, { mode: "circle" });
    await waitFor(host2, (s) => s.gameMode === "circle", "çember modu");
    host2.socket.emit(EV.READY, true);
    guest2.socket.emit(EV.READY, true);
    await waitFor(host2, (s) => s.players.every((p) => p.ready || p.isBot), "yeni odada herkes hazır");
    host2.socket.emit(EV.START, { mode: "circle" });
    await waitFor(host2, (s) => s.phase === "question" && s.circle !== null, "çember turu başladı");
    assert(host2.state!.circle !== null, "Çember paketi yok sayıp kendi prompt havuzunu kullandı");

    host.socket.disconnect();
    guest.socket.disconnect();
    host2.socket.disconnect();
    guest2.socket.disconnect();
  } finally {
    server.kill();
  }

  console.log(`\n[packs] ${passed} başarılı, ${failed} hatalı`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("[packs] beklenmeyen hata:", error);
  process.exit(1);
});
