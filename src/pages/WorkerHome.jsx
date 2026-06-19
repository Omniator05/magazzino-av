import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import ThemeToggle from '../components/ThemeToggle'
import DateBadge from '../components/DateBadge'

export default function WorkerHome() {
  const { profile, logout } = useAuth()
  const [events, setEvents] = useState([])
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

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

  return (
    <div className="page">
      {/* Header */}
      <div style={{ padding:'52px 20px 24px', background:'var(--gradient-header)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <p style={{ fontSize:11, color:'var(--text2)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:2 }}>Ciao,</p>
            <h1 style={{ fontSize:28, fontWeight:500, color:'var(--text)', lineHeight:1.1, marginBottom:6 }}>{name || profile?.username || 'Magazziniere'}</h1>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Magazziniere</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={logout} style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:13, fontWeight:600 }}>Esci</button>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 0' }}>

        {/* DA SCARICARE — in evidenza */}
        {daScaricare.length > 0 && (
          <div style={{ margin:'0 0 8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px' }}>
              <p style={{ color:'#ea580c', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>🟠 Da scaricare</p>
              <div style={{ flex:1, height:1, background:'rgba(234,88,12,0.25)' }} />
            </div>
            {daScaricare.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} forceState="daScaricare" />)}
          </div>
        )}

        {events.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize:48 }}>📭</p>
            <h3>Nessun evento</h3>
            <p>Non ci sono eventi in programma</p>
          </div>
        ) : (
          <>
            {/* Ricorrenti */}
            {pinnedRecurring.length > 0 && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 8px', marginTop:4 }}>
                  <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>🔁 Ricorrenti</p>
                  <div style={{ flex:1, height:1, background:'rgba(79,195,247,0.2)' }} />
                </div>
                {pinnedRecurring.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
                {upcomingSingle.length > 0 && <div style={{ height:1, background:'var(--border)', margin:'4px 16px 12px' }} />}
              </>
            )}

            {/* Prossimi singoli */}
            {upcomingSingle.length > 0 && (
              <>
                {pinnedRecurring.length > 0 && (
                  <p style={{ color:'var(--text2)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', padding:'0 16px 8px' }}>Prossimi</p>
                )}
                {upcomingSingle.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
              </>
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
    prep:    { color:'var(--text2)',   label:`Lista da preparare`,         icon:'📋' },
    ready:   { color:'var(--blue)',    label:`${total} articoli da caricare`, icon:'📦' },
    partial: { color:'var(--accent2)', label:`${loaded}/${total} caricati`, icon:'🚛' },
    out:     { color:'#ea580c',        label:`In evento · ${returned}/${total} rientrati`, icon:'🚛' },
    done:    { color:'var(--green)',   label:'Tutto rientrato ✅',          icon:'✅' },
  }[phase]

  const cardBg     = daScaricare ? 'rgba(234,88,12,0.06)' : isToday ? 'rgba(220,38,38,0.06)' : 'var(--card)'
  const cardBorder = daScaricare ? 'rgba(234,88,12,0.35)' : isToday ? 'rgba(220,38,38,0.35)' : 'var(--border)'

  return (
    <div onClick={() => navigate(`/events/${ev.id}`)}
      style={{ background:cardBg, border:`1px solid ${cardBorder}`, borderRadius:16, margin:'0 16px 10px', overflow:'hidden', cursor:'pointer' }}>
      {(isToday || daScaricare) && (
        <div style={{ background: daScaricare ? 'rgba(234,88,12,0.12)' : 'rgba(220,38,38,0.12)', padding:'5px 16px', borderBottom:`1px solid ${daScaricare ? 'rgba(234,88,12,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
          <p style={{ color: daScaricare ? '#ea580c' : 'var(--red)', fontSize:12, fontWeight:700 }}>
            {daScaricare ? '🟠 DA SCARICARE' : '🔴 OGGI'}
          </p>
        </div>
      )}
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <h3 style={{ fontWeight:700, fontSize:16, color:'var(--text)' }}>{ev.name}</h3>
              {ev.seriesId && <span style={{ background:'rgba(79,195,247,0.12)', color:'var(--blue)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>🔁</span>}
            </div>
            <DateBadge dateStr={ev.date} location={ev.location} today={today} />
          </div>
          <span style={{ color:'var(--text3)', fontSize:22 }}>›</span>
        </div>
        {total > 0 && (
          <>
            <div style={{ background:'var(--bg3)', borderRadius:4, height:4, marginBottom:6 }}>
              <div style={{ background: daScaricare ? '#ea580c' : phaseInfo.color, height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%` }} />
            </div>
            <p style={{ fontSize:13, color: daScaricare ? '#ea580c' : phaseInfo.color, fontWeight:600 }}>
              {daScaricare ? `🟠 ${total-returned} articoli da rientrare` : `${phaseInfo.icon} ${phaseInfo.label}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
