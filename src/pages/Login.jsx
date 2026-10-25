import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useFieldErrors, FieldError, PasswordInput } from '../components/AuthFields'
import { EMAIL_RE, requestPasswordReset } from '../utils/loginEmail'
import { useStationLinkScanner } from '../hooks/useStationLinkScanner'

// Solo il form di accesso: il guscio (sfondo + card divisa) è in Auth.jsx,
// che tiene login e signup montati nella stessa card così il pannello rosso
// può scivolare da un lato all'altro quando si cambia modalità.
export default function LoginForm({ onSwitch }) {
  const { t } = useTranslation()
  // Il lettore del PC di magazzino che scansiona il foglio della postazione porta alla pagina di collegamento.
  useStationLinkScanner()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const fe = useFieldErrors()
  // "Password dimenticata?": stessa card, al posto del form di accesso.
  const [forgot, setForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const fr = useFieldErrors()
  const openForgot = () => { setForgot(true); setForgotSent(false); setForgotEmail(username.includes('@') ? username.trim() : ''); fr.reset() }
  const sendForgot = async e => {
    e.preventDefault()
    const v = forgotEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) { fr.fail({ email: t('login.errorEmailInvalid') }); return }
    setForgotLoading(true)
    await requestPasswordReset(v)
    setForgotLoading(false)
    setForgotSent(true)
  }
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
      else if (err.code === 'auth/invalid-credential') fe.fail({ username: ' ', password: username.includes('@') ? t('login.errorInvalidCredential') : t('login.errorInvalidCredentialTryEmail') })
      else setError(err.code === 'auth/too-many-requests' ? t('login.errorTooManyRequests') : t('login.errorGeneric'))
    } finally { setLoading(false) }
  }

  if (forgot) {
    return (
      <>
        <form onSubmit={sendForgot} noValidate>
          <div className="auth-card">
            <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:6, letterSpacing:'-0.3px' }}>{t('login.forgotTitle')}</h2>
            <p style={{ fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))', marginBottom:24 }}>{t('login.forgotSubtitle')}</p>
            {forgotSent ? (
              <div role="status" style={{ background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.35)', color:'rgb(var(--au-fg))', borderRadius:12, padding:'14px 16px', fontSize:13.5, lineHeight:1.5, marginBottom:20 }}>
                {t('login.forgotSent')}
              </div>
            ) : (
              <>
                <div style={{ marginBottom:22 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>{t('login.emailLabel')}</label>
                  <input className={fr.cls('email')} type="email" value={forgotEmail} autoFocus
                    onChange={e => { setForgotEmail(e.target.value); fr.clear('email') }}
                    placeholder={t('login.emailPlaceholder')} autoCapitalize="none" autoCorrect="off" autoComplete="email" />
                  <FieldError message={fr.errors.email} />
                </div>
                <button className="auth-btn" type="submit" disabled={forgotLoading}>{forgotLoading ? t('login.forgotSending') : t('login.forgotSend')}</button>
              </>
            )}
            <p style={{ fontSize:12.5, lineHeight:1.5, marginTop:18, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))' }}>{t('login.forgotNoEmailHint')}</p>
          </div>
        </form>
        <p style={{ textAlign:'center', marginTop:20 }}>
          <button type="button" onClick={() => setForgot(false)}
            style={{ background:'none', border:'none', padding:0, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.5))', fontWeight:600, fontSize:12.5, cursor:'pointer', textDecoration:'underline' }}>
            {t('login.forgotBack')}
          </button>
        </p>
      </>
    )
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
            <div style={{ textAlign:'right', marginTop:10 }}>
              <button type="button" onClick={openForgot}
                style={{ background:'none', border:'none', padding:0, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.5))', fontWeight:600, fontSize:12.5, cursor:'pointer', textDecoration:'underline' }}>
                {t('login.forgotLink')}
              </button>
            </div>
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
