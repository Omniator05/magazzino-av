// Registrazione token, invio mirato e reminder giornaliero in UN SOLO
// endpoint (`action: 'register'|'unregister'|'send'`, più il ramo cron) —
// stesso motivo di google-oauth.js: il piano Hobby di Vercel permette al
// massimo 12 Serverless Functions per deployment, ed è già al limite. Il
// cron è distinto dalle altre azioni non da un `action` nel body (Vercel
// invoca i cron con una GET senza corpo) ma dall'header Authorization: se
// combacia con CRON_SECRET è per forza Vercel, mai un client autenticato con
// un token Firebase — vedi sync-google-pull.js per lo stesso schema.
import { requireTeamMember, getAdmin } from './_authAdmin.js'
import { todayStr } from './_date.js'
import { handleGuestAction } from './_guest.js'
import { handleBadgeAction } from './_badge.js'
import { handleUserAction } from './_users.js'
import { handleStationAction } from './_station.js'

const DEAD_TOKEN_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']

// Risolve una "audience" in un elenco di userId a cui mandare la push.
// null = tutta la squadra (comportamento storico, usato per il banner di
// lista cambiata quando non si vuole restringere). Le altre audience usano
// sempre "admin + chi è davvero coinvolto", mai un broadcast indiscriminato.
async function resolveAudienceUserIds(db, teamId, audience) {
  if (!audience || audience.type === 'team') return null
  if (audience.type === 'user') return [audience.userId].filter(Boolean)
  const adminsSnap = await db.collection('profiles').where('teamId', '==', teamId).where('role', '==', 'admin').get()
  const adminIds = adminsSnap.docs.map(d => d.id)
  if (audience.type === 'admins') return adminIds
  if (audience.type === 'event') {
    const eventSnap = await db.collection('events').doc(audience.eventId).get()
    const assigned = eventSnap.exists ? (eventSnap.data().assignedWorkers || []) : []
    return [...new Set([...adminIds, ...assigned])]
  }
  return adminIds
}

async function tokensForTeam(db, teamId, userIds) {
  if (userIds === null) {
    const snap = await db.collection('pushTokens').where('teamId', '==', teamId).get()
    return snap.docs
  }
  if (userIds.length === 0) return []
  // L'operatore "in" di Firestore accetta al massimo 30 valori — una squadra
  // reale non li supera mai, ma si divide comunque in blocchi per sicurezza.
  const chunks = []
  for (let i = 0; i < userIds.length; i += 30) chunks.push(userIds.slice(i, i + 30))
  const results = await Promise.all(chunks.map(chunk =>
    db.collection('pushTokens').where('teamId', '==', teamId).where('userId', 'in', chunk).get()
  ))
  return results.flatMap(snap => snap.docs)
}

// Chi apre l'app anche da `localhost` (sviluppo) si ritrova un secondo token
// per lo stesso dispositivo e riceve ogni notifica due volte. Se una persona ha
// almeno un token dell'app pubblicata, quelli di localhost vengono saltati.
// (I token vecchi senza `origin` contano come pubblicati.)
const isLocalOrigin = o => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o || '')
function skipLocalDuplicates(tokenDocs) {
  const hasDeployed = new Set(tokenDocs.filter(d => !isLocalOrigin(d.data().origin)).map(d => d.data().userId))
  return tokenDocs.filter(d => !isLocalOrigin(d.data().origin) || !hasDeployed.has(d.data().userId))
}

async function sendToTokenDocs(admin, db, allTokenDocs, { title, body, url }) {
  const tokenDocs = skipLocalDuplicates(allTokenDocs)
  if (tokenDocs.length === 0) return 0
  const tokens = tokenDocs.map(d => d.id)
  // Messaggio SOLO "data" (niente campo `notification`): con `notification` l'SDK
  // di Firebase mostra da sé una notifica automatica E poi richiama il nostro
  // onBackgroundMessage, che ne mostrava una seconda — due notifiche per ogni
  // evento (anche con lo stesso `tag`, l'automatica non lo porta). Senza
  // `notification` la mostra una volta sola il nostro service worker (app
  // chiusa) o l'handler in primo piano (app aperta). Il `tag` uguale fa sì che
  // due registrazioni dello stesso dispositivo non si accumulino.
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: String(title), body: String(body), url: url || '/', tag: `${title}|${body}` },
    webpush: { headers: { Urgency: 'high' } },
  })
  const deletions = []
  resp.responses.forEach((r, i) => {
    if (!r.success && DEAD_TOKEN_CODES.includes(r.error?.code)) {
      deletions.push(db.collection('pushTokens').doc(tokens[i]).delete())
    }
  })
  await Promise.all(deletions)
  return resp.successCount
}

