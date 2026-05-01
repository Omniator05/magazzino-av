import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useItems } from '../hooks/useFirestore'
import { useEvents } from '../hooks/useFirestore'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const { items } = useItems()
  const { events } = useEvents()
  const navigate = useNavigate()

  const totalItems = items.length
  const itemsOut = items.filter(i => i.availableQty < i.totalQty).length
  const upcomingEvents = events.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

  const recentEvents = events.slice(0, 3)
  const alertItems = items.filter(i => i.availableQty < i.totalQty)

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background:'var(--bg2)', padding:'52px 20px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <p style={{ color:'var(--text2)', fontSize:13 }}>Benvenuto,</p>
            <h1 style={{ fontSize:24, fontWeight:800 }}>{user?.email?.split('@')[0] || 'Tecnico'} 👋</h1>
          </div>
          <button onClick={logout} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:13 }}>Esci</button>
        </div>
      </div>

      {/* Stats */}
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

      {/* Alert - articoli fuori magazzino */}
      {alertItems.length > 0 && (
        <div style={{ margin:'4px 16px 12px' }}>
          <div style={{ background:'rgba(233,69,96,0.1)', border:'1px solid rgba(233,69,96,0.3)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
            <p style={{ color:'var(--accent)', fontWeight:700, fontSize:14, marginBottom:8 }}>⚠️ Articoli fuori magazzino</p>
            {alertItems.slice(0, 3).map(item => (
              <div key={item.id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text)', padding:'3px 0' }}>
                <span>{item.name}</span>
                <span style={{ color:'var(--text2)' }}>{item.availableQty}/{item.totalQty} disponibili</span>
              </div>
            ))}
            {alertItems.length > 3 && <p style={{ color:'var(--text2)', fontSize:12, marginTop:6 }}>+{alertItems.length - 3} altri...</p>}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding:'4px 16px 8px' }}>
        <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Accesso rapido</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { label:'Nuovo articolo', icon:'📦', action:() => navigate('/inventory') },
            { label:'Nuovo evento', icon:'🎪', action:() => navigate('/events') },
            { label:'Scansiona QR', icon:'📷', action:() => navigate('/scanner') },
            { label:'Lista carico', icon:'📋', action:() => navigate('/events') },
          ].map(a => (
            <button key={a.label} onClick={a.action}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'18px 14px', display:'flex', flexDirection:'column', gap:8, textAlign:'left' }}>
              <span style={{ fontSize:24 }}>{a.icon}</span>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prossimi eventi */}
      {recentEvents.length > 0 && (
        <div style={{ padding:'12px 16px 8px' }}>
          <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi eventi</p>
          {recentEvents.map(ev => (
            <div key={ev.id} onClick={() => navigate(`/events/${ev.id}`)}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:8, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ fontWeight:700, fontSize:15 }}>{ev.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>{ev.location} • {ev.date}</p>
              </div>
              <div style={{ color:'var(--text2)', fontSize:20 }}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
