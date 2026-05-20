import { useRef, useCallback } from 'react'

const CLOSE_THRESHOLD = 120  // px to drag before closing
const VELOCITY_THRESHOLD = 0.5  // px/ms

export function useDragToClose(onClose) {
  const startY = useRef(0)
  const startTime = useRef(0)
  const currentY = useRef(0)
  const modalRef = useRef(null)
  const isDragging = useRef(false)

  const onTouchStart = useCallback((e) => {
    // Only trigger from the drag handle area (top 40px of modal)
    const touch = e.touches[0]
    const rect = modalRef.current?.getBoundingClientRect()
    if (!rect || touch.clientY - rect.top > 40) return
    startY.current = touch.clientY
    startTime.current = Date.now()
    currentY.current = 0
    isDragging.current = true
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!isDragging.current) return
    const touch = e.touches[0]
    const delta = touch.clientY - startY.current
    if (delta < 0) return  // no drag up
    currentY.current = delta
    if (modalRef.current) {
      modalRef.current.style.transform = `translateY(${delta}px)`
      modalRef.current.style.transition = 'none'
      // Fade overlay
      const progress = Math.min(delta / CLOSE_THRESHOLD, 1)
      const overlay = modalRef.current.closest('.modal-overlay')
      if (overlay) overlay.style.background = `rgba(0,0,0,${0.65 * (1 - progress * 0.6)})`
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    const delta = currentY.current
    const elapsed = Date.now() - startTime.current
    const velocity = delta / elapsed
    if (modalRef.current) {
      const overlay = modalRef.current.closest('.modal-overlay')
      if (delta > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        // Chiudi
        modalRef.current.style.transition = 'transform 0.25s ease'
        modalRef.current.style.transform = 'translateY(100%)'
        if (overlay) overlay.style.transition = 'opacity 0.25s ease'
        setTimeout(onClose, 240)
      } else {
        // Torna su
        modalRef.current.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)'
        modalRef.current.style.transform = 'translateY(0)'
        if (overlay) {
          overlay.style.transition = 'background 0.35s ease'
          overlay.style.background = ''
        }
        setTimeout(() => {
          if (modalRef.current) modalRef.current.style.transition = ''
        }, 350)
      }
    }
  }, [onClose])

  return { modalRef, onTouchStart, onTouchMove, onTouchEnd }
}
