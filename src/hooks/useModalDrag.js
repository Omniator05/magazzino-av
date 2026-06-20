import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * useModalDrag
 *
 * Uso:
 *   const drag = useModalDrag(() => setShowModal(false))
 *
 *   <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
 *     <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} {...drag.props}>
 *       <button className="close-btn" onClick={drag.close}>✕</button>
 *
 * drag.close   → chiude con animazione slide-down
 * drag.closing → true durante l'animazione (aggiunge class CSS)
 */
export function useModalDrag(onClose) {
  const startY     = useRef(null)
  const isDragging = useRef(false)
  const [jiggling, setJiggling] = useState(false)
  const [closing,  setClosing]  = useState(false)

  // Ref per avere sempre l'onClose aggiornato senza reinserire negli useEffect
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Chiude con animazione slide-down (280ms = durata CSS)
  const animatedClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onCloseRef.current()
    }, 280)
  }, [closing])

  // ESC chiude il modal con animazione
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') animatedClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [animatedClose])

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
    // Drag manuale: chiude direttamente senza animazione (l'utente ha già trascinato)
    if (isDragging.current && delta > 100) onCloseRef.current()
    startY.current = null
    isDragging.current = false
  }, [])

  return {
    // Spread SOLO queste sul <div className="modal"> → {...drag.props}
    props: { onTouchStart, onTouchMove, onTouchEnd },
    // Per l'overlay
    onOverlayClick,
    // Per la className del modal
    jiggling,
    // Animazione di chiusura
    closing,
    close: animatedClose,
  }
}
