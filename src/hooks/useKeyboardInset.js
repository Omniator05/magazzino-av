import { useState, useEffect } from 'react'

// Restituisce l'altezza (in px) occupata dalla tastiera software.
// Usa la VisualViewport API: su iOS la tastiera fa overlay senza
// rimpicciolire il layout viewport, quindi confrontiamo l'altezza
// visibile con quella di layout per ricavare lo spazio coperto.
export function useKeyboardInset(active) {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active) { setInset(0); return }
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // Ignora micro-variazioni (barra URL, ecc.): consideriamo "tastiera" solo > 120px
      setInset(kb > 120 ? kb : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])

  return inset
}
