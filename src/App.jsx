import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmProvider'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
// Pagine caricate on-demand (React.lazy), non tutte insieme in un unico
// bundle da 900KB: prima ogni pagina — anche quelle che un dato utente non
// aprirà mai (super admin, fatturazione, brasserie...) — veniva scaricata al
// primo avvio dell'app. Ora ognuna diventa un proprio chunk, richiesto solo
// quando si naviga davvero lì.
const Auth = lazy(() => import('./pages/Auth'))
const Landing = lazy(() => import('./pages/Landing'))
const Welcome = lazy(() => import('./pages/Welcome'))
const PendingApproval = lazy(() => import('./pages/PendingApproval'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Events = lazy(() => import('./pages/Events'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const Scanner = lazy(() => import('./pages/Scanner'))
const Settings = lazy(() => import('./pages/Settings'))
const SettingsProfile = lazy(() => import('./pages/SettingsProfile'))
const SettingsModules = lazy(() => import('./pages/SettingsModules'))
const SettingsBilling = lazy(() => import('./pages/SettingsBilling'))
const SettingsUsers = lazy(() => import('./pages/SettingsUsers'))
const SettingsIntegrations = lazy(() => import('./pages/SettingsIntegrations'))
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'))
const Vehicles = lazy(() => import('./pages/Vehicles'))
const Archive = lazy(() => import('./pages/Archive'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Templates = lazy(() => import('./pages/Templates'))
const Calendar = lazy(() => import('./pages/Calendar'))
const WorkerHome = lazy(() => import('./pages/WorkerHome'))
const WorkerScanner = lazy(() => import('./pages/WorkerScanner'))
const WorkerInventory = lazy(() => import('./pages/WorkerInventory'))
const WorkerCalendar = lazy(() => import('./pages/WorkerCalendar'))
const Brasserie = lazy(() => import('./pages/Brasserie'))
const EventOrganizerHome = lazy(() => import('./pages/EventOrganizerHome'))
const NotFound = lazy(() => import('./pages/NotFound'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'))
import TabBar from './components/TabBar'
import LoadingBar from './components/LoadingBar'
import PageTransition from './components/PageTransition'
import OnboardingReveal from './components/OnboardingReveal'
import BillingGate from './components/BillingGate'
import QrRedirect from './components/QrRedirect'
import UpdateToast from './components/UpdateToast'
import AbsenceNotifications from './components/AbsenceNotifications'

// Riusato sia mentre si aspettano i dati di login sia come fallback di
// Suspense per il caricamento lazy di una pagina — stesso spinner ovunque.
function RouteLoadingFallback() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', flexDirection:'column', gap:16, background:'var(--bg)' }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(230,57,70,0.3)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'var(--text2)', fontSize:14 }}>Caricamento...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

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
  if (loading || (signupInProgress && !profile)) return <RouteLoadingFallback />

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

  // Pagamento fallito (era abbonato, la carta non è passata) → blocca TUTTA
  // l'app finché non lo sistema, tranne il super admin che deve poter sempre
  // entrare per assistere/sbloccare (stessa eccezione delle regole Firestore,
  // vedi hasValidBilling). Prova scaduta o abbonamento cancellato NON
  // bloccano più: da qui in poi la squadra opera nella versione gratuita
  // (limiti applicati punto per punto, vedi src/utils/planLimits.js) invece
  // di restare fuori dall'app del tutto.
  if (!profile.superAdmin && team?.billingStatus === 'past_due') return <BillingGate />

  // Worker view
  if (profile?.role === 'worker') {
    return (
      <>
        <UpdateToast />
        <AnimatedPage>
          <Routes>
            <Route path="/" element={<WorkerHome />} />
            {/* Magazziniere "senior": stesso ruolo, un permesso in più impostato
                dall'admin per singolo utente (Settings.jsx) — vede il
                magazzino completo (aggiungi/modifica/elimina, etichette,
                bauli, rotture) invece della vista di sola consultazione.
                Pensato per chi lavora davvero il magazzino ma non deve avere
                accesso a utenti/fatturazione/impostazioni squadra. */}
            <Route path="/inventory" element={profile?.canManageInventory ? <Inventory /> : <WorkerInventory />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<WorkerCalendar />} />
            <Route path="/events/:id" element={<WorkerScanner />} />
            <Route path="*" element={<NotFound />} />
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
            <Route path="*" element={<NotFound />} />
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
            <Route path="*" element={<NotFound />} />
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
      <AbsenceNotifications />
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
          <Route path="/admin/settings" element={<Settings />} />
          <Route path="/admin/settings/profile" element={<SettingsProfile />} />
          <Route path="/admin/settings/modules" element={<SettingsModules />} />
          <Route path="/admin/settings/billing" element={<SettingsBilling />} />
          <Route path="/admin/settings/users" element={<SettingsUsers />} />
          <Route path="/admin/settings/integrations" element={<SettingsIntegrations />} />
          <Route path="/super" element={<SuperAdmin />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatedPage>
      {!onScannerRoute && !onSuperAdminRoute && !onWelcomeRoute && <TabBar toggleTheme={toggleTheme} theme={theme} />}
    </>
  )
}

export default function App() {
  // Tema fisso chiaro (toggle modalità notturna rimosso) — l'attributo
  // data-theme="light" è impostato direttamente in index.html, non più qui:
  // impostarlo a runtime lasciava un istante, prima del primo mount React,
  // in cui valevano i token :root di default (scuri) invece di quelli
  // [data-theme="light"], con un flash scuro prima del primo paint utile.
  const theme = 'light'
  const toggleTheme = () => {}

  return (
    <AuthProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <LoadingBar />
          <PageTransition />
          <OnboardingReveal />
          {/* Un solo confine Suspense in cima basta: cattura il caricamento
              lazy di QUALSIASI pagina, anche quelle annidate nelle <Routes>
              interne di PrivateRoutes più sotto — non serve ripeterlo lì. */}
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Auth initialMode="login" />} />
              <Route path="/signup" element={<Auth initialMode="signup" />} />
              {/* Pagine legali: sempre raggiungibili, loggati o no — stesso
                  motivo per cui login/signup sono qui e non dentro
                  PrivateRoutes (che richiederebbe di essere autenticati). */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/*" element={<PrivateRoutes toggleTheme={toggleTheme} theme={theme} />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  )
}
