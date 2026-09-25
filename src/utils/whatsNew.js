import { LATEST_CHANGELOG_ID } from '../data/changelog'

// Ultima release delle Novità già aperta su QUESTO dispositivo — solo per
// mostrare o meno il badge "Nuovo" nel profilo, quindi basta localStorage
// (può essere vuoto/bloccato: in quel caso il badge resta, senza rompere nulla).
const KEY = 'whatsNewSeen'

export const hasUnseenWhatsNew = () => {
  try { return localStorage.getItem(KEY) !== LATEST_CHANGELOG_ID } catch { return true }
}

export const markWhatsNewSeen = () => {
  try { localStorage.setItem(KEY, LATEST_CHANGELOG_ID) } catch { /* nessun problema */ }
}
