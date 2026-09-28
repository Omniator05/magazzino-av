import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { trialDaysLeft } from '../utils/billing'
import { FREE_LIMITS, TEAM_LIMITS } from '../utils/planLimits'
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
// L'unico vantaggio rimasto comune a ENTRAMBI i piani a pagamento — invariato
// rispetto al piano gratuito (vedi src/utils/planLimits.js → FREE_LIMITS).
// Admin, magazzinieri e oggetti in magazzino sono invece tier-aware, vedi
// PLANS sotto: sono le tre leve che distinguono Team da Business
// (2026-09-28).
const SHARED_BENEFITS = [
  { titleKey: 'billingBenefitListTitle', haveDescKey: 'billingHaveListDesc', limit: FREE_LIMITS.itemsPerList },
]

// I due piani a pagamento (introdotti 2026-09-28) — differiscono su tre
// leve: numero di admin, magazzinieri e oggetti in magazzino. priceCents è
// il prezzo per i NUOVI abbonati; chi si è abbonato prima di questi 2 piani
// vede il proprio prezzo vero da team.planPriceCents (vedi la vista PREMIUM
// sotto), non questo valore. adminCap/workerCap/warehouseCap = i tetti DI
// QUESTO piano (null = illimitato) — usati nel titolo e nella riga "cosa hai
// sbloccato" della vista PREMIUM. `features`: solo per la card di vendita
// (vista ACQUISIZIONE) — { key, vars? } così ogni card può avere numeri
// diversi riga per riga (il piano Free sotto ne ha bisogno, i due a
// pagamento no).
const PLANS = [
  {
    tier: 'team', nameKey: 'billingPlanNameTeam', priceCents: 4500, betaBadge: true, recommended: true,
    adminTitleKey: 'billingBenefitAdminsTitleTeam',
    haveAdminDescKey: 'billingHaveAdminsDescTeam', adminCap: TEAM_LIMITS.admins,
    workerTitleKey: 'billingBenefitWorkersTitleTeam',
    haveWorkerDescKey: 'billingHaveWorkersDescTeam', workerCap: TEAM_LIMITS.workers,
    warehouseTitleKey: 'billingBenefitWarehouseTitleTeam',
    haveWarehouseDescKey: 'billingHaveWarehouseDescTeam', warehouseCap: TEAM_LIMITS.itemsInWarehouse,
    taglineKey: 'billingTeamTagline',
    features: [
      { key: 'billingBenefitAdminsTitleTeam', vars: { cap: TEAM_LIMITS.admins } },
      { key: 'billingBenefitWorkersTitleTeam', vars: { cap: TEAM_LIMITS.workers } },
      { key: 'billingBenefitWarehouseTitleTeam', vars: { cap: TEAM_LIMITS.itemsInWarehouse } },
      { key: 'billingBenefitListTitle' },
      { key: 'billingTeamExtraFeature' },
    ],
  },
  {
    tier: 'business', nameKey: 'billingPlanNameBusiness', priceCents: 12900, betaBadge: false, recommended: false,
    adminTitleKey: 'billingBenefitAdminsTitle',
    haveAdminDescKey: 'billingHaveAdminsDesc', adminCap: null,
    workerTitleKey: 'billingBenefitWorkersTitle',
    haveWorkerDescKey: 'billingHaveWorkersDesc', workerCap: null,
    warehouseTitleKey: 'billingBenefitWarehouseTitle',
    haveWarehouseDescKey: 'billingHaveWarehouseDesc', warehouseCap: null,
    taglineKey: 'billingBusinessTagline',
    features: [
      { key: 'billingBenefitAdminsTitle' },
      { key: 'billingBenefitWorkersTitle' },
      { key: 'billingBenefitWarehouseTitle' },
      { key: 'billingBenefitListTitle' },
      { key: 'billingBusinessExtraFeature' },
    ],
  },
]

