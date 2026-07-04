import { storage } from '../firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const ACCEPT_IMAGE_ATTR = ALLOWED_IMAGE_TYPES.join(',')

const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
function extFromFile(file) {
  return EXT_BY_TYPE[file.type] || (file.name.split('.').pop() || 'png').toLowerCase()
}

function slugify(s) {
  const normalized = s.toLowerCase().trim().normalize('NFD')
  const diacriticsPattern = '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']'
  const noDiacritics = normalized.replace(new RegExp(diacriticsPattern, 'g'), '')
  return noDiacritics.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'file'
}

export async function uploadArtistLogo(file, artistName) {
  const path = `brasserie/artists/${slugify(artistName)}-${Date.now()}.${extFromFile(file)}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)
  return { url, path }
}

export async function uploadNextGraphic(file, weekDate) {
  const path = `brasserie/next/${weekDate}-${Date.now()}.${extFromFile(file)}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)
  return { url, path }
}

export async function deleteStorageFile(path) {
  if (!path) return
  try { await deleteObject(ref(storage, path)) } catch (e) { /* file già rimosso o non trovato */ }
}
