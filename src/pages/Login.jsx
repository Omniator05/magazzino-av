import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (isRegister) await register(email, password)
      else await login(email, password)
      navigate('/')
    } catch (err) {
      const msgs = { 'auth/user-not-found': 'Utente non trovato', 'auth/wrong-password': 'Password errata', 'auth/email-already-in-use': 'Email già in uso', 'auth/weak-password': 'Password troppo corta (min. 6 caratteri)' }
      setError(msgs[err.code] || 'Errore: ' + err.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px', background:'var(--bg)' }}>
      {/* Logo area */}
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{ width:72, height:72, background:'linear-gradient(135deg,#e94560,#c0392b)', borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:32 }}>🎛️</div>
        <h1 style={{ fontSize:28, fontWeight:800 }}>Magazzino AV</h1>
        <p style={{ color:'var(--text2)', marginTop:6, fontSize:14 }}>Gestione attrezzatura audio/luci</p>
      </div>

      <form onSubmit={handleSubmit} style={{ width:'100%', maxWidth:380 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 24px',borderRadius:20}}>
          <h2 style={{ fontSize:20, fontWeight:700, marginBottom:20 }}>{isRegister ? 'Crea account' : 'Accedi'}</h2>

          {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', color:'var(--red)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:14 }}>{error}</div>}

          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tua@email.com" required />
          </div>
          <div className="form-group" style={{ marginBottom:20 }}>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Caricamento...' : (isRegister ? 'Registrati' : 'Entra')}
          </button>
        </div>

        <button type="button" onClick={() => { setIsRegister(!isRegister); setError('') }}
          style={{ width:'100%', marginTop:16, padding:'12px', background:'transparent', color:'var(--text2)', fontSize:14 }}>
          {isRegister ? 'Hai già un account? Accedi' : 'Prima volta? Crea account'}
        </button>
      </form>
    </div>
  )
}
