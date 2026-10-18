// Segnalazioni per singolo pezzo di un oggetto di magazzino (es. "pointe n° 7
// su 24: la porta non funziona"). Vivono in `items/{id}.issues` come elenco di
// { id, type: 'broken' | 'defect', unit: numero | null, note, at } e sono solo
// DESCRITTIVE: i numeri che contano per la giacenza restano brokenQty/defectQty
// (vedi Inventory.jsx). Queste funzioni mantengono i due allineati.

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const countIssues = (issues, type) => (issues || []).filter(i => i.type === type).length

// Aggiunge una segnalazione. Un pezzo numerato ha una sola segnalazione alla
// volta: se esiste già per lo stesso numero viene sostituita (es. da "difetto"
// a "rotto") invece di duplicarsi.
export function addIssue(issues, { type, unit, note }) {
  const u = unit == null || unit === '' ? null : Math.max(1, parseInt(unit, 10) || 1)
  const rest = u == null ? (issues || []) : (issues || []).filter(i => i.unit !== u)
  return [...rest, { id: newId(), type, unit: u, note: (note || '').trim(), at: Date.now() }]
}

export const removeIssueById = (issues, id) => (issues || []).filter(i => i.id !== id)

// Toglie la segnalazione più recente di un tipo (quando si segna "riparato" un
// pezzo senza dire quale: si assume l'ultimo segnalato).
export function dropLastIssue(issues, type) {
  const list = issues || []
  let idx = -1
  list.forEach((i, k) => { if (i.type === type) idx = k })
  return idx === -1 ? list : list.filter((_, k) => k !== idx)
}

// Se i contatori scendono sotto il numero di segnalazioni (es. dalla modifica
// con i +/−), le segnalazioni più vecchie in eccesso vengono scartate.
export function trimIssues(issues, brokenQty, defectQty) {
  const limits = { broken: Math.max(0, brokenQty || 0), defect: Math.max(0, defectQty || 0) }
  const sorted = [...(issues || [])].sort((a, b) => (b.at || 0) - (a.at || 0))
  const kept = new Set()
  const seen = { broken: 0, defect: 0 }
  sorted.forEach(i => {
    if (seen[i.type] < (limits[i.type] ?? 0)) { seen[i.type]++; kept.add(i.id) }
  })
  return (issues || []).filter(i => kept.has(i.id))
}

// Ordinate per numero di pezzo (quelle senza numero in coda).
export const sortedIssues = issues => [...(issues || [])].sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity) || (a.at || 0) - (b.at || 0))
