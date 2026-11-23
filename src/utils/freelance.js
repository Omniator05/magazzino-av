import { auth } from '../firebase'

// Account Freelance (personale esterno con login, ruolo 'freelance'): vedi api/_freelance.js. Il Freelance non legge Firestore
// dal client: i suoi eventi glieli restituisce il server, controllando chi chiama.

// Eventi e attività assegnati a chi è collegato. `error`: 'plan' (la squadra non è su un piano Pro) | 'error' (rete/server).
export async function fetchFreelanceView() {
  try {
    const user = auth.currentUser
    if (!user) return { error: 'error' }
    const idToken = await user.getIdToken()
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'freelance-view' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.code === 'plan' ? 'plan' : 'error' }
    return { data }
  } catch {
    return { error: 'error' }
  }
}

// Accetta o rifiuta un evento assegnato (`response`: 'accepted' | 'declined'). Ritorna true se il server l'ha salvata.
export async function respondToEvent(eventId, response) {
  try {
    const user = auth.currentUser
    if (!user) return false
    const idToken = await user.getIdToken()
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'freelance-respond', eventId, response }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Indirizzo personale per abbonare il proprio calendario (Apple Calendario, Outlook…) agli eventi assegnati: si aggiorna da solo.
// Ritorna l'indirizzo https (il chiamante lo apre come webcal://) oppure null.
export async function fetchCalendarFeedUrl() {
  try {
    const user = auth.currentUser
    if (!user) return null
    const idToken = await user.getIdToken()
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'freelance-feed-url' }),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? data.url || null : null
  } catch {
    return null
  }
}
