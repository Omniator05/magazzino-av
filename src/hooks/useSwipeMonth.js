import { useRef, useCallback } from 'react'

/**
 * useSwipeMonth(onPrev, onNext)
 *
 * Riconosce uno swipe orizzontale sopra la griglia del calendario per cambiare mese.
 * Ignora il gesto se il movimento è prevalentemente verticale (scroll della pagina).
 */
const SWIPE_THRESHOLD_PX = 45

export function useSwipeMonth(onPrev, onNext) {
  const startX = useRef(null)
  const startY = useRef(null)
  const isHorizontal = useRef(false)

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontal.current = false
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startX.current === null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) isHorizontal.current = true
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (isHorizontal.current && Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      if (dx > 0) onPrev()
      else onNext()
    }
    startX.current = null
    startY.current = null
    isHorizontal.current = false
  }, [onPrev, onNext])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
