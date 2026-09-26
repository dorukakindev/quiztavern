import type { GameMode, PublicPlayer } from "../../../shared/types";

export type BetOptionKey = "min" | "quarter" | "half" | "all";
export type BetOptionSpec = { key: BetOptionKey; amount: number };

/** Sunucudaki GAME.BET_MIN_STAKE_PCT ile aynı: bakiyesi olan oyuncu en az bu
 *  oranda yatırır — "pas" çipi yok, kumar modunda risksiz tur yok. */
export const BET_MIN_STAKE_PCT = 0.1;

/** Distinct wager buttons: minimum stake, fractions, and a meaningful All-in. */
export function betOptionSpecs(bankroll: number): BetOptionSpec[] {
  const safe = Math.max(0, Math.round(bankroll));
  if (safe === 0) return [{ key: "min", amount: 0 }];
  const raw: BetOptionSpec[] = [
    { key: "min", amount: Math.ceil(safe * BET_MIN_STAKE_PCT) },
    { key: "quarter", amount: Math.round(safe * 0.25) },
    { key: "half", amount: Math.round(safe * 0.5) },
    { key: "all", amount: safe },
  ];
  // Aynı tutarı gösteren iki düğme olmasın — öncelik all > half > quarter > min.
  // Eski filtre yalnız SONRAKİ adaylara bakıyordu: bakiye 3'te min≡quarter,
  // bakiye 1'de min≡all aynı tutarla yan yana çıkıyordu.
  const seen = new Set<number>();
  const kept: BetOptionSpec[] = [];
  for (const option of [...raw].reverse()) {
    if (option.amount <= 0 || seen.has(option.amount)) continue;
    seen.add(option.amount);
    kept.push(option);
  }
  return kept.reverse();
}

export function shortcutIndex(key: string, optionCount: number): number | null {
  // A-D harfleri VE 1-4 rakamları aynı şıkka eşlenir (masaüstü hızı için).
  // Tek karakter şartı: "ABCD".indexOf("") === 0 — boş/IME anahtarı A'yı seçiyordu.
  if (key.length !== 1) return null;
  const index = "ABCD".indexOf(key.toUpperCase());
  const digit = "1234".indexOf(key);
  const resolved = index >= 0 ? index : digit;
  return resolved >= 0 && resolved < optionCount ? resolved : null;
}

/** Kısayol dinleyicileri için ortak filtre: Ctrl+C / Cmd+1 / basılı tutma
 *  (auto-repeat) cevap kilitlememeli. */
export function isPlainShortcut(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing">,
): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !event.isComposing;
}

export function questionIsLocked(input: {
  selected: number | null;
  revealing: boolean;
  spectator: boolean;
  waiting: boolean;
  /** Süre sunucu saatine göre doldu — sunucu artık yutar, butonlar kilitlensin. */
  expired?: boolean;
}): boolean {
  return input.selected !== null || input.revealing || input.spectator || input.waiting || !!input.expired;
}

export function circleAnswerIsLocked(input: {
  answered: boolean;
  revealing: boolean;
  spectator: boolean;
  waiting: boolean;
  expired?: boolean;
}): boolean {
  return input.answered || input.revealing || input.spectator || input.waiting || !!input.expired;
}

export function circleInputShouldFocus(input: { hasPrompt: boolean; locked: boolean }): boolean {
  return input.hasPrompt && !input.locked;
}

/** Son Masa "ani ölüm": masada canlı iki kişi kaldı VE bu gerçekten bir daralma.
 *  Başta ikiden fazla oyuncu varsa masa ikiye inmiştir; baştan iki kişilikse
 *  ancak ikisinin de tek canı kaldığında ani ölümdür (yoksa 1. sorudan yanardı).
 *  Maç ortası gelen izleyici/bekleyen (lives tanımsız) başlangıç sayısına girmez. */
export function isSuddenDeath(players: Pick<PublicPlayer, "lives" | "waiting">[]): boolean {
  const starters = players.filter((player) => player.lives !== undefined && !player.waiting);
  const alive = starters.filter((player) => (player.lives ?? 0) > 0);
  if (alive.length !== 2) return false;
  return starters.length > 2 || alive.every((player) => player.lives === 1);
}

export function bothTeamsPresent(mode: GameMode, players: Pick<PublicPlayer, "connected" | "team">[]): boolean {
  if (mode !== "team") return true;
  const connected = players.filter((player) => player.connected);
  return connected.some((player) => player.team === 0) && connected.some((player) => player.team === 1);
}

export function nextMenuIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return (current <= 0 ? count : current) - 1;
  return null;
}
