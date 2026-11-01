import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'

// Approvare o rifiutare una richiesta d'accesso alla squadra (profilo con approved === false). Unico punto usato
// sia dalla sezione Utenti sia dal popup per gli admin, così le due strade fanno la stessa cosa e mandano la
// stessa email a chi aveva chiesto.

// Esito a chi aveva chiesto, gestito dal server (vedi `joinDecision` in api/send-email.js): email e, per il
// rifiuto, cancellazione dell'account. Risponde { sent, removed } oppure null se il server non ha risposto.
// Con un tetto di tempo: se non risponde, la decisione dell'admin non deve restare in sospeso.
async function emailDecision(targetUid, decision) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) return null
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ type: 'joinDecision', targetUid, decision }),
      signal: ctrl.signal,
    })
    return res.ok ? await res.json() : null
  } catch { return null } finally { clearTimeout(timer) }
}

export async function approveJoinRequest(uid) {
  await updateDoc(doc(db, 'profiles', uid), { approved: true })
  emailDecision(uid, 'approved')   // senza attendere: l'approvazione è già fatta
}

// Il server manda l'email e toglie account e profilo. Se non ha risposto (rete, sviluppo in locale) si cancella
// almeno il profilo da qui, come si è sempre fatto.
export async function rejectJoinRequest(uid) {
  const result = await emailDecision(uid, 'rejected')
  if (!result?.removed) await deleteDoc(doc(db, 'profiles', uid))
}
