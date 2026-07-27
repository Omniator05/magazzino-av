import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Rivelazione finale del percorso guidato di benvenuto (Welcome.jsx): loader
// che si trasforma in un check verde, poi un leggero fade svela la Dashboard.
// Sostituisce il cerchio che si allargava — su schermi larghi da desktop
// restava poco leggibile/fluido. Qui la copertura è sempre binaria (overlay
// a tinta unita, opaco o in dissolvenza), niente geometrie/vmax da calibrare.
//
// Montato sempre in App.jsx (come PageTransition), MAI dentro Welcome.jsx:
// se vivesse lì, cambiare rotta smonterebbe l'elemento a metà animazione e
// la Dashboard sottostante lampeggerebbe per un istante prima che l'overlay
// torni a coprirla. Da qui l'overlay resta in vita attraverso il cambio di
// rotta e naviga lui stesso, mentre è ancora completamente opaco.
const LOADING_MS = 700
const SUCCESS_MS = 650
const FADE_MS = 500

export default function OnboardingReveal() {
  const { onboardingReveal, setOnboardingReveal } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle') // idle | loading | success | fading
  const timers = useRef([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (!onboardingReveal) { setPhase('idle'); return }

    setPhase('loading')
    timers.current.push(setTimeout(() => {
      // L'overlay è ancora completamente opaco: la Dashboard si monta sotto
      // senza che si veda, il cambio di rotta è invisibile.
      navigate('/', { replace: true })
      setPhase('success')
    }, LOADING_MS))
    timers.current.push(setTimeout(() => setPhase('fading'), LOADING_MS + SUCCESS_MS))
    timers.current.push(setTimeout(() => setOnboardingReveal(false), LOADING_MS + SUCCESS_MS + FADE_MS))

    return () => { timers.current.forEach(clearTimeout) }
  }, [onboardingReveal])

  if (phase === 'idle') return null

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9997,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'#0a0a14',
      opacity: phase === 'fading' ? 0 : 1,
      transition: phase === 'fading' ? `opacity ${FADE_MS}ms ease` : 'none',
    }}>
      <div style={{ position:'relative', width:64, height:64 }}>
        {/* Loader — sfuma via appena arriva il successo */}
        <div style={{ position:'absolute', inset:0, opacity: phase === 'loading' ? 1 : 0, transition:'opacity 0.25s ease' }}>
          <div style={{
            width:'100%', height:'100%', borderRadius:'50%',
            border:'3px solid rgba(255,255,255,0.15)', borderTopColor:'#e63946',
            animation:'onboardingSpin 0.8s linear infinite',
          }} />
        </div>
        {/* Check verde — entra con un piccolo pop */}
        <div style={{
          position:'absolute', inset:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          borderRadius:'50%', background:'rgba(34,197,94,0.15)',
          opacity: phase === 'loading' ? 0 : 1,
          transform: phase === 'loading' ? 'scale(0.7)' : 'scale(1)',
          transition:'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <style>{`@keyframes onboardingSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
