// Account "Freelance": personale esterno CON un account (a differenza degli utenti temporanei, che hanno solo un link).
// Ruolo `freelance` nel profilo, creato dall'admin in Impostazioni › Utenti (solo piani Pro). Vede un'app ristretta: un
// calendario con i soli eventi che gli sono assegnati.
//
// Sicurezza: il Freelance NON legge Firestore dal client (le regole gli negano ogni accesso ai dati della squadra, vedi
// isApprovedMember in firestore.rules): qui, con l'Admin SDK, si legge e si restituisce solo ciò che lo riguarda — gli
// eventi a cui è assegnato, senza contatti, costi o note interne (stessa forma pubblica del link ospite, vedi
// publicEvent in _guest.js).
//
// Vive qui e non in un endpoint a sé: il piano Hobby di Vercel ammette 12 funzioni e il progetto è già al limite, quindi
// push.js lo chiama dopo aver verificato il token (come _guest.js, _badge.js, _station.js). Il prefisso "_" lo esclude
// dal conteggio.
import { todayStr } from './_date.js'
import { publicEvent } from './_guest.js'
import { sendEmail, freelanceAssignedEmailHtml } from './_resend.js'

const PAST_DAYS = 62                    // quanto indietro il calendario del Freelance mostra i suoi eventi
const EMAIL_AGAIN_MS = 10 * 60 * 1000   // un'altra email per lo stesso evento non prima di 10 minuti

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + n)
  return todayStr(d)
}
const lastDayOf = ev => (ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date)

// Specchio di isBillingValid (src/utils/billing.js): i Freelance sono una funzione Pro (abbonamento attivo, esente o
// prova in corso). Senza squadra caricata non si decide a vuoto.
export function teamIsPro(team) {
  if (!team) return false
  const status = team.billingStatus
  if (status === 'exempt' || status === 'active') return true
  if (status === 'trialing') {
    const end = team.trialEndsAt?.toMillis ? team.trialEndsAt.toMillis() : (team.trialEndsAt ? new Date(team.trialEndsAt).getTime() : 0)
    return end > Date.now()
  }
  return false
}

async function view(req, res, { db, teamId, uid, profile }) {
  if (profile.role !== 'freelance') return res.status(403).json({ error: 'Solo per account Freelance' })
  const team = (await db.collection('teams').doc(teamId).get()).data() || {}
  // Se la squadra non è (più) su un piano Pro l'account resta, ma non vede nulla finché non torna attivo.
  if (!teamIsPro(team)) return res.status(402).json({ error: 'Funzione non disponibile per questo piano', code: 'plan' })

  const from = addDays(todayStr(), -PAST_DAYS)
  // Singoli campi + filtro squadra in JS: evita un indice composito (uguaglianza + array-contains) da creare a mano.
  const [blocksSnap, assignedSnap] = await Promise.all([
    db.collection('assignmentBlocks').where('teamId', '==', teamId).where('workerId', '==', uid).get(),
    db.collection('events').where('assignedWorkers', 'array-contains', uid).get(),
  ])
  const blocks = blocksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.date && b.date >= from)

  const byId = new Map()
  assignedSnap.docs.forEach(d => { const ev = { id: d.id, ...d.data() }; if (ev.teamId === teamId && ev.date) byId.set(ev.id, ev) })
  const missing = [...new Set(blocks.map(b => b.eventId).filter(Boolean))].filter(id => !byId.has(id))
  const extra = missing.length ? await db.getAll(...missing.map(id => db.collection('events').doc(id))) : []
  extra.forEach(s => { if (s.exists && s.data().teamId === teamId && s.data().date) byId.set(s.id, { id: s.id, ...s.data() }) })

  const events = [...byId.values()]
    .filter(ev => lastDayOf(ev) >= from)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(ev => ({
      ...publicEvent(ev, blocks.filter(b => b.eventId === ev.id).sort((a, b) => a.date.localeCompare(b.date))),
      // L'evento di cui è stato solo "aggiunto alla lista" (nessun turno con orario): il calendario usa le date dell'evento
      noShifts: !blocks.some(b => b.eventId === ev.id),
    }))
  const tasks = blocks.filter(b => !b.eventId).map(b => ({
    id: b.id, label: b.label || '', date: b.date, startTime: b.startTime || null, endTime: b.endTime || null,
  })).sort((a, b) => a.date.localeCompare(b.date))

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ me: { name: profile.name || '' }, team: { name: team.name || '' }, today: todayStr(), events, tasks })
}

// Email "ti hanno assegnato un evento" al Freelance (se ha un'email). La chiama, subito dopo l'assegnazione, l'admin che la
// fa. Silenziosa per chi non è un Freelance con email: il chiamante non deve distinguere.
async function emailAssigned(req, res, { db, teamId, profile }) {
  if (profile.role !== 'admin') return res.status(403).json({ error: 'Solo gli admin' })
  const workerId = String(req.body?.workerId || '')
  const eventId = String(req.body?.eventId || '')
  if (!workerId || !eventId) return res.status(400).json({ error: 'Dati mancanti' })

  const workerRef = db.collection('profiles').doc(workerId)
  const [workerSnap, eventSnap, teamSnap] = await Promise.all([workerRef.get(), db.collection('events').doc(eventId).get(), db.collection('teams').doc(teamId).get()])
  const worker = workerSnap.data()
  const event = eventSnap.data()
  if (!worker || worker.teamId !== teamId || worker.role !== 'freelance' || worker.active === false || !worker.email) return res.status(200).json({ skipped: 'not_freelance' })
  if (!event || event.teamId !== teamId) return res.status(200).json({ skipped: 'no_event' })
  if (!teamIsPro(teamSnap.data())) return res.status(200).json({ skipped: 'plan' })

  const last = Number(worker.assignEmailAt?.[eventId] || 0)
  if (Date.now() - last < EMAIL_AGAIN_MS) return res.status(200).json({ skipped: 'recent' })
  await workerRef.update({ [`assignEmailAt.${eventId}`]: Date.now() })

  const origin = req.headers.origin || `https://${req.headers.host}`
  try {
    await sendEmail({
      to: worker.email,
      subject: `Nuovo evento: ${event.name || ''} — ${teamSnap.data()?.name || 'Roadcase'}`,
      html: freelanceAssignedEmailHtml({ name: worker.name || '', teamName: teamSnap.data()?.name || '', event, appUrl: origin }),
      replyTo: process.env.RESEND_REPLY_TO || 'info@roadcase.it',
    })
  } catch (e) {
    console.error('freelance-email-assigned', e)
    return res.status(200).json({ skipped: 'send_failed' })
  }
  return res.status(200).json({ sent: true })
}

// true se l'azione era "freelance-*" e la risposta è già stata data.
export async function handleFreelanceAction(req, res, ctx) {
  const action = req.body?.action
  if (action === 'freelance-view') { await view(req, res, ctx); return true }
  if (action === 'freelance-email-assigned') { await emailAssigned(req, res, ctx); return true }
  return false
}
