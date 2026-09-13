import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate } from '../utils/formatDate'
import { User } from './Icon'

/**
 * Popup che avvisa l'admin, al primo accesso utile dopo l'evento, che un
 * worker ha segnalato una nuova assenza (vedi addAbsence in Calendar.jsx e
 * confirmUnavailability in WorkerCalendar.jsx, che scrivono il doc
 * 'notifications' letto qui). Stessa forma del popup di conferma
 * (ConfirmProvider) e del resoconto settimanale — card centrata, non il
 * foglio con drag delle form — con due scelte fianco a fianco: "Ho capito"
 * chiude e basta, "Vai al calendario" ci porta dritti sopra.
 * Montato una volta sola nel ramo admin di App.jsx così appare su qualunque
 * pagina si atterri dopo il login.
 */
export default function AbsenceNotifications() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, teamId } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState([])
  const [closing, setClosing] = useState(false)
  useModalScrollLock(pending.length > 0)

  useEffect(() => {
    if (!isAdmin || !teamId || !user) return
    return onSnapshot(
      query(collection(db, 'notifications'), where('teamId', '==', teamId), where('type', '==', 'absence')),
      snap => {
        const unseen = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(n => !(n.seenBy || []).includes(user.uid))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
        setPending(unseen)
      }
    )
  }, [isAdmin, teamId, user])

  const markSeen = () => {
    pending.forEach(n => {
      updateDoc(doc(db, 'notifications', n.id), { seenBy: arrayUnion(user.uid) }).catch(() => {})
    })
  }

  const close = (goToCalendar) => {
    setClosing(true)
    setTimeout(() => {
      markSeen()
      setClosing(false)
      if (goToCalendar) navigate('/calendar')
    }, 150)
  }

  useEffect(() => {
    if (pending.length === 0) return
    const onKey = e => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length])

  if (pending.length === 0) return null

  return (
    <div
      onClick={() => close(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: closing ? 'absNotifFadeOut 0.15s ease forwards' : 'absNotifFadeIn 0.15s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background: '#fff', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'absNotifPopOut 0.15s ease forwards' : 'absNotifPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(216,56,63,0.12)', color: 'var(--accent)' }}>
          <User size={22} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {t('calendar.absenceNotifTitle')}
          {pending.length > 1 && (
            <span style={{ background: '#f3f4f6', borderRadius: 10, padding: '1px 8px', fontSize: 13, fontWeight: 700, color: '#6b7280' }}>{pending.length}</span>
          )}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, marginBottom: 20, textAlign: 'left', maxHeight: 260, overflowY: 'auto' }}>
          {pending.map(n => (
            <div key={n.id} style={{ background: '#f9fafb', borderRadius: 12, padding: '11px 14px' }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{n.workerName}</p>
              <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
                {formatDate(n.startDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)}
                {n.endDate && n.endDate !== n.startDate ? ` → ${formatDate(n.endDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)}` : ''}
              </p>
              {n.reason && <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>“{n.reason}”</p>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => close(false)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer' }}>
            {t('calendar.absenceNotifClose')}
          </button>
          <button onClick={() => close(true)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {t('calendar.absenceNotifGoToCalendar')}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes absNotifFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes absNotifFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes absNotifPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes absNotifPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
      `}</style>
    </div>
  )
}
