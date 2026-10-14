import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// Campo "Responsabile evento" con rubrica: suggerisce i referenti già usati
// (es. "Katia" della Fiera) mentre si scrive, e selezionandone uno
// precompila anche telefono/email. La lista si aggiorna da sola per team.
// Il "ricordarsi" di un nome nuovo o modificato avviene al salvataggio
// dell'evento in ciascun form che monta questo campo — vedi
// rememberEventManager in utils/eventManagers.js.
export default function EventManagerField({ teamId, name, phone, email, onChange }) {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState([])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'eventManagers'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  const trimmed = (name || '').trim()
  const suggestions = trimmed
    ? contacts.filter(c => c.nameLower?.includes(trimmed.toLowerCase()) && c.name !== trimmed).slice(0, 5)
    : [...contacts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 5)

  const pick = c => { onChange({ name: c.name, phone: c.phone || '', email: c.email || '' }); setFocused(false) }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input value={name} onChange={e => onChange({ name: e.target.value, phone, email })}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={t('events.eventManagerNamePlaceholder')} style={{ marginBottom: 8 }} />
        {focused && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
            {suggestions.map(c => (
              <button key={c.id} type="button" onMouseDown={() => pick(c)} className="btn-no-anim"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {c.name}
                {c.phone && <span style={{ color: 'var(--text2)', fontWeight: 500 }}> · {c.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={phone} onChange={e => onChange({ name, phone: e.target.value, email })} placeholder={t('events.eventManagerPhonePlaceholder')} type="tel" style={{ flex: 1 }} />
        <input value={email} onChange={e => onChange({ name, phone, email: e.target.value })} placeholder={t('events.eventManagerEmailPlaceholder')} type="email" style={{ flex: 1 }} />
      </div>
    </div>
  )
}
