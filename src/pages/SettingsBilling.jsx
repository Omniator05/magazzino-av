import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { trialDaysLeft } from '../utils/billing'
import { FREE_LIMITS, TEAM_LIMITS } from '../utils/planLimits'
import { formatDate } from '../utils/formatDate'
import { Check, Star, Warn } from '../components/Icon'
import PageHeader from '../components/PageHeader'

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
// I due piani a pagamento (introdotti 2026-09-28) — differiscono su tre
// leve: numero di admin, magazzinieri e oggetti in magazzino. priceCents è
// il prezzo per i NUOVI abbonati; chi si è abbonato prima di questi 2 piani
// vede il proprio prezzo vero da team.planPriceCents (vedi la vista PREMIUM
// sotto), non questo valore. `features`: elenco mostrato dentro la card
// (renderPlanCard, riusata identica sia nella vista ACQUISIZIONE che
// nell'upgrade a Business dentro PREMIUM) — { key, vars? } così ogni card
// può avere numeri diversi riga per riga (il piano Free sotto ne ha bisogno,
// i due a pagamento no).
const PLANS = [
  {
    tier: 'team', nameKey: 'billingPlanNameTeam', priceCents: 4500, betaBadge: true, recommended: true,
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
// mai nella vista PREMIUM (una squadra gratuita non è mai "abbonata").
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

// Stili condivisi dalle due viste: pulsanti dei piani e griglia delle card.
const BILLING_CSS = `
  .billing-shell { padding: 0 0 40px; }
  .billing-btn { width: 100%; min-height: 48px; border-radius: 13px; font-size: 14.5px; font-weight: 800; cursor: pointer;
    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease; }
  .billing-btn-primary { background: var(--accent); color: #fff; border: none; box-shadow: 0 6px 18px rgba(230,57,70,0.28); }
  .billing-btn-secondary { background: var(--c-surface, var(--card)); color: var(--c-ink, var(--text)); border: 1.5px solid var(--c-line, var(--border)); }
  .billing-btn:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) {
    .billing-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(230,57,70,0.36); }
    .billing-btn-secondary:hover:not(:disabled) { border-color: var(--c-ink3, var(--text2)); }
  }
  .billing-plans { flex-direction: column; }
  @media (min-width: 760px) {
    .billing-plans { flex-direction: row; align-items: stretch; }
    .billing-plans > div { flex: 1 1 0; min-width: 0; }
  }
`

export default function SettingsBilling() {
  const { t, i18n } = useTranslation()
  const { user, team } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  // Ritorno da Stripe Checkout: il webhook aggiorna già billingStatus da solo,
  // questo stato serve solo a mostrare l'hero PREMIUM in versione "grazie"
  // invece di quella normale (vedi sotto) — resta true per il resto di questa
  // sessione della pagina, sparisce da solo a un refresh/nuova visita perché
  // il parametro ?billing=success viene tolto subito dall'URL.
  const [justSubscribed, setJustSubscribed] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(location.search).get('billing') === 'success') {
      setJustSubscribed(true)
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

  // Cambia il piano direttamente sull'abbonamento già attivo (vedi
  // api/upgrade-subscription.js) invece di passare dal Billing Portal, che
  // richiede di elencare lì i Price selezionabili — una configurazione
  // separata per test/live che si è rivelata inaffidabile. Nessun redirect:
  // l'aggiornamento è immediato, poi ricarica la pagina per rileggere il
  // team fresco da Firestore (AuthContext lo carica solo al login, non ha un
  // listener realtime — vedi il commento su updateTeamData lì).
  const upgradeToBusiness = async () => {
    setBillingLoading(true); setBillingError('')
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/upgrade-subscription', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'business' }),
      })
      const data = await res.json()
      if (res.ok) window.location.reload()
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
  // Una squadra esente non passa mai da un checkout Stripe (l'accesso è
  // offerto), quindi non ha senso mostrarle l'hero "grazie per l'acquisto".
  const showWelcome = justSubscribed && !isExempt
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
    <PageHeader title={t('adminUsers.billingTitle')} backTo="/admin/settings" />
  )

  // Scheda piano — riusata identica sia per le 3 card della vista
  // ACQUISIZIONE sia per l'unica card "fai l'upgrade a Business" dentro
  // PREMIUM: stessa presentazione (nome, prezzo, elenco funzioni), cambia
  // solo cosa succede al click del bottone, passato da chi la chiama.
  const renderPlanCard = (p, cta) => (
    <div key={p.tier} style={{
      position:'relative',
      background: p.recommended ? 'linear-gradient(180deg, rgba(230,57,70,0.07) 0%, var(--c-surface, var(--card)) 38%)' : 'var(--c-surface, var(--card))',
      border: p.recommended ? '2px solid var(--accent)' : '1px solid var(--c-line, var(--border))',
      borderRadius:20, padding: p.recommended ? '25px 22px 22px' : '26px 22px 22px',
      boxShadow: p.recommended ? '0 14px 34px rgba(230,57,70,0.16)' : 'none',
      display:'flex', flexDirection:'column', gap:18,
      opacity: p.tier === 'free' ? 0.92 : 1,
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
          <p style={{ fontSize:36, fontWeight:800, letterSpacing:'-1px', color: p.recommended ? 'var(--accent)' : 'var(--text)', lineHeight:1 }}>
            {p.tier === 'free' ? formatEuros(p.priceCents) : <>{formatEuros(p.priceCents)}<span style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>/{t('adminUsers.billingPerMonth')}</span></>}
          </p>
          {p.betaBadge && <span style={{ fontSize:10, fontWeight:700, color:'var(--text2)', letterSpacing:'0.3px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 6px' }}>PREZZO BETA</span>}
        </div>
      </div>

      {/* flex:1 assorbe lo spazio in eccesso quando più card sono affiancate
          e stirate alla stessa altezza (vedi vista ACQUISIZIONE, dove Free
          ha una riga in meno delle altre due): senza, il bottone della card
          più corta resterebbe più in alto, fuori riga dalle altre. */}
      <div style={{ display:'flex', flexDirection:'column', gap:9, flex:1 }}>
        {p.recommended && (
          <p style={{ display:'flex', alignItems:'center', gap:6, margin:'0 0 4px', fontSize:12.5, fontWeight:800, color:'var(--accent)' }}>
            <Star size={13} /> {t('adminUsers.billingMostChosen')}
          </p>
        )}
        {p.features.map(f => (
          <div key={f.key} style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
            <div style={{ width:20, height:20, flexShrink:0, borderRadius:6, marginTop:1, background: p.recommended ? 'rgba(230,57,70,0.12)' : 'rgba(52,168,83,0.13)', color: p.recommended ? 'var(--accent)' : '#2f9e5b', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={11} />
            </div>
            <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text)', lineHeight:1.4 }}>
              {t(`adminUsers.${f.key}`, f.vars)}
            </p>
          </div>
        ))}
      </div>

      {cta}
    </div>
  )

  /* ─────────────────────────  VISTA PREMIUM  ───────────────────────── */
  if (isPremium) {
    return (
      <div className="page">
        {header}
        <style>{BILLING_CSS}</style>
        <div className="billing-shell">

        {/* Hero Pro — la ricompensa emotiva dell'upgrade. Gradiente accento,
            crest a stella, ringraziamento. Nessun prezzo in evidenza, nessun
            invito ad agire: qui l'azione è già stata compiuta.
            Appena tornati da un checkout riuscito (justSubscribed), lo stesso
            hero mostra per questa visita eyebrow/titolo dedicati al "grazie"
            invece della versione standard — il corpo del testo resta lo
            stesso (cosa la squadra ha sbloccato), non serve duplicarlo. Un
            solo ingresso animato (.animate-in, già usata altrove nell'app),
            non ripetuto ai render successivi. */}
        <div className={showWelcome ? 'animate-in' : undefined} style={{
          margin:'18px 16px 18px', borderRadius:20, overflow:'hidden', position:'relative',
          background:'linear-gradient(145deg, #e63946 0%, #b31f3c 100%)',
          padding:'22px 20px 24px', color:'#fff',
          boxShadow:'0 12px 32px rgba(179,31,60,0.28)',
        }}>
          <div style={{ position:'absolute', top:-34, right:-24, opacity:0.13, pointerEvents:'none', color:'#fff' }}>
            <Star size={150} />
          </div>
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              {showWelcome ? <Check size={15} /> : <Star size={15} />}
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:'1.4px' }}>
                {showWelcome ? t('adminUsers.billingWelcomeEyebrow')
                  : isExempt ? t('adminUsers.billingExemptEyebrow')
                  : t(`adminUsers.billingProEyebrow_${plan.tier}`)}
              </span>
            </div>
            <p style={{ fontSize:25, fontWeight:800, letterSpacing:'-0.4px', lineHeight:1.1, marginBottom:8 }}>
              {showWelcome ? t('adminUsers.billingWelcomeHeading', { plan: t(`adminUsers.${plan.nameKey}`) })
                : isExempt ? t('adminUsers.billingExemptHeading')
                : t(`adminUsers.billingProHeading_${plan.tier}`)}
            </p>
            <p style={{ fontSize:13, lineHeight:1.55, color:'rgba(255,255,255,0.88)', maxWidth:340 }}>
              {isExempt ? t('adminUsers.billingExemptThanks') : t(`adminUsers.billingProThanks_${plan.tier}`)}
            </p>
          </div>
        </div>

        {/* Gestione pagamento — solo per gli abbonati veri (l'esente non ha
            nulla da gestire). Cosa la squadra ha sbloccato vive solo nel
            testo dell'hero sopra: niente checklist duplicata qui sotto. */}
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

            {/* Fai l'upgrade a Business — prima era una riga di testo sotto
                il bottone "Gestisci pagamento", facile da non notare. Ora è
                la stessa identica card di vendita della vista ACQUISIZIONE
                (renderPlanCard sopra), con la propria descrizione e il
                proprio elenco funzioni — non serve inventarne una versione
                ridotta. Il bottone apre comunque lo stesso Billing Portal:
                cambiare piano (Team→Business) passa da lì, se configurato in
                Stripe con entrambi i Price come opzioni di cambio
                abbonamento — nessun altro bottone/endpoint dedicato. */}
            {plan.tier === 'team' && !cancelScheduled && (
              <>
                <p style={{ padding:'0 16px 8px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                  {t('adminUsers.billingUpgradeSectionTitle')}
                </p>
                <div style={{ margin:'0 16px 18px' }}>
                  {renderPlanCard(
                    PLANS.find(p => p.tier === 'business'),
                    <button onClick={upgradeToBusiness} className="billing-btn billing-btn-primary" disabled={billingLoading}>
                      {billingLoading ? t('common.saving') : t('adminUsers.billingUpgradeCardButton')}
                    </button>
                  )}
                </div>
              </>
            )}

            {billingError && <p style={{ color:'var(--red)', fontSize:12, margin:'0 16px 16px', fontWeight:600, textAlign:'center' }}>{billingError}</p>}

            {/* Chiusura pagina: piano/prezzo/rinnovo reali in una riga
                (l'hero sopra non li mostra), poi un solo bottone per tutto
                il resto della gestione — niente più card a sé. */}
            <div style={{ margin:'0 16px 16px', textAlign:'center' }}>
              <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, marginBottom:10 }}>
                {t('adminUsers.billingPlanRow', { plan: t(`adminUsers.${plan.nameKey}`) })} — {formatEuros(planPriceCents)}/{t('adminUsers.billingPerMonth')}
                {renewalDate && !cancelScheduled && <>. {t('adminUsers.billingNextRenewal', { date: renewalDate })}</>}
              </p>
              <button onClick={() => manageBilling(true)} className="billing-btn billing-btn-secondary" disabled={billingLoading}>
                {billingLoading ? t('common.redirecting')
                  : cancelScheduled ? t('adminUsers.billingReactivateButton')
                  : t('adminUsers.billingManagePlanButton')}
              </button>
            </div>
          </>
        )}
        </div>
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

  // Avanzamento della prova (30 giorni): barra che si riempie man mano che passano i giorni.
  const trialProgress = status === 'trialing' ? Math.min(1, Math.max(0, (30 - daysLeft) / 30)) : 1

  return (
    <div className="page">
      {header}
      <style>{BILLING_CSS}</style>
      <div className="billing-shell">

      {/* Stato dell'abbonamento in testa: a sinistra il contatore (giorni rimasti), a destra cosa
          succede alla fine; sotto, la barra di avanzamento della prova. Il colore sale di tono
          man mano che la prova finisce. */}
      <div style={{ margin:'18px 16px 26px', borderRadius:20, padding:'22px 24px', background:urgencyBg, border:`1.5px solid ${urgencyBorder}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:22, flexWrap:'wrap' }}>
          {status === 'trialing' ? (
            <div style={{ display:'flex', alignItems:'baseline', gap:9, flexShrink:0 }}>
              <span style={{ fontSize:56, fontWeight:800, lineHeight:1, letterSpacing:'-2px', color:urgencyColor, fontVariantNumeric:'tabular-nums' }}>{daysLeft}</span>
              <span style={{ fontSize:14, fontWeight:700, color:urgencyColor, maxWidth:130, lineHeight:1.25 }}>{t('adminUsers.billingTrialingDaysLabel', { count: daysLeft })}</span>
            </div>
          ) : (
            <p style={{ fontSize:19, fontWeight:800, color:urgencyColor, margin:0, flexShrink:0 }}>
              {status === 'past_due' ? t('adminUsers.billingRowPastDue') : t('adminUsers.billingUrgentHeadingCanceled')}
            </p>
          )}
          <p style={{ flex:'1 1 260px', minWidth:0, fontSize:14, color:'var(--text2)', lineHeight:1.55, margin:0 }}>
            {t(status === 'trialing' ? 'adminUsers.billingRestrictionIntroTrialing'
              : status === 'past_due' ? 'adminUsers.billingRestrictionIntroPastDue'
              : 'adminUsers.billingRestrictionIntroCanceled')}
          </p>
        </div>
        {status === 'trialing' && (
          <div style={{ height:6, borderRadius:3, background:'rgba(128,128,128,0.18)', marginTop:18, overflow:'hidden' }} aria-hidden="true">
            <div style={{ height:'100%', width:`${Math.round(trialProgress * 100)}%`, borderRadius:3, background:urgencyColor, transition:'width .6s ease' }} />
          </div>
        )}
      </div>

      <p style={{ padding:'0 16px 16px', color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
        {t('adminUsers.billingPlansSectionTitle')}
      </p>

      {/* Tre piani, ognuno una scheda prodotto completa e autonoma — la
          consigliata (Team) per prima. Colonna su mobile, tre affiancate da
          desktop in su (vedi .billing-plans nel CSS sopra). */}
      <div className="billing-plans" style={{ margin:'0 16px 8px', display:'flex', gap:16 }}>
        {[...PLANS, FREE_PLAN].map(p => renderPlanCard(p,
          /* Free non è un'azione — è dove ci si trova già finché non si
             sceglie uno degli altri due piani. Bottone non cliccabile. */
          p.tier === 'free' ? (
            <button className="billing-btn billing-btn-secondary" disabled>
              {t('adminUsers.billingCurrentPlanButton')}
            </button>
          ) : (
            <button
              onClick={() => manageBilling(isSubscribed, p.tier)}
              className={`billing-btn ${isSubscribed || !p.recommended ? 'billing-btn-secondary' : 'billing-btn-primary'}`}
              disabled={billingLoading}
            >
              {billingLoading ? t('common.redirecting')
                : isSubscribed ? t('adminUsers.manageBillingButton')
                : t('adminUsers.subscribeButtonWithPrice', { price: formatEuros(p.priceCents) })}
            </button>
          )
        ))}
      </div>

      <p style={{ textAlign:'center', fontSize:12, color:'var(--text3)', margin:'14px 16px 16px' }}>
        {t('adminUsers.billingCancelAnytimeHint')}
      </p>
      {billingError && <p style={{ color:'var(--red)', fontSize:12, margin:'0 16px 16px', fontWeight:600, textAlign:'center' }}>{billingError}</p>}
      </div>
    </div>
  )
}
