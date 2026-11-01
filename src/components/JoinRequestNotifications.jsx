import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useAppReady } from '../hooks/useAppReady'
import { approveJoinRequest, rejectJoinRequest } from '../utils/joinRequests'
import { User, Check } from './Icon'

/**
 * Popup che avvisa l'admin, al primo accesso utile, che qualcuno ha chiesto di entrare nella squadra
 * (il doc 'notifications' di tipo 'join_request' lo scrive il server, vedi `joinRequest` in
 * api/send-email.js: chi chiede non è ancora membro e dal browser non potrebbe scriverlo). Stessa forma di
 * AbsenceNotifications: card centrata. Ogni richiesta si approva o si rifiuta da qui (stesse funzioni della
 * sezione Utenti, quindi anche l'email di esito a chi aveva chiesto); "Vai agli utenti" apre la sezione per i dettagli.
 *
 * Si mostrano solo le richieste ancora in attesa (profilo con approved === false): se un altro admin ha già
 * approvato o rifiutato, l'avviso non ha più senso e non compare.
 * Montato una volta sola nel ramo admin di App.jsx.
 */
export default function JoinRequestNotifications() {
  const { t } = useTranslation()
  const { user, isAdmin, teamId } = useAuth()
  const navigate = useNavigate()
  const [notes, setNotes] = useState([])
  const [waitingIds, setWaitingIds] = useState(null)   // profili ancora in attesa; null finché non arrivano
  const [closing, setClosing] = useState(false)
  const [busyId, setBusyId] = useState(null)             // richiesta su cui si sta agendo
  const [confirmingId, setConfirmingId] = useState(null)  // richiesta per cui si chiede conferma del rifiuto
  const [failedId, setFailedId] = useState(null)
  const ready = useAppReady()

  useEffect(() => {
    if (!isAdmin || !teamId || !user) return
    return onSnapshot(
      query(collection(db, 'notifications'), where('teamId', '==', teamId), where('type', '==', 'join_request')),
      snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
  }, [isAdmin, teamId, user])

  useEffect(() => {
    if (!isAdmin || !teamId) return
    return onSnapshot(
      query(collection(db, 'profiles'), where('teamId', '==', teamId), where('approved', '==', false)),
      snap => setWaitingIds(new Set(snap.docs.map(d => d.id))),
      () => setWaitingIds(new Set())
    )
  }, [isAdmin, teamId])

  const pending = waitingIds
    ? notes
        .filter(n => waitingIds.has(n.requesterId) && !(n.seenBy || []).includes(user?.uid))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    : []
  useModalScrollLock(ready && pending.length > 0)

  // La riga sparisce da sola: l'ascolto dei profili in attesa non la include più a decisione presa.
  const decide = async (n, approve) => {
    setBusyId(n.id); setFailedId(null)
    try {
      await (approve ? approveJoinRequest(n.requesterId) : rejectJoinRequest(n.requesterId))
      updateDoc(doc(db, 'notifications', n.id), { seenBy: arrayUnion(user.uid) }).catch(() => {})
    } catch {
      setFailedId(n.id)
    } finally {
      setBusyId(null); setConfirmingId(null)
    }
  }

  const close = (goToUsers) => {
    setClosing(true)
    setTimeout(() => {
      pending.forEach(n => updateDoc(doc(db, 'notifications', n.id), { seenBy: arrayUnion(user.uid) }).catch(() => {}))
      setClosing(false)
      if (goToUsers) navigate('/admin/settings/users')
    }, 150)
  }

  useEffect(() => {
    if (!ready || pending.length === 0) return
    const onKey = e => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length, ready])

  if (!ready || pending.length === 0) return null

  return (
    <div
      onClick={() => close(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: closing ? 'joinNotifFadeOut 0.15s ease forwards' : 'joinNotifFadeIn 0.15s ease' }}
    >
      <div
        className="jn-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background: 'var(--c-surface)', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'joinNotifPopOut 0.15s ease forwards' : 'joinNotifPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(216,56,63,0.12)', color: 'var(--accent)' }}>
          <User size={22} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-ink)', margin: '0 0 4px', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {t('joinRequestNotif.title')}
          {pending.length > 1 && (
            <span style={{ background: 'var(--c-fill)', borderRadius: 10, padding: '1px 8px', fontSize: 13, fontWeight: 700, color: 'var(--c-ink2)' }}>{pending.length}</span>
          )}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--c-ink2)', margin: 0 }}>{t('joinRequestNotif.subtitle', { count: pending.length })}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, marginBottom: 20, textAlign: 'left', maxHeight: 260, overflowY: 'auto' }}>
          {pending.map(n => {
            const busy = busyId === n.id
            const confirming = confirmingId === n.id
            const btn = { flex: 1, padding: '9px 10px', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }
            return (
              <div key={n.id} style={{ background: 'var(--c-alt)', borderRadius: 12, padding: '11px 14px' }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-ink)', overflowWrap: 'anywhere' }}>{n.requesterName}</p>
                {n.requesterEmail && <p style={{ fontSize: 12.5, color: 'var(--c-ink2)', marginTop: 2, overflowWrap: 'anywhere' }}>{n.requesterEmail}</p>}
                {confirming ? (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink)', marginBottom: 8 }}>{t('joinRequestNotif.confirmReject')}</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={() => decide(n, false)} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>{t('joinRequestNotif.confirmYes')}</button>
                      <button disabled={busy} onClick={() => setConfirmingId(null)} style={{ ...btn, background: 'var(--c-fill)', color: 'var(--c-ink2)' }}>{t('common.cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button disabled={busy} onClick={() => decide(n, true)} style={{ ...btn, background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Check size={14} /> {t('adminUsers.approve')}
                    </button>
                    <button disabled={busy} onClick={() => { setFailedId(null); setConfirmingId(n.id) }} style={{ ...btn, background: 'var(--c-fill)', color: 'var(--c-ink2)' }}>{t('adminUsers.reject')}</button>
                  </div>
                )}
                {failedId === n.id && <p role="alert" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 8 }}>{t('joinRequestNotif.failed')}</p>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => close(false)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: 'var(--c-fill)', color: 'var(--c-ink2)', border: 'none', cursor: 'pointer' }}>
            {t('joinRequestNotif.later')}
          </button>
          <button onClick={() => close(true)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: 'var(--c-fill)', color: 'var(--c-ink)', border: 'none', cursor: 'pointer' }}>
            {t('joinRequestNotif.review')}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes joinNotifFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes joinNotifFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes joinNotifPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes joinNotifPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
        @media (prefers-reduced-motion: reduce) { .jn-card { animation: none !important; } }
      `}</style>
    </div>
  )
}
