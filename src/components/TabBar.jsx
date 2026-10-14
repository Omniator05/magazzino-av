import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'

const ICON_HOME      = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
const ICON_CALENDAR  = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
const ICON_EVENTS    = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
const ICON_WAREHOUSE = <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="6" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="4" cy="18" r="1.7"/><rect x="8.5" y="5" width="13" height="2.2" rx="1.1"/><rect x="8.5" y="10.9" width="13" height="2.2" rx="1.1"/><rect x="8.5" y="16.8" width="13" height="2.2" rx="1.1"/></svg>
const ICON_TASK      = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
const ICON_WORK_HOURS = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
// Ghiera d'ingranaggio — la tab "Impostazioni" usava ancora l'icona di
// "Utenti" (due omini), rimasta da prima che la pagina venisse rinominata.
const ICON_SETTINGS  = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04,-0.3,0.06,-0.61,0.06,-0.94c0,-0.32,-0.02,-0.64,-0.07,-0.94l2.03,-1.58c0.18,-0.14,0.23,-0.41,0.12,-0.61l-1.92,-3.32c-0.12,-0.22,-0.37,-0.29,-0.59,-0.22l-2.39,0.96c-0.5,-0.38,-1.03,-0.7,-1.62,-0.94L14.4,2.81c-0.04,-0.24,-0.24,-0.41,-0.48,-0.41h-3.84c-0.24,0,-0.43,0.17,-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22,-0.08,-0.47,0,-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14,-0.23,0.41,-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39,-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44,-0.17,0.47,-0.41l0.36,-2.54c0.59,-0.24,1.13,-0.56,1.62,-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59,-0.22l1.92,-3.32c0.12,-0.22,0.07,-0.47,-0.12,-0.61L19.14,12.94zM12,15.6c-1.98,0,-3.6,-1.62,-3.6,-3.6s1.62,-3.6,3.6,-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>

// Ordine per importanza (app mobile-first)
const adminTabs = [
  { path:'/',            label:'Home',      icon:ICON_HOME },
  { path:'/calendar',   label:'Calendario',icon:ICON_CALENDAR },
  { path:'/events',     label:'Eventi',    icon:ICON_EVENTS },
  { path:'/inventory',  label:'Magazzino', icon:ICON_WAREHOUSE },
  { path:'/admin/settings',label:'Impostazioni', icon:ICON_SETTINGS },
]

// "Ore" (timbratura) si inserisce solo per i lavoratori, e solo col modulo
// attivo (vedi sotto) — per questo non è nell'array statico ma composta a
// runtime, stesso motivo per cui adminTabs non la include mai (l'admin
// registra le proprie ore da una card in Dashboard, non da una tab).
const workerTabsBase = [
  { path:'/',           label:'Home',      icon:ICON_HOME },
  { path:'/calendar',   label:'Calendario',icon:ICON_CALENDAR },
  { path:'/inventory',  label:'Magazzino', icon:ICON_WAREHOUSE },
  { path:'/tasks',      label:'Task',      icon:ICON_TASK },
]
const WORK_HOURS_TAB = { path:'/work-hours', label:'Ore', icon:ICON_WORK_HOURS }

// ── "Lente": barra con tacca ──────────────────────────────────────────────
// La pagina attuale è un cerchio scuro che sporge sopra il bordo della barra
// flottante, dentro una tacca arrotondata (con raccordi morbidi); le altre
// icone sono piccole. Misure in px.
// Telefono / schermi larghi (≥700px): stessa forma, scala ~1.3 su computer.
// padX e rc sono scelti perché la tacca della prima/ultima tab non tocchi gli
// angoli arrotondati (cx0 ≥ rc + larghezza mezza tacca).
const PHONE = { H: 54, D: 52, ring: 5, fillet: 8, cy: 4, dip: 8, icon: 28, padX: 26, rc: 16, bottom: 12 }
const DESKTOP = { H: 70, D: 68, ring: 6, fillet: 10, cy: 5, dip: 10, icon: 34, padX: 40, rc: 24, bottom: 22, width: 600 }
const DURATION = 480      // ms
const TAB_GREY = '#6b7280'

