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

// Stessa idea di isWorkerUnavailable, ma un furgone non ha un'assenza
// segnalata da qualcuno: risulta "occupato" se è già CARICATO (non solo
// assegnato in lista) su un ALTRO evento le cui date si sovrappongono a
// questo (un furgone non può essere fisicamente su due carichi nello stesso
// periodo). Un oggetto solo "pronto" o assegnato ma non ancora caricato non
// impegna il furgone per davvero — è ancora fermo in magazzino, libero per
// chiunque altro nel frattempo; e se un carico è già rientrato (returned) il
// furgone è di nuovo libero. Diverso apposta dal controllo di disponibilità
// sugli OGGETTI (itemCommittedElsewhere), che invece scatta già in fase di
// pianificazione: lì il vincolo è la giacenza totale (due eventi non possono
// avere più pezzi di quanti ce ne sono, a prescindere da chi ha già caricato),
// qui invece è la posizione fisica di UN furgone, che prima del carico non è
// ancora davvero da nessuna parte.
// Ritorna l'evento incriminato (id + name), non solo sì/no: mostrare QUALE
// evento tiene occupato il furgone rende il "perché" verificabile a colpo
// d'occhio invece di dover setacciare tutti gli eventi vicini a mano.
export function vehicleConflictEvent(vehicleId, event, otherEvents) {
  if (!vehicleId || !event?.date) return null
  const evStart = event.date
  const evEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const hit = otherEvents.find(other => {
    if (other.id === event.id || !other.date) return false
    const oStart = other.date
    const oEnd = other.dateEnd && other.dateEnd >= other.date ? other.dateEnd : other.date
    if (!(evStart <= oEnd && evEnd >= oStart)) return false
    return (other.items || []).some(i => i.vehicleId === vehicleId && i.loaded && !i.returned)
  })
  return hit ? { id: hit.id, name: hit.name } : null
}

export function isVehicleUnavailable(vehicleId, event, otherEvents) {
  return !!vehicleConflictEvent(vehicleId, event, otherEvents)
}
