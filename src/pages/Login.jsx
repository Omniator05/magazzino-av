import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useFieldErrors, FieldError, PasswordInput } from '../components/AuthFields'

// Solo il form di accesso: il guscio (sfondo + card divisa) è in Auth.jsx,
// che tiene login e signup montati nella stessa card così il pannello rosso
// può scivolare da un lato all'altro quando si cambia modalità.
export default function LoginForm({ onSwitch }) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const fe = useFieldErrors()
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    // Campi mancanti: messaggio sotto il campo e lampo rosso, senza chiamare il server.
    const missing = {}
    if (!username.trim()) missing.username = t('login.errorUsernameRequired')
    if (!password) missing.password = t('login.errorPasswordRequired')
    if (Object.keys(missing).length) { fe.fail(missing); return }
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/')
    } catch (err) {
      // Credenziali sbagliate: sotto il campo giusto (con lampo rosso); il resto nel riquadro in alto.
      if (err.code === 'auth/user-not-found') fe.fail({ username: t('login.errorUserNotFound') })
      else if (err.code === 'auth/wrong-password') fe.fail({ password: t('login.errorWrongPassword') })
      else if (err.code === 'auth/invalid-credential') fe.fail({ username: ' ', password: t('login.errorInvalidCredential') })
      else setError(err.code === 'auth/too-many-requests' ? t('login.errorTooManyRequests') : t('login.errorGeneric'))
    } finally { setLoading(false) }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-card">
          <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:6, letterSpacing:'-0.3px' }}>
            {t('login.title')}
          </h2>
          <p style={{ fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))', marginBottom:28 }}>
            {t('login.subtitle')}
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
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
              {t('login.usernameLabel')}
            </label>
            <input
              className={fe.cls('username')}
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); fe.clear('username') }}
              placeholder={t('login.usernamePlaceholder')}
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
            />
            <FieldError message={fe.errors.username?.trim()} />
          </div>

          <div style={{ marginBottom:28 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
              {t('login.passwordLabel')}
            </label>
            <PasswordInput className={fe.cls('password')} value={password}
              onChange={e => { setPassword(e.target.value); fe.clear('password') }} required autoComplete="current-password" />
            <FieldError message={fe.errors.password} />
          </div>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </div>
      </form>

      <p style={{ textAlign:'center', color:'rgba(var(--au-fg), calc(var(--au-k) * 0.2))', fontSize:12, marginTop:20, letterSpacing:'0.2px' }}>
        {t('login.noAccount')}{' '}
        <button type="button" onClick={onSwitch}
          style={{ background:'none', border:'none', padding:0, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.5))', fontWeight:600, fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
          {t('login.signUp')}
        </button>
      </p>
    </>
  )
}
