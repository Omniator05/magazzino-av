import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// Domanda che compare dopo "Salva" nella colonna delle attività di Assegna personale (squadre Pro),
// quando tra le persone appena salvate c'è un esterno: è un Freelance senza ancora l'account, quindi
// il testo invita ad aggiungere la sua email. Un grande bottone porta a Impostazioni › Utenti e c'è
// "non mostrare più". Si chiude toccando fuori dal riquadro. La colonna è già chiusa dietro.
export default function GuestInvitePrompt({ count, onGo, onClose }) {
  const { t } = useTranslation()
  const [dontShow, setDontShow] = useState(false)

  return (
    <div onClick={() => onClose(dontShow)}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t('guest.freelancePromptTitle', { count })}
        style={{ width: '100%', maxWidth: 360, background: 'var(--c-surface)', borderRadius: 18, padding: '24px 20px 14px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 19, color: 'var(--c-ink)' }}>{t('guest.freelancePromptTitle', { count })}</h2>
        <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: 'var(--c-ink2)' }}>{t('guest.freelancePromptText', { count })}</p>

        <button type="button" className="btn btn-primary btn-full" onClick={() => onGo(dontShow)}
          style={{ minHeight: 54, fontSize: 16, fontWeight: 800, borderRadius: 14 }}>
          {t('guest.freelancePromptGo', { count })}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 6, cursor: 'pointer', fontSize: 13, color: 'var(--c-ink2)' }}>
          <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0, accentColor: '#e63946' }} />
          {t('guest.promptDontShow')}
        </label>
      </div>
    </div>
  )
}
