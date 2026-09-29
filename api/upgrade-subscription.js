// Cambia il piano di un abbonamento già attivo (oggi solo Team→Business)
// direttamente sull'abbonamento Stripe esistente, invece di mandare l'utente
// al Billing Portal — quella strada richiede una configurazione specifica
// lato Stripe Dashboard (quali Price sono selezionabili nel portal, spesso
// da impostare separatamente per test e live) che si è dimostrata poco
// affidabile: senza quella configurazione esatta il portal non offre alcun
// modo di cambiare piano, mostrando solo metodo di pagamento e fatturazione.
// Qui invece basta la chiave Stripe già in uso, nessuna configurazione extra.
import { requireTeamAdmin } from './_authAdmin.js'
import { getStripe, PRICE_IDS, subscriptionFields, billingStatusFromSubStatus } from './_stripe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let ctx
  try {
    ctx = await requireTeamAdmin(req)
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }
  const { teamRef, team } = ctx

  const tier = req.body?.tier === 'business' ? 'business' : 'team'
  const priceId = PRICE_IDS[tier]
  if (!priceId) return res.status(500).json({ error: `Prezzo non configurato per il piano ${tier}` })
  if (!team.stripeSubscriptionId) return res.status(400).json({ error: 'Nessun abbonamento attivo da aggiornare' })

  const stripe = getStripe()
  try {
    const sub = await stripe.subscriptions.retrieve(team.stripeSubscriptionId)
    const itemId = sub.items.data[0]?.id
    if (!itemId) return res.status(500).json({ error: 'Abbonamento senza righe da aggiornare' })

    // proration_behavior: 'create_prorations' — il passaggio è immediato, non
    // programmato al prossimo rinnovo: Stripe accredita/addebita la
    // differenza sulla prossima fattura invece di far aspettare l'utente.
    const updated = await stripe.subscriptions.update(team.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'create_prorations',
    })

    // Stesso aggiornamento che farebbe il webhook su customer.subscription.updated
    // (che arriva comunque, in modo idempotente) — lo scriviamo subito qui
    // così l'utente vede il piano nuovo senza dover aspettare l'evento.
    await teamRef.update({ billingStatus: billingStatusFromSubStatus(updated.status), ...subscriptionFields(updated) })

    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
