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
            color: s.settled ? 'var(--text)' : 'rgba(17,24,39,0.28)',
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
  const [logoLoaded, setLogoLoaded] = useState(false)
  const minReadyAt = useRef(0)
  const exitTimer  = useRef(null)
  const logoSrc = team?.logoUrl || '/logo-default.svg'

  // Permanenza minima allungata per dare spazio all'animazione split-flap (~2.8s)
  useEffect(() => {
    if (showOverlay) {
      setExiting(false)
      minReadyAt.current = Date.now() + 2800
    }
  }, [showOverlay])

  // Il logo è "pronto" solo quando profilo e team sono davvero risolti:
  // `loading` non basta perché nel login manuale resta false per tutto il
  // tempo, e partiremmo col logo di default per poi scambiarlo con quello
  // dell'azienda appena arriva (la doppia apparizione da evitare).
  const teamReady = !loading && !!profile && (!profile.teamId || !!team)

  // Nome e logo appaiono solo a dati pronti: la permanenza minima riparte da
  // QUEL momento, così lo split-flap ha sempre il tempo di completarsi anche
  // se profilo/team arrivano un po' dopo l'apertura dell'overlay.
  useEffect(() => {
    if (showOverlay && teamReady) minReadyAt.current = Date.now() + 2800
  }, [showOverlay, teamReady])

  // Precarica il logo definitivo fuori schermo: il fade parte solo a
  // immagine effettivamente decodificata, mai su un riquadro vuoto.
  useEffect(() => {
    if (!teamReady) { setLogoLoaded(false); return }
    let cancelled = false
    const img = new Image()
    img.onload = () => { if (!cancelled) setLogoLoaded(true) }
    img.onerror = () => { if (!cancelled) setLogoLoaded(true) }
    img.src = logoSrc
    return () => { cancelled = true }
  }, [teamReady, logoSrc])

  useEffect(() => {
    if (!showOverlay) return
    // Esci solo a dati pronti (rispettando la permanenza minima); se il profilo
    // non arriva mai (es. utente orfano → PendingApproval), sblocco forzato.
    const hardCap = minReadyAt.current + 3200
    const target = teamReady ? Math.max(minReadyAt.current, Date.now()) : hardCap
    const wait = Math.max(0, target - Date.now())
    exitTimer.current = setTimeout(() => {
      setExiting(true)
      setTimeout(() => {
        setShowOverlay(false)
        setExiting(false)
      }, 750)
    }, wait)
    return () => clearTimeout(exitTimer.current)
  }, [showOverlay, teamReady, setShowOverlay])

  if (!showOverlay) return null

  // Il nome parte SOLO a profilo risolto: prima arriverebbe loginName (prefisso
  // email o displayName, es. "mattia.cruciotti") e lo split-flap partirebbe con
  // quella scritta lunga per poi accorciarsi al nome vero — da evitare.
  const firstName = teamReady ? (profile?.name || loginName || '').split(' ')[0] : ''

  return (
    <>
      <style>{`
        @keyframes ptOrbA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(32px,-48px) scale(1.07)} }
        @keyframes ptOrbB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-36px,28px) scale(0.93)} }
        @keyframes ptDots { 0%,100%{opacity:.22} 50%{opacity:.48} }
        @keyframes ptGradientShift {
          0%   { background-position: 15% 20%; }
          50%  { background-position: 85% 80%; }
          100% { background-position: 15% 20%; }
        }
        .pt-gradient-bg {
          background-image: linear-gradient(120deg, #ffffff 0%, #ffd9d6 15%, #f28b86 32%, #ffffff 48%, #b9d2f5 64%, #6f9fe6 80%, #ffffff 100%);
          background-size: 280% 280%;
          animation: ptGradientShift 15s ease-in-out infinite;
        }
        @keyframes ptLogoIn {
          from { opacity:0; transform: scale(0.88) translateY(20px); filter: blur(4px); }
          to   { opacity:1; transform: scale(1) translateY(0); filter: blur(0); }
        }
        @keyframes ptGlow {
          0%,100% { filter: drop-shadow(0 0 16px rgba(230,57,70,.22)) drop-shadow(0 0 40px rgba(230,57,70,.08)); }
          50%      { filter: drop-shadow(0 0 26px rgba(230,57,70,.4)) drop-shadow(0 0 60px rgba(230,57,70,.14)); }
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
        @keyframes ptOverlayIn { from{opacity:0} to{opacity:1} }
        .pt-wrap { animation: ptOverlayIn 0.4s ease both; }
        .pt-wrap.exiting {
          animation: ptOverlayOut 0.75s cubic-bezier(0.4,0,1,1) forwards;
          pointer-events: none;
        }
        @media (prefers-reduced-motion:reduce){
          [style*="ptOrb"],[style*="ptDots"],[style*="ptGlow"],.pt-gradient-bg{animation:none!important}
        }
      `}</style>

      <div
        className={`pt-wrap pt-gradient-bg${exiting ? ' exiting' : ''}`}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Punti di sfondo — stessa trama di prima, ritinta rossa e molto
            tenue: sull'unico sfondo chiaro dell'app serve un tocco, non un
            disegno visibile. */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(230,57,70,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          animation: 'ptDots 5s ease-in-out infinite',
        }} />

        {/* Orb rosso — la "luce" premium, non più il buio: un rosso caldo
            diffuso invece del nero è la stessa sensazione di lusso senza
            perdere il logo su sfondo scuro. */}
        <div style={{
          position: 'absolute', top: '-15%', left: '-8%',
          width: '65vmax', height: '65vmax', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(230,57,70,.26) 0%, transparent 65%)',
          animation: 'ptOrbA 13s ease-in-out infinite', pointerEvents: 'none',
        }} />

        {/* Orb blu — come nella versione scura originale, ora sull'unico
            sfondo chiaro dell'app: rosso+blu resta il duotono del brand. */}
        <div style={{
          position: 'absolute', bottom: '-18%', right: '-10%',
          width: '70vmax', height: '70vmax', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,.22) 0%, transparent 65%)',
          animation: 'ptOrbB 17s ease-in-out infinite', pointerEvents: 'none',
        }} />

        {/* Logo — niente placeholder: lo spazio resta vuoto e il logo vero
            (precaricato dall'effect sopra) appare con un solo leggero fade
            appena è pronto. Un'unica apparizione, mai sostituzioni a scatto. */}
        <div style={{
          zIndex: 1, textAlign: 'center', marginBottom: 52,
          animation: 'ptLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}>
          {/* Medaglione: il logo siede su una card bianca elevata invece che
              a nudo sullo sfondo — un logo chiaro (frequente: molti clienti
              caricano una versione bianca) resta sempre leggibile qui, senza
              bisogno di una seconda variante scura del file. */}
          <div style={{ position: 'relative', display: 'inline-block', width: 140, maxWidth: '40vw', height: 140 }}>
            <div style={{
              position: 'absolute', inset: -28, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(230,57,70,0.16) 0%, transparent 70%)',
              animation: logoLoaded ? 'ptGlow 3s ease-in-out infinite' : 'none',
            }} />
            <div style={{
              position: 'relative', width: '100%', height: '100%', borderRadius: 32,
              background: '#fff', border: '1px solid rgba(17,24,39,0.06)',
              boxShadow: '0 20px 46px rgba(230,57,70,0.14), 0 4px 14px rgba(17,24,39,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
            }}>
              <img src={logoSrc} alt={team?.name || 'Gestione Magazzino'}
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: logoLoaded ? 1 : 0, transition: 'opacity 0.7s ease' }} />
            </div>
          </div>
          <p style={{
            color: 'var(--text3)', fontSize: 10,
            letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 600, marginTop: 16,
          }}>Gestione Magazzino</p>
        </div>

        {/* Saluto + nome (split-flap) */}
        <div style={{ zIndex: 1, textAlign: 'center' }}>
          <p style={{
            color: 'var(--text2)', fontSize: 14, fontWeight: 500,
            letterSpacing: '0.5px', marginBottom: 8,
            animation: 'ptGreetIn 0.5s ease 0.35s both',
          }}>
            Bentornato,
          </p>
          {firstName && (
            <div key={firstName} style={{
              color: 'var(--text)', fontSize: 34, fontWeight: 800,
              letterSpacing: '1px', lineHeight: 1, perspective: 400,
            }}>
              <FlapName text={firstName} />
            </div>
          )}
        </div>

        {/* Spinner */}
        <div style={{
          marginTop: 52, zIndex: 1, width: 24, height: 24,
          border: '2px solid rgba(230,57,70,0.16)', borderTop: '2px solid var(--accent)',
          borderRadius: '50%', animation: 'ptSpinnerRing 0.9s linear infinite',
          opacity: exiting ? 0 : 1, transition: 'opacity 0.3s ease',
        }} />
      </div>
    </>
  )
}
