import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, doc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { todayStr } from './workHours'

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

// Assegnazioni di una persona esterna da oggi in poi nella timeline "Assegna
// personale" (collection assignmentBlocks). Serve prima di eliminarla: i turni
// già passati restano com'è (storico), quelli futuri vanno tolti o confermati.
export async function upcomingExternalBlocks(teamId, externalWorkerId) {
  const snap = await getDocs(query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId), where('externalWorkerId', '==', externalWorkerId)))
  const today = todayStr()
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.date && b.date >= today)
}

// Toglie la persona da quelle assegnazioni. Su un evento il blocco si elimina; in
// un'attività libera, se nello stesso gruppo restano altre persone si elimina,
// se era l'unica il blocco torna "vuoto" (l'attività resta, come fa la colonna
// quando si toglie l'ultima persona).
export async function removeExternalFromBlocks(teamId, blocks) {
  for (const b of blocks) {
    const ref = doc(db, 'assignmentBlocks', b.id)
    if (b.eventId || !b.taskGroupId) { await deleteDoc(ref); continue }
    const group = await getDocs(query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId), where('taskGroupId', '==', b.taskGroupId)))
    const others = group.docs.filter(d => d.id !== b.id && (d.data().workerId || d.data().externalWorkerId))
    if (others.length > 0) await deleteDoc(ref)
    else await updateDoc(ref, { externalWorkerId: null, externalWorkerName: null, note: '' })
  }
}

// Elimina un utente temporaneo; se ha assegnazioni future le toglie prima.
export async function deleteExternalWorker(teamId, externalWorkerId, upcomingBlocks = []) {
  if (upcomingBlocks.length > 0) await removeExternalFromBlocks(teamId, upcomingBlocks)
  await deleteDoc(doc(db, 'externalWorkers', externalWorkerId))
}
