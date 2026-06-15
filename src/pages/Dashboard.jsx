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

  const today        = new Date().toISOString().split('T')[0]
  const name         = profile?.name?.split(' ')[0] || profile?.username || 'Admin'
  const brokenItems  = items.filter(i => (i.brokenQty || 0) > 0)
  const totalBroken  = brokenItems.reduce((sum, i) => sum + (i.brokenQty || 0), 0)
  const reorderItems = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock)
  const openTasks    = tasks.filter(t => !t.done)
  const upcoming     = events.filter(e => e.date >= today).slice(0, 3)

  /* Tool cards config */
  const tools = [
    {
      label: 'Scanner',
      icon:  <IconCamera />,
      color: '#5b4fcf',       /* indigo */
      bg:    '#ede9fe',
      path:  '/scanner',
      badge: null,
    },
    {
      label: 'Task',
      icon:  <IconCheck />,
      color: '#1d6fce',       /* blue */
      bg:    '#dbeafe',
      path:  '/tasks',
      badge: openTasks.length > 0 ? openTasks.length : null,
    },
    {
      label: 'Template',
      icon:  <IconTemplate />,
      color: '#15803d',       /* green */
      bg:    '#dcfce7',
      path:  '/templates',
      badge: null,
    },
  ]

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:110 }}>

      {/* ── Header ──────────────────────────────── */}
      <div style={{ padding:'56px 22px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontSize:13, fontWeight:600, color:'var(--dash-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:4 }}>
            {greeting()}
          </p>
          <h1 style={{ fontSize:32, fontWeight:800, color:'var(--dash-title)', letterSpacing:'-0.5px', lineHeight:1.1, marginBottom:3 }}>
            {name}
          </h1>
          <p style={{ fontSize:12, color:'var(--dash-muted)', fontWeight:500 }}>
            {profile?.role === 'admin' ? 'Amministratore' : 'Magazziniere'}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:4 }}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={logout} style={{
            background:'var(--dash-pill-bg)',
            border:'1px solid var(--dash-pill-border)',
            color:'var(--dash-muted)',
            borderRadius:50,
            padding:'7px 16px',
            fontSize:13,
            fontWeight:600,
          }}>Esci</button>
        </div>
      </div>

      <div style={{ padding:'0 16px' }}>

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
                {totalBroken === 1 ? '1 oggetto rotto' : `${totalBroken} oggetti rotti`} da riparare
              </p>
            </div>
            <button onClick={() => navigate('/inventory')} style={{
              background:'transparent', color:'#e11d48', fontSize:13, fontWeight:700,
              display:'flex', alignItems:'center', gap:2,
            }}>
              Vedi <IconChevron />
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
                {reorderItems.length === 1 ? `"${reorderItems[0].name}"` : `${reorderItems.length} consumabili`} da riordinare
              </p>
            </div>
            <button onClick={() => navigate('/inventory', { state:{ filter:'reorder' } })} style={{
              background:'transparent', color:'#1d6fce', fontSize:13, fontWeight:700,
              display:'flex', alignItems:'center', gap:2,
            }}>
              Vedi <IconChevron />
            </button>
          </div>
        )}

        {/* ── Strumenti ───────────────────────── */}
        <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1.2px', color:'var(--dash-muted)', marginBottom:12, marginTop:20 }}>
          Strumenti
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:32 }}>
          {tools.map(t => (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              style={{
                position:'relative',
                background: t.bg,
                border:'none',
                borderRadius:20,
                padding:'20px 8px 16px',
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                gap:10,
              }}
            >
              {t.badge !== null && (
                <span style={{
                  position:'absolute', top:10, right:10,
                  background:'#dc2626', color:'white',
                  borderRadius:10, fontSize:9, fontWeight:800,
                  padding:'2px 6px', lineHeight:1.4,
                }}>{t.badge}</span>
              )}
              <span style={{ color: t.color }}>{t.icon}</span>
              <span style={{ fontSize:13, fontWeight:700, color: t.color }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Prossimi eventi ──────────────────── */}
        {upcoming.length > 0 && (
          <>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1.2px', color:'var(--dash-muted)', marginBottom:14 }}>
              Prossimi eventi
            </p>

            {upcoming.map(ev => {
              const its      = ev.items || []
              const total    = its.length
              const loaded   = its.filter(i => i.loaded).length
              const returned = its.filter(i => i.returned).length
              const isToday  = ev.date === today

              let barColor   = '#d1d5db'
              let statusText = 'Lista vuota'
              let statusColor= '#9ca3af'
              if (total > 0) {
                if (returned === total)    { barColor='#22c55e'; statusColor='#15803d'; statusText='Tutto rientrato' }
                else if (loaded === total) { barColor='#f59e0b'; statusColor='#b45309'; statusText=`In evento · ${returned}/${total} rientrati` }
                else if (loaded > 0)       { barColor='#f59e0b'; statusColor='#b45309'; statusText=`Carico · ${loaded}/${total}` }
                else                       { statusText=`${total} in lista` }
              }

              return (
                <div
                  key={ev.id}
                  onClick={() => navigate(`/events/${ev.id}`)}
                  style={{
                    background:'var(--dash-card)',
                    borderRadius:18,
                    marginBottom:10,
                    overflow:'hidden',
                    cursor:'pointer',
                    border: isToday ? '1.5px solid #fca5a5' : '1.5px solid var(--dash-card-border)',
                    boxShadow:'0 1px 6px rgba(0,0,0,0.05)',
                  }}
                >
                  {isToday && (
                    <div style={{ background:'#fef2f2', padding:'5px 16px', borderBottom:'1px solid #fecaca' }}>
                      <p style={{ color:'#dc2626', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>● Oggi</p>
                    </div>
                  )}
                  <div style={{ padding:'14px 16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:700, fontSize:15, color:'var(--dash-title)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {ev.name}
                        </p>
                        <p style={{ color:'var(--dash-muted)', fontSize:13, marginTop:2 }}>
                          <DateBadge dateStr={ev.date} location={ev.location} today={today} />
                        </p>
                      </div>
                      <span style={{ color:'var(--dash-muted)', flexShrink:0, marginLeft:8 }}><IconChevron /></span>
                    </div>
                    {total > 0 && (
                      <>
                        <div style={{ background:'#f3f4f6', borderRadius:4, height:4, margin:'10px 0 5px', overflow:'hidden' }}>
                          <div style={{ background:barColor, height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.4s ease' }} />
                        </div>
                        <p style={{ fontSize:12, color:statusColor, fontWeight:600 }}>{statusText}</p>
                      </>
                    )}
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
              Vedi tutti gli eventi <IconChevron />
            </button>
          </>
        )}
      </div>

      <style>{`
        /* ── Dashboard light/dark tokens ── */
        :root {
          --surface:           #f5f5f3;
          --dash-title:        #111827;
          --dash-muted:        #6b7280;
          --dash-card:         #ffffff;
          --dash-card-border:  #e5e7eb;
          --dash-pill-bg:      #f3f4f6;
          --dash-pill-border:  #e5e7eb;
        }
        [data-theme="dark"] {
          --surface:           var(--bg);
          --dash-title:        var(--text);
          --dash-muted:        var(--text2);
          --dash-card:         var(--card);
          --dash-card-border:  var(--border2);
          --dash-pill-bg:      var(--card2);
          --dash-pill-border:  var(--border2);
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  )
}
