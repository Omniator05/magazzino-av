// Link ospite per personale esterno (non registrato): una pagina in SOLA
// LETTURA con gli eventi a lui assegnati, i suoi orari e la lista di carico,
// raggiungibile da un link con una chiave casuale — nessun account.
//
// Vive qui e non in un endpoint a sé perché il piano Hobby di Vercel ammette
// al massimo 12 Serverless Functions e il progetto è già a 12: il file è
// chiamato da push.js (handler), come le altre funzioni "condivise" (vedi la
// nota in testa a push.js). Il prefisso "_" lo esclude dal conteggio.
//
// Sicurezza: il client NON legge mai Firestore per l'ospite. Qui, con l'Admin
// SDK, si controlla la chiave e si restituisce solo ciò che quella persona può
// vedere. Della chiave si salva solo l'impronta (SHA-256) in `guestLinks`,
// collection che le regole Firestore escludono per tutti i client (come
// teamSecrets): né un membro della squadra né un admin può leggerla o crearla
// dall'app, quindi non si può ricavare né falsificare un link.
//
// Scadenza (calcolata alla lettura): 7 giorni dopo l'ultimo giorno in cui la
// persona è assegnata; senza nessuna assegnazione il link vale 30 giorni dalla
// creazione; in ogni caso mai oltre 90 giorni dalla creazione.
import crypto from 'node:crypto'
import { getAdmin, requireTeamAdmin } from './_authAdmin.js'
import { todayStr } from './_date.js'

const AFTER_LAST_DAY = 7
const NO_BLOCKS_DAYS = 30
const HARD_CAP_DAYS = 90

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex')
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + n)
  return todayStr(d)
}
const dayOf = ts => (ts?.toDate ? todayStr(ts.toDate()) : null)

async function createLink(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  const { db, teamId } = ctx
  const externalWorkerId = String(req.body?.externalWorkerId || '')
  if (!externalWorkerId) return res.status(400).json({ error: 'Persona mancante' })

  const workerRef = db.collection('externalWorkers').doc(externalWorkerId)
  const workerSnap = await workerRef.get()
  if (!workerSnap.exists || workerSnap.data().teamId !== teamId) return res.status(404).json({ error: 'Persona non trovata' })

  const admin = getAdmin()
  const stamp = admin.firestore.FieldValue.serverTimestamp()
  const batch = db.batch()
  // Un solo link attivo per persona: crearne uno nuovo annulla il precedente.
  const old = await db.collection('guestLinks').where('teamId', '==', teamId).where('externalWorkerId', '==', externalWorkerId).get()
  old.docs.forEach(d => batch.update(d.ref, { revoked: true }))
  const token = crypto.randomBytes(24).toString('base64url')
  batch.set(db.collection('guestLinks').doc(hashToken(token)), {
    teamId, externalWorkerId, name: workerSnap.data().name || '', revoked: false, createdAt: stamp,
  })
  batch.update(workerRef, { guestLinkActive: true, guestLinkCreatedAt: stamp })
  await batch.commit()
  return res.status(200).json({ token })
}

async function revokeLink(req, res) {
  let ctx
  try { ctx = await requireTeamAdmin(req) } catch (e) { return res.status(e.status || 500).json({ error: e.message }) }
  const { db, teamId } = ctx
  const externalWorkerId = String(req.body?.externalWorkerId || '')
  if (!externalWorkerId) return res.status(400).json({ error: 'Persona mancante' })

  const workerRef = db.collection('externalWorkers').doc(externalWorkerId)
  const workerSnap = await workerRef.get()
  if (!workerSnap.exists || workerSnap.data().teamId !== teamId) return res.status(404).json({ error: 'Persona non trovata' })

  const batch = db.batch()
  const links = await db.collection('guestLinks').where('teamId', '==', teamId).where('externalWorkerId', '==', externalWorkerId).get()
  links.docs.forEach(d => batch.update(d.ref, { revoked: true }))
  batch.update(workerRef, { guestLinkActive: false })
  await batch.commit()
  return res.status(200).json({ ok: true })
}

