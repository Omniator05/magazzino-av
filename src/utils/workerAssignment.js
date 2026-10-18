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

// Stessa logica di vehicleConflictEvent ma per un furgone ESTERNO (non in
// flotta, vedi utils/externalVehicles.js) — è comunque un'entità riusabile
// con un id proprio, quindi può restare "occupato" su un altro evento allo
// stesso modo di uno in flotta.
export function externalVehicleConflictEvent(externalVehicleId, event, otherEvents) {
  if (!externalVehicleId || !event?.date) return null
  const evStart = event.date
  const evEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const hit = otherEvents.find(other => {
    if (other.id === event.id || !other.date) return false
    const oStart = other.date
    const oEnd = other.dateEnd && other.dateEnd >= other.date ? other.dateEnd : other.date
    if (!(evStart <= oEnd && evEnd >= oStart)) return false
    return (other.items || []).some(i => i.externalVehicleId === externalVehicleId && i.loaded && !i.returned)
  })
  return hit ? { id: hit.id, name: hit.name } : null
}

// Chi lavora su un evento in UN giorno preciso, per le card del Calendario.
// Le assegnazioni per giorno stanno in `assignmentBlocks` (Assegna personale):
// quelle di una fase (montaggio/smontaggio) hanno la loro card, qui restano le
// altre di quel giorno — stessa regola di StaffTimeline. Un evento senza nessun
// blocco (assegnato col vecchio elenco unico `assignedWorkers`) mostra ancora
// tutti, perché non c'è altro modo di sapere i giorni.
// Ritorna [{ key, workerId, name, hours }]: `name` è solo per il personale
// esterno; `hours` unisce gli orari se la stessa persona ha più blocchi.
export function assigneesOnDay(event, date, blocks) {
  const own = (blocks || []).filter(b => b.eventId === event.id)
  if (own.length === 0) return (event.assignedWorkers || []).map(id => ({ key: id, workerId: id, name: null, hours: null }))
  const byPerson = new Map()
  own.filter(b => b.date === date && !b.phase).forEach(b => {
    const key = b.workerId || `ext:${b.externalWorkerId || b.externalWorkerName}`
    const hours = b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : null
    const prev = byPerson.get(key)
    if (prev) { if (hours) prev.hours = prev.hours ? `${prev.hours}, ${hours}` : hours; return }
    byPerson.set(key, { key, workerId: b.workerId || null, name: b.workerId ? null : (b.externalWorkerName || null), hours })
  })
  return [...byPerson.values()]
}
