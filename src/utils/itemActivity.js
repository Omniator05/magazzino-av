import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Cronologia "chi ha fatto cosa" su un oggetto della lista di carico —
// collection piatta (non sotto-collection di events, questa app non ne usa
// altrove) con teamId, così le firestore.rules generiche la coprono già
// senza bisogno di regole dedicate. Un documento per azione, mai aggiornato:
// è un registro, non uno stato.
//
// catalogItemId è l'oggetto VERO di magazzino (itemRef || id della riga
// evento — per le righe "Extra" senza corrispondenza in magazzino resta
// null): permette di vedere, dalla scheda dell'oggetto in Magazzino, tutto
// il suo percorso attraverso TUTTI gli eventi in cui è comparso, non solo
// quello corrente — la lista di carico di un singolo evento è per forza
// temporanea (l'oggetto può esserne rimosso), la scheda magazzino no.
export const logItemActivity = async ({ teamId, eventId, eventName, itemId, itemName, catalogItemId, action, profile, userId }) => {
  try {
    await addDoc(collection(db, 'itemActivity'), {
      teamId,
      eventId,
      eventName: eventName || '',
      itemId,
      itemName: itemName || '',
      catalogItemId: catalogItemId || null,
      action,
      userId: userId || null,
      userName: profile?.name || profile?.username || null,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    // Mai far fallire l'azione principale (aggiunta/carico/...) solo perché
    // non si è riusciti a registrare la cronologia.
    console.error('logItemActivity failed', e)
  }
}
