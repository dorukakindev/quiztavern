import { GAME } from "./config";
import type { Room } from "./rooms";

export const BOT_NAMES = ["RoboKedi", "Baykuş", "Profesör", "Turbo", "Fındık", "Atom", "Kaptan", "Sincap"];

/**
 * Oyuncu-başı deterministik beceri: her botun isabet oranı id'sinden türetilir,
 * böylece aynı masadaki botlar farklı güçte oynar ve bir bot maç boyunca
 * tutarlı kalır. Ortalama ~%45 (klasik taban); modlar üstüne sabit ekler.
 */
export function botSkill(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return 0.3 + (h % 31) / 100; // 0.30–0.60
}

/**
 * Soru başladığında botların cevaplarını planlar. Cevaplar rastgele gecikmeli
 * gelir; botun becerisine göre doğruluk olasılığı skorları ilginç tutar. Soru
 * erken biterse room.answer() içindeki faz koruması geç kalan bot cevabını
 * zaten reddeder.
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
  if (room.gameMode === "word") {
    const wp = room.currentWordPrompt();
    if (!wp) return;
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const delay = botDelay(room.questionDuration());
      const roundAtSchedule = room.qIndex;
      room.scheduleBotTask(() => {
        if (room.qIndex !== roundAtSchedule || room.gameMode !== "word") return;
        const knows = Math.random() < botSkill(p.id) + 0.1;
        // Emin olmayan bot bazen önce harf alır — hem gerçekçi durur hem
        // masadaki herkese ufak bir bedava ipucu sızar.
        if (!knows && Math.random() < 0.45) {
          room.wordLetter(p.id);
          room.scheduleBotTask(
            () => {
              if (room.qIndex !== roundAtSchedule || room.gameMode !== "word") return;
              room.wordAnswer(p.id, "bilmiyorum");
            },
            700 + Math.random() * 800,
          );
        } else {
          room.wordAnswer(p.id, knows ? wp.answer : "bilmiyorum");
        }
      }, delay);
    }
    return;
  }
  if (room.gameMode === "circle") {
    const prompt = room.currentCirclePrompt();
    if (!prompt) return;
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const delay = botDelay(GAME.CIRCLE_QUESTION_MS);
      const roundAtSchedule = room.qIndex;
      room.scheduleBotTask(() => {
        if (room.qIndex !== roundAtSchedule || room.gameMode !== "circle") return;
        room.answerCircle(p.id, Math.random() < botSkill(p.id) + 0.1 ? prompt.answer : "bilmiyorum");
      }, delay);
    }
    return;
  }
  // Zil'de botlar basmayı Room.scheduleZilBots ile kendisi planlar — klasik
  // answer() zamanlayıcıları burada çalışmaz.
  if (room.gameMode === "zil") return;
  if (room.gameMode === "blitz") {
    // Kendi hızında ilerleyen akış: bot zincirleme cevaplar (~1.2–3 sn arayla),
    // becerisine göre doğru bilgiyle. Zincir pencere kapanınca doğal olarak ölür.
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const step = () => {
        if (room.phase !== "question" || Date.now() >= room.questionDeadline) return;
        const claim = (p as unknown as { blitzClaim: { truth: boolean } | null }).blitzClaim;
        if (!claim) return;
        const knows = Math.random() < botSkill(p.id) + 0.2;
        room.answer(p.id, knows ? (claim.truth ? 0 : 1) : claim.truth ? 1 : 0);
        room.scheduleBotTask(step, 1_200 + Math.random() * 1_800);
      };
      room.scheduleBotTask(step, 500 + Math.random() * 900);
    }
    return;
  }
  if (room.gameMode === "timeline") {
    // Botlar doğru sıranın çevresinde saçar: tipik 2-3 pozisyonu doğru tutturur.
    const sol = room.orderSolution();
    if (!sol) return;
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const delay = botDelay(room.questionDuration());
      const roundAtSchedule = room.qIndex;
      room.scheduleBotTask(() => {
        if (room.qIndex !== roundAtSchedule) return;
        const order = sol.slice();
        const swaps = Math.random() < 0.35 ? 2 : 1; // 1-2 çaprazlama = 0-2 yanlış pozisyon
        for (let k = 0; k < swaps; k++) {
          const a = Math.floor(Math.random() * order.length),
            b = Math.floor(Math.random() * order.length);
          [order[a], order[b]] = [order[b], order[a]];
        }
        room.orderAnswer(p.id, order);
      }, delay);
    }
    return;
  }
  // Yakın Tahmin: botlar gerçek değerin çevresinde makul saçlılımla tahmin girer.
  if (room.gameMode === "numeric") {
    const n = room.currentNumeric();
    if (!n) return;
    for (const p of room.players.values()) {
      if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
      const delay = botDelay(room.questionDuration());
      const roundAtSchedule = room.qIndex;
      room.scheduleBotTask(() => {
        if (room.qIndex !== roundAtSchedule) return;
        // %15 tam isabet, gerisi cevabın ±%5–40'ı civarında.
        const guess =
          Math.random() < 0.15
            ? n.answer
            : n.answer * (1 + (Math.random() - 0.5) * 0.8) + (Math.random() - 0.5) * Math.max(1, n.answer * 0.05);
        room.numericAnswer(p.id, Math.round(guess * 100) / 100);
      }, delay);
    }
    return;
  }
  const q = room.currentQuestion();
  if (!q) return;
  for (const p of room.players.values()) {
    if (!p.isBot || p.eligibleFrom > room.qIndex) continue;
    // Son Masa'da elenmiş bot artık cevap vermez.
    if (room.gameMode === "elim" && p.lives <= 0) continue;
    const delay = botDelay(room.questionDuration());
    const roundAtSchedule = room.qIndex;
    // Joker kartı (Klasik/Takım): elinde kart olan bot bazen cevabından hemen
    // önce oynar. Yarış durumları (kart harcanmış, hedef cevaplamış) yutulur.
    if ((room.gameMode === "classic" || room.gameMode === "team") && p.cards > 0 && Math.random() < 0.35) {
      room.scheduleBotTask(
        () => {
          if (room.qIndex !== roundAtSchedule) return;
          try {
            const roll = Math.random();
            if (roll < 0.45) {
              room.useCard(p.id, "fifty");
            } else if (roll < 0.75) {
              room.useCard(p.id, "double");
            } else if (roll < 0.9) {
              room.useCard(p.id, "shield");
            } else {
              const targets = [...room.players.values()].filter(
                (t) =>
                  t.id !== p.id &&
                  t.connected &&
                  t.eligibleFrom <= room.qIndex &&
                  t.choice === null &&
                  (room.gameMode !== "team" || t.team !== p.team),
              );
              if (targets.length === 0) {
                // Herkes cevaplamış/kopuksa dondur fırsatı boşa gitmesin:
                // kalkana düş — tur başına tek kart hakkı korunur.
                room.useCard(p.id, "shield");
              } else {
                // Rastgele değil: skor liderini dondur — rekabeti gerçekçi tutar.
                const leader = targets.reduce((a, b) => (b.score > a.score ? b : a));
                room.useCard(p.id, "freeze", leader.id);
              }
            }
          } catch {
            // Bot yarış durumunu yoksayar.
          }
        },
        Math.max(300, delay - 400),
      );
    }
    room.scheduleBotTask(() => {
      if (room.qIndex !== roundAtSchedule) return; // bayat zamanlayıcı
      // Kelime/Çember/Blitz/Zil botları +0.1/+0.2 mod ekleriyle oynuyor; klasik
      // şema (classic/team/elim/blur/duel/bet/board) çıplak beceriyle kalıyordu —
      // en çok oynanan modlarda botlar sistemli en zayıf gruptu.
      const correct = Math.random() < botSkill(p.id) + 0.05;
      let choice = q.correctIndex;
      if (!correct) {
        // %50 kullandıysa silinen şıkları seçemez.
        const removed = new Set(p.fiftyRemoved ?? []);
        const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex && !removed.has(i));
        if (wrong.length === 0) return;
        choice = wrong[Math.floor(Math.random() * wrong.length)];
      }
      room.answer(p.id, choice);
    }, delay);
  }
}
