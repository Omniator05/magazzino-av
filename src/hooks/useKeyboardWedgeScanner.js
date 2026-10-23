import { useEffect, useRef } from 'react'
import { isBadgeCode } from '../utils/operatorBadge'

// Lettori barcode/QR wireless (es. Netum C750) in modalità Bluetooth HID si
// comportano come una tastiera: appena si abbina al telefono, ogni scansione
// viene "digitata" a raffica seguita da Invio — nessuna API speciale, per
// il browser è indistinguibile da una persona che scrive molto in fretta.
// Distinguiamo lo scanner dalla digitazione umana con la velocità: anche la
// persona più veloce al mondo supera facilmente questa soglia tra un tasto
// e l'altro, uno scanner no (tutti i caratteri arrivano entro pochi ms).
const MAX_KEY_INTERVAL_MS = 40
const MIN_CODE_LENGTH = 3

// Non intercetta mentre l'utente sta scrivendo davvero in un campo (es. per
// inserire un codice a mano) — lì la digitazione, anche letterale del
// codice, deve restare quella normale del browser.
function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

// `badges`: ogni scansione è o un BADGE personale ("RCB-…", vedi utils/operatorBadge.js) o un
// codice oggetto. Un'istanza con `badges: true` riceve SOLO i badge, tutte le altre SOLO il
// resto: così passare un badge non fa mai comparire "oggetto non trovato" in nessuna pagina.
export function useKeyboardWedgeScanner(onScan, { enabled = true, badges = false } = {}) {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = e => {
      if (isEditableTarget(document.activeElement)) return

      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now
      if (gap > MAX_KEY_INTERVAL_MS) bufferRef.current = ''

      if (e.key === 'Enter') {
        const code = bufferRef.current
        bufferRef.current = ''
        if (code.length >= MIN_CODE_LENGTH && isBadgeCode(code) === badges) {
          e.preventDefault()
          onScanRef.current(code)
        }
        return
      }
      if (e.key.length === 1) bufferRef.current += e.key
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, badges])
}