// Salva/rimuove il token FCM del dispositivo chiamante — un documento per
// token (dedup naturale: un dispositivo che si ri-registra sovrascrive sé
// stesso invece di accumulare doppioni).
async function registerToken(req, res, db, teamId, uid) {
  const { token, action } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token mancante' })

  const admin = getAdmin()
  const tokenRef = db.collection('pushTokens').doc(token)
  if (action === 'unregister') {
    await tokenRef.delete()
  } else {
    await tokenRef.set({
      teamId, userId: uid,
      origin: req.headers?.origin || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  res.status(200).json({ ok: true })
}

// Invia ai destinatari dell'audience richiesta, sempre escludendo chi ha
// appena generato l'evento che la innesca (altrimenti riceve un push su se
// stesso ogni volta).
async function sendPush(req, res, db, teamId, uid) {
  const { title, body, url, audience } = req.body || {}
  if (!title || !body) return res.status(400).json({ error: 'title e body richiesti' })

  const admin = getAdmin()
  const userIds = await resolveAudienceUserIds(db, teamId, audience)
  const tokenDocs = (await tokensForTeam(db, teamId, userIds)).filter(d => d.data().userId !== uid)
  const sent = await sendToTokenDocs(admin, db, tokenDocs, { title, body, url })
  res.status(200).json({ sent })
}

// Reminder giornaliero (cron, vedi vercel.json) per OGNI squadra: eventi di
// oggi con oggetti ancora da caricare (ad admin + assegnati) e consumabili
// sotto scorta minima (solo admin, un digest unico per squadra invece di un
// avviso per ogni singolo oggetto — altrimenti diventa rumore).
async function runDailyReminders(res) {
  const admin = getAdmin()
  const db = admin.firestore()
  const today = todayStr()
  const teamsSnap = await db.collection('teams').get()
  const results = []

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id
    try {
      const eventsSnap = await db.collection('events').where('teamId', '==', teamId).where('date', '==', today).get()
      let eventsSent = 0
      for (const evDoc of eventsSnap.docs) {
        const ev = evDoc.data()
        const items = ev.items || []
        const missing = items.filter(i => !i.loaded && !i.mancante).length
        if (missing === 0) continue
        const userIds = await resolveAudienceUserIds(db, teamId, { type: 'event', eventId: evDoc.id })
        const tokenDocs = await tokensForTeam(db, teamId, userIds)
        eventsSent += await sendToTokenDocs(admin, db, tokenDocs, {
          title: 'Da caricare',
          body: `${ev.name || ''} · ${missing}`,
          url: `/events/${evDoc.id}`,
        })
      }

      // Filtro "minStock > 0" fatto in memoria invece che nella query: un
      // confronto tra due campi dello stesso documento (availableQty vs
      // minStock) Firestore non lo sa fare lato server in nessun caso, e
      // aggiungere ">0" alla query avrebbe richiesto un indice composito da
      // creare a mano la prima volta — con un inventario di dimensioni
      // normali filtrare qui costa poco ed evita quel passaggio.
      //
      // "reorderNotified" evita di rimandare lo stesso avviso ogni giorno
      // finché i pezzi non arrivano: lo stato resta "da riordinare" per
      // giorni/settimane, ma l'admin l'ha già visto la prima volta — un
      // oggetto entra nel digest solo quando scende sotto scorta per la
      // PRIMA volta (flag non ancora impostato), e il flag si azzera da solo
      // appena l'oggetto torna sopra scorta minima, pronto a riavvisare se
      // in futuro scende di nuovo.
      const itemsSnap = await db.collection('items')
        .where('teamId', '==', teamId)
        .where('category', '==', 'Consumabili')
        .get()
      const newlyLow = []
      const backInStock = []
      itemsSnap.docs.forEach(d => {
        const it = d.data()
        const isLow = it.minStock > 0 && (it.availableQty ?? it.totalQty ?? 0) <= it.minStock
        if (isLow && !it.reorderNotified) newlyLow.push(d)
        else if (!isLow && it.reorderNotified) backInStock.push(d)
      })
      let reorderSent = 0
      if (newlyLow.length > 0) {
        const adminIds = await resolveAudienceUserIds(db, teamId, { type: 'admins' })
        const tokenDocs = await tokensForTeam(db, teamId, adminIds)
        reorderSent = await sendToTokenDocs(admin, db, tokenDocs, {
          title: 'Scorta minima',
          body: `${newlyLow.length} consumabil${newlyLow.length === 1 ? 'e' : 'i'}`,
          url: '/inventory?filter=reorder',
        })
        // Segna "avvisato" solo se qualcuno l'ha davvero ricevuto — altrimenti
        // (nessun admin con push attivo quel giorno) resta da riprovare.
        if (reorderSent > 0) await Promise.all(newlyLow.map(d => d.ref.update({ reorderNotified: true })))
      }
      if (backInStock.length > 0) {
        await Promise.all(backInStock.map(d => d.ref.update({ reorderNotified: false })))
      }

      results.push({ teamId, eventsSent, reorderSent })
    } catch (e) {
      console.error(`push daily-reminders: team ${teamId}`, e)
      results.push({ teamId, error: String(e) })
    }
  }

  res.status(200).json({ teams: results.length, results })
}

export default async function handler(req, res) {
  if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
    return runDailyReminders(res)
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  // Link ospite (personale esterno): azioni "guest-*", vedi _guest.js. Vanno
  // PRIMA del controllo del token Firebase perché "guest-view" è pubblico (si
  // autentica con la chiave del link); create/revoke verificano da sé l'admin.
  if (String(req.body?.action || '').startsWith('guest-') && await handleGuestAction(req, res)) return

  // Collegamento della postazione con un link (vedi _station.js): "station-connect" è pubblico (la chiave del
  // link è la credenziale), le altre azioni station-* verificano da sole l'admin.
  if (String(req.body?.action || '').startsWith('station-') && await handleStationAction(req, res)) return

  let db, teamId, uid, profile
  try {
    ;({ db, teamId, uid, profile } = await requireTeamMember(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  const { action } = req.body || {}
  // Badge personale per la Postazione magazzino (vedi _badge.js): servono utente verificato e squadra
  if (String(action || '').startsWith('badge-') && await handleBadgeAction(req, res, { db, teamId, uid, profile })) return
  // Email di accesso degli utenti (vedi _users.js): solo admin
  if (String(action || '').startsWith('user-') && await handleUserAction(req, res, { db, teamId, uid, profile })) return
  if (action === 'register' || action === 'unregister') return registerToken(req, res, db, teamId, uid)
  if (action === 'send') return sendPush(req, res, db, teamId, uid)
  return res.status(400).json({ error: 'Azione non valida' })
}
