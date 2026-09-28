import { isBillingValid } from './billing'

// Versione gratuita: non più un blocco totale dell'app dopo la prova (quello
// resta solo per pagamento fallito, vedi isProPlan sotto + App.jsx), ma un
// piano limitato e utilizzabile a tempo indeterminato. Numeri decisi col
// cliente (2026-08-31).
export const FREE_LIMITS = {
  itemsPerList: 20,   // oggetti per lista di carico
  itemsInWarehouse: 50, // oggetti totali in magazzino (kit inclusi, sono anche loro un doc 'items')
  admins: 1,
  workers: 3,
}

// Piano Team (il piano a pagamento "di base", 3 tier introdotti 2026-09-28):
// oltre al numero di admin, anche magazzinieri e oggetti in magazzino hanno
// un tetto più alto ma non illimitato (2026-09-28, per dare un motivo
// concreto di passare a Business) — solo gli oggetti per lista restano
// illimitati su ENTRAMBI i piani a pagamento (vedi isProPlan sotto).
export const TEAM_LIMITS = {
  admins: 5,
  itemsInWarehouse: 300,
  workers: 10,
}

// "Pro" = abbonamento valido (prova in corso, attivo, o esente). Qualunque
// altro stato — prova scaduta, cancellato — opera nella versione gratuita
// con i limiti sopra invece di bloccare tutto: il blocco totale (BillingGate)
// resta riservato al solo pagamento fallito (past_due), vedi App.jsx. Vale
// per TUTTI i limiti tranne quelli su admin, oggetti in magazzino e
// magazzinieri (vedi adminLimit/warehouseLimit/workerLimit sotto) — solo le
// liste restano uguali su Team e Business.
export function isProPlan(team) {
  return isBillingValid(team)
}

// Tetto di account admin per questa squadra: una delle due cose che
// distinguono Team da Business. Gratuito → FREE_LIMITS.admins; in prova o
// esente → nessun tetto (il trial deve far provare l'esperienza piena, come
// sempre); abbonati → TEAM_LIMITS.admins a meno che team.planTier non sia
// 'business'. Un abbonato già attivo PRIMA dell'introduzione dei 3 piani
// (team.planTier ancora assente — si popola al prossimo evento webhook, vedi
// api/stripe-webhook.js) conta come 'team': è già pagante, non va bloccato
// per un campo non ancora scritto.
export function adminLimit(team) {
  const status = team?.billingStatus
  if (status === 'trialing' || status === 'exempt') return Infinity
  if (status !== 'active') return FREE_LIMITS.admins
  return team?.planTier === 'business' ? Infinity : TEAM_LIMITS.admins
}

// Tetto di oggetti in magazzino per questa squadra — stessa logica di
// adminLimit sopra (stesso trattamento dei grandfathered senza planTier
// ancora scritto), una delle leve che distingue Team da Business.
export function warehouseLimit(team) {
  const status = team?.billingStatus
  if (status === 'trialing' || status === 'exempt') return Infinity
  if (status !== 'active') return FREE_LIMITS.itemsInWarehouse
  return team?.planTier === 'business' ? Infinity : TEAM_LIMITS.itemsInWarehouse
}

// Tetto di magazzinieri per questa squadra — stessa logica di adminLimit
// sopra, la terza leva che distingue Team da Business.
export function workerLimit(team) {
  const status = team?.billingStatus
  if (status === 'trialing' || status === 'exempt') return Infinity
  if (status !== 'active') return FREE_LIMITS.workers
  return team?.planTier === 'business' ? Infinity : TEAM_LIMITS.workers
}

// Popup mostrato ovunque si tocchi un limite del piano gratuito — stesso
// dialog di conferma già usato in tutta l'app (useConfirm), riusato come
// avviso: solo l'admin vede il bottone "Passa a Pro" (naviga alla
// fatturazione), un magazziniere/organizzatore vede solo un avviso da
// chiudere — non ha senso mandarlo su una pagina admin a cui non accede.
export async function promptLimitReached({ confirm, navigate, isAdmin, t, message }) {
  if (!isAdmin) {
    await confirm({ title: t('planLimits.limitTitle'), message, confirmLabel: t('common.gotIt') })
    return
  }
  const proceed = await confirm({
    title: t('planLimits.limitTitle'), message,
    confirmLabel: t('planLimits.upgradeButton'), cancelLabel: t('common.gotIt'),
  })
  if (proceed) navigate('/admin/settings/billing')
}
