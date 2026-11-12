// Conversioni evento Roadcase ↔ evento Google Calendar, lato server: l'unico
// posto che le conosce (le funzioni /api sono autonome, non importano da src/).
// Se la forma dei campi evento cambia (date, orari), aggiornare qui.

// Fuso in cui si leggono e si scrivono gli orari: Roadcase salva solo "09:00" senza fuso, quindi serve uno fisso
// (quello di chi lo usa). Con timeZone=… nella lista eventi Google restituisce gli orari già in questo fuso.
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Europe/Rome'

const addDays = (ymd, n) => {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }

export function toGoogleEvent(event) {
  const endDate = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const base = { summary: event.name, location: event.location || undefined, description: event.notes || undefined }
  // Evento con orario: dateTime (e date a null, perché un PATCH da "tutto il giorno" a orario unisce i campi e
  // Google rifiuta date+dateTime insieme). Un solo giorno che finisce dopo la mezzanotte (18:00–02:00) finisce il giorno dopo.
  if (event.allDay === false && event.timeStart && event.timeEnd) {
    const overnight = endDate === event.date && toMin(event.timeEnd) <= toMin(event.timeStart)
    return {
      ...base,
      start: { dateTime: `${event.date}T${event.timeStart}:00`, timeZone: APP_TIME_ZONE, date: null },
      end: { dateTime: `${overnight ? addDays(endDate, 1) : endDate}T${event.timeEnd}:00`, timeZone: APP_TIME_ZONE, date: null },
    }
  }
  // Eventi "all day": su Google Calendar la data di fine è ESCLUSIVA (+1 giorno)
  return {
    ...base,
    start: { date: event.date, dateTime: null },
    end: { date: addDays(endDate, 1), dateTime: null },
  }
}

// Gli eventi creati su Google arrivano sempre come "evento": se il titolo contiene la parola "rent" o
// "noleggio" (parola intera, qualunque maiuscola: "RENT Mario", "Noleggio luci", non "Parent") li importiamo
// come rent/install. Vale solo alla creazione: dopo, il tipo lo decide l'app (Modifica evento → Evento/Rent).
export function looksLikeRent(title) {
  return /(^|[^\p{L}\p{N}])(rent|noleggio)(?![\p{L}\p{N}])/iu.test(title || '')
}

// Torna null se l'evento Google non ha una data valida (non dovrebbe capitare).
// Gli eventi con orario arrivano con allDay:false + timeStart/timeEnd ("HH:MM", nel fuso APP_TIME_ZONE: la lista
// eventi viene chiesta con timeZone=…). Un evento che inizia e finisce a cavallo della mezzanotte (18:00 → 02:00 del
// giorno dopo) è, per Roadcase, un evento di un solo giorno con timeEnd < timeStart (vedi endsAfterMidnight).
export function fromGoogleEvent(gEvent) {
  let date, dateEnd = null, allDay = true, timeStart = null, timeEnd = null
  if (gEvent.start?.date) {
    date = gEvent.start.date
    const end = addDays(gEvent.end?.date || date, -1)
    if (end > date) dateEnd = end
  } else if (gEvent.start?.dateTime) {
    date = gEvent.start.dateTime.slice(0, 10)
    const endDT = gEvent.end?.dateTime || gEvent.start.dateTime
    const endDay = endDT.slice(0, 10)
    allDay = false
    timeStart = gEvent.start.dateTime.slice(11, 16)
    timeEnd = endDT.slice(11, 16)
    if (endDay > date) {
      const overnight = endDay === addDays(date, 1) && toMin(timeEnd) <= toMin(timeStart)
      if (!overnight) dateEnd = endDay
    }
  } else {
    return null
  }
  return {
    name: gEvent.summary?.trim() || '(senza titolo)',
    date, dateEnd, allDay, timeStart, timeEnd,
    location: gEvent.location || '',
    notes: gEvent.description || '',
  }
}
