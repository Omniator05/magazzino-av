// Helper Stripe condiviso da checkout/portal — stessa idea di getAdmin() in
// _authAdmin.js (un'unica istanza per funzione serverless).
import Stripe from 'stripe'

let stripeInstance = null
export function getStripe() {
  if (!stripeInstance) stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeInstance
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
