// Crea una sessione del Billing Portal di Stripe (pagina ospitata da Stripe
// per gestire/annullare l'abbonamento, cambiare metodo di pagamento, vedere
// le fatture) per la squadra dell'admin che chiama.
import Stripe from 'stripe'
import { requireTeamAdmin } from './_stripeAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }
  const { team } = ctx

  if (!team.stripeCustomerId) {
    return res.status(400).json({ error: 'Nessun abbonamento da gestire ancora' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const origin = req.headers.origin || `https://${req.headers.host}`

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: `${origin}/admin/users`,
    })
    res.status(200).json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
