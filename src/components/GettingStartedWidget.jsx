import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

const IconBoxPlus = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
  </svg>
)
const IconCalendarPlus = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
  </svg>
)
const IconUsersPlus = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
  </svg>
)
const IconCheckDone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconChevronDown = ({ up }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition:'transform 0.2s', transform: up ? 'rotate(180deg)' : 'none' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const DISMISS_KEY_PREFIX = 'gettingStartedDismissed_'

// Widget flottante, piccolo e laterale (ispirato alla "Guida alla configurazione"
// di Stripe): riepiloga i primi passi per una squadra appena creata. A
// differenza della card piena larghezza di prima, sta fuori dal flusso della
// pagina — non sposta nient'altro — ed è sempre richiudibile: una X lo
// nasconde per sempre su questo dispositivo (localStorage), la freccia lo
// riduce solo alla barra del titolo senza perdere il progresso.
export default function GettingStartedWidget({ teamId, items, events, dataReady }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [workerCount, setWorkerCount] = useState(null) // null = ancora in caricamento
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!teamId) return
    try { setDismissed(localStorage.getItem(DISMISS_KEY_PREFIX + teamId) === 'true') } catch {}
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    // Un solo profilo (l'admin che l'ha creata) → squadra ancora non invitata.
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setWorkerCount(snap.size))
  }, [teamId])

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY_PREFIX + teamId, 'true') } catch {}
  }

  const steps = [
    { key:'item',  label: t('dashboard.gettingStartedItem'),  icon: <IconBoxPlus />,      path:'/inventory',    done: items.length > 0 },
    { key:'event', label: t('dashboard.gettingStartedEvent'), icon: <IconCalendarPlus />, path:'/events',       done: events.length > 0 },
    { key:'team',  label: t('dashboard.gettingStartedTeam'),  icon: <IconUsersPlus />,    path:'/admin/users',  done: (workerCount ?? 1) > 1 },
  ]
  const doneCount = steps.filter(s => s.done).length

  // Finché items/eventi/squadra non sono ancora arrivati da Firestore i
  // rispettivi step risultano "non fatti" per definizione (array vuoti,
  // workerCount null) — senza questo guard il widget lampeggia visibile per
  // uno o due frame anche per squadre che hanno già completato tutto.
  const shouldShow = !dismissed && dataReady && workerCount !== null && doneCount < steps.length

  // Il widget resta montato durante il fade out (chiusura manuale con la X,
  // o completamento automatico di tutti gli step) invece di sparire di
  // scatto: `entered` pilota l'opacità, e solo dopo la transizione lo si
  // smonta davvero.
  useEffect(() => {
    if (shouldShow) {
      setMounted(true)
      const id = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [shouldShow])

  if (!mounted) return null

  return (
    <div className="gsw-widget" style={{
      position:'fixed', zIndex:60,
      opacity: entered ? 1 : 0,
      transition: 'opacity 0.22s ease',
      pointerEvents: entered ? 'auto' : 'none',
      background:'var(--card)', borderRadius:18, border:'1px solid var(--border)',
      boxShadow:'0 10px 32px rgba(0,0,0,0.16)', overflow:'hidden',
    }}>
      <div style={{ padding:'13px 10px 13px 16px', display:'flex', alignItems:'center', gap:8 }}>
        <p style={{ flex:1, fontSize:13.5, fontWeight:800, color:'var(--dash-title)' }}>{t('dashboard.gettingStartedTitle')}</p>
        <span style={{ fontSize:11.5, fontWeight:700, color:'var(--dash-muted)', flexShrink:0 }}>{doneCount}/{steps.length}</span>
        <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t('dashboard.gettingStartedExpand') : t('dashboard.gettingStartedCollapse')}
          className="btn-no-anim" style={{ width:26, height:26, flexShrink:0, borderRadius:8, background:'var(--dash-pill-bg)', color:'var(--dash-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {/* aperto → freccia in giù, chiuso → freccia in su */}
          <IconChevronDown up={collapsed} />
        </button>
        <button onClick={dismiss} aria-label={t('common.close')} className="btn-no-anim"
          style={{ width:26, height:26, flexShrink:0, borderRadius:8, background:'var(--dash-pill-bg)', color:'var(--dash-muted)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
          ✕
        </button>
      </div>

      <div style={{ height:3, background:'var(--dash-pill-bg)' }}>
        <div style={{ height:'100%', width:`${(doneCount/steps.length)*100}%`, background:'var(--accent)', transition:'width 0.3s ease' }} />
      </div>

      {!collapsed && (
        <div style={{ padding:'4px 10px 8px' }}>
          {steps.map(step => (
            <button key={step.key} onClick={() => navigate(step.path)} className="btn-no-anim" style={{
              width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 6px',
              background:'transparent', textAlign:'left', borderRadius:10,
            }}>
              <span style={{
                width:20, height:20, borderRadius:'50%', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: step.done ? '#22c55e' : 'var(--dash-pill-bg)',
                border: step.done ? 'none' : '1.5px solid var(--dash-pill-border)',
                color: step.done ? 'white' : 'var(--dash-muted)',
              }}>
                {step.done ? <IconCheckDone /> : step.icon}
              </span>
              <span style={{
                flex:1, fontSize:13, fontWeight:600,
                color: step.done ? 'var(--dash-muted)' : 'var(--dash-title)',
                textDecoration: step.done ? 'line-through' : 'none',
              }}>{step.label}</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        /* Mobile: centrato e sollevato ben sopra la tab bar flottante (che sta
           a bottom: env()+44px, alta ~70px — senza margine il widget ci
           entrava dentro). Desktop: angolo in basso a sinistra, poco più
           grande, e la tab bar centrata non gli sta comunque tra i piedi. */
        .gsw-widget {
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(env(safe-area-inset-bottom) + 130px);
          width: 270px;
        }
        @media (min-width: 700px) {
          .gsw-widget {
            left: 20px;
            transform: none;
            bottom: calc(env(safe-area-inset-bottom) + 24px);
            width: 320px;
          }
        }
      `}</style>
    </div>
  )
}
