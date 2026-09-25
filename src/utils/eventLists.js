import { ensureInstanceList, reconcileInstanceNumbers } from './kitInstances'

// Liste di carico multiple per evento. `event.items` resta UN array piatto
// (tutto il resto dell'app — disponibilità, "da scaricare", storico oggetto,
// sync giacenza — continua a leggerlo così), ogni riga porta solo un
// `listId`. La lista principale è implicita: le righe senza `listId` (tutti
// gli eventi creati prima di questa funzione) ci appartengono, quindi
// nessuna migrazione. `event.lists` contiene SOLO le liste aggiuntive
// ({ id, name }); il nome della principale, se personalizzato, sta in
// `event.mainListName`.
export const MAIN_LIST_ID = 'main'

export const rowListId = row => row?.listId || MAIN_LIST_ID

// Sempre con la principale per prima. `name` vuoto = la UI mostra il nome
// predefinito tradotto ("Lista principale").
export const getEventLists = event => [
  { id: MAIN_LIST_ID, name: event?.mainListName || '' },
  ...((event?.lists || []).map(l => ({ id: l.id, name: l.name || '' }))),
]

export const hasMultipleLists = event => (event?.lists || []).length > 0

export const newListId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

// Id della riga nell'array piatto. Nella lista principale resta l'id del
// catalogo (compatibilità con tutto il codice esistente); nelle altre è
// unico per lista, così due righe dello stesso oggetto in liste diverse non
// si confondono mai — stessa convenzione delle righe duplicate "_extra_"/"_ret_":
// `row.id` identifica la RIGA, `row.itemRef || row.id` l'oggetto di catalogo.
export const listRowId = (catalogId, listId) =>
  (!listId || listId === MAIN_LIST_ID) ? catalogId : `${catalogId}__${listId}`

// Sposta una riga in un'altra lista tenendo l'id univoco nell'evento.
// takenIds (Set, opzionale) = id già presenti nell'evento: se il nuovo id
// collide (es. lo stesso oggetto spostato due volte nella stessa lista) si
// aggiunge un suffisso casuale, e l'id scelto viene registrato nel Set.
export const moveRowToList = (row, listId, takenIds) => {
  const target = listId === MAIN_LIST_ID ? undefined : listId
  const { listId: _old, ...rest } = row
  if (row.isExtra || row.itemRef) {
    // id già univoco per costruzione (extra-…, …_extra_…, …_ret_…, …__lista)
    return target ? { ...rest, listId: target } : rest
  }
  if (!target) return rest
  let id = listRowId(row.id, target)
  if (takenIds) {
    while (takenIds.has(id)) id = `${id}_${Math.random().toString(36).slice(2, 5)}`
    takenIds.add(id)
  }
  return { ...rest, id, itemRef: row.id, listId: target }
}

// Baule/i di un kit da assegnare a una nuova riga, evitando quelli già presi
// da altre righe dello stesso kit nello stesso evento (es. in un'altra
// lista). Se i liberi non bastano si ripiega su tutti: meglio un baule
// condiviso che una riga senza assegnazione.
export const pickInstanceNumbers = (instances, totalQty, qty, usedNumbers = []) => {
  const all = ensureInstanceList(instances, totalQty ?? qty)
  const used = new Set(usedNumbers)
  const free = all.filter(i => !used.has(i.number))
  return reconcileInstanceNumbers(free.length >= qty ? free : all, [], qty)
}

// Righe dell'evento a cui può riferirsi una scansione di un oggetto di
// catalogo. Come sempre: la riga con id = id di catalogo (lista principale),
// più le righe delle liste aggiuntive (itemRef = catalogo + listId). Restano
// FUORI le righe duplicate "_extra_" (mancanti) e "_ret_" (rientro parziale),
// che lo scanner non ha mai considerato: si toccano solo dai loro bottoni.
export const isScanCandidate = (row, catalogId) =>
  !row.isExtra && (row.id === catalogId || (!!row.listId && row.itemRef === catalogId && !/_(extra|ret)_/.test(row.id)))

// Sceglie LA riga su cui agire per una scansione, quando lo stesso oggetto
// compare in più liste dello stesso evento. Priorità: riga con l'unità
// scansionata (kit/pezzi numerati) > non ancora fatta nella fase corrente >
// nella lista attiva > non "mancante" > ordine originale. Se la riga è una
// sola, è quella (comportamento invariato di sempre).
export const resolveScanRow = (rows, catalogId, { mode, unitNumber, activeListId }) => {
  const cands = rows.map((row, idx) => ({ row, idx })).filter(({ row }) => isScanCandidate(row, catalogId))
  if (cands.length <= 1) return cands[0]?.row || null
  const doneField = mode === 'pronto' ? 'pronto' : mode === 'load' ? 'loaded' : 'returned'
  const unit = unitNumber ? parseInt(unitNumber, 10) : null
  const score = ({ row }) => {
    let sc = 0
    if (unit && (row.instanceNumbers || []).length > 0 && !row.instanceNumbers.includes(unit)) sc += 8
    if (row[doneField] || (mode === 'return' && !row.loaded)) sc += 4
    if (rowListId(row) !== activeListId) sc += 2
    if (row.mancante) sc += 1
    return sc
  }
  cands.sort((a, b) => score(a) - score(b) || a.idx - b.idx)
  return cands[0].row
}

// Righe di un evento (es. dall'archivio) da riusare come lista di partenza di
// un evento NUOVO: tutto lo stato di avanzamento riparte da zero (pronto,
// caricato, rientrato, mancante, "dimenticato", bauli già scansionati), mentre
// la struttura resta (oggetti, quantità, note, furgone, bauli assegnati,
// liste). Le righe create dal rientro parziale ("_ret_") sono un pezzo della
// riga d'origine: si riuniscono a lei invece di restare come doppioni.
export const freshRowsFromEvent = (rows) => {
  const list = (rows || []).map(r => ({ ...r }))
  const retRows = list.filter(r => /_ret_/.test(r.id))
  retRows.forEach(ret => {
    const parent = list.find(r => r.id === ret.id.split('_ret_')[0])
    if (parent) parent.qty = (parent.qty || 1) + (ret.qty || 1)
  })
  return list
    .filter(r => !(retRows.includes(r) && list.some(p => p.id === r.id.split('_ret_')[0])))
    .map(({ pronto, loaded, returned, mancante, returnedConsumed, scannedInstances, ...rest }) => ({
      ...rest, pronto: false, loaded: false, returned: false, mancante: false,
    }))
}
