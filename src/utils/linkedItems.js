import { rowListId } from './eventLists'

// Oggetti collegati: quando si aggiunge un oggetto (o un kit) a una lista di
// carico, altri oggetti vengono aggiunti da soli. Ogni collegamento ha una
// quantità e una modalità:
// - 'perUnit': `qty` per OGNI unità del genitore (10 pedane × 4 gambe = 40)
// - 'once':    `qty` in totale, una volta sola per evento (1 bolla anche con
//              10 pedane)
export const LINK_MODES = ['perUnit', 'once']

// Legge i collegamenti in un unico formato. Gli oggetti salvati prima di
// questa funzione hanno solo `linkedItemIds`: equivalgono a "stessa quantità
// del genitore" = 1 per unità, quindi il comportamento di sempre.
export const getLinkedItems = (item) => {
  if (Array.isArray(item?.linkedItems)) {
    return item.linkedItems
      .filter(l => l?.itemId)
      .map(l => ({
        itemId: l.itemId,
        qty: Math.max(1, parseInt(l.qty, 10) || 1),
        mode: l.mode === 'once' ? 'once' : 'perUnit',
      }))
  }
  return (item?.linkedItemIds || []).map(itemId => ({ itemId, qty: 1, mode: 'perUnit' }))
}

// Da scrivere su Firestore: `linkedItems` è la fonte di verità, `linkedItemIds`
// resta derivato così una versione vecchia dell'app ancora in cache continua
// a leggere qualcosa di sensato.
export const linkedItemsToFields = (links) => ({
  linkedItems: links.map(l => ({ itemId: l.itemId, qty: l.qty, mode: l.mode })),
  linkedItemIds: links.map(l => l.itemId),
})

// Cosa aggiungere al carrello insieme a `item` quando lo si aggiunge con
// `parentQty` unità. Salta ciò che c'è già:
// - perUnit: già nel carrello o già nella lista di destinazione (le gambe
//   servono a ogni lista che contiene pedane)
// - once: già nel carrello o in QUALUNQUE lista dell'evento (la bolla è una
//   per evento, non una per lista)
// Non è ricorsivo: un collegato non trascina i propri collegati.
export const linkedAdditionsFor = ({ item, parentQty, cartIds, targetListId, eventRows, allItems }) => {
  const inCart = new Set(cartIds)
  const catalogIdOf = e => e.itemRef || e.id
  const inTargetList = new Set(eventRows.filter(e => rowListId(e) === targetListId).map(catalogIdOf))
  const inEvent = new Set(eventRows.map(catalogIdOf))
  return getLinkedItems(item)
    .filter(l => l.itemId !== item.id && !inCart.has(l.itemId)
      && !(l.mode === 'once' ? inEvent : inTargetList).has(l.itemId))
    .map(l => ({ link: l, catalogItem: allItems.find(ci => ci.id === l.itemId) }))
    .filter(x => x.catalogItem)
    .map(({ link, catalogItem }) => ({
      catalogItem,
      mode: link.mode,
      perUnit: link.mode === 'perUnit' ? link.qty : null,
      qty: link.mode === 'perUnit' ? link.qty * parentQty : link.qty,
    }))
}
