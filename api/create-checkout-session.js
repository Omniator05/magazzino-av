// Crea una sessione di pagamento Stripe Checkout (pagina ospitata da Stripe:
// i dati della carta non passano mai dal nostro codice) per abbonare la
// squadra dell'admin che chiama. Il client fa POST qui e reindirizza il
// browser all'URL restituito.
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
  const { teamRef, team, teamId } = ctx

  const stripe = getStripe()
  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    const customerId = await resolveTeamStripeCustomer(stripe, teamRef, team)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: teamId,
      success_url: `${origin}/admin/settings/billing?billing=success`,
      cancel_url: `${origin}/admin/settings/billing?billing=cancel`,
    })
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
