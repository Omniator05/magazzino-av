import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/')
    } catch (err) {
      const msgs = {
        'auth/user-not-found':      'Nome utente non trovato',
        'auth/wrong-password':      'Password errata',
        'auth/invalid-credential':  'Nome utente o password errati',
        'auth/too-many-requests':   'Troppi tentativi, riprova tra qualche minuto',
      }
      setError(msgs[err.code] || 'Accesso non riuscito')
    } finally { setLoading(false) }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit}>
        <div className="auth-card">
          <h2 style={{ fontSize:22, fontWeight:700, color:'white', marginBottom:6, letterSpacing:'-0.3px' }}>
            Bentornato
          </h2>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginBottom:28 }}>
            Accedi al gestionale
          </p>

          {error && (
            <div style={{
              background:'rgba(230,57,70,0.12)', border:'1px solid rgba(230,57,70,0.35)',
              color:'#ff9090', borderRadius:10, padding:'10px 14px',
              marginBottom:20, fontSize:13, lineHeight:1.4,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
              Nome utente o email
            </label>
            <input
              className="auth-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="es. marco.bianchi"
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom:28 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
              Password
            </label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Accesso in corso…' : 'Entra →'}
          </button>
        </div>
      </form>

      <p style={{ textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:12, marginTop:20, letterSpacing:'0.2px' }}>
        Non hai un account? <Link to="/signup" style={{ color:'rgba(255,255,255,0.5)', fontWeight:600 }}>Registrati</Link>
      </p>
    </AuthShell>
  )
}
