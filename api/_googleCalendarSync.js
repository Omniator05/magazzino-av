// Conversioni evento Roadcase ↔ evento Google Calendar, lato server —
// stessa identica logica di src/utils/googleCalendar.js (toGoogleEvent/
// fromGoogleEvent), duplicata qui invece che importata: le funzioni /api
// di questo progetto sono sempre autonome (stesso pattern di
// api/sync-google-calendar.js, che aveva le proprie toYMD/sanitizeDocId),
// non importano da src/. Se la forma dei campi evento cambia, aggiornare
// in entrambi i posti.
export function toGoogleEvent(event) {
  const endDate = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  // Eventi "all day": su Google Calendar la data di fine è ESCLUSIVA (+1 giorno)
  const endExclusive = new Date(endDate + 'T00:00:00')
  endExclusive.setDate(endExclusive.getDate() + 1)
  return {
    summary: event.name,
    location: event.location || undefined,
    description: event.notes || undefined,
    start: { date: event.date },
    end: { date: endExclusive.toISOString().split('T')[0] },
  }
}

// Torna null se l'evento Google non ha una data valida (non dovrebbe capitare).
export function fromGoogleEvent(gEvent) {
  let date, dateEnd = null
  if (gEvent.start?.date) {
    date = gEvent.start.date
    const endInclusive = new Date(gEvent.end.date + 'T00:00:00')
    endInclusive.setDate(endInclusive.getDate() - 1)
    const end = endInclusive.toISOString().split('T')[0]
    if (end !== date) dateEnd = end
  } else if (gEvent.start?.dateTime) {
    date = gEvent.start.dateTime.slice(0, 10)
    const end = (gEvent.end?.dateTime || gEvent.start.dateTime).slice(0, 10)
    if (end !== date) dateEnd = end
  } else {
    return null
  }
  return {
    name: gEvent.summary?.trim() || '(senza titolo)',
    date, dateEnd,
    location: gEvent.location || '',
    notes: gEvent.description || '',
  }
}
