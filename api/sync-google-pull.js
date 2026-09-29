// Pull Google → Roadcase, per ogni squadra collegata — sostituisce il vecchio
// sync-google-calendar.js (un solo URL iCal globale, scollegato dal
// calendario di ogni cliente, rimosso). Cron una volta al giorno (vedi
// vercel.json — è il massimo permesso dal piano Vercel Hobby); il bottone
// "Sincronizza ora" (google-sync-now.js) colma l'attesa nel frattempo.
//
// Usa il syncToken incrementale di Google (events.list con syncToken): dopo
// la prima sincronizzazione completa, ogni giro successivo riceve SOLO ciò
// che è cambiato — comprese le cancellazioni (status:'cancelled'), il buco
// che la sync client-side precedente non copriva mai.
//
// Conflitti: se lo stesso evento è stato modificato su entrambi i lati fra
// un giro e l'altro, vince l'ultima modifica per orario (updated di Google
// vs updatedAt di Roadcase) — nessun merge più sofisticato in v1.
import { getAdmin } from './_authAdmin.js'
import { decrypt } from './_crypto.js'
import { refreshAccessToken } from './_googleAuth.js'
import { fromGoogleEvent } from './_googleCalendarSync.js'

const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars'

// Stesso ripristino giacenza di closeInstallationEvent/deleteEventWithInventoryCheck
// (src/utils/kitInventory.js) — duplicato qui perché le funzioni /api sono
// autonome, non importano da src/. Un evento cancellato su Google (quindi
// già chiuso dal punto di vista dell'admin) non deve lasciare la giacenza
// scalata per sempre su articoli mai più rientrati da nessuna riga.
async function restoreInventoryForDeletedEvent(db, event) {
  for (const item of event.items || []) {
    if (!item.loaded || item.returned || item.isExtra) continue
    try {
      const itemRef = db.collection('items').doc(item.itemRef || item.id)
      const snap = await itemRef.get()
      if (!snap.exists) continue
      const current = snap.data()
      const maxAvail = (current.totalQty || 0) - (current.brokenQty || 0)
      await itemRef.update({ availableQty: Math.min(maxAvail, (current.availableQty || 0) + (item.qty || 1)) })
    } catch (e) { console.error('restoreInventoryForDeletedEvent', e) }
  }
}

async function fetchGoogleEventsPage(calendarId, accessToken, { syncToken, pageToken }) {
  const params = new URLSearchParams({ maxResults: '250', showDeleted: 'true' })
  if (syncToken) params.set('syncToken', syncToken)
  else params.set('singleEvents', 'true') // prima sync completa: espandi già le occorrenze ricorrenti
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`${EVENTS_API}/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return res
}

// Esportata: google-sync-now.js la riusa per il bottone "Sincronizza ora"
// manuale — stessa identica logica, un solo posto da tenere corretto,
// invocata su una sola squadra invece che in giro su tutte quelle collegate.
export async function syncTeam(db, admin, teamId, team) {
  const secretSnap = await db.collection('teamSecrets').doc(teamId).get()
  const enc = secretSnap.data()?.googleRefreshTokenEnc
  if (!enc) return { teamId, skipped: 'not_connected' }

  const refreshToken = decrypt(enc)
  let accessToken
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (e) {
    console.error(`sync-google-pull: refresh access token for team ${teamId}`, e)
    return { teamId, skipped: 'reconnect_required' }
  }

  let syncToken = team.googleSyncToken || null
  let pageToken = null
  let nextSyncToken = null
  const googleEvents = []

  do {
    let res = await fetchGoogleEventsPage(team.googleCalendarId, accessToken, { syncToken, pageToken })
    if (res.status === 410) {
      // syncToken scaduto/non valido: riparte da una sincronizzazione
      // completa (Google lo richiede esplicitamente in questo caso).
      syncToken = null
      pageToken = null
      googleEvents.length = 0
      res = await fetchGoogleEventsPage(team.googleCalendarId, accessToken, { syncToken, pageToken })
    }
    if (!res.ok) {
      console.error(`sync-google-pull: events.list failed for team ${teamId}`, res.status)
      return { teamId, skipped: 'list_failed', status: res.status }
    }
    const data = await res.json()
    googleEvents.push(...(data.items || []))
    pageToken = data.nextPageToken || null
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken
  } while (pageToken)

  // Eventi Roadcase già collegati a un id Google, per la riconciliazione —
  // stessa chiave di dedup già in uso lato client (googleEventId). Filtro
  // googleEventId lato JS invece che con un where('!=') in più: quella
  // combinazione (uguaglianza + disuguaglianza insieme) pretenderebbe un
  // indice composito da creare a mano su Firestore, che qui non vogliamo
  // introdurre solo per questo.
  const existingSnap = await db.collection('events').where('teamId', '==', teamId).get()
  const byGoogleId = new Map(
    existingSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.googleEventId)
      .map(e => [e.googleEventId, e])
  )

  let created = 0, updated = 0, deleted = 0
  for (const gEv of googleEvents) {
    const existing = byGoogleId.get(gEv.id)

    if (gEv.status === 'cancelled') {
      if (existing) {
        await restoreInventoryForDeletedEvent(db, existing)
        await db.collection('events').doc(existing.id).delete()
        deleted++
      }
      continue
    }

    const mapped = fromGoogleEvent(gEv)
    if (!mapped) continue

    if (!existing) {
      await db.collection('events').add({
        ...mapped,
        teamId, googleEventId: gEv.id,
        type: 'event', items: [], recurrence: 'never', seriesId: null, phases: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      created++
    } else {
      const changed = ['name', 'date', 'dateEnd', 'location', 'notes'].some(k => (existing[k] || null) !== (mapped[k] || null))
      // Ultima modifica per orario vince: se l'evento è stato toccato su
      // Roadcase (updatedAt) DOPO l'ultima modifica registrata da Google
      // (gEv.updated), un giro di pull nel mezzo non deve cancellare
      // silenziosamente una modifica locale più recente — resterà così
      // finché il prossimo push non la riporta su Google.
      const roadcaseUpdatedAtMs = existing.updatedAt?.toMillis?.() || 0
      const googleUpdatedAtMs = gEv.updated ? new Date(gEv.updated).getTime() : 0
      if (changed && roadcaseUpdatedAtMs <= googleUpdatedAtMs) {
        await db.collection('events').doc(existing.id).update({
          ...mapped,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        updated++
      }
    }
  }

  if (nextSyncToken) await db.collection('teams').doc(teamId).update({ googleSyncToken: nextSyncToken })

  return { teamId, created, updated, deleted }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const admin = getAdmin()
  const db = admin.firestore()

  const teamsSnap = await db.collection('teams')
    .where('googleCalendarFeatureEnabled', '==', true)
    .get()

  const results = []
  for (const teamDoc of teamsSnap.docs) {
    const team = teamDoc.data()
    if (!team.googleCalendarId) continue
    try {
      results.push(await syncTeam(db, admin, teamDoc.id, team))
    } catch (e) {
      console.error(`sync-google-pull: team ${teamDoc.id}`, e)
      results.push({ teamId: teamDoc.id, error: String(e) })
    }
  }

  res.status(200).json({ teams: results.length, results })
}
