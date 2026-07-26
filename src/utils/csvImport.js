// Parser CSV minimale (RFC4180): gestisce campi tra virgolette con virgole e
// virgolette doppie incluse — lo stesso formato che esportCSV già scrive.
// Niente libreria esterna: il formato è semplice e il parsing sta in poche righe.
export function parseCSV(text) {
  const clean = text.replace(/^﻿/, '') // BOM UTF-8, lo scriviamo anche noi in export
  const rows = []
  let row = [], field = '', inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        const next = clean[i + 1]
        if (next === '"') { field += '"'; i++ }
        else if (next === ',' || next === '\r' || next === '\n' || next === undefined) { inQuotes = false }
        // Virgoletta isolata non correttamente doppiata nel file originale
        // (tipico per misure in pollici tipo 12"): la trattiamo come testo
        // letterale invece di rompere il parsing per il resto del file —
        // altrimenti una singola riga malformata mischia tutte le righe
        // successive in un unico campo enorme.
        else field += '"'
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\r') {
      // ignorato, gestito da \n
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter(r => r.some(v => v.trim() !== ''))
}

// Alias riconosciuti per ogni colonna — case-insensitive, IT/EN, e le
// etichette che il nostro stesso "Esporta CSV" genera, così una lista
// esportata da qui si può reimportare senza modifiche.
const COLUMN_ALIASES = {
  name:     ['nome', 'name', 'oggetto', 'articolo', 'item'],
  category: ['categoria', 'category'],
  brand:    ['marca', 'brand', 'produttore', 'manufacturer'],
  model:    ['modello', 'model'],
  qty:      ['quantità totale', 'quantita totale', 'quantità', 'quantita', 'qty', 'quantity', 'pezzi', 'q.ta'],
  location: ['posizione', 'location', 'ubicazione'],
  notes:    ['note', 'notes', 'appunti'],
}

function findColumn(headerRow, keys) {
  const norm = s => s.trim().toLowerCase()
  const headers = headerRow.map(norm)
  for (const key of keys) {
    const idx = headers.indexOf(norm(key))
    if (idx !== -1) return idx
  }
  return -1
}

/**
 * Converte le righe già parsate (parseCSV) in oggetti pronti per Firestore.
 * Ritorna { items, warnings } oppure lancia un errore con `.code` se manca
 * la colonna obbligatoria (nome).
 */
export function mapRowsToItems(rows, knownCategories) {
  if (rows.length < 2) {
    const err = new Error('empty'); err.code = 'empty'; throw err
  }
  const [header, ...dataRows] = rows
  const col = {}
  for (const key in COLUMN_ALIASES) col[key] = findColumn(header, COLUMN_ALIASES[key])

  if (col.name === -1) {
    const err = new Error('no-name-column'); err.code = 'no-name-column'; throw err
  }

  const catLookup = new Map(knownCategories.map(c => [c.toLowerCase(), c]))
  let categoryFallbacks = 0
  let qtyFallbacks = 0
  let malformedRows = 0

  const items = dataRows
    .map(r => {
      // Riga con un numero di colonne diverso dall'intestazione: quasi sempre
      // un campo con virgolette non chiuse correttamente nel file originale.
      // Saltiamo la riga invece di indovinare valori nelle colonne sbagliate
      // (es. codice articolo finito nella colonna posizione).
      if (r.length !== header.length) { malformedRows++; return null }

      const name = (r[col.name] || '').trim()
      if (!name) return null

      const rawCategory = col.category !== -1 ? (r[col.category] || '').trim() : ''
      const matchedCategory = catLookup.get(rawCategory.toLowerCase())
      if (rawCategory && !matchedCategory) categoryFallbacks++

      const rawQty = col.qty !== -1 ? parseInt(r[col.qty], 10) : NaN
      const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1
      if (!Number.isFinite(rawQty) || rawQty <= 0) qtyFallbacks++

      return {
        name,
        category: matchedCategory || 'Altro',
        brand: col.brand !== -1 ? (r[col.brand] || '').trim() : '',
        model: col.model !== -1 ? (r[col.model] || '').trim() : '',
        totalQty: qty,
        location: col.location !== -1 ? (r[col.location] || '').trim() : '',
        notes: col.notes !== -1 ? (r[col.notes] || '').trim() : '',
      }
    })
    .filter(Boolean)

  const skippedEmptyName = dataRows.length - items.length - malformedRows

  return { items, warnings: { categoryFallbacks, qtyFallbacks, skippedEmptyName, malformedRows } }
}