// Il piano gratuito, come terza card della vista ACQUISIZIONE — stessi numeri
// di src/utils/planLimits.js → FREE_LIMITS, mai riscritti a mano. Non entra
// mai nella vista PREMIUM (una squadra gratuita non è mai "abbonata"), quindi
// non ha adminCap/haveAdminDescKey come gli altri due.
const FREE_PLAN = {
  tier: 'free', nameKey: 'billingPlanNameFree', priceCents: 0, betaBadge: false, recommended: false,
  taglineKey: 'billingFreeTagline',
  features: [
    { key: 'billingFreeFeatureAdmins', vars: { limit: FREE_LIMITS.admins } },
    { key: 'billingFreeFeatureWorkers', vars: { limit: FREE_LIMITS.workers } },
    { key: 'billingFreeFeatureWarehouse', vars: { limit: FREE_LIMITS.itemsInWarehouse } },
    { key: 'billingFreeFeatureList', vars: { limit: FREE_LIMITS.itemsPerList } },
  ],
}

// "35€" ovunque nel piano vecchio era testo fisso — ora il prezzo cambia per
// piano E per chi si è abbonato prima/dopo il 2026-09-28 (grandfathering),
// quindi va sempre calcolato da un numero, mai scritto a mano.
const formatEuros = cents => `${Math.round(cents / 100)}€`

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

  // tier ('team'|'business') sceglie quale Price Stripe usare al checkout —
  // ignorato per il portal, che gestisce l'abbonamento già esistente.
  const manageBilling = async (portal, tier) => {
    setBillingLoading(true); setBillingError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch(portal ? '/api/create-portal-session' : '/api/create-checkout-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(portal ? {} : { tier }),
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
  // Abbonato prima dei 2 piani (team.planTier ancora assente) → Team di
  // default, stessa regola di adminLimit() in utils/planLimits.js. Il prezzo
  // mostrato è quello VERO pagato (planPriceCents), non il listino attuale —
  // un grandfathered vede il suo 35€, non il 45€ dei nuovi Team.
  const plan = PLANS.find(p => p.tier === team?.planTier) || PLANS[0]
  const planPriceCents = team?.planPriceCents ?? plan.priceCents
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
                {isExempt ? t('adminUsers.billingExemptEyebrow') : t(`adminUsers.billingProEyebrow_${plan.tier}`)}
              </span>
            </div>
            <p style={{ fontSize:25, fontWeight:800, letterSpacing:'-0.4px', lineHeight:1.1, marginBottom:8 }}>
              {isExempt ? t('adminUsers.billingExemptHeading') : t(`adminUsers.billingProHeading_${plan.tier}`)}
            </p>
            <p style={{ fontSize:13, lineHeight:1.55, color:'rgba(255,255,255,0.88)', maxWidth:340 }}>
              {isExempt ? t('adminUsers.billingExemptThanks') : t(`adminUsers.billingProThanks_${plan.tier}`)}
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
          {[
            { titleKey: plan.workerTitleKey, haveDescKey: plan.haveWorkerDescKey, limit: FREE_LIMITS.workers, cap: plan.workerCap },
            { titleKey: plan.warehouseTitleKey, haveDescKey: plan.haveWarehouseDescKey, limit: FREE_LIMITS.itemsInWarehouse, cap: plan.warehouseCap },
            ...SHARED_BENEFITS,
            { titleKey: plan.adminTitleKey, haveDescKey: plan.haveAdminDescKey, limit: FREE_LIMITS.admins, cap: plan.adminCap },
          ].map(b => (
            <div key={b.titleKey} style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
              <div style={{ width:24, height:24, flexShrink:0, borderRadius:7, marginTop:1, background:'rgba(105,240,174,0.15)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={13} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{t(`adminUsers.${b.titleKey}`, { limit: b.limit, cap: b.cap })}</p>
                <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, lineHeight:1.4 }}>{t(`adminUsers.${b.haveDescKey}`, { limit: b.limit, cap: b.cap })}</p>
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
                      ? t('adminUsers.billingCancelScheduledDesc', { date: renewalDate, plan: t(`adminUsers.${plan.nameKey}`) })
                      : t('adminUsers.billingCancelScheduledDescNoDate', { plan: t(`adminUsers.${plan.nameKey}`) })}
                  </p>
                </div>
              </div>
            )}

            <div style={{
              margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'16px 18px',
            }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10, marginBottom: renewalDate ? 4 : 0 }}>
                <span style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{t('adminUsers.billingPlanRow', { plan: t(`adminUsers.${plan.nameKey}`) })}</span>
                <span style={{ fontSize:14, fontWeight:800, color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>
                  {formatEuros(planPriceCents)}<span style={{ fontSize:11.5, fontWeight:600, color:'var(--text2)' }}>/{t('adminUsers.billingPerMonth')}</span>
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
              {/* Cambiare piano (Team→Business o viceversa) passa dallo stesso
                  Billing Portal — se configurato in Stripe con entrambi i
                  Price come opzioni di cambio abbonamento, non serve nessun
                  altro bottone/endpoint dedicato. */}
              {plan.tier === 'team' && !cancelScheduled && (
                <p style={{ fontSize:12, color:'var(--text2)', textAlign:'center', marginTop:10 }}>
                  {t('adminUsers.billingUpgradeToBusinessHint')}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  /* ───────────────────────  VISTA ACQUISIZIONE  ─────────────────────── */
  // Urgenza: più vicina è la fine della prova, più il richiamo sale di tono —
  // stessa soglia (≤3 giorni) già usata in ProUpsell.jsx per il banner in
  // Dashboard. Pagamento fallito e abbonamento cancellato sono già uno stato
  // di fatto (la squadra opera già coi limiti gratuiti), non qualcosa che
  // sta per succedere: stesso registro "critico", testo al presente.
  const urgency = status === 'trialing'
    ? (daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'warning' : 'normal')
    : 'critical'
  const urgencyColor  = urgency === 'critical' ? 'var(--red)' : urgency === 'warning' ? 'var(--accent2)' : 'var(--accent)'
  const urgencyBg     = urgency === 'critical' ? 'rgba(248,113,113,0.08)' : urgency === 'warning' ? 'rgba(212,130,10,0.08)' : 'var(--card)'
  const urgencyBorder = urgency === 'critical' ? 'rgba(248,113,113,0.3)' : urgency === 'warning' ? 'rgba(212,130,10,0.3)' : 'var(--border)'

  return (
    <div className="page">
      {toastEl}
      {header}

      {/* Header con urgenza concreta — il contatore/stato resta com'era; sotto,
          una sola frase (nessuna griglia di numeri: quelli ora vivono dentro
          ogni card, la Free compresa, più avanti). */}
      <div style={{ margin:'0 16px 16px', borderRadius:20, padding:'20px 18px', background:urgencyBg, border:`1.5px solid ${urgencyBorder}` }}>
        {status === 'trialing' ? (
          <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:12 }}>
            <span style={{ fontSize:44, fontWeight:800, lineHeight:1, color:urgencyColor, fontVariantNumeric:'tabular-nums' }}>{daysLeft}</span>
            <span style={{ fontSize:14, fontWeight:700, color:urgencyColor }}>{t('adminUsers.billingTrialingDaysLabel', { count: daysLeft })}</span>
          </div>
        ) : (
          <p style={{ fontSize:17, fontWeight:800, color:urgencyColor, marginBottom:10 }}>
            {status === 'past_due' ? t('adminUsers.billingRowPastDue') : t('adminUsers.billingUrgentHeadingCanceled')}
          </p>
        )}
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.55 }}>
          {t(status === 'trialing' ? 'adminUsers.billingRestrictionIntroTrialing'
            : status === 'past_due' ? 'adminUsers.billingRestrictionIntroPastDue'
            : 'adminUsers.billingRestrictionIntroCanceled')}
        </p>
      </div>

      <p style={{ padding:'0 16px 14px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
        {t('adminUsers.billingPlansSectionTitle')}
      </p>

      {/* Tre piani, ognuno una scheda prodotto completa e autonoma — la
          consigliata (Team) per prima. Colonna su mobile, tre affiancate da
          desktop in su (vedi .billing-plans qui sotto). */}
      <div className="billing-plans" style={{ margin:'0 16px 8px', display:'flex', gap:14 }}>
        {[...PLANS, FREE_PLAN].map(p => (
          <div key={p.tier} style={{
            position:'relative', background:'var(--card)',
            border: p.recommended ? '2px solid var(--accent)' : '1px solid var(--border)',
            borderRadius:20, padding: p.recommended ? '21px 20px 20px' : '22px 20px 20px',
            boxShadow: p.recommended ? '0 10px 28px rgba(230,57,70,0.14)' : 'none',
            display:'flex', flexDirection:'column', gap:16,
          }}>
            {p.recommended && (
              <span style={{ position:'absolute', top:-12, left:20, background:'var(--accent)', color:'#fff', borderRadius:20, padding:'3px 12px', fontSize:10.5, fontWeight:800, letterSpacing:'0.4px', textTransform:'uppercase' }}>
                {t('adminUsers.billingRecommendedBadge')}
              </span>
            )}

            <div>
              <p style={{ fontSize:18, fontWeight:800, color:'var(--text)' }}>{t(`adminUsers.${p.nameKey}`)}</p>
              <p style={{ fontSize:13, color:'var(--text2)', marginTop:3, lineHeight:1.4 }}>{t(`adminUsers.${p.taglineKey}`)}</p>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:10 }}>
                <p style={{ fontSize:30, fontWeight:800, color: p.recommended ? 'var(--accent)' : 'var(--text)', lineHeight:1 }}>
                  {p.tier === 'free' ? formatEuros(p.priceCents) : <>{formatEuros(p.priceCents)}<span style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>/{t('adminUsers.billingPerMonth')}</span></>}
                </p>
                {p.betaBadge && <span style={{ fontSize:10, fontWeight:700, color:'var(--text2)', letterSpacing:'0.3px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 6px' }}>PREZZO BETA</span>}
              </div>
            </div>

            {/* Elenco completo del piano — la card sta in piedi da sola, non
                rimanda a nessun blocco condiviso sopra o fra loro. flex:1
                assorbe lo spazio in eccesso quando le card sono affiancate e
                stirate alla stessa altezza (Free ha una riga in meno delle
                altre due): senza, il suo bottone resterebbe più in alto,
                fuori riga rispetto a Team/Business. */}
            <div style={{ display:'flex', flexDirection:'column', gap:9, flex:1 }}>
              {p.features.map(f => (
                <div key={f.key} style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                  <div style={{ width:20, height:20, flexShrink:0, borderRadius:6, marginTop:1, background:'rgba(105,240,174,0.15)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Check size={11} />
                  </div>
                  <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', lineHeight:1.4 }}>
                    {t(`adminUsers.${f.key}`, f.vars)}
                  </p>
                </div>
              ))}
            </div>

            {/* Free non è un'azione — è dove ci si trova già finché non si
                sceglie uno degli altri due piani. Bottone non cliccabile. */}
            {p.tier === 'free' ? (
              <button className="btn btn-secondary btn-full" disabled style={{ opacity:0.6, cursor:'default' }}>
                {t('adminUsers.billingCurrentPlanButton')}
              </button>
            ) : (
              <button
                onClick={() => manageBilling(isSubscribed, p.tier)}
                className={isSubscribed ? 'btn btn-secondary btn-full' : (p.recommended ? 'btn btn-primary btn-full' : 'btn btn-secondary btn-full')}
                disabled={billingLoading}
              >
                {billingLoading ? t('common.redirecting')
                  : isSubscribed ? t('adminUsers.manageBillingButton')
                  : t('adminUsers.subscribeButtonWithPrice', { price: formatEuros(p.priceCents) })}
              </button>
            )}
          </div>
        ))}
      </div>

      <p style={{ textAlign:'center', fontSize:11.5, color:'var(--text3)', margin:'0 16px 16px' }}>
        {t('adminUsers.billingCancelAnytimeHint')}
      </p>
      {billingError && <p style={{ color:'var(--red)', fontSize:12, margin:'0 16px 16px', fontWeight:600, textAlign:'center' }}>{billingError}</p>}

      <style>{`
        .billing-plans { flex-direction: column; }
        @media (min-width: 760px) {
          .billing-plans { flex-direction: row; align-items: stretch; }
          .billing-plans > div { flex: 1 1 0; min-width: 0; }
        }
      `}</style>
    </div>
  )
}
