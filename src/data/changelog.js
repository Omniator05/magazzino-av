// Novità dell'app, mostrate agli utenti in "Novità" (pages/Novita.jsx, aperta
// dal profilo). Dalla più recente alla più vecchia. Scrivere per chi usa
// l'app, non per chi la sviluppa: cosa si può fare ora, non cosa è cambiato
// nel codice. Ogni voce ha `kind`: 'new' (novità) oppure 'fix' (correzione).
// Aggiungere una release IN CIMA: il suo `id` decide anche quando il profilo
// mostra il badge "Nuovo" a chi non l'ha ancora aperta.
export const CHANGELOG = [
  {
    id: '2026-09-25',
    date: '2026-09-25',
    title: { it: 'Liste multiple, oggetti collegati e scheda oggetto a pagine', en: 'Multiple lists, linked items and a paged item sheet' },
    items: [
      {
        kind: 'new',
        title: { it: 'Più liste di carico per evento', en: 'Multiple loading lists per event' },
        text: {
          it: 'Crea una lista per ogni tendone o per ciò che manca, da "+ Nuova lista" accanto ad "Assegna". "Sposta i non caricati in una nuova lista" separa quello che resta da caricare senza doverlo segnare a mano. Lo scanner ha una scheda per lista e il PDF una tabella per lista.',
          en: 'Create a list for each tent or for what is missing, from "+ New list" next to "Assign". "Move unloaded items to a new list" splits off what is left to load without marking it by hand. The scanner has a tab per list and the PDF a table per list.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Oggetti collegati con quantità', en: 'Linked items with quantities' },
        text: {
          it: 'Per ogni oggetto collegato scegli la quantità e quando aggiungerlo: "A ogni oggetto" (4 gambe per ogni pedana: 10 pedane, 40 gambe) oppure "Una sola volta" (una bolla per evento, qualunque sia il numero di pedane). Vale anche per i kit.',
          en: 'For each linked item pick the quantity and when to add it: "Per item" (4 legs per platform: 10 platforms, 40 legs) or "Only once" (one spirit level per event, however many platforms). Works for kits too.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Scheda oggetto a pagine', en: 'Paged item sheet' },
        text: {
          it: 'La prima pagina resta corta. "Dettagli oggetto" raccoglie peso, consumo, portata, larghezza, lunghezza, altezza (in metri) e numero di serie; "Oggetti collegati" ha la sua pagina.',
          en: 'The first page stays short. "Item details" gathers weight, power, load capacity, width, length, height (in metres) and serial number; "Linked items" has its own page.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Controllo disponibilità con calendario a intervallo', en: 'Availability check with a range calendar' },
        text: {
          it: 'Nella pagina di un oggetto scegli il periodo su un solo calendario: tocca il primo giorno, poi un secondo per estendere l\'intervallo. Da lì "Crea evento" ti fa scegliere tra evento e rent/install.',
          en: 'On an item\'s page pick the period on a single calendar: tap the first day, then a second one to extend the range. From there "Create event" lets you choose between event and rent/install.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Quantità modificata su un oggetto già caricato', en: 'Quantity changed on an already loaded item' },
        text: {
          it: 'Cambiando la quantità di un oggetto già caricato il carico viene annullato e la giacenza torna disponibile: al prossimo carico si aggiorna con la quantità giusta.',
          en: 'Changing the quantity of an already loaded item cancels the load and gives the stock back: the next load updates it with the right quantity.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Dall\'archivio si riparte da zero', en: 'Reusing an archived event starts fresh' },
        text: {
          it: 'Un evento riusato dall\'archivio ha tutti gli oggetti senza pronto, carico o rientro.',
          en: 'An event reused from the archive has every item without ready, loaded or returned status.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Disponibilità degli oggetti già fuori', en: 'Availability of items already out' },
        text: {
          it: 'Un oggetto già uscito (per esempio in un\'installazione senza data di fine) ora risulta impegnato nel controllo disponibilità. Chiudere un rent/install ripristina anche i componenti dei kit.',
          en: 'An item already out (for example in an installation with no end date) now counts as committed in the availability check. Closing a rent/install also restores kit components.',
        },
      },
    ],
  },
  {
    id: '2026-09-22',
    date: '2026-09-22',
    title: { it: 'Rientro parziale e rent/install', en: 'Partial return and rent/install' },
    items: [
      {
        kind: 'new',
        title: { it: 'Rientro parziale', en: 'Partial return' },
        text: {
          it: 'Se di 4 piastre ne sono rientrate solo 2, segna rientrate quelle 2 e le altre restano fuori (solo in fase Rientro).',
          en: 'If only 2 of 4 plates came back, mark those 2 as returned and the rest stay out (in the Return phase only).',
        },
      },
      {
        kind: 'new',
        title: { it: 'Rent e installazioni scaduti', en: 'Expired rents and installations' },
        text: {
          it: 'Un rent o un\'installazione scaduti compaiono in cima tra i "Da scaricare" e i magazzinieri possono chiuderli una volta rientrato tutto.',
          en: 'An expired rent or installation appears at the top under "To unload" and warehouse staff can close it once everything is back.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Categorie riordinate', en: 'Reordered categories' },
        text: {
          it: 'Audio e microfoni sono vicini, poi video, poi luci e strutture.',
          en: 'Audio and microphones sit together, then video, then lights and rigging.',
        },
      },
    ],
  },
]

export const LATEST_CHANGELOG_ID = CHANGELOG[0].id
