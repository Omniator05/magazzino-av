import { updateDoc } from 'firebase/firestore'

// Aggiunge/rimuove un worker da assignedWorkers, sostituendo l'intero array
// (comportamento invariato rispetto alla versione storica in EventDetail.jsx).
export async function toggleWorkerAssignment(eventRef, event, workerId) {
  const current = event.assignedWorkers || []
  const updated = current.includes(workerId)
    ? current.filter(wid => wid !== workerId)
    : [...current, workerId]
  await updateDoc(eventRef, { assignedWorkers: updated })
}

// Overlap fra le date dell'evento [date, dateEnd||date] e il periodo di
// un'assenza [startDate, endDate] — a differenza della versione precedente
// considera anche dateEnd, quindi un'assenza che copre solo l'ultimo giorno
// di un evento multi-giorno risulta correttamente rilevata.
export function isWorkerUnavailable(workerId, event, unavailabilityList) {
  if (!event?.date) return false
  const evStart = event.date
  const evEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  return unavailabilityList.some(u =>
    u.workerId === workerId && evStart <= u.endDate && evEnd >= u.startDate
  )
}
