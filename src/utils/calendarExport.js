// "Aggiungi al calendario" per chi vede un evento assegnato (Freelance): abbonamento al proprio calendario Roadcase (apre l'app
// Calendario e si aggiorna da solo), file .ics del singolo evento e link per Google Calendar. La costruzione dei file sta in
// api/_calendarIcs.js (condivisa con il server).
import { eventSlots, slotEnd, compact, hhmm, buildIcs } from '../../api/_calendarIcs.js'

// Scarica il file .ics del singolo evento. Da una PWA su iPhone può restare nei file scaricati senza aprire Calendario: per quello c'è l'abbonamento.
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
