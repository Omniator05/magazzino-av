import { useState, useEffect } from 'react'

// Viewport sotto la soglia (matchMedia, aggiornato live su resize/rotazione
// — non solo al mount) — usato per nascondere superfici pensate per schermi
// grandi (es. la timeline "Assegna personale" di StaffTimeline.jsx, che ha
// bisogno di 7 colonne affiancate) invece di provare ad adattarle.
export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint}px)`
  const [isMobile, setIsMobile] = useState(() => (
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  ))

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoint])

  return isMobile
}
