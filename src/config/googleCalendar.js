// Client ID OAuth ottenuto da Google Cloud Console (Credenziali → Crea
// credenziali → ID client OAuth → tipo "Applicazione web"). Non è un segreto:
// può stare nel codice frontend, come il resto della configurazione Firebase
// in src/firebase.js.
export const GOOGLE_CLIENT_ID = 'INSERISCI_QUI_IL_TUO_CLIENT_ID.apps.googleusercontent.com'

// Ambito ristretto: crea/modifica/elimina solo gli eventi, non tocca le
// impostazioni del calendario. Essendo un ambito "non sensibile" non richiede
// la verifica di Google per essere usato in modalità Testing.
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
