import { useEffect, useLayoutEffect, useRef } from 'react'

// Alla Postazione magazzino il magazzino cambia faccia quando entra un operatore: senza permessi si vede la
// vista di sola consultazione (WorkerInventory), con i permessi quella completa (Inventory). Sono due
// componenti diversi, quindi React smonta l'uno e monta l'altro e perde ricerca, filtri e scheda aperta.
// Questo hook fa passare quello stato dall'uno all'altro: ogni vista scrive uno "scatto" di ciò che sta
// mostrando; la vista che compare subito dopo (entro 1,5 secondi dall'uscita dell'altra) lo riprende.
const view = { snap: null, leftAt: 0, scrollY: 0 }
const FRESH_MS = 1500

export function useInventoryViewCarry(enabled, snapshot, apply) {
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot
  const applyRef = useRef(apply)
  applyRef.current = apply
  // All'avvio: si riprende lo scatto lasciato dall'altra vista. Allo smontaggio: si segna l'uscita.
  useLayoutEffect(() => {
    if (!enabled) return
    if (view.snap && Date.now() - view.leftAt < FRESH_MS) {
      applyRef.current(view.snap)
      // Anche la posizione di scorrimento: la lista si ricarica un attimo dopo, quindi si riprova finché è abbastanza alta.
      const y = view.scrollY
      let tries = 0
      const restore = () => {
        window.scrollTo(0, y)
        if (Math.abs(window.scrollY - y) > 2 && tries++ < 90) requestAnimationFrame(restore)
      }
      if (y > 0) requestAnimationFrame(restore)
    }
    return () => { view.leftAt = Date.now() }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return
    const onScroll = () => { view.scrollY = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])
  // Ad ogni aggiornamento: lo scatto resta quello dell'ultima cosa mostrata.
  useLayoutEffect(() => { if (enabled) view.snap = snapRef.current })
}

// Filtri rapidi che esistono in entrambe le viste.
export const CARRIED_FILTERS = ['all', 'out', 'broken', 'reorder', 'defect']
