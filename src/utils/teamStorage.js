import { storage } from '../firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

export const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
export const ACCEPT_LOGO_ATTR = ALLOWED_LOGO_TYPES.join(',')

const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
function extFromFile(file) {
  return EXT_BY_TYPE[file.type] || (file.name.split('.').pop() || 'png').toLowerCase()
}

export async function uploadTeamLogo(file, teamId) {
  const path = `teamLogos/${teamId}/logo-${Date.now()}.${extFromFile(file)}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)
  return { url, path }
}

export async function deleteTeamLogo(path) {
  if (!path) return
  try { await deleteObject(ref(storage, path)) } catch (e) { /* file già rimosso o non trovato */ }
}
