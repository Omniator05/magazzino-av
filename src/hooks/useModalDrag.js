import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * useModalDrag(onClose, guard?)
 *
 *   const drag = useModalDrag(() => setShowModal(false))
 *
 *   <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
 *     <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} {...drag.props}>
 *       <button className="close-btn" onClick={drag.close}>✕</button>
 *
 * - Lo "swipe verso il basso" per chiudere parte SOLO se il contenuto scrollabile
 *   interno è già in cima (così scrollare la lista non chiude il modal).
 * - `guard` (opzionale): funzione che ritorna `false` per BLOCCARE la chiusura
 *   (es. mostrare una conferma se ci sono modifiche non salvate). Vale per ✕, ESC e drag.
 */
export function useModalDrag(onClose, guard, onSubmit) {
  const startY     = useRef(null)
  const isDragging = useRef(false)
  const canDrag    = useRef(true)   // deciso a inizio gesto: true se la lista è in cima
  const [jiggling, setJiggling] = useState(false)
  const [closing,  setClosing]  = useState(false)

  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const guardRef = useRef(guard)
  useEffect(() => { guardRef.current = guard }, [guard])
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  // true se è permesso chiudere (guard assente o ritorna truthy)
  const allowClose = () => !guardRef.current || guardRef.current() !== false

  const animatedClose = useCallback(() => {
    if (closing) return
    if (!allowClose()) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onCloseRef.current()
    }, 280)
  }, [closing])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { animatedClose(); return }
      if (e.key === 'Enter' && onSubmitRef.current && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        onSubmitRef.current()
      }
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

  // Trova l'antenato scrollabile del target, fermandosi al modal stesso
  const findScrollable = (node, root) => {
    let el = node
    while (el && el !== root && el !== document.body) {
      const oy = getComputedStyle(el).overflowY
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
      el = el.parentElement
    }
    return null
  }

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
    isDragging.current = false
    // Mai drag-to-dismiss quando si tocca un campo di testo (serve per scrollare il form)
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      canDrag.current = false
      return
    }
    // Drag-to-dismiss consentito solo se la zona scrollabile è già in cima
    const scrollable = findScrollable(e.target, e.currentTarget)
    canDrag.current = !scrollable || scrollable.scrollTop <= 0
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || !canDrag.current) return
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
    if (isDragging.current && delta > 100) {
      // chiude direttamente (senza animazione) solo se consentito dal guard
      if (allowClose()) onCloseRef.current()
    }
    startY.current = null
    isDragging.current = false
  }, [])

  return {
    props: { onTouchStart, onTouchMove, onTouchEnd },
    onOverlayClick,
    jiggling,
    closing,
    close: animatedClose,
  }
}
