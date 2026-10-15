import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore'
import DateBadge from '../components/DateBadge'
import LogoutButton from '../components/LogoutButton'
import TutorialModal from '../components/TutorialModal'
import { Unload, Recurring, Pin, Box, Gear, Search, ChevronRight, Plus, User, List } from '../components/Icon'
import { formatDate, capitalize } from '../utils/formatDate'
import { isModuleEnabled } from '../utils/modules'
import DailyQuip from '../components/DailyQuip'
import Profile from './Profile'
import TodayReminderModal from '../components/TodayReminderModal'

const EVENT_CAP = 5

const greetingKey = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'workerHome.greeting_night'
  if (h < 12) return 'workerHome.greeting_morning'
  if (h < 18) return 'workerHome.greeting_afternoon'
  return 'workerHome.greeting_evening'
}

export default function WorkerHome() {
  const { t, i18n } = useTranslation()
  const { user, profile, logout, team, teamId, showOverlay } = useAuth()
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const [showProfile, setShowProfile] = useState(false)
  const [events, setEvents] = useState([])
  const [myBlocks, setMyBlocks] = useState([]) // le MIE assegnazioni di "Assegna personale" (attività libere incluse)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(EVENT_CAP)
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('workerhome_sections')
      return saved ? JSON.parse(saved) : { recurring: true, upcoming: true, installations: false }
    } catch { return { recurring: true, upcoming: true, installations: false } }
  })
  const toggle = section => setOpenSections(s => {
    const next = { ...s, [section]: !s[section] }
    try { sessionStorage.setItem('workerhome_sections', JSON.stringify(next)) } catch {}
    return next
  })
  const [weather, setWeather] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weatherCache')) } catch { return null }
  })
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    // isDeadlineReminder: promemoria scadenze auto-generati (vedi utils/deadlines.js)
    // — compaiono solo in Calendario, mai tra gli eventi del magazziniere.
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => !e.isDeadlineReminder))
    })
  }, [teamId])

  useEffect(() => {
    if (!teamId || !user?.uid) return
    return onSnapshot(
      query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId), where('workerId', '==', user.uid)),
      snap => setMyBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [teamId, user?.uid])

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

  const name = profile?.name?.split(' ')[0] || profile?.username || ''

  // Logica visibilità eventi per worker:
  // 1. "Da scaricare": data di FINE passata, qualcosa ancora caricato e non rientrato
  // 2. "Oggi": data di inizio = oggi
  // 3. "Prossimi": data di fine futura o oggi
  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date

  const daScaricare = events.filter(e => {
    if (e.seriesId) return false  // gli eventi ricorrenti sono gestiti nella sezione "Ricorrenti"
    if (e.type === 'installation') {
      // Un rent/install resta caricato/non rientrato DI PROPOSITO finché è
      // ancora attivo, anche a lungo — ma una volta SCADUTO (fine contratto
      // prevista passata) è la stessa identica urgenza di un evento
      // dimenticato: va scaricato/richiuso, quindi qui ci entra a pieno
      // titolo invece di restare invisibile nella sua sezione collassata.
      return !e.archived && e.dateEnd && e.dateEnd < today
    }
    if (effectiveEndDate(e) >= today) return false
    const items = e.items || []
    return items.length > 0 && items.some(i => i.loaded && !i.returned)
  }).sort((a, b) => (a.type === 'installation') === (b.type === 'installation') ? 0 : a.type === 'installation' ? -1 : 1)

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
  const pinnedRecurring = Object.values(recurringMap).flatMap(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    const nextFuture = sorted.find(e => effectiveEndDate(e) >= today)
    // Tutte le occorrenze passate con articoli ancora non rientrati — mai nascoste
    // solo perché esiste già una prossima occorrenza futura da mostrare
    const pastUnfinished = sorted.filter(e => {
      if (effectiveEndDate(e) >= today) return false
      const items = e.items || []
      return items.length > 0 && items.some(i => i.loaded && !i.returned)
    })
    const result = [...pastUnfinished]
    if (nextFuture) result.push(nextFuture)
    else if (result.length === 0) result.push(sorted[sorted.length - 1])
    return result
  })

  // Un evento di OGGI il cui carico è già rientrato per intero (prova che
  // sia stato davvero eseguito, non solo "niente ancora caricato") sparisce
  // subito da qui, senza aspettare la mezzanotte — vedi anche Archive.jsx.
  const isWrappedToday = e => {
    if (effectiveEndDate(e) !== today) return false
    const items = e.items || []
    return items.some(i => i.returned) && !items.some(i => i.loaded && !i.returned)
  }

  // Sezione "Oggi": gli eventi di oggi (anche quelli cominciati prima e
  // ancora in corso; un rent solo se parte oggi) e le fasi di
  // montaggio/smontaggio con data di OGGI — queste anche se l'evento vero è
  // la settimana dopo (o già passato): è proprio quel giorno che la lista di
  // carico va preparata/caricata per andare a montare. Chi è già in "Da
  // scaricare" ha la sua sezione (lì basta il badge della fase). Quello che
  // entra qui non si ripete nelle altre sezioni.
  const daScaricareIds = new Set(daScaricare.map(e => e.id))
  const happeningToday = e => (e.type !== 'installation' && e.date <= today && effectiveEndDate(e) >= today && !isWrappedToday(e))
    || (e.type === 'installation' && e.date === today)
  const todayList = events.filter(e => !e.archived && !daScaricareIds.has(e.id) && (happeningToday(e) || phaseKeysToday(e, today).length > 0))
    .sort((a, b) => (happeningToday(b) ? 1 : 0) - (happeningToday(a) ? 1 : 0))
  const todayIds = new Set(todayList.map(e => e.id))
  // Le MIE attività libere di oggi (senza evento): con orario e nota, e — se
  // l'admin ci ha collegato una lista di carico — un tocco porta a quella
  // lista. Un'attività a cavallo di mezzanotte compare anche il giorno dopo.
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const myTodayTasks = myBlocks
    .filter(b => !b.eventId && (b.date === today || (b.date === yesterday && b.endTime <= b.startTime)))
    .map(b => ({ block: b, cont: b.date !== today }))
    .sort((a, b) => (a.cont ? '00:00' : a.block.startTime).localeCompare(b.cont ? '00:00' : b.block.startTime))
  const recurringShown = pinnedRecurring.filter(e => !todayIds.has(e.id))

  // Rent/Install (ex "installazioni") vanno in una sezione propria — restano
  // aperte anche a lungo, non hanno senso mescolate agli eventi "normali"
  // nei Prossimi, stessa separazione già usata in Events.jsx (lato admin).
  // Promosso in cima se comincia oggi — stessa idea di Events.jsx lato
  // admin: un rent può avere data di inizio molto lontana e restare comunque
  // attivo, quindi il semplice ordine per data non basta a farlo notare.
  const installations = events
    // Uno scaduto è già in "Da scaricare" sopra — non va ripetuto anche qui.
    .filter(e => e.type === 'installation' && !e.archived && !(e.dateEnd && e.dateEnd < today) && !todayIds.has(e.id))
    .sort((a, b) => (a.date === today) === (b.date === today) ? 0 : a.date === today ? -1 : 1)
  const singleEvents = events.filter(e => !e.seriesId && e.type !== 'installation')
  const upcomingSingle = singleEvents.filter(e => effectiveEndDate(e) >= today && !isWrappedToday(e) && !todayIds.has(e.id))
  const visibleSingle = upcomingSingle.slice(0, visibleCount)
  const hiddenCount = upcomingSingle.length - visibleSingle.length

  const searchResults = search.trim()
    ? events.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  const displayName = name || profile?.username || t('workerHome.defaultName')
  const initial = displayName.charAt(0).toUpperCase()
  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' }, i18n.language)

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
            <button onClick={() => setShowProfile(true)} aria-label={t('workerHome.openSettings')} style={{ position:'relative', flexShrink:0, width:58, height:58, borderRadius:18, background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: profile?.avatar ? 30 : 25, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
              {profile?.avatar || initial}
              <span style={{ position:'absolute', bottom:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'var(--accent)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 6px rgba(0,0,0,0.35)' }}>
                <Gear size={12} />
              </span>
            </button>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.8)', fontWeight:600, letterSpacing:'0.04em', marginBottom:2 }}>{t(greetingKey())},</p>
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
        /* Evento assegnato a te (non oggi, altrimenti vince evt-today) —
           stesso bordo rotante soffuso ma in rosso, per distinguerlo a
           colpo d'occhio da uno non tuo senza dover leggere il badge. */
        .evt-mine::before, .evt-mine::after {
          background: conic-gradient(from var(--evtAngle), rgba(230,57,70,0.55), rgba(148,163,184,0.12), rgba(230,57,70,0.55));
          animation: evtSpin 10s linear infinite;
        }
        .evt-mine::after { opacity: 0.18; }

        @media (prefers-reduced-motion:reduce){
          [style*="whOrb"]{animation:none!important}
          .evt-card::before, .evt-card::after { animation:none!important }
        }
      `}</style>

      {/* Barra di ricerca — sempre visibile, stessa posizione/stile della
          pagina Eventi lato admin (Events.jsx), così le due viste si
          leggono come la stessa app invece di due layout diversi. */}
      <div style={{ padding:'0 16px 12px' }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <span style={{ position:'absolute', left:14, color:'var(--text3)', display:'flex' }}><Search size={16} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('events.searchPlaceholder')}
            aria-label={t('events.searchPlaceholder')}
            style={{ width:'100%', padding:'12px 14px 12px 40px', borderRadius:14, border:'1.5px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:14 }} />
        </div>
      </div>

      <div style={{ padding:'4px 0 16px' }}>
        {search.trim() ? (
          <>
            <p style={{ padding:'0 16px 12px', color:'var(--text2)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.resultsCount', { count: searchResults.length })}</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--text2)', textAlign:'center' }}>{t('events.noResultsFor', { search })}</p>
              : searchResults.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)
            }
          </>
        ) : (
        <>
        {/* DA SCARICARE — in evidenza, solo se il modulo liste di carico è attivo */}
        {loadListsOn && daScaricare.length > 0 && (
          <div id="sec-dascaricare" style={{ margin:'0 0 8px', scrollMarginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px' }}>
              <p style={{ color:'#ea580c', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', display:'inline-flex', alignItems:'center', gap:6 }}><Unload size={15} /> {t('workerHome.toUnload')}</p>
              <div style={{ flex:1, height:1, background:'rgba(234,88,12,0.25)' }} />
            </div>
            {daScaricare.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} forceState="daScaricare" loadListsOn={loadListsOn} />)}
          </div>
        )}

        {/* OGGI — eventi di oggi e montaggi/smontaggi di oggi (anche di
            eventi in un altro giorno): stessa evidenza rossa. */}
        {(todayList.length > 0 || myTodayTasks.length > 0) && (
          <div id="sec-today" style={{ margin:'0 0 8px', scrollMarginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px' }}>
              <p style={{ color:'var(--accent)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('workerHome.todoToday')}</p>
              <div style={{ flex:1, height:1, background:'rgba(230,57,70,0.25)' }} />
            </div>
            {myTodayTasks.map(({ block, cont }) => <TaskCard key={`${block.id}-${cont ? 'c' : 'o'}`} block={block} cont={cont} today={today} linkedEvent={block.linkedEventId ? events.find(e => e.id === block.linkedEventId) : null} navigate={navigate} />)}
            {todayList.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} forceState={happeningToday(ev) ? 'today' : 'phaseToday'} loadListsOn={loadListsOn} />)}
          </div>
        )}

        {/* "Niente da mostrare" va giudicato sulle sezioni che contano
            davvero (da scaricare/ricorrenti/prossimi/rent-install), non su
            events.length: una squadra con solo eventi passati o archiviati
            in events.length avrebbe superato questo controllo restando
            comunque a schermo vuoto, senza nessun placeholder — pagina
            "morta" senza motivo (stesso bug già corretto in Events.jsx). */}
        {(!loadListsOn || daScaricare.length === 0) && todayList.length === 0 && myTodayTasks.length === 0 && recurringShown.length === 0 && upcomingSingle.length === 0 && installations.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={46} /></p>
            <h3>{t('workerHome.emptyTitle')}</h3>
            <p>{t('workerHome.emptyDesc')}</p>
            <DailyQuip quips={t('workerHome.emptyQuips', { returnObjects:true })} />
          </div>
        ) : (
          <>
            {/* Ricorrenti — collassabile, come in Events.jsx */}
            {recurringShown.length > 0 && (
              <div id="sec-ricorrenti" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('recurring')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--blue)', display:'flex', transition:'transform 0.2s', transform: openSections.recurring ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'var(--blue)', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em', display:'inline-flex', alignItems:'center', gap:6 }}><Recurring size={13} /> {t('workerHome.recurring')}</span>
                  <span style={{ background:'rgba(79,195,247,0.15)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--blue)' }}>{recurringShown.length}</span>
                </button>
                {openSections.recurring && recurringShown.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
              </div>
            )}

            {/* Prossimi singoli — collassabile */}
            {upcomingSingle.length > 0 && (
              <div id="sec-prossimi" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('upcoming')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--text2)', display:'flex', transition:'transform 0.2s', transform: openSections.upcoming ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'var(--text2)', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.upcoming')}</span>
                  <span style={{ background:'var(--card2)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--text2)' }}>{upcomingSingle.length}</span>
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'12px', borderRadius:14, background:'var(--card2)', border:'1.5px solid var(--border)', color:'var(--text2)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <Plus size={15} /> {t('events.moreEvents', { count: hiddenCount })}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* RENT/INSTALL — sezione a parte, stessa separazione già usata
                in Events.jsx lato admin: restano caricate/non rientrate a
                lungo apposta, non hanno senso mescolate ai Prossimi. */}
            {installations.length > 0 && (
              <div id="sec-installations" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('installations')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#5b4fcf', display:'flex', transition:'transform 0.2s', transform: openSections.installations ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'#5b4fcf', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.installations')}</span>
                  <span style={{ background:'#ede9fe', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#5b4fcf' }}>{installations.length}</span>
                </button>
                {openSections.installations && installations.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      {showProfile && <Profile onClose={() => setShowProfile(false)} />}

      {!showOverlay && <TutorialModal role="worker" />}

      {!showOverlay && <TodayReminderModal events={events} today={today} navigate={navigate} />}
    </div>
  )
}

// Chiavi delle fasi (montaggio/smontaggio) di un evento che cadono oggi.
function phaseKeysToday(ev, today) {
  return Object.entries(ev.phases || {}).filter(([k, d]) => d === today && (k === 'montaggio' || k === 'smontaggio')).map(([k]) => k)
}
const PHASE_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }

// Una mia attività di oggi (assegnata da "Assegna personale", senza evento):
// stessa forma delle card evento, con l'orario, la mia nota e — se collegata —
// la lista di carico da aprire (anche di un evento di un altro giorno).
function TaskCard({ block, cont, today, linkedEvent, navigate }) {
  const { t, i18n } = useTranslation()
  const goList = () => navigate(`/events/${block.linkedEventId}${block.linkedListId ? `?list=${block.linkedListId}` : ''}`)
  const linked = !!block.linkedEventId
  return (
    <div onClick={linked ? goList : undefined}
      style={{ margin:'0 16px 10px', background:'var(--card)', border:'1.5px solid rgba(230,57,70,0.4)', borderRadius:20, display:'flex', alignItems:'center', padding:'10px 14px 10px 10px', gap:12, cursor: linked ? 'pointer' : 'default', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ width:50, height:50, flexShrink:0, borderRadius:13, background:'#e63946', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
        <span style={{ fontSize:18, fontWeight:800 }}>{new Date(today+'T12:00:00').getDate()}</span>
        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>{formatDate(today+'T12:00:00', {month:'short'}, i18n.language)}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{block.label || t('staffTimeline.untitledTask')}</p>
          <span style={{ background:'rgba(230,57,70,0.12)', color:'#e63946', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:800, flexShrink:0, textTransform:'uppercase' }}>{t('workerHome.taskTag')}</span>
        </div>
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text2)', fontVariantNumeric:'tabular-nums' }}>
          {cont ? `${t('workerCalendar.taskContinues')} · 00:00–${block.endTime}` : `${block.startTime}–${block.endTime}`}
        </p>
        {block.note && <p style={{ fontSize:12, color:'var(--text2)', marginTop:3, whiteSpace:'pre-wrap' }}>{block.note}</p>}
        {linked && (
          <p style={{ fontSize:12, fontWeight:700, color:'var(--blue)', marginTop:4, display:'flex', alignItems:'center', gap:5 }}>
            <List size={13} /> {t('workerHome.openLinkedList')}{linkedEvent ? ` · ${linkedEvent.name}` : ''} <span style={{ marginLeft:'auto' }}>›</span>
          </p>
        )}
      </div>
    </div>
  )
}

function EventCard({ ev, today, navigate, uid, forceState, loadListsOn }) {
  const { t, i18n } = useTranslation()
  const phasesToday = phaseKeysToday(ev, today)
  const isPhaseToday = forceState === 'phaseToday'
  const items    = ev.items || []
  const loaded   = loadListsOn ? items.filter(i => i.loaded).length : 0
  const returned = loadListsOn ? items.filter(i => i.returned).length : 0
  const total    = loadListsOn ? items.length : 0
  const isToday  = ev.date === today || isPhaseToday || forceState === 'today'
  const daScaricare = loadListsOn && forceState === 'daScaricare'
  // Nella sezione "Da fare oggi" l'icona mostra OGGI (il giorno in cui c'è
  // da fare qualcosa), non la data dell'evento — quella sta nel sottotitolo.
  const iconDate = isPhaseToday ? today : ev.date
  // Assegnato personalmente (assignedWorkers) — dimensione indipendente
  // dalla fase/urgenza sopra: un bordo/badge a parte invece di toccare
  // iconGradient, che già comunica a colpo d'occhio lo stato del carico.
  const isMine = !!uid && (ev.assignedWorkers || []).includes(uid)

  let phase = 'prep'
  if (total > 0 && returned === total)  phase = 'done'
  else if (total > 0 && loaded === total) phase = 'out'
  else if (total > 0 && loaded > 0)     phase = 'partial'
  else if (total > 0)                   phase = 'ready'

  const phaseInfo = {
    prep:    { color:'var(--text2)',   label: t('workerHome.phasePrep') },
    ready:   { color:'var(--blue)',    label: t('workerHome.phaseReady', { count: total }) },
    partial: { color:'var(--accent2)', label: t('workerHome.phasePartial', { loaded, total }) },
    out:     { color:'#ea580c',        label: t('workerHome.phaseOut', { returned, total }) },
    done:    { color:'var(--green)',   label: t('workerHome.phaseDone') },
  }[phase]

  // Un rent/install che comincia oggi va preparato/caricato oggi come
  // qualunque evento — deve poter spiccare col rosso "urgente" anche lì
  // dentro, non restare per sempre violetto uguale a tutti gli altri nella
  // sezione Rent/Install (dove altrimenti si perde facilmente di vista).
  // Card di sola fase (montaggio/smontaggio di oggi, evento in un altro
  // giorno): data blu/arancione come i colori delle fasi, per distinguerla da
  // un evento vero di oggi (rosso).
  const phaseColor = isPhaseToday ? PHASE_COLORS[phasesToday[0]] : null
  const iconGradient = daScaricare
    ? '#fb8500'
    : phaseColor
    ? phaseColor
    : isToday
    ? '#e63946'
    : ev.type === 'installation'
    ? '#7c6fea'
    : (phase === 'partial' || phase === 'out')
    ? '#e63946'
    : '#a8dadc'

  const cardBorder = daScaricare ? 'rgba(234,88,12,0.4)' : phaseColor ? `${phaseColor}66` : isToday ? 'rgba(220,38,38,0.4)' : isMine ? 'rgba(230,57,70,0.4)' : 'var(--border)'
  const dateStr = ev.date ? formatDate(ev.date+'T12:00:00', {day:'numeric',month:'short'}, i18n.language) : ''

  return (
    <div onClick={() => navigate(`/events/${ev.id}`)}
      className={phaseColor ? 'evt-card evt-soft' : isToday ? 'evt-card evt-today' : isMine ? 'evt-card evt-mine' : 'evt-card evt-soft'}
      style={{ margin:'0 16px 10px', background:'var(--card)', border: (!phaseColor && (isToday || isMine)) ? '1.5px solid transparent' : `1.5px solid ${cardBorder}`, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 14px 10px 10px', gap:12, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'transform 0.18s ease,box-shadow 0.18s ease' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)' }}
    >
      {/* Icona gradiente con data */}
      <div style={{ position:'relative', width:50, height:50, flexShrink:0 }}>
        <div style={{ width:50, height:50, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
          <span style={{ fontSize:18, fontWeight:800 }}>{iconDate ? new Date(iconDate+'T12:00:00').getDate() : '?'}</span>
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
            {iconDate ? formatDate(iconDate+'T12:00:00', {month:'short'}, i18n.language) : ''}
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
        {phasesToday.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:4 }}>
            {phasesToday.map(k => {
              const pt = ev.phaseTimes?.[k]
              const color = PHASE_COLORS[k]
              return (
                <span key={k} style={{ display:'inline-flex', alignItems:'center', gap:5, background:`${color}18`, color, border:`1px solid ${color}44`, borderRadius:8, padding:'2px 8px', fontSize:11, fontWeight:800 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />
                  {t('workerHome.phaseTodayBadge', { phase: t(k === 'montaggio' ? 'calendar.legendAssembly' : 'calendar.legendDisassembly') })}
                  {pt?.timeStart && pt?.timeEnd && <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>· {pt.timeStart}–{pt.timeEnd}</span>}
                </span>
              )
            })}
          </div>
        )}
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
          {isPhaseToday && <span style={{ fontWeight:700 }}>{t('workerHome.eventOn')} </span>}
          {ev.date ? formatDate(ev.date+'T12:00:00', {weekday:'long', day:'numeric', month:'long'}, i18n.language) : ''}
          {ev.dateEnd && ev.dateEnd !== ev.date ? ' — ' + formatDate(ev.dateEnd+'T12:00:00', {day:'numeric', month:'long'}, i18n.language) : ''}
        </p>
        {ev.location && <p style={{ fontSize:11, color:'var(--text2)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
        {isMine && <p style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginTop:3, display:'flex', alignItems:'center', gap:4 }}><User size={12} /> {t('workerCalendar.assignedToYouInline')}</p>}
      </div>
    </div>
  )
}
