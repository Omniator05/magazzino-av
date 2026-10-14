import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

// true solo DOPO che l'animazione di caricamento (overlay di PageTransition)
// è finita, più un piccolo respiro: i popup che compaiono da soli all'avvio
// (assenze segnalate/modificate) altrimenti spuntano a metà animazione,
// sopra al logo che ancora si muove. Se l'overlay riparte (es. nuovo login)
// torna false finché non ricomincia l'attesa.
export function useAppReady(delayMs = 700) {
  const { showOverlay } = useAuth()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (showOverlay) { setReady(false); return }
    const id = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(id)
  }, [showOverlay, delayMs])
  return ready
}
