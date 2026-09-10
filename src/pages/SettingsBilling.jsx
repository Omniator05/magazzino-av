import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { trialDaysLeft } from '../utils/billing'
import { FREE_LIMITS } from '../utils/planLimits'
import { formatDate } from '../utils/formatDate'
import { Check, Star, Warn } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'

// Sotto-pagina "Abbonamento" di Impostazioni — stato Stripe e link a
// Checkout/Billing Portal. Le carte non passano mai dal nostro codice: sia
// "sottoscrivi" che "gestisci" reindirizzano a una pagina ospitata da Stripe
// (vedi api/create-checkout-session.js e api/create-portal-session.js, i cui
// success/cancel/return_url puntano qui).
//
// Due viste distinte:
//  - ACQUISIZIONE (prova in corso, scaduta, cancellato, pagamento fallito):
//    stato + card di vendita del piano Pro con i limiti che sblocca.
//  - PREMIUM (abbonato attivo o squadra esente): niente pitch di vendita —
//    conferma dello stato Pro, cosa si è sbloccato e la gestione del
//    pagamento in secondo piano. Nessun invito a disdire.
//
// I vantaggi elencati sono ESATTAMENTE i limiti del piano gratuito (vedi
// src/utils/planLimits.js → FREE_LIMITS): non promesse generiche, ma la
// differenza reale tra gratuito e Pro.
const PRO_BENEFITS = [
  { titleKey: 'billingBenefitWorkersTitle',   descKey: 'billingBenefitWorkersDesc',   haveDescKey: 'billingHaveWorkersDesc',   limit: FREE_LIMITS.workers },
  { titleKey: 'billingBenefitAdminsTitle',    descKey: 'billingBenefitAdminsDesc',    haveDescKey: 'billingHaveAdminsDesc',    limit: FREE_LIMITS.admins },
  { titleKey: 'billingBenefitWarehouseTitle', descKey: 'billingBenefitWarehouseDesc', haveDescKey: 'billingHaveWarehouseDesc', limit: FREE_LIMITS.itemsInWarehouse },
  { titleKey: 'billingBenefitListTitle',      descKey: 'billingBenefitListDesc',      haveDescKey: 'billingHaveListDesc',      limit: FREE_LIMITS.itemsPerList },
]

