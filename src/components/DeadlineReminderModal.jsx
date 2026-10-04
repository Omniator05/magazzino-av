import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate } from '../utils/formatDate'
import { collectUpcomingDeadlines } from '../utils/deadlines'
import { Warn } from './Icon'

const STORAGE_KEY = 'deadline_reminder_seen'

// Popup "scadenze in arrivo" (assicurazione/revisione/bollo furgoni, o
// qualunque scadenza libera sugli oggetti) — stessa forma di
// AbsenceNotifications.jsx (card centrata, non il foglio con drag), ma
// "visto" per dispositivo come TodayReminderModal.jsx invece che per utente
// su Firestore: non è un evento puntuale da segnare "letto" una volta per
// sempre, è una condizione che resta vera finché qualcuno non aggiorna la
// data — deve poter ripresentarsi il giorno dopo se nessuno se ne occupa.
// Montato solo in Dashboard.jsx (furgoni/magazzino sono cose da admin).
export default function DeadlineReminderModal({ vehicles, items, today }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  const upcoming = useMemo(() => {
    const subjects = [
      ...(vehicles || []).map(v => ({ id: v.id, name: v.name, kind: 'vehicle', deadlines: v.deadlines })),
      ...(items || []).map(i => ({ id: i.id, name: i.name, kind: 'item', deadlines: i.deadlines })),
    ]
    return collectUpcomingDeadlines(subjects, today)
  }, [vehicles, items, today])

  useEffect(() => {
    if (upcoming.length === 0) { setDismissed(true); return }
    try { setDismissed(localStorage.getItem(STORAGE_KEY) === today) }
    catch { setDismissed(false) }
  }, [upcoming.length, today])

  useModalScrollLock(!dismissed && upcoming.length > 0)

  const close = (goToVehicles) => {
    setClosing(true)
    setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, today) } catch {}
      setClosing(false)
      setDismissed(true)
      if (goToVehicles) navigate('/vehicles')
    }, 150)
  }

  useEffect(() => {
    if (dismissed || upcoming.length === 0) return
    const onKey = e => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, upcoming.length])

  if (dismissed || upcoming.length === 0) return null

  return (
    <div
      onClick={() => close(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: closing ? 'dlNotifFadeOut 0.15s ease forwards' : 'dlNotifFadeIn 0.15s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ background: '#fff', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'dlNotifPopOut 0.15s ease forwards' : 'dlNotifPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(216,56,63,0.12)', color: 'var(--accent)' }}>
          <Warn size={22} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {t('deadlines.reminderTitle')}
          {upcoming.length > 1 && (
            <span style={{ background: '#f3f4f6', borderRadius: 10, padding: '1px 8px', fontSize: 13, fontWeight: 700, color: '#6b7280' }}>{upcoming.length}</span>
          )}
        </h3>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{t('deadlines.reminderDesc')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, marginBottom: 20, textAlign: 'left', maxHeight: 280, overflowY: 'auto' }}>
          {upcoming.map((d, i) => (
            <div key={i} style={{ background: d.overdue ? 'rgba(216,56,63,0.07)' : '#f9fafb', border: d.overdue ? '1px solid rgba(216,56,63,0.25)' : '1px solid transparent', borderRadius: 12, padding: '11px 14px' }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{d.label} — {d.subjectName}</p>
              <p style={{ fontSize: 12.5, color: d.overdue ? 'var(--red)' : '#6b7280', marginTop: 2, fontWeight: d.overdue ? 700 : 400 }}>
                {d.overdue
                  ? t('deadlines.overdueSince', { date: formatDate(d.date + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language) })
                  : t('deadlines.dueOn', { date: formatDate(d.date + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language) })}
              </p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => close(false)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer' }}>
            {t('deadlines.reminderClose')}
          </button>
          <button onClick={() => close(true)} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {t('deadlines.reminderGoToVehicles')}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes dlNotifFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes dlNotifFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes dlNotifPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes dlNotifPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
      `}</style>
    </div>
  )
}
