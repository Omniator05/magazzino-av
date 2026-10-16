import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '../hooks/useIsMobile'

// Header delle pagine "strumento" (Task, Scanner, Furgoni, Template, Archivio):
// bianco con filo sottile come Eventi/Magazzino, "← Indietro" a sinistra e
// titolo + sottotitolo a destra sulla stessa riga. Senza `backTo` (es. la lista
// dei magazzinieri, raggiunta dalla tab bar) resta solo il titolo, a sinistra.
// `right`: elemento opzionale accanto al titolo (es. un pulsante).
export default function PageHeader({ title, subtitle, backTo, right }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  return (
    <div className="page-header rc-page-header" style={isMobile ? { padding: '52px 20px 16px' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: backTo ? 'space-between' : 'flex-start', gap: 12 }}>
        {backTo && (
          <button onClick={() => navigate(backTo)} aria-label={t('common.back')} className="rc-pill-btn" style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }}>
            ← {t('common.back')}
          </button>
        )}
        <div style={{ textAlign: backTo ? 'right' : 'left', minWidth: 0, flex: backTo ? undefined : 1 }}>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  )
}