export default function SettingsBilling() {
  const { t, i18n } = useTranslation()
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

  const status = team?.billingStatus
  const daysLeft = Math.max(trialDaysLeft(team) ?? 0, 0)
  const isSubscribed = !!team?.stripeSubscriptionId
  const isPremium = status === 'active' || status === 'exempt'
  const isExempt = status === 'exempt'
  const cancelScheduled = !!team?.cancelAtPeriodEnd
  const renewalDate = team?.currentPeriodEnd
    ? formatDate(team.currentPeriodEnd, { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language)
    : null

  const header = (
    <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
      <BackHomeButton to="/admin/settings" />
      <h1 style={{ textAlign:'right' }}>{t('adminUsers.billingTitle')}</h1>
    </div>
  )

  const toastEl = toast && (
    <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
      {toast}
    </div>
  )

  /* ─────────────────────────  VISTA PREMIUM  ───────────────────────── */
  if (isPremium) {
    return (
      <div className="page">
        {toastEl}
        {header}

        {/* Hero Pro — la ricompensa emotiva dell'upgrade. Gradiente accento,
            crest a stella, ringraziamento. Nessun prezzo in evidenza, nessun
            invito ad agire: qui l'azione è già stata compiuta. */}
        <div style={{
          margin:'0 16px 18px', borderRadius:20, overflow:'hidden', position:'relative',
          background:'linear-gradient(145deg, #e63946 0%, #b31f3c 100%)',
          padding:'22px 20px 24px', color:'#fff',
          boxShadow:'0 12px 32px rgba(179,31,60,0.28)',
        }}>
          <div style={{ position:'absolute', top:-34, right:-24, opacity:0.13, pointerEvents:'none', color:'#fff' }}>
            <Star size={150} />
          </div>
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <Star size={15} />
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:'1.4px' }}>
                {isExempt ? t('adminUsers.billingExemptEyebrow') : t('adminUsers.billingProEyebrow')}
              </span>
            </div>
            <p style={{ fontSize:25, fontWeight:800, letterSpacing:'-0.4px', lineHeight:1.1, marginBottom:8 }}>
              {isExempt ? t('adminUsers.billingExemptHeading') : t('adminUsers.billingProHeading')}
            </p>
            <p style={{ fontSize:13, lineHeight:1.55, color:'rgba(255,255,255,0.88)', maxWidth:340 }}>
              {isExempt ? t('adminUsers.billingExemptThanks') : t('adminUsers.billingProThanks')}
            </p>
          </div>
        </div>

        {/* Cosa hai sbloccato — gli stessi 4 punti della card di vendita, ma
            al presente e "tuoi", non come mancanze del piano gratuito. */}
        <p style={{ padding:'0 16px 8px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
          {t('adminUsers.billingUnlockedLabel')}
        </p>
        <div style={{
          margin:'0 16px 18px', background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:'16px 18px', display:'flex', flexDirection:'column', gap:13,
        }}>
          {PRO_BENEFITS.map(b => (
            <div key={b.titleKey} style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
              <div style={{ width:24, height:24, flexShrink:0, borderRadius:7, marginTop:1, background:'rgba(105,240,174,0.15)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={13} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{t(`adminUsers.${b.titleKey}`)}</p>
                <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, lineHeight:1.4 }}>{t(`adminUsers.${b.haveDescKey}`)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gestione pagamento — solo per gli abbonati veri (l'esente non ha
            nulla da gestire). Volutamente sobria e in fondo. */}
        {!isExempt && (
          <>
            {cancelScheduled && (
              <div style={{
                margin:'0 16px 12px', background:'rgba(245,166,35,0.09)', border:'1px solid rgba(245,166,35,0.35)',
                borderRadius:'var(--radius)', padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:11,
              }}>
                <div style={{ color:'var(--accent2)', flexShrink:0, marginTop:1 }}><Warn size={18} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{t('adminUsers.billingCancelScheduledTitle')}</p>
                  <p style={{ fontSize:12.5, color:'var(--text2)', lineHeight:1.5 }}>
                    {renewalDate
                      ? t('adminUsers.billingCancelScheduledDesc', { date: renewalDate })
                      : t('adminUsers.billingCancelScheduledDescNoDate')}
                  </p>
                </div>
              </div>
            )}

            <div style={{
              margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'16px 18px',
            }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10, marginBottom: renewalDate ? 4 : 0 }}>
                <span style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{t('adminUsers.billingPlanRowPro')}</span>
                <span style={{ fontSize:14, fontWeight:800, color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>
                  35€<span style={{ fontSize:11.5, fontWeight:600, color:'var(--text2)' }}>/{t('adminUsers.billingPerMonth')}</span>
                </span>
              </div>
              {renewalDate && !cancelScheduled && (
                <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>
                  {t('adminUsers.billingNextRenewal', { date: renewalDate })}
                </p>
              )}

              {billingError && <p style={{ color:'var(--red)', fontSize:12, margin:'12px 0 0', fontWeight:600 }}>{billingError}</p>}

              <button
                onClick={() => manageBilling(true)}
                className="btn btn-secondary btn-full"
                disabled={billingLoading}
                style={{ marginTop:14 }}
              >
                {billingLoading ? t('common.redirecting')
                  : cancelScheduled ? t('adminUsers.billingReactivateButton')
                  : t('adminUsers.billingManagePaymentButton')}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  /* ───────────────────────  VISTA ACQUISIZIONE  ─────────────────────── */
  const showCta = true // qui status non è mai 'exempt' (gestito sopra)
  return (
    <div className="page">
      {toastEl}
      {header}

      {/* Stato corrente */}
      <div style={{
        margin:'0 16px 14px', background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', padding:'18px 18px 16px', display:'flex', alignItems:'flex-start', gap:14,
      }}>
        <div style={{
          width:44, height:44, flexShrink:0, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
          background: status === 'past_due' ? 'rgba(255,82,82,0.12)' : 'rgba(230,57,70,0.12)',
          color: status === 'past_due' ? 'var(--red)' : 'var(--accent)',
        }}>
          {status === 'trialing'
            ? <span style={{ fontSize:16, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>{daysLeft}</span>
            : <Check size={20} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:3 }}>
            {status === 'trialing' ? t('adminUsers.billingTrialingDaysLabel', { count: daysLeft })
              : status === 'past_due' ? t('adminUsers.billingRowPastDue')
              : t('adminUsers.billingRowCanceled')}
          </p>
          <p style={{ color:'var(--text2)', fontSize:12.5, lineHeight:1.5 }}>
            {status === 'trialing' ? t('adminUsers.billingTrialingDesc')
              : status === 'past_due' ? t('adminUsers.billingPastDue')
              : t('adminUsers.billingCanceled')}
          </p>
        </div>
      </div>

      {/* Piano Pro — card di vendita */}
      <div style={{
        margin:'0 16px 16px', background:'var(--card)', border:'1px solid rgba(230,57,70,0.25)',
        borderRadius:'var(--radius)', overflow:'hidden',
      }}>
        <div style={{ padding:'18px 18px 4px', display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10 }}>
          <p style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>Pro</p>
          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:20, fontWeight:800, color:'var(--accent)', lineHeight:1 }}>35€<span style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>/mese</span></p>
            <p style={{ fontSize:10.5, fontWeight:700, color:'var(--text2)', letterSpacing:'0.3px', marginTop:2 }}>PREZZO BETA</p>
          </div>
        </div>

        <div style={{ padding:'10px 18px 6px', display:'flex', flexDirection:'column', gap:12 }}>
          {PRO_BENEFITS.map(b => (
            <div key={b.titleKey} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
              <div style={{ width:24, height:24, flexShrink:0, borderRadius:7, marginTop:1, background:'rgba(105,240,174,0.15)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={13} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{t(`adminUsers.${b.titleKey}`)}</p>
                <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, lineHeight:1.4 }}>{t(`adminUsers.${b.descKey}`, { limit: b.limit })}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding:'14px 18px 18px' }}>
          {billingError && <p style={{ color:'var(--red)', fontSize:12, marginBottom:10, fontWeight:600 }}>{billingError}</p>}
          <button
            onClick={() => manageBilling(isSubscribed)}
            className={isSubscribed ? 'btn btn-secondary btn-full' : 'btn btn-primary btn-full'}
            disabled={billingLoading}
          >
            {billingLoading ? t('common.redirecting')
              : isSubscribed ? t('adminUsers.manageBillingButton')
              : t('adminUsers.subscribeButton')}
          </button>
          <p style={{ textAlign:'center', fontSize:11.5, color:'var(--text3)', marginTop:10 }}>
            {t('adminUsers.billingCancelAnytimeHint')}
          </p>
        </div>
      </div>
    </div>
  )
}
