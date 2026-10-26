import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging'
import app, { auth } from '../firebase'
import i18n from '../i18n'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const TOKEN_STORAGE_KEY = 'rc_push_token'
// Scritta SOLO quando l'utente spegne le notifiche a mano (vedi
// disablePushNotifications) — distingue "non ancora provato" da "le ha
// rifiutate di proposito", altrimenti maybeAutoEnablePush sotto le
// riaccenderebbe da sola ad ogni apertura dell'app anche per chi le ha
// spente apposta (il permesso del browser resta "granted" anche dopo lo
// spegnimento lato nostro: non è lui a dirci la scelta dell'utente).
const PUSH_OPT_OUT_KEY = 'rc_push_opted_out'

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

// Con l'app APERTA (in primo piano) l'SDK non mostra nessuna notifica da sé e
// il service worker non viene chiamato: il messaggio arriva solo a questo
// callback, e senza gestirlo sembra che "non sia arrivato niente" (proprio il
// caso di chi prova subito dal telefono con l'app aperta). Lo mostriamo noi
// come notifica di sistema, stessa forma di quella in background.
let foregroundAttached = false
async function attachForegroundPush() {
  if (foregroundAttached) return
  foregroundAttached = true
  try {
    onMessage(getMessaging(app), async payload => {
      const d = payload.data || {}
      const title = d.title || payload.notification?.title
      const body = d.body || payload.notification?.body
      const url = d.url || payload.fcmOptions?.link || '/'
      const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPE)
      const opts = {
        tag: d.tag || `${title || 'Roadcase'}|${body || ''}`,
        body: body || i18n.t('common.pushFallbackBody'), icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', data: { url },
      }
      if (reg) reg.showNotification(title || 'Roadcase', opts)
      else new Notification(title || 'Roadcase', opts)   // senza registrazione trovata non deve restare muta
    })
  } catch {
    // Non bloccante: resta il comportamento di prima (notifiche solo in background).
  }
}

// Il token FCM è del DISPOSITIVO, ma sul server il documento dice a CHI
// appartiene. Se sullo stesso telefono si esce e si entra con un altro account
// il token restava intestato al precedente: l'account nuovo non riceveva mai
// niente e quello vecchio sì. Qui lo si (ri)intesta all'utente attuale.
async function claimStoredToken() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) await authedPost('/api/push', { token, action: 'register' })
}

// Da chiamare prima del logout: toglie il token dal server (chi esce non deve
// più ricevere notifiche su questo telefono) e dal dispositivo — senza
// toccare il permesso né l'opt-out, così al prossimo accesso (anche con un
// altro account) si riattiva da solo, senza nuova richiesta.
export async function releasePushToken() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (!token) return
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  await authedPost('/api/push', { token, action: 'unregister' }).catch(() => {})
}

export async function enablePushNotifications() {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: PUSH_SCOPE })
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) return false
  await authedPost('/api/push', { token, action: 'register' })
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  attachForegroundPush()
  // Riaccese di proposito (toggle manuale dopo averle spente, o mai spente):
  // in entrambi i casi l'opt-out non deve più impedire il riavvio automatico
  // di maybeAutoEnablePush su un futuro dispositivo/reinstallo.
  localStorage.removeItem(PUSH_OPT_OUT_KEY)
  return true
}

export async function disablePushNotifications() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.setItem(PUSH_OPT_OUT_KEY, '1')
  if (!token) return
  await authedPost('/api/push', { token, action: 'unregister' }).catch(() => {})
  try {
    await deleteToken(getMessaging(app))
  } catch {
    // Il token può essere già scaduto/non registrato lato Firebase: non è un
    // problema, l'importante è che sia stato rimosso lato server sopra.
  }
}

// Tentativo automatico, una volta per apertura dell'app (vedi App.jsx): le
// notifiche sono "accese di default" solo nel senso che proviamo ad
// attivarle da sole al primo accesso utile, invece di aspettare che l'utente
// trovi il toggle in Profilo. Non insiste mai: se il permesso del browser è
// già stato negato (richiederlo di nuovo non mostra un secondo popup, il
// browser risponde "denied" in silenzio) o se l'utente le ha spente a mano
// in passato (PUSH_OPT_OUT_KEY), resta spento senza ritentare ad ogni avvio.
export async function maybeAutoEnablePush() {
  if (isPushEnabled()) {
    // Già attive su questo dispositivo: si riallinea comunque a chi è
    // collegato ora e si ascoltano i messaggi con l'app aperta.
    claimStoredToken().catch(() => {})
    attachForegroundPush()
    // Nessuna pagina sta sotto lo scope di questo service worker, quindi il browser non lo
    // ricontrolla da solo ad ogni apertura: senza questo restava la versione vecchia (che
    // mostrava notifiche vuote) finché non arrivava una push.
    navigator.serviceWorker?.getRegistration(PUSH_SCOPE).then(r => r?.update()).catch(() => {})
    return
  }
  if (localStorage.getItem(PUSH_OPT_OUT_KEY)) return
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') return
  if (!(await isPushAvailable())) return
  try {
    await enablePushNotifications()
  } catch {
    // Mai bloccante: un fallimento qui (SW non registrabile, rete assente al
    // primo avvio...) non deve impedire l'uso del resto dell'app. L'utente
    // può sempre riprovare dal toggle in Profilo.
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
    body: `${newFields.name || oldEvent.name || ''} · ${newFields.timeStart || '--:--'}–${newFields.timeEnd || '--:--'}`,
    url: `/events/${eventId}`,
    audience: { type: 'event', eventId },
  })
}
