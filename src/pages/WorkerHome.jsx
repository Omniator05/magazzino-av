import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import ThemeToggle from '../components/ThemeToggle'

export default function WorkerHome() {
  const { profile, logout } = useAuth()
  const [events, setEvents] = useState([])
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => e.date >= today))
    })
  }, [])

  // Separa ricorrenti (mostra solo il prossimo per serie) da singoli
  const recurringMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringMap[ev.seriesId]) recurringMap[ev.seriesId] = []
      recurringMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringMap).map(series =>
    [...series].sort((a,b) => a.date.localeCompare(b.date)).find(e => e.date >= today) || series[series.length-1]
  )
  const singleEvents = events.filter(e => !e.seriesId)

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <p style={{ color:'var(--text2)', fontSize:13 }}>Ciao,</p>
            <h1 style={{ fontSize:24, fontWeight:800 }}>{profile?.name || 'Magazziniere'} 👋</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={logout} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:13 }}>Esci</button>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px' }}>

        {events.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize:48 }}>📭</p>
            <h3>Nessun evento</h3>
            <p>Non ci sono eventi in programma al momento</p>
          </div>
        ) : (
          <>
            {pinnedRecurring.length > 0 && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>🔁 Ricorrenti</p>
                  <div style={{ flex:1, height:1, background:'rgba(79,195,247,0.2)' }} />
                </div>
                {pinnedRecurring.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
                {singleEvents.length > 0 && <div style={{ height:1, background:'var(--border)', margin:'4px 0 14px' }} />}
              </>
            )}
            {singleEvents.length > 0 && (
              <>
                {pinnedRecurring.length > 0 && <p style={{ color:'var(--text2)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Prossimi</p>}
                {singleEvents.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EventCard({ ev, today, navigate }) {
  const items    = ev.items || []
  const loaded   = items.filter(i => i.loaded).length
  const returned = items.filter(i => i.returned).length
  const total    = items.length
  const isToday  = ev.date === today

  let phase = 'prep'
  if (total > 0 && returned === total) phase = 'done'
  else if (total > 0 && loaded > 0)   phase = 'out'
  else if (total > 0)                 phase = 'ready'

  const phaseInfo = {
    prep:  { color:'var(--text2)', label:'Lista da preparare',  icon:'📋' },
    ready: { color:'var(--blue)',   label:`${total} articoli da caricare`, icon:'📦' },
    out:   { color:'var(--accent2)',label:`${loaded}/${total} caricati`, icon:'🚛' },
    done:  { color:'var(--green)',  label:'Tutto rientrato', icon:'✅' },
  }[phase]

  return (
    <div onClick={() => navigate(`/events/${ev.id}`)}
      style={{ background:'var(--card)', border:`1px solid ${isToday ? 'rgba(233,69,96,0.4)' : 'var(--border)'}`, borderRadius:'var(--radius)', marginBottom:12, overflow:'hidden', cursor:'pointer' }}>
      {isToday && (
        <div style={{ background:'rgba(233,69,96,0.15)', padding:'6px 16px', borderBottom:'1px solid rgba(233,69,96,0.2)' }}>
          <p style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>🔴 OGGI</p>
        </div>
      )}
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <h3 style={{ fontWeight:700, fontSize:16 }}>{ev.name}</h3>
              {ev.seriesId && <span style={{ background:'rgba(79,195,247,0.12)', color:'var(--blue)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>🔁</span>}
            </div>
            <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>
              📅 {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })}{ev.dateEnd && ev.dateEnd !== ev.date && ` → ${new Date(ev.dateEnd + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'short' })}`}
              {ev.location && ` · 📍 ${ev.location}`}
            </p>
          </div>
          <div style={{ color:'var(--text2)', fontSize:22 }}>›</div>
        </div>
        {total > 0 && (
          <div style={{ background:'var(--card2)', borderRadius:4, height:4, marginBottom:8 }}>
            <div style={{ background: phaseInfo.color, height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%` }} />
          </div>
        )}
        <p style={{ fontSize:13, color:phaseInfo.color, fontWeight:600 }}>{phaseInfo.icon} {phaseInfo.label}</p>
      </div>
    </div>
  )
}
