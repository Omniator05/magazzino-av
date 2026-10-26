import { writeBatch, doc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../firebase'

// Le "attività" sono i blocchi della timeline "Assegna personale" senza evento (assignmentBlocks con
// eventId vuoto). Più persone legate alla stessa attività condividono un taskGroupId e sono UNA voce.
// Il completamento è dell'attività intera: si scrive su tutti i blocchi del gruppo
// (done, doneAt, doneBy, doneByName), così lo vede subito chiunque guardi, in qualunque pagina.
export const activityKey = b => b.taskGroupId || b.id

// blocks: tutti gli assignmentBlocks; nameOf(uid) → nome di un profilo interno.
export function groupActivities(blocks, nameOf) {
  const groups = {}
  blocks.filter(b => !b.eventId && b.date).forEach(b => { (groups[`${b.date}|${activityKey(b)}`] ||= []).push(b) })
  return Object.values(groups).map(group => {
    const people = []
    group.forEach(b => {
      const id = b.workerId || b.externalWorkerId
      if (!id || people.some(p => p.id === id)) return
      people.push({ id, name: b.workerId ? (nameOf(b.workerId) || b.workerName || '') : (b.externalWorkerName || ''), uid: b.workerId || null })
    })
    const doneBlock = group.find(b => b.done)
    const first = group[0]
    return {
      id: activityKey(first), date: first.date, blocks: group, people,
      label: first.label || '', description: first.description || group.find(b => b.description)?.description || '',
      linkedEventId: group.find(b => b.linkedEventId)?.linkedEventId || null,
      linkedListId: group.find(b => b.linkedListId)?.linkedListId || null,
      startTime: group.reduce((m, b) => (b.startTime < m ? b.startTime : m), first.startTime),
      endTime: group.reduce((m, b) => (b.endTime > m ? b.endTime : m), first.endTime),
      overnight: group.some(b => b.endTime <= b.startTime),
      done: !!doneBlock, doneAt: doneBlock?.doneAt || null, doneByName: doneBlock?.doneByName || '', doneBy: doneBlock?.doneBy || null,
    }
  })
}

// Quelle che interessano oggi: di oggi, oppure di ieri se vanno oltre la mezzanotte (con `cont`).
export function activitiesForDay(acts, today, yesterday, hold = {}) {
  // `hold`: attività appena spuntate che restano un attimo dov'erano (si vede l'animazione, poi passano in fondo)
  const isDone = a => (a.id in hold ? hold[a.id] : a.done)
  return acts
    .filter(a => a.date === today || (a.date === yesterday && a.overnight))
    .map(a => ({ ...a, cont: a.date !== today }))
    .sort((a, b) => (isDone(a) - isDone(b)) || (a.cont ? '00:00' : a.startTime).localeCompare(b.cont ? '00:00' : b.startTime))
}

// Segna fatta (o riapre) un'attività. `who` = { uid, name }.
export async function setActivityDone(act, done, who) {
  const batch = writeBatch(db)
  act.blocks.forEach(b => {
    batch.update(doc(db, 'assignmentBlocks', b.id), done
      ? { done: true, doneAt: serverTimestamp(), doneBy: who.uid, doneByName: who.name || '' }
      : { done: deleteField(), doneAt: deleteField(), doneBy: deleteField(), doneByName: deleteField() })
  })
  await batch.commit()
}

export const isAssignedTo = (act, uid) => !!uid && act.people.some(p => p.uid === uid)
