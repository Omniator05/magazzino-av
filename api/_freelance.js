// Account "Freelance": personale esterno CON un account (a differenza degli utenti temporanei, che hanno solo un link).
// Ruolo `freelance` nel profilo, creato dall'admin in Impostazioni › Utenti (solo piani Pro). Vede un'app ristretta: un
// calendario con i soli eventi che gli sono assegnati.
//
// Sicurezza: il Freelance NON legge Firestore dal client (le regole gli negano ogni accesso ai dati della squadra, vedi
// isApprovedMember in firestore.rules): qui, con l'Admin SDK, si legge e si restituisce solo ciò che lo riguarda — gli
// eventi a cui è assegnato, senza contatti, costi o note interne (stessa forma pubblica del link ospite, vedi
// publicEvent in _publicEvent.js).
//
// Vive qui e non in un endpoint a sé: il piano Hobby di Vercel ammette 12 funzioni e il progetto è già al limite, quindi
// push.js lo chiama dopo aver verificato il token (come _badge.js, _station.js). Il prefisso "_" lo esclude
// dal conteggio.
import crypto from 'node:crypto'
import { getAdmin } from './_authAdmin.js'
import { buildCalendar } from './_calendarIcs.js'
import { todayStr } from './_date.js'
import { publicEvent } from './_publicEvent.js'
import { sendEmail, freelanceAssignedEmailHtml } from './_resend.js'

const PAST_DAYS = 62                    // quanto indietro il calendario del Freelance mostra i suoi eventi
const EMAIL_AGAIN_MS = 90 * 1000        // più turni creati di seguito per lo stesso evento: una sola email (non una per turno)
const RESPONSE_KEEP_DAYS = 30           // per quanto restano le risposte (accettato/rifiutato) per il popup degli admin

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

// Eventi (forma pubblica) e attività assegnati a `uid` da `from` in poi. Usata dalla vista del Freelance e dall'abbonamento al calendario.
async function gather(db, teamId, uid, from) {
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
      // La sua risposta all'assegnazione: 'accepted' | 'declined' | null (ancora da confermare)
      response: ev.freelanceResponses?.[uid]?.status || null,
    }))
  const tasks = blocks.filter(b => !b.eventId).map(b => ({
    id: b.id, label: b.label || '', date: b.date, startTime: b.startTime || null, endTime: b.endTime || null,
  })).sort((a, b) => a.date.localeCompare(b.date))

  return { events, tasks }
}

async function view(req, res, { db, teamId, uid, profile }) {
  if (profile.role !== 'freelance') return res.status(403).json({ error: 'Solo per account Freelance' })
  const team = (await db.collection('teams').doc(teamId).get()).data() || {}
  // Se la squadra non è (più) su un piano Pro l'account resta, ma non vede nulla finché non torna attivo.
  if (!teamIsPro(team)) return res.status(402).json({ error: 'Funzione non disponibile per questo piano', code: 'plan' })

  const { events, tasks } = await gather(db, teamId, uid, addDays(todayStr(), -PAST_DAYS))

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ me: { name: profile.name || '' }, team: { name: team.name || '' }, today: todayStr(), events, tasks })
}

// ── Abbonamento al calendario ────────────────────────────────────────────────────────────────────────────────────────
// Il Freelance può abbonare il proprio calendario (Apple Calendario, Outlook…) a un indirizzo personale che restituisce i suoi
// eventi come file .ics e si aggiorna da solo quando l'admin cambia giorni/orari. Il calendario non può mandare il token di
// accesso, quindi l'indirizzo porta una chiave FIRMATA (HMAC) dal server: nessun segreto da salvare in Firestore (né regole da
// cambiare) e non si può costruire a mano. Smette di funzionare se l'account viene disattivato/eliminato o il piano scade.
const feedSecret = () => crypto.createHash('sha256').update(`freelance-feed:${JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).private_key}`).digest()
const feedSignature = uid => crypto.createHmac('sha256', feedSecret()).update(uid).digest('base64url')
const feedToken = uid => `${uid}.${feedSignature(uid)}`
function uidFromFeedToken(token) {
  const i = String(token || '').lastIndexOf('.')
  if (i < 1) return null
  const uid = token.slice(0, i), sig = token.slice(i + 1)
  const want = Buffer.from(feedSignature(uid)), got = Buffer.from(sig)
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? uid : null
}
const PHASE_NAME = { montaggio: 'Montaggio', smontaggio: 'Smontaggio' }

async function feedUrl(req, res, { uid, profile }) {
  if (profile.role !== 'freelance') return res.status(403).json({ error: 'Solo per account Freelance' })
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return res.status(200).json({ url: `https://${host}/api/push?feed=${encodeURIComponent(feedToken(uid))}` })
}

