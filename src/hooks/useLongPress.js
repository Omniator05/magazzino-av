import { useRef, useCallback } from 'react'

// Nessun hook di questo tipo esisteva nel progetto: pressione prolungata
// (default 500ms) senza spostamento significativo del dito/mouse (soglia
// 10px, per non scattare durante uno scroll verticale sulla riga). Dopo un
// long press andato a buon fine, il click "naturale" che segue il rilascio
// del dito viene ignorato una volta — altrimenti scatterebbe comunque anche
// l'azione del tap normale subito dopo essere entrati in selezione.
export function useLongPress(onLongPress, onClick, { delay = 500 } = {}) {
  const timerRef = useRef(null)
  const movedRef = useRef(false)
  const firedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const start = useCallback((x, y) => {
    movedRef.current = false
    firedRef.current = false
    startRef.current = { x, y }
    clearTimer()
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) {
        firedRef.current = true
        if (navigator.vibrate) navigator.vibrate(15)
        onLongPress()
      }
    }, delay)
  }, [onLongPress, delay, clearTimer])

  const move = useCallback((x, y) => {
    if (Math.hypot(x - startRef.current.x, y - startRef.current.y) > 10) {
      movedRef.current = true
      clearTimer()
    }
  }, [clearTimer])

  return {
    onTouchStart: e => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: e => move(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: clearTimer,
    onTouchCancel: clearTimer,
    onMouseDown: e => start(e.clientX, e.clientY),
    onMouseMove: e => move(e.clientX, e.clientY),
    onMouseUp: clearTimer,
    onMouseLeave: clearTimer,
    onClick: e => {
      if (firedRef.current) {
        firedRef.current = false
        e.preventDefault()
        return
      }
      onClick?.(e)
    },
  }
}
