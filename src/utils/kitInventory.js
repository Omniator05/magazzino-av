import { doc, getDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { deleteEventFromGoogle } from './googleCalendar'
import { todayStr } from './workHours'

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

// Consumabile rientrato "vuoto" (non intero — vedi askConsumableIntact in
// WorkerScanner.jsx): a differenza di un oggetto perso/dimenticato (che
// resta semplicemente "fuori" nella disponibilità, in attesa che qualcuno
// lo ritrovi), un consumabile consumato è sparito per sempre. availableQty
// era già stata scalata al carico (syncKitAwareInventory sign:-1) e non va
// toccata di nuovo qui: serve solo abbassare il TOTALE di magazzino della
// stessa quantità, altrimenti quei pezzi resterebbero "fuori" in eterno
// invece di essere semplicemente finiti. sign:-1 scala il totale (consumato),
// sign:1 lo ripristina (es. annullando un rientro segnato per errore).
export const writeOffConsumable = async ({ catalogItemId, qty, sign = -1 }) => {
  if (!catalogItemId) return
  try {
    const ref = doc(db, 'items', catalogItemId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    await updateDoc(ref, { totalQty: Math.max(0, (data.totalQty || 0) + sign * (qty || 1)) })
  } catch (e) {
    console.error('writeOffConsumable failed', e)
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
// `includeStillOut`: conta anche i pezzi ancora fuori dal magazzino (caricati e non rientrati) a
// prescindere dalle date dell'evento — serve allo Storico, per sapere cosa c'è davvero ADESSO.
// Quando si compone una lista (EventDetail) NON va attivato: lì conta solo se negli stessi giorni
// dell'evento l'oggetto è già in un'altra lista (un pezzo che oggi è fuori ma rientra prima non è
// un conflitto).
export const itemCommittedElsewhere = (catalogItemId, event, otherEvents, { includeStillOut = false } = {}) => {
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
    const stillOut = includeStillOut && rows.some(i => i.loaded && !i.returned)
    const oStart = other.date
    // Un rent/install senza data di fine è occupato a tempo indeterminato, finché non viene chiuso.
    const oEnd = other.dateEnd && other.dateEnd >= other.date ? other.dateEnd : (other.type === 'installation' && !other.archived ? '9999-12-31' : other.date)
    // Caricato vuol dire già fuori dal magazzino, anche se l'evento inizia più
    // avanti (montaggio anticipato, es. venerdì per un evento di lunedì): da
    // quel momento e fino al rientro il pezzo non c'è, quindi l'impegno parte
    // da OGGI se il suo giorno nominale non è ancora arrivato.
    const outSince = stillOut && oStart > todayStr() ? todayStr() : oStart
    const overlaps = stillOut ? evEnd >= outSince : (evStart <= oEnd && evEnd >= oStart)
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
  // Pulisce anche la copia su Google Calendar, se l'evento era stato
  // sincronizzato — prima succedeva solo cancellando da Events.jsx, non da
  // qui (usata anche da Calendar.jsx e Archive.jsx): un evento cancellato
  // da lì restava "orfano" su Google. Unico punto da cui si cancella un
  // evento, così la pulizia vale ovunque senza doverla ripetere.
  deleteEventFromGoogle(event.googleEventId)
}

// Chiude un rent/install: restituisce la giacenza di tutto ciò che risulta
// ancora caricato e non rientrato, poi archivia l'evento — stessa identica
// logica che prima viveva duplicata fra Events.jsx (lista admin) e
// EventDetail.jsx (pagina del singolo evento, ora raggiungibile anche dai
// magazzinieri). Un solo posto da cui tenerla corretta.
// Rent/install con tutto rientrato (esclusi i pezzi segnati mancanti) ma non ancora chiuso:
// solo un admin può chiuderlo, dopo aver verificato che sia davvero tutto a posto.
export const rentReadyToClose = ev => {
  if (!ev || ev.type !== 'installation' || ev.archived) return false
  const rows = (ev.items || []).filter(i => !i.mancante)
  return rows.length > 0 && rows.every(i => i.returned)
}

export const closeInstallationEvent = async (eventId, fallbackItems) => {
  const eventRef = doc(db, 'events', eventId)
  // Transazione invece di scrivere direttamente lo snapshot `items` passato
  // dal chiamante (che può essere stantio — un worker potrebbe star
  // scansionando in quel momento): legge l'array AGGIORNATO da Firestore
  // appena prima di scrivere, così non si rischia di sovrascrivere un
  // rientro appena registrato altrove.
  let stillOut = []
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    const items = snap.exists() ? (snap.data().items || []) : (fallbackItems || [])
    stillOut = items.filter(item => item.loaded && !item.returned)
    // Chiudere il rent/install segna TUTTO come rientrato — altrimenti le
    // righe restano "caricate, non rientrate" per sempre: sembrerebbero
    // ancora fuori anche dopo, con la giacenza già ripristinata sotto.
    const stillOutIds = new Set(stillOut.map(i => i.id))
    const updatedItems = items.map(i => stillOutIds.has(i.id) ? { ...i, returned: true, pronto: true } : i)
    tx.update(eventRef, { items: updatedItems, archived: true })
  })
  // Stessa restituzione del rientro normale: usa l'oggetto di catalogo vero
  // (itemRef || id — le righe di liste diverse/duplicate hanno un id proprio)
  // e riallinea anche i componenti se la riga è un kit. Gli "Extra" restano
  // esclusi dalla giacenza (come nel rientro singolo) — sono comunque già
  // stati segnati rientrati sopra, semplicemente senza una giacenza di
  // catalogo da ripristinare.
  await Promise.all(stillOut
    .filter(item => !item.isExtra)
    .map(item => syncKitAwareInventory({
      catalogItemId: item.itemRef || item.id, isBundle: item.isBundle, category: item.category,
      qty: item.qty, sign: 1,
    })))
}
