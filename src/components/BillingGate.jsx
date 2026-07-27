import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthBackground from './AuthBackground'

// Schermata mostrata al posto di TUTTA l'app quando l'abbonamento della
// squadra non è valido (prova scaduta, pagamento fallito, cancellato).
// Autonoma apposta — non dipende da nessuna lettura Firestore oltre al
// documento team già caricato (pubblico, sempre leggibile anche a squadra
// bloccata): se dipendesse da AdminUsers.jsx o da altre pagine, quelle
// falliscono comunque a leggere i loro dati una volta bloccato l'accesso.
export default function BillingGate() {
  const { t } = useTranslation()
  const { team, user, profile, logout } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = profile?.role === 'admin'
  const status = team?.billingStatus

  const titleKey = status === 'past_due' ? 'billing.pastDueTitle'
    : status === 'canceled' ? 'billing.canceledTitle'
    : 'billing.trialExpiredTitle'

  const startCheckout = async () => {
    setLoading(true); setError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
      else setError(data.error || t('billing.errorGeneric'))
    } catch {
      setError(t('billing.errorGeneric'))
    } finally { setLoading(false) }
  }

  return (
    <AuthBackground>
      <div style={{ maxWidth:400, width:'100%', background:'var(--card)', borderRadius:24, padding:'34px 26px', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize:38, marginBottom:14 }}>⏳</div>
        <h1 style={{ fontSize:21, fontWeight:800, marginBottom:10, color:'var(--text)' }}>{t(titleKey)}</h1>
        <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6, marginBottom:26 }}>
          {isAdmin ? t('billing.adminDesc') : t('billing.workerDesc')}
        </p>
        {error && <p style={{ color:'#dc2626', fontSize:13, marginBottom:14, fontWeight:600 }}>{error}</p>}
        {isAdmin && (
          <button onClick={startCheckout} disabled={loading} className="btn btn-primary btn-full">
            {loading ? t('common.redirecting') : t('billing.subscribeButton')}
          </button>
        )}
        <button onClick={logout} style={{ marginTop:16, background:'transparent', color:'var(--text2)', fontSize:13, fontWeight:600, padding:8 }}>
          {t('billing.logoutButton')}
        </button>
      </div>
    </AuthBackground>
  )
}
