// "Aggiungi al calendario" per chi vede un evento assegnato (Freelance): un file .ics (si apre in Calendario su iPhone/Mac,
// in Outlook e nella maggior parte delle app) e un link per Google Calendar. Gli orari sono "flottanti" (senza fuso): il
// calendario del telefono li mostra con lo stesso orario scritto in Roadcase, come per chi li ha assegnati.
// `ev` ha la forma pubblica di api/_guest.js (name, date, dateEnd, allDay, timeStart, timeEnd, location, notes, blocks).

const compact = d => String(d).replaceAll('-', '')
const hhmm = t => `${String(t).replace(':', '')}00`
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
const slotEnd = s => {
  if (s.allDay) return addDay(s.endDate || s.date)
  if (s.endDate && s.endDate !== s.date) return s.endDate
  return s.endTime <= s.startTime ? addDay(s.date) : s.date
}

// phaseName(phase) → etichetta tradotta ("Montaggio") o ''.
export function buildIcs(ev, phaseName = () => '') {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roadcase//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  eventSlots(ev).forEach(s => {
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
  })
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// Scarica il file: su iPhone e Mac si apre direttamente "Aggiungi a Calendario".
export function downloadIcs(ev, phaseName) {
  const blob = new Blob([buildIcs(ev, phaseName)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${String(ev.name || 'evento').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'evento'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// Link "nuovo evento" di Google Calendar: ne supporta uno alla volta, quindi il primo turno (o l'evento intero).
export function googleCalendarUrl(ev, phaseName = () => '') {
  const s = eventSlots(ev)[0]
  const phase = s.phase ? phaseName(s.phase) : ''
  const dates = s.allDay
    ? `${compact(s.date)}/${compact(slotEnd(s))}`
    : `${compact(s.date)}T${hhmm(s.startTime)}/${compact(slotEnd(s))}T${hhmm(s.endTime)}`
  const q = new URLSearchParams({ action: 'TEMPLATE', text: phase ? `${phase} · ${ev.name}` : ev.name, dates })
  if (ev.location) q.set('location', ev.location)
  if (ev.notes) q.set('details', ev.notes)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}
