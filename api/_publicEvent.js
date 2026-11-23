// Forma "pubblica" di un evento per le persone esterne (Freelance): vedi _freelance.js, che la usa per la
// sua vista e per l'abbonamento al calendario. Prima viveva in _guest.js insieme ai link ospite (eliminati).
// Solo i campi che servono a una persona esterna (il Freelance): niente contatti, costi, note interne
// dell'admin o altri membri della squadra.
export function publicEvent(ev, blocks) {
  const lists = [{ id: 'main', name: ev.mainListName || '' }, ...((ev.lists || []).map(l => ({ id: l.id, name: l.name || '' })))]
  return {
    id: ev.id,
    name: ev.name || '',
    date: ev.date || null,
    dateEnd: ev.dateEnd || null,
    allDay: ev.allDay !== false,
    timeStart: ev.timeStart || null,
    timeEnd: ev.timeEnd || null,
    location: ev.location || '',
    notes: ev.notes || '',
    type: ev.type || 'event',
    phases: ev.phases || {},
    phaseTimes: ev.phaseTimes || {},
    lists,
    items: (ev.items || []).filter(i => !i.mancante).map(i => ({
      id: i.id, name: i.name || '', qty: i.qty || 1, category: i.category || '',
      location: i.location || '', listId: i.listId || 'main', eventNote: i.eventNote || '',
      pronto: !!i.pronto, loaded: !!i.loaded, returned: !!i.returned,
    })),
    blocks: blocks.map(b => ({
      id: b.id, date: b.date, startTime: b.startTime || null, endTime: b.endTime || null, phase: b.phase || null,
    })),
  }
}