// Solo i campi che servono all'ospite: niente contatti, costi, note interne
// dell'admin o altri membri della squadra.
function publicEvent(ev, blocks) {
  const lists = [{ id: 'main', name: ev.mainListName || '' }, ...((ev.lists || []).map(l => ({ id: l.id, name: l.name || '' })))]
  return {
    id: ev.id,
    name: ev.name || '',
    date: ev.date || null,
    dateEnd: ev.dateEnd || null,
    allDay: ev.allDay !== false,
    timeStart: ev.timeStart || null,
    timeEnd: ev.timeEnd || null,
    location: ev.location || '',
    notes: ev.notes || '',
    type: ev.type || 'event',
    phases: ev.phases || {},
    phaseTimes: ev.phaseTimes || {},
    lists,
    items: (ev.items || []).filter(i => !i.mancante).map(i => ({
      id: i.id, name: i.name || '', qty: i.qty || 1, category: i.category || '',
      location: i.location || '', listId: i.listId || 'main', eventNote: i.eventNote || '',
      pronto: !!i.pronto, loaded: !!i.loaded, returned: !!i.returned,
    })),
    blocks: blocks.map(b => ({
      id: b.id, date: b.date, startTime: b.startTime || null, endTime: b.endTime || null, phase: b.phase || null,
    })),
  }
}

async function viewLink(req, res) {
  const token = String(req.body?.token || '')
  if (token.length < 20 || token.length > 100) return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
  const db = getAdmin().firestore()
  const linkSnap = await db.collection('guestLinks').doc(hashToken(token)).get()
  if (!linkSnap.exists || linkSnap.data().revoked) return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
  const link = linkSnap.data()
  const today = todayStr()

  const createdDay = dayOf(link.createdAt) || today
  if (today > addDays(createdDay, HARD_CAP_DAYS)) return res.status(410).json({ error: 'Link scaduto', code: 'expired' })

  // La persona deve esistere ancora (se l'admin l'ha eliminata il link smette di funzionare)
  // e il nome mostrato è quello attuale (può essere stato rinominato).
  const workerSnap = await db.collection('externalWorkers').doc(link.externalWorkerId).get()
  if (!workerSnap.exists || workerSnap.data().teamId !== link.teamId) return res.status(404).json({ error: 'Link non valido', code: 'invalid' })
  const [teamSnap, blocksSnap] = await Promise.all([
    db.collection('teams').doc(link.teamId).get(),
    db.collection('assignmentBlocks').where('teamId', '==', link.teamId).where('externalWorkerId', '==', link.externalWorkerId).get(),
  ])
  const allBlocks = blocksSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const lastDate = allBlocks.reduce((m, b) => (b.date && b.date > m ? b.date : m), '')
  const expired = lastDate ? today > addDays(lastDate, AFTER_LAST_DAY) : today > addDays(createdDay, NO_BLOCKS_DAYS)
  if (expired) return res.status(410).json({ error: 'Link scaduto', code: 'expired' })

  // Solo da ieri in poi: lo storico passato non serve a chi lavora a chiamata.
  const from = addDays(today, -1)
  const upcoming = allBlocks.filter(b => b.date && b.date >= from)
  const eventIds = [...new Set(upcoming.map(b => b.eventId).filter(Boolean))]
  const eventSnaps = eventIds.length ? await db.getAll(...eventIds.map(id => db.collection('events').doc(id))) : []
  const events = eventSnaps
    .filter(s => s.exists && s.data().teamId === link.teamId)
    .map(s => ({ id: s.id, ...s.data() }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(ev => publicEvent(ev, upcoming.filter(b => b.eventId === ev.id).sort((a, b) => a.date.localeCompare(b.date))))
  // Attività libere (senza evento): solo etichetta, data e orario.
  const tasks = upcoming.filter(b => !b.eventId).map(b => ({
    id: b.id, label: b.label || '', date: b.date, startTime: b.startTime || null, endTime: b.endTime || null,
  })).sort((a, b) => a.date.localeCompare(b.date))

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ guest: { name: workerSnap.data().name || link.name || '' }, team: { name: teamSnap.data()?.name || '' }, today, events, tasks })
}

// true se l'azione era "guest-*" e la risposta è già stata data.
export async function handleGuestAction(req, res) {
  const action = req.body?.action
  if (action === 'guest-view') { await viewLink(req, res); return true }
  if (action === 'guest-create') { await createLink(req, res); return true }
  if (action === 'guest-revoke') { await revokeLink(req, res); return true }
  return false
}
