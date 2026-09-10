import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Bottone "← Indietro" usato sulle pagine raggiunte dagli "Strumenti" della
// Dashboard e dal menu Impostazioni (Scanner, Task, Furgoni, Ore, Archivio,
// sotto-pagine di Impostazioni...). Stessa pillola testuale delle liste di
// carico (dettaglio evento / scanner magazziniere), così il tasto indietro è
// identico in tutta l'app. Di default torna alla home; passa `to` per
// un'altra rotta (es. le sotto-pagine di Impostazioni tornano a /admin/settings).
export default function BackHomeButton({ to = '/' }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <button
      onClick={() => navigate(to)}
      aria-label={t('common.back')}
      style={{
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        color: 'var(--text2)',
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 14,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      ← {t('common.back')}
    </button>
  )
}
