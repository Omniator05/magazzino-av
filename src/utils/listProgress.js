// Avanzamento di una lista di carico, calcolato allo stesso modo ovunque (Eventi, Dashboard, Calendario). Ogni stadio
// comprende quelli prima: un oggetto caricato conta anche come pronto, uno rientrato anche come caricato e pronto. Prima
// il Calendario contava solo i flag "pronto", e una lista segnata come caricata senza quel flag risultava ferma a "Pronto".
// stage = lo stadio più avanzato raggiunto da almeno un oggetto.
export function listProgress(items = []) {
  const total = items.length
  const returned = items.filter(i => i.returned).length
  const loaded = items.filter(i => i.loaded || i.returned).length
  const ready = items.filter(i => i.pronto || i.loaded || i.returned).length
  const stage = total === 0 ? 'empty' : returned > 0 ? 'returned' : loaded > 0 ? 'loaded' : ready > 0 ? 'ready' : 'inList'
  return { total, ready, loaded, returned, stage }
}
