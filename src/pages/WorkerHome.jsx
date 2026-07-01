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
  const [weather, setWeather] = useState(null)
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=46.4983&longitude=11.3548&current=weather_code,temperature_2m&timezone=Europe/Rome')
      .then(r => r.json())
      .then(d => setWeather({ code: d.current.weather_code, temp: Math.round(d.current.temperature_2m) }))
      .catch(() => {})
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

  // Posizione corpo celeste basata sull'orario
  const _now = new Date()
  const _h = _now.getHours() + _now.getMinutes() / 60
  const _DAY_START = 6, _DAY_END = 20
  const _isDay = _h >= _DAY_START && _h < _DAY_END
  const _prog = _isDay
    ? (_h - _DAY_START) / (_DAY_END - _DAY_START)
    : (_h >= _DAY_END ? _h - _DAY_END : _h + (24 - _DAY_END)) / (24 - _DAY_END + _DAY_START)
  const _cx = 5 + _prog * 90
  const _cy = 82 - Math.sin(_prog * Math.PI) * 72

  const _bg = _h >= 5 && _h < 7   ? 'linear-gradient(135deg,#2a3560 0%,#18234a 100%)'
            : _h >= 7 && _h < 17  ? 'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)'
            : _h >= 17 && _h < 20 ? 'linear-gradient(135deg,#3a2f58 0%,#201730 100%)'
                                  : 'linear-gradient(135deg,#1a2240 0%,#0d1525 100%)'

  const _wc = weather?.code ?? -1
  const _wCond = _wc < 0 ? 'clear'
    : _wc <= 1  ? 'clear'
    : _wc === 2 ? 'partly'
    : _wc === 3 ? 'overcast'
    : _wc === 45 || _wc === 48 ? 'fog'
    : (_wc >= 71 && _wc <= 77) ? 'snow'
    : (_wc >= 51 && _wc <= 67) || (_wc >= 80 && _wc <= 82) ? 'rain'
    : _wc >= 95 ? 'storm'
    : 'clear'
  const _showCelestial = _wCond === 'clear' || _wCond === 'partly'
  const _cloudOpMult   = _wCond === 'overcast' ? 3 : _wCond === 'partly' ? 1.6 : 1

  return (
    <div className="page">
      {/* Header hero (card) */}
      <div style={{ position:'relative', overflow:'hidden', background:_bg, margin:'calc(env(safe-area-inset-top) + 24px) 16px 18px', padding:'26px 22px', borderRadius:26, boxShadow:'0 12px 32px rgba(34,44,66,0.26)' }}>
        {/* Orb decorativi */}
        <div style={{ position:'absolute', top:'-55%', right:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 65%)', animation:'whOrb1 14s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-70%', left:'-5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,0,0,0.18) 0%, transparent 65%)', animation:'whOrb2 18s ease-in-out infinite', pointerEvents:'none' }} />

        {/* Sole / Luna */}
        {_showCelestial && (
          <div style={{
            position:'absolute', pointerEvents:'none', zIndex:0,
            left:`${_cx}%`, top:`${_cy}%`, transform:'translate(-50%,-50%)',
            width: _isDay ? 100 : 72, height: _isDay ? 100 : 72, borderRadius:'50%',
            background: _isDay
              ? 'radial-gradient(circle, rgba(255,230,100,0.95) 0%, rgba(255,190,50,0.65) 45%, transparent 72%)'
              : 'radial-gradient(circle, rgba(210,220,255,0.90) 0%, rgba(170,190,245,0.55) 45%, transparent 72%)',
            filter:`blur(${_isDay ? 22 : 17}px)`,
          }} />
        )}

        {/* Stelle (notte, solo con cielo sereno/parziale) */}
        {!_isDay && _showCelestial && [
          { l:'8%',  t:'22%', s:2,   dur:'3.2s', d:'0s' },
          { l:'22%', t:'48%', s:1.5, dur:'4.6s', d:'-1.5s' },
          { l:'38%', t:'14%', s:2.5, dur:'2.9s', d:'-0.8s' },
          { l:'52%', t:'52%', s:1.5, dur:'5.1s', d:'-2s' },
          { l:'65%', t:'24%', s:2,   dur:'3.7s', d:'-3s' },
          { l:'78%', t:'56%', s:1.5, dur:'4.1s', d:'-1s' },
          { l:'88%', t:'18%', s:2,   dur:'3.4s', d:'-2.5s' },
          { l:'30%', t:'66%', s:1,   dur:'6s',   d:'-0.5s' },
        ].map((s,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:s.l, top:s.t, width:s.s, height:s.s, borderRadius:'50%',
            background:'white', animation:`whStarTwinkle ${s.dur} ease-in-out infinite ${s.d}` }} />
        ))}

        {/* Nuvole (giorno o coperto) */}
        {(_isDay || _wCond === 'overcast') && _wCond !== 'rain' && _wCond !== 'storm' && _wCond !== 'snow' && _wCond !== 'fog' && [
          { l:'-12%', t:'22%', w:88, h:26, op:0.09, dur:'28s', d:'0s' },
          { l:'35%',  t:'55%', w:68, h:20, op:0.07, dur:'40s', d:'-15s' },
          { l:'62%',  t:'8%',  w:54, h:18, op:0.08, dur:'33s', d:'-8s' },
        ].map((c,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:c.l, top:c.t, width:c.w, height:c.h, borderRadius:'50%',
            background:'white', opacity: Math.min(c.op * _cloudOpMult, 0.32), filter:'blur(9px)',
            animation:`whCloudDrift ${c.dur} linear infinite ${c.d}` }} />
        ))}

        {/* Nuvole pioggia/temporale */}
        {(_wCond === 'rain' || _wCond === 'storm') && [
          { l:'-8%',  t:'-30%', w:130, h:50, op:0.55, dur:'38s', d:'0s' },
          { l:'35%',  t:'-35%', w:110, h:44, op:0.45, dur:'50s', d:'-20s' },
          { l:'72%',  t:'-25%', w:95,  h:38, op:0.50, dur:'42s', d:'-11s' },
        ].map((c,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:c.l, top:c.t, width:c.w, height:c.h, borderRadius:'50%',
            background:'rgba(90,100,120,1)', opacity:c.op, filter:'blur(16px)',
            animation:`whCloudDrift ${c.dur} linear infinite ${c.d}` }} />
        ))}

        {/* Pioggia — px assoluti per coprire tutto l'header */}
        {(_wCond === 'rain' || _wCond === 'storm') && Array.from({length:18}, (_,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:1,
            left:`${(i*5.8+1)%100}%`, top:0,
            width:1, height: 5+(i%3), borderRadius:1,
            background:`rgba(180,215,255,${0.4+((i%3)*0.1)})`,
            animation:`whRainFall ${(0.45+(i%5)*0.06).toFixed(2)}s linear infinite -${(i*0.04).toFixed(2)}s` }} />
        ))}

        {/* Fulmini */}
        {(_wCond === 'rain' || _wCond === 'storm') && <>
          <div style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none', borderRadius:'inherit',
            background:'linear-gradient(95deg, rgba(200,225,255,0.5) 0%, transparent 65%)',
            animation:'whLightning 15s ease-out infinite 0s', opacity:0 }}>
            <svg viewBox="0 0 30 90" width="13" height="58" style={{ position:'absolute', left:'11%', top:0 }}
              fill="none" stroke="rgba(255,255,250,0.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22,0 9,34 17,34 4,90" />
            </svg>
          </div>
          <div style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none', borderRadius:'inherit',
            background:'linear-gradient(265deg, rgba(200,225,255,0.5) 0%, transparent 65%)',
            animation:'whLightning 21s ease-out infinite -8s', opacity:0 }}>
            <svg viewBox="0 0 30 90" width="11" height="52" style={{ position:'absolute', right:'13%', top:'6%' }}
              fill="none" stroke="rgba(255,255,250,0.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8,0 21,32 13,32 26,90" />
            </svg>
          </div>
        </>}

        {/* Neve */}
        {_wCond === 'snow' && Array.from({length:10}, (_,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:`${(i*10.5+3)%100}%`, top:'-8%',
            width: 3+(i%3), height: 3+(i%3), borderRadius:'50%',
            background:'rgba(255,255,255,0.85)', filter:'blur(1px)',
            animation:`whSnowFall ${(2.2+(i%4)*0.5).toFixed(2)}s linear infinite -${(i*0.22).toFixed(2)}s` }} />
        ))}

        {/* Nebbia */}
        {_wCond === 'fog' && (
          <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
            background:'rgba(200,210,230,0.22)', borderRadius:'inherit' }} />
        )}

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
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.72)', fontWeight:500, marginTop:4, textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}{weather ? ` · ${weather.temp}°C` : ''}</p>
            </div>
          </div>
          <LogoutButton name={displayName} style={{ flexShrink:0, background:'rgba(255,255,255,0.16)', border:'1px solid rgba(255,255,255,0.3)', color:'white', borderRadius:12, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }} />
        </div>
      </div>

      <style>{`
        @keyframes whOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,16px) scale(1.1)} }
        @keyframes whOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(22px,-14px) scale(0.92)} }
        @keyframes whStarTwinkle { 0%,100%{opacity:0.85;transform:scale(1)} 50%{opacity:0.15;transform:scale(0.5)} }
        @keyframes whCloudDrift  { from{transform:translateX(0)} to{transform:translateX(130vw)} }
        @keyframes whRainFall    { from{transform:translateY(-10px)} to{transform:translateY(180px)} }
        @keyframes whSnowFall    { 0%{transform:translateY(-10px) translateX(0)} 50%{transform:translateY(90px) translateX(12px)} 100%{transform:translateY(190px) translateX(0)} }
        @keyframes whLightning   { 0%,86%,100%{opacity:0} 88%{opacity:1} 89%{opacity:0} 91%{opacity:0.5} 92%{opacity:0} }

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
