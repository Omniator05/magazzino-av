import { Component } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Paracadute attorno alle pagine: se un componente va in errore (es. un hook
// chiamato in ordine diverso) invece della pagina bianca compare un messaggio con
// "Torna alla home" (ricarica l'app da capo: serve anche quando un file di una pagina non
// si riesce più a scaricare dopo un aggiornamento), e il resto dell'app resta usabile.
// Cambiando pagina l'errore si azzera da solo (`resetKey`).
class Boundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Errore di pagina', error, info?.componentStack) }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    const { title, message, reload } = this.props.labels
    return (
      <div role="alert" style={{ minHeight: '60dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 28px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-ink)', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 14, color: 'var(--c-ink2)', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>{message}</p>
        <button onClick={() => window.location.assign('/')} className="btn-no-anim"
          style={{ marginTop: 6, padding: '12px 22px', borderRadius: 13, background: '#e63946', color: '#fff', fontSize: 14.5, fontWeight: 800 }}>
          {reload}
        </button>
      </div>
    )
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  return (
    <Boundary resetKey={pathname} labels={{ title: t('errorBoundary.title'), message: t('errorBoundary.message'), reload: t('errorBoundary.reload') }}>
      {children}
    </Boundary>
  )
}
