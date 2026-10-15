// Service worker DEDICATO alle notifiche push (FCM) — separato da quello che
// genera vite-plugin-pwa (quello gestisce solo cache/offline, è in modalità
// "generateSW" e non si può estendere con codice custom). Firebase richiede
// che questo file stia esattamente a questo path di root ("/firebase-messaging-sw.js")
// perché lo scope della registrazione copra tutta l'app.
//
// firebaseConfig è lo stesso oggetto "pubblico" di src/firebase.js (chiavi
// client Firebase, non segrete) — qui va duplicato perché questo file NON
// passa dal bundler Vite, è servito così com'è da public/.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyA4pKUuEMrHDdjEdaI75bOE2xiWc_M_U3o',
  authDomain: 'app-magazzino-9c5fa.firebaseapp.com',
  projectId: 'app-magazzino-9c5fa',
  storageBucket: 'app-magazzino-9c5fa.firebasestorage.app',
  messagingSenderId: '1074850505571',
  appId: '1:1074850505571:web:da9a2fca16e9a14487a956',
})

const messaging = firebase.messaging()

// Solo messaggi arrivati ad app chiusa/in background — in primo piano ci
// pensa già il banner in-app di WorkerScanner, non serve duplicare l'avviso.
// I messaggi sono SOLO "data" (vedi api/push.js): l'SDK non mostra niente da
// sé, la notifica la mostra questo handler una volta sola. (`payload.notification`
// resta come ripiego per messaggi vecchi ancora in viaggio.)
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {}
  const title = d.title || payload.notification?.title
  const body = d.body || payload.notification?.body
  self.registration.showNotification(title || 'Roadcase', {
    tag: d.tag || `${title || 'Roadcase'}|${body || ''}`,
    body: body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: d.url || payload.fcmOptions?.link || '/' },
  })
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
