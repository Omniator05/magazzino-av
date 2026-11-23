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
