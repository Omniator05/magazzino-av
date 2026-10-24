import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Arrivando da un passo della guida "Per iniziare" (GettingStartedWidget) la pagina riceve
// `state.pulseAdd`: il bottone "+" fa una piccola animazione per far capire dove cliccare.
// Torna false da solo dopo qualche secondo (e il segnale viene tolto dallo stato della pagina,
// così un aggiornamento non lo ripete).
export function usePulseAdd() {
  const { state } = useLocation()
  const wanted = !!state?.pulseAdd
  const [pulse, setPulse] = useState(wanted)
  useEffect(() => {
    if (!wanted) return
    setPulse(true)
    const id = setTimeout(() => {
      setPulse(false)
      try { window.history.replaceState({ ...window.history.state, usr: null }, '') } catch { /* nessun problema */ }
    }, 4500)
    return () => clearTimeout(id)
  }, [wanted])
  return pulse
}
