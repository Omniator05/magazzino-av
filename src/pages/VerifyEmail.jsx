import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '../firebase'
import AuthBackground from '../components/AuthBackground'

// Pagina del link nell'email di conferma (/verify?token=...). Il server crea la squadra e il profilo e restituisce
// un token di accesso: qui si entra già collegati con quell'email — da qualunque dispositivo, anche diverso da
// quello della registrazione — e si prosegue verso il benvenuto. Vedi api/_signup.js.
async function post(type, body) {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...body }),
  })
  return { ok: res.ok, ...(await res.json().catch(() => ({}))) }
}

export default function VerifyEmail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [fail, setFail] = useState(null)      // null = in corso, altrimenti { error, email }
  const [resend, setResend] = useState('')    // '' | 'sending' | 'sent' | 'error'
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return      // in sviluppo React monta due volte: la conferma parte una sola
    started.current = true
    const token = new URLSearchParams(window.location.search).get('token') || ''
    ;(async () => {
      try {
        const r = await post('signupVerify', { token })
        if (!r.ok || !r.token) { setFail({ error: r.error || 'failed', email: r.email }); return }
        await signInWithCustomToken(auth, r.token)
        navigate('/welcome', { replace: true })
      } catch {
        setFail({ error: 'failed' })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendNewLink = async () => {
    setResend('sending')
    try { setResend((await post('signupResend', { email: fail.email })).ok ? 'sent' : 'error') } catch { setResend('error') }
  }

  const muted = 'rgba(var(--au-fg), calc(var(--au-k) * 0.45))'
  const kind = fail?.error === 'expired' ? 'expired' : fail?.error === 'company-exists' ? 'company' : fail?.error === 'failed' ? 'failed' : 'invalid'

  return (
    <AuthBackground>
      <div role="status" aria-live="polite" className="auth-card" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, boxSizing: 'border-box', textAlign: 'center' }}>
        {!fail ? (
          <>
            <div aria-hidden="true" className="verify-spin" style={{ width: 52, height: 52, margin: '4px auto 20px', borderRadius: '50%', border: '3px solid rgba(var(--au-fg), 0.14)', borderTopColor: '#e63946' }} />
            <h1 style={{ fontSize: 21, fontWeight: 700, color: 'rgb(var(--au-fg))', marginBottom: 6, letterSpacing: '-0.3px' }}>{t('verify.workingTitle')}</h1>
            <p style={{ fontSize: 13.5, color: muted }}>{t('verify.workingText')}</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: 'rgb(var(--au-fg))', marginBottom: 8, letterSpacing: '-0.3px' }}>{t(`verify.${kind}Title`)}</h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: muted, marginBottom: 22 }}>{t(`verify.${kind}Text`)}</p>
            {kind === 'expired' && fail.email && resend !== 'sent' && (
              <button type="button" className="auth-btn" disabled={resend === 'sending'} onClick={sendNewLink} style={{ marginBottom: 10 }}>
                {resend === 'sending' ? t('signup.resending') : t('verify.sendNewLink')}
              </button>
            )}
            {resend === 'sent' && <p role="status" style={{ fontSize: 13, fontWeight: 600, color: '#22c55e', marginBottom: 14 }}>{t('verify.newLinkSent')}</p>}
            {resend === 'error' && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#e63946', marginBottom: 14 }}>{t('signup.errorSignupFailed')}</p>}
            {kind === 'failed'
              ? <button type="button" className="auth-btn" onClick={() => window.location.reload()}>{t('verify.tryAgain')}</button>
              : <button type="button" className="auth-btn-secondary" onClick={() => navigate('/signup', { replace: true })}>{t('verify.backToSignup')}</button>}
          </>
        )}
      </div>
      <style>{`
        .verify-spin { animation: verifySpin 0.8s linear infinite; }
        @keyframes verifySpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .verify-spin { animation-duration: 2.4s; } }
      `}</style>
    </AuthBackground>
  )
}
