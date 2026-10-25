import { useEffect } from 'react'
import { parseStationScan } from '../utils/stationLink'

// Nella pagina di accesso del PC di magazzino: se il lettore QR "digita" l'indirizzo del foglio della
// postazione (vedi utils/stationLink.js), si va dritti alla pagina di collegamento. Come per gli altri lettori
// USB si riconosce dalla velocità dei tasti; funziona anche con un campo di testo in primo piano.
const MAX_KEY_INTERVAL_MS = 40
const MIN_LENGTH = 32

export function useStationLinkScanner() {
  useEffect(() => {
    let buffer = ''
    let last = 0
    const onKey = e => {
      const now = Date.now()
      if (now - last > MAX_KEY_INTERVAL_MS) buffer = ''
      last = now
      if (e.key === 'Enter') {
        const token = buffer.length >= MIN_LENGTH ? parseStationScan(buffer) : null
        buffer = ''
        if (token) {
          e.preventDefault()
          window.location.assign(`/postazione/${token}`)
        }
        return
      }
      if (e.key.length === 1) buffer += e.key
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
