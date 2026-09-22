import { useEffect, useRef, useState } from 'react'
import type { AnimationItem } from 'lottie-web/build/player/lottie_light'
import { storageGet, storageSet } from '../lib/storage'
import { useI18n } from './i18n'

/**
 * Masa sahnesinin dekoru: arkaplan videosu, marka logosu ve galaksi.
 *
 * KURAL: Buradaki hiçbir kütüphane CDN'den gelmez. Discord Activity'nin CSP'si
 * yalnızca kendi proxy alan adımıza izin verir; unpkg/jsdelivr'den yüklenen bir
 * script ya da WASM `blocked:csp` ile ölür. Bu yüzden lottie npm'den kurulup
 * bundle'a giriyor, asset'ler de kendi origin'imizden servis ediliyor
 * (client/public/table/).
 */

/** Arkaplan videosu. Ağır bir dosya: poster hemen görünür, video hazır olunca devralır. */
export function TableBackdrop() {
  const [ready, setReady] = useState(false)
  return <div className="qt-backdrop" aria-hidden="true">
    <video
      className={`qt-backdrop__video ${ready ? 'is-ready' : ''}`}
      src="/table/bg-video.mp4"
      poster="/table/hero-universe.webp"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onCanPlay={() => setReady(true)}
    />
    <div className="qt-backdrop__veil" />
    <div className="qt-backdrop__glow" />
    <div className="qt-backdrop__vignette" />
    <div className="qt-motes" aria-hidden="true">
      {MOTES.map((mote, index) => <i key={index} style={{ left: mote.left, bottom: mote.bottom, width: mote.size, height: mote.size, background: mote.color, animationDuration: mote.duration, animationDelay: mote.delay }} />)}
    </div>
  </div>
}

/** Zemin parçacıkları: konum/boyut/renk/süre/gecikme sabit — rastgele değil, göz kırpışan bir desen olmasın diye elle dağıtılmış. */
const MOTES = [
  { left: '12%', bottom: '8%', size: '3px', color: '#4fcbd6', duration: '14s', delay: '0s' },
  { left: '28%', bottom: '4%', size: '2px', color: '#f3c362', duration: '18s', delay: '4s' },
  { left: '47%', bottom: '10%', size: '3px', color: '#8fd9e8', duration: '16s', delay: '8s' },
  { left: '64%', bottom: '5%', size: '2px', color: '#4fcbd6', duration: '20s', delay: '2s' },
  { left: '81%', bottom: '9%', size: '3px', color: '#f3c362', duration: '15s', delay: '10s' },
  { left: '92%', bottom: '6%', size: '2px', color: '#8fd9e8', duration: '19s', delay: '6s' },
]

/**
 * Masanın marka işareti: QuizTavern kalkan logosu.
 *
 * Önce 3D baykuştu (@google/model-viewer + owl-idle.glb); Discord'da model
 * çizilmiyordu (WebGL/CSP) ve 2.3 MB hiç görünmeyen bir şey için iniyordu, o
 * yüzden kaldırıldı. Sonra baykuş PNG'siydi; kullanıcı gerçek logoyu istedi.
 */
export function TableLogo() {
  return <div className="qt-logo-mark">
    <div className="qt-logo-mark__shadow" aria-hidden="true" />
    <img className="qt-logo-mark__img" src="/table/quiztavern-logo.png" alt="" aria-hidden="true" />
  </div>
}

/** Diskin içindeki galaksi. Saf JS lottie: WASM yok, CDN yok. */
export function GalaxyLoop() {
  const host = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setReducedMotion(query.matches)
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    }
    const legacyQuery = query as unknown as { addListener: (listener: () => void) => void; removeListener: (listener: () => void) => void }
    legacyQuery.addListener(onChange)
    return () => legacyQuery.removeListener(onChange)
  }, [])
  useEffect(() => {
    if (!host.current) return
    if (reducedMotion) return
    let animation: AnimationItem | null = null
    let cancelled = false
    // lottie-web (~ağır) ve galaxy.json paralel yüklenir: dekor olduğu için
    // ana bundle'ı büyütmesin, ilk boyanan ekranı geciktirmesin.
    Promise.all([
      import('lottie-web/build/player/lottie_light'),
      fetch('/table/galaxy.json').then((response) => response.json()),
    ])
      .then(([{ default: lottie }, data]) => {
        if (cancelled || !host.current) return
        // loop:false + tamamlanınca yön ters çevir: başa sıçramadan, geriye
        // doğru oynayarak biter — döngü noktası fark edilmez ("bounce" efekti).
        animation = lottie.loadAnimation({ container: host.current, renderer: 'svg', loop: false, autoplay: true, animationData: data })
        animation.setSpeed(0.5)
        let direction: 1 | -1 = 1
        animation.addEventListener('complete', () => {
          direction = direction === 1 ? -1 : 1
          animation?.setDirection(direction)
          animation?.play()
        })
      })
      .catch(() => { /* dekor: gelmezse disk boş kalır, oyun etkilenmez */ })
    return () => { cancelled = true; animation?.destroy() }
  }, [reducedMotion])
  return <div className="qt-galaxy" ref={host} aria-hidden="true" />
}

/**
 * Arkaplan müziği. Varsayılan KAPALI — tasarımda da öyle, ve tarayıcılar sesli
 * otomatik oynatmayı zaten kullanıcı etkileşimine kadar engeller. Tercih
 * localStorage'da kalıcı.
 */
export function MusicToggle() {
  const { t } = useI18n()
  const [on, setOn] = useState(() => storageGet('qt-music') === 'on')
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    storageSet('qt-music', on ? 'on' : 'off')
    if (!on) { audio.current?.pause(); return }
    if (!audio.current) {
      audio.current = new Audio('/table/music.mp3')
      audio.current.loop = true
      audio.current.volume = 0.35
    }
    // Otomatik oynatma reddedilebilir; sessizce yut, düğme yine de doğru durumu gösterir.
    void audio.current.play().catch(() => {})
  }, [on])
  useEffect(() => () => { audio.current?.pause(); audio.current = null }, [])
  return <button className={`qt-music-toggle ${on ? 'is-on' : ''}`} onClick={() => setOn((value) => !value)} title={t('music.toggle')} aria-label={t('music.toggle')} aria-pressed={on}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
    {!on && <i className="qt-music-toggle__slash" aria-hidden="true" />}
  </button>
}
