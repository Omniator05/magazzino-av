import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Warn, Pin } from './Icon'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

const SEEN_KEY = 'rental_ended_reminder_seen'

// Popup "noleggi da chiudere" — rent/install la cui data di fine è passata,
// che siano già stati scaricati o no (è lo stesso criterio "da scaricare"
// arancione di Events.jsx: qui l'urgenza non è "c'è ancora roba fuori" ma
// "va chiuso", facile da dimenticare perché la sezione Installazioni è
// collassata di default e un rent scaduto resta lì senza saltare
// all'occhio). Una volta al giorno per dispositivo, come
// TodayReminderModal/DeadlineReminderModal — niente da "segnare letto" per
// sempre, deve poter ripresentarsi finché qualcuno non chiude il noleggio.
// Solo admin (Dashboard.jsx): chiudere un noleggio si fa da EventDetail.jsx
// o da Events.jsx, pagine che i magazzinieri non hanno.
export default function RentalEndedReminderModal({ events, today, navigate }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  useModalScrollLock(open)

  const expiredRents = events.filter(e => e.type === 'installation' && !e.archived && e.dateEnd && e.dateEnd < today)

  useEffect(() => {
    if (events.length === 0) return
    if (localStorage.getItem(SEEN_KEY) === today) return
    if (expiredRents.length === 0) return
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, today])

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, today) } catch {}
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 150)
  }
  const openEvent = id => { close(); navigate(`/events/${id}`) }

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const rowStyle = { width:'100%', background:'transparent', border:'none', font:'inherit', color:'inherit', display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid var(--border)', cursor:'pointer', textAlign:'left' }

  return (
    <div onClick={close} className="rer-overlay"
      style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: closing ? 'rerFadeOut 0.15s ease forwards' : 'rerFadeIn 0.15s ease' }}
    >
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="rer-dialog"
        style={{ background:'var(--card)', borderRadius:24, padding:'26px 22px 22px', width:'100%', maxWidth:380, maxHeight:'82dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'rerPopOut 0.15s ease forwards' : 'rerPopIn 0.24s cubic-bezier(0.32,0.72,0,1)', position:'relative' }}
      >
        <button onClick={close} aria-label={t('common.close')} style={{ position:'absolute', top:16, right:16, width:28, height:28, borderRadius:'50%', background:'var(--card2)', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✕</button>

        <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(234,88,12,0.12)', color:'#ea580c' }}>
          <Warn size={22} />
        </div>
        <h3 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 4px', letterSpacing:'-0.3px', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          {t('rentalEndedReminder.title')}
          {expiredRents.length > 1 && (
            <span style={{ background:'#fed7aa', borderRadius:10, padding:'1px 8px', fontSize:13, fontWeight:700, color:'#9a3412' }}>{expiredRents.length}</span>
          )}
        </h3>
        <p style={{ color:'var(--text2)', fontSize:13, textAlign:'center', margin:'0 0 16px' }}>{t('rentalEndedReminder.desc')}</p>

        <div style={{ textAlign:'left' }}>
          {expiredRents.map(inst => (
            <button type="button" key={inst.id} className="btn-no-anim" onClick={() => openEvent(inst.id)}
              aria-label={t('events.openEventAria', { name: inst.name })} style={rowStyle}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                  <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inst.name}</p>
                  <span style={{ background:'#ede9fe', color:'#5b4fcf', borderRadius:6, padding:'1px 6px', fontSize:9.5, fontWeight:800, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em' }}>{t('events.installLabel')}</span>
                </div>
                {inst.location && <p style={{ fontSize:11.5, color:'var(--text2)', marginTop:1, display:'flex', alignItems:'center', gap:3 }}><Pin size={11} /> {inst.location}</p>}
              </div>
            </button>
          ))}
        </div>

        <button onClick={close} className="btn btn-primary btn-full" style={{ marginTop:18 }}>{t('rentalEndedReminder.dismiss')}</button>

        <style>{`
          @keyframes rerFadeIn  { from { opacity:0 } to { opacity:1 } }
          @keyframes rerFadeOut { from { opacity:1 } to { opacity:0 } }
          @keyframes rerPopIn   { from { opacity:0; transform:scale(0.94) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
          @keyframes rerPopOut  { from { opacity:1; transform:scale(1) } to { opacity:0; transform:scale(0.96) } }
          @media (prefers-reduced-motion: reduce) {
            .rer-overlay, .rer-dialog { animation: none !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
