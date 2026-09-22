import { GAME } from "./config";
import type { Room } from "./rooms";

export const BOT_NAMES = [
  "RoboKedi",
  "Baykuş",
  "Profesör",
  "Turbo",
  "Fındık",
  "Atom",
  "Kaptan",
  "Sincap",
];

/**
 * Soru başladığında botların cevaplarını planlar. Cevaplar rastgele gecikmeli
 * gelir; %45 doğru olasılığı skorları ilginç tutar. Soru erken biterse
 * room.answer() içindeki faz koruması geç kalan bot cevabını zaten reddeder.
 */
/**
 * Cevap gecikmesini modun GERÇEK süresine göre üretir: son %20'lik dilime hiç
 * girmez, böylece bot süre dolmadan cevaplar. (Sabit 15 sn varsayımı, 8 saniyelik
 * Fitil turlarında botların soruyu tamamen kaçırmasına yol açıyordu.)
 */
function botDelay(durationMs: number): number {
  const earliest = Math.min(1500, durationMs * 0.2);
  const latest = durationMs * 0.8;
  return earliest + Math.random() * Math.max(0, latest - earliest);
}

export function scheduleBotAnswers(room: Room): void {
  if (room.gameMode === "circle") {
    const prompt = room.currentCirclePrompt();
    if (!prompt) return;
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const delay = botDelay(GAME.CIRCLE_QUESTION_MS);
      const roundAtSchedule = room.qIndex;
      room.scheduleBotTask(() => {
        if (room.qIndex !== roundAtSchedule || room.gameMode !== "circle") return;
        room.answerCircle(p.id, Math.random() < 0.55 ? prompt.answer : "bilmiyorum");
      }, delay);
    }
    return;
  }
  const q = room.currentQuestion();
  if (!q) return;
  for (const p of room.players.values()) {
    if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
    const delay = botDelay(room.questionDuration());
    const roundAtSchedule = room.qIndex;
    room.scheduleBotTask(() => {
      if (room.qIndex !== roundAtSchedule) return; // bayat zamanlayıcı
      const correct = Math.random() < 0.45;
      let choice = q.correctIndex;
      if (!correct) {
        const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex);
        choice = wrong[Math.floor(Math.random() * wrong.length)];
      }
      room.answer(p.id, choice);
    }, delay);
  }
}
