// Client sottile per la sync Google Calendar server-side — vedi
// api/google-oauth.js (start/disconnect), api/google-oauth-callback.js,
// api/push-event-to-google.js, api/sync-google-pull.js (cron). Nessuna
// chiamata diretta a googleapis.com da qui, nessun token Google nel browser:
// solo chiamate autenticate (Firebase ID token) alle nostre funzioni
// serverless, che parlano con Google usando un refresh token per-squadra
// salvato lato server. Sostituisce la vecchia integrazione client-only
// (Google Identity Services, token effimero, moriva ogni ora).
import { auth } from '../firebase'

async function authedPost(path, body) {
  const user = auth.currentUser
  if (!user) return null
  try {
    const idToken = await user.getIdToken()
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body || {}),
    })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

// Avvia il collegamento: l'intera pagina viene reindirizzata a Google (non
// più un popup) — il flusso a codice di autorizzazione, indispensabile per
// ottenere un refresh token, richiede un vero redirect col nostro backend
// come destinatario finale del "code", non è compatibile con un popup.
export async function startGoogleCalendarConnect() {
  const data = await authedPost('/api/google-oauth', { action: 'start' })
  if (!data?.url) throw new Error('google-oauth-start-failed')
  window.location.href = data.url
}

// Innescato subito dopo aver creato/modificato un evento su Firestore —
// fire-and-forget: la vera chiamata a Google avviene server-side, con un
// refresh token duraturo, non con lo stato del browser in quel momento.
// Se il calendario non è collegato per questa squadra, l'endpoint la salta
// in silenzio (stesso comportamento "best effort" di sempre).
export function pushEventToGoogle(eventId) {
  authedPost('/api/push-event-to-google', { eventId, action: 'upsert' }).catch(() => {})
}

export function deleteEventFromGoogle(googleEventId) {
  if (!googleEventId) return
  authedPost('/api/push-event-to-google', { action: 'delete', googleEventId }).catch(() => {})
}

// Scollega: revoca il refresh token presso Google e ripulisce lo stato
// server-side (teamSecrets + i campi sul team) — vedi api/google-oauth.js.
export async function disconnectGoogleCalendar() {
  const data = await authedPost('/api/google-oauth', { action: 'disconnect' })
  if (!data?.ok) throw new Error('google-oauth-disconnect-failed')
}

// Pull immediato su richiesta (bottone "Sincronizza ora") — il cron
// automatico gira al massimo una volta al giorno su Vercel Hobby, questo
// colma l'attesa quando serve vedere subito una modifica fatta su Google.
export async function syncGoogleCalendarNow() {
  const data = await authedPost('/api/google-sync-now')
  if (!data || data.error) throw new Error('google-sync-now-failed')
  return data // { created, updated, deleted } oppure { skipped: '...' }
}
