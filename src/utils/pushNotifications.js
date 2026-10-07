import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging'
import app, { auth } from '../firebase'

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

export async function enablePushNotifications() {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) return false
  await authedPost('/api/register-push-token', { token, action: 'register' })
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  return true
}

export async function disablePushNotifications() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  if (!token) return
  await authedPost('/api/register-push-token', { token, action: 'unregister' }).catch(() => {})
  try {
    await deleteToken(getMessaging(app))
  } catch {
    // Il token può essere già scaduto/non registrato lato Firebase: non è un
    // problema, l'importante è che sia stato rimosso lato server sopra.
  }
}

// Fire-and-forget come pushEventToGoogle: chi chiama (es. notifyListChanged
// in EventDetail.jsx) non deve aspettare né gestire l'esito.
export function notifyTeamPush({ title, body, url }) {
  authedPost('/api/send-push', { title, body, url }).catch(() => {})
}
