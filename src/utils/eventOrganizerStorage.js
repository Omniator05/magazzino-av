import { storage } from '../firebase'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'

// Soglia soft (non bloccante) oltre la quale avvisiamo l'organizzatore prima di caricare,
// per tenere sotto controllo i costi di banda quando poi l'admin scarica il file.
export const SOFT_SIZE_WARNING_BYTES = 2 * 1024 * 1024 * 1024 // 2GB

function slugify(s) {
  const normalized = (s || '').toLowerCase().trim().normalize('NFD')
  const diacriticsPattern = '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']'
  const noDiacritics = normalized.replace(new RegExp(diacriticsPattern, 'g'), '')
  return noDiacritics.replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '') || 'file'
}

// Upload resumibile con callback di progresso (0-100) — necessario qui perché i file
// possono essere video da diversi GB, a differenza delle piccole immagini di Brasserie.
export function uploadEventContentFile(eventId, category, file, onProgress) {
  const path = `eventOrganizerContent/${eventId}/${category}/${Date.now()}_${slugify(file.name)}`
  const storageRef = ref(storage, path)
  const task = uploadBytesResumable(storageRef, file)

  const promise = new Promise((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(storageRef)
        resolve({ url, path, fileName: file.name })
      }
    )
  })

  return { task, promise }
}

export async function deleteEventContentFile(path) {
  if (!path) return
  try { await deleteObject(ref(storage, path)) } catch (e) { /* file già rimosso o non trovato */ }
}
