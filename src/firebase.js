import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
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
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

// App secondaria usata SOLO per creare nuovi utenti (createUserWithEmailAndPassword
// su `auth` switcherebbe la sessione corrente al nuovo utente appena creato).
const secondaryApp = initializeApp(firebaseConfig, 'Secondary')
export const secondaryAuth = getAuth(secondaryApp)

export default app
