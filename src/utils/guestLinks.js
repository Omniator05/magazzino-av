import { auth } from '../firebase'

// Link ospite per il personale esterno (vedi api/_guest.js): una pagina in sola
// lettura raggiungibile da un indirizzo con una chiave casuale, senza account.
// La chiave viene mostrata UNA volta sola, alla creazione: sul server resta
// solo la sua impronta, quindi un link già dato non si può rivedere (si può
// crearne uno nuovo, che annulla il precedente).

// Chiamate dell'admin (token Firebase): crea/annulla il link di una persona.
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
  if (!res.ok) throw new Error(data.error || `http-${res.status}`)
  return data
}

export async function createGuestLink(externalWorkerId) {
  const { token } = await adminPost({ action: 'guest-create', externalWorkerId })
  return token
}

export const revokeGuestLink = externalWorkerId => adminPost({ action: 'guest-revoke', externalWorkerId })

export const guestUrl = token => `${window.location.origin}/ospite/${token}`

// Pubblica: la chiave nel link è l'unica credenziale. `error` = 'invalid' (link
// sbagliato o annullato) | 'expired' (scaduto) | 'error' (rete/server).
export async function fetchGuestView(token) {
  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'guest-view', token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.code || 'error' }
    return { data }
  } catch {
    return { error: 'error' }
  }
}

// "Non mostrare più" della domanda "Utente esterno inserito, vuoi invitarlo?"
// (GuestInvitePrompt): preferenza di questo dispositivo, come il tema. Letta e
// scritta in sicurezza: con la memoria del browser bloccata la domanda
// semplicemente continua a comparire.
const MUTE_KEY = 'rcGuestInviteHint'
export function isInvitePromptMuted() {
  try { return localStorage.getItem(MUTE_KEY) === 'off' } catch { return false }
}
export function muteInvitePrompt() {
  try { localStorage.setItem(MUTE_KEY, 'off') } catch { /* niente da fare */ }
}
