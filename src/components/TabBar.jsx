import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query } from 'firebase/firestore'

const adminTabs = [
  { path:'/',            label:'Home',      icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> },
  { path:'/inventory',  label:'Magazzino', icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.52 15.5 0 12.36 0c-1.73 0-3.25.92-4.16 2.27L12 6H4.5L3 4H1v2h1l3 6.92V18c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8l1-2V6h-2z"/></svg> },
  { path:'/scanner',    label:'Scanner',   icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg> },
  { path:'/events',     label:'Eventi',    icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg> },
  { path:'/tasks',      label:'Task',      icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> },
  { path:'/admin/users',label:'Utenti',    icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg> },
]

const workerTabs = [
  { path:'/',           label:'Home',      icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> },
  { path:'/inventory',  label:'Magazzino', icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.52 15.5 0 12.36 0c-1.73 0-3.25.92-4.16 2.27L12 6H4.5L3 4H1v2h1l3 6.92V18c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8l1-2V6h-2z"/></svg> },
  { path:'/tasks',      label:'Task',      icon:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> },
]

export default function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profile, user } = useAuth()
  const tabs = profile?.role === 'worker' ? workerTabs : adminTabs
  const [openTasks, setOpenTasks] = useState(0)

  useEffect(() => {
    if (!user) return
    return onSnapshot(query(collection(db, 'tasks')), snap => {
      const all = snap.docs.map(d => d.data())
      const mine = profile?.role === 'admin'
        ? all
        : all.filter(t => t.assignee === 'all' || t.assignee === user.uid)
      setOpenTasks(mine.filter(t => !t.done).length)
    })
  }, [user, profile?.role])

  return (
    <nav className="tab-bar">
      {tabs.map(t => (
        <button
          key={t.path}
          className={pathname === t.path || (t.path !== '/' && pathname.startsWith(t.path)) ? 'active' : ''}
          onClick={() => navigate(t.path)}
          style={{ position:'relative' }}
        >
          {t.icon}
          {t.label}
          {t.path === '/tasks' && openTasks > 0 && (
            <span style={{ position:'absolute', top:6, right:'calc(50% - 18px)', background:'var(--accent)', color:'white', borderRadius:10, fontSize:9, fontWeight:800, padding:'1px 5px', lineHeight:1.4 }}>
              {openTasks}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
