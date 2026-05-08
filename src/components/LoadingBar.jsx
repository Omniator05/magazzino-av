import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export default function LoadingBar() {
  const location = useLocation()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)
  const doneRef  = useRef(null)

  useEffect(() => {
    // Ogni cambio di route → avvia la barra
    setVisible(true)
    setProgress(0)

    // Fase 1: scatta subito a 30%
    const t1 = setTimeout(() => setProgress(30), 30)
    // Fase 2: sale a 60% lentamente
    const t2 = setTimeout(() => setProgress(60), 150)
    // Fase 3: sale a 85% — simula attesa Firebase
    const t3 = setTimeout(() => setProgress(85), 400)
    // Fase 4: completa a 100%
    const t4 = setTimeout(() => setProgress(100), 700)
    // Fase 5: nasconde dopo la transizione
    const t5 = setTimeout(() => { setVisible(false); setProgress(0) }, 950)

    timerRef.current = [t1, t2, t3, t4, t5]
    return () => timerRef.current?.forEach(clearTimeout)
  }, [location.pathname])

  if (!visible && progress === 0) return null

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 2,
        zIndex: 9999,
        background: 'var(--bg)',
        pointerEvents: 'none',
      }}>
        {/* Barra principale */}
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, var(--accent), #ff8fa3, var(--accent))',
          backgroundSize: '200% 100%',
          transition: progress === 100
            ? 'width 0.15s ease-out, opacity 0.2s ease 0.1s'
            : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: progress === 100 ? 0 : 1,
          borderRadius: '0 2px 2px 0',
          animation: 'barShimmer 1.2s linear infinite',
          boxShadow: '0 0 10px rgba(233,69,96,0.8), 0 0 20px rgba(233,69,96,0.4)',
        }} />

        {/* Particella luminosa in testa alla barra */}
        {progress > 0 && progress < 100 && (
          <div style={{
            position: 'absolute',
            top: -1,
            left: `calc(${progress}% - 4px)`,
            width: 8,
            height: 4,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 0 8px 3px rgba(255,255,255,0.9), 0 0 16px 6px rgba(233,69,96,0.6)',
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        )}
      </div>

      <style>{`
        @keyframes barShimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </>
  )
}
