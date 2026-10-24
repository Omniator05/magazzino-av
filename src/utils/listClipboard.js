// "Copia e incolla" di oggetti tra liste di carico (admin, EventDetail → Seleziona → Copia, poi
// "Incolla" nella lista di destinazione, anche di un altro evento). Si salva in localStorage così
// resta disponibile cambiando pagina; scade dopo un giorno. Si copiano solo i dati che servono a
// ricomporre la riga (oggetto di catalogo e quantità): lo stato di carico/rientro non viaggia.
const KEY = 'rcListClipboard'
const MAX_AGE_MS = 24 * 3600 * 1000

export function writeListClipboard(event, rows) {
  const clean = rows.map(r => r.isExtra
    ? { extra: true, name: r.name, qty: r.qty || 1, notes: r.notes || '' }
    : { id: r.itemRef || r.id, name: r.name, qty: r.qty || 1 })
  const data = { fromEventId: event.id, fromEventName: event.name || '', at: Date.now(), rows: clean }
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* nessun problema: vale solo per questa sessione */ }
  return data
}

export function readListClipboard() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return null
    if (Date.now() - (data.at || 0) > MAX_AGE_MS) { localStorage.removeItem(KEY); return null }
    return data
  } catch { return null }
}

export function clearListClipboard() {
  try { localStorage.removeItem(KEY) } catch { /* nessun problema */ }
}
