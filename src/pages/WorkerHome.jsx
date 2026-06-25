import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import DateBadge from '../components/DateBadge'
import LogoutButton from '../components/LogoutButton'
import { Unload, Recurring, Pin, Box } from '../components/Icon'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'Buonanotte'
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

export default function WorkerHome() {
  const { profile, logout } = useAuth()
  const [events, setEvents] = useState([])
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
  }, [])

  const name = profile?.name?.split(' ')[0] || profile?.username || ''

  // Logica visibilità eventi per worker:
  // 1. "Da scaricare": data di FINE passata, qualcosa ancora caricato e non rientrato
  // 2. "Oggi": data di inizio = oggi
  // 3. "Prossimi": data di fine futura o oggi
  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date

  const daScaricare = events.filter(e => {
    if (e.seriesId) return false  // gli eventi ricorrenti sono gestiti nella sezione "Ricorrenti"
    if (effectiveEndDate(e) >= today) return false
    const items = e.items || []
    return items.length > 0 && items.some(i => i.loaded && !i.returned)
  })

  const isActive = e => {
    if (effectiveEndDate(e) >= today) return true
    const items = e.items || []
    return items.length > 0 && items.some(i => i.loaded && !i.returned)
  }

  // Ricorrenti (solo il prossimo per serie)
  const recurringMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringMap[ev.seriesId]) recurringMap[ev.seriesId] = []
      recurringMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringMap).map(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    return sorted.find(e => effectiveEndDate(e) >= today) || sorted[sorted.length - 1]
  })

  const singleEvents = events.filter(e => !e.seriesId)
  const upcomingSingle = singleEvents.filter(e => effectiveEndDate(e) >= today)

  const displayName = name || profile?.username || 'Magazziniere'
  const initial = displayName.charAt(0).toUpperCase()
  const todayLabel = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })

  return (
    <div className="page">
      {/* Header hero (card) */}
      <div style={{ position:'relative', overflow:'hidden', background:'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)', margin:'calc(env(safe-area-inset-top) + 24px) 16px 18px', padding:'26px 22px', borderRadius:26, boxShadow:'0 12px 32px rgba(34,44,66,0.26)' }}>
        {/* Orb decorativi */}
        <div style={{ position:'absolute', top:'-55%', right:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 65%)', animation:'whOrb1 14s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-70%', left:'-5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,0,0,0.18) 0%, transparent 65%)', animation:'whOrb2 18s ease-in-out infinite', pointerEvents:'none' }} />

        {/* Riga principale */}
        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:15, flex:1, minWidth:0 }}>
            {/* Avatar — tap → pagina profilo */}
            <button onClick={() => navigate('/profile')} style={{ flexShrink:0, width:58, height:58, borderRadius:18, background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: profile?.avatar ? 30 : 25, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
              {profile?.avatar || initial}
            </button>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.8)', fontWeight:600, letterSpacing:'0.04em', marginBottom:2 }}>{greeting()},</p>
              <h1 style={{ fontSize:28, fontWeight:800, color:'white', lineHeight:1.08, letterSpacing:'-0.5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</h1>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.72)', fontWeight:500, marginTop:4, textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}</p>
            </div>
          </div>
          <LogoutButton name={displayName} style={{ flexShrink:0, background:'rgba(255,255,255,0.16)', border:'1px solid rgba(255,255,255,0.3)', color:'white', borderRadius:12, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }} />
        </div>
      </div>

      <style>{`
        @keyframes whOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,16px) scale(1.1)} }
        @keyframes whOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(22px,-14px) scale(0.92)} }

        /* ── Bordo gradiente rotante + glow sulle card evento ── */
        @property --evtAngle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes evtSpin { to { --evtAngle: 360deg; } }

        .evt-card { position: relative; }
        .evt-card::before {
          content: ''; position: absolute; inset: 0; border-radius: 20px;
          padding: 1.5px; pointer-events: none; z-index: 1;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
        }
        .evt-card::after {
          content: ''; position: absolute; inset: 0; border-radius: 20px;
          z-index: -1; filter: blur(3.5px); pointer-events: none;
        }
        .evt-today::before, .evt-today::after {
          background: conic-gradient(from var(--evtAngle), #dc2626, #f59e0b, #9333ea, #4f46e5, #06b6d4, #dc2626);
          animation: evtSpin 4s linear infinite;
        }
        .evt-today::after { opacity: 0.3; }
        .evt-soft::before, .evt-soft::after {
          background: conic-gradient(from var(--evtAngle), rgba(37,99,235,0.55), rgba(148,163,184,0.12), rgba(37,99,235,0.55));
          animation: evtSpin 10s linear infinite;
        }
        .evt-soft::after { opacity: 0.18; }

        @media (prefers-reduced-motion:reduce){
          [style*="whOrb"]{animation:none!important}
          .evt-card::before, .evt-card::after { animation:none!important }
        }
      `}</style>

      <div style={{ padding:'16px 0' }}>

        {/* DA SCARICARE — in evidenza */}
        {daScaricare.length > 0 && (
          <div id="sec-dascaricare" style={{ margin:'0 0 8px', scrollMarginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px' }}>
              <p style={{ color:'#ea580c', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', display:'inline-flex', alignItems:'center', gap:6 }}><Unload size={15} /> Da scaricare</p>
              <div style={{ flex:1, height:1, background:'rgba(234,88,12,0.25)' }} />
            </div>
            {daScaricare.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} forceState="daScaricare" />)}
          </div>
        )}

        {events.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={46} /></p>
            <h3>Nessun evento</h3>
            <p>Non ci sono eventi in programma</p>
          </div>
        ) : (
          <>
            {/* Ricorrenti */}
            {pinnedRecurring.length > 0 && (
              <>
                <div id="sec-ricorrenti" style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px', marginTop:4, scrollMarginTop:16 }}>
                  <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', display:'inline-flex', alignItems:'center', gap:6 }}><Recurring size={15} /> Ricorrenti</p>
                  <div style={{ flex:1, height:1, background:'rgba(79,195,247,0.2)' }} />
                </div>
                {pinnedRecurring.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
                {upcomingSingle.length > 0 && <div style={{ height:1, background:'var(--border)', margin:'4px 16px 12px' }} />}
              </>
            )}

            {/* Prossimi singoli */}
            {upcomingSingle.length > 0 && (
              <div id="sec-prossimi" style={{ scrollMarginTop:16 }}>
                {pinnedRecurring.length > 0 && (
                  <p style={{ color:'var(--text2)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', padding:'0 16px 8px' }}>Prossimi</p>
                )}
                {upcomingSingle.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EventCard({ ev, today, navigate, forceState }) {
  const items    = ev.items || []
  const loaded   = items.filter(i => i.loaded).length
  const returned = items.filter(i => i.returned).length
  const total    = items.length
  const isToday  = ev.date === today
  const daScaricare = forceState === 'daScaricare'

  let phase = 'prep'
  if (total > 0 && returned === total)  phase = 'done'
  else if (total > 0 && loaded === total) phase = 'out'
  else if (total > 0 && loaded > 0)     phase = 'partial'
  else if (total > 0)                   phase = 'ready'

  const phaseInfo = {
    prep:    { color:'var(--text2)',   label:'Lista da preparare' },
    ready:   { color:'var(--blue)',    label:`${total} articoli da caricare` },
    partial: { color:'var(--accent2)', label:`${loaded}/${total} caricati` },
    out:     { color:'#ea580c',        label:`In evento · ${returned}/${total} rientrati` },
    done:    { color:'var(--green)',   label:'Tutto rientrato' },
  }[phase]

  const iconGradient = daScaricare
    ? '#fb8500'
    : ev.type === 'installation'
    ? '#a7c957'
    : (isToday || phase === 'partial' || phase === 'out')
    ? '#e63946'
    : '#a8dadc'

  const cardBorder = daScaricare ? 'rgba(234,88,12,0.4)' : isToday ? 'rgba(220,38,38,0.4)' : 'var(--border)'
  const dateStr = ev.date ? new Date(ev.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'}) : ''

  return (
    <div onClick={() => navigate(`/events/${ev.id}`)}
      className={isToday ? 'evt-card evt-today' : 'evt-card evt-soft'}
      style={{ margin:'0 16px 10px', background:'var(--card)', border: isToday ? '1.5px solid transparent' : `1.5px solid ${cardBorder}`, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 14px 10px 10px', gap:12, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'transform 0.18s ease,box-shadow 0.18s ease' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)' }}
    >
      {/* Icona gradiente con data */}
      <div style={{ position:'relative', width:50, height:50, flexShrink:0 }}>
        <div style={{ width:50, height:50, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
          <span style={{ fontSize:18, fontWeight:800 }}>{ev.date ? new Date(ev.date+'T12:00:00').getDate() : '?'}</span>
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
            {ev.date ? new Date(ev.date+'T12:00:00').toLocaleDateString('it-IT',{month:'short'}) : ''}
          </span>
        </div>
        {ev.seriesId && (
          <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--card)' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </span>
        )}
      </div>

      {/* Contenuto */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>
            {ev.name}
          </p>
        </div>
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
          {ev.date ? new Date(ev.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long', day:'numeric', month:'long'}) : ''}
          {ev.dateEnd && ev.dateEnd !== ev.date ? ' — ' + new Date(ev.dateEnd+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric', month:'long'}) : ''}
        </p>
        {ev.location && <p style={{ fontSize:11, color:'var(--text2)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
      </div>
    </div>
  )
}
