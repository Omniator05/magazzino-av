import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Rivelazione finale del percorso guidato di benvenuto (Welcome.jsx): un
// cerchio si allarga fino a coprire tutto lo schermo, e SOLO quando la
// copertura è totale cambia rotta verso la Dashboard, poi sfuma svelandola.
//
// Montato sempre in App.jsx (come PageTransition), MAI dentro Welcome.jsx:
// se vivesse lì, cambiare rotta smonterebbe l'elemento a metà animazione e
// la Dashboard sottostante lampeggerebbe per un istante prima che l'overlay
// torni a coprirla — esattamente il difetto da evitare. Da qui, l'overlay
// resta in vita attraverso il cambio di rotta e decide lui stesso il momento
// esatto in cui è sicuro navigare (schermo già completamente coperto).
const GROW_MS = 650
const HOLD_MS = 120
const FADE_MS = 600

export default function OnboardingReveal() {
  const { onboardingReveal, setOnboardingReveal } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle') // idle | growing | holding | fading
  const timers = useRef([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (!onboardingReveal) { setPhase('idle'); return }

    setPhase('growing')
    timers.current.push(setTimeout(() => {
      // Il cerchio ora copre l'intero schermo: il cambio di rotta è invisibile.
      navigate('/', { replace: true })
      setPhase('holding')
    }, GROW_MS))
    timers.current.push(setTimeout(() => setPhase('fading'), GROW_MS + HOLD_MS))
    timers.current.push(setTimeout(() => setOnboardingReveal(false), GROW_MS + HOLD_MS + FADE_MS))

    return () => { timers.current.forEach(clearTimeout) }
  }, [onboardingReveal])

  if (phase === 'idle') return null

  const grown = phase === 'growing' || phase === 'holding' || phase === 'fading'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9997, pointerEvents:'none', overflow:'hidden' }}>
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        width:'300vmax', height:'300vmax',
        marginLeft:'-150vmax', marginTop:'-150vmax',
        borderRadius:'50%',
        background:'radial-gradient(circle, #ff5c69 0%, #e63946 45%, #8f0f1c 100%)',
        transform: grown ? 'scale(1)' : 'scale(0)',
        opacity: phase === 'fading' ? 0 : 1,
        transition: phase === 'growing'
          ? `transform ${GROW_MS}ms cubic-bezier(0.65,0,0.35,1)`
          : phase === 'fading'
            ? `opacity ${FADE_MS}ms ease`
            : 'none',
      }} />
    </div>
  )
}
