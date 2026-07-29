// Bauli fisici di un kit: array `instances` sul documento kit in Firestore,
// uno per esemplare fisico (numerati 1..totalQty). Ogni baule porta con sé
// gli eventuali componenti mancanti/rotti SPECIFICI di quel baule fisico —
// stato persistente in magazzino (Inventory.jsx), non legato al singolo
// evento: se il baule 3 ha un faro rotto, lo stesso avviso ricompare in
// qualunque evento futuro gli venga assegnato (EventDetail.jsx), finché non
// lo si segna riparato.

// Riallinea l'array instances alla quantità attuale del kit: aggiunge bauli
// vuoti se la quantità è cresciuta, tronca quelli in eccesso se è calata —
// preservando lo stato dei bauli che restano (per numero, non per posizione).
export function ensureInstanceList(instances, qty) {
  const total = qty || 0
  const byNumber = new Map((instances || []).map(i => [i.number, i]))
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1
    return byNumber.get(n) || { number: n, brokenComponents: [] }
  })
}

// Sceglie `qty` bauli tra quelli del kit, preferendo quelli senza componenti
// mancanti; mantiene i numeri già in `currentNumbers` se ancora validi, così
// una piccola modifica (es. qty +1) non fa "saltare" tutta la selezione.
export function reconcileInstanceNumbers(kitInstances, currentNumbers, qty) {
  const valid = new Set((kitInstances || []).map(i => i.number))
  let kept = (currentNumbers || []).filter(n => valid.has(n))
  if (kept.length > qty) kept = kept.slice(0, qty)
  if (kept.length < qty) {
    const keptSet = new Set(kept)
    const candidates = [...(kitInstances || [])]
      .filter(i => !keptSet.has(i.number))
      .sort((a, b) => {
        const aBroken = (a.brokenComponents || []).length > 0
        const bBroken = (b.brokenComponents || []).length > 0
        if (aBroken !== bBroken) return aBroken ? 1 : -1
        return a.number - b.number
      })
    for (const c of candidates) {
      if (kept.length >= qty) break
      kept.push(c.number)
    }
  }
  return kept.sort((a, b) => a - b)
}

// True se almeno un baule del kit ha un componente segnato mancante/rotto —
// usato per il badge di avviso nella lista magazzino.
export function kitHasIncompleteInstance(item) {
  if (!item?.isBundle) return false
  return (item.instances || []).some(i => (i.brokenComponents || []).length > 0)
}
