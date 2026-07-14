import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmProvider'
import { useState, useEffect, useRef } from 'react'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PendingApproval from './pages/PendingApproval'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import AdminUsers from './pages/AdminUsers'
import Archive from './pages/Archive'
import Tasks from './pages/Tasks'
import Templates from './pages/Templates'
import Calendar from './pages/Calendar'
import WorkerHome from './pages/WorkerHome'
import WorkerScanner from './pages/WorkerScanner'
import WorkerInventory from './pages/WorkerInventory'
import WorkerCalendar from './pages/WorkerCalendar'
import Profile from './pages/Profile'
import Brasserie from './pages/Brasserie'
import EventOrganizerHome from './pages/EventOrganizerHome'
import TabBar from './components/TabBar'
import LoadingBar from './components/LoadingBar'
import PageTransition from './components/PageTransition'

/* Wrapper che riattiva l'animazione ad ogni cambio di route */
function AnimatedPage({ children }) {
  const { pathname } = useLocation()
  const [key, setKey] = useState(pathname)
  const prev = useRef(pathname)

  useEffect(() => {
    // Ignora cambio da/verso /login (gestito dall'overlay PageTransition)
    const isLoginChange = prev.current === '/login' || pathname === '/login'
    if (!isLoginChange && prev.current !== pathname) {
      setKey(pathname)
    }
    prev.current = pathname
  }, [pathname])

  return (
    <div key={key} className="page-transition">
      {children}
    </div>
  )
}

function PrivateRoutes({ toggleTheme, theme }) {
  const { user, profile, loading } = useAuth()
  const { pathname } = useLocation()
  const onScannerRoute = pathname.endsWith('/scan')

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(233,69,96,0.3)', borderTop:'3px solid #e94560', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#9090b0', fontSize:14 }}>Caricamento...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  // Profilo mancante (utente Auth orfano, senza doc in profiles) — mai deve
  // ricadere sul ramo admin di default: mostra errore invece di dare accesso.
  if (!profile) return <PendingApproval reason="unknown" />

  // In attesa di approvazione (self-signup "unisciti a squadra") o account
  // disattivato da un admin — bloccato prima di qualunque route applicativa.
  if (profile.approved === false) return <PendingApproval reason="pending" />
  if (profile.active === false)   return <PendingApproval reason="inactive" />

  const KNOWN_ROLES = ['admin', 'worker', 'organizzatore-brasserie', 'organizzatore-evento']
  if (!KNOWN_ROLES.includes(profile.role)) return <PendingApproval reason="unknown" />

  // Worker view
  if (profile?.role === 'worker') {
    return (
      <>
        <AnimatedPage>
          <Routes>
            <Route path="/" element={<WorkerHome />} />
            <Route path="/inventory" element={<WorkerInventory />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<WorkerCalendar />} />
            <Route path="/events/:id" element={<WorkerScanner />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatedPage>
        {!onScannerRoute && <TabBar />}
      </>
    )
  }

  // Organizzatore Brasserie — accesso solo alla propria sezione, nessuna tab bar
  if (profile?.role === 'organizzatore-brasserie') {
    return (
      <AnimatedPage>
        <Routes>
          <Route path="/" element={<Brasserie />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatedPage>
    )
  }

  // Organizzatore evento (generico, un evento specifico) — accesso solo alla propria sezione, nessuna tab bar
  if (profile?.role === 'organizzatore-evento') {
    return (
      <AnimatedPage>
        <Routes>
          <Route path="/" element={<EventOrganizerHome />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatedPage>
    )
  }

  // Admin view — unico ramo rimasto: role è garantito 'admin' dal controllo
  // KNOWN_ROLES sopra (nessun fallback implicito su ruoli sconosciuti).
  return (
    <>
      <AnimatedPage>
        <Routes>
          <Route path="/" element={<Dashboard toggleTheme={toggleTheme} theme={theme} />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/events" element={<Events />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/events/:id/scan" element={<WorkerScanner />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatedPage>
      {!onScannerRoute && <TabBar toggleTheme={toggleTheme} theme={theme} />}
    </>
  )
}

export default function App() {
  // Tema fisso chiaro (toggle modalità notturna rimosso)
  const theme = 'light'
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.setItem('theme', 'light')
  }, [])

  const toggleTheme = () => {}

  return (
    <AuthProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <LoadingBar />
          <PageTransition />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/*" element={<PrivateRoutes toggleTheme={toggleTheme} theme={theme} />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  )
}
