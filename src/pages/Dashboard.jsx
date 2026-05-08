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

export default function Dashboard() {
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

  // Numero articoli fuori — solo per la stat card, senza lista
  const itemsOut = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty).length

  const name = profile?.name?.split(' ')[0] || profile?.username || 'Admin'

  const quickActions = [
    { label:'Magazzino',  icon: <IconBox />,      path:'/inventory',    color:'var(--blue)' },
    { label:'Scanner',    icon: <IconScan />,      path:'/scanner',      color:'var(--accent)' },
    { label:'Utenti',     icon: <IconUsers />,     path:'/admin/users',  color:'var(--green)' },
  ]

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
          <button
            onClick={logout}
            style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:12, padding:'8px 14px', fontSize:13, fontWeight:600 }}
          >
            Esci
          </button>
        </div>
      </div>

      {/* ── Evento oggi (se c'è) ── */}
      {todayEvents.length > 0 && (
        <div style={{ margin:'0 16px 20px' }}>
          {todayEvents.map(ev => (
            <div key={ev.id} style={{ width:'100%', background:'linear-gradient(135deg, rgba(233,69,96,0.25) 0%, rgba(233,69,96,0.08) 100%)', border:'1px solid rgba(233,69,96,0.3)', borderRadius:'var(--radius)', overflow:'hidden' }}>
              <button onClick={() => navigate(`/events/${ev.id}`)}
                style={{ width:'100%', padding:'16px 18px', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', background:'transparent' }}>
                <div>
                  <p style={{ color:'var(--accent)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:5 }}>🔴 OGGI</p>
                  <p style={{ color:'var(--text)', fontWeight:700, fontSize:17, letterSpacing:'-0.2px' }}>{ev.name}</p>
                  {ev.location && <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>📍 {ev.location}</p>}
                </div>
                <div style={{ color:'var(--text2)', fontSize:22, flexShrink:0 }}>›</div>
              </button>
              <div style={{ borderTop:'1px solid rgba(233,69,96,0.2)', padding:'10px 18px' }}>
                <button onClick={() => navigate(`/events/${ev.id}/scan`)}
                  style={{ background:'rgba(79,195,247,0.15)', border:'1px solid rgba(79,195,247,0.3)', color:'var(--blue)', borderRadius:10, padding:'8px 16px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg>
                  Avvia scansione carico
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stat pill: articoli fuori ── */}
      {itemsOut > 0 && (
        <div style={{ margin:'0 16px 20px' }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', animation:'pulse 2s ease infinite' }} />
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
                {itemsOut === 1 ? '1 articolo fuori magazzino' : `${itemsOut} articoli fuori magazzino`}
              </p>
            </div>
            <button onClick={() => navigate('/inventory')} style={{ color:'var(--accent)', fontSize:13, fontWeight:700, background:'transparent', padding:'4px 0' }}>
              Vedi →
            </button>
          </div>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div style={{ padding:'0 16px 24px' }}>
        <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Accesso rapido</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
          {quickActions.map((a, i) => (
            <button key={a.label} onClick={() => navigate(a.path)}
              style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'18px 8px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:10, position:'relative', overflow:'hidden' }}>
              {/* Glow per icona */}
              <div style={{ width:44, height:44, borderRadius:14, background:`color-mix(in srgb, ${a.color} 15%, var(--card2))`, display:'flex', alignItems:'center', justifyContent:'center', color:a.color }}>
                {a.icon}
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', letterSpacing:'-0.1px' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Prossimi eventi ── */}
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
function IconBox() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zm-9 9H7v-2h4v2zm6 0h-4v-2h4v2zM3 5h18v2H3z"/></svg>
}
function IconScan() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
}
