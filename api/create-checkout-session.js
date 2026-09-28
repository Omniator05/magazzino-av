// Crea una sessione di pagamento Stripe Checkout (pagina ospitata da Stripe:
// i dati della carta non passano mai dal nostro codice) per abbonare la
// squadra dell'admin che chiama. Il client fa POST qui e reindirizza il
// browser all'URL restituito.
import { requireTeamAdmin } from './_authAdmin.js'
import { getStripe, resolveTeamStripeCustomer } from './_stripe.js'

// Due Price Stripe, uno per piano — il vecchio STRIPE_PRICE_ID (35€) non è
// più referenziato da nessuna parte del codice: resta agganciato SOLO agli
// abbonamenti già attivi prima dei 3 piani (2026-09-28), che continuano a
// rinnovarsi da soli a quel prezzo senza bisogno di nessuna migrazione.
const PRICE_IDS = {
  team: process.env.STRIPE_PRICE_ID_TEAM,
  business: process.env.STRIPE_PRICE_ID_BUSINESS,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }
  const { teamRef, team, teamId } = ctx

  const tier = req.body?.tier === 'business' ? 'business' : 'team'
  const priceId = PRICE_IDS[tier]
  if (!priceId) return res.status(500).json({ error: `Prezzo non configurato per il piano ${tier}` })

  const stripe = getStripe()
  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    const customerId = await resolveTeamStripeCustomer(stripe, teamRef, team)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
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
