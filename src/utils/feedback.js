// Piccolo riscontro quando si completa qualcosa: una vibrazione leggera (telefoni) e, alla postazione magazzino,
// un "din" breve — chi ha le mani occupate capisce che ha funzionato senza guardare lo schermo. Niente file
// audio: il suono si genera al momento. Va chiamato dopo un tocco dell'utente (i browser lo richiedono) e non
// fa mai errori: se il dispositivo non supporta qualcosa, semplicemente non succede niente.
let ctx
export function doneFeedback({ sound = false } = {}) {
  try { navigator.vibrate?.(25) } catch { /* non supportata */ }
  if (!sound) return
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    if (ctx.state === 'suspended') ctx.resume()
    const t0 = ctx.currentTime
    ;[[880, 0], [1318.5, 0.11]].forEach(([freq, delay]) => {      // due note: la3 → mi5, un "fatto" gentile
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + delay)
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + delay + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + delay)
      osc.stop(t0 + delay + 0.3)
    })
  } catch { /* nessun suono */ }
}
