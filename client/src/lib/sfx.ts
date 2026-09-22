import { storageGet, storageSet } from './storage'

/**
 * Oyun ses efektleri — Web Audio ile SENTEZLENİR, dosya yok.
 *
 * Neden dosyasız: (1) Discord Activity CSP'si yalnızca kendi proxy origin'ine
 * izin verir; harici ses barındırmak risk. (2) İndirme yükü sıfır — tonlar
 * oscillator+gain zarfıyla anında üretilir. (3) Lisans/telif derdi yok.
 *
 * AudioContext ilk çalışada kurulur ve kullanıcı etkileşiminden sonra resume
 * edilir (tarayıcı otomatik-oynatma politikası). Tercih localStorage'da; müzik
 * gibi ama SFX varsayılan AÇIK (bir quiz oyununun hissinin yarısı ses).
 */
export type SfxName = 'lock' | 'tick' | 'correct' | 'wrong' | 'reveal' | 'podium' | 'heart' | 'heart2' | 'heart3'

let ctx: AudioContext | null = null
let enabled = storageGet('qt-sfx') !== 'off'

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Tek nota: verilen frekansta, gecikmeyle, attack-decay zarfıyla çalar. */
function note(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, peak: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = c.currentTime + at
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const SOUNDS: Record<SfxName, (c: AudioContext) => void> = {
  // Kilitleme: iki hızlı yükselen blip — "onaylandı" hissi.
  lock: (c) => { note(c, 620, 0, 0.06, 'triangle', 0.16); note(c, 900, 0.045, 0.07, 'triangle', 0.14) },
  // Süre tiki: kısa, alçak — son saniyelerde gerilim.
  tick: (c) => { note(c, 1050, 0, 0.035, 'triangle', 0.1) },
  // Doğru: yükselen üçlü arpej (do-mi-sol) — ödül.
  correct: (c) => { [523, 659, 784].forEach((f, i) => note(c, f, i * 0.06, 0.15, 'triangle', 0.15)) },
  // Yanlış: alçalan mat ton.
  wrong: (c) => { note(c, 300, 0, 0.16, 'sawtooth', 0.1); note(c, 160, 0.05, 0.22, 'sine', 0.11) },
  // Reveal vuruşu: kısa alçak tok ses.
  reveal: (c) => { note(c, 150, 0, 0.28, 'sine', 0.18) },
  // Podyum fanfarı: yükselen dörtlü.
  podium: (c) => { [523, 659, 784, 1046].forEach((f, i) => note(c, f, i * 0.085, 0.32, 'triangle', 0.14)) },
  // Son 3 saniye kalp atışı: tick'in üstüne katmanlanır, 3->2->1 giderek ağırlaşır/güçlenir.
  heart: (c) => { note(c, 90, 0, 0.09, 'sine', 0.13) },
  heart2: (c) => { note(c, 85, 0, 0.1, 'sine', 0.17) },
  heart3: (c) => { note(c, 80, 0, 0.05, 'sine', 0.22); note(c, 80, 0.09, 0.11, 'sine', 0.2) },
}

export const sfx = {
  play(name: SfxName) {
    if (!enabled) return
    const c = audio()
    if (c) try { SOUNDS[name](c) } catch { /* ses zorunlu değil, sessizce yut */ }
  },
  isOn() { return enabled },
  toggle() {
    enabled = !enabled
    storageSet('qt-sfx', enabled ? 'on' : 'off')
    if (enabled) sfx.play('lock') // açıldığına dair kısa geri bildirim
    return enabled
  },
}
