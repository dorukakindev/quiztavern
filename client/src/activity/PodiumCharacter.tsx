import { useEffect, useState } from 'react'

// model-viewer + three.js yalnızca podyum fazında iner: dinamik import
// ana bundle'ı şişirmez, iframe açılışı hafif kalır.
let modelViewerReady: Promise<void> | null = null
function ensureModelViewer(): Promise<void> {
  if (!modelViewerReady) {
    modelViewerReady = import('@google/model-viewer')
      .then(() => undefined)
      .catch(() => {
        modelViewerReady = null
      })
  }
  return modelViewerReady
}

/** Podyumda kutlama yapan 3B taverna karakteri (Meshy GLB, tek varlık).
 *  Dekor amaçlı: kazananın kimliğini hâlâ avatar+isim taşır. WebGL
 *  yoksa ya da yükleme düşerse hiçbir şey çizilmez (sessiz fallback).
 *  prefers-reduced-motion'da autoplay kapanır — ilk kare sabit durur. */
export function PodiumCharacter() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    void ensureModelViewer().then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!ready) return null
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  return <model-viewer
    class="qt-podium-model"
    src="/models/tavern-host.glb"
    interaction-prompt="none"
    disable-zoom
    camera-orbit="0deg 82deg 2.4m"
    min-camera-orbit="auto auto auto"
    max-camera-orbit="auto auto auto"
    field-of-view="30deg"
    exposure="1.1"
    shadow-intensity="0.7"
    shadow-softness="0.9"
    {...(reduced ? {} : { autoplay: true })}
    aria-hidden="true"
  />
}
