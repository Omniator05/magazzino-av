// Costruzione di file .ics (calendario) per gli eventi assegnati a una persona esterna: puro JavaScript, senza dipendenze, così
// lo usano sia l'app (pulsante "Aggiungi al calendario", src/utils/calendarExport.js) sia il server (abbonamento al calendario
// del Freelance, api/_freelance.js). Gli orari sono "flottanti" (senza fuso): il calendario del telefono li mostra con lo stesso
// orario scritto in Roadcase, come per chi li ha assegnati.
// `ev` ha la forma pubblica di api/_guest.js (name, date, dateEnd, allDay, timeStart, timeEnd, location, notes, blocks).
export const compact = d => String(d).replaceAll('-', '')
export const hhmm = t => `${String(t).replace(':', '')}00`
const addDay = dateStr => {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
// Le righe di un .ics non superano i 75 caratteri: le più lunghe vanno a capo con uno spazio iniziale
const fold = line => {
  const out = []
  let rest = line
  while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ` ${rest.slice(73)}` }
  out.push(rest)
  return out.join('\r\n')
}

// I momenti in cui la persona lavora all'evento: un turno per blocco, oppure (evento solo "aggiunto alla lista") le date dell'evento.
export function eventSlots(ev) {
  if (ev.blocks?.length > 0) {
    return ev.blocks.map(b => (b.startTime && b.endTime
      ? { key: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, phase: b.phase || null }
      : { key: b.id, date: b.date, allDay: true, phase: b.phase || null }))
  }
  const last = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
  if (ev.allDay === false && ev.timeStart) {
    return [{ key: `${ev.id}-${ev.date}`, date: ev.date, endDate: last, startTime: ev.timeStart, endTime: ev.timeEnd || ev.timeStart }]
  }
  return [{ key: `${ev.id}-${ev.date}`, date: ev.date, endDate: last, allDay: true }]
}

// Giorno in cui finisce il turno: un turno notturno (fine ≤ inizio) finisce il giorno dopo; un tutto-il-giorno ha la fine esclusiva.
export const slotEnd = s => {
  if (s.allDay) return addDay(s.endDate || s.date)
  if (s.endDate && s.endDate !== s.date) return s.endDate
  return s.endTime <= s.startTime ? addDay(s.date) : s.date
}

// phaseName(phase) → etichetta tradotta ("Montaggio") o ''. `events` = uno o più eventi; `opts.name` dà un nome al calendario
// (per l'abbonamento) e `opts.subscribe` aggiunge l'intervallo di aggiornamento che i calendari rispettano.
export function buildCalendar(events, phaseName = () => '', opts = {}) {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roadcase//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (opts.name) lines.push(`X-WR-CALNAME:${esc(opts.name)}`)
  if (opts.subscribe) lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H')
  events.forEach(ev => eventSlots(ev).forEach(s => {
    const phase = s.phase ? phaseName(s.phase) : ''
    lines.push('BEGIN:VEVENT', `UID:${s.key}@roadcase.it`, `DTSTAMP:${stamp}`)
    if (s.allDay) lines.push(`DTSTART;VALUE=DATE:${compact(s.date)}`, `DTEND;VALUE=DATE:${compact(slotEnd(s))}`)
    else lines.push(`DTSTART:${compact(s.date)}T${hhmm(s.startTime)}`, `DTEND:${compact(slotEnd(s))}T${hhmm(s.endTime)}`)
    lines.push(`SUMMARY:${esc(phase ? `${phase} · ${ev.name}` : ev.name)}`)
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
    if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`)
    // Promemoria un'ora prima, per i turni con un orario
    if (!s.allDay) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.name)}`, 'TRIGGER:-PT1H', 'END:VALARM')
    lines.push('END:VEVENT')
  }))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export const buildIcs = (ev, phaseName) => buildCalendar([ev], phaseName)
