import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { toggleWorkerAssignment } from './workerAssignment'
import { notifyTeamPush } from './pushNotifications'
import i18n from '../i18n'
import { formatDate } from './formatDate'

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
async function syncEventAssignment(eventsById, allBlocksAfter, workerId, eventId, { notify = true } = {}) {
  if (!workerId || !eventId) return
  const event = eventsById[eventId]
  if (!event) return
  const stillLinked = allBlocksAfter.some(b => b.workerId === workerId && b.eventId === eventId)
  const alreadyIn = (event.assignedWorkers || []).includes(workerId)
  if (stillLinked === alreadyIn) return
  await toggleWorkerAssignment(doc(db, 'events', eventId), event, workerId)
  // Solo quando è una VERA aggiunta (non una rimozione): il worker appena
  // assegnato riceve una push mirata a lui, mai un broadcast alla squadra.
  if (stillLinked && !alreadyIn && notify) {
    notifyTeamPush({
      title: i18n.t('staffTimeline.pushAssignedTitle'),
      body: event.name || '',
      url: `/events/${eventId}`,
      audience: { type: 'user', userId: workerId },
    })
  }
}

const PHASE_LABEL_KEY = { montaggio: 'calendar.legendAssembly', smontaggio: 'calendar.legendDisassembly' }

// Push mirate alla SOLA persona interessata (mai a tutto l'evento: ogni
// persona ha il suo orario, non serve avvisare gli altri). Un esterno non ha
// un account, quindi niente push. Il testo porta sempre data e orario, così
// basta la notifica per capire cosa è cambiato.
function blockPushInfo(block, eventsById) {
  const event = block.eventId ? eventsById[block.eventId] : null
  const dayLabel = formatDate(block.date + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'short' }, i18n.language)
  const when = `${dayLabel} · ${block.startTime}–${block.endTime}`
  const phaseLabel = block.phase && PHASE_LABEL_KEY[block.phase] ? i18n.t(PHASE_LABEL_KEY[block.phase]) : null
  return {
    what: event ? (phaseLabel ? `${phaseLabel} · ${event.name || ''}` : (event.name || '')) : (block.label || i18n.t('staffTimeline.untitledTask')),
    when,
    phaseLabel,
    // Un evento/fase porta alla lista di carico (da preparare), un task al calendario.
    url: event ? `/events/${event.id}` : '/calendar',
  }
}
function notifyPersonAssigned(block, eventsById) {
  if (!block.workerId) return
  const { what, when, phaseLabel, url } = blockPushInfo(block, eventsById)
  notifyTeamPush({
    title: phaseLabel ? i18n.t('staffTimeline.pushPhaseAssignedTitle', { phase: phaseLabel }) : i18n.t('staffTimeline.pushTaskAssignedTitle'),
    body: `${what} · ${when}`,
    url,
    audience: { type: 'user', userId: block.workerId },
  })
}
function notifyPersonTimeChanged(block, eventsById) {
  if (!block.workerId) return
  const { what, when, url } = blockPushInfo(block, eventsById)
  notifyTeamPush({
    title: i18n.t('staffTimeline.pushTimeChangedTitle'),
    body: `${what} · ${when}`,
    url,
    audience: { type: 'user', userId: block.workerId },
  })
}

export async function createAssignmentBlock(data, { eventsById, allBlocks }) {
  const ref = await addDoc(collection(db, 'assignmentBlocks'), { ...data, createdAt: serverTimestamp() })
  const created = { ...data, id: ref.id }
  // Un blocco di fase ha la sua notifica ("Montaggio assegnato"): niente
  // anche "Evento assegnato" a ruota.
  await syncEventAssignment(eventsById, [...allBlocks, created], data.workerId, data.eventId, { notify: !data.phase })
  // Evento vero: ci pensa syncEventAssignment (solo alla prima volta). Task e
  // fasi: sempre, ad ogni nuova persona assegnata.
  if (!data.eventId || data.phase) notifyPersonAssigned(created, eventsById)
  return ref.id
}

export async function updateAssignmentBlock(id, oldBlock, newData, { eventsById, allBlocks }) {
  await updateDoc(doc(db, 'assignmentBlocks', id), newData)
  const merged = { ...oldBlock, ...newData, id }
  const after = allBlocks.map(b => (b.id === id ? merged : b))
  // Se cambia worker o evento collegato vanno ricalcolati sia il legame
  // vecchio che quello nuovo (potrebbero essere persone/eventi diversi).
  await syncEventAssignment(eventsById, after, oldBlock.workerId, oldBlock.eventId, { notify: !merged.phase })
  await syncEventAssignment(eventsById, after, newData.workerId ?? oldBlock.workerId, newData.eventId ?? oldBlock.eventId, { notify: !merged.phase })

  // Una persona che entra in un blocco "vuoto" (task creato prima, poi
  // assegnato) è una nuova assegnazione; altrimenti, se cambia l'orario, si
  // avvisa SOLO lei del nuovo orario.
  const becameAssigned = !oldBlock.workerId && newData.workerId
  const timeChanged = (newData.startTime && newData.startTime !== oldBlock.startTime) || (newData.endTime && newData.endTime !== oldBlock.endTime)
  if (becameAssigned) {
    if (!merged.eventId || merged.phase) notifyPersonAssigned(merged, eventsById)
  } else if (timeChanged) {
    notifyPersonTimeChanged(merged, eventsById)
  }
}

export async function deleteAssignmentBlock(block, { eventsById, allBlocks }) {
  await deleteDoc(doc(db, 'assignmentBlocks', block.id))
  const after = allBlocks.filter(b => b.id !== block.id)
  await syncEventAssignment(eventsById, after, block.workerId, block.eventId)
}
