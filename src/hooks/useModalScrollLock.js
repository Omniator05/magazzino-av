import { useEffect } from 'react'

// Blocca lo scroll della pagina mentre un modal è aperto (body fisso, con la
// posizione di scroll ricordata e ripristinata alla chiusura).
//
// CONTEGGIO: più parti dell'app possono chiedere il blocco nello stesso
// momento — es. il Calendario su computer lo tiene sempre attivo e sopra si
// aprono il riepilogo evento o un promemoria. Senza conteggio il secondo
// blocco leggeva scrollY = 0 (il body era già fisso) e, chiudendosi, toglieva
// il blocco anche al primo: la pagina restava sbloccata e "più alta", come se
// avessi scrollato. Ora il body si blocca alla PRIMA richiesta e si sblocca
// solo quando l'ULTIMA finisce.
let lockCount = 0
let savedScrollY = 0

export function useModalScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen) return
    if (lockCount === 0) {
      savedScrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${savedScrollY}px`
      document.body.style.width = '100%'
    }
    lockCount++
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        window.scrollTo(0, savedScrollY)
      }
    }
  }, [isOpen])
}
