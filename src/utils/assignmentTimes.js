// Orari "di default" delle card di Assegna personale — condivisi fra la
// timeline desktop (StaffTimeline.jsx) e il foglio di assegnazione dentro la
// lista di carico (EventAssignSheet.jsx).
export const DEFAULT_START = '00:00'
export const DEFAULT_END = '23:59'

export function toMin(hm) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

// Un evento compare nei giorni che tocca (anche multi-giorno, come
// eventsByDate in Calendar.jsx): se QUEL giorno ha un orario su misura
// (event.dayTimes, impostato toccando il titolo della card — vedi
// dayHoursModal più sotto) usa quello; sul giorno con l'orario "proprio"
// dell'evento (event.date, se non è "tutto il giorno") usa quello; sugli
// altri giorni "di passaggio" occupa l'intera fascia (è comunque in corso,
// nessun orario più preciso impostato).
export function eventTimeForDay(ev, date) {
  const custom = ev.dayTimes?.[date]
  if (custom?.timeStart && custom?.timeEnd) return [custom.timeStart, custom.timeEnd]
  if (ev.date === date && ev.allDay === false && ev.timeStart && ev.timeEnd) return [ev.timeStart, ev.timeEnd]
  return [DEFAULT_START, DEFAULT_END]
}
// Orario di una FASE (montaggio/smontaggio): quello impostato dal pannello
// "Assegna personale" (event.phaseTimes), altrimenti un predefinito — il
// giorno intero, oppure, se cade nello stesso giorno dell'evento, la parte
// PRIMA dell'inizio (montaggio) o DOPO la fine (smontaggio) dell'evento.
export function phaseTimeFor(ev, key, date) {
  const custom = ev.phaseTimes?.[key]
  if (custom?.timeStart && custom?.timeEnd) return [custom.timeStart, custom.timeEnd]
  const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
  if (date >= ev.date && date <= end) {
    const [es, ee] = eventTimeForDay(ev, date)
    if (key === 'montaggio' && toMin(es) > 0) return [DEFAULT_START, es]
    if (key === 'smontaggio' && toMin(ee) < 1439) return [ee, DEFAULT_END]
  }
  return [DEFAULT_START, DEFAULT_END]
}

// Testo dell'orario di un evento in UN giorno, per le card del calendario
// (es. "09:00–18:00"): prima l'orario su misura di quel giorno
// (event.dayTimes), poi quello dell'evento se non è "tutto il giorno"; se
// nessuno dei due c'è, `allDayText`. Stessa regola del dettaglio nella colonna
// laterale del Calendario su computer.
export function eventHoursLabel(ev, date, allDayText) {
  const custom = ev.dayTimes?.[date]
  if (custom?.timeStart && custom?.timeEnd) return `${custom.timeStart}–${custom.timeEnd}`
  if (ev.allDay === false && ev.timeStart && ev.timeEnd) return `${ev.timeStart}–${ev.timeEnd}`
  return allDayText
}

// Orario di una fase solo se è stato impostato davvero (altrimenti niente: il
// predefinito "tutto il giorno" non aggiunge informazione al tag).
export function phaseHoursLabel(ev, key) {
  const pt = ev.phaseTimes?.[key]
  return pt?.timeStart && pt?.timeEnd ? `${pt.timeStart}–${pt.timeEnd}` : ''
}
