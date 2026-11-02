import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/AuthShell'

// Schermata mostrata al posto delle route normali quando il profilo non è
// (ancora) approvato, è stato disattivato, o non ha un ruolo riconosciuto —
// mai deve lasciar passare l'utente nella vista admin di default.
export default function PendingApproval({ reason = 'unknown' }) {
  const { t } = useTranslation()
  const { logout, team, user } = useAuth()
  const [resend, setResend] = useState('')   // '' | 'sending' | 'sent' | 'rate' | 'error' (solo per reason === 'verify')

  const CONTENT = {
    pending: {
      title: t('pendingApproval.pendingTitle'),
      body: t('pendingApproval.pendingBody', { teamSuffix: team?.name ? t('pendingApproval.pendingTeamSuffix', { team: team.name }) : '' }),
    },
    inactive: {
      title: t('pendingApproval.inactiveTitle'),
      body: t('pendingApproval.inactiveBody'),
    },
    verify: {
      title: t('pendingApproval.verifyTitle'),
      body: t('pendingApproval.verifyBody', { email: user?.email || '' }),
    },
    unknown: {
      title: t('pendingApproval.unknownTitle'),
      body: t('pendingApproval.unknownBody'),
    },
  }
  const { title, body } = CONTENT[reason] || CONTENT.unknown

  // Rimanda il link di conferma (la risposta è sempre la stessa: non rivela se esiste una richiesta). Vedi api/_signup.js.
  const resendLink = async () => {
    setResend('sending')
    try {
      const res = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'signupResend', email: user?.email }) })
      setResend(res.ok ? 'sent' : res.status === 429 ? 'rate' : 'error')
    } catch { setResend('error') }
  }

  return (
    <AuthShell heroTitle={t('pendingApproval.heroTitle')} heroText={t('pendingApproval.heroText')}>
      <div className="auth-card" style={{ textAlign:'center' }}>
        <div style={{ fontSize:38, marginBottom:14 }}>{reason === 'pending' ? '⏳' : '⚠️'}</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:10 }}>{title}</h2>
        <p style={{ fontSize:14, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.5))', lineHeight:1.6, marginBottom:28 }}>
          {body}
        </p>
        {reason === 'verify' && (
          <>
            <button className="auth-btn" disabled={resend === 'sending' || resend === 'sent'} onClick={resendLink} style={{ marginBottom: 10 }}>
              {resend === 'sending' ? t('signup.resending') : t('signup.resend')}
            </button>
            {resend === 'sent' && <p role="status" style={{ fontSize: 13, fontWeight: 600, color: '#22c55e', margin: '0 0 12px' }}>{t('signup.resent')}</p>}
            {resend === 'rate' && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#e63946', margin: '0 0 12px' }}>{t('signup.errorRateLimit')}</p>}
            {resend === 'error' && <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#e63946', margin: '0 0 12px' }}>{t('signup.errorSignupFailed')}</p>}
          </>
        )}
        <button className="auth-btn-secondary" onClick={logout}>{t('pendingApproval.exit')}</button>
      </div>
    </AuthShell>
  )
}
