// Crea una sessione di pagamento Stripe Checkout (pagina ospitata da Stripe:
// i dati della carta non passano mai dal nostro codice) per abbonare la
// squadra dell'admin che chiama. Il client fa POST qui e reindirizza il
// browser all'URL restituito.
import Stripe from 'stripe'
import { requireTeamAdmin } from './_authAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }
  const { teamRef, team, teamId } = ctx

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  let customerId = team.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({ name: team.name, metadata: { teamId } })
    customerId = customer.id
    await teamRef.update({ stripeCustomerId: customerId })
  }

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: teamId,
      success_url: `${origin}/admin/users?billing=success`,
      cancel_url: `${origin}/admin/users?billing=cancel`,
    })
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
