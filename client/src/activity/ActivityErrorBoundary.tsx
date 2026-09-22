import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Render/lifecycle hataları bütün Discord Activity yüzeyini beyaz bırakmasın.
 * Event handler hataları React Error Boundary kapsamına girmez; bunlar mevcut
 * istek/socket hata akışlarında ayrıca ele alınır.
 */
export class ActivityErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[activity render]', error, info.componentStack)
  }

  private reload = () => window.location.reload()

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="qt-fatal" role="alert">
        <div className="qt-fatal__card">
          <span>QUIZTAVERN</span>
          <h1>Oyun ekranı yüklenemedi</h1>
          <p>Beklenmeyen bir görüntüleme hatası oluştu. Masaya güvenle yeniden bağlanmak için sayfayı yenileyebilirsin.</p>
          <button type="button" className="qt-button qt-button--primary" onClick={this.reload}>Yeniden yükle</button>
        </div>
      </main>
    )
  }
}
