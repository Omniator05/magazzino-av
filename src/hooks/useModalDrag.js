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
 * - Lo "swipe verso il basso" per chiudere parte SOLO se il gesto INIZIA nella
 *   zona della maniglia in alto (la strisciolina, primi ~44px del modal) — così
 *   scrollare il contenuto sotto, ovunque ci si trovi, non chiude mai il modal.
 * - Mentre si trascina, lo sfondo (l'overlay, elemento padre del modal) si
 *   schiarisce proporzionalmente, così la pagina dietro torna leggibile.
 * - Se si supera METÀ dell'altezza del modal, il rilascio prosegue lo
 *   scivolamento verso il basso (invece di scomparire di scatto) e poi chiude.
 *   Sotto la soglia, modal e sfondo tornano morbidamente alla posizione iniziale.
 * - `guard` (opzionale): funzione che ritorna `false` per BLOCCARE la chiusura
 *   (es. mostrare una conferma se ci sono modifiche non salvate). Vale per ✕, ESC e drag.
 * - `isOpen` (opzionale, 4° argomento): se una pagina usa più useModalDrag con
 *   `onSubmit` contemporaneamente (uno per modal), il listener Enter di OGNI
 *   istanza resta attivo su `document` anche a modal chiuso — premendo Enter
 *   in un modal scatterebbe anche l'onSubmit degli altri. Passa lo stato che
 *   controlla la visibilità del modal (es. `showCreate`) per disattivarlo
 *   quando non è quello aperto. Se omesso, il comportamento è invariato
 *   (sempre attivo) — sicuro quando la pagina ha un solo useModalDrag con onSubmit.
 */
const HANDLE_ZONE_PX = 44
const FADE_PROGRESS_FRACTION = 0.92  // l'overlay raggiunge opacità 0 solo quasi a fine trascinamento
const SNAP_BACK_TRANSITION = 'transform 0.25s cubic-bezier(0.32,0.72,0,1)'
const OVERLAY_SNAP_BACK_TRANSITION = 'opacity 0.25s ease'
const DISMISS_TRANSITION = 'transform 0.22s cubic-bezier(0.32,0.72,0,1)'
const OVERLAY_DISMISS_TRANSITION = 'opacity 0.22s ease'

export function useModalDrag(onClose, guard, onSubmit, isOpen) {
  const startY     = useRef(null)
  const isDragging = useRef(false)
  const canDrag    = useRef(false)  // deciso a inizio gesto: true solo se si parte dalla maniglia
  const [jiggling, setJiggling] = useState(false)
  const [closing,  setClosing]  = useState(false)

  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const guardRef = useRef(guard)
  useEffect(() => { guardRef.current = guard }, [guard])
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])
  const isOpenRef = useRef(isOpen)
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])

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
      if (isOpenRef.current === false) return
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

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
    isDragging.current = false
    // Drag-to-dismiss consentito SOLO se il tocco parte dalla zona della maniglia
    // in alto — così scrollare il contenuto, ovunque ci si trovi, non chiude mai il modal
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.touches[0].clientY - rect.top
    canDrag.current = relativeY <= HANDLE_ZONE_PX
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || !canDrag.current) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 10) isDragging.current = true
    if (isDragging.current && e.currentTarget) {
      const el = e.currentTarget
      const y = Math.max(0, delta)
      el.style.transition = 'none'
      el.style.transform = `translateY(${y}px)`
      // Overlay (elemento padre) sempre più chiaro/leggibile man mano che si trascina —
      // dissolvenza più graduale: il modal resta ben visibile fino a ~4/5 del trascinamento
      const overlay = el.parentElement
      if (overlay) {
        const fadeDistance = el.offsetHeight * FADE_PROGRESS_FRACTION || 1
        const progress = Math.min(y / fadeDistance, 1)
        overlay.style.transition = 'none'
        overlay.style.opacity = String(1 - progress)
      }
    }
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (startY.current === null) return
    const delta = e.changedTouches[0].clientY - startY.current
    const el = e.currentTarget
    const overlay = el?.parentElement
    const threshold = el ? (el.offsetHeight / 2 || 1) : Infinity
    const pastThreshold = isDragging.current && delta > threshold

    if (pastThreshold && allowClose()) {
      // Prosegui lo scivolamento verso il basso invece di scomparire di scatto
      if (el) {
        const offScreen = el.offsetHeight + 40
        el.style.transition = DISMISS_TRANSITION
        el.style.transform = `translateY(${offScreen}px)`
      }
      if (overlay) {
        overlay.style.transition = OVERLAY_DISMISS_TRANSITION
        overlay.style.opacity = '0'
      }
      setTimeout(() => {
        if (el) { el.style.transition = ''; el.style.transform = '' }
        if (overlay) { overlay.style.transition = ''; overlay.style.opacity = '' }
        onCloseRef.current()
      }, 220)
    } else {
      // Sotto soglia (o guard che blocca): torna morbidamente alla posizione iniziale
      if (el) {
        el.style.transition = SNAP_BACK_TRANSITION
        el.style.transform = ''
      }
      if (overlay) {
        overlay.style.transition = OVERLAY_SNAP_BACK_TRANSITION
        overlay.style.opacity = ''
      }
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
