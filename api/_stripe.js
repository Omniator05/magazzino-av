// Helper Stripe condiviso da checkout/portal/upgrade/webhook — stessa idea
// di getAdmin() in _authAdmin.js (un'unica istanza per funzione serverless).
import Stripe from 'stripe'

let stripeInstance = null
export function getStripe() {
  if (!stripeInstance) stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeInstance
}

// Due Price Stripe, uno per piano — usati sia dal checkout (nuovi abbonati,
// vedi create-checkout-session.js) che dall'upgrade diretto Team→Business su
// un abbonamento già attivo (vedi upgrade-subscription.js). Il vecchio
// STRIPE_PRICE_ID (35€) non è referenziato qui: resta agganciato SOLO agli
// abbonamenti già attivi prima dei 3 piani (2026-09-28), che continuano a
// rinnovarsi da soli a quel prezzo senza bisogno di nessuna migrazione.
export const PRICE_IDS = {
  team: process.env.STRIPE_PRICE_ID_TEAM,
  business: process.env.STRIPE_PRICE_ID_BUSINESS,
}

// Da quale Price Stripe è fatto l'abbonamento → quale dei 2 piani a
// pagamento. Un Price sconosciuto (es. il vecchio STRIPE_PRICE_ID a 35€,
// ancora agganciato agli abbonati di prima) non produce nessun tier — resta
// quello che adminLimit()/workerLimit()/warehouseLimit() già trattano come
// 'team' di default in src/utils/planLimits.js.
export function tierFromPriceId(priceId) {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) return 'business'
  if (priceId === process.env.STRIPE_PRICE_ID_TEAM) return 'team'
  return null
}

// Campi "premium" scritti su Firestore ogni volta che un abbonamento cambia
// stato (webhook) o viene aggiornato direttamente (upgrade-subscription.js):
// data del prossimo rinnovo, se è già stato messo in disdetta, quale piano è
// e il prezzo VERO pagato (non un numero fisso: gli abbonati da prima dei 3
// piani restano al loro prezzo, vedi tierFromPriceId sopra). `sub` è un
// oggetto Subscription di Stripe.
export function subscriptionFields(sub) {
  const out = {}
  if (sub?.current_period_end) {
    out.currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString()
  }
  out.cancelAtPeriodEnd = sub?.cancel_at_period_end === true
  const price = sub?.items?.data?.[0]?.price
  const tier = tierFromPriceId(price?.id)
  if (tier) out.planTier = tier
  if (typeof price?.unit_amount === 'number') out.planPriceCents = price.unit_amount
  return out
}

// Da sub.status (Stripe) a billingStatus (il nostro), stessa mappatura usata
// sia dal webhook (customer.subscription.updated) che dall'upgrade diretto —
// un solo posto dove questa corrispondenza è scritta.
export function billingStatusFromSubStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid') return 'past_due'
  return 'canceled'
}

// Il customerId salvato sulla squadra (team.stripeCustomerId) può riferirsi
// a una modalità Stripe diversa da quella della chiave attualmente in uso —
// tipicamente perché è stato creato quando STRIPE_SECRET_KEY era ancora una
// chiave di TEST, e poi la chiave è passata a "live" per andare in
// produzione. Stripe in quel caso rifiuta la richiesta con un errore secco
// ("No such customer... a similar object exists in test mode, but a live
// mode key was used"), che altrimenti arriverebbe crudo all'utente durante
// il checkout. Qui verifichiamo che il customer esista davvero nella
// modalità corrente e, se non è così (o non esiste ancora), ne creiamo uno
// nuovo — stesso comportamento "guasto quindi ripara" già usato altrove nel
// progetto per gli account Auth orfani.
export async function resolveTeamStripeCustomer(stripe, teamRef, team) {
  if (team.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(team.stripeCustomerId)
      if (!customer.deleted) return customer.id
    } catch (e) {
      if (e.code !== 'resource_missing') throw e
      // Customer non valido nella modalità corrente (o cancellato): cadiamo
      // nel ramo sotto e ne creiamo uno nuovo invece di bloccare l'utente.
    }
  }
  const customer = await stripe.customers.create({ name: team.name, metadata: { teamId: teamRef.id } })
  await teamRef.update({ stripeCustomerId: customer.id })
  return customer.id
}