// Colore dell'icona: grigio → bianco man mano che il cerchio le passa sotto.
function mixColor(k) {
  const c = v => Math.round(107 + (255 - 107) * v)
  const d = v => Math.round(114 + (255 - 114) * v)
  const e = v => Math.round(128 + (255 - 128) * v)
  return `rgb(${c(k)},${d(k)},${e(k)})`
}

// Contorno della barra: rettangolo (angoli opzionali) con una tacca circolare
// centrata in (cx, cy) di raggio Rn nel bordo alto, raccordata con archi di
// raggio f. Rn ≈ 0 = nessuna tacca.
function barPath(W, H, rTop, rBot, cx, cy, Rn, f) {
  let d = `M ${rTop},0`
  if (Rn > 2) {
    const k = Rn + f
    const dyc = f - cy
    const off = Math.sqrt(Math.max(k * k - dyc * dyc, 0))
    const fxL = cx - off, fxR = cx + off
    const t = Rn / k
    const pL = { x: cx + (fxL - cx) * t, y: cy + dyc * t }
    const pR = { x: cx + (fxR - cx) * t, y: cy + dyc * t }
    const span = 2 * Math.atan2(Math.abs(pR.x - cx), pR.y - cy)
    const large = span > Math.PI ? 1 : 0
    d += ` H ${fxL} A ${f} ${f} 0 0 1 ${pL.x} ${pL.y} A ${Rn} ${Rn} 0 ${large} 0 ${pR.x} ${pR.y} A ${f} ${f} 0 0 1 ${fxR} 0`
  }
  d += ` H ${W - rTop}`
  if (rTop > 0) d += ` A ${rTop} ${rTop} 0 0 1 ${W} ${rTop}`
  d += ` V ${H - rBot}`
  if (rBot > 0) d += ` A ${rBot} ${rBot} 0 0 1 ${W - rBot} ${H}`
  d += ` H ${rBot}`
  if (rBot > 0) d += ` A ${rBot} ${rBot} 0 0 1 0 ${H - rBot}`
  d += ` V ${rTop}`
  if (rTop > 0) d += ` A ${rTop} ${rTop} 0 0 1 ${rTop} 0`
  return d + ' Z'
}


