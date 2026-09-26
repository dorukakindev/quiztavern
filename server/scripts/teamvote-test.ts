import { strict as assert } from "node:assert";
import { GAME } from "../src/config";
import { Room } from "../src/rooms";

let passed = 0;
const test = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const player = (id: string, name: string) => ({ id, name, avatarUrl: null, socketId: `socket:${id}` });
const internals = (room: Room) =>
  room as unknown as {
    beginQuestion(): void;
    reveal(): void;
    players: Map<string, { choice: number | null; team: number; score: number }>;
    teamScores: [number, number];
  };

const teamRoom = (ids: string[]) => {
  const r = new Room("tv", () => {}, { minPlayers: 1, questionCount: 3 });
  ids.forEach((id, i) => r.addPlayer(player(id, `P${i}`)));
  // seat sırasıyla takımlar: 0,1,0,1... elle düzelt → a,c takım0; b,d takım1
  const inner = internals(r);
  const names = [...inner.players.keys()];
  names.forEach((id, i) => {
    inner.players.get(id)!.team = i < Math.ceil(ids.length / 2) ? 0 : 1;
  });
  for (const id of ids) r.setReady(id, true);
  r.setGameMode(ids[0], "team");
  return { r, inner };
};
const play = (r: Room, answers: Record<string, number>) => {
  const inner = internals(r);
  inner.beginQuestion();
  const q = r.currentQuestion()!;
  for (const [id, choice] of Object.entries(answers)) r.answer(id, choice);
  inner.reveal();
  return q.correctIndex;
};

console.log("Takım oylaması/kaptan regresyonları");

test("Oybirliği doğru takım cevabı +TEAM_VOTE_PTS (gain toplamı değil)", () => {
  const { r, inner } = teamRoom(["a", "b", "c", "d"]);
  const correct = play(r, { a: 0, b: 0, c: 0, d: 0 });
  // hepsi 0'a oy verdi; 0 doğruysa her takım +100
  const expected = correct === 0 ? GAME.TEAM_VOTE_PTS : 0;
  assert.equal(inner.teamScores[0], expected);
  assert.equal(inner.teamScores[1], expected);
});

test("Eşitlikte kaptan (düşük seat) seçimi takım cevabı olur", () => {
  const { r } = teamRoom(["a", "b", "c", "d"]); // inner yok — bu testte inner2 kullanılır
  // Takım0: a(seat0,kaptan) + c. Takım1: b + d.
  const inner2 = internals(r);
  inner2.beginQuestion();
  const cq = r.currentQuestion()!;
  const wrong = (cq.correctIndex + 1) % 4;
  // takım0 (a,b): kaptan 'a' doğru, 'b' yanlış → eşitlik → kaptan kazanır
  r.answer("a", cq.correctIndex);
  r.answer("b", wrong);
  // takım1 (c,d): ikisi de yanlış
  r.answer("c", wrong);
  r.answer("d", wrong);
  inner2.reveal();
  assert.equal(inner2.teamScores[0], GAME.TEAM_VOTE_PTS);
  assert.equal(inner2.teamScores[1], 0);
});

test("Eşitlikte kaptan yanılırsa takım puanı yok", () => {
  const { r, inner } = teamRoom(["a", "b", "c", "d"]);
  inner.beginQuestion();
  const cq = r.currentQuestion()!;
  const wrong = (cq.correctIndex + 1) % 4;
  r.answer("a", wrong);
  r.answer("b", cq.correctIndex);
  r.answer("c", cq.correctIndex);
  r.answer("d", cq.correctIndex);
  inner.reveal();
  assert.equal(inner.teamScores[0], 0); // kaptan 'a' yanlış → takım0 puanı yok
  assert.equal(inner.teamScores[1], GAME.TEAM_VOTE_PTS); // takım1 oybirliği
});

test("Kişisel skorlar oylamadan bağımsız işler", () => {
  const { r, inner } = teamRoom(["a", "b", "c", "d"]);
  inner.beginQuestion();
  const cq = r.currentQuestion()!;
  const wrong = (cq.correctIndex + 1) % 4;
  r.answer("a", cq.correctIndex);
  r.answer("b", wrong);
  r.answer("c", cq.correctIndex);
  r.answer("d", cq.correctIndex);
  inner.reveal();
  assert.ok(inner.players.get("a")!.score > 0);
  assert.equal(inner.players.get("b")!.score, 0);
});

test("Oy vermeyen takım puan almaz", () => {
  const { r, inner } = teamRoom(["a", "b", "c", "d"]);
  inner.beginQuestion();
  const cq = r.currentQuestion()!;
  // takım0 (a,b) cevap vermez; takım1 (c,d) oybirliği doğru
  r.answer("c", cq.correctIndex);
  r.answer("d", cq.correctIndex);
  inner.reveal();
  assert.equal(inner.teamScores[0], 0);
  assert.equal(inner.teamScores[1], GAME.TEAM_VOTE_PTS);
});

test("Kaptan rozeti stateFor'ta işaretlenir", () => {
  const { r } = teamRoom(["a", "b", "c", "d"]);
  const state = r.stateFor("a", true);
  const a = state.players.find((p) => p.id === "a")!;
  const c = state.players.find((p) => p.id === "c")!;
  assert.equal(a.captain, true); // takım0'ın en düşük seat'li üyesi
  assert.equal(state.players.find((p) => p.id === "b")!.captain, false);
  assert.equal(c.captain, true); // takım1'in en düşük seat'li üyesi
  assert.equal(state.players.find((p) => p.id === "d")!.captain, false);
});

test("Kaptan ayrılırsa yeni kaptan seat sırasına göre seçilir", () => {
  const { r, inner } = teamRoom(["a", "b", "c", "d"]);
  inner.players.get("a")!.connected = false;
  const state = r.stateFor("c", true);
  assert.equal(state.players.find((p) => p.id === "c")!.captain, true);
});

test("Klasik modda captain işaretlenmez", () => {
  const r = new Room("tv2", () => {}, { minPlayers: 1, questionCount: 3 });
  r.addPlayer(player("a", "A"));
  r.setReady("a", true);
  const state = r.stateFor("a", true);
  assert.equal(state.players[0].captain, undefined);
});

console.log(`teamvote-test: ${passed}/8 OK`);

// Odaların asılı zamanlayıcıları process'i açık tutmasın — senkron
// testler bittiğinde çık.
process.exit(0);
