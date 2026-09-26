// Tavern Panosu regresyonları (§6.1): pick fazı, seçim sırası, hücre değeri
// puanı, soru sızdırmazlık, otomatik açılım, pano bitişi.
import assert from "node:assert";
import { Room } from "../src/rooms.js";
import type { Question } from "../src/questions.js";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const user = (id: string) => ({ id, name: `P${id}`, avatarUrl: null, socketId: `s-${id}` });
type P = { score: number; stats: { total: number; correct: number }; answers: ({ correct: boolean } | null)[] };
const internals = (room: Room) =>
  room as unknown as {
    players: Map<string, P>;
    phase: string;
    qIndex: number;
    boardCells: { value: number; used: boolean; dailyDouble?: boolean; question: Question }[];
    boardCategories: string[];
    boardPickerOrder: string[];
    boardPickerPos: number;
    boardAsked: Question[];
    currentCell: number;
    pickDeadline: number;
    beginPick(): void;
    beginQuestion(): void;
    openCell(cell: number): void;
    reveal(): void;
    finish(): void;
  };

const boardRoom = (id: string, ids: string[]) => {
  const room = new Room(id, () => {}, { minPlayers: 1 });
  for (const pid of ids) room.addPlayer({ ...user(pid), isBot: false });
  room.setGameMode(ids[0], "board");
  for (const pid of ids) room.setReady(pid, true);
  return room;
};
const firstId = (room: Room) => internals(room).players.keys().next().value!;
const startPick = (room: Room) => {
  room.start(firstId(room), "board");
  const inner = internals(room);
  inner.qIndex = 0;
  inner.beginPick(); // countdown'u atla
  return inner;
};

console.log("Tavern Panosu regresyonları");

test("başlangıçta pick fazı: 5 sütun × 5 hücre, hepsi kapalı", () => {
  const room = boardRoom("b1", ["a", "b"]);
  const inner = startPick(room);
  assert.equal(inner.phase, "pick");
  const board = room.stateFor("a", false).board!;
  assert.ok(board, "payload dolu");
  assert.equal(board.categories.length, 5);
  assert.equal(board.cells.length, 25);
  assert.ok(board.cells.every((c) => !c.used));
  assert.equal(board.pickerId, "a", "ilk seçici host");
  assert.equal(board.pickerName, "Pa");
});

test("pick payload'ı soru metni/şık sızdırmaz", () => {
  const room = boardRoom("b2", ["a"]);
  startPick(room);
  const board = room.stateFor("a", false).board!;
  const keys = new Set(Object.keys(board.cells[0]));
  assert.deepEqual([...keys].sort(), ["used", "value"], "hücre yalnız değer+used taşır");
});

test("sırası olmayan oyuncu hücre açamaz; geçersiz indeks yutulur", () => {
  const room = boardRoom("b3", ["a", "b"]);
  const inner = startPick(room);
  room.pickCell("b", 0); // sıra a'da
  assert.equal(inner.phase, "pick", "başkasının seçimi yutulur");
  room.pickCell("a", -1);
  room.pickCell("a", 999);
  room.pickCell("a", 1.5);
  assert.equal(inner.phase, "pick", "geçersiz indeksler yutulur");
  assert.ok(inner.boardCells.every((c) => !c.used));
});

test("picker hücre açınca question fazı, soru o hücreninki olur", () => {
  const room = boardRoom("b4", ["a", "b"]);
  const inner = startPick(room);
  const want = inner.boardCells[7].question;
  room.pickCell("a", 7);
  assert.equal(inner.phase, "question");
  assert.equal(inner.currentCell, 7);
  assert.ok(inner.boardCells[7].used);
  const st = room.stateFor("a", false);
  assert.equal(st.board, null, "question fazında pick payload'ı yok");
  assert.equal(st.question!.prompt, want.prompt);
  assert.equal(inner.boardPickerPos, 1, "sıra b'ye geçti");
});

test("doğru cevap hücre değerini düz kazandırır (hız bonusu yok)", () => {
  const room = boardRoom("b5", ["a"]);
  const inner = startPick(room);
  // Değeri 500 olan bir hücre bul (son satır).
  const idx = inner.boardCells.findIndex((c) => c.value === 500 && !c.dailyDouble);
  assert.ok(idx >= 0);
  room.pickCell("a", idx);
  const q = inner.boardCells[idx].question;
  room.answer("a", q.correctIndex);
  assert.equal(inner.players.get("a")!.score, 500, "düz hücre değeri");
  inner.reveal();
  assert.equal(inner.phase, "reveal");
});

test("reveal sonrası kalan hücre varsa pick fazına dönülür", () => {
  const room = boardRoom("b6", ["a", "b"]);
  const inner = startPick(room);
  room.pickCell("a", 3);
  room.answer("a", 0); // yanlış olabilir, önemli değil
  inner.reveal();
  // advanceFromReveal → beginPick (timer'lar gerçek; doğrudan çağır)
  inner.phase = "reveal";
  inner.beginPick();
  assert.equal(inner.phase, "pick");
  const board = room.stateFor("b", false).board!;
  assert.equal(board.cells[3].used, true);
  assert.equal(board.pickerId, "b", "sıra ikinci oyuncuda");
});

