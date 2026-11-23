import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot, doc, writeBatch, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'

// Popup nella Home admin: un Freelance ha accettato o rifiutato un evento a cui era stato assegnato. Compare finché
// l'admin non lo chiude ("Ok" o toccando un evento), una volta per admin: la chiusura si salva nel documento
// (`dismissedBy`), quindi non ricompare su un altro dispositivo. Le risposte le scrive il server (api/_freelance.js).
const SHOW_DAYS = 14
const COLOR = { accepted: '#16a34a', declined: '#dc2626' }

export default function FreelanceResponseModal({ navigate }) {
  const { t, i18n } = useTranslation()
  const { teamId, user, profile } = useAuth()
  const [docs, setDocs] = useState([])
  const [hidden, setHidden] = useState(() => new Set())   // chiuse in questa sessione, prima che arrivi lo snapshot

  useEffect(() => {
    if (!teamId || profile?.role !== 'admin') return undefined
    return onSnapshot(query(collection(db, 'freelanceResponses'), where('teamId', '==', teamId)),
      snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setDocs([]))
  }, [teamId, profile?.role])

  const unseen = useMemo(() => {
    const cutoff = Date.now() - SHOW_DAYS * 86400000
    return docs
      .filter(d => !hidden.has(d.id) && !(d.dismissedBy || []).includes(user?.uid) && (d.createdAt?.toMillis?.() || Date.now()) >= cutoff)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
  }, [docs, hidden, user?.uid])
  useModalScrollLock(unseen.length > 0)

  const dismiss = async list => {
    setHidden(h => new Set([...h, ...list.map(d => d.id)]))
    try {
      const batch = writeBatch(db)
      list.forEach(d => batch.update(doc(db, 'freelanceResponses', d.id), { dismissedBy: arrayUnion(user.uid) }))
      await batch.commit()
    } catch { /* resta nascosta in questa sessione; al prossimo avvio può ricomparire */ }
  }

  if (unseen.length === 0) return null
  const when = d => (d.eventDate ? capitalize(formatDate(`${d.eventDate}T12:00:00`, { day: 'numeric', month: 'short' }, i18n.language)) : '')

  return (
    <div onClick={() => dismiss(unseen)} style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('freelanceResponse.title', { count: unseen.length })}
        style={{ background: 'var(--card)', borderRadius: 24, padding: '24px 20px 18px', width: '100%', maxWidth: 380, maxHeight: '82dvh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.35)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 14px', letterSpacing: '-0.3px' }}>{t('freelanceResponse.title', { count: unseen.length })}</h3>
        {unseen.map(d => (
          <button key={d.id} type="button" className="btn-no-anim" onClick={() => { dismiss([d]); navigate(`/events/${d.eventId}`) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '11px 0', borderTop: '1px solid var(--border)', background: 'transparent', color: 'inherit' }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: COLOR[d.status], color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.status === 'accepted' ? '✓' : '✕'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>
                {d.workerName || t('common.unknown')} <span style={{ color: COLOR[d.status] }}>{t(d.status === 'accepted' ? 'freelanceResponse.accepted' : 'freelanceResponse.declined')}</span>
              </span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.eventName}{when(d) ? ` · ${when(d)}` : ''}</span>
            </span>
            <span style={{ color: 'var(--text2)', fontSize: 18 }}>›</span>
          </button>
        ))}
        <button type="button" className="btn btn-primary btn-full" onClick={() => dismiss(unseen)} style={{ marginTop: 14, minHeight: 48, fontSize: 15, fontWeight: 800 }}>{t('freelanceResponse.ok')}</button>
      </div>
    </div>
  )
}
