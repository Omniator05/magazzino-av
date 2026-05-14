import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import AdminUsers from './pages/AdminUsers'
import Archive from './pages/Archive'
import WorkerHome from './pages/WorkerHome'
import WorkerScanner from './pages/WorkerScanner'
import WorkerInventory from './pages/WorkerInventory'
import TabBar from './components/TabBar'
import LoadingBar from './components/LoadingBar'

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

  // Worker view
  if (profile?.role === 'worker') {
    return (
      <>
        <Routes>
          <Route path="/" element={<WorkerHome />} />
          <Route path="/inventory" element={<WorkerInventory />} />
          <Route path="/events/:id" element={<WorkerScanner />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {!onScannerRoute && <TabBar />}
      </>
    )
  }

  // Admin view
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard toggleTheme={toggleTheme} theme={theme} />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/events" element={<Events />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/scan" element={<WorkerScanner />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!onScannerRoute && <TabBar toggleTheme={toggleTheme} theme={theme} />}
    </>
  )
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <AuthProvider>
      <BrowserRouter>
        <LoadingBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<PrivateRoutes toggleTheme={toggleTheme} theme={theme} />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