test("pasif picker için süre dolunca sunucu en değerli hücreyi açar", () => {
  const room = boardRoom("b7", ["a"]);
  const inner = startPick(room);
  // Pasif seçici artık rastgele değil en yüksek değerli açık hücreyi yakar.
  const open = inner.boardCells.map((cell, i) => ({ ...cell, i })).filter((cell) => !cell.used);
  const top = open.reduce((a, b) => (a.value >= b.value ? a : b));
  const idle = (room as unknown as { idleBoardCell(): number | null }).idleBoardCell();
  assert.equal(idle, top.i);
  inner.openCell(idle!);
  assert.equal(inner.phase, "question");
  assert.ok(inner.boardCells[top.i].used);
});

test("tüm hücreler kullanınca maç biter (podium)", () => {
  const room = boardRoom("b8", ["a"]);
  const inner = startPick(room);
  inner.boardCells.forEach((c) => {
    c.used = true;
  });
  inner.boardAsked = inner.boardCells.map((c) => c.question);
  inner.phase = "reveal";
  inner.beginPick(); // kalan yok → finish()
  assert.equal(inner.phase, "podium");
});

test("boardAsked açılış sırasını korur; round.total hücre sayısı", () => {
  const room = boardRoom("b9", ["a"]);
  const inner = startPick(room);
  assert.equal(room.stateFor("a", false).round.total, 25);
  room.pickCell("a", 12);
  assert.equal(inner.boardAsked.length, 1);
  assert.equal(inner.boardAsked[0], inner.boardCells[12].question);
});

test("tamamen ayrılan seçici sırası kalıcı atlanır", () => {
  const room = boardRoom("b10", ["a", "b"]);
  const inner = startPick(room);
  inner.openCell(0); // a açtı, sıra b'de (pos=1)
  assert.equal(inner.boardPickerId(), "b");
  room.removePlayer("b");
  inner.phase = "reveal";
  inner.beginPick(); // b'nin slotu atlanmalı, sıra a'ya dönmeli
  assert.equal(inner.boardPickerId(), "a");
  assert.equal(inner.phase, "pick");
});

test("kopan ama masada kalan seçicinin 10 sn yeniden bağlanma penceresi korunur", () => {
  const room = boardRoom("b11", ["a", "b"]);
  const inner = startPick(room);
  inner.openCell(0);
  const pb = internals(room).players.get("b")!;
  (pb as { connected?: boolean }).connected = false;
  inner.phase = "reveal";
  inner.beginPick(); // b hâlâ players'ta — slotu korunur
  assert.equal(inner.boardPickerId(), "b");
});

test("seçici sırası eligibleFrom sıfırlandıktan sonra örneklenir", () => {
  // Maç ortasında katılan oyuncu önceki maçın bayat eligibleFrom'uyla
  // seçim sırasının dışında kalıyordu — sıra reset'ten sonra örneklenmeli.
  const room = boardRoom("b12", ["a", "b"]);
  const inner = internals(room);
  (inner.players.get("b") as { eligibleFrom?: number })!.eligibleFrom = 99; // bayat değer
  room.start(firstId(room), "board");
  assert.deepEqual(inner.boardPickerOrder.sort(), ["a", "b"]);
});

test("pick turundaki seçici ayrılınca sıra hemen ilerler (B60)", () => {
  // boardPickerOrder maç anlığına sabitlenmişti: seçici çıkınca slotu
  // PICK_MS kadar ölü bekletiyordu — artık ayrılışta sıra ilerler.
  const room = boardRoom("b13", ["a", "b", "c"]);
  const inner = startPick(room);
  assert.equal(inner.boardPickerId(), "a");
  room.removePlayer("a");
  assert.equal(inner.boardPickerId(), "b", "sıra anında b'ye geçti");
  room.pickCell("b", 3);
  assert.equal(inner.phase, "question", "yeni seçicinin hücresi açılır — ölü pencere yok");
});

test("maç ortasında katılan oyuncu pano sırasına girer (B60)", () => {
  const room = boardRoom("b14", ["a", "b"]);
  const inner = startPick(room);
  room.addPlayer({ ...user("c"), isBot: false });
  assert.ok(inner.boardPickerOrder.includes("c"), "katılan kuyruğun sonunda");
});

test("pick ortasında katılan izleyici seçici olamaz (B60)", () => {
  // Maç sırasında katılan oyuncu bu soruda izleyicidir (eligibleFrom=qIndex+1):
  // sırası gelirse istemci hücreleri kilitli gösterir — atlanmalı.
  const room = boardRoom("b15", ["a", "b"]);
  const inner = startPick(room);
  room.addPlayer({ ...user("c"), isBot: false }); // pick ortasında → izleyici
  room.removePlayer("a"); // seçici ayrıldı
  assert.equal(inner.boardPickerId(), "b", "sıra uygun oyuncuya geçer, izleyiciye değil");
});

test("önceki panoda sorulanlar 'son maç' korumasına taşınır (B58)", () => {
  // Board'da questions dizisi boş olduğu için lastQuestionIds hep boştu —
  // alt-havuz reseti önceki panonun sorularını hemen geri getirebilirdi.
  const room = boardRoom("b13", ["a"]);
  const inner = startPick(room);
  room.pickCell("a", 0);
  room.answer("a", 0);
  inner.reveal();
  const askedIds = inner.boardAsked.map((q) => q.id);
  assert.ok(askedIds.length === 1);
  // İkinci maç: sorulan hücre id'si son-maç korumasına girmeli.
  inner.finish();
  room.returnToLobby("a");
  room.start("a", "board");
  const lastIds = (room as unknown as { lastQuestionIds: Set<string> }).lastQuestionIds;
  assert.ok(lastIds.has(askedIds[0]!), "sorulan soru lastQuestionIds'te");
});

console.log(`board-test: ${passed} geçti`);
assert.equal(passed, 16);
process.exit(0);
