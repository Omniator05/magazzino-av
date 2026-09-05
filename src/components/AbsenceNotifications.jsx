import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useModalDrag } from '../hooks/useModalDrag'
import { formatDate } from '../utils/formatDate'
import { User } from './Icon'

/**
 * Popup che avvisa l'admin, al primo accesso utile dopo l'evento, che un
 * worker ha segnalato una nuova assenza (vedi addAbsence in Calendar.jsx,
 * che scrive il doc 'notifications' letto qui). Montato una volta sola nel
 * ramo admin di App.jsx così appare su qualunque pagina si atterri dopo il login.
 */
export default function AbsenceNotifications() {
  const { t, i18n } = useTranslation()
  const { user, isAdmin, teamId } = useAuth()
  const [pending, setPending] = useState([])

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

  const drag = useModalDrag(markSeen, undefined, undefined, pending.length > 0)

  if (pending.length === 0) return null

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick} style={{ zIndex: 500 }}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...drag.props}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(216,56,63,0.12)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={17} />
          </span>
          {t('calendar.absenceNotifTitle')}
          {pending.length > 1 && (
            <span style={{ background: 'var(--bg3)', borderRadius: 10, padding: '1px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>{pending.length}</span>
          )}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {pending.map(n => (
            <div key={n.id} style={{ background: 'var(--card2)', borderRadius: 12, padding: '11px 14px' }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{n.workerName}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                {formatDate(n.startDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)}
                {n.endDate && n.endDate !== n.startDate ? ` → ${formatDate(n.endDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)}` : ''}
              </p>
              {n.reason && <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>“{n.reason}”</p>}
            </div>
          ))}
        </div>
        <button onClick={drag.close} className="btn btn-primary btn-full">{t('calendar.absenceNotifClose')}</button>
      </div>
    </div>
  )
}
