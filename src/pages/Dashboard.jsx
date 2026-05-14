import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'Buonanotte'
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

import ThemeToggle from '../components/ThemeToggle'

export default function Dashboard({ toggleTheme, theme }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems]   = useState([])
  const [events, setEvents] = useState([])
  const [ready, setReady]   = useState(false)

  useEffect(() => {
    let loaded = 0
    const done = () => { if (++loaded === 2) setTimeout(() => setReady(true), 80) }
    const u1 = onSnapshot(query(collection(db, 'items'),  orderBy('name')), s => { setItems(s.docs.map(d => ({ id:d.id,...d.data() }))); done() })
    const u2 = onSnapshot(query(collection(db, 'events'), orderBy('date')), s => { setEvents(s.docs.map(d => ({ id:d.id,...d.data() }))); done() })
    return () => { u1(); u2() }
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.date >= today)
  const todayEvents = events.filter(e => e.date === today)
  const nextEvent = upcoming[0]

  const itemsOut    = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty).length
  const brokenItems = items.filter(i => (i.brokenQty || 0) > 0)
  const totalBroken = brokenItems.reduce((sum, i) => sum + (i.brokenQty || 0), 0)
  const reorderItems = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock)

  const name = profile?.name?.split(' ')[0] || profile?.username || 'Admin'


  return (
    <div className="page" style={{ background:'var(--bg)', position:'relative', overflow:'hidden' }}>

      {/* ── Sfondo gradiente animato ── */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', overflow:'hidden' }}>
        {/* Blob 1 — rosso accent in alto a destra */}
        <div style={{
          position:'absolute', top:'-15%', right:'-15%',
          width:'55vw', height:'55vw', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(233,69,96,0.18) 0%, transparent 70%)',
          animation:'blobFloat1 12s ease-in-out infinite',
        }} />
        {/* Blob 2 — blu in basso a sinistra */}
        <div style={{
          position:'absolute', bottom:'-10%', left:'-10%',
          width:'50vw', height:'50vw', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(79,195,247,0.12) 0%, transparent 70%)',
          animation:'blobFloat2 16s ease-in-out infinite',
        }} />
        {/* Blob 3 — verde piccolo al centro */}
        <div style={{
          position:'absolute', top:'40%', right:'5%',
          width:'30vw', height:'30vw', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)',
          animation:'blobFloat3 10s ease-in-out infinite',
        }} />
      </div>

      <style>{`
        @keyframes blobFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(-4%, 6%) scale(1.08); }
          66%       { transform: translate(5%, -4%) scale(0.95); }
        }
        @keyframes blobFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%       { transform: translate(5%, -7%) scale(1.1); }
          70%       { transform: translate(-3%, 4%) scale(0.92); }
        }
        @keyframes blobFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(-8%, 10%) scale(1.15); }
        }
      `}</style>

      {/* Tutto il contenuto va sopra il gradiente */}
      <div style={{ position:'relative', zIndex:1 }}>

      {/* ── Header ── */}
      <div style={{ padding:'56px 24px 24px', position:'relative', overflow:'hidden' }}>
        {/* Glow decorativo */}
        <div style={{ position:'absolute', top:-60, right:-40, width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle, rgba(233,69,96,0.10) 0%, transparent 70%)', pointerEvents:'none' }} />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div style={{ animation:'none' }}>
            <p style={{ color:'var(--text2)', fontSize:14, fontWeight:500, marginBottom:4 }}>{greeting()},</p>
            <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:'-0.8px', lineHeight:1.1 }}>{name}</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              onClick={logout}
              style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:12, padding:'8px 14px', fontSize:13, fontWeight:600 }}
            >
              Esci
            </button>
          </div>
        </div>
      </div>

      {/* ── Evento oggi (se c'è) ── */}
      {/* Avviso rotti */}
      {brokenItems.length > 0 && (
        <div style={{ margin:'0 16px 12px' }}>
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:'var(--radius)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--red)', animation:'pulse 2s ease infinite' }} />
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                🔴 {totalBroken === 1 ? '1 oggetto rotto' : `${totalBroken} oggetti rotti`} da riparare
              </p>
            </div>
            <button onClick={() => navigate('/inventory')} style={{ color:'var(--red)', fontSize:13, fontWeight:700, background:'transparent', padding:'4px 0' }}>Vedi →</button>
          </div>
        </div>
      )}

      {/* Avviso consumabili da riordinare */}
      {reorderItems.length > 0 && (
        <div style={{ margin:'0 16px 20px' }}>
          <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:'var(--radius)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', animation:'pulse 2s ease infinite' }} />
              <div>
                <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                  🛒 {reorderItems.length === 1 ? `"${reorderItems[0].name}" da riordinare` : `${reorderItems.length} consumabili da riordinare`}
                </p>
                {reorderItems.length > 1 && reorderItems.length <= 3 && (
                  <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{reorderItems.map(i => i.name).join(', ')}</p>
                )}
              </div>
            </div>
            <button onClick={() => navigate('/inventory', { state: { filter: 'reorder' } })} style={{ color:'var(--blue)', fontSize:13, fontWeight:700, background:'transparent', padding:'4px 0' }}>Vedi →</button>
          </div>
        </div>
      )}

      {/* ── Quick actions ── */}
      {upcoming.length > 0 && (
        <div style={{ padding:'0 16px 8px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Prossimi eventi</p>
            <button onClick={() => navigate('/events')} style={{ color:'var(--accent)', fontSize:13, fontWeight:700, background:'transparent' }}>Tutti →</button>
          </div>

          {upcoming.slice(0, 4).map((ev, i) => {
            const evItems  = ev.items || []
            const loaded   = evItems.filter(x => x.loaded).length
            const returned = evItems.filter(x => x.returned).length
            const total    = evItems.length
            const isToday  = ev.date === today
            const dayLabel = isToday ? 'Oggi'
              : new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })

            return (
              <button key={ev.id} onClick={() => navigate(`/events/${ev.id}`)}
                style={{ width:'100%', background:'var(--card)', border:`1px solid ${isToday ? 'rgba(233,69,96,0.35)' : 'var(--border)'}`, borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:10, textAlign:'left', display:'flex', alignItems:'center', gap:14 }}>

                {/* Data */}
                <div style={{ width:46, flexShrink:0, textAlign:'center', background:'var(--card2)', borderRadius:10, padding:'8px 4px', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:10, fontWeight:700, color: isToday ? 'var(--accent)' : 'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    {isToday ? 'oggi' : new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { month:'short' })}
                  </p>
                  <p style={{ fontSize:20, fontWeight:800, color:'var(--text)', lineHeight:1.2 }}>
                    {isToday ? '!' : new Date(ev.date + 'T12:00:00').getDate()}
                  </p>
                </div>

                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:15, letterSpacing:'-0.2px', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }}>{ev.name}</p>
                  <p style={{ color:'var(--text2)', fontSize:13 }}>
                    {ev.location || 'Nessuna location'}
                    {total > 0 && ` · ${returned}/${total} rientrati`}
                  </p>
                </div>

                <div style={{ color:'var(--text3)', fontSize:20, flexShrink:0 }}>›</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Stato vuoto */}
      {upcoming.length === 0 && ready && (
        <div className="empty-state" style={{ paddingTop:40 }}>
          <p style={{ fontSize:40 }}>📅</p>
          <h3>Nessun evento in programma</h3>
          <p>Crea il primo evento dalla sezione Eventi</p>
          <button onClick={() => navigate('/events')} className="btn btn-primary" style={{ marginTop:8 }}>
            Vai agli eventi
          </button>
        </div>
      )}
      </div>{/* fine wrapper zIndex:1 */}
    </div>
  )
}

/* ── Icone SVG inline ── */