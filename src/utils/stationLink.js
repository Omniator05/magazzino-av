import { auth } from '../firebase'
import { signInWithCustomToken } from 'firebase/auth'

// Collegamento della Postazione magazzino con un link/QR (vedi api/_station.js): niente nome utente né
// password, ogni squadra ha il suo link con una chiave casuale. La chiave è fatta solo di cifre e lettere
// a-f (32 caratteri): un lettore USB con la tastiera impostata male non la storpia.
const TOKEN_RE = /^[0-9a-f]{32}$/

export const stationUrl = token => `${window.location.origin}/postazione/${token}`

// Dal testo "digitato" dal lettore (l'indirizzo intero, o la sola chiave) alla chiave, oppure null.
export function parseStationScan(raw) {
  const s = String(raw || '').replace(/\s+/g, '').toLowerCase()
  const m = s.match(/([0-9a-f]{32})$/)
  return m ? m[1] : null
}

async function adminPost(body) {
  const user = auth.currentUser
  if (!user) throw new Error('not-signed-in')
  const idToken = await user.getIdToken()
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || `http-${res.status}`); e.code = data.code; e.status = res.status; throw e }
  return data
}

export const getStationLink = async () => (await adminPost({ action: 'station-link-get' })).token || null
export const createStationLink = async () => (await adminPost({ action: 'station-link-create' })).token
export const revokeStationLink = () => adminPost({ action: 'station-link-revoke' })

async function publicPost(body) {
  const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || `http-${res.status}`); e.code = data.code || 'error'; throw e }
  return data
}

// Pagina di collegamento (pubblica): di che squadra è questo link? → { teamName }
export const fetchStationInfo = token => TOKEN_RE.test(token) ? publicPost({ action: 'station-connect', token, dryRun: true }) : Promise.reject(Object.assign(new Error('invalid'), { code: 'invalid' }))

// Collega questo dispositivo come postazione della squadra del link.
export async function connectStation(token) {
  const { customToken } = await publicPost({ action: 'station-connect', token })
  await signInWithCustomToken(auth, customToken)
}
