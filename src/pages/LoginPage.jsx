import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) await register(email, password)
      else await login(email, password)
      navigate('/inventory')
    } catch (err) {
      setError(err.code === 'auth/invalid-credential' ? 'Email o password errati' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      background: 'var(--bg)'
    }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, background: 'var(--accent)', borderRadius: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 0 32px rgba(59,130,246,0.4)'
        }}>
          <Zap size={28} color="#fff" />
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: '-0.02em' }}>
          WarehousePro
        </div>
        <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
          Gestione magazzino eventi
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Email</label>
          <input className="input" type="email" placeholder="tu@email.com"
            value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Password</label>
          <input className="input" type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12,
            background: 'var(--danger-bg)', padding: '10px 14px', borderRadius: 8 }}>
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : null}
          {isRegister ? 'Registrati' : 'Accedi'}
        </button>
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 10 }}
          onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? 'Hai già un account? Accedi' : 'Crea account'}
        </button>
      </form>
    </div>
  )
}
