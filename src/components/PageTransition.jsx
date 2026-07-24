import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

/* Effetto "tabellone aeroportuale": le lettere scorrono e si bloccano una a una */
function FlapName({ text, startDelay = 450 }) {
  const final = text || ''
  const [slots, setSlots] = useState(() => final.split('').map(() => ({ ch: '', settled: false })))

  useEffect(() => {
    if (!final) return
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lockTimes = final.split('').map((_, i) => startDelay + 550 + i * 230)
    const t0 = Date.now()
    let timer
    const tick = () => {
      const t = Date.now() - t0
      setSlots(final.split('').map((ch, i) => {
        if (t < startDelay) return { ch: '', settled: false }
        if (t >= lockTimes[i]) return { ch, settled: true }
        return { ch: charset[Math.floor(Math.random() * charset.length)], settled: false }
      }))
      if (t < lockTimes[lockTimes.length - 1]) timer = setTimeout(tick, 55)
    }
    tick()
    return () => clearTimeout(timer)
  }, [final, startDelay])

  return (
    <span style={{ display: 'inline-flex', justifyContent: 'center', gap: 1 }}>
      {slots.map((s, i) => (
        <span
          key={i}
          className={s.settled ? 'flap-cell flap-lock' : 'flap-cell'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '0.6em',
            color: s.settled ? '#fff' : 'rgba(255,255,255,0.45)',
          }}
        >
          {s.ch || ' '}
        </span>
      ))}
    </span>
  )
}

export default function PageTransition() {
  const { loading, profile, team, showOverlay, setShowOverlay, loginName } = useAuth()
  const [exiting, setExiting] = useState(false)
  const minReadyAt = useRef(0)
  const exitTimer  = useRef(null)

  // Permanenza minima allungata per dare spazio all'animazione split-flap (~2.8s)
  useEffect(() => {
    if (showOverlay) {
      setExiting(false)
      minReadyAt.current = Date.now() + 2800
    }
  }, [showOverlay])

  useEffect(() => {
    if (!showOverlay || loading) return
    const wait = Math.max(0, minReadyAt.current - Date.now())
    exitTimer.current = setTimeout(() => {
      setExiting(true)
      setTimeout(() => {
        setShowOverlay(false)
        setExiting(false)
      }, 750)
    }, wait)
    return () => clearTimeout(exitTimer.current)
  }, [showOverlay, loading, profile, setShowOverlay])

  if (!showOverlay) return null

  const firstName = (profile?.name || loginName || '').split(' ')[0]

  return (
    <>
      <style>{`
        @keyframes ptOrbA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(32px,-48px) scale(1.07)} }
        @keyframes ptOrbB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-36px,28px) scale(0.93)} }
        @keyframes ptDots { 0%,100%{opacity:.22} 50%{opacity:.48} }
        @keyframes ptLogoIn {
          from { opacity:0; transform: scale(0.88) translateY(20px); filter: blur(4px); }
          to   { opacity:1; transform: scale(1) translateY(0); filter: blur(0); }
        }
        @keyframes ptGlow {
          0%,100% { filter: drop-shadow(0 0 20px rgba(230,57,70,.3)) drop-shadow(0 0 55px rgba(230,57,70,.1)); }
          50%      { filter: drop-shadow(0 0 36px rgba(230,57,70,.65)) drop-shadow(0 0 95px rgba(230,57,70,.22)); }
        }
        @keyframes ptGreetIn { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptSpinnerRing { to { transform: rotate(360deg); } }
        @keyframes ptOverlayOut { 0%{opacity:1;filter:blur(0)} 100%{opacity:0;filter:blur(6px)} }
        @keyframes flapLock {
          0%   { transform: rotateX(-90deg); opacity: 0.2; }
          60%  { transform: rotateX(12deg); opacity: 1; }
          100% { transform: rotateX(0); opacity: 1; }
        }
        .flap-cell { transform-origin: center; }
        .flap-lock { animation: flapLock 0.32s cubic-bezier(0.36,0.07,0.19,0.97) both; }
        .pt-wrap.exiting {
          animation: ptOverlayOut 0.75s cubic-bezier(0.4,0,1,1) forwards;
          pointer-events: none;
        }
        @media (prefers-reduced-motion:reduce){
          [style*="ptOrb"],[style*="ptDots"],[style*="ptGlow"]{animation:none!important}
        }
      `}</style>

      <div
        className={`pt-wrap${exiting ? ' exiting' : ''}`}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#07090f',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Punti di sfondo */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          animation: 'ptDots 5s ease-in-out infinite',
        }} />

        {/* Orb rosso */}
        <div style={{
          position: 'absolute', top: '-15%', left: '-8%',
          width: '65vmax', height: '65vmax', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(230,57,70,.2) 0%, transparent 65%)',
          animation: 'ptOrbA 13s ease-in-out infinite', pointerEvents: 'none',
        }} />

        {/* Orb blu */}
        <div style={{
          position: 'absolute', bottom: '-18%', right: '-10%',
          width: '70vmax', height: '70vmax', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,.13) 0%, transparent 65%)',
          animation: 'ptOrbB 17s ease-in-out infinite', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{
          zIndex: 1, textAlign: 'center', marginBottom: 52,
          animation: 'ptLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}>
          <div style={{ display: 'inline-block', width: 260, maxWidth: '68vw', height: 146, animation: 'ptGlow 3s ease-in-out infinite' }}>
            <img src={team?.logoUrl || '/logo.png'} alt={team?.name || 'The Service Group'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.25)', fontSize: 10,
            letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600, marginTop: 12,
          }}>Gestione Magazzino</p>
        </div>

        {/* Saluto + nome (split-flap) */}
        <div style={{ zIndex: 1, textAlign: 'center' }}>
          <p style={{
            color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: 500,
            letterSpacing: '0.5px', marginBottom: 8,
            animation: 'ptGreetIn 0.5s ease 0.35s both',
          }}>
            Bentornato,
          </p>
          {firstName && (
            <div key={firstName} style={{
              color: 'white', fontSize: 34, fontWeight: 800,
              letterSpacing: '1px', lineHeight: 1, perspective: 400,
            }}>
              <FlapName text={firstName} />
            </div>
          )}
        </div>

        {/* Spinner */}
        <div style={{
          marginTop: 52, zIndex: 1, width: 24, height: 24,
          border: '2px solid rgba(230,57,70,0.18)', borderTop: '2px solid rgba(230,57,70,0.8)',
          borderRadius: '50%', animation: 'ptSpinnerRing 0.9s linear infinite',
          opacity: exiting ? 0 : 1, transition: 'opacity 0.3s ease',
        }} />
      </div>
    </>
  )
}
