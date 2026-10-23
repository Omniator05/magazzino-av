// Novità mostrate nel popup "cosa è cambiato" (vedi WhatsNewModal.jsx) — non
// un log di ogni commit, solo i cambiamenti che chi usa l'app noterebbe
// davvero. La più recente per prima. `version` è solo un'etichetta leggibile
// per capire fino a dove un dispositivo ha già visto (confronto lessicografico
// di stringhe: usa sempre 'YYYY-MM-DD', mai un formato che cambi ordine) — non
// deve corrispondere all'hash di build (__APP_VERSION__, usato solo per il
// piccolo avviso di riserva quando non c'è nessuna voce nuova da mostrare).
export const CHANGELOG = [
  {
    version: '2026-10-24',
    it: {
      title: 'Novità di oggi',
      items: [
        'Postazione magazzino (piani a pagamento): un account per il PC fisso con lettore USB. La home mostra eventi da preparare, montaggi, smontaggi e inizio/fine dei rent; scansionando un\'etichetta si apre la scheda dell\'oggetto con "Rotto", "Con difetto" e "Riparato"',
        'Badge personale: dal Profilo mostri il tuo QR e lo passi sul lettore, così carichi e segnali a tuo nome. Esci da solo dopo 20 minuti; guardare è libero, per segnare qualcosa serve il badge',
        'Segnalazione problemi in due passi nel Magazzino: prima "Con difetto" o "Rotto", poi i dettagli. Il numero del pezzo compare solo per oggetti con pochi pezzi',
        'Rent: solo un admin può terminarli. Quando è tutto rientrato compare il tag "Da chiudere" e gli admin ricevono una notifica',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Warehouse station (paid plans): an account for the fixed PC with a USB reader. Home shows events to prepare, set-ups, tear-downs and rent starts/ends; scanning a label opens the item card with "Broken", "Defective" and "Repaired"',
        'Personal badge: show your QR from Profile and scan it on the reader, so loading and reports are made under your name. You are signed out after 20 minutes; browsing is free, marking anything needs the badge',
        'Reporting problems in two steps in the Warehouse: first "Defective" or "Broken", then the details. The piece number only appears for items with few pieces',
        'Rents: only an admin can end them. When everything is back a "To close" tag appears and admins get a notification',
      ],
    },
  },
  {
    version: '2026-10-23',
    it: {
      title: 'Novità di oggi',
      items: [
        'Personale esterno senza account: crei un utente temporaneo, gli mandi un link e vede solo i suoi turni, gli orari e la lista di carico',
        'Caricamento parziale nella lista di carico: scegli quanti pezzi hai caricato, gli altri restano mancanti',
        'Lista di carico dei magazzinieri riordinata, con selezione per lista e categoria e barra azioni fissa in alto su computer',
        'Calendario: tag "Ultimo giorno" sui rent, orari nelle card su telefono; correzione della pagina che restava bloccata',
        'Pagina d\'errore con "Torna alla home" e segnalazione via email già compilata',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'External staff without an account: create a temporary user, send a link and they only see their own shifts, hours and loading list',
        'Partial loading in the loading list: choose how many pieces you loaded, the rest stay missing',
        'Warehouse workers\' loading list reordered, with selection by list and category and a fixed actions bar at the top on desktop',
        'Calendar: "Last day" tag on rents, hours on cards on phone; fixed the page that stayed stuck',
        'Error page with "Go to home" and a pre-filled email report',
      ],
    },
  },
  {
    version: '2026-10-18',
    it: {
      title: 'Novità di oggi',
      items: [
        'Oggetti "Con difetto" e pezzi numerati: dal tasto Segnala indichi rotti, difetti e il numero esatto del pezzo (es. pointe n° 7), con descrizione',
        'Magazzinieri: Seleziona (o pressione lunga) nella lista di carico per segnare più oggetti mancanti, rientrati in parte o rotti',
        'Nuovo foglio dei bauli a schede: Contenuto, Stato e Collegati',
        'Calendario: negli eventi di più giorni ogni card mostra solo chi lavora quel giorno; su computer fino a 3 eventi per giorno',
        'Disponibilità nello Storico più precisa: conta anche i pezzi già fuori dal magazzino',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Items "With a defect" and numbered pieces: use Report to set broken, defects and the exact piece number (e.g. moving head no. 7), with a description',
        'Warehouse workers: Select (or long press) in the loading list to mark several items missing, partly returned or broken',
        'New tabbed case sheet: Contents, Status and Linked',
        'Calendar: on multi-day events each card shows only who works that day; up to 3 events per day on desktop',
        'More accurate availability in History: it also counts pieces already out of the warehouse',
      ],
    },
  },
  {
    version: '2026-10-16',
    it: {
      title: 'Novità di oggi',
      items: [
        'Tema scuro: dal Profilo scegli Chiaro, Scuro o Automatico (predefinito, segue il dispositivo)',
        'Nuove home per admin e magazzinieri con sezioni "Oggi" e "Da vedere"; l\'uscita dall\'app ora è in fondo al Profilo',
        'Magazzinieri su computer: calendario del mese con colonna dei dettagli e timeline della settimana, in sola lettura',
        'Archivio rifatto con dettaglio e lista di carico in una colonna (computer) o in un foglio (telefono); form eventi più ordinato; assenze gestibili dall\'admin per tutti',
        'Liste di carico: Seleziona più comodo, quantità tipo 6x5, pulsanti con caricamento; notifiche non più doppie',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Dark mode: pick Light, Dark or Automatic (default, follows your device) from your Profile',
        'New home pages for admins and warehouse workers with "Today" and "Needs attention" sections; logging out is now at the bottom of the Profile',
        'Warehouse workers on desktop: month calendar with a details column and the weekly timeline, read-only',
        'Archive redesigned with details and loading list in a column (desktop) or a sheet (phone); a tidier event form; admins can manage absences for everyone',
        'Loading lists: easier selection, quantities like 6x5, buttons with progress; no more duplicate notifications',
      ],
    },
  },
  {
    version: '2026-10-14',
    it: {
      title: 'Novità di oggi',
      items: [
        '"Assegna personale" rifatta: card bianche su griglia pulita, giornata intera, ricerca del personale con i 5 più usati, e una colonna laterale per assegnare con orario preciso e nota su cosa fare. Le attività possono scavalcare la mezzanotte e montaggi/smontaggi hanno orari propri',
        'Calendario su computer: colonna laterale per creare, modificare ed eliminare eventi senza finestre, rubrica dei referenti che si ricorda i contatti, ricerca con i futuri prima, montaggi e smontaggi visibili nel giorno selezionato',
        'Magazzinieri: in home la sezione "Oggi" con gli eventi e i montaggi/smontaggi di oggi (blu e arancione), e nel calendario le proprie attività con orario e nota',
        'Nuova barra di navigazione fluttuante con la pagina attuale in rilievo, calendario da telefono rinnovato, "Assegna" anche da telefono dalla lista di carico, e per i magazzinieri le liste di carico si aprono su "Tutte"',
        'Notifiche: avviso a chi viene assegnato o cambia orario, una sola notifica per la lista di carico modificata, popup delle assenze solo dopo il caricamento',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        '"Assign staff" redesigned: white cards on a clean grid, the whole day, staff search with the 5 most used, and a side column to assign with exact hours and a note on what to do. Tasks can go past midnight and setup/teardown have their own hours',
        'Calendar on desktop: side column to create, edit and delete events without pop-ups, a contacts directory that remembers contacts, search with upcoming first, setups and teardowns visible on the selected day',
        'Warehouse workers: a "Today" section on the home page with today\'s events and setups/teardowns (blue and orange), and their own tasks with hours and note in the calendar',
        'New floating navigation bar with the current page raised, refreshed phone calendar, "Assign" from your phone inside the loading list, and workers\' loading lists open on "All"',
        'Notifications: alert for whoever is assigned or has a time change, a single notification for an edited loading list, absence pop-ups only after loading',
      ],
    },
  },
  {
    version: '2026-10-06',
    it: {
      title: 'Novità di oggi',
      items: [
        'Liste di carico: selezione multipla ridisegnata (su telefono bottoni flottanti più chiari, furgone assegnato da un elenco, cambia stato in blocco), liste collassabili per non scorrere sempre tutto, le nuove compaiono in cima e la lista principale non si elimina più per sbaglio (solo rinominare)',
        'Si può segnalare un\'assenza di poche ore invece di tutta la giornata, e l\'admin può registrarne una per conto di un magazziniere dalla sua pagina ore di lavoro',
        '"Assegna personale" ricorda settimana e filtri se si esce e si torna, ora mostra l\'orario sopra le colonne, e su un evento di più giorni si può impostare un orario diverso per ciascun giorno (si vede anche in calendario e nella lista di carico)',
        'I rent/install scaduti non restano più nascosti: saltano in cima alla lista eventi, arancioni, con un promemoria dedicato per non dimenticarsi di chiuderli',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Loading lists: redesigned multi-select (clearer floating buttons on phone, vehicle assignment from a list, bulk status change), collapsible lists so you don\'t always scroll through everything, new lists show up first, and the main list can no longer be deleted by mistake (only renamed)',
        'You can report an absence of just a few hours instead of a whole day, and admins can log one on a warehouse worker\'s behalf from their hours page',
        '"Assign staff" remembers the week and filters you had open, now shows the time above the columns, and a multi-day event can have different hours set for each day (also reflected in the calendar and the loading list)',
        'Expired rent/installs no longer stay hidden: they jump to the top of the events list, in orange, with a dedicated reminder so closing them doesn\'t get forgotten',
      ],
    },
  },
  {
    version: '2026-10-04',
    it: {
      title: 'Novità di oggi',
      items: [
        'Il calendario ha una nuova sezione "Assegna personale": una timeline settimanale con le ore per assegnare i magazzinieri (anche esterni) a eventi, montaggi/smontaggi e rent/install con l\'orario preciso',
        'Si possono assegnare anche furgoni esterni (noleggiati) nella lista di carico, non solo quelli di flotta',
        'Furgoni e oggetti importanti possono avere scadenze (assicurazione, revisione, bollo...) con promemoria automatico in calendario',
        'Gli eventi possono avere un orario di inizio e fine preciso, non solo "tutto il giorno"',
        'Il calendario del magazziniere ora si legge come quello admin: card con il nome dell\'evento, anteprima al tocco, rent/install lunghi solo su inizio e fine',
        'Nella home del magazziniere, l\'evento a cui sei assegnato è evidenziato in rosso con il tag "Assegnato a te"',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'The calendar has a new "Assign staff" section: a weekly hourly timeline to assign warehouse staff (including external people) to events, setup/teardown and rent/install, with precise times',
        'External (rented) vans can now be assigned in the loading list, not just fleet ones',
        'Vans and important items can now have deadlines (insurance, inspection, road tax...) with an automatic calendar reminder',
        'Events can now have a precise start and end time, not just "all day"',
        'The warehouse calendar now looks like the admin one: cards with the event name, a tap-to-preview, long rents/installs only on start and end day',
        'On the warehouse home page, the event you\'re assigned to is highlighted in red with an "Assigned to you" tag',
      ],
    },
  },
  {
    version: '2026-09-17',
    it: {
      title: 'Novità di oggi',
      items: [
        'Promemoria: il modulo "Ore di lavoro" è attivabile per tutta la squadra',
        'Furgoni: l\'avviso "occupato" ora scatta se il furgone è già caricato su un altro evento, e dice sempre su quale evento',
        'Liste di carico: se aggiungi un oggetto già impegnato su un altro evento nello stesso periodo, un avviso te lo dice subito — puoi aggiungere solo il disponibile o procedere comunque',
        'Magazzino: nuova pagina "Storico e disponibilità" per ogni oggetto — cronologia completa, verifica la disponibilità per una data a piacere, e crea subito una lista di carico con quell\'oggetto già dentro',
        'Magazzino: ora si può segnare il peso e il consumo di picco sugli oggetti importanti',
        'Il documento di trasporto (PDF della lista di carico) è più curato: date e firme più chiare',
        'La card di un evento mostra Pronti/Caricati/Rientrati con il conteggio invece di restare ferma su "in lista"; gli eventi di più giorni mostrano l\'intervallo di date',
        'Un avviso in alto ti dice quando c\'è una versione nuova dell\'app pronta',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Reminder: the "Work hours" module is activatable by default for the whole team',
        'Vehicles: the "busy" warning now triggers when a vehicle is already loaded on another event, and always names which event',
        'Loading lists: adding an item already committed to another event in the same period now warns you right away — add just what\'s free, or go ahead anyway',
        'Warehouse: new "History and availability" page for each item — full history, check availability for any date, and create a loading list with that item already in it',
        'Warehouse: you can now record weight and peak power draw on important items',
        'The transport document (loading list PDF) is more polished: clearer dates and signatures',
        'An event card now shows Ready/Loaded/Returned with counts instead of staying stuck on "in list"; multi-day events show the date range',
        'A banner at the top tells you when a new app version is ready',
      ],
    },
  },
  {
    version: '2026-09-15',
    it: {
      title: 'Novità di oggi',
      items: [
        'Ore di lavoro: ogni persona ha ora una pagina propria con ore, assenze e ferie',
        'Le assenze si possono modificare (non solo cancellare) — chi le ha segnalate viene avvisato se cambi le date',
        'I furgoni si possono eliminare per davvero, non solo disattivare',
        'Un indicatore in alto avvisa quando sei offline — le modifiche si salvano comunque e partono al ritorno della rete',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Work hours: everyone now has their own page with hours, absences and vacation days',
        "Absences can be edited (not just deleted) — whoever reported one is notified if you change the dates",
        'Vehicles can now be deleted for real, not just deactivated',
        'A banner at the top warns you when you\'re offline — changes still save and go out once you\'re back online',
      ],
    },
  },
]
