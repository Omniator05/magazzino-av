// Novità dell'app, mostrate agli utenti in "Novità" (pages/Novita.jsx, aperta
// dal profilo). Dalla più recente alla più vecchia. Scrivere per chi usa
// l'app, non per chi la sviluppa: cosa si può fare ora, non cosa è cambiato
// nel codice. Ogni voce ha `kind`: 'new' (novità) oppure 'fix' (correzione).
// Aggiungere una release IN CIMA: il suo `id` decide anche quando il profilo
// mostra il badge "Nuovo" a chi non l'ha ancora aperta.
export const CHANGELOG = [
  {
    id: '2026-10-01',
    date: '2026-10-01',
    title: { it: 'Liste di carico più intelligenti e nuovo evento più veloce', en: 'Smarter loading lists and a faster new event' },
    items: [
      {
        kind: 'new',
        title: { it: 'Liste separate in Pronto/Carico, tutte insieme nello Scarico', en: 'Separate lists in Ready/Load, merged in Return' },
        text: {
          it: 'La sera si scarica di corsa senza guardare da quale lista viene ogni pezzo: in Scarico tutte le liste dell\'evento si vedono insieme per default, con i bottoni delle singole liste che restano come filtro se serve.',
          en: 'In the evening things get unloaded fast without checking which list each piece came from: in Return all of the event\'s lists show together by default, with each list\'s button still there as an optional filter.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Cambio lista automatico', en: 'Automatic list switching' },
        text: {
          it: 'In Pronto e Carico, finita una lista lo scanner passa da solo alla prossima non ancora completa, con un avviso.',
          en: 'In Ready and Load, once a list is finished the scanner switches on its own to the next incomplete one, with a notice.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Un solo scan per rientrare più pezzi', en: 'One scan returns several items' },
        text: {
          it: 'In Scarico, scansionando un oggetto generico presente su più liste rientrano insieme tutte le unità ancora da rientrare, non serve più scansionare lista per lista.',
          en: 'In Return, scanning a generic item that appears on several lists returns every unit still outstanding at once — no need to scan it once per list anymore.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Nuovo evento più veloce', en: 'Faster new event' },
        text: {
          it: '"+" apre subito il form vuoto invece di chiedere prima se vuoto o da template — il template si può comunque aggiungere dopo dalla pagina evento.',
          en: '"+" now opens the blank form right away instead of asking blank-or-template first — a template can still be applied afterwards from the event page.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Data evento in un solo campo', en: 'Event date in a single field' },
        text: {
          it: 'Tocca un giorno per un evento di un giorno solo, un secondo giorno diverso per un periodo — un campo in meno da compilare.',
          en: 'Tap one day for a single-day event, a second different day for a date range — one field less to fill in.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Riferimento preventivo e responsabile evento', en: 'Quote reference and event manager' },
        text: {
          it: 'Ogni evento può avere un riferimento preventivo e un responsabile con telefono ed email — visibili in cima alla pagina evento, toccando il numero parte la chiamata.',
          en: 'Every event can have a quote reference and a manager with phone and email — shown at the top of the event page, tapping the number starts a call.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario: eventi prima, rent/install dopo', en: 'Calendar: events first, rent/install after' },
        text: {
          it: 'Aprendo un giorno, gli eventi normali compaiono sempre prima dei rent/install.',
          en: 'Opening a day, regular events now always appear before rent/installations.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Rent e installazioni lunghi meno invadenti nel calendario', en: 'Long rents and installations take up less room on the calendar' },
        text: {
          it: 'Un rent che dura mesi non riempie più ogni giorno del mese: nella griglia compare solo a inizio e fine, ma toccando un giorno qualunque dell\'intervallo si vede comunque.',
          en: 'A rent that lasts months no longer fills every day of the month: in the grid it only shows on its start and end day, but tapping any day within its span still reveals it.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Scarico bloccato su "già pronto"', en: 'Return stuck on "already ready"' },
        text: {
          it: 'Se la fotocamera restava aperta cambiando fase, continuava a segnare tutto come "pronto" invece che come rientrato — ora la fase si aggiorna subito, senza dover riavviare la fotocamera.',
          en: 'If the camera stayed open while switching phase, it kept marking everything as "ready" instead of returned — the phase now updates right away, no need to restart the camera.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Scansione sulla lista sbagliata', en: 'Scan landing on the wrong list' },
        text: {
          it: 'Con lo stesso oggetto su più liste, uno scan poteva completare in silenzio la riga sulla lista sbagliata invece di quella su cui si stava lavorando.',
          en: 'With the same item on several lists, a scan could silently complete the row on the wrong list instead of the one actually being worked on.',
        },
      },
    ],
  },
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
