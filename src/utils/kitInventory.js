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
