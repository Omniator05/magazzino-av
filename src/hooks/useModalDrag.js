import { useCallback, useRef } from 'react'

export function useModalDrag(onClose) {
  const startY = useRef(0)
  const startTime = useRef(0)
  const isDragging = useRef(false)
  const modalEl = useRef(null)

  const onTouchStart = useCallback((e) => {
    // Solo dalla drag handle (primi 44px del modal)
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.touches[0].clientY - rect.top > 44) return
    startY.current = e.touches[0].clientY
    startTime.current = Date.now()
    isDragging.current = true
    e.currentTarget.style.transition = 'none'
    modalEl.current = e.currentTarget
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!isDragging.current) return
    const delta = Math.max(0, e.touches[0].clientY - startY.current)
    modalEl.current.style.transform = `translateY(${delta}px)`
    const overlay = modalEl.current.closest('.modal-overlay')
    if (overlay) overlay.style.background = `rgba(0,0,0,${Math.max(0.1, 0.65 - (delta / 300))})`
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (!isDragging.current) return
    isDragging.current = false
    const delta = e.changedTouches[0].clientY - startY.current
    const velocity = delta / (Date.now() - startTime.current)
    const el = modalEl.current
    const overlay = el?.closest('.modal-overlay')

    if (delta > 100 || velocity > 0.5) {
      el.style.transition = 'transform 0.25s ease'
      el.style.transform = 'translateY(100%)'
      if (overlay) { overlay.style.transition = 'opacity 0.25s'; overlay.style.opacity = '0' }
      setTimeout(onClose, 240)
    } else {
      el.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)'
      el.style.transform = 'translateY(0)'
      if (overlay) { overlay.style.transition = 'background 0.3s'; overlay.style.background = '' }
    }
  }, [onClose])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
