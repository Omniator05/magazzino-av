import { auth } from '../firebase'

// Eliminazione completa di un utente e liberazione delle email "orfane" (vedi api/_users.js).
// Tutto passa dal server perché togliere un account di accesso (Firebase Auth) richiede l'Admin SDK:
// dal browser si può eliminare solo il profilo, e l'email resterebbe "già in uso".
async function adminPost(body) {
  const current = auth.currentUser
  if (!current) throw new Error('not-signed-in')
  const idToken = await current.getIdToken()
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `http-${res.status}`)
  return data
}

// Toglie account di accesso + profilo + dati collegati: email e nome utente tornano riutilizzabili.
export const deleteUserAccount = targetUid => adminPost({ action: 'user-delete', targetUid })

// Se l'email è tenuta da un account senza profilo (utente eliminato in passato) lo libera.
// Ritorna true se si può ritentare la creazione.
export async function reclaimOrphanEmail(email) {
  try {
    const { freed } = await adminPost({ action: 'user-reclaim-email', email })
    return !!freed
  } catch { return false }
}
