import { useRef, useState, useCallback } from 'react'

/**
 * useSwipeDismiss(onDismiss)
 *
 * Swipe orizzontale in stile "Mail" (iOS): trascinando la riga verso
 * sinistra si rivela un'azione "Nascondi" dietro di essa.
 * - Uno swipe corto la rivela e resta lì — un tap sull'azione conferma.
 * - Uno swipe lungo conferma subito, senza bisogno del secondo tap.
 * - Un tap sulla riga mentre è rivelata la richiude (non attiva i controlli
 *   sotto), gestito lato chiamante con `revealed`/`close`.
 *
 * Il drag manipola il DOM direttamente durante il gesto (stesso approccio
 * di useModalDrag) per restare fluido a 60fps; React interviene solo a
 * gesto concluso, quando lo stato "rivelata" può davvero cambiare.
 *
 *   const swipe = useSwipeDismiss(() => onDismiss(item.id))
 *   <div ref={swipe.rowRef} {...swipe.rowProps} style={{ touchAction:'pan-y' }}>...riga...</div>
 *   {swipe.revealed && <div onClick={swipe.close} style={{position:'absolute', inset:0}} />}
 *   <button onClick={swipe.commit}>Nascondi</button>  // nell'azione dietro la riga
 */
const REVEAL = 84   // px rivelati da uno swipe corto — spazio per l'azione "Nascondi"
const COMMIT = 160  // oltre questi px lo swipe conferma subito, come lo swipe lungo di Mail
const SNAP_TRANSITION = 'transform 0.22s cubic-bezier(0.32,0.72,0,1)'
const COMMIT_TRANSITION = 'transform 0.18s ease-in, opacity 0.18s ease-in'

export function useSwipeDismiss(onDismiss) {
  const elRef = useRef(null)
  const startX = useRef(null)
  const startY = useRef(null)
  const isDragging = useRef(false)
  const axisLocked = useRef(null) // 'x' | 'y' | null — deciso ai primi px, per non rubare lo scroll verticale
  const revealedRef = useRef(false)
  const [revealed, setRevealed] = useState(false)

  const rowRef = useCallback(node => { elRef.current = node }, [])

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isDragging.current = false
    axisLocked.current = null
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startX.current === null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return
    isDragging.current = true
    const el = elRef.current
    if (!el) return
    const base = revealedRef.current ? -REVEAL : 0
    const x = Math.min(0, Math.max(-COMMIT - 40, base + dx))
    el.style.transition = 'none'
    el.style.transform = `translateX(${x}px)`
    el.dataset.swipeX = String(x)
  }, [])

  const onTouchEnd = useCallback(() => {
    const el = elRef.current
    const x = el ? parseFloat(el.dataset.swipeX || '0') : 0
    const wasDragging = isDragging.current
    startX.current = null
    isDragging.current = false
    axisLocked.current = null
    if (!wasDragging) return

    if (x <= -COMMIT) {
      if (el) {
        el.style.transition = COMMIT_TRANSITION
        el.style.transform = 'translateX(-100%)'
        el.style.opacity = '0'
      }
      revealedRef.current = false
      setRevealed(false)
      setTimeout(() => onDismiss(), 180)
      return
    }
    if (x <= -REVEAL / 2) {
      if (el) { el.style.transition = SNAP_TRANSITION; el.style.transform = `translateX(${-REVEAL}px)` }
      revealedRef.current = true
      setRevealed(true)
    } else {
      if (el) { el.style.transition = SNAP_TRANSITION; el.style.transform = 'translateX(0px)' }
      revealedRef.current = false
      setRevealed(false)
    }
  }, [onDismiss])

  const close = useCallback(() => {
    const el = elRef.current
    if (el) { el.style.transition = SNAP_TRANSITION; el.style.transform = 'translateX(0px)' }
    revealedRef.current = false
    setRevealed(false)
  }, [])

  const commit = useCallback(() => {
    const el = elRef.current
    if (el) {
      el.style.transition = COMMIT_TRANSITION
      el.style.transform = 'translateX(-100%)'
      el.style.opacity = '0'
    }
    revealedRef.current = false
    setRevealed(false)
    setTimeout(() => onDismiss(), 180)
  }, [onDismiss])

  return { rowRef, rowProps: { onTouchStart, onTouchMove, onTouchEnd }, revealed, close, commit }
}
