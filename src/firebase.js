// ============================================================
//  CONFIGURA QUI LE TUE CREDENZIALI FIREBASE
//  1. Vai su https://console.firebase.google.com
//  2. Crea un progetto > Aggiungi app Web
//  3. Copia le credenziali e incollale qui sotto
//  4. Abilita Firestore Database e Authentication (Email/Password)
// ============================================================

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

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
export default app
