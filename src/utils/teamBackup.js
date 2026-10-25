import { collection, getDocs, getDoc, query, where, doc } from 'firebase/firestore'
import { db } from '../firebase'

// Backup dei dati della squadra, fatto dal browser dell'admin: legge le raccolte della squadra
// (le stesse che l'app già legge, con i permessi dell'admin) e le raccoglie in un file JSON.
// Cosa NON contiene: le password e gli account di accesso (stanno in Firebase Authentication), i
// file caricati (logo, foto: si tiene solo il loro indirizzo) e i segreti del server (integrazioni).
// Gli id dei documenti restano quelli originali, così il file serve anche per ripristinare.
export const BACKUP_COLLECTIONS = [
  'items', 'events', 'vehicles', 'externalVehicles', 'externalWorkers', 'tasks', 'templates',
  'unavailability', 'assignmentBlocks', 'timeEntries', 'itemActivity', 'eventManagers',
  'googleCalendarEvents', 'brasserieWeeks', 'brasserieArtists', 'eventOrganizerContent',
]

const LAST_KEY = teamId => `rcLastBackup_${teamId}`

export function lastBackupAt(teamId) {
  try { const v = localStorage.getItem(LAST_KEY(teamId)); return v ? new Date(v) : null } catch { return null }
}

// Date di Firestore → { __ts: ISO } (riconoscibile al ripristino); il resto passa invariato.
function plain(value) {
  if (value == null) return value
  if (typeof value.toDate === 'function') return { __ts: value.toDate().toISOString() }
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
  return value
}

export async function exportTeamBackup(teamId, onProgress = () => {}) {
  const data = {}
  const counts = {}
  const skipped = []

  // Profili (persone della squadra) e documento squadra
  onProgress({ name: 'profiles', done: false })
  const profSnap = await getDocs(query(collection(db, 'profiles'), where('teamId', '==', teamId)))
  data.profiles = profSnap.docs.map(d => ({ id: d.id, ...plain(d.data()) }))
  counts.profiles = data.profiles.length
  onProgress({ name: 'profiles', done: true, count: counts.profiles })

  const teamSnap = await getDoc(doc(db, 'teams', teamId))
  data.team = teamSnap.exists() ? { id: teamSnap.id, ...plain(teamSnap.data()) } : null

  for (const name of BACKUP_COLLECTIONS) {
    onProgress({ name, done: false })
    try {
      const snap = await getDocs(query(collection(db, name), where('teamId', '==', teamId)))
      data[name] = snap.docs.map(d => ({ id: d.id, ...plain(d.data()) }))
      counts[name] = data[name].length
      onProgress({ name, done: true, count: counts[name] })
    } catch (e) {
      // Una raccolta che non si può leggere non deve far fallire tutto il backup.
      skipped.push(name)
      onProgress({ name, done: true, count: 0, skipped: true })
    }
  }

  const meta = {
    app: 'Roadcase', format: 1, createdAt: new Date().toISOString(),
    teamId, teamName: data.team?.name || '', counts, skipped,
  }
  return { meta, data }
}

export function downloadBackup(backup) {
  const day = backup.meta.createdAt.slice(0, 10)
  const safeName = (backup.meta.teamName || 'squadra').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `roadcase-backup-${safeName}-${day}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  try { localStorage.setItem(LAST_KEY(backup.meta.teamId), backup.meta.createdAt) } catch { /* nessun problema */ }
}
