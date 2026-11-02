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
        if (!r.ok || !r.token) { console.error('[verify] conferma rifiutata:', r.error); setFail({ error: r.error || 'failed', email: r.email }); return }
        await signInWithCustomToken(auth, r.token)
        // Si riparte con un caricamento pulito: l'app si avvia già collegata e legge il profilo appena creato. Cambiare
        // pagina "dall'interno" lasciava a volte i collegamenti dell'app in uno stato vecchio (il profilo non arrivava).
        window.location.replace('/welcome')
      } catch (e) {
        console.error('[verify] accesso non riuscito:', e)
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
            <img src="/pwa-192x192.png" alt="" width="64" height="64" className="verify-mark" style={{ display: 'block', margin: '2px auto 22px', borderRadius: 18, boxShadow: '0 12px 32px rgba(230,57,70,0.3)' }} />
            <h1 style={{ fontSize: 21, fontWeight: 700, color: 'rgb(var(--au-fg))', marginBottom: 6, letterSpacing: '-0.3px' }}>{t('verify.workingTitle')}</h1>
            <p style={{ fontSize: 13.5, color: muted, marginBottom: 22 }}>{t('verify.workingText')}</p>
            <div role="progressbar" aria-label={t('verify.workingTitle')} className="verify-bar"><span /></div>
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
              : <>
                  {kind === 'invalid' && <button type="button" className="auth-btn" onClick={() => navigate('/login', { replace: true })} style={{ marginBottom: 10 }}>{t('verify.goToLogin')}</button>}
                  <button type="button" className="auth-btn-secondary" onClick={() => navigate('/signup', { replace: true })}>{t('verify.backToSignup')}</button>
                </>}
          </>
        )}
      </div>
      <style>{`
        .verify-mark { animation: verifyPulse 1.8s ease-in-out infinite; }
        @keyframes verifyPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        .verify-bar { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(var(--au-fg), 0.12); }
        .verify-bar span { display: block; height: 100%; width: 40%; border-radius: 3px; background: linear-gradient(90deg, #ee4a58, #d62f3d); animation: verifySlide 1.3s ease-in-out infinite; }
        @keyframes verifySlide { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }
        @media (prefers-reduced-motion: reduce) { .verify-mark, .verify-bar span { animation: none; } .verify-bar span { width: 100%; opacity: 0.6; } }
      `}</style>
    </AuthBackground>
  )
}
