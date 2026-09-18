import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../utils/formatDate'
import { Calendar, Pin } from './Icon'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

const SEEN_KEY = 'today_reminder_seen'

// Popup "cosa c'è da preparare oggi" — mostrato una volta al giorno per
// dispositivo, sia per gli admin (Dashboard.jsx) sia per i magazzinieri
// (WorkerHome.jsx), con gli stessi dati (`events`) che ciascuna pagina ha
// già in memoria: nessuna query in più. Nato dal fatto che gli eventi rent/
// install, vivendo in una sezione a parte e collassata di default, sono
// facili da dimenticare — questo raccoglie in un solo posto sia gli eventi
// normali sia i rent/install che iniziano proprio oggi.
export default function TodayReminderModal({ events, today, navigate }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  useModalScrollLock(open)

  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
  const todayEvents = events.filter(e => e.type !== 'installation' && e.date <= today && effectiveEndDate(e) >= today)
  const todayRents = events.filter(e => e.type === 'installation' && e.date === today)

  useEffect(() => {
    if (events.length === 0) return // dati non ancora arrivati — niente da valutare
    if (localStorage.getItem(SEEN_KEY) === today) return
    if (todayEvents.length === 0 && todayRents.length === 0) return
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

  const sectionLabel = { fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }
  const rowStyle = { width:'100%', background:'transparent', border:'none', font:'inherit', color:'inherit', display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid var(--border)', cursor:'pointer', textAlign:'left' }

  return (
    <div onClick={close} className="tr-overlay"
      style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: closing ? 'trFadeOut 0.15s ease forwards' : 'trFadeIn 0.15s ease' }}
    >
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="tr-dialog"
        style={{ background:'var(--card)', borderRadius:24, padding:'26px 22px 22px', width:'100%', maxWidth:380, maxHeight:'82dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'trPopOut 0.15s ease forwards' : 'trPopIn 0.24s cubic-bezier(0.32,0.72,0,1)', position:'relative' }}
      >
        <button onClick={close} aria-label={t('common.close')} style={{ position:'absolute', top:16, right:16, width:28, height:28, borderRadius:'50%', background:'var(--card2)', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✕</button>

        <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(230,57,70,0.10)', color:'var(--accent)' }}>
          <Calendar size={24} />
        </div>
        <h3 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 4px', letterSpacing:'-0.3px', textAlign:'center' }}>{t('todayReminder.title')}</h3>
        <p style={{ color:'var(--text2)', fontSize:13, textAlign:'center', margin:'0 0 20px', textTransform:'capitalize' }}>
          {formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' }, i18n.language)}
        </p>

        {todayEvents.length > 0 && (
          <div style={{ textAlign:'left', marginBottom: todayRents.length > 0 ? 18 : 0 }}>
            <p style={sectionLabel}>{t('todayReminder.events', { count: todayEvents.length })}</p>
            {todayEvents.map(ev => (
              <button type="button" key={ev.id} className="btn-no-anim" onClick={() => openEvent(ev.id)}
                aria-label={t('events.openEventAria', { name: ev.name })} style={rowStyle}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</p>
                  {ev.location && <p style={{ fontSize:11.5, color:'var(--text2)', marginTop:1, display:'flex', alignItems:'center', gap:3 }}><Pin size={11} /> {ev.location}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {todayRents.length > 0 && (
          <div style={{ textAlign:'left' }}>
            <p style={{ ...sectionLabel, color:'#5b4fcf' }}>{t('todayReminder.rents', { count: todayRents.length })}</p>
            {todayRents.map(inst => (
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
        )}

        <button onClick={close} className="btn btn-primary btn-full" style={{ marginTop:18 }}>{t('todayReminder.dismiss')}</button>

        <style>{`
          @keyframes trFadeIn  { from { opacity:0 } to { opacity:1 } }
          @keyframes trFadeOut { from { opacity:1 } to { opacity:0 } }
          @keyframes trPopIn   { from { opacity:0; transform:scale(0.94) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
          @keyframes trPopOut  { from { opacity:1; transform:scale(1) } to { opacity:0; transform:scale(0.96) } }
          @media (prefers-reduced-motion: reduce) {
            .tr-overlay, .tr-dialog { animation: none !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
