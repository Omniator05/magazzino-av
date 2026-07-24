import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore'
import DateBadge from '../components/DateBadge'
import LogoutButton from '../components/LogoutButton'
import { Pin } from '../components/Icon'
import { formatDate } from '../utils/formatDate'
import Profile from './Profile'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

const RECAP_SEEN_KEY = 'weeklyRecapSeenWeek'
const RECAP_TASK_DOT = { alta:'#f87171', media:'#f5a623', bassa:'#34d399' }

// Lunedì e domenica della settimana di `d`, come stringhe YYYY-MM-DD
function getWeekRange(d) {
  const day = (d.getDay() + 6) % 7 // 0 = lunedì .. 6 = domenica
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const toStr = x => x.toISOString().split('T')[0]
  return { monday: toStr(monday), sunday: toStr(sunday) }
}

const greetingKey = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'dashboard.greeting_night'
  if (h < 12) return 'dashboard.greeting_morning'
  if (h < 18) return 'dashboard.greeting_afternoon'
  return 'dashboard.greeting_evening'
}

/* ── Inline SVG icons (no emoji, no icon libs) ──────────────── */
const IconCamera = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)
const IconCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
)
const IconTemplate = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M9 21V9"/>
  </svg>
)
const IconChevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="16" r="1" fill="white"/>
  </svg>
)
const IconCart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
)
const IconClipboard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>
  </svg>
)
const IconTruck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8Z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)

