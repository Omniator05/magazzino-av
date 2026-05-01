import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import TabBar from './components/TabBar'

function PrivateRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',flexDirection:'column',gap:16}}><div style={{width:40,height:40,border:'3px solid rgba(233,69,96,0.3)',borderTop:'3px solid #e94560',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div><p style={{color:'#9090b0',fontSize:14}}>Caricamento...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/scanner" element={<Scanner />} />
      </Routes>
      <TabBar />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<PrivateRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
