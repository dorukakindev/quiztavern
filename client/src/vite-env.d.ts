declare module '*.css'

interface ImportMetaEnv {
  readonly VITE_GAME_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace JSX {
  interface IntrinsicElements {
    accent: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
  }
}
declare module '*.png'
/** lottie-web'in hafif sürümü tip tanımı taşımıyor; ana paketinkini kullan. */
declare module 'lottie-web/build/player/lottie_light' {
  export * from 'lottie-web'
  import lottie from 'lottie-web'
  export default lottie
}
