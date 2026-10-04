import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Furgoni esterni (noleggiati, presi in prestito — non in flotta, vedi
// Vehicles.jsx) assegnabili alla lista di carico — stesso schema di
// externalWorkers.js: nameLower per il confronto case-insensitive,
// usageCount/lastUsedAt per proporre prima i più usati invece di farli
// riscrivere ogni volta.
export function watchExternalVehicles(teamId, cb) {
  if (!teamId) return () => {}
  const q = query(collection(db, 'externalVehicles'), where('teamId', '==', teamId))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

// Trova per nome esatto (case-insensitive) tra quelli già salvati, o ne crea
// uno nuovo — non duplica lo stesso furgone se richiamato più volte.
export async function getOrCreateExternalVehicle(teamId, name, userId, existing) {
  const trimmed = name.trim()
  const nameLower = trimmed.toLowerCase()
  const match = existing.find(v => v.nameLower === nameLower)
  if (match) {
    await updateDoc(doc(db, 'externalVehicles', match.id), { usageCount: increment(1), lastUsedAt: serverTimestamp() })
    return match.id
  }
  const ref = await addDoc(collection(db, 'externalVehicles'), {
    name: trimmed, nameLower, teamId,
    usageCount: 1, lastUsedAt: serverTimestamp(),
    createdAt: serverTimestamp(), createdBy: userId,
  })
  return ref.id
}
