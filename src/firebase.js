import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyA4pKUuEMrHDdjEdaI75bOE2xiWc_M_U3o",
  authDomain: "app-magazzino-9c5fa.firebaseapp.com",
  projectId: "app-magazzino-9c5fa",
  storageBucket: "app-magazzino-9c5fa.firebasestorage.app",
  messagingSenderId: "1074850505571",
  appId: "1:1074850505571:web:da9a2fca16e9a14487a956"
}

const app = initializeApp(firebaseConfig)
// Cache locale persistente (IndexedDB) invece del default in-memory: gli
// onSnapshot (calendario, magazzino, task...) continuano a mostrare l'ultimo
// dato conosciuto quando la connessione cade, invece di restare vuoti — vale
// anche per la PWA installata su iOS/Android, nessuna app nativa richiesta.
// `persistentMultipleTabManager` evita che aprire l'app in più schede
// disattivi la cache su tutte tranne la prima.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const auth = getAuth(app)
export const storage = getStorage(app)

// App secondaria usata SOLO per creare nuovi utenti (createUserWithEmailAndPassword
// su `auth` switcherebbe la sessione corrente al nuovo utente appena creato).
const secondaryApp = initializeApp(firebaseConfig, 'Secondary')
export const secondaryAuth = getAuth(secondaryApp)

export default app