export default function Dashboard({ toggleTheme, theme }) {
  const { t, i18n } = useTranslation()
  const { profile, logout, teamId, showOverlay } = useAuth()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)
  const [items, setItems]   = useState([])
  const [tasks, setTasks]   = useState([])
  const [events, setEvents] = useState([])
  const [weather, setWeather] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weatherCache')) } catch { return null }
  })
  const [showRecapBanner, setShowRecapBanner] = useState(false)
  const [showRecapModal, setShowRecapModal] = useState(false)
  const [recapClosing, setRecapClosing] = useState(false)
  const [recapWeek, setRecapWeek] = useState(null)
  const [recapAbsences, setRecapAbsences] = useState([])
  const [recapWorkers, setRecapWorkers] = useState([])
  useModalScrollLock(showRecapModal || showRecapBanner)

  useEffect(() => {
    if (!teamId) return
    const u1 = onSnapshot(query(collection(db, 'items'),  where('teamId','==',teamId), orderBy('name')),  s => setItems(s.docs.map(d => ({ id:d.id,...d.data() }))))
    const u2 = onSnapshot(query(collection(db, 'events'), where('teamId','==',teamId), orderBy('date')),  s => setEvents(s.docs.map(d => ({ id:d.id,...d.data() }))))
    const u3 = onSnapshot(query(collection(db, 'tasks'),  where('teamId','==',teamId)),                   s => setTasks(s.docs.map(d => ({ id:d.id,...d.data() }))))
    return () => { u1(); u2(); u3() }
  }, [teamId])

  // Resoconto settimanale: solo il lunedì, una volta a settimana (per dispositivo).
  // Aspetta che l'overlay di login/caricamento sia sparito, altrimenti il popup
  // spunterebbe sopra l'animazione invece che dopo.
  useEffect(() => {
    if (!teamId || showOverlay) return
    if (new Date().getDay() !== 1) return
    const { monday, sunday } = getWeekRange(new Date())
    if (localStorage.getItem(RECAP_SEEN_KEY) === monday) return
    setRecapWeek({ monday, sunday })
    setShowRecapBanner(true)
    Promise.all([
      getDocs(query(collection(db, 'unavailability'), where('teamId', '==', teamId))),
      getDocs(query(collection(db, 'profiles'), where('teamId', '==', teamId))),
    ]).then(([unavailSnap, profilesSnap]) => {
      setRecapAbsences(unavailSnap.docs.map(d => ({ id:d.id, ...d.data() })))
      setRecapWorkers(profilesSnap.docs.map(d => ({ id:d.id, ...d.data() })))
    }).catch(() => {})
  }, [teamId, showOverlay])

  const skipRecap = () => {
    if (recapWeek) localStorage.setItem(RECAP_SEEN_KEY, recapWeek.monday)
    setShowRecapBanner(false)
  }
  const openRecap = () => {
    if (recapWeek) localStorage.setItem(RECAP_SEEN_KEY, recapWeek.monday)
    setShowRecapBanner(false)
    setShowRecapModal(true)
  }
  const closeRecap = () => {
    setRecapClosing(true)
    setTimeout(() => { setShowRecapModal(false); setRecapClosing(false) }, 150)
  }

  useEffect(() => {
    if (!showRecapBanner) return
    const onKey = e => { if (e.key === 'Escape') skipRecap() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRecapBanner])

  useEffect(() => {
    if (!showRecapModal) return
    const onKey = e => { if (e.key === 'Escape') closeRecap() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRecapModal])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=46.4983&longitude=11.3548&current=weather_code,temperature_2m&timezone=Europe/Rome')
      .then(r => r.json())
      .then(d => {
        const w = { code: d.current.weather_code, temp: Math.round(d.current.temperature_2m) }
        setWeather(w)
        localStorage.setItem('weatherCache', JSON.stringify(w))
      })
      .catch(() => {})
  }, [])

  const today        = new Date().toISOString().split('T')[0]
  const name         = profile?.name?.split(' ')[0] || profile?.username || 'Admin'
  const brokenItems  = items.filter(i => (i.brokenQty || 0) > 0)
  const totalBroken  = brokenItems.reduce((sum, i) => sum + (i.brokenQty || 0), 0)
  const reorderItems = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock)
  const openTasks    = tasks.filter(t => !t.done)
  const upcoming     = events.filter(e => e.date >= today).slice(0, 3)

  const weekEvents = recapWeek
    ? events.filter(e => e.date && e.date <= recapWeek.sunday && (e.dateEnd || e.date) >= recapWeek.monday)
    : []
  const weekAbsences = recapWeek
    ? recapAbsences
        .filter(u => u.startDate <= recapWeek.sunday && u.endDate >= recapWeek.monday)
        .map(u => ({ ...u, workerName: recapWorkers.find(w => w.id === u.workerId)?.name || t('common.unknown') }))
    : []
  const recapSectionLabel = { fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }

  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' }, i18n.language)

  /* Tool cards config — icone monocromatiche, un solo colore per tutte le tile */
  const tools = [
    {
      label: t('dashboard.tools.scanner'),
      icon:  <IconCamera />,
      path:  '/scanner',
      badge: null,
    },
    {
      label: t('dashboard.tools.tasks'),
      icon:  <IconCheck />,
      path:  '/tasks',
      badge: openTasks.length > 0 ? openTasks.length : null,
    },
    {
      label: t('dashboard.tools.templates'),
      icon:  <IconTemplate />,
      path:  '/templates',
      badge: null,
    },
    {
      label: t('dashboard.tools.vehicles'),
      icon:  <IconTruck />,
      path:  '/vehicles',
      badge: null,
    },
  ]

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
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:110 }}>

      {/* ── Header hero (card) ──────────────────────────────── */}
      <div style={{ position:'relative', overflow:'hidden', background:_bg, margin:'calc(env(safe-area-inset-top) + 24px) 16px 20px', padding:'26px 22px', borderRadius:26, boxShadow:'0 12px 32px rgba(34,44,66,0.26)' }}>
        {/* Orb decorativi */}
        <div style={{ position:'absolute', top:'-55%', right:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 65%)', animation:'dashOrb1 14s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-70%', left:'-5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,0,0,0.2) 0%, transparent 65%)', animation:'dashOrb2 18s ease-in-out infinite', pointerEvents:'none' }} />

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

        {/* Stelle (notte, solo cielo sereno/parziale) */}
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
            background:'white', animation:`dashStarTwinkle ${s.dur} ease-in-out infinite ${s.d}` }} />
        ))}

        {/* Nuvole (giorno o coperto) */}
        {(_isDay || _wCond === 'overcast') && _wCond !== 'rain' && _wCond !== 'storm' && _wCond !== 'snow' && _wCond !== 'fog' && [
          { l:'-18%', t:'20%', w:150, h:44, op:0.09, dur:'70s', d:'0s' },
          { l:'40%',  t:'55%', w:120, h:36, op:0.07, dur:'85s', d:'-30s' },
          { l:'68%',  t:'6%',  w:96,  h:32, op:0.08, dur:'62s', d:'-16s' },
        ].map((c,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:c.l, top:c.t, width:c.w, height:c.h, borderRadius:'50%',
            background:'white', opacity: Math.min(c.op * _cloudOpMult, 0.32), filter:'blur(9px)',
            animation:`dashCloudDrift ${c.dur} linear infinite ${c.d}` }} />
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
            animation:`dashCloudDrift ${c.dur} linear infinite ${c.d}` }} />
        ))}

        {/* Pioggia — px assoluti per coprire tutto l'header */}
        {(_wCond === 'rain' || _wCond === 'storm') && Array.from({length:18}, (_,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:1,
            left:`${(i*5.8+1)%100}%`, top:0,
            width:1, height: 5+(i%3), borderRadius:1,
            background:`rgba(180,215,255,${0.4+((i%3)*0.1)})`,
            animation:`dashRainFall ${(0.45+(i%5)*0.06).toFixed(2)}s linear infinite -${(i*0.04).toFixed(2)}s` }} />
        ))}

        {/* Fulmini */}
        {(_wCond === 'rain' || _wCond === 'storm') && <>
          <div style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none', borderRadius:'inherit',
            background:'linear-gradient(95deg, rgba(200,225,255,0.5) 0%, transparent 65%)',
            animation:'dashLightning 15s ease-out infinite 0s', opacity:0 }}>
            <svg viewBox="0 0 30 90" width="13" height="58" style={{ position:'absolute', left:'11%', top:0 }}
              fill="none" stroke="rgba(255,255,250,0.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22,0 9,34 17,34 4,90" />
            </svg>
          </div>
          <div style={{ position:'absolute', inset:0, zIndex:2, pointerEvents:'none', borderRadius:'inherit',
            background:'linear-gradient(265deg, rgba(200,225,255,0.5) 0%, transparent 65%)',
            animation:'dashLightning 21s ease-out infinite -8s', opacity:0 }}>
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
            animation:`dashSnowFall ${(2.2+(i%4)*0.5).toFixed(2)}s linear infinite -${(i*0.22).toFixed(2)}s` }} />
        ))}

        {/* Nebbia */}
        {_wCond === 'fog' && (
          <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
            background:'rgba(200,210,230,0.22)', borderRadius:'inherit' }} />
        )}

        {/* Riga principale */}
        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:15, flex:1, minWidth:0 }}>
            <button onClick={() => setShowProfile(true)} style={{ flexShrink:0, width:58, height:58, borderRadius:18, background:'rgba(255,255,255,0.16)', border:'1px solid rgba(255,255,255,0.28)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: profile?.avatar ? 30 : 25, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
              {profile?.avatar || name.charAt(0).toUpperCase()}
            </button>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.78)', fontWeight:600, letterSpacing:'0.04em', marginBottom:2 }}>{t(greetingKey())}</p>
              <h1 style={{ fontSize:28, fontWeight:800, color:'white', lineHeight:1.08, letterSpacing:'-0.5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</h1>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.72)', fontWeight:500, marginTop:4, textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}{weather ? ` · ${weather.temp}°C` : ''}</p>
            </div>
          </div>
          <LogoutButton name={name} style={{
            flexShrink:0,
            background:'rgba(255,255,255,0.16)',
            border:'1px solid rgba(255,255,255,0.3)',
            color:'white',
            borderRadius:12,
            padding:'9px 16px',
            fontSize:13,
            fontWeight:700,
            cursor:'pointer',
          }} />
        </div>
      </div>

      <div style={{ padding:'0 16px' }}>

        {/* ── Strumenti ───────────────────────── */}
        {/* Renderizzata subito, PRIMA dei banner qui sotto: i banner dipendono
            da `items` (caricato in modo asincrono da Firestore) e comparendo
            in ritardo spostano verso il basso tutto ciò che sta sotto — se il
            tap su una tile capita proprio in quel momento, il primo tocco
            "sparisce" perché il bottone non è più sotto il dito. Tenendo la
            griglia sopra, la sua posizione è stabile fin dal primo render. */}
        <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1.2px', color:'var(--dash-muted)', marginBottom:12 }}>
          {t('dashboard.toolsSection')}
        </p>
        <div className="dash-tools-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:10, marginBottom:20 }}>
          {tools.map(tool => (
            <button
              key={tool.path}
              className="dash-tool-tile"
              onClick={() => navigate(tool.path)}
              style={{
                position:'relative',
                background: 'var(--card3)',
                border:'1px solid var(--dash-pill-border)',
                borderRadius:20,
                padding:'20px 8px 16px',
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                gap:10,
              }}
            >
              {tool.badge !== null && (
                <span style={{
                  position:'absolute', top:-9, right:-9,
                  minWidth:28, height:28, padding:'0 7px',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background:'var(--accent)', color:'white',
                  borderRadius:14,
                  fontSize:13, fontWeight:800, boxShadow:'0 2px 5px rgba(0,0,0,0.3)',
                }}>{tool.badge}</span>
              )}
              <span style={{ color: 'var(--dash-title)' }}>{tool.icon}</span>
              <span style={{ fontSize:13, fontWeight:700, color: 'var(--dash-title)' }}>{tool.label}</span>
            </button>
          ))}
        </div>

        {/* ── Alert: oggetti rotti ─────────────── */}
        {brokenItems.length > 0 && (
          <div style={{
            background:'#fff1f2',
            borderRadius:16,
            padding:'13px 16px',
            display:'flex',
            justifyContent:'space-between',
            alignItems:'center',
            marginBottom:10,
            border:'1px solid #fecdd3',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ color:'#e11d48', flexShrink:0 }}><IconAlert /></span>
              <p style={{ fontSize:14, fontWeight:700, color:'#9f1239' }}>
                {t('dashboard.brokenAlert', { count: totalBroken })}
              </p>
            </div>
            <button onClick={() => navigate('/inventory', { state: { filter: 'broken' } })} className="btn-no-anim" style={{
              background:'transparent', color:'#e11d48', fontSize:13, fontWeight:700,
              display:'flex', alignItems:'center', gap:2,
            }}>
              {t('dashboard.view')} <IconChevron />
            </button>
          </div>
        )}

        {/* ── Alert: consumabili da riordinare ── */}
        {reorderItems.length > 0 && (
          <div style={{
            background:'#eff6ff',
            borderRadius:16,
            padding:'13px 16px',
            display:'flex',
            justifyContent:'space-between',
            alignItems:'center',
            marginBottom:10,
            border:'1px solid #bfdbfe',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ color:'#1d6fce', flexShrink:0 }}><IconCart /></span>
              <p style={{ fontSize:14, fontWeight:700, color:'#1e3a5f' }}>
                {reorderItems.length === 1
                  ? t('dashboard.reorderSingle', { name: reorderItems[0].name })
                  : t('dashboard.reorderMultiple', { count: reorderItems.length })}
              </p>
            </div>
            <button onClick={() => navigate('/inventory', { state:{ filter:'reorder' } })} className="btn-no-anim" style={{
              background:'transparent', color:'#1d6fce', fontSize:13, fontWeight:700,
              display:'flex', alignItems:'center', gap:2,
            }}>
              {t('dashboard.view')} <IconChevron />
            </button>
          </div>
        )}

        {/* ── Prossimi eventi ──────────────────── */}
        {upcoming.length > 0 && (
          <>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1.2px', color:'var(--dash-muted)', marginBottom:14 }}>
              {t('dashboard.upcomingEvents')}
            </p>

            {upcoming.map(ev => {
              const isToday = ev.date === today
              const iconGradient = isToday
                ? 'linear-gradient(135deg,#dc2626,#9333ea)'
                : 'linear-gradient(135deg,#9ca3af,#6b7280)'
              const cardBorder = isToday ? '1.5px solid #fca5a5' : '1.5px solid var(--dash-card-border)'
              const dateLabel = ev.date
                ? formatDate(ev.date+'T12:00:00', {weekday:'long',day:'numeric',month:'long'}, i18n.language)
                : ''
              const dateEndLabel = ev.dateEnd && ev.dateEnd !== ev.date
                ? ' — ' + formatDate(ev.dateEnd+'T12:00:00', {day:'numeric',month:'long'}, i18n.language)
                : ''

              return (
                <div
                  key={ev.id}
                  onClick={() => navigate(`/events/${ev.id}`)}
                  className={isToday ? 'evt-card evt-today' : 'evt-card evt-soft'}
                  style={{ marginBottom:10, background:'var(--dash-card)', border: isToday ? '1.5px solid transparent' : cardBorder, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 14px 10px 10px', gap:12, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', transition:'transform 0.18s ease,box-shadow 0.18s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)' }}
                >
                  {/* Icona gradiente con data */}
                  <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
                    <div style={{ width:52, height:52, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
                      <span style={{ fontSize:20, fontWeight:800 }}>{ev.date ? new Date(ev.date+'T12:00:00').getDate() : '?'}</span>
                      <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
                        {ev.date ? formatDate(ev.date+'T12:00:00', {month:'short'}, i18n.language) : ''}
                      </span>
                    </div>
                    {ev.seriesId && (
                      <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--dash-card)' }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Testo */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:15, color:'var(--dash-title)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{ev.name}</p>
                    </div>
                    <p style={{ fontSize:12, fontWeight:500, color:'var(--dash-muted)' }}>{dateLabel}{dateEndLabel}</p>
                    {ev.location && <p style={{ fontSize:11, color:'var(--dash-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
                  </div>
                </div>
              )
            })}

            <button
              onClick={() => navigate('/events')}
              style={{
                width:'100%',
                padding:'13px',
                borderRadius:14,
                background:'var(--dash-pill-bg)',
                border:'1.5px solid var(--dash-pill-border)',
                color:'var(--dash-muted)',
                fontWeight:700,
                fontSize:13,
                marginTop:4,
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:4,
              }}
            >
              {t('dashboard.viewAllEvents')} <IconChevron />
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes dashOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,16px) scale(1.1)} }
        @keyframes dashOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(22px,-14px) scale(0.92)} }
        @keyframes dashStarTwinkle { 0%,100%{opacity:0.85;transform:scale(1)} 50%{opacity:0.15;transform:scale(0.5)} }
        @keyframes dashCloudDrift  { from{transform:translateX(0)} to{transform:translateX(130vw)} }
        @keyframes dashRainFall    { from{transform:translateY(-10px)} to{transform:translateY(180px)} }
        @keyframes dashSnowFall    { 0%{transform:translateY(-10px) translateX(0)} 50%{transform:translateY(90px) translateX(12px)} 100%{transform:translateY(190px) translateX(0)} }
        @keyframes dashLightning   { 0%,86%,100%{opacity:0} 88%{opacity:1} 89%{opacity:0} 91%{opacity:0.5} 92%{opacity:0} }

        /* ── Bordo gradiente rotante sulle card evento ── */
        @property --evtAngle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes evtSpin { to { --evtAngle: 360deg; } }

        .evt-card { position: relative; }
        /* Bordo nitido (anello sottile) */
        .evt-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 1.5px;
          pointer-events: none;
          z-index: 1;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
        }
        /* Glow tenue, aderente al bordo rotante */
        .evt-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          z-index: -1;
          filter: blur(3.5px);
          pointer-events: none;
        }
        .evt-today::before, .evt-today::after {
          background: conic-gradient(from var(--evtAngle),
            #dc2626, #f59e0b, #9333ea, #4f46e5, #06b6d4, #dc2626);
          animation: evtSpin 4s linear infinite;
        }
        .evt-today::after { opacity: 0.3; }
        .evt-soft::before, .evt-soft::after {
          background: conic-gradient(from var(--evtAngle),
            rgba(37,99,235,0.55), rgba(148,163,184,0.12), rgba(37,99,235,0.55));
          animation: evtSpin 10s linear infinite;
        }
        .evt-soft::after { opacity: 0.18; }

        @media (prefers-reduced-motion:reduce){
          [style*="dashOrb"]{animation:none!important}
          .evt-card::before, .evt-card::after { animation:none!important }
        }
      `}</style>

      {showProfile && <Profile onClose={() => setShowProfile(false)} />}

      {/* Popup avviso resoconto pronto — stesso stile del popup di conferma (logout ecc.) */}
      {showRecapBanner && (
        <div
          onClick={skipRecap}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation:'recapFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background:'#fff', borderRadius:24, padding:'26px 22px 20px', width:'100%', maxWidth:330, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation:'recapPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,132,199,0.12)', color:'#0284c7' }}>
              <IconClipboard />
            </div>
            <h3 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.3px' }}>{t('dashboard.weeklyRecapTitle')}</h3>
            <p style={{ fontSize:14, color:'#6b7280', margin:0, lineHeight:1.45 }}>{t('dashboard.weeklyRecapPrompt')}</p>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={skipRecap} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#f3f4f6', color:'#374151', border:'none', cursor:'pointer' }}>
                {t('dashboard.weeklyRecapSkip')}
              </button>
              <button onClick={openRecap} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#0284c7', color:'#fff', border:'none', cursor:'pointer' }}>
                {t('dashboard.weeklyRecapRead')}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes recapFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes recapPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
          `}</style>
        </div>
      )}

      {/* Popup resoconto settimanale — stesso stile del popup di conferma (logout ecc.) */}
      {showRecapModal && (
        <div
          onClick={closeRecap}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: recapClosing ? 'recapFadeOut 0.15s ease forwards' : 'recapFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background:'#fff', borderRadius:24, padding:'26px 22px 22px', width:'100%', maxWidth:380, maxHeight:'82dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: recapClosing ? 'recapPopOut 0.15s ease forwards' : 'recapPopIn 0.24s cubic-bezier(0.32,0.72,0,1)', position:'relative' }}
          >
            <button onClick={closeRecap} style={{ position:'absolute', top:16, right:16, width:28, height:28, borderRadius:'50%', background:'#f3f4f6', color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✕</button>

            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,132,199,0.12)', color:'#0284c7' }}>
              <IconClipboard />
            </div>
            <h3 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:'0 0 4px', letterSpacing:'-0.3px', textAlign:'center' }}>{t('dashboard.weeklyRecapTitle')}</h3>
            {recapWeek && (
              <p style={{ color:'#6b7280', fontSize:13, textAlign:'center', margin:'0 0 20px' }}>
                {formatDate(recapWeek.monday+'T12:00:00', { day:'numeric', month:'long' }, i18n.language)}
                {' — '}
                {formatDate(recapWeek.sunday+'T12:00:00', { day:'numeric', month:'long' }, i18n.language)}
              </p>
            )}

            <div style={{ textAlign:'left', marginBottom:18 }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapEvents', { count: weekEvents.length })}</p>
              {weekEvents.length === 0 ? (
                <p style={{ color:'#6b7280', fontSize:13 }}>{t('dashboard.weeklyRecapNoEvents')}</p>
              ) : (
                weekEvents.map(ev => (
                  <div key={ev.id} onClick={() => { setShowRecapModal(false); navigate(`/events/${ev.id}`) }}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid #f0f0f0', cursor:'pointer' }}>
                    <span style={{ fontSize:13.5, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</span>
                    <span style={{ fontSize:12, color:'#6b7280', flexShrink:0 }}>{formatDate(ev.date+'T12:00:00', { weekday:'short', day:'numeric' }, i18n.language)}</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ textAlign:'left', marginBottom:18 }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapAbsences')}</p>
              {weekAbsences.length === 0 ? (
                <p style={{ color:'#6b7280', fontSize:13 }}>{t('dashboard.weeklyRecapNoAbsences')}</p>
              ) : (
                weekAbsences.map(u => (
                  <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid #f0f0f0' }}>
                    <span style={{ fontSize:13.5, fontWeight:600, color:'#111827' }}>{u.workerName}</span>
                    <span style={{ fontSize:12, color:'#6b7280', flexShrink:0 }}>
                      {formatDate(u.startDate+'T12:00:00', { day:'numeric', month:'short' }, i18n.language)}
                      {u.endDate !== u.startDate ? ' — ' + formatDate(u.endDate+'T12:00:00', { day:'numeric', month:'short' }, i18n.language) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ textAlign:'left' }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapTasks', { count: openTasks.length })}</p>
              {openTasks.length === 0 ? (
                <p style={{ color:'#6b7280', fontSize:13 }}>{t('dashboard.weeklyRecapNoTasks')}</p>
              ) : (
                <>
                  {openTasks.slice(0, 5).map(task => (
                    <div key={task.id} onClick={() => { setShowRecapModal(false); navigate('/tasks') }}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderTop:'1px solid #f0f0f0', cursor:'pointer' }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: RECAP_TASK_DOT[task.priority] || RECAP_TASK_DOT.media }} />
                      <span style={{ fontSize:13.5, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</span>
                    </div>
                  ))}
                  {openTasks.length > 5 && (
                    <p onClick={() => { setShowRecapModal(false); navigate('/tasks') }} style={{ fontSize:12, fontWeight:700, color:'#0284c7', marginTop:8, cursor:'pointer' }}>
                      {t('common.moreCount', { count: openTasks.length - 5 })}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <style>{`
            @keyframes recapFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes recapFadeOut { from{opacity:1} to{opacity:0} }
            @keyframes recapPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
            @keyframes recapPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
          `}</style>
        </div>
      )}
    </div>
  )
}
