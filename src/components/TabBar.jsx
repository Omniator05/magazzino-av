import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

const ICON_HOME      = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
const ICON_CALENDAR  = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
const ICON_EVENTS    = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
const ICON_WAREHOUSE = <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="6" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="4" cy="18" r="1.7"/><rect x="8.5" y="5" width="13" height="2.2" rx="1.1"/><rect x="8.5" y="10.9" width="13" height="2.2" rx="1.1"/><rect x="8.5" y="16.8" width="13" height="2.2" rx="1.1"/></svg>
const ICON_USERS     = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
const ICON_TASK      = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>

// Ordine per importanza (app mobile-first)
const adminTabs = [
  { path:'/',            label:'Home',      icon:ICON_HOME },
  { path:'/calendar',   label:'Calendario',icon:ICON_CALENDAR },
  { path:'/events',     label:'Eventi',    icon:ICON_EVENTS },
  { path:'/inventory',  label:'Magazzino', icon:ICON_WAREHOUSE },
  { path:'/admin/users',label:'Utenti',    icon:ICON_USERS },
]

const workerTabs = [
  { path:'/',           label:'Home',      icon:ICON_HOME },
  { path:'/calendar',   label:'Calendario',icon:ICON_CALENDAR },
  { path:'/inventory',  label:'Magazzino', icon:ICON_WAREHOUSE },
  { path:'/tasks',      label:'Task',      icon:ICON_TASK },
]

export default function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profile, user } = useAuth()
  const tabs = profile?.role === 'worker' ? workerTabs : adminTabs
  const [openTasks, setOpenTasks] = useState(0)

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
          return (
            <button
              key={t.path}
              aria-label={t.label}
              className="ftab-btn"
              onClick={() => navigate(t.path)}
              style={{ color: active ? '#fff' : 'var(--text2)' }}
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
