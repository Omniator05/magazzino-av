import { useState, useEffect } from 'react'

/**
 * Stato condiviso dai popup centrati in stile "dialogo" (icona/card bianca,
 * fade+pop in/out, ESC per chiudere) — usato da Profilo, resoconto
 * settimanale, tutorial. A differenza di useModalDrag non c'è drag-to-dismiss:
 * si chiude solo con ✕, tap fuori o ESC.
 *
 *   const modal = useCenteredModal(onClose)
 *   <div onClick={modal.close} style={{ animation: modal.closing ? 'xFadeOut...' : 'xFadeIn...' }}>
 *     <div onClick={e => e.stopPropagation()} style={{ animation: modal.closing ? 'xPopOut...' : 'xPopIn...' }}>
 *       <button onClick={modal.close}>✕</button>
 */
export function useCenteredModal(onClose) {
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 200)
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { closing, close }
}
