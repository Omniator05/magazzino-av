// Push Roadcase → Google, lato server: sostituisce syncEventToGoogle/
// deleteGoogleEvent client-side in src/utils/googleCalendar.js, che usavano
// l'access token effimero del browser (moriva in silenzio a token scaduto).
// Innescato dal client subito dopo la scrittura Firestore (CreateEventFlow.jsx,
// Events.jsx), ma la vera chiamata a Google avviene qui, con un refresh
// token duraturo — non serve un utente con un token Google ancora valido in
// quel momento, basta che sia online abbastanza per questa singola chiamata.
//
// Qualunque membro approvato della squadra può innescarlo (non solo admin):
// creare/modificare/eliminare eventi non è un'azione riservata agli admin
// altrove nell'app, non lo diventa qui.
import { requireTeamMember, getAdmin } from './_authAdmin.js'
import { decrypt } from './_crypto.js'
import { refreshAccessToken } from './_googleAuth.js'
import { toGoogleEvent } from './_googleCalendarSync.js'

const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso' })

  let db, teamId, team
  try {
    ;({ db, teamId, team } = await requireTeamMember(req))
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message })
  }

  // Calendario non collegato per questa squadra: nessun errore, la sync è
  // semplicemente saltata — stesso comportamento "best effort" di prima.
  if (!team.googleCalendarId) return res.status(200).json({ skipped: 'not_connected' })

  const { eventId, action, googleEventId } = req.body || {}
  if (!eventId && !googleEventId) return res.status(400).json({ error: 'eventId o googleEventId richiesto' })

  let refreshToken
  try {
    const secretSnap = await db.collection('teamSecrets').doc(teamId).get()
    const enc = secretSnap.data()?.googleRefreshTokenEnc
    if (!enc) return res.status(200).json({ skipped: 'not_connected' })
    refreshToken = decrypt(enc)
  } catch (e) {
    console.error('push-event-to-google: refresh token', e)
    return res.status(200).json({ skipped: 'token_error' })
  }

  let accessToken
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (e) {
    // invalid_grant = il refresh token è stato revocato (disconnesso da
    // Google stesso, non dall'app) — non è un errore transitorio, riprovare
    // non servirebbe a nulla finché l'admin non ricollega da Impostazioni.
    console.error('push-event-to-google: refresh access token', e)
    return res.status(200).json({ skipped: 'reconnect_required' })
  }
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const calId = encodeURIComponent(team.googleCalendarId)

  try {
    if (action === 'delete') {
      if (googleEventId) {
        await fetch(`${API_BASE}/${calId}/events/${googleEventId}`, { method: 'DELETE', headers })
      }
      return res.status(200).json({ ok: true })
    }

    // upsert: l'evento si carica fresco da Firestore (mai dal payload del
    // client) — è la fonte di verità, ed evita di fidarsi di dati che nel
    // frattempo potrebbero già essere cambiati di nuovo.
    const eventRef = db.collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) return res.status(200).json({ skipped: 'event_not_found' })
    const event = eventSnap.data()
    if (event.teamId !== teamId) return res.status(403).json({ error: 'Evento di un\'altra squadra' })

    const body = JSON.stringify(toGoogleEvent(event))

    if (event.googleEventId) {
      const patchRes = await fetch(`${API_BASE}/${calId}/events/${event.googleEventId}`, { method: 'PATCH', headers, body })
      if (patchRes.ok) return res.status(200).json({ ok: true, googleEventId: event.googleEventId })
      if (patchRes.status !== 404 && patchRes.status !== 410) {
        return res.status(200).json({ skipped: 'patch_failed', status: patchRes.status })
      }
      // 404/410: l'evento era stato cancellato manualmente su Google → lo ricreiamo sotto
    }

    const createRes = await fetch(`${API_BASE}/${calId}/events`, { method: 'POST', headers, body })
    if (!createRes.ok) return res.status(200).json({ skipped: 'create_failed', status: createRes.status })
    const created = await createRes.json()
    await eventRef.update({ googleEventId: created.id })
    return res.status(200).json({ ok: true, googleEventId: created.id })
  } catch (e) {
    console.error('push-event-to-google', e)
    return res.status(200).json({ skipped: 'network_error' })
  }
}
