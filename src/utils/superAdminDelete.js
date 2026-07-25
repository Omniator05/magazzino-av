import { db, storage } from '../firebase'
import { collection, query, where, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { ref, deleteObject, listAll } from 'firebase/storage'

// Collection scoped by teamId che compongono i dati di una squadra. NON
// include profiles/teams, gestiti a parte in deleteTeamCascade.
const TEAM_SCOPED_COLLECTIONS = [
  'items', 'events', 'tasks', 'templates', 'unavailability', 'vehicles',
  'brasserieWeeks', 'brasserieArtists', 'googleCalendarEvents', 'eventOrganizerContent',
]

async function deleteMatching(collectionName, teamId) {
  const snap = await getDocs(query(collection(db, collectionName), where('teamId', '==', teamId)))
  const docs = snap.docs
  // writeBatch ha un limite di 500 operazioni: si procede a blocchi.
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db)
    docs.slice(i, i + 450).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  return docs
}

async function deleteStorageFolder(path) {
  try {
    const folderRef = ref(storage, path)
    const list = await listAll(folderRef)
    await Promise.all(list.items.map(item => deleteObject(item).catch(() => {})))
  } catch { /* cartella assente o già vuota */ }
}

/**
 * Elimina in modo definitivo TUTTI i dati Firestore/Storage di una squadra:
 * oggetti, eventi, task, template, indisponibilità, furgoni, artisti/settimane
 * brasserie, contenuti organizzatore evento, profili e infine la squadra
 * stessa. Azione irreversibile — va invocata solo dopo doppia conferma
 * (dialog + re-inserimento password) lato chiamante.
 *
 * LIMITE NOTO: gli account Firebase Auth dei membri NON vengono eliminati
 * (richiederebbe l'Admin SDK, non disponibile lato client) — restano "orfani"
 * ma innocui: senza un profilo Firestore non possono più accedere a nulla.
 */
export async function deleteTeamCascade(teamId) {
  let deletedDocs = 0

  for (const col of TEAM_SCOPED_COLLECTIONS) {
    const docs = await deleteMatching(col, teamId)
    deletedDocs += docs.length
    if (col === 'brasserieArtists') {
      // Logo dei singoli artisti, ognuno nel proprio path di Storage
      await Promise.all(
        docs
          .map(d => d.data().storagePath)
          .filter(Boolean)
          .map(p => deleteObject(ref(storage, p)).catch(() => {}))
      )
    }
  }

  deletedDocs += (await deleteMatching('profiles', teamId)).length

  await deleteStorageFolder(`teamLogos/${teamId}`)
  await deleteDoc(doc(db, 'teams', teamId))

  return deletedDocs
}
