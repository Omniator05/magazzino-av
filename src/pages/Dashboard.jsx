import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import ThemeToggle from '../components/ThemeToggle'
import DateBadge from '../components/DateBadge'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'Buonanotte,'
  if (h < 12) return 'Buongiorno,'
  if (h < 18) return 'Buon pomeriggio,'
  return 'Buonasera,'
}

export default function Dashboard({ toggleTheme, theme }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems]   = useState([])
  const [tasks, setTasks]   = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'items'),  orderBy('name')),  s => setItems(s.docs.map(d => ({ id:d.id,...d.data() }))))
    const u2 = onSnapshot(query(collection(db, 'events'), orderBy('date')),  s => setEvents(s.docs.map(d => ({ id:d.id,...d.data() }))))
    const u3 = onSnapshot(query(collection(db, 'tasks')),                    s => setTasks(s.docs.map(d => ({ id:d.id,...d.data() }))))
    return () => { u1(); u2(); u3() }
  }, [])

  const today       = new Date().toISOString().split('T')[0]
  const name        = profile?.name?.split(' ')[0] || profile?.username || 'Admin'
  const brokenItems = items.filter(i => (i.brokenQty || 0) > 0)
  const totalBroken = brokenItems.reduce((sum, i) => sum + (i.brokenQty || 0), 0)
  const reorderItems = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock)
  const openTasks   = tasks.filter(t => !t.done)

  const isActive = e => {
    if (e.date >= today) return true
    const its = e.items || []
    return its.length > 0 && its.some(i => i.loaded && !i.returned)
  }
  const upcoming = events.filter(e => e.date >= today).slice(0, 3)

  return (
    <div className="page" style={{ background:'var(--bg)', paddingBottom:100 }}>

      {/* Header */}
      <div style={{ padding:'52px 20px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <p style={{ color:'var(--text2)', fontSize:15 }}>{greeting()}</p>
            <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-0.8px', lineHeight:1.1 }}>{name}</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={logout} style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:12, padding:'8px 14px', fontSize:13, fontWeight:600 }}>Esci</button>
          </div>
        </div>
      </div>

      <div style={{ padding:'20px 16px 0' }}>

        {/* Avviso rotti */}
        {brokenItems.length > 0 && (
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:'var(--radius)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--red)', animation:'pulse 2s ease infinite' }} />
              <p style={{ fontSize:15, fontWeight:700 }}>🔴 {totalBroken === 1 ? '1 oggetto rotto' : `${totalBroken} oggetti rotti`} da riparare</p>
            </div>
            <button onClick={() => navigate('/inventory')} style={{ color:'var(--red)', fontSize:13, fontWeight:700, background:'transparent' }}>Vedi →</button>
          </div>
        )}

        {/* Avviso consumabili */}
        {reorderItems.length > 0 && (
          <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:'var(--radius)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', animation:'pulse 2s ease infinite' }} />
              <p style={{ fontSize:15, fontWeight:700 }}>🛒 {reorderItems.length === 1 ? `"${reorderItems[0].name}"` : `${reorderItems.length} consumabili`} da riordinare</p>
            </div>
            <button onClick={() => navigate('/inventory', { state:{ filter:'reorder' } })} style={{ color:'var(--blue)', fontSize:13, fontWeight:700, background:'transparent' }}>Vedi →</button>
          </div>
        )}

        {/* Strumenti */}
        <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'var(--text2)', marginBottom:10, marginTop:8 }}>Strumenti</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:28 }}>
          <button onClick={() => navigate('/scanner')}
            style={{ background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.18)', borderRadius:18, padding:'16px 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:54, height:54, borderRadius:16, background:'rgba(124,58,237,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📷</div>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Scanner</span>
          </button>
          <button onClick={() => navigate('/tasks')} style={{ position:'relative', background:'rgba(37,99,235,0.08)', border:'1px solid rgba(37,99,235,0.18)', borderRadius:18, padding:'16px 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            {openTasks.length > 0 && (
              <span style={{ position:'absolute', top:10, right:10, background:'#dc2626', color:'white', borderRadius:10, fontSize:9, fontWeight:800, padding:'2px 6px', lineHeight:1.4 }}>{openTasks.length}</span>
            )}
            <div style={{ width:54, height:54, borderRadius:16, background:'rgba(37,99,235,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>✅</div>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--blue)' }}>Task</span>
          </button>
          <button onClick={() => navigate('/templates')}
            style={{ background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.18)', borderRadius:18, padding:'16px 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:54, height:54, borderRadius:16, background:'rgba(22,163,74,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📋</div>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>Template</span>
          </button>
        </div>

        {/* Prossimi eventi */}
        {upcoming.length > 0 && (
          <>
            <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Prossimi eventi</p>
            {upcoming.map(ev => {
              const its     = ev.items || []
              const total   = its.length
              const loaded  = its.filter(i => i.loaded).length
              const returned= its.filter(i => i.returned).length
              const isToday = ev.date === today

              let statusColor = 'var(--text2)', statusText = 'Lista vuota'
              if (total > 0) {
                if (returned === total)    { statusColor = 'var(--green)';   statusText = '✅ Tutto rientrato' }
                else if (loaded === total) { statusColor = 'var(--accent2)'; statusText = `In evento · ${returned}/${total} rientrati` }
                else if (loaded > 0)       { statusColor = 'var(--accent2)'; statusText = `Carico · ${loaded}/${total}` }
                else                       { statusColor = 'var(--text2)';   statusText = `${total} in lista` }
              }

              return (
                <div key={ev.id} onClick={() => navigate(`/events/${ev.id}`)}
                  style={{ background:'var(--card)', border:`1px solid ${isToday ? 'rgba(233,69,96,0.4)' : 'var(--border)'}`, borderRadius:'var(--radius)', marginBottom:10, overflow:'hidden', cursor:'pointer' }}>
                  {isToday && (
                    <div style={{ background:'rgba(233,69,96,0.15)', padding:'5px 16px', borderBottom:'1px solid rgba(233,69,96,0.2)' }}>
                      <p style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>🔴 OGGI</p>
                    </div>
                  )}
                  <div style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <p style={{ fontWeight:700, fontSize:15 }}>{ev.name}</p>
                        <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>
                          <DateBadge dateStr={ev.date} location={ev.location} today={today} />
                        </p>
                      </div>
                      <span style={{ color:'var(--text2)', fontSize:20 }}>›</span>
                    </div>
                    {total > 0 && (
                      <>
                        <div style={{ background:'var(--card2)', borderRadius:4, height:4, margin:'8px 0 4px' }}>
                          <div style={{ background: returned===total ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%` }} />
                        </div>
                        <p style={{ fontSize:12, color:statusColor, fontWeight:600 }}>{statusText}</p>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <button onClick={() => navigate('/events')} style={{ width:'100%', padding:'10px', borderRadius:10, background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', fontWeight:600, fontSize:13, marginTop:4 }}>
              Vedi tutti gli eventi →
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )
}
