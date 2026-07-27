// Riceve gli eventi di Stripe (pagamento riuscito, fallito, abbonamento
// cancellato, ecc.) e aggiorna lo stato di billing della squadra su Firestore
// di conseguenza. Va configurato come endpoint webhook nella dashboard Stripe:
// https://<dominio>/api/stripe-webhook
//
// bodyParser DISABILITATO apposta: la verifica della firma Stripe richiede il
// corpo della richiesta byte-per-byte così come inviato, non ri-serializzato
// dopo un parsing JSON.
import Stripe from 'stripe'
import { getAdmin } from './_authAdmin.js'

export const config = { api: { bodyParser: false } }

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function findTeamRefByCustomerId(db, customerId) {
  if (!customerId) return null
  const snap = await db.collection('teams').where('stripeCustomerId', '==', customerId).limit(1).get()
  return snap.empty ? null : snap.docs[0].ref
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = req.headers['stripe-signature']
  const rawBody = await readRawBody(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Firma webhook non valida: ${err.message}` })
  }

  const db = getAdmin().firestore()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const teamId = session.client_reference_id
        if (teamId) {
          await db.collection('teams').doc(teamId).update({
            billingStatus: 'active',
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          })
        }
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const teamRef = await findTeamRefByCustomerId(db, sub.customer)
        if (teamRef) {
          const status = sub.status === 'active' || sub.status === 'trialing' ? 'active'
            : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due'
            : 'canceled'
          await teamRef.update({ billingStatus: status })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const teamRef = await findTeamRefByCustomerId(db, sub.customer)
        if (teamRef) await teamRef.update({ billingStatus: 'canceled' })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const teamRef = await findTeamRefByCustomerId(db, invoice.customer)
        if (teamRef) await teamRef.update({ billingStatus: 'past_due' })
        break
      }
      case 'invoice.paid': {
        // Rinnovo mensile riuscito dopo un past_due precedente: riattiva.
        const invoice = event.data.object
        const teamRef = await findTeamRefByCustomerId(db, invoice.customer)
        if (teamRef) await teamRef.update({ billingStatus: 'active' })
        break
      }
    }
    res.status(200).json({ received: true })
  } catch (e) {
    // 500 → Stripe ritenterà l'invio più tardi, invece di perdere l'evento.
    res.status(500).json({ error: e.message })
  }
}
