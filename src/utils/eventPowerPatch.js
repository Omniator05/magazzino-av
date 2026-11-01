// Potenza e patch DMX di un evento, ricavati dalla lista di carico.
//
// I dati stanno sulle schede oggetto del magazzino: `peakPowerW` (consumo al
// carico massimo, in watt) e `dmxChannels` (canali DMX che il faro occupa).
// Un kit senza dati propri conta attraverso i suoi componenti, ciascuno con la
// quantità che ha dentro il kit.

// Righe "piatte" della lista: una per oggetto, nell'ordine della lista, con la
// quantità totale (kit espansi nei componenti). Le righe extra (scritte a mano,
// senza scheda in magazzino) non hanno dati: restano con watts/dmx null.
export function collectRows(eventItems, catalog) {
  const byId = new Map((catalog || []).map(i => [i.id, i]))
  const order = []
  const rows = new Map()
  const add = (id, name, qty, cat) => {
    if (!(qty > 0)) return
    const key = id || name
    const found = rows.get(key)
    if (found) { found.qty += qty; return }
    const row = { id: key, name, qty, watts: cat?.peakPowerW ?? null, dmx: cat?.dmxChannels ?? null }
    rows.set(key, row)
    order.push(row)
  }
  for (const it of eventItems || []) {
    const id = it.itemRef || it.id
    const qty = Number(it.qty) || 1
    const cat = byId.get(id)
    const comps = cat?.components || it.components
    const ownData = cat && (cat.peakPowerW != null || cat.dmxChannels != null)
    if (!ownData && Array.isArray(comps) && comps.length > 0) {
      for (const c of comps) {
        const cc = byId.get(c.itemId)
        add(c.itemId, cc?.name || c.name || '?', (Number(c.qty) || 1) * qty, cc)
      }
    } else {
      add(id, cat?.name || it.name || '?', qty, cat)
    }
  }
  return order
}

// Totale al carico massimo: somma potenza × quantità degli oggetti che hanno il dato.
export function powerSummary(rows) {
  const counted = rows.filter(r => r.watts > 0)
  const missing = rows.filter(r => !(r.watts > 0))
  const totalW = counted.reduce((sum, r) => sum + r.watts * r.qty, 0)
  return { totalW, counted, missing }
}

// Assegna gli indirizzi DMX uno dopo l'altro, nell'ordine della lista. Un faro non si spezza tra
// due universi: se non ci sta nei canali rimasti, parte dall'indirizzo 1 dell'universo dopo.
export function buildPatch(rows, { startUniverse = 1, startAddress = 1 } = {}) {
  const fixtures = rows.filter(r => r.dmx > 0)
  const patch = []
  const tooBig = []
  let universe = Math.max(1, startUniverse)
  let address = Math.min(512, Math.max(1, startAddress))
  for (const r of fixtures) {
    if (r.dmx > 512) { tooBig.push(r); continue }
    for (let n = 1; n <= r.qty; n++) {
      if (address + r.dmx - 1 > 512) { universe += 1; address = 1 }
      patch.push({
        label: r.qty > 1 ? `${r.name} ${n}` : r.name,
        channels: r.dmx,
        universe,
        address,
        end: address + r.dmx - 1,
      })
      address += r.dmx
    }
  }
  const universes = patch.length ? new Set(patch.map(p => p.universe)).size : 0
  return { patch, tooBig, universes }
}

export const SINGLE_PHASE_VOLTS = 230
export const formatAddr = n => String(n).padStart(3, '0')
