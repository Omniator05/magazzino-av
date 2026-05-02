import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'items'), orderBy('name')), snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const unsub2 = onSnapshot(query(collection(db, 'events'), orderBy('date')), snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { unsub1(); unsub2() }
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const totalItems = items.length
  const itemsOut = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty).length
  const upcomingEvents = events.filter(e => e.date >= today).length
  const alertItems = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty)
  const recentEvents = events.filter(e => e.date >= today).slice(0, 3)

  return (
    <div className="page">
      <div style={{ background:'var(--bg2)', padding:'52px 20px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <p style={{ color:'var(--text2)', fontSize:13 }}>Benvenuto,</p>
            <h1 style={{ fontSize:24, fontWeight:800 }}>{user?.email?.split('@')[0]} 👑</h1>
          </div>
          <button onClick={logout} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:13 }}>Esci</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-box">
          <div className="val" style={{ color:'var(--blue)' }}>{totalItems}</div>
          <div className="lbl">Articoli</div>
        </div>
        <div className="stat-box">
          <div className="val" style={{ color: itemsOut > 0 ? 'var(--accent)' : 'var(--green)' }}>{itemsOut}</div>
          <div className="lbl">Fuori</div>
        </div>
        <div className="stat-box">
          <div className="val" style={{ color:'var(--accent2)' }}>{upcomingEvents}</div>
          <div className="lbl">Eventi</div>
        </div>
      </div>

      {alertItems.length > 0 && (
        <div style={{ margin:'4px 16px 12px' }}>
          <div style={{ background:'rgba(233,69,96,0.1)', border:'1px solid rgba(233,69,96,0.3)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
            <p style={{ color:'var(--accent)', fontWeight:700, fontSize:14, marginBottom:8 }}>⚠️ Articoli fuori magazzino</p>
            {alertItems.slice(0, 4).map(item => (
              <div key={item.id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text)', padding:'3px 0' }}>
                <span>{item.name}</span>
                <span style={{ color:'var(--text2)' }}>{item.availableQty}/{item.totalQty}</span>
              </div>
            ))}
            {alertItems.length > 4 && <p style={{ color:'var(--text2)', fontSize:12, marginTop:6 }}>+{alertItems.length - 4} altri...</p>}
          </div>
        </div>
      )}

      <div style={{ padding:'4px 16px 8px' }}>
        <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Accesso rapido</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { label:'Magazzino', icon:'📦', path:'/inventory' },
            { label:'Nuovo evento', icon:'🎪', path:'/events' },
            { label:'Scansiona', icon:'📷', path:'/scanner' },
            { label:'Utenti', icon:'👥', path:'/admin/users' },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'18px 14px', display:'flex', flexDirection:'column', gap:8, textAlign:'left' }}>
              <span style={{ fontSize:24 }}>{a.icon}</span>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {recentEvents.length > 0 && (
        <div style={{ padding:'12px 16px 8px' }}>
          <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi eventi</p>
          {recentEvents.map(ev => (
            <div key={ev.id} onClick={() => navigate(`/events/${ev.id}`)}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:8, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ fontWeight:700, fontSize:15 }}>{ev.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>
                  {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })}
                  {ev.location && ` · ${ev.location}`}
                </p>
              </div>
              <div style={{ color:'var(--text2)', fontSize:20 }}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
