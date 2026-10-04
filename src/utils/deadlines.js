import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { pushEventToGoogle, deleteEventFromGoogle } from './googleCalendar'

// Scadenze libere (furgoni e oggetti di magazzino): ogni voce è
// { id, label, date } — label a scelta libera (per i furgoni la UI propone
// "Assicurazione/Revisione/Bollo" come scorciatoie, ma resta testo libero,
// stessa struttura per entrambi). `id` locale, mai scritto altrove, serve
// solo a tenere ferme le righe nella UI e a far da chiave per collegare
// l'evento di calendario (vedi syncDeadlineEvents).
export const newDeadline = (label = '') => ({
  id: `dl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  label, date: '',
})

// Giorni di anticipo con cui una scadenza compare nel promemoria — vedi
// DeadlineReminderModal.jsx.
export const DEADLINE_WARNING_DAYS = 30

// Crea/aggiorna/cancella gli eventi di calendario collegati alle scadenze di
// un furgone/oggetto, confrontando l'elenco prima e dopo il salvataggio.
// Stesso pattern già in uso per googleEventId (vedi api/push-event-to-google.js):
// l'id dell'evento Roadcase resta scritto sulla scadenza stessa (eventId),
// così un salvataggio successivo aggiorna lo STESSO evento invece di
// duplicarlo, e togliere/svuotare una scadenza cancella anche il promemoria
// in calendario — niente eventi orfani.
//
// Ogni evento creato qui ha `isDeadlineReminder: true`: non cambia dove
// compare (calendario, elenco eventi, PDF se mai stampato — è un evento
// Roadcase a tutti gli effetti, incluso il push su Google Calendar se
// collegato), serve solo come aggancio per filtrarli in futuro se servisse.
//
// Va chiamata DOPO aver scritto furgone/oggetto (serve l'id vero del
// soggetto solo per il nome dell'evento, non per altro) — ritorna il nuovo
// array `deadlines` con gli `eventId` aggiornati, da riscrivere sul
// documento furgone/oggetto.
export async function syncDeadlineEvents(oldDeadlines, newDeadlines, { subjectName, teamId, userId }) {
  const oldById = new Map((oldDeadlines || []).map(d => [d.id, d]))
  const result = []
  for (const d of newDeadlines) {
    const label = (d.label || '').trim()
    const date = d.date || ''
    if (!label || !date) { result.push({ ...d, eventId: null }); continue }
    const prev = oldById.get(d.id)
    const name = `${label} — ${subjectName}`
    const unchanged = prev && prev.label === label && prev.date === date && prev.eventId
    if (unchanged) { result.push(d); continue }
    if (prev?.eventId) {
      try {
        await updateDoc(doc(db, 'events', prev.eventId), { name, date, updatedAt: serverTimestamp() })
        pushEventToGoogle(prev.eventId)
        result.push({ ...d, eventId: prev.eventId })
      } catch (e) {
        // L'evento potrebbe essere stato cancellato a mano dal calendario —
        // ne creiamo uno nuovo sotto invece di perdere la scadenza.
        result.push({ ...d, eventId: null })
      }
    } else {
      const ref = await addDoc(collection(db, 'events'), {
        name, date, dateEnd: null, location: '', notes: '', type: 'event',
        recurrence: 'never', seriesId: null, phases: {},
        items: [], lists: [], mainListName: '', isDeadlineReminder: true,
        teamId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: userId,
      })
      pushEventToGoogle(ref.id)
      result.push({ ...d, eventId: ref.id })
    }
  }
  // Scadenze tolte dalla lista (c'erano prima, non ci sono più ora): cancella il promemoria collegato.
  const newIds = new Set(newDeadlines.map(d => d.id))
  for (const old of (oldDeadlines || [])) {
    if (!newIds.has(old.id) && old.eventId) {
      deleteDoc(doc(db, 'events', old.eventId)).catch(() => {})
      deleteEventFromGoogle(old.eventId)
    }
  }
  return result
}

const addDays = (ymd, days) => {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Scadenze entro la finestra di avviso (o già passate) tra una lista di
// "soggetti" (furgoni e/o oggetti) — usata da DeadlineReminderModal.
// subjects: [{ id, name, kind:'vehicle'|'item', deadlines }]
export function collectUpcomingDeadlines(subjects, todayStr, warningDays = DEADLINE_WARNING_DAYS) {
  const warnStr = addDays(todayStr, warningDays)
  const out = []
  for (const s of subjects) {
    for (const d of (s.deadlines || [])) {
      if (!d.date || !(d.label || '').trim()) continue
      if (d.date <= warnStr) {
        out.push({ subjectId: s.id, subjectName: s.name, subjectKind: s.kind, label: d.label, date: d.date, overdue: d.date < todayStr })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
