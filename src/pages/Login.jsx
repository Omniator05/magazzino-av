import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px', background:'var(--bg)', position:'relative', overflow:'hidden' }}>

      {/* Sfondo decorativo */}
      <div style={{ position:'absolute', inset:0, zIndex:0, overflow:'hidden', pointerEvents:'none' }}>
        <div style={{ position:'absolute', top:'-20%', left:'-10%', width:'60vw', height:'60vw', borderRadius:'50%', background:'radial-gradient(circle, rgba(233,69,96,0.12) 0%, transparent 70%)' }} />
        <div style={{ position:'absolute', bottom:'-15%', right:'-10%', width:'50vw', height:'50vw', borderRadius:'50%', background:'radial-gradient(circle, rgba(79,195,247,0.08) 0%, transparent 70%)' }} />
      </div>

      {/* Logo */}
      <div style={{ textAlign:'center', marginBottom:44, zIndex:1 }}>
        <div style={{ marginBottom:10}}>
          <div style={{ marginBottom:10 }}>
          <img src="/logo.png" alt="The Service"
            style={{ width:400, height:'auto', objectFit:'contain' }}/>
          </div>
        </div>
        <p style={{ color:'var(--text2)', fontSize:13, letterSpacing:'1.5px', textTransform:'uppercase', fontWeight:500 }}>Gestione Magazzino</p>
      </div>

      <form onSubmit={handleSubmit} style={{ width:'100%', maxWidth:380, zIndex:1 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 24px' }}>
          <h2 style={{ fontSize:20, fontWeight:700, marginBottom:20 }}>Accedi</h2>

          {error && (
            <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', color:'var(--red)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:14 }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Nome utente o email</label>
            <input
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
          <div className="form-group" style={{ marginBottom:20 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Accesso in corso...' : 'Entra'}
          </button>
        </div>
        <p style={{ textAlign:'center', color:'var(--text2)', fontSize:13, marginTop:16 }}>
          Per accedere contatta l'amministratore.
        </p>
      </form>
    </div>
  )
}
