import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Persone esterne (non registrate nell'app, es. personale a chiamata) che
// possono comparire nella timeline settimanale — stesso schema di
// brasserieArtists (vedi ArtistSlotPicker.jsx/BrasserieEditor.jsx): nameLower
// per la ricerca case-insensitive, usageCount/lastUsedAt per proporre prima
// le più usate invece di farle riscrivere ogni volta.
export function watchExternalWorkers(teamId, cb) {
  if (!teamId) return () => {}
  const q = query(collection(db, 'externalWorkers'), where('teamId', '==', teamId))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
}

// Trova per nome esatto (case-insensitive) tra quelli già in lista, o ne crea
// uno nuovo — non duplica la stessa persona se richiamata più volte.
export async function getOrCreateExternalWorker(teamId, name, userId, existing) {
  const trimmed = name.trim()
  const nameLower = trimmed.toLowerCase()
  const match = existing.find(w => w.nameLower === nameLower)
  if (match) {
    await updateDoc(doc(db, 'externalWorkers', match.id), { usageCount: increment(1), lastUsedAt: serverTimestamp() })
    return match.id
  }
  const ref = await addDoc(collection(db, 'externalWorkers'), {
    name: trimmed, nameLower, teamId,
    usageCount: 1, lastUsedAt: serverTimestamp(),
    createdAt: serverTimestamp(), createdBy: userId,
  })
  return ref.id
}
