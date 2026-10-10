import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging'
import app, { auth } from '../firebase'
import i18n from '../i18n'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const TOKEN_STORAGE_KEY = 'rc_push_token'

// Stesso pattern "fire and forget con ID token" di src/utils/googleCalendar.js
// (authedPost) — duplicato qui apposta invece di condiviso: sono due feature
// indipendenti (calendario vs notifiche), non vale la pena accoppiarle a un
// unico helper comune solo perché la forma della chiamata è identica.
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

// false anche se il browser supporta FCM ma manca la chiave VAPID (non ancora
// configurata in Firebase Console) — il toggle resta disattivo finché non lo è.
export async function isPushAvailable() {
  if (!VAPID_KEY) return false
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false
  try {
    return await isSupported()
  } catch {
    return false
  }
}

export function isPushEnabled() {
  return Notification?.permission === 'granted' && !!localStorage.getItem(TOKEN_STORAGE_KEY)
}

// Scope dedicato (diverso da "/", che è già del service worker generato da
// vite-plugin-pwa per la cache offline): registrare firebase-messaging-sw.js
// senza questo scope lo fa competere con quello per lo STESSO scope "/" — il
// browser tiene una sola registrazione attiva per scope, quindi uno dei due
// finisce sostituito e le push smettono di arrivare in silenzio, senza
// nessun errore visibile. Le push non dipendono dallo scope per funzionare
// (non è come il routing delle fetch), quindi isolarlo così è sicuro.
const PUSH_SCOPE = '/firebase-cloud-messaging-push-scope'

export async function enablePushNotifications() {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: PUSH_SCOPE })
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) return false
  await authedPost('/api/push', { token, action: 'register' })
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  return true
}

export async function disablePushNotifications() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  if (!token) return
  await authedPost('/api/push', { token, action: 'unregister' }).catch(() => {})
  try {
    await deleteToken(getMessaging(app))
  } catch {
    // Il token può essere già scaduto/non registrato lato Firebase: non è un
    // problema, l'importante è che sia stato rimosso lato server sopra.
  }
}

// Fire-and-forget come pushEventToGoogle: chi chiama non deve aspettare né
// gestire l'esito. `audience` restringe i destinatari lato server (vedi
// resolveAudienceUserIds in api/push.js): { type:'admins' }, { type:'user',
// userId }, { type:'event', eventId } (admin + assegnati), o omesso/{type:
// 'team'} per l'intera squadra (comportamento storico).
export function notifyTeamPush({ title, body, url, audience }) {
  authedPost('/api/push', { action: 'send', title, body, url, audience }).catch(() => {})
}

// Usato da Events.jsx e Calendar.jsx (due modali di modifica evento
// indipendenti) dopo un salvataggio: avvisa admin + assegnati solo se
// l'orario è DAVVERO cambiato rispetto a prima, non ad ogni salvataggio
// (la maggior parte dei salvataggi tocca altri campi, es. note/location).
export function notifyEventTimeChangedIfNeeded(eventId, oldEvent, newFields) {
  const changed = (newFields.timeStart || null) !== (oldEvent.timeStart || null) || (newFields.timeEnd || null) !== (oldEvent.timeEnd || null)
  if (!changed) return
  notifyTeamPush({
    title: i18n.t('staffTimeline.pushTimeChangedTitle'),
    body: i18n.t('staffTimeline.pushTimeChangedBody', {
      name: newFields.name || oldEvent.name || '',
      start: newFields.timeStart || '--:--',
      end: newFields.timeEnd || '--:--',
    }),
    url: `/events/${eventId}`,
    audience: { type: 'event', eventId },
  })
}
