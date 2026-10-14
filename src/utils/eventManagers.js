import { collection, query, where, getDocs, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Rubrica referenti evento (es. "Katia" della Fiera) — chiamata da ogni
// form che salva un eventManager (CreateEventFlow, CalendarSidePanel,
// l'edit di Calendar.jsx ed Events.jsx), così il nome digitato una volta
// suggerisce anche telefono/email le volte successive (vedi
// EventManagerField.jsx, che legge la stessa collection in lettura).
// Fire-and-forget: non deve mai far fallire il salvataggio dell'evento.
export async function rememberEventManager(teamId, userUid, { name, phone, email } = {}) {
  const trimmedName = (name || '').trim()
  if (!trimmedName || !teamId) return
  const nameLower = trimmedName.toLowerCase()
  const trimmedPhone = (phone || '').trim()
  const trimmedEmail = (email || '').trim()
  const snap = await getDocs(query(collection(db, 'eventManagers'), where('teamId', '==', teamId), where('nameLower', '==', nameLower)))
  if (!snap.empty) {
    const data = { usageCount: increment(1), lastUsedAt: serverTimestamp() }
    if (trimmedPhone) data.phone = trimmedPhone
    if (trimmedEmail) data.email = trimmedEmail
    await updateDoc(doc(db, 'eventManagers', snap.docs[0].id), data)
  } else {
    await addDoc(collection(db, 'eventManagers'), {
      teamId, name: trimmedName, nameLower, phone: trimmedPhone, email: trimmedEmail,
      usageCount: 1, lastUsedAt: serverTimestamp(), createdAt: serverTimestamp(), createdBy: userUid,
    })
  }
}
