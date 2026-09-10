import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
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

  return (
    <nav style={{
      position:'fixed', left:'50%', bottom:'calc(env(safe-area-inset-bottom) + 44px)',
      transform:'translateX(-50%)', zIndex:100,
    }}>
      <div className="ftabs" style={{ '--active-index': activeIndex }}>
        {/* Glider */}
        {activeIndex >= 0 && <span className="ftab-glider" />}

        {tabs.map((t, i) => {
          const active = i === activeIndex
          const isRunningShift = t.path === '/work-hours' && hasOpenShift
          return (
            <button
              key={t.path}
              aria-label={t.label}
              className="ftab-btn"
              onClick={() => navigate(t.path)}
              style={{ color: isRunningShift ? 'var(--accent)' : active ? '#fff' : 'var(--text2)' }}
            >
              <span className="ftab-icon" style={{ display:'flex' }}>{t.icon}</span>
              {t.path === '/tasks' && openTasks > 0 && (
                <span className="ftab-badge">{openTasks}</span>
              )}
            </button>
          )
        })}
      </div>

      <style>{`
        .ftabs {
          --tab-w: 62px; --tab-h: 54px; --tab-pad: 8px; --tab-gap: 6px;
          position: relative; display: flex; gap: var(--tab-gap); padding: var(--tab-pad); border-radius: 99px;
          background: rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.40);
          backdrop-filter: blur(18px) saturate(180%);
          -webkit-backdrop-filter: blur(18px) saturate(180%);
          box-shadow: 0 1px 2px rgba(34,44,66,0.10), 0 10px 30px rgba(34,44,66,0.16);
        }
        .ftab-glider {
          position: absolute; top: var(--tab-pad); left: var(--tab-pad);
          width: var(--tab-w); height: var(--tab-h); border-radius: 99px; z-index: 1;
          background: linear-gradient(135deg,#3b4a66 0%,#222c42 100%);
          box-shadow: 0 4px 14px rgba(34,44,66,0.30);
          transform: translateX(calc((var(--tab-w) + var(--tab-gap)) * var(--active-index)));
          transition: transform 0.28s cubic-bezier(0.34,1.2,0.64,1);
        }
        .ftab-btn {
          position: relative; z-index: 2;
          width: var(--tab-w); height: var(--tab-h);
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer; padding: 0;
          border-radius: 99px; outline: none; -webkit-tap-highlight-color: transparent;
          -webkit-appearance: none; appearance: none;
          transition: color 0.2s ease;
        }
        .ftab-btn:focus { outline: none; }
        .ftab-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        /* Hover solo su dispositivi con mouse: su touch il :hover "rimane attaccato" e ruba il primo tap */
        @media (hover: hover) and (pointer: fine) {
          .ftab-btn:not(:disabled):hover {
            background: rgba(0,0,0,0.06);
            box-shadow: none; transform: none; filter: none;
          }
        }
        .ftab-icon svg { width: 28px; height: 28px; display: block; }
        .ftab-badge {
          position: absolute; top: 4px; right: 5px;
          background: var(--accent); color: #fff; border-radius: 11px;
          font-size: 11px; font-weight: 800; min-width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; line-height: 1;
        }
        @media (min-width: 700px) {
          .ftabs { --tab-w: 72px; --tab-h: 58px; --tab-pad: 9px; --tab-gap: 7px; }
          .ftab-icon svg { width: 30px; height: 30px; }
          .ftab-badge { top: 5px; right: 9px; font-size: 12px; min-width: 21px; height: 21px; }
        }
      `}</style>
    </nav>
  )
}
