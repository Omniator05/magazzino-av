// Novità mostrate nel popup "cosa è cambiato" (vedi WhatsNewModal.jsx) — non
// un log di ogni commit, solo i cambiamenti che chi usa l'app noterebbe
// davvero. La più recente per prima. `version` è solo un'etichetta leggibile
// per capire fino a dove un dispositivo ha già visto (confronto lessicografico
// di stringhe: usa sempre 'YYYY-MM-DD', mai un formato che cambi ordine) — non
// deve corrispondere all'hash di build (__APP_VERSION__, usato solo per il
// piccolo avviso di riserva quando non c'è nessuna voce nuova da mostrare).
export const CHANGELOG = [
  {
    version: '2026-11-05',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichetta piccola rifatta sulle misure vere della cartuccia 41×13 mm: QR e nome nel rettangolo, numero del pezzo (o posizione) nel cerchio, tutto dentro la zona che la stampante raggiunge davvero',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Small label redone to the real size of the 41×13 mm cartridge: QR and name in the rectangle, piece number (or location) in the circle, all inside the area the printer actually reaches',
      ],
    },
  },
  {
    version: '2026-11-04',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichette piccole: nelle impostazioni di stampa c\'è "Stampa etichetta di prova (righello)", che stampa un righello sull\'adesivo per misurare con precisione dove cade il rettangolo e il cerchio',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Small labels: the print settings now have "Print test label (ruler)", which prints a ruler on the sticker so the rectangle and circle can be measured precisely',
      ],
    },
  },
  {
    version: '2026-11-03',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichetta piccola 27×15 mm: ora è un QR con nome, posizione e numero del pezzo accanto, molto più facile da leggere con il lettore',
        'Rotto / Con difetto: due pulsanti "Segnala rotto" e "Segnala difetto" aprono un popup con quanti pezzi, i pezzi numerati con il loro problema e un commento. Gli admin ricevono la notifica con il testo completo',
        'Disponibilità di un oggetto: un solo campo "Periodo" a calendario, tocca un secondo giorno per cercare più giorni (prima su telefono usciva dalla pagina)',
        'Postazione magazzino: tolta la tab "Ore" (il timer delle ore non serve lì)',
        'Notifiche: se il testo non arriva, la notifica dice comunque di aprire l\'app, e il servizio di notifiche si aggiorna da solo ad ogni apertura',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Small 27×15 mm label: now a QR with the name, location and piece number next to it, much easier to scan',
        'Broken / Defective: two buttons, "Report broken" and "Report defect", open a popup with how many pieces, the numbered pieces with their problem, and a comment. Admins get a notification with the full text',
        'Item availability: a single "Period" calendar field, tap a second day to check several days (on phones it used to overflow the page)',
        'Warehouse station: removed the "Hours" tab (the hours timer is not needed there)',
        'Notifications: if the text does not arrive, the notification still tells you to open the app, and the notification service now updates itself on every launch',
      ],
    },
  },
  {
    version: '2026-11-02',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichetta con codice a barre 41×13 mm: il codice a barre ora occupa tutta la larghezza (moduli doppi) e si legge con facilità; in alto nome e posizione, sotto il codice scritto',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        '41×13 mm barcode label: the barcode now spans the full width (double-width bars) and scans easily; name and location on top, the written code underneath',
      ],
    },
  },
  {
    version: '2026-11-01',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichette: la posizione è molto più grande e con un segnaposto disegnato (prima l\'emoji usciva a macchia). Il QR passa a 30 mm per lasciare più spazio al testo',
        'Stampa diretta: un solo pulsante "Stampa l\'etichetta". Per un oggetto da 2 a 20 pezzi chiede se stampare tutte le etichette numerate, solo un numero o quella generale; oltre 20 pezzi stampa subito la generale',
        'Etichette con codice a barre per la cartuccia 41×13 mm: nome e codice a barre nel rettangolo, posizione e numero del pezzo nel cerchio. Il codice a barre non contiene più "WAV-" (l\'app lo riconosce comunque alla scansione)',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Labels: the location is much larger and has a drawn pin (the emoji used to print as a blob). The QR is now 30 mm to leave more room for text',
        'Direct printing: a single "Print label" button. For an item with 2 to 20 pieces it asks whether to print all numbered labels, just one number, or the general one; over 20 pieces it prints the general label straight away',
        'Barcode labels for the 41×13 mm cartridge: name and barcode in the rectangle, location and piece number in the circle. The barcode no longer contains "WAV-" (the app still recognises it when scanned)',
      ],
    },
  },
  {
    version: '2026-10-31',
    it: {
      title: 'Novità di oggi',
      items: [
        'Stampa diretta delle etichette sulla stampante MakeID: dalla finestra "Scarica etichetta" compare il pulsante Stampa (un pezzo o tutti i pezzi), se sul computer è acceso il servizio di stampa MakeID. Serve installarlo una volta sul PC di magazzino',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Direct label printing on the MakeID printer: the "Download label" window shows a Print button (one piece or all pieces) when the MakeID print service is running on the computer. It needs to be installed once on the warehouse PC',
      ],
    },
  },
  {
    version: '2026-10-30',
    it: {
      title: 'Novità di oggi',
      items: [
        'Etichette: ora si possono scaricare da tutti, anche dalla vista dei magazzinieri e dalla postazione (scheda dell\'oggetto → Etichetta)',
        'Postazione: chi si collega con badge o codice e può gestire il magazzino vede il magazzino completo (aggiungi, modifica, elimina); gli oggetti aggiunti portano il suo nome',
        'Postazione: corretto il tag in alto a destra che a volte restava grande dopo il codice a 4 cifre, e la pagina che si rompeva scansionando un codice sconosciuto',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Labels: anyone can now download them, including from the warehouse staff view and the station (item card → Label)',
        'Station: whoever signs in with a badge or code and can manage the warehouse sees the full warehouse (add, edit, delete); items they add carry their name',
        'Station: fixed the top-right tag sometimes staying large after the 4-digit code, and the page breaking when scanning an unknown code',
      ],
    },
  },
  {
    version: '2026-10-29',
    it: {
      title: 'Novità di oggi',
      items: [
        'Magazzino su computer: la scheda oggetto e i moduli (nuovo oggetto, kit, modifica) si aprono in una colonna a destra, larga fino a due terzi dello schermo. Un clic fuori la chiude; se hai cambiato qualcosa chiede "Salvare le modifiche?". Lo storico e il controllo disponibilità (Da / A) stanno nella colonna',
        'Stessa colonna, con la stessa richiesta di salvataggio, per nuovo utente, nuovo evento, modifica evento e task',
        'Task: card compatte con la casella per completare, animazione della spunta, e sotto "Completata da …" con data e ora; su telefono si tocca la card per modificare, su computer c\'è il menu ⋮',
        'Attività di oggi con a chi sono assegnate nella home dei magazzinieri e nella postazione, con il bottone Completa; alla postazione c\'è anche un "din" di conferma',
        'Scheda utente: puoi cambiare l\'email di accesso. Il creatore della squadra può nominare altri admin come creatori',
        'Tornando indietro nelle pagine si riparte da dove si era; aprendo una pagina nuova si parte dall\'alto',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Warehouse on desktop: the item card and forms (new item, kit, edit) open in a right-hand column up to two thirds of the screen wide. Click outside to close it; if you changed something it asks "Save your changes?". History and the availability check (From / To) live in the column',
        'The same column, with the same save prompt, for new user, new event, edit event and tasks',
        'Tasks: compact cards with a checkbox, a drawn check animation, and "Completed by …" with date and time; on phones tap the card to edit, on desktop there is a ⋮ menu',
        "Today's tasks with who they're assigned to on the warehouse staff home and at the station, with a Complete button; the station also plays a confirmation \"ding\"",
        "User card: you can change the sign-in email. The team creator can appoint other admins as creators",
        'Going back through pages returns you to where you were; opening a new page starts at the top',
      ],
    },
  },
  {
    version: '2026-10-28',
    it: {
      title: 'Novità di oggi',
      items: [
        'Postazione magazzino: ora si collega con un link e un QR da stampare (Utenti → Postazione magazzino), senza nome utente né password, così ogni azienda ha il suo. Il PC di magazzino scansiona il foglio e basta',
        'Codice personale a 4 cifre: alla postazione basta digitare i 4 numeri (li trovi nel Profilo, sotto il QR) invece di mostrare il badge. I codici banali come 1234 o 0000 non vengono mai assegnati',
        'Attività di oggi nella home dei magazzinieri e nella postazione, con a chi sono assegnate: chi è assegnato le completa con un tocco',
        'Creatore della squadra: chi l\'ha creata vede l\'abbonamento e crea o gestisce gli altri admin, con l\'etichetta "Creatore". Ora si può creare un admin direttamente dal nuovo utente',
        'Il backup dei dati ora sta in fondo a Impostazioni → Profilo squadra',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Warehouse station: it now connects with a printable link and QR (Users → Warehouse station), with no username or password, so every company has its own. The warehouse PC scans the sheet and that\'s it',
        'Personal 4-digit code: at the station just type the 4 digits (you\'ll find them in your Profile, under the QR) instead of showing your badge. Obvious codes like 1234 or 0000 are never assigned',
        'Today\'s tasks on the warehouse staff home and at the station, showing who they\'re assigned to: the assigned people complete them with a tap',
        'Team creator: whoever created the team sees the subscription and creates or manages the other admins, with a "Creator" tag. You can now create an admin straight from the new user form',
        'Data backup now lives at the bottom of Settings → Team profile',
      ],
    },
  },
  {
    version: '2026-10-27',
    it: {
      title: 'Novità di oggi',
      items: [
        'Backup dei dati: da Impostazioni → Backup dei dati scarichi in un file tutto quello che ha la squadra (oggetti, eventi, liste, persone, turni, storico), con la data dell\'ultimo backup',
        'Accesso con l\'email: i nuovi utenti entrano con la loro email e dalla pagina di accesso possono reimpostare da soli la password con "Password dimenticata?". Gli utenti già creati restano con il nome utente finché non li passi all\'email dalla loro scheda',
        'Reimposta password via email più affidabile: usa l\'email vera dell\'account e, se qualcosa non va, mostra il motivo all\'admin',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Data backup: from Settings → Data backup you download everything your team has (items, events, lists, people, shifts, history) in one file, with the date of the last backup',
        'Email sign-in: new users sign in with their email and can reset their own password from the sign-in page with "Forgot your password?". Existing users keep their username until you move them to email from their card',
        'More reliable password reset by email: it uses the account\'s real email and, if something fails, shows the admin why',
      ],
    },
  },
  {
    version: '2026-10-26',
    it: {
      title: 'Novità di oggi',
      items: [
        'Liste di carico: copia e incolla degli oggetti da una lista all\'altra (Seleziona → Copia, poi "Incolla", anche con ⌘/Ctrl+C e ⌘/Ctrl+V). L\'avviso di disponibilità ora guarda solo se l\'oggetto è già in un\'altra lista negli stessi giorni dell\'evento',
        'Accesso e registrazione: tema chiaro o scuro in base al dispositivo, errori sotto ogni campo, occhio per vedere la password con indicatore di robustezza e nuova animazione di creazione account',
        'Pagine rifatte: Abbonamento, Profilo squadra e Preferenze; riga Abbonamento in evidenza finché non ti abboni; la guida "Per iniziare" porta alle pagine giuste e fa lampeggiare il "+"',
        'Magazzino con le categorie aperte di default; home delle squadre nuove con gli strumenti a tutta altezza',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Loading lists: copy and paste items between lists (Select → Copy, then "Paste", also with ⌘/Ctrl+C and ⌘/Ctrl+V). The availability warning now only checks whether the item is already in another list on the same days as the event',
        'Sign-in and sign-up: light or dark theme following your device, errors under each field, an eye to show the password with a strength meter, and a new account-creation animation',
        'Redesigned pages: Subscription, Team profile and Preferences; the Subscription row stands out until you subscribe; the "Getting started" guide opens the right pages and makes the "+" blink',
        'Warehouse categories open by default; new teams\' home with full-height tools',
      ],
    },
  },
  {
    version: '2026-10-25',
    it: {
      title: 'Novità di oggi',
      items: [
        'Archivio: la ricerca cerca in tutti gli eventi passati, per nome o luogo, senza badare agli accenti e con più parole; le parole trovate sono evidenziate e c\'è un contatore dei risultati',
        'Calendario su computer: un clic sulla card apre la lista di carico e la sigla "Modifica" apre la modifica; i rent lunghi compaiono nella timeline solo il primo e l\'ultimo giorno',
        'Chi lavora su un evento o un\'attività si vede con le iniziali colorate nelle card e nei riepiloghi (con nome e orario al passaggio del mouse o al tocco), anche per i magazzinieri e su telefono',
        'Nelle home i rent di oggi hanno un colore rosso-viola; sulla Postazione magazzino anche le task richiedono il badge e il badge ha una nuova animazione di ingresso e uscita',
      ],
    },
    en: {
      title: "Today's updates",
      items: [
        'Archive: search now covers all past events, by name or location, ignoring accents and with several words; matches are highlighted and there\'s a result counter',
        'Calendar on desktop: clicking a card opens the loading list and the "Edit" tag opens editing; long rents show in the timeline only on the first and last day',
        'Who works on an event or task now shows as coloured initials on cards and summaries (name and hours on hover or tap), also for warehouse workers and on phone',
        'On the home pages today\'s rents get a red-violet colour; on the Warehouse station tasks also need the badge, and the badge has a new sign-in and sign-out animation',
      ],
    },
  },
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
