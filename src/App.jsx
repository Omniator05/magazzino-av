import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import AdminUsers from './pages/AdminUsers'
import WorkerHome from './pages/WorkerHome'
import WorkerScanner from './pages/WorkerScanner'
import TabBar from './components/TabBar'
import LoadingBar from './components/LoadingBar'

function PrivateRoutes() {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', flexDirection:'column', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(233,69,96,0.3)', borderTop:'3px solid #e94560', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#9090b0', fontSize:14 }}>Caricamento...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  // Worker view
  if (profile?.role === 'worker') {
    return (
      <>
        <Routes>
          <Route path="/" element={<WorkerHome />} />
          <Route path="/events/:id" element={<WorkerScanner />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <nav className="tab-bar">
          <button className="active" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'10px 4px', background:'transparent', color:'var(--accent)', fontSize:10, fontWeight:500 }}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            I miei eventi
          </button>
        </nav>
      </>
    )
  }

  // Admin view
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/scan" element={<WorkerScanner />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <LoadingBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<PrivateRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
