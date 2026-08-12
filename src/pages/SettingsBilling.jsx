import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { trialDaysLeft } from '../utils/billing'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Abbonamento" di Impostazioni — stato Stripe e link a
// Checkout/Billing Portal. Le carte non passano mai dal nostro codice: sia
// "sottoscrivi" che "gestisci" reindirizzano a una pagina ospitata da Stripe
// (vedi api/create-checkout-session.js e api/create-portal-session.js, i cui
// success/cancel/return_url puntano qui).
export default function SettingsBilling() {
  const { t } = useTranslation()
  const { user, team } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Ritorno da Stripe Checkout. Il webhook aggiorna già billingStatus da solo:
  // qui è solo il messaggio di conferma — puliamo subito l'URL per non
  // ri-mostrarlo a un refresh/back.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('billing') === 'success') {
      showToast(t('adminUsers.billingSuccessToast'))
      navigate('/admin/settings/billing', { replace: true })
    }
  }, [])

  const manageBilling = async (portal) => {
    setBillingLoading(true); setBillingError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch(portal ? '/api/create-portal-session' : '/api/create-checkout-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json()
      if (res.ok && data.url) window.location.href = data.url
      else { setBillingError(data.error || t('adminUsers.errorBillingGeneric')); setBillingLoading(false) }
    } catch {
      setBillingError(t('adminUsers.errorBillingGeneric'))
      setBillingLoading(false)
    }
  }

  return (
    <div className="page">
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}

      <div className="page-header" style={{ display:'flex', alignItems:'center', gap:12 }}>
        <BackHomeButton to="/admin/settings" />
        <h1>{t('adminUsers.billingTitle')}</h1>
      </div>

      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
        {team?.billingStatus === 'trialing' ? (
          <>
            <div style={{ display:'flex', alignItems:'baseline', gap:7, marginTop:6, marginBottom:5 }}>
              <span style={{ fontSize:30, fontWeight:800, color:'var(--accent)', lineHeight:1 }}>{Math.max(trialDaysLeft(team) ?? 0, 0)}</span>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>{t('adminUsers.billingTrialingDaysLabel', { count: Math.max(trialDaysLeft(team) ?? 0, 0) })}</span>
            </div>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>{t('adminUsers.billingTrialingDesc')}</p>
          </>
        ) : (
          <p style={{ color:'var(--text2)', fontSize:12, marginBottom:12, lineHeight:1.5 }}>
            {team?.billingStatus === 'exempt' ? t('adminUsers.billingExempt')
              : team?.billingStatus === 'active' ? t('adminUsers.billingActive')
              : team?.billingStatus === 'past_due' ? t('adminUsers.billingPastDue')
              : t('adminUsers.billingCanceled')}
          </p>
        )}
        {billingError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{billingError}</p>}
        {team?.billingStatus !== 'exempt' && (
          team?.stripeSubscriptionId ? (
            <button onClick={() => manageBilling(true)} className="btn btn-secondary btn-full" disabled={billingLoading}>
              {billingLoading ? t('common.redirecting') : t('adminUsers.manageBillingButton')}
            </button>
          ) : (
            <button onClick={() => manageBilling(false)} className="btn btn-primary btn-full" disabled={billingLoading}>
              {billingLoading ? t('common.redirecting') : t('adminUsers.subscribeButton')}
            </button>
          )
        )}
      </div>
    </div>
  )
}
