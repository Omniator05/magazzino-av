import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Popup minimo "nome esterno al volo": si apre quando si droppa/tocca il
// chip generico "Esterno" sopra un evento o un task (o, allo stesso modo,
// quando si assegna un furgone esterno nella lista di carico) — un solo
// campo, Invio per confermare, niente altro da scegliere (l'entità creata
// viene già assegnata dal chiamante). Non usa useModalDrag (niente da
// trascinare per chiudere, è solo un campo) ma stessa famiglia visiva degli
// altri popup centrati dell'app (es. DeadlineReminderModal.jsx). Titolo/
// descrizione/placeholder sono personalizzabili (default: persona, il caso
// d'uso originale in StaffTimeline) così lo stesso popup serve anche per
// altre entità "esterne riusabili" senza copy fuori contesto.
export default function QuickExternalPopup({ onConfirm, onCancel, title, description, placeholder }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const confirm = () => { if (name.trim()) onConfirm(name.trim()) }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: '#fff', borderRadius: 20, padding: '22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 24px 70px rgba(0,0,0,0.35)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{title || t('staffTimeline.quickExternalTitle')}</h3>
        <p style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 12 }}>{description || t('staffTimeline.quickExternalDesc')}</p>
        <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
          placeholder={placeholder || t('staffTimeline.externalPlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter') confirm() }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={confirm} disabled={!name.trim()} className="btn btn-primary" style={{ flex: 1 }}>{t('common.add')}</button>
        </div>
      </div>
    </div>
  )
}
