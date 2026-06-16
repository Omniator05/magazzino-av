import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * useModalDrag
 *
 * Uso:
 *   const drag = useModalDrag(() => setShowModal(false))
 *
 *   <div className="modal-overlay" onClick={drag.onOverlayClick}>
 *     <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}`} {...drag.props}>
 *
 * Chiude automaticamente il modal alla pressione di ESC.
 */
export function useModalDrag(onClose) {
  const startY     = useRef(null)
  const isDragging = useRef(false)
  const [jiggling, setJiggling] = useState(false)

  // ESC chiude il modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const triggerJiggle = useCallback(() => {
    setJiggling(true)
    setTimeout(() => setJiggling(false), 400)
  }, [])

  const onOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) triggerJiggle()
  }, [triggerJiggle])

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
    isDragging.current = false
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 10) isDragging.current = true
    if (isDragging.current && e.currentTarget) {
      e.currentTarget.style.transform = `translateY(${Math.max(0, delta)}px)`
      e.currentTarget.style.transition = 'none'
    }
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (startY.current === null) return
    const delta = e.changedTouches[0].clientY - startY.current
    const el = e.currentTarget
    if (el) { el.style.transition = ''; el.style.transform = '' }
    if (isDragging.current && delta > 100) onClose()
    startY.current = null
    isDragging.current = false
  }, [onClose])

  return {
    // Spread SOLO queste sul <div className="modal"> → {...drag.props}
    props: { onTouchStart, onTouchMove, onTouchEnd },
    // Per l'overlay
    onOverlayClick,
    // Per la className del modal
    jiggling,
  }
}
