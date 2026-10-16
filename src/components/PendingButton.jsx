import { useState, useRef, useEffect } from 'react'

// Bottone con feedback immediato alla pressione: se `onClick` ritorna una
// promessa (azione async: scrittura su Firestore, conferma + scrittura...)
// mostra subito uno spinner al posto dell'etichetta e resta disabilitato
// finché non finisce, così l'attesa è giustificata invece di sembrare un tap
// perso. Per azioni sincrone si comporta come un normale <button>.
//
// A differenza di SaveButton non mostra la spunta né chiude nulla: serve ai
// bottoni "azione" (applica, elimina, sposta...) dove la schermata cambia da
// sola a operazione finita. L'etichetta resta nel layout (solo invisibile)
// sotto lo spinner, così il bottone non cambia larghezza.
// `busy` (opzionale): se passato il bottone è CONTROLLATO dal chiamante — lo spinner
// compare solo quando `busy` è true, non per tutta la durata della promessa. Serve
// alle azioni che prima chiedono conferma (popup "sei sicuro?"): durante la domanda
// non c'è nulla da aspettare, lo spinner parte solo dopo il sì.
export default function PendingButton({ onClick, disabled, className, style, children, busy: busyProp, ...rest }) {
  const [ownBusy, setBusy] = useState(false)
  const controlled = typeof busyProp === 'boolean'
  const busy = controlled ? busyProp : ownBusy
  const alive = useRef(true)
  // Riportato a true ad ogni montaggio: in StrictMode (sviluppo) il cleanup gira una
  // volta subito dopo il primo montaggio, e senza questo il bottone restava
  // bloccato sullo spinner per sempre.
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const handleClick = async (e) => {
    if (busy || disabled) return
    const result = onClick?.(e)
    if (!controlled && result && typeof result.then === 'function') {
      setBusy(true)
      try { await result } finally { if (alive.current) setBusy(false) }
    }
  }

  return (
    <button {...rest} onClick={handleClick} disabled={disabled || busy} aria-busy={busy || undefined}
      className={className}
      style={{ position:'relative', ...style, ...(busy ? { cursor:'progress' } : {}) }}>
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'inherit', visibility: busy ? 'hidden' : 'visible' }}>{children}</span>
      {busy && (
        <span aria-hidden="true" style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ width:15, height:15, border:'2px solid currentColor', borderTopColor:'transparent', borderRadius:'50%', opacity:0.75, animation:'pendingBtnSpin 0.7s linear infinite' }} />
          <style>{`@keyframes pendingBtnSpin { to { transform: rotate(360deg); } }`}</style>
        </span>
      )}
    </button>
  )
}
