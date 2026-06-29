import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import DateBadge from '../components/DateBadge'
import LogoutButton from '../components/LogoutButton'
import { Pin } from '../components/Icon'

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

  const todayLabel = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })

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

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:110 }}>

      {/* ── Header hero (card) ──────────────────────────────── */}
      <div style={{ position:'relative', overflow:'hidden', background:_bg, margin:'calc(env(safe-area-inset-top) + 24px) 16px 20px', padding:'26px 22px', borderRadius:26, boxShadow:'0 12px 32px rgba(34,44,66,0.26)' }}>
        {/* Orb decorativi */}
        <div style={{ position:'absolute', top:'-55%', right:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 65%)', animation:'dashOrb1 14s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-70%', left:'-5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,0,0,0.2) 0%, transparent 65%)', animation:'dashOrb2 18s ease-in-out infinite', pointerEvents:'none' }} />

        {/* Sole / Luna */}
        <div style={{
          position:'absolute', pointerEvents:'none', zIndex:0,
          left:`${_cx}%`, top:`${_cy}%`,
          transform:'translate(-50%,-50%)',
          width: _isDay ? 100 : 72,
          height: _isDay ? 100 : 72,
          borderRadius:'50%',
          background: _isDay
            ? 'radial-gradient(circle, rgba(255,230,100,0.95) 0%, rgba(255,190,50,0.65) 45%, transparent 72%)'
            : 'radial-gradient(circle, rgba(210,220,255,0.90) 0%, rgba(170,190,245,0.55) 45%, transparent 72%)',
          filter:`blur(${_isDay ? 22 : 17}px)`,
        }} />

        {/* Stelle (notte) */}
        {!_isDay && [
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
            background:'white', animation:`dashStarTwinkle ${s.dur} ease-in-out infinite ${s.d}` }} />
        ))}

        {/* Nuvole (giorno) */}
        {_isDay && [
          { l:'-12%', t:'22%', w:88, h:26, op:0.09, dur:'28s', d:'0s' },
          { l:'35%',  t:'55%', w:68, h:20, op:0.07, dur:'40s', d:'-15s' },
          { l:'62%',  t:'8%',  w:54, h:18, op:0.08, dur:'33s', d:'-8s' },
        ].map((c,i) => (
          <div key={i} style={{ position:'absolute', pointerEvents:'none', zIndex:0,
            left:c.l, top:c.t, width:c.w, height:c.h, borderRadius:'50%',
            background:'white', opacity:c.op, filter:'blur(9px)',
            animation:`dashCloudDrift ${c.dur} linear infinite ${c.d}` }} />
        ))}

        {/* Riga principale */}
        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:15, flex:1, minWidth:0 }}>
            <button onClick={() => navigate('/profile')} style={{ flexShrink:0, width:58, height:58, borderRadius:18, background:'rgba(255,255,255,0.16)', border:'1px solid rgba(255,255,255,0.28)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: profile?.avatar ? 30 : 25, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
              {profile?.avatar || name.charAt(0).toUpperCase()}
            </button>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.78)', fontWeight:600, letterSpacing:'0.04em', marginBottom:2 }}>{greeting()}</p>
              <h1 style={{ fontSize:28, fontWeight:800, color:'white', lineHeight:1.08, letterSpacing:'-0.5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</h1>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.72)', fontWeight:500, marginTop:4, textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}</p>
            </div>
          </div>
          <LogoutButton name={name} style={{
            flexShrink:0,
            background:'rgba(255,255,255,0.16)',
            border:'1px solid rgba(255,255,255,0.3)',
            color:'white',
            borderRadius:12,
            padding:'9px 16px',
            fontSize:13,
            fontWeight:700,
            cursor:'pointer',
          }} />
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
            <button onClick={() => navigate('/inventory', { state: { filter: 'broken' } })} className="btn-no-anim" style={{
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
            <button onClick={() => navigate('/inventory', { state:{ filter:'reorder' } })} className="btn-no-anim" style={{
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
              const isToday = ev.date === today
              const iconGradient = isToday
                ? 'linear-gradient(135deg,#dc2626,#9333ea)'
                : 'linear-gradient(135deg,#9ca3af,#6b7280)'
              const cardBorder = isToday ? '1.5px solid #fca5a5' : '1.5px solid var(--dash-card-border)'
              const dateLabel = ev.date
                ? new Date(ev.date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})
                : ''
              const dateEndLabel = ev.dateEnd && ev.dateEnd !== ev.date
                ? ' — ' + new Date(ev.dateEnd+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'})
                : ''

              return (
                <div
                  key={ev.id}
                  onClick={() => navigate(`/events/${ev.id}`)}
                  className={isToday ? 'evt-card evt-today' : 'evt-card evt-soft'}
                  style={{ marginBottom:10, background:'var(--dash-card)', border: isToday ? '1.5px solid transparent' : cardBorder, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 14px 10px 10px', gap:12, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', transition:'transform 0.18s ease,box-shadow 0.18s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)' }}
                >
                  {/* Icona gradiente con data */}
                  <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
                    <div style={{ width:52, height:52, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
                      <span style={{ fontSize:20, fontWeight:800 }}>{ev.date ? new Date(ev.date+'T12:00:00').getDate() : '?'}</span>
                      <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
                        {ev.date ? new Date(ev.date+'T12:00:00').toLocaleDateString('it-IT',{month:'short'}) : ''}
                      </span>
                    </div>
                    {ev.seriesId && (
                      <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--dash-card)' }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Testo */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:15, color:'var(--dash-title)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{ev.name}</p>
                    </div>
                    <p style={{ fontSize:12, fontWeight:500, color:'var(--dash-muted)' }}>{dateLabel}{dateEndLabel}</p>
                    {ev.location && <p style={{ fontSize:11, color:'var(--dash-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
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
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes dashOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,16px) scale(1.1)} }
        @keyframes dashOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(22px,-14px) scale(0.92)} }
        @keyframes dashStarTwinkle { 0%,100%{opacity:0.85;transform:scale(1)} 50%{opacity:0.15;transform:scale(0.5)} }
        @keyframes dashCloudDrift { from{transform:translateX(0)} to{transform:translateX(130vw)} }

        /* ── Bordo gradiente rotante sulle card evento ── */
        @property --evtAngle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes evtSpin { to { --evtAngle: 360deg; } }

        .evt-card { position: relative; }
        /* Bordo nitido (anello sottile) */
        .evt-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 1.5px;
          pointer-events: none;
          z-index: 1;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
        }
        /* Glow tenue, aderente al bordo rotante */
        .evt-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          z-index: -1;
          filter: blur(3.5px);
          pointer-events: none;
        }
        .evt-today::before, .evt-today::after {
          background: conic-gradient(from var(--evtAngle),
            #dc2626, #f59e0b, #9333ea, #4f46e5, #06b6d4, #dc2626);
          animation: evtSpin 4s linear infinite;
        }
        .evt-today::after { opacity: 0.3; }
        .evt-soft::before, .evt-soft::after {
          background: conic-gradient(from var(--evtAngle),
            rgba(37,99,235,0.55), rgba(148,163,184,0.12), rgba(37,99,235,0.55));
          animation: evtSpin 10s linear infinite;
        }
        .evt-soft::after { opacity: 0.18; }

        @media (prefers-reduced-motion:reduce){
          [style*="dashOrb"]{animation:none!important}
          .evt-card::before, .evt-card::after { animation:none!important }
        }
      `}</style>
    </div>
  )
}
