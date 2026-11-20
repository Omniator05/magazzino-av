import { useEffect } from 'react'

// La tab bar fluttuante (600px, centrata) deve spostarsi a sinistra quando a destra c'è una colonna da 460px
// (pannello del Calendario, dettaglio in "Assegna personale"), altrimenti ci finisce sotto. Usa la stessa variabile
// animata di Eventi (--rc-col-w, vedi index.css), quindi entra ed esce con lo stesso moto.
//
// Lo spostamento è solo quello che serve: la barra deve restare a ~24px dalla colonna. Su schermi larghi (da 1560px)
// non serve nessuno spostamento; man mano che lo schermo si stringe cresce fino a 460px (la barra poi si restringe).
const TARGET = 'clamp(0px, calc(1560px - 100vw), 460px)'

// Più componenti possono chiedere lo spostamento insieme (es. griglia del Calendario e colonna di "Assegna personale"
// non sono mai aperte insieme, ma un cambio di modalità le fa sovrapporre per un istante): conta le richieste, la tab
// bar torna al centro solo quando non ne resta nessuna.
let claims = 0
let closeTimer = null

function claim() {
  claims++
  clearTimeout(closeTimer)
  const root = document.documentElement
  root.style.setProperty('--rc-col-target', TARGET)
  root.setAttribute('data-col', 'open')
}

// Toglie tutto subito. La variabile --rc-col-target va sempre tolta (la usa anche la colonna di Eventi, che altrimenti
// si ritroverebbe la larghezza del Calendario: 0px su schermi larghi, cioè la colonna non si apre più); l'attributo
// data-col solo se è ancora il nostro, perché un'altra pagina può averlo già preso per sé.
function clearNow() {
  clearTimeout(closeTimer)
  const root = document.documentElement
  if (root.getAttribute('data-col') === 'close') root.removeAttribute('data-col')
  root.style.removeProperty('--rc-col-target')
}

function release() {
  claims = Math.max(0, claims - 1)
  if (claims > 0) return
  document.documentElement.setAttribute('data-col', 'close')
  closeTimer = setTimeout(() => { if (claims === 0) clearNow() }, 300)
}

export function useColumnShift(open) {
  useEffect(() => {
    if (!open) return undefined
    claim()
    return release
  }, [open])
  // Chi monta la pagina lascia l'html pulito: niente animazione di uscita se si cambia pagina, e Eventi parte da zero.
  useEffect(() => () => { if (claims === 0) clearNow() }, [])
}

