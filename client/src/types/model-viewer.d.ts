import type { CSSProperties } from 'react'

/** @google/model-viewer'ın <model-viewer> web bileşeni için JSX tipi.
 *  React 19 custom element'leri render eder; burada yalnızca kullandığımız
 *  attribute'lar tiplenir (tam API: model-viewer paketinin kendi tipleri). */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': {
        src?: string
        class?: string
        autoplay?: boolean
        'interaction-prompt'?: 'auto' | 'none' | 'wiggle'
        'disable-zoom'?: boolean
        'camera-orbit'?: string
        'min-camera-orbit'?: string
        'max-camera-orbit'?: string
        exposure?: string | number
        'shadow-intensity'?: string | number
        'shadow-softness'?: string | number
        'field-of-view'?: string
        'animation-name'?: string
        loading?: 'auto' | 'lazy' | 'eager'
        reveal?: 'auto' | 'interaction' | 'manual'
        'aria-hidden'?: boolean | 'true' | 'false'
        role?: string
        style?: CSSProperties
      }
    }
  }
}

export {}
