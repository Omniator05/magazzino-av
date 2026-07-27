// Integrazione Google Calendar — sincronizzazione "best effort" lato client,
// senza backend: quando chi ha collegato l'account ha l'app aperta con un
// token valido in questa sessione browser, crea/modifica/elimina gli eventi
// corrispondenti su Google Calendar. Se il token manca o è scaduto la sync
// viene semplicemente saltata (nessun errore mostrato) — l'utente riconnette
// da Impostazioni quando serve.
import { GOOGLE_CLIENT_ID, GOOGLE_CALENDAR_SCOPE } from '../config/googleCalendar'

let tokenClient = null
let cachedToken = null // { accessToken, expiresAt }

function ensureTokenClient(onToken) {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('google-identity-not-loaded')
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: () => {}, // sovrascritto ad ogni richiesta, vedi sotto
    })
  }
  tokenClient.callback = onToken
  return tokenClient
}

// Apre il flusso OAuth di Google (richiede un click utente per il gesture
// requirement del browser). Risolve con l'access token, oppure rigetta se
// l'utente annulla o c'è un errore.
export function connectGoogleCalendar() {
  return new Promise((resolve, reject) => {
    try {
      const client = ensureTokenClient(resp => {
        if (resp.error) { reject(resp); return }
        // -60s di margine di sicurezza sulla scadenza dichiarata da Google
        cachedToken = { accessToken: resp.access_token, expiresAt: Date.now() + (resp.expires_in - 60) * 1000 }
        resolve(resp.access_token)
      })
      client.requestAccessToken()
    } catch (e) { reject(e) }
  })
}

export function disconnectGoogleCalendar() {
  cachedToken = null
}

// Token valido per QUESTA sessione browser, senza mostrare popup. Torna null
// se non è mai stato ottenuto o è scaduto — la sync viene saltata in quel caso.
function getCachedAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken
  return null
}

const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars'

function toGoogleEvent(event) {
  const endDate = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  // Eventi "all day": su Google Calendar la data di fine è ESCLUSIVA (+1 giorno)
  const endExclusive = new Date(endDate + 'T00:00:00')
  endExclusive.setDate(endExclusive.getDate() + 1)
  return {
    summary: event.name,
    location: event.location || undefined,
    description: event.notes || undefined,
    start: { date: event.date },
    end: { date: endExclusive.toISOString().split('T')[0] },
  }
}

// Crea o aggiorna l'evento su Google Calendar. Ritorna il googleEventId da
// salvare sul documento Firestore, oppure null se la sync non è avvenuta
// (nessun calendario collegato o nessun token valido in questa sessione).
export async function syncEventToGoogle(event, calendarId) {
  if (!calendarId) return null
  const accessToken = getCachedAccessToken()
  if (!accessToken) return null

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const body = JSON.stringify(toGoogleEvent(event))

  try {
    if (event.googleEventId) {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(calendarId)}/events/${event.googleEventId}`, {
        method: 'PATCH', headers, body,
      })
      if (res.ok) return event.googleEventId
      if (res.status !== 404 && res.status !== 410) return event.googleEventId
      // 404/410: l'evento era stato cancellato manualmente su Google → lo ricreiamo sotto
    }
    const res = await fetch(`${API_BASE}/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST', headers, body,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id || null
  } catch {
    return null
  }
}

export async function deleteGoogleEvent(googleEventId, calendarId) {
  if (!calendarId || !googleEventId) return
  const accessToken = getCachedAccessToken()
  if (!accessToken) return
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(calendarId)}/events/${googleEventId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {}
}

// Elenca gli eventi dal calendario collegato in una finestra di tempo, con le
// occorrenze ricorrenti già "espanse" in eventi singoli (singleEvents=true —
// combacia con il nostro modello: un documento per occorrenza). Ritorna null
// se la sync non è disponibile in questa sessione (calendario non collegato o
// token scaduto) — diverso da [] che vuol dire "collegato ma nessun evento".
export async function listUpcomingGoogleEvents(calendarId, { pastDays = 7, futureDays = 365 } = {}) {
  if (!calendarId) return null
  const accessToken = getCachedAccessToken()
  if (!accessToken) return null

  const timeMin = new Date(Date.now() - pastDays * 86400000).toISOString()
  const timeMax = new Date(Date.now() + futureDays * 86400000).toISOString()
  const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '250' })

  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.items || []).filter(ev => ev.status !== 'cancelled')
  } catch {
    return null
  }
}

// Converte un evento Google Calendar nei campi usati dai nostri documenti
// evento. Torna null se l'evento non ha una data valida (non dovrebbe capitare).
export function fromGoogleEvent(gEvent) {
  let date, dateEnd = null
  if (gEvent.start?.date) {
    // Evento "all day": la data di fine su Google è ESCLUSIVA (-1 giorno per noi)
    date = gEvent.start.date
    const endInclusive = new Date(gEvent.end.date + 'T00:00:00')
    endInclusive.setDate(endInclusive.getDate() - 1)
    const end = endInclusive.toISOString().split('T')[0]
    if (end !== date) dateEnd = end
  } else if (gEvent.start?.dateTime) {
    date = gEvent.start.dateTime.slice(0, 10)
    const end = (gEvent.end?.dateTime || gEvent.start.dateTime).slice(0, 10)
    if (end !== date) dateEnd = end
  } else {
    return null
  }
  return {
    name: gEvent.summary?.trim() || '(senza titolo)',
    date, dateEnd,
    location: gEvent.location || '',
    notes: gEvent.description || '',
  }
}
