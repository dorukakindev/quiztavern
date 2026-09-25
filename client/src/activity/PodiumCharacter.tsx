import { useEffect, useState } from "react";

// model-viewer + three.js yalnızca podyum fazında iner: dinamik import
// ana bundle'ı şişirmez, iframe açılışı hafif kalır.
let modelViewerReady: Promise<void> | null = null;
function ensureModelViewer(): Promise<void> {
  if (!modelViewerReady) {
    modelViewerReady = import("@google/model-viewer")
      .then(() => undefined)
      .catch(() => {
        modelViewerReady = null;
      });
  }
  return modelViewerReady;
}

/** Podyumda kutlama yapan 3B taverna karakteri (Meshy GLB, tek varlık).
 *  Dekor amaçlı: kazananın kimliğini hâlâ avatar+isim taşır. WebGL
 *  yoksa ya da yükleme düşerse hiçbir şey çizilmez (sessiz fallback).
 *  prefers-reduced-motion'da autoplay kapanır — ilk kare sabit durur. */
/** Alçak ekranda (Discord iframe'i çoğu zaman ~600px) karakter podyumu
 *  taşırıyordu: burada hiç yüklenmez (~3 MB model + kütüphane de inmez).
 *  Eşik CSS'teki `.qt-podium-model-slot` gizleme eşiğiyle AYNI olmalı. */
const MODEL_MIN_HEIGHT = 701;

export function PodiumCharacter() {
  const [enabled] = useState(
    () => typeof matchMedia !== "function" || matchMedia(`(min-height: ${MODEL_MIN_HEIGHT}px)`).matches,
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void ensureModelViewer().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  if (!enabled) return null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Yuva HER ZAMAN sabit yükseklikte çizilir: model sonradan gelince podyum
  // aşağı kaymasın (eskiden null -> 150px sıçraması vardı).
  return (
    <div className="qt-podium-model-slot" aria-hidden="true">
      {ready && (
        <model-viewer
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
      )}
    </div>
  );
}
