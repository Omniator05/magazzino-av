// Piccola "chicca" nascosta sotto i placeholder di pagina vuota — pensata
// per non far sembrare una pagina senza contenuti una pagina rotta o morta.
// Scelta in modo deterministico dal giorno dell'anno: cambia ogni giorno ma
// resta la stessa per tutta la giornata, senza bisogno di salvare nessuno
// stato né di far "lampeggiare" una frase diversa a ogni render.
function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

export function pickDailyQuip(list) {
  if (!list || list.length === 0) return ''
  return list[dayOfYear() % list.length]
}
