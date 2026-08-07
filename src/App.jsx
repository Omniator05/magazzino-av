import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmProvider'
import { useState, useEffect, useRef } from 'react'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import Welcome from './pages/Welcome'
import PendingApproval from './pages/PendingApproval'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import AdminUsers from './pages/AdminUsers'
import SuperAdmin from './pages/SuperAdmin'
import Vehicles from './pages/Vehicles'
import Archive from './pages/Archive'
import Tasks from './pages/Tasks'
import Templates from './pages/Templates'
import Calendar from './pages/Calendar'
import WorkerHome from './pages/WorkerHome'
import WorkerScanner from './pages/WorkerScanner'
import WorkerInventory from './pages/WorkerInventory'
import WorkerCalendar from './pages/WorkerCalendar'
import Brasserie from './pages/Brasserie'
import EventOrganizerHome from './pages/EventOrganizerHome'
import TabBar from './components/TabBar'
import LoadingBar from './components/LoadingBar'
import PageTransition from './components/PageTransition'
import OnboardingReveal from './components/OnboardingReveal'
import BillingGate from './components/BillingGate'
import QrRedirect from './components/QrRedirect'
import UpdateToast from './components/UpdateToast'
import { isBillingValid } from './utils/billing'

// Barra sempre visibile mentre un super admin sta "dentro" un'altra azienda
// (vedi enterGhostTeam in AuthContext) — promemoria costante di dove si è,
// con uscita immediata a un tap.
function GhostBanner() {
  const { ghostTeamId, exitGhostTeam, team } = useAuth()
  const navigate = useNavigate()
  if (!ghostTeamId) return null
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, zIndex:2000,
      background:'#111827', color:'white',
      padding:'calc(env(safe-area-inset-top) + 8px) 14px 8px',
      display:'flex', alignItems:'center', justifyContent:'center', gap:10,
      fontSize:12.5, fontWeight:700, boxShadow:'0 2px 12px rgba(0,0,0,0.3)',
    }}>
      <span>👻 {team?.name || '…'}</span>
      <button onClick={() => { exitGhostTeam(); navigate('/super') }} style={{
        background:'rgba(255,255,255,0.15)', color:'white', border:'none',
        borderRadius:8, padding:'3px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer',
      }}>
        Esci
      </button>
    </div>
  )
}

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
  const { user, profile, team, loading, signupInProgress, ghostTeamId } = useAuth()
  const { pathname, search } = useLocation()
  const onScannerRoute = pathname.endsWith('/scan')
  const onSuperAdminRoute = pathname === '/super'
  const onWelcomeRoute = pathname === '/welcome'

  // QR di magazzino scansionato con la fotocamera normale del telefono
  // (fuori dall'app): esce subito verso il sito della squadra o quello
  // dell'app, PRIMA di qualunque controllo su login/ruolo — non ha senso
  // provare a instradarlo dentro l'app. Vedi src/components/QrRedirect.jsx.
  if (pathname === '/' && search) {
    const qrCode = new URLSearchParams(search).get('c')
    if (qrCode) return <QrRedirect teamId={new URLSearchParams(search).get('t')} />
  }

  // Durante il signup l'utente Auth esiste già ma il profilo arriva un attimo
  // dopo: senza questa attesa comparirebbe per un secondo la pagina "errore
  // con questo account" prima della Dashboard.
  if (loading || (signupInProgress && !profile)) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(233,69,96,0.3)', borderTop:'3px solid #e94560', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#9090b0', fontSize:14 }}>Caricamento...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // Chi arriva sulla home senza essere loggato vede la pagina pubblica
  // (presentazione prodotto/prezzo — serve sia ai clienti che a chi deve
  // verificare l'attività, es. Stripe); qualunque altro link diretto (es.
  // /inventory condiviso per errore) va comunque dritto al login.
  if (!user) return pathname === '/' ? <Landing /> : <Navigate to="/login" replace />

  // Profilo mancante (utente Auth orfano, senza doc in profiles) — mai deve
  // ricadere sul ramo admin di default: mostra errore invece di dare accesso.
  if (!profile) return <PendingApproval reason="unknown" />

  // In attesa di approvazione (self-signup "unisciti a squadra") o account
  // disattivato da un admin — bloccato prima di qualunque route applicativa.
  if (profile.approved === false) return <PendingApproval reason="pending" />
  if (profile.active === false)   return <PendingApproval reason="inactive" />

  const KNOWN_ROLES = ['admin', 'worker', 'organizzatore-brasserie', 'organizzatore-evento']
  if (!KNOWN_ROLES.includes(profile.role)) return <PendingApproval reason="unknown" />

  // Abbonamento scaduto/non pagato → blocca TUTTA l'app (qualunque ruolo),
  // tranne il super admin che deve poter sempre entrare per assistere/sbloccare
  // (stessa eccezione delle regole Firestore, vedi hasValidBilling).
  if (!profile.superAdmin && !isBillingValid(team)) return <BillingGate />

  // Worker view
  if (profile?.role === 'worker') {
    return (
      <>
        <UpdateToast />
        <AnimatedPage>
          <Routes>
            <Route path="/" element={<WorkerHome />} />
            {/* Magazziniere "senior": stesso ruolo, un permesso in più impostato
                dall'admin per singolo utente (AdminUsers.jsx) — vede il
                magazzino completo (aggiungi/modifica/elimina, etichette,
                bauli, rotture) invece della vista di sola consultazione.
                Pensato per chi lavora davvero il magazzino ma non deve avere
                accesso a utenti/fatturazione/impostazioni squadra. */}
            <Route path="/inventory" element={profile?.canManageInventory ? <Inventory /> : <WorkerInventory />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<WorkerCalendar />} />
            <Route path="/events/:id" element={<WorkerScanner />} />
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
      <>
        <UpdateToast />
        <AnimatedPage>
          <Routes>
            <Route path="/" element={<Brasserie />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatedPage>
      </>
    )
  }

  // Organizzatore evento (generico, un evento specifico) — accesso solo alla propria sezione, nessuna tab bar
  if (profile?.role === 'organizzatore-evento') {
    return (
      <>
        <UpdateToast />
        <AnimatedPage>
          <Routes>
            <Route path="/" element={<EventOrganizerHome />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatedPage>
      </>
    )
  }

  // Admin view — unico ramo rimasto: role è garantito 'admin' dal controllo
  // KNOWN_ROLES sopra (nessun fallback implicito su ruoli sconosciuti).
  // Il super admin resta sempre in questo ramo anche in modalità ghost (il
  // suo profile.role non cambia mai): il banner segnala solo dove opera.

  // Un super admin non deve mai vedere la propria dashboard personale prima
  // di aver scelto (o auto-scelto, se ce n'è una sola — vedi AuthContext)
  // un'azienda in cui operare: finché non l'ha fatto resta su /super.
  if (profile?.superAdmin && !ghostTeamId && pathname !== '/super') {
    return <Navigate to="/super" replace />
  }

  return (
    <>
      <UpdateToast />
      <GhostBanner />
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
          <Route path="/super" element={<SuperAdmin />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatedPage>
      {!onScannerRoute && !onSuperAdminRoute && !onWelcomeRoute && <TabBar toggleTheme={toggleTheme} theme={theme} />}
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
          <OnboardingReveal />
          <Routes>
            <Route path="/login" element={<Auth initialMode="login" />} />
            <Route path="/signup" element={<Auth initialMode="signup" />} />
            <Route path="/*" element={<PrivateRoutes toggleTheme={toggleTheme} theme={theme} />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  )
}
