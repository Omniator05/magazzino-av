import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Package, Calendar, Scan, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const nav = [
    { path: '/inventory', icon: Package, label: 'Magazzino' },
    { path: '/events', icon: Calendar, label: 'Eventi' },
    { path: '/scanner', icon: Scan, label: 'Scanner' },
  ]

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className="app-layout">
      <div className="main-content">
        <Outlet />
      </div>

      <nav className="bottom-nav">
        {nav.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            className={`nav-btn ${isActive(path) ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            <Icon />
            {label}
          </button>
        ))}
        <button className="nav-btn" onClick={logout}>
          <LogOut />
          Esci
        </button>
      </nav>
    </div>
  )
}
