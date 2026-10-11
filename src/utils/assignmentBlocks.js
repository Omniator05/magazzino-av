import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { toggleWorkerAssignment } from './workerAssignment'
import { notifyTeamPush } from './pushNotifications'
import i18n from '../i18n'

// Colore stabile per persona (interna o esterna): stesso id => sempre la
// stessa tinta nella timeline, senza dover far scegliere un colore a mano
// per ciascun magazziniere.
export function personColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsl(${hue}, 62%, 45%)`
}

// Tiene assignedWorkers dell'evento collegato coerente con i blocchi di
// QUESTO worker, ricalcolato dall'elenco blocchi già in memoria (nessuna
// query extra): se dopo la modifica resta almeno un blocco che lega questo
// worker a questo evento, assignedWorkers lo contiene, altrimenti no. Solo
// per workerId (profilo interno): un esterno non ha un profilo da aggiungere
// ad assignedWorkers, quello resta solo un dato della timeline.
async function syncEventAssignment(eventsById, allBlocksAfter, workerId, eventId) {
  if (!workerId || !eventId) return
  const event = eventsById[eventId]
  if (!event) return
  const stillLinked = allBlocksAfter.some(b => b.workerId === workerId && b.eventId === eventId)
  const alreadyIn = (event.assignedWorkers || []).includes(workerId)
  if (stillLinked === alreadyIn) return
  await toggleWorkerAssignment(doc(db, 'events', eventId), event, workerId)
  // Solo quando è una VERA aggiunta (non una rimozione): il worker appena
  // assegnato riceve una push mirata a lui, mai un broadcast alla squadra.
  if (stillLinked && !alreadyIn) {
    notifyTeamPush({
      title: i18n.t('staffTimeline.pushAssignedTitle'),
      body: event.name || '',
      url: `/events/${eventId}`,
      audience: { type: 'user', userId: workerId },
    })
  }
}

export async function createAssignmentBlock(data, { eventsById, allBlocks }) {
  const ref = await addDoc(collection(db, 'assignmentBlocks'), { ...data, createdAt: serverTimestamp() })
  await syncEventAssignment(eventsById, [...allBlocks, { ...data, id: ref.id }], data.workerId, data.eventId)
  return ref.id
}

export async function updateAssignmentBlock(id, oldBlock, newData, { eventsById, allBlocks }) {
  await updateDoc(doc(db, 'assignmentBlocks', id), newData)
  const after = allBlocks.map(b => (b.id === id ? { ...b, ...newData } : b))
  // Se cambia worker o evento collegato vanno ricalcolati sia il legame
  // vecchio che quello nuovo (potrebbero essere persone/eventi diversi).
  await syncEventAssignment(eventsById, after, oldBlock.workerId, oldBlock.eventId)
  await syncEventAssignment(eventsById, after, newData.workerId ?? oldBlock.workerId, newData.eventId ?? oldBlock.eventId)

  // Avviso cambio orario: un blocco legato a un evento avvisa admin + tutti
  // gli assegnati a quell'evento (potrebbe riguardarli anche se non sono
  // loro quello spostato); un task libero avvisa solo la persona interna
  // coinvolta (un esterno non ha un account/push da avvisare).
  const eventId = newData.eventId ?? oldBlock.eventId
  const timeChanged = (newData.startTime && newData.startTime !== oldBlock.startTime) || (newData.endTime && newData.endTime !== oldBlock.endTime)
  if (timeChanged) {
    const name = eventId ? (eventsById[eventId]?.name || '') : (newData.label ?? oldBlock.label ?? '')
    const date = newData.date ?? oldBlock.date
    const payload = {
      title: i18n.t('staffTimeline.pushTimeChangedTitle'),
      body: `${name} · ${newData.startTime ?? oldBlock.startTime}–${newData.endTime ?? oldBlock.endTime}`,
      // Un task libero porta dritti alla settimana giusta in Assegna
      // personale (vedi il ?mode=assign&date= letto in Calendar.jsx),
      // invece del generico "/calendar" che lasciava poi da cercare
      // l'attività a mano.
      url: eventId ? `/events/${eventId}` : `/calendar?mode=assign&date=${date}`,
    }
    if (eventId) notifyTeamPush({ ...payload, audience: { type: 'event', eventId } })
    else {
      const workerId = newData.workerId ?? oldBlock.workerId
      if (workerId) notifyTeamPush({ ...payload, audience: { type: 'user', userId: workerId } })
    }
  }
}

export async function deleteAssignmentBlock(block, { eventsById, allBlocks }) {
  await deleteDoc(doc(db, 'assignmentBlocks', block.id))
  const after = allBlocks.filter(b => b.id !== block.id)
  await syncEventAssignment(eventsById, after, block.workerId, block.eventId)
}
