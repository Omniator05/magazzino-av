import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Aggiorna la giacenza (availableQty) al cambio di stato carico/rientro di
// una riga evento. Se l'oggetto è un kit/bundle, aggiorna anche ogni
// componente — i componenti hanno una giacenza propria che conta anche fuori
// dal kit (es. quanti microfoni singoli sono liberi a prescindere dai kit),
// quindi non basta muovere solo la giacenza del kit nel suo insieme.
//
// sign: +1 restituisce disponibilità (rientro, o annulla un carico segnato
// per errore), -1 la toglie (carico, o annulla un rientro segnato per errore).
export const syncKitAwareInventory = async ({ catalogItemId, isBundle, category, qty, sign }) => {
  if (!catalogItemId) return
  try {
    const ref = doc(db, 'items', catalogItemId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const rowQty = qty || 1

    if (isBundle || category === 'Kit') {
      const components = data.components || []
      for (const comp of components) {
        try {
          const compRef = doc(db, 'items', comp.itemId)
          const compSnap = await getDoc(compRef)
          if (!compSnap.exists()) continue
          const compData = compSnap.data()
          const delta = sign * comp.qty * rowQty
          const maxAvail = (compData.totalQty || 0) - (compData.brokenQty || 0)
          await updateDoc(compRef, { availableQty: Math.max(0, Math.min(maxAvail, (compData.availableQty || 0) + delta)) })
        } catch (e) { console.error(e) }
      }
      const delta = sign * rowQty
      await updateDoc(ref, { availableQty: Math.max(0, Math.min(data.totalQty || 999, (data.availableQty || 0) + delta)) })
      return
    }

    const delta = sign * rowQty
    const maxAvail = (data.totalQty || 0) - (data.brokenQty || 0)
    await updateDoc(ref, { availableQty: Math.max(0, Math.min(maxAvail, (data.availableQty || 0) + delta)) })
  } catch (e) {
    console.error('syncKitAwareInventory failed', e)
  }
}

// Una riga evento "riguarda" un dato oggetto di magazzino se lo referenzia
// direttamente (id/itemRef), OPPURE se la riga è un kit e quell'oggetto è
// uno dei suoi componenti — la giacenza del componente si riduce insieme a
// quella del kit (vedi syncKitAwareInventory sopra) ma la riga evento porta
// solo l'id del kit, mai quello dei singoli componenti. Senza questo, la
// pagina Magazzino non risale più all'evento che ha causato la riduzione di
// un componente, e lo mostra come "ridotto manualmente" pur essendo dovuto
// a un kit caricato regolarmente. catalogItems è il catalogo (items.jsx),
// serve a leggere la composizione ATTUALE del kit (row.components è solo lo
// snapshot congelato al momento in cui la riga fu aggiunta all'evento).
export const eventRowIncludesItem = (row, itemId, catalogItems) => {
  if (row.id === itemId || row.itemRef === itemId) return true
  if (row.isBundle || row.category === 'Kit') {
    const kitCatalog = catalogItems?.find(x => x.id === (row.itemRef || row.id))
    const components = kitCatalog?.components || row.components || []
    return components.some(c => c.itemId === itemId)
  }
  return false
}

// Quanto di un oggetto è già impegnato su ALTRI eventi le cui date si
// sovrappongono a questo — a prescindere dal fatto che sia già stato
// caricato fisicamente o no (quello lo copre già availableQty/lo scanner,
// questo è un controllo "in fase di pianificazione", per accorgersi di un
// doppio impegno PRIMA del giorno del carico, non quando è già tardi).
// Stesso principio di isVehicleUnavailable/isWorkerUnavailable in
// workerAssignment.js, ma quantità-consapevole invece che booleano — un
// oggetto ha più unità, un furgone/worker no. Non scende nei componenti dei
// kit (stesso motivo di isVehicleUnavailable: un controllo di primo livello,
// non serve replicare la logica di eventRowIncludesItem qui).
export const itemCommittedElsewhere = (catalogItemId, event, otherEvents) => {
  const result = { qty: 0, events: [] }
  if (!catalogItemId || !event?.date) return result
  const evStart = event.date
  const evEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  otherEvents.forEach(other => {
    if (other.id === event.id || !other.date) return
    const rows = (other.items || []).filter(i => !i.isExtra && (i.itemRef || i.id) === catalogItemId)
    if (rows.length === 0) return
    // Una riga ancora caricata e non rientrata è fisicamente fuori ORA, a
    // prescindere dalla dateEnd nominale dell'evento — che può mancare del
    // tutto (un'installazione a tempo indeterminato, "finché non la
    // rimuovo") o essere già passata senza che il rientro sia stato ancora
    // segnato (rientro dimenticato). In entrambi i casi collassare
    // l'occupazione a un solo giorno (il vecchio comportamento) la faceva
    // sparire dal controllo non appena quel giorno non era più "oggi" — qui
    // resta aperta finché non risulta rientrata.
    const stillOut = rows.some(i => i.loaded && !i.returned)
    const oStart = other.date
    const oEnd = other.dateEnd && other.dateEnd >= other.date ? other.dateEnd : other.date
    const overlaps = stillOut ? evEnd >= oStart : (evStart <= oEnd && evEnd >= oStart)
    if (!overlaps) return
    const rowQty = rows.reduce((s, i) => s + (i.qty || 1), 0)
    if (rowQty > 0) {
      result.qty += rowQty
      result.events.push({ id: other.id, name: other.name, qty: rowQty })
    }
  })
  return result
}

// Righe di un evento ancora "fuori" (caricate, mai rientrate) — la giacenza
// di questi oggetti è scalata e nessun'altra azione la restituirà mai se
// l'evento viene eliminato così com'è: vanno gestite esplicitamente prima
// della cancellazione (vedi restoreEventInventory sotto).
export const getUnreturnedLoadedItems = (event) =>
  (event?.items || []).filter(i => i.loaded && !i.returned && !i.isExtra)

// Da chiamare PRIMA di eliminare un evento se l'admin sceglie "resetta
// giacenza" invece di "segna come mancanti": restituisce disponibilità per
// ogni riga ancora fuori, come se fosse rientrata regolarmente. Se invece si
// sceglie "segna come mancanti" non va chiamata affatto — la giacenza resta
// scalata, stessa logica già usata per i consumabili "consumati"/il rientro
// forzato dello scanner (l'oggetto è considerato perso, non torna disponibile).
export const restoreEventInventory = async (event) => {
  const unreturned = getUnreturnedLoadedItems(event)
  await Promise.all(unreturned.map(i => syncKitAwareInventory({
    catalogItemId: i.itemRef || i.id, isBundle: i.isBundle, category: i.category,
    qty: i.qty, sign: 1,
  })))
}

// Unico punto da cui eliminare un evento (Calendar/Archive/Events): se ci
// sono ancora righe fuori non rientrate, chiede PRIMA come trattarne la
// giacenza — altrimenti l'eliminazione da sola lascerebbe quella giacenza
// scalata per sempre, senza più nessuna riga da cui farla rientrare. Il
// "sei sicuro di voler eliminare l'evento?" resta a carico del chiamante
// (testo diverso da pagina a pagina): questa funzione presume che sia già
// stato confermato.
export const deleteEventWithInventoryCheck = async ({ event, confirm, t }) => {
  const unreturned = getUnreturnedLoadedItems(event)
  if (unreturned.length > 0) {
    const reset = await confirm({
      title: t('common.unreturnedItemsTitle'),
      message: t('common.unreturnedItemsMessage', { count: unreturned.length }),
      cancelLabel: t('common.markAsMissingLabel'),
      confirmLabel: t('common.resetStockLabel'),
    })
    if (reset) await restoreEventInventory(event)
  }
  await deleteDoc(doc(db, 'events', event.id))
}

// Chiude un rent/install: restituisce la giacenza di tutto ciò che risulta
// ancora caricato e non rientrato, poi archivia l'evento — stessa identica
// logica che prima viveva duplicata fra Events.jsx (lista admin) e
// EventDetail.jsx (pagina del singolo evento, ora raggiungibile anche dai
// magazzinieri). Un solo posto da cui tenerla corretta.
export const closeInstallationEvent = async (eventId, items) => {
  // Stessa restituzione del rientro normale: usa l'oggetto di catalogo vero
  // (itemRef || id — le righe di liste diverse/duplicate hanno un id proprio)
  // e riallinea anche i componenti se la riga è un kit.
  await Promise.all((items || [])
    .filter(item => item.loaded && !item.returned && !item.isExtra)
    .map(item => syncKitAwareInventory({
      catalogItemId: item.itemRef || item.id, isBundle: item.isBundle, category: item.category,
      qty: item.qty, sign: 1,
    })))
  await updateDoc(doc(db, 'events', eventId), { archived: true })
}
