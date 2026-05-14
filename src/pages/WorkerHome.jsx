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
        <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>
          Prossimi eventi
        </p>

        {events.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize:48 }}>📭</p>
            <h3>Nessun evento</h3>
            <p>Non ci sono eventi in programma al momento</p>
          </div>
        ) : (
          events.map(ev => {
            const items = ev.items || []
            const loaded  = items.filter(i => i.loaded).length
            const returned = items.filter(i => i.returned).length
            const total = items.length
            const isToday = ev.date === today

            let phase = 'prep'
            if (total > 0 && returned === total) phase = 'done'
            else if (total > 0 && loaded > 0) phase = 'out'
            else if (total > 0) phase = 'ready'

            const phaseInfo = {
              prep:  { color:'var(--text2)', label:'Lista da preparare', icon:'📋' },
              ready: { color:'var(--blue)',   label:`${total} articoli da caricare`, icon:'📦' },
              out:   { color:'var(--accent2)',label:`${loaded}/${total} caricati · ${returned} rientrati`, icon:'🚛' },
              done:  { color:'var(--green)',  label:'Tutto rientrato ✅', icon:'✅' },
            }[phase]

            return (
              <div key={ev.id} onClick={() => navigate(`/events/${ev.id}`)}
                style={{ background:'var(--card)', border:`1px solid ${isToday ? 'rgba(233,69,96,0.4)' : 'var(--border)'}`, borderRadius:'var(--radius)', marginBottom:12, overflow:'hidden', cursor:'pointer' }}>
                {isToday && (
                  <div style={{ background:'rgba(233,69,96,0.15)', padding:'6px 16px', borderBottom:'1px solid rgba(233,69,96,0.2)' }}>
                    <p style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>🔴 OGGI</p>
                  </div>
                )}
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div>
                      <h3 style={{ fontWeight:700, fontSize:16 }}>{ev.name}</h3>
                      <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>
                        📅 {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })}
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
          })
        )}
      </div>
    </div>
  )
}
