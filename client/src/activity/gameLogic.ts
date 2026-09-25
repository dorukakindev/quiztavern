import type { GameMode, PublicPlayer } from '../../../shared/types'

export type BetOptionKey = 'pass' | 'quarter' | 'half' | 'all'
export type BetOptionSpec = { key: BetOptionKey; amount: number }

/** Distinct wager buttons, always preserving Pass and a meaningful All-in. */
export function betOptionSpecs(bankroll: number): BetOptionSpec[] {
  const safe = Math.max(0, Math.round(bankroll))
  if (safe === 0) return [{ key: 'pass', amount: 0 }]
  const raw: BetOptionSpec[] = [
    { key: 'pass', amount: 0 },
    { key: 'quarter', amount: Math.round(safe * 0.25) },
    { key: 'half', amount: Math.round(safe * 0.5) },
    { key: 'all', amount: safe },
  ]
  return raw.filter((option, index) => {
    if (option.key === 'pass' || option.key === 'all') return true
    if (option.amount <= 0 || option.amount >= safe) return false
    // If rounded fractions collide, retain the later (larger named) fraction.
    return !raw.some((candidate, candidateIndex) => candidateIndex > index && candidate.amount === option.amount)
  })
}

export function shortcutIndex(key: string, optionCount: number): number | null {
  // A-D harfleri VE 1-4 rakamları aynı şıkka eşlenir (masaüstü hızı için).
  const index = 'ABCD'.indexOf(key.toUpperCase())
  const digit = '1234'.indexOf(key)
  const resolved = index >= 0 ? index : digit
  return resolved >= 0 && resolved < optionCount ? resolved : null
}

export function questionIsLocked(input: {
  selected: number | null
  revealing: boolean
  spectator: boolean
  waiting: boolean
  /** Süre sunucu saatine göre doldu — sunucu artık yutar, butonlar kilitlensin. */
  expired?: boolean
}): boolean {
  return input.selected !== null || input.revealing || input.spectator || input.waiting || !!input.expired
}

export function circleAnswerIsLocked(input: {
  answered: boolean
  revealing: boolean
  spectator: boolean
  waiting: boolean
  expired?: boolean
}): boolean {
  return input.answered || input.revealing || input.spectator || input.waiting || !!input.expired
}

export function circleInputShouldFocus(input: { hasPrompt: boolean; locked: boolean }): boolean {
  return input.hasPrompt && !input.locked
}

export function bothTeamsPresent(mode: GameMode, players: Pick<PublicPlayer, 'connected' | 'team'>[]): boolean {
  if (mode !== 'team') return true
  const connected = players.filter((player) => player.connected)
  return connected.some((player) => player.team === 0) && connected.some((player) => player.team === 1)
}

export function nextMenuIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count
  if (key === 'ArrowUp') return (current <= 0 ? count : current) - 1
  return null
}
