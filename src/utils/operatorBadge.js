import { auth } from '../firebase'

// Badge QR personale per la "Postazione magazzino" (vedi api/_badge.js): il codice è
// "RCB-" + lettere/numeri. Il prefisso serve a distinguere, quando il lettore USB
// "digita" qualcosa, una PERSONA da un oggetto (che ha invece codici "WAV-…").
// Niente simboli strani nel prefisso: i lettori con la tastiera impostata male
// scambiano alcuni segni (vedi parseScannedCode), il trattino basta già.
const BADGE_RE = /^RCB-[A-Z0-9]{20,40}$/

// Stesse correzioni dei codici oggetto: apostrofo → trattino, maiuscole, spazi.
// Quando il codice si scrive a mano (Profilo → "codice" in gruppi da 4) spazi e trattino
// mancante non devono contare.
export const normalizeBadge = raw => {
  const c = String(raw || '').replace(/\s+/g, '').replace(/'/g, '-').toUpperCase()
  return /^RCB[A-Z0-9]/.test(c) ? `RCB-${c.slice(3)}` : c
}
export const isBadgeCode = raw => BADGE_RE.test(normalizeBadge(raw))

// Solo in `npm run dev`: Vite non serve la cartella api/, quindi /api/push non risponde.
// Per poter provare l'interfaccia in locale si usa un badge FINTO fisso che la postazione
// riconosce come "Operatore di prova". Nel build di produzione questo ramo non esiste.
export const DEV_BADGE = 'RCB-DEVPROVA2345678ABCDEFG'
function devFallback(body) {
  if (body.action === 'badge-get') return { code: DEV_BADGE }
  if (body.action === 'badge-login') {
    if (normalizeBadge(body.code) === DEV_BADGE) return { userId: 'dev-operator', name: 'Operatore di prova' }
    const e = new Error('Badge non valido'); e.status = 404; e.code = 'invalid'; throw e
  }
  throw new Error('dev-fallback')
}

async function post(body) {
  const user = auth.currentUser
  if (!user) throw new Error('not-signed-in')
  const idToken = await user.getIdToken()
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  }).catch(() => null)
  const data = res ? await res.json().catch(() => null) : null
  if (import.meta.env.DEV && data === null) return devFallback(body)
  if (!res) throw new Error('network')
  if (!res.ok) { const e = new Error(data?.error || `http-${res.status}`); e.status = res.status; e.code = data?.code; throw e }
  return data || {}
}

// Il proprio badge (si crea la prima volta). `regenerate` ne fa uno nuovo: il vecchio
// smette subito di funzionare.
export const fetchMyBadge = async (regenerate = false) => (await post({ action: 'badge-get', regenerate })).code

// Chiamata dalla postazione: chi è il proprietario di questo badge → { userId, name }.
export const badgeLogin = code => post({ action: 'badge-login', code: normalizeBadge(code) })
