import { useEffect, useRef, useState } from "react";
import { storageGet, storageSet } from "../lib/storage";
import { useI18n } from "./i18n";
import { Icon } from "./icons";

/**
 * Masa sahnesinin dekoru: arkaplan videosu, marka logosu, müzik.
 *
 * KURAL: Buradaki hiçbir kütüphane CDN'den gelmez. Discord Activity'nin CSP'si
 * yalnızca kendi proxy alan adımıza izin verir; unpkg/jsdelivr'den yüklenen bir
 * script ya da WASM `blocked:csp` ile ölür. Asset'ler kendi origin'imizden servis ediliyor
 * (client/public/table/).
 */

/** Arkaplan videosu. Ağır bir dosya: poster hemen görünür, video hazır olunca devralır. */
export function TableBackdrop() {
  const [ready, setReady] = useState(false);
  return (
    <div className="qt-backdrop" aria-hidden="true">
      <video
        className={`qt-backdrop__video ${ready ? "is-ready" : ""}`}
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
        {MOTES.map((mote, index) => (
          <i
            key={index}
            style={{
              left: mote.left,
              bottom: mote.bottom,
              width: mote.size,
              height: mote.size,
              background: mote.color,
              animationDuration: mote.duration,
              animationDelay: mote.delay,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Zemin parçacıkları: konum/boyut/renk/süre/gecikme sabit — rastgele değil, göz kırpışan bir desen olmasın diye elle dağıtılmış. */
const MOTES = [
  { left: "12%", bottom: "8%", size: "3px", color: "#4fcbd6", duration: "14s", delay: "0s" },
  { left: "28%", bottom: "4%", size: "2px", color: "#f3c362", duration: "18s", delay: "4s" },
  { left: "47%", bottom: "10%", size: "3px", color: "#8fd9e8", duration: "16s", delay: "8s" },
  { left: "64%", bottom: "5%", size: "2px", color: "#4fcbd6", duration: "20s", delay: "2s" },
  { left: "81%", bottom: "9%", size: "3px", color: "#f3c362", duration: "15s", delay: "10s" },
  { left: "92%", bottom: "6%", size: "2px", color: "#8fd9e8", duration: "19s", delay: "6s" },
];

/**
 * Masanın marka işareti: Triviara kalkan logosu.
 *
 * Önce 3D baykuştu (@google/model-viewer + owl-idle.glb); Discord'da model
 * çizilmiyordu (WebGL/CSP) ve 2.3 MB hiç görünmeyen bir şey için iniyordu, o
 * yüzden kaldırıldı. Sonra baykuş PNG'siydi; kullanıcı gerçek logoyu istedi.
 */
export function TableLogo() {
  return (
    <div className="qt-logo-mark">
      <div className="qt-logo-mark__shadow" aria-hidden="true" />
      <img className="qt-logo-mark__img" src="/table/quiztavern-logo.png" alt="" aria-hidden="true" />
    </div>
  );
}

/**
 * Arkaplan müziği. Varsayılan KAPALI — tasarımda da öyle, ve tarayıcılar sesli
 * otomatik oynatmayı zaten kullanıcı etkileşimine kadar engeller. Tercih
 * localStorage'da kalıcı.
 */
export function MusicToggle() {
  const { t } = useI18n();
  const [on, setOn] = useState(() => storageGet("qt-music") === "on");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    storageSet("qt-music", on ? "on" : "off");
    if (!on) {
      audio.current?.pause();
      return;
    }
    if (!audio.current) {
      audio.current = new Audio("/table/music.mp3");
      audio.current.loop = true;
      audio.current.volume = 0.35;
    }
    // Otomatik oynatma reddedilebilir; sessizce yut, düğme yine de doğru durumu gösterir.
    void audio.current.play().catch(() => {});
  }, [on]);
  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [],
  );
  return (
    <button
      className={`qt-music-toggle ${on ? "is-on" : ""}`}
      onClick={() => setOn((value) => !value)}
      title={t("music.toggle")}
      aria-label={t("music.toggle")}
      aria-pressed={on}
    >
      <Icon name={on ? "music" : "musicOff"} className={on ? "" : "is-muted"} />
    </button>
  );
}
