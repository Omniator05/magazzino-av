import { Component } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isStaleChunkError, reloadForNewVersion } from '../utils/staleChunk'

const SUPPORT_EMAIL = 'info@roadcase.it'

// Ultimi errori "non gestiti" della sessione (errori JS fuori da React, promesse
// rifiutate): servono solo a corredare la segnalazione via email, per capire cosa
// potrebbe essere andato storto. Si tengono gli ultimi 5, ognuno accorciato.
const recentErrors = []
const pushRecent = msg => {
  const text = String(msg).slice(0, 200)
  if (recentErrors.length && recentErrors[recentErrors.length - 1].slice(9) === text) return // lo stesso errore di seguito conta una volta
  recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${text}`)
  if (recentErrors.length > 5) recentErrors.shift()
}
if (typeof window !== 'undefined' && !window.__rcErrorCapture) {
  window.__rcErrorCapture = true
  window.addEventListener('error', e => pushRecent(e.message || 'Errore'))
  window.addEventListener('unhandledrejection', e => pushRecent(`Promise: ${e.reason?.message || String(e.reason)}`))
}

// Nomi dei componenti dalla "componentStack" di React, senza indirizzi dei file
// (righe tipo "    at Inventory (http://…/Inventory.jsx:12:3)" → "Inventory").
const componentNames = stack => String(stack || '').split('\n')
  .map(l => (l.trim().match(/^at\s+([^\s(]+)/) || [])[1]).filter(Boolean).slice(0, 5)

// Testo tecnico da allegare alla segnalazione: pagina, errore, dove è successo,
// versione dell'app, dispositivo e ultimi errori. Nessun dato personale (niente
// nome, email o contenuti dell'azienda).
function buildReport({ pathname, error, info }) {
  const version = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) ? String(__APP_VERSION__).slice(0, 7) : 'n/d'
  const names = componentNames(info?.componentStack)
  const stackLines = String(error?.stack || '').split('\n').slice(1, 4).map(l => l.replace(/\(.*\)\s*$/, '').trim()).filter(Boolean)
  return [
    `Pagina: ${pathname}`,
    `Errore: ${error?.name || 'Error'}: ${String(error?.message || error).slice(0, 300)}`,
    names.length ? `Componenti: ${names.join(' > ')}` : null,
    stackLines.length ? `Traccia: ${stackLines.join(' | ')}` : null,
    `Versione app: ${version}`,
    `Browser: ${navigator.userAgent}`,
    `Connessione: ${navigator.onLine ? 'online' : 'offline'}`,
    `Schermo: ${window.innerWidth}x${window.innerHeight}`,
    `Ora: ${new Date().toISOString()}`,
    recentErrors.length ? `Ultimi errori:\n- ${recentErrors.join('\n- ')}` : null,
  ].filter(Boolean).join('\n')
}

// Paracadute attorno alle pagine: se un componente va in errore (es. un hook
// chiamato in ordine diverso) invece della pagina bianca compare un messaggio con
// "Torna alla home" (ricarica l'app da capo: serve anche quando un file di una
// pagina non si riesce più a scaricare dopo un aggiornamento), e il resto
// dell'app resta usabile. Cambiando pagina l'errore si azzera da solo (`resetKey`).
// "Segnala il problema" apre una email già scritta ("Bug su pagina /x") con i
// dettagli tecnici; "Copia" li mette negli appunti (la email ne porta una parte).
class Boundary extends Component {
  state = { error: null, info: null, copied: false }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('Errore di pagina', error, info?.componentStack)
    // Pezzo dell'app non più scaricabile dopo un aggiornamento: si ricarica da soli la versione nuova.
    if (isStaleChunkError(error)) reloadForNewVersion()
    this.setState({ info })
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, info: null, copied: false })
  }
  render() {
    if (!this.state.error) return this.props.children
    const { t, resetKey: pathname } = this.props
    const report = buildReport({ pathname, error: this.state.error, info: this.state.info })
    // Il corpo di un mailto ha un limite pratico di lunghezza: la email porta
    // l'inizio del rapporto, "Copia" quello intero.
    const body = `${t('errorBoundary.emailIntro')}\n\n\n---- ${t('errorBoundary.emailDetails')} ----\n${report}`.slice(0, 1500)
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('errorBoundary.emailSubject', { page: pathname }))}&body=${encodeURIComponent(body)}`
    const copy = async () => {
      try { await navigator.clipboard.writeText(report); this.setState({ copied: true }) } catch { /* niente da fare */ }
    }
    const secondary = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 20px', borderRadius: 13, background: 'var(--c-fill)', color: 'var(--c-ink)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }
    return (
      <div role="alert" style={{ minHeight: '60dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 28px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-ink)', margin: 0 }}>{t('errorBoundary.title')}</h2>
        <p style={{ fontSize: 14, color: 'var(--c-ink2)', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>{t('errorBoundary.message')}</p>
        <button onClick={() => window.location.assign('/')} className="btn-no-anim"
          style={{ marginTop: 6, padding: '12px 22px', borderRadius: 13, background: '#e63946', color: '#fff', fontSize: 14.5, fontWeight: 800 }}>
          {t('errorBoundary.reload')}
        </button>
        <a href={mailto} style={secondary}>{t('errorBoundary.report')}</a>
        <button type="button" onClick={copy} className="btn-no-anim"
          style={{ background: 'transparent', color: 'var(--c-ink2)', fontSize: 13, fontWeight: 700, padding: '8px 12px', minHeight: 40 }}>
          {this.state.copied ? t('errorBoundary.copied') : t('errorBoundary.copyDetails')}
        </button>
      </div>
    )
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  return (
    <Boundary resetKey={pathname} t={t}>
      {children}
    </Boundary>
  )
}
