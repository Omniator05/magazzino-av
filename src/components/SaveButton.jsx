import { useState } from 'react'
import { Check } from './Icon'

// Bottone "Crea"/"Salva" con feedback sul bottone stesso invece che un modal
// che sparisce di scatto senza nessuna conferma: durante il salvataggio
// mostra uno spinner, alla riuscita una spunta verde per un attimo — SOLO
// DOPO il chiamante chiude il modal (di solito con l'animazione già esistente
// di useModalDrag, drag.close), così l'utente vede la conferma prima che la
// finestra sparisca invece di un pop-via istantaneo.
//
// Contratto di `onSave`: deve risolvere a `true` se ha davvero scritto
// qualcosa (mostra la spunta e chiude), o a qualunque cosa NON sia `true`
// (false, undefined...) se si è fermato prima — validazione fallita, limite
// del piano gratuito raggiunto, conferma rifiutata — nel qual caso il
// bottone torna semplicemente cliccabile, senza spunta né chiusura né errore
// (il chiamante ha già mostrato il proprio messaggio, es. testo inline).
// Un errore LANCIATO invece è un salvataggio davvero fallito (rete,
// permessi...): il bottone torna cliccabile E, se passato, `onError` scuote
// il modal (jiggle) — a differenza dei rami sopra, qui l'utente non ha
// nessun altro indizio che qualcosa non sia andato a buon fine.
export default function SaveButton({ onSave, onDone, onError, disabled, className = 'btn btn-primary btn-full', style, children }) {
  const [state, setState] = useState('idle') // idle | saving | success

  const handleClick = async () => {
    if (state !== 'idle' || disabled) return
    setState('saving')
    try {
      const ok = await onSave()
      if (ok !== true) { setState('idle'); return }
      setState('success')
      setTimeout(() => onDone?.(), 550)
    } catch (e) {
      setState('idle')
      onError?.()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state !== 'idle'}
      className={className}
      style={{
        display:'flex', alignItems:'center', justifyContent:'center', gap:7,
        transition:'background-color 0.2s ease',
        ...(state === 'success' ? { backgroundColor:'var(--green)', borderColor:'var(--green)' } : {}),
        ...style,
      }}
    >
      {state === 'saving' ? (
        <>
          <span style={{ width:15, height:15, border:'2px solid rgba(255,255,255,0.4)', borderTop:'2px solid #fff', borderRadius:'50%', animation:'saveBtnSpin 0.7s linear infinite', flexShrink:0 }} />
          <style>{`@keyframes saveBtnSpin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : state === 'success' ? (
        <span style={{ display:'flex', animation:'saveBtnPop 0.28s cubic-bezier(0.16,1,0.3,1) both' }}>
          <Check size={17} />
          <style>{`@keyframes saveBtnPop { from{opacity:0; transform:scale(0.6)} to{opacity:1; transform:scale(1)} }`}</style>
        </span>
      ) : children}
    </button>
  )
}