export default function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profile, user, team } = useAuth()
  const isWorker = profile?.role === 'worker'
  const tabs = isWorker
    ? (isModuleEnabled(team, 'workHours')
        ? [workerTabsBase[0], workerTabsBase[1], WORK_HOURS_TAB, workerTabsBase[2], workerTabsBase[3]]
        : workerTabsBase)
    : adminTabs
  const [openTasks, setOpenTasks] = useState(0)
  const [hasOpenShift, setHasOpenShift] = useState(false)

  useEffect(() => {
    if (!user || !profile?.teamId) return
    return onSnapshot(query(collection(db, 'tasks'), where('teamId', '==', profile.teamId)), snap => {
      const all = snap.docs.map(d => d.data())
      const mine = profile?.role === 'admin'
        ? all
        : all.filter(t => t.assignee === 'all' || t.assignee === user.uid)
      setOpenTasks(mine.filter(t => !t.done).length)
    })
  }, [user, profile?.role, profile?.teamId])

  // Turno di lavoro in corso: la tab "Ore" diventa rossa (come il badge
  // globale) — stesso segnale, un altro posto dove non passa inosservato.
  // Solo equality, nessun orderBy: non serve un indice composito in più.
  useEffect(() => {
    if (!user || !profile?.teamId || !isModuleEnabled(team, 'workHours')) { setHasOpenShift(false); return }
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', profile.teamId), where('workerId', '==', user.uid))
    return onSnapshot(q, snap => setHasOpenShift(snap.docs.some(d => !d.data().clockOut)))
  }, [user, profile?.teamId, team?.modules?.workHours])

  const activeIndex = tabs.findIndex(t =>
    pathname === t.path || (t.path !== '/' && pathname.startsWith(t.path))
  )

  // Sempre una barra FLOTTANTE, centrata e staccata dal fondo: sul telefono
  // larga quasi tutto lo schermo (12px di margine per lato), su schermi larghi
  // 460px. padX e raggio sono scelti perché la tacca della prima/ultima tab
  // non tocchi mai gli angoli arrotondati.
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const wide = vw >= 700
  const m = wide ? DESKTOP : PHONE
  const barW = wide ? m.width : vw - 24
  const { padX, rc } = m
  const n = tabs.length
  const usable = barW - padX * 2
  const slotW = usable / n

  // Posizione ANIMATA del "cerchio": pos è un indice frazionario (0 = prima
  // tab) e vis la sua presenza (0 = nessuna tab attiva). Tutto — il cerchio, la
  // tacca nella barra e il sollevarsi di ogni icona — è calcolato dallo stesso
  // pos a ogni frame, così restano sempre in sincronia (nessun CSS che
  // scorre per conto suo): il cerchio passa sopra le icone come una lente e
  // ognuna sale/scende a seconda di quanto ci è sotto.
  const pathRef = useRef(null)
  const circleRef = useRef(null)
  const holeRef = useRef(null)
  const iconRefs = useRef([])
  const anim = useRef({ pos: Math.max(activeIndex, 0), vis: activeIndex >= 0 ? 1 : 0, raf: 0, ready: false })

  const render = (pos, vis, dip) => {
    const cx = padX + usable * (pos + 0.5) / n
    const cy = m.cy + dip
    const Rn = (m.D / 2 + m.ring) * vis
    pathRef.current?.setAttribute('d', barPath(barW, m.H, rc, rc, cx, cy, Rn, m.fillet))
    if (holeRef.current) { holeRef.current.setAttribute('cx', cx); holeRef.current.setAttribute('cy', cy); holeRef.current.setAttribute('r', Math.max(Rn, 0)) }
    if (circleRef.current) {
      circleRef.current.style.transform = `translate(${cx - m.D / 2}px, ${cy - m.D / 2}px) scale(${vis})`
    }
    iconRefs.current.forEach((el, i) => {
      if (!el) return
      const prox = Math.max(0, 1 - Math.abs(i - pos)) * vis
      const lift = (m.H / 2 - cy) * prox
      el.style.transform = `translateY(${-lift}px) scale(${0.74 + 0.26 * prox})`
      el.style.color = el.dataset.shift === '1' ? 'var(--accent)' : mixColor(prox)
    })
  }

  useLayoutEffect(() => {
    const st = anim.current
    cancelAnimationFrame(st.raf)
    const toPos = activeIndex >= 0 ? activeIndex : st.pos
    const toVis = activeIndex >= 0 ? 1 : 0
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const first = !st.ready
    st.ready = true
    if (first || reduce || (st.pos === toPos && st.vis === toVis)) {
      st.pos = toPos; st.vis = toVis
      render(st.pos, st.vis, 0)
      return
    }
    const from = { pos: st.pos, vis: st.vis }
    const moves = from.pos !== toPos && from.vis > 0.5 && toVis > 0.5
    const t0 = performance.now()
    const step = now => {
      const k = Math.min((now - t0) / DURATION, 1)
      const e = 1 - Math.pow(1 - k, 4)
      st.pos = from.pos + (toPos - from.pos) * e
      st.vis = from.vis + (toVis - from.vis) * e
      // Durante lo spostamento il cerchio "si tuffa" un attimo nella barra e
      // poi risale sul punto d'arrivo.
      render(st.pos, st.vis, moves ? m.dip * Math.sin(Math.PI * k) : 0)
      if (k < 1) st.raf = requestAnimationFrame(step)
    }
    st.raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(st.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  // Cambi di larghezza/numero di tab: ridisegna ferma sulla posizione attuale.
  useLayoutEffect(() => {
    render(anim.current.pos, anim.current.vis, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barW, n, wide])

  return (
    <nav className="tabbar-nav" style={{
      position:'fixed', zIndex:100, width: barW,
      left:'50%', transform:'translateX(-50%)',
      bottom: `calc(env(safe-area-inset-bottom) + ${m.bottom}px)`,
      '--ftab-icon': `${m.icon}px`,
    }}>
      <div style={{ position:'relative', height: m.H }}>
        <svg width={barW} height={m.H} aria-hidden="true"
          style={{ position:'absolute', left:0, top:0, overflow:'visible', filter:'drop-shadow(0 8px 22px rgba(34,44,66,0.18))' }}>
          <path ref={pathRef} fill="#fff" />
          {/* Dentro la tacca la pagina sotto (testo che scorre) darebbe
              fastidio: un disco del colore dello sfondo, limitato alla
              fascia della barra, la nasconde — sopra il bordo il cerchio
              resta libero, solo con la sua ombra. */}
          <clipPath id="ftab-clip"><rect x="0" y="0" width={barW} height={m.H} /></clipPath>
          <circle ref={holeRef} fill="#f5f5f3" clipPath="url(#ftab-clip)" />
        </svg>
        <span ref={circleRef} aria-hidden="true" style={{
          position:'absolute', left:0, top:0, width: m.D, height: m.D, borderRadius:'50%', zIndex:2, pointerEvents:'none',
          background:'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)', boxShadow:'0 6px 16px rgba(34,44,66,0.32)',
          transformOrigin:'50% 50%', willChange:'transform',
        }} />
        {tabs.map((t, i) => {
          const active = i === activeIndex
          const isRunningShift = t.path === '/work-hours' && hasOpenShift
          return (
            <button
              key={t.path}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              className="ftab-btn btn-no-anim"
              onClick={() => navigate(t.path)}
              style={{ position:'absolute', top:0, left: padX + slotW * i, width: slotW, height: m.H, zIndex:3 }}
            >
              <span ref={el => { iconRefs.current[i] = el }} data-shift={isRunningShift ? '1' : '0'} className="ftab-ico"
                style={{ display:'flex', position:'relative', willChange:'transform', color: isRunningShift ? 'var(--accent)' : TAB_GREY }}>
                <span className="ftab-ico-in">{t.icon}</span>
                {t.path === '/tasks' && openTasks > 0 && (
                  <span className="ftab-badge">{openTasks}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <style>{`
        .ftab-btn {
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer; padding: 0;
          outline: none; -webkit-tap-highlight-color: transparent;
          -webkit-appearance: none; appearance: none;
        }
        .ftab-btn:focus { outline: none; }
        .ftab-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; border-radius: 14px; }
        /* Hover: solo l'icona si ingrandisce un po' (niente riquadro/ombra sul
           bottone — vedi btn-no-anim). Il wrapper esterno è mosso da JS
           (sollevamento/scala della lente), questo interno è solo hover. */
        .ftab-ico-in { display: flex; transition: transform 0.18s ease-out; }
        @media (hover: hover) and (pointer: fine) {
          .ftab-btn:hover .ftab-ico-in { transform: scale(1.22); }
        }
        .ftab-btn:active .ftab-ico-in { transform: scale(1.08); }
        .ftab-ico svg { width: var(--ftab-icon, 28px); height: var(--ftab-icon, 28px); display: block; }
        .ftab-badge {
          position: absolute; top: -5px; right: -9px;
          background: var(--accent); color: #fff; border-radius: 10px;
          font-size: 10.5px; font-weight: 800; min-width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; line-height: 1; border: 1.5px solid #fff; box-sizing: border-box;
        }
      `}</style>
    </nav>
  )
}
