import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

// Rivelazione finale del percorso guidato di benvenuto (Welcome.jsx): loader
// che si trasforma in un check verde che si scrive (con un "Tutto pronto!"), poi un leggero
// fade svela la Dashboard. Colori dal tema, chiaro o scuro.
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
const SUCCESS_MS = 1300
const FADE_MS = 500

export default function OnboardingReveal() {
  const { t } = useTranslation()
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

  // Colori dal tema (chiaro/scuro del dispositivo), non fissi scuri come prima.
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9997,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:22,
      background:'var(--bg)',
      opacity: phase === 'fading' ? 0 : 1,
      transition: phase === 'fading' ? `opacity ${FADE_MS}ms ease` : 'none',
    }}>
      <div style={{ position:'relative', width:76, height:76 }}>
        {/* Loader — sfuma via appena arriva il successo */}
        <div style={{ position:'absolute', inset:0, opacity: phase === 'loading' ? 1 : 0, transition:'opacity 0.25s ease' }}>
          <div style={{
            width:'100%', height:'100%', borderRadius:'50%', boxSizing:'border-box',
            border:'3px solid var(--c-line)', borderTopColor:'#e63946',
            animation:'onboardingSpin 0.8s linear infinite',
          }} />
        </div>
        {/* Successo: l'anello si chiude e la spunta si "scrive" lentamente */}
        <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden="true"
          style={{ position:'absolute', inset:0, opacity: phase === 'loading' ? 0 : 1, transition:'opacity 0.2s ease' }}>
          <circle cx="38" cy="38" r="35" fill="rgba(34,197,94,0.10)" stroke="#22c55e" strokeWidth="3"
            strokeLinecap="round" transform="rotate(-90 38 38)"
            style={{ strokeDasharray:220, strokeDashoffset: phase === 'loading' ? 220 : 0, transition:'stroke-dashoffset 0.6s ease' }} />
          <polyline points="24,39 34,49 53,28" fill="none" stroke="#22c55e" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray:48, strokeDashoffset: phase === 'loading' ? 48 : 0, transition: phase === 'loading' ? 'none' : 'stroke-dashoffset 0.55s ease 0.3s' }} />
        </svg>
      </div>
      <p style={{
        margin:0, fontSize:17, fontWeight:800, letterSpacing:'-0.2px', color:'var(--c-ink)',
        opacity: phase === 'loading' ? 0 : 1, transform: phase === 'loading' ? 'translateY(6px)' : 'none',
        transition:'opacity 0.45s ease 0.45s, transform 0.45s ease 0.45s',
      }}>{t('welcome.revealDone')}</p>
      <style>{`@keyframes onboardingSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
