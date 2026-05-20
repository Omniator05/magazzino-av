import { useRef, useCallback } from 'react'

const CLOSE_THRESHOLD = 110
const VELOCITY_THRESHOLD = 0.45

export default function DraggableModal({ onClose, children, style = {} }) {
  const modalRef   = useRef(null)
  const startY     = useRef(0)
  const startTime  = useRef(0)
  const currentY   = useRef(0)
  const dragging   = useRef(false)

  const getOverlay = () => modalRef.current?.closest('.modal-overlay')

  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    const rect  = modalRef.current?.getBoundingClientRect()
    if (!rect || touch.clientY - rect.top > 44) return
    startY.current    = touch.clientY
    startTime.current = Date.now()
    currentY.current  = 0
    dragging.current  = true
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!dragging.current) return
    const delta = e.touches[0].clientY - startY.current
    if (delta < 0) return
    currentY.current = delta
    if (modalRef.current) {
      modalRef.current.style.transform  = `translateY(${delta}px)`
      modalRef.current.style.transition = 'none'
    }
    const overlay = getOverlay()
    if (overlay) {
      const progress = Math.min(delta / CLOSE_THRESHOLD, 1)
      overlay.style.background = `rgba(0,0,0,${0.65 * (1 - progress * 0.55)})`
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return
    dragging.current  = false
    const delta    = currentY.current
    const velocity = delta / (Date.now() - startTime.current)
    const overlay  = getOverlay()
    if (delta > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      if (modalRef.current) {
        modalRef.current.style.transition = 'transform 0.22s ease'
        modalRef.current.style.transform  = 'translateY(105%)'
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.22s ease'
        overlay.style.opacity    = '0'
      }
      setTimeout(onClose, 210)
    } else {
      if (modalRef.current) {
        modalRef.current.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)'
        modalRef.current.style.transform  = 'translateY(0)'
      }
      if (overlay) {
        overlay.style.transition = 'background 0.32s ease'
        overlay.style.background = ''
      }
    }
  }, [onClose])

  return (
    <div
      ref={modalRef}
      className="modal"
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