// GET /api/push?feed=<token> — pubblico (la chiave firmata è la credenziale), restituisce il calendario .ics.
export async function serveFreelanceFeed(req, res) {
  const uid = uidFromFeedToken(req.query?.feed)
  if (!uid) return res.status(404).send('Calendario non trovato')
  const db = getAdmin().firestore()
  const profile = (await db.collection('profiles').doc(uid).get()).data()
  if (!profile || profile.role !== 'freelance' || profile.active === false || profile.approved === false) return res.status(404).send('Calendario non trovato')
  const team = (await db.collection('teams').doc(profile.teamId).get()).data() || {}
  if (!teamIsPro(team)) return res.status(402).send('Funzione non disponibile per questo piano')

  const { events, tasks } = await gather(db, profile.teamId, uid, addDays(todayStr(), -7))
  const items = [
    // Gli eventi rifiutati non vanno nel calendario
    ...events.filter(ev => ev.response !== 'declined'),
    ...tasks.map(tk => ({ id: tk.id, name: tk.label || 'Attività', date: tk.date, blocks: [{ id: tk.id, date: tk.date, startTime: tk.startTime, endTime: tk.endTime }] })),
  ]
  const ics = buildCalendar(items, ph => PHASE_NAME[ph] || '', { name: `Roadcase · ${team.name || ''}`.trim(), subscribe: true })
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).send(ics)
}

// Il Freelance accetta o rifiuta un evento a cui è assegnato. La risposta vale per l'evento intero e sta sull'evento
// (`freelanceResponses.<uid>`), così la timeline degli admin la legge senza altre query; torna "da confermare" quando l'admin
// ne cambia giorno/orario o lo toglie e lo riassegna (vedi assignmentBlocks.js e pushNotifications.js). Gli admin ricevono
// una push e un popup nella Home (documento in `freelanceResponses`, scritto solo da qui).
async function respond(req, res, { db, teamId, uid, profile, pushToAdmins }) {
  if (profile.role !== 'freelance') return res.status(403).json({ error: 'Solo per account Freelance' })
  const eventId = String(req.body?.eventId || '')
  const status = req.body?.response
  if (!eventId || !['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Dati mancanti' })

  const team = (await db.collection('teams').doc(teamId).get()).data() || {}
  if (!teamIsPro(team)) return res.status(402).json({ error: 'Funzione non disponibile per questo piano', code: 'plan' })

  const eventRef = db.collection('events').doc(eventId)
  const event = (await eventRef.get()).data()
  if (!event || event.teamId !== teamId) return res.status(404).json({ error: 'Evento non trovato' })
  // Solo un evento a cui è davvero assegnato (nella lista dell'evento o con un turno)
  let assigned = (event.assignedWorkers || []).includes(uid)
  if (!assigned) {
    const own = await db.collection('assignmentBlocks').where('teamId', '==', teamId).where('workerId', '==', uid).where('eventId', '==', eventId).limit(1).get()
    assigned = !own.empty
  }
  if (!assigned) return res.status(403).json({ error: 'Non sei assegnato a questo evento' })

  if (event.freelanceResponses?.[uid]?.status === status) return res.status(200).json({ ok: true, unchanged: true })

  const admin = getAdmin()
  const now = Date.now()
  await eventRef.update({ [`freelanceResponses.${uid}`]: { status, at: now } })
  await db.collection('freelanceResponses').add({
    teamId, workerId: uid, workerName: profile.name || '', eventId, eventName: event.name || '', eventDate: event.date || null,
    status, createdAt: admin.firestore.FieldValue.serverTimestamp(), dismissedBy: [],
  })

  // Pulizia delle risposte vecchie (il popup mostra solo le recenti)
  try {
    const old = await db.collection('freelanceResponses').where('teamId', '==', teamId).get()
    const cutoff = now - RESPONSE_KEEP_DAYS * 86400000
    await Promise.all(old.docs.filter(d => (d.data().createdAt?.toMillis?.() || now) < cutoff).map(d => d.ref.delete()))
  } catch (e) { console.warn('[freelance-respond] pulizia:', e.message) }

  // Push agli admin (best-effort: la risposta è già salvata)
  try {
    const who = profile.name || 'Un Freelance'
    await pushToAdmins?.({
      title: status === 'accepted' ? `${who} ha accettato` : `${who} ha rifiutato`,
      body: event.name || '',
      url: `/events/${eventId}`,
    })
  } catch (e) { console.warn('[freelance-respond] push:', e.message) }
  return res.status(200).json({ ok: true })
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
  const skip = reason => { console.warn(`[freelance-email-assigned] non inviata: ${reason}`); return res.status(200).json({ skipped: reason }) }
  if (!worker || worker.teamId !== teamId || worker.role !== 'freelance' || worker.active === false || !worker.email) return skip(!worker?.email ? 'manca_email' : 'non_freelance')
  if (!event || event.teamId !== teamId) return skip('no_event')
  if (!teamIsPro(teamSnap.data())) return skip('piano')

  const last = Number(worker.assignEmailAt?.[eventId] || 0)
  if (Date.now() - last < EMAIL_AGAIN_MS) return skip('gia_inviata_da_poco')
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
    console.error('[freelance-email-assigned] invio fallito:', e.message)
    return res.status(200).json({ skipped: 'invio_fallito' })
  }
  return res.status(200).json({ sent: true })
}

// true se l'azione era "freelance-*" e la risposta è già stata data.
export async function handleFreelanceAction(req, res, ctx) {
  const action = req.body?.action
  if (action === 'freelance-view') { await view(req, res, ctx); return true }
  if (action === 'freelance-feed-url') { await feedUrl(req, res, ctx); return true }
  if (action === 'freelance-respond') { await respond(req, res, ctx); return true }
  if (action === 'freelance-email-assigned') { await emailAssigned(req, res, ctx); return true }
  return false
}
