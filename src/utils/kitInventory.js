import { doc, getDoc, updateDoc } from 'firebase/firestore'
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
