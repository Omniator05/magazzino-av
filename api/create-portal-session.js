// Crea una sessione del Billing Portal di Stripe (pagina ospitata da Stripe
// per gestire/annullare l'abbonamento, cambiare metodo di pagamento, vedere
// le fatture) per la squadra dell'admin che chiama.
import { requireTeamAdmin } from './_authAdmin.js'
import { getStripe, resolveTeamStripeCustomer } from './_stripe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }
  const { teamRef, team } = ctx

  if (!team.stripeCustomerId) {
    return res.status(400).json({ error: 'Nessun abbonamento da gestire ancora' })
  }

  const stripe = getStripe()
  const origin = req.headers.origin || `https://${req.headers.host}`

  try {
    // resolveTeamStripeCustomer ripara da solo un customerId rimasto da una
    // modalità Stripe diversa (test/live) — vedi commento in _stripe.js.
    const customerId = await resolveTeamStripeCustomer(stripe, teamRef, team)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/admin/settings/billing`,
    })
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
