// Novità dell'app, mostrate agli utenti in "Novità" (pages/Novita.jsx, aperta
// dal profilo). Dalla più recente alla più vecchia. Scrivere per chi usa
// l'app, non per chi la sviluppa: cosa si può fare ora, non cosa è cambiato
// nel codice. Ogni voce ha `kind`: 'new' (novità) oppure 'fix' (correzione).
// Aggiungere una release IN CIMA: il suo `id` decide anche quando il profilo
// mostra il badge "Nuovo" a chi non l'ha ancora aperta.
export const CHANGELOG = [
  {
    id: '2026-10-23',
    date: '2026-10-23',
    title: { it: 'Link per il personale esterno, caricamento parziale e lista di carico rifatta', en: 'Links for external staff, partial loading and a reworked loading list' },
    items: [
      {
        kind: 'new',
        title: { it: 'Link per il personale esterno', en: 'Links for external staff' },
        text: {
          it: 'Chi lavora a chiamata non ha più bisogno di un account: crei un utente temporaneo (da Impostazioni › Utenti, scegliendo "Utente temporaneo", oppure trascinando "Esterno" su un evento in Assegna personale) e gli mandi un link. Vede solo i suoi turni con gli orari, i dettagli dell\'evento e la lista di carico, in sola lettura. Dopo aver salvato un esterno ti viene chiesto se invitarlo. Dalla scheda dell\'utente puoi rinominarlo, eliminarlo o creare un nuovo link.',
          en: 'People who work on call no longer need an account: create a temporary user (from Settings › Users by choosing "Temporary user", or by dragging "External" onto an event in Assign staff) and send them a link. They only see their own shifts with hours, the event details and the loading list, read-only. After saving an external person you are asked whether to invite them. From their card you can rename them, delete them or create a new link.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Caricamento parziale', en: 'Partial loading' },
        text: {
          it: 'Nella lista di carico, da Seleziona (o con una pressione lunga) c\'è ora "Caricamento parziale": indichi quanti pezzi hai caricato. In magazzino scendono solo quelli; gli altri restano segnati come mancanti. Resta anche il rientro parziale e il "rientrato rotto".',
          en: 'In the loading list, Select (or a long press) now has "Partial loading": enter how many pieces you loaded. Only those come off the warehouse stock; the rest stay marked as missing. Partial return and "returned broken" are still there.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Lista di carico più comoda per i magazzinieri', en: 'A more comfortable loading list for warehouse workers' },
        text: {
          it: 'La pagina è riordinata: lettore QR, contatore dei mancanti, ricerca con Seleziona e poi la lista (l\'inserimento manuale del codice non c\'è più: si segna "Pronto" dalla riga). Selezionando si può scegliere tutta la lista o una categoria con una casella; su computer la barra delle azioni resta in alto mentre scorri, anche per gli admin. Nella scheda Scarico gli oggetti mancanti non si vedono più.',
          en: 'The page has a new order: QR reader, missing counter, search with Select, then the list (manual code entry is gone: mark "Ready" from the row). When selecting you can pick the whole list or one category with a checkbox; on desktop the actions bar stays at the top while you scroll, for admins too. Missing items are hidden in the Return tab.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario: ultimo giorno del rent e orari su telefono', en: 'Calendar: last day of a rent and hours on phone' },
        text: {
          it: 'Sull\'ultimo giorno di un rent su più giorni compare il tag "Ultimo giorno". Su telefono le card degli eventi mostrano anche gli orari (e quelli di montaggio e smontaggio). In "Assegna personale" togliere una persona richiede il Salva, e un esterno nuovo si scrive direttamente nella card.',
          en: 'On the last day of a multi-day rent a "Last day" tag appears. On phone, event cards also show their hours (and setup and teardown hours). In "Assign staff" removing a person needs Save, and a new external person is typed straight into the card.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Correzioni', en: 'Fixes' },
        text: {
          it: 'Risolto un difetto che a volte lasciava la pagina del calendario bloccata e troppo alta. Il "+" della pagina Eventi su computer apre il calendario già in creazione. La pagina d\'errore ora porta alla home e permette di segnalare il problema via email con i dettagli già inseriti. Nelle policy è indicato che l\'app è stata sviluppata anche con l\'aiuto dell\'intelligenza artificiale.',
          en: 'Fixed a bug that sometimes left the calendar page stuck and too tall. The "+" on the Events page on desktop opens the calendar already in creation mode. The error page now goes to the home page and lets you report the problem by email with the details already filled in. The policies now state that the app was also built with the help of artificial intelligence.',
        },
      },
    ],
  },
  {
    id: '2026-10-18',
    date: '2026-10-18',
    title: { it: 'Oggetti con difetto, selezione per i magazzinieri, nuovo foglio dei bauli', en: 'Items with defects, selection for warehouse workers, new case sheet' },
    items: [
      {
        kind: 'new',
        title: { it: 'Oggetti "Con difetto" e pezzi numerati', en: 'Items "With a defect" and numbered pieces' },
        text: {
          it: 'Oltre a "rotto" ora c\'è "con difetto": l\'oggetto resta utilizzabile ma ha un problema. Dal tasto "Segnala" del dettaglio scegli quanti pezzi sono rotti o difettosi, aggiungi una descrizione e, per gli oggetti con più pezzi (es. 24 pointe), il numero esatto del pezzo: così sai quale non prendere. Ogni segnalazione si chiude da sola con "Risolto". Gli admin ricevono una notifica con nome, numero e descrizione.',
          en: 'Besides "broken" there is now "with a defect": the item stays usable but has a problem. From the "Report" button in the details, choose how many pieces are broken or defective, add a description and, for items with many pieces (e.g. 24 moving heads), the exact piece number so you know which one not to take. Each report is closed on its own with "Resolved". Admins get a notification with name, number and description.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Seleziona anche per i magazzinieri', en: 'Select for warehouse workers too' },
        text: {
          it: 'Nella lista di carico, "Seleziona" (o una pressione lunga su un oggetto) permette di segnare più oggetti insieme come mancanti, rientrati in parte o rientrati rotti, con la stessa barra degli admin. Per i rotti puoi aggiungere una descrizione.',
          en: 'In the loading list, "Select" (or a long press on an item) lets you mark several items at once as missing, partly returned or returned broken, with the same bar admins have. You can add a description for broken items.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Nuovo foglio dei bauli', en: 'New case (kit) sheet' },
        text: {
          it: 'Creare o modificare un baule è più chiaro: tre schede, Contenuto (dati e componenti), Stato (pezzi mancanti baule per baule) e Collegati.',
          en: 'Creating or editing a case is clearer: three tabs, Contents (details and components), Status (missing pieces case by case) and Linked.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario: ogni giorno la sua squadra', en: 'Calendar: each day has its own crew' },
        text: {
          it: 'Negli eventi di più giorni la card di un giorno mostra solo le persone assegnate a quel giorno, con il loro orario. Su computer ogni giorno della griglia mostra fino a 3 eventi.',
          en: 'On multi-day events, a day\'s card shows only the people assigned to that day, with their hours. On desktop each day in the grid shows up to 3 events.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Disponibilità più precisa', en: 'More accurate availability' },
        text: {
          it: 'Il controllo disponibilità dello Storico tiene conto anche di cosa è già fuori dal magazzino: un pezzo caricato per un evento futuro (montaggio anticipato) non risulta più libero oggi. Il risultato ora dice "n disponibili" invece di "n/n".',
          en: 'The availability check in History now also considers what is already out of the warehouse: a piece loaded for a later event (early setup) is no longer shown as free today. The result now reads "n available" instead of "n/n".',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Pagina evento più stabile', en: 'More stable event page' },
        text: {
          it: 'Corretto un errore che poteva bloccare la pagina di un evento; se una pagina ha un problema ora compare un messaggio con "Torna alla home" invece di una schermata bianca.',
          en: 'Fixed an error that could block an event page; if a page has a problem you now see a message with "Go to home" instead of a blank screen.',
        },
      },
    ],
  },
  {
    id: '2026-10-16',
    date: '2026-10-16',
    title: { it: 'Tema scuro, nuove home, Archivio e calendario anche per i magazzinieri', en: 'Dark mode, new home pages, Archive and a calendar for warehouse workers too' },
    items: [
      {
        kind: 'new',
        title: { it: 'Tema scuro', en: 'Dark mode' },
        text: {
          it: 'Dal Profilo, nel nuovo gruppo "Aspetto", puoi scegliere Chiaro, Scuro o Automatico (segue il tema del telefono o del computer, ed è quello predefinito). Vale per tutta l\'app, dalla barra di navigazione alla schermata di caricamento.',
          en: 'From your Profile, in the new "Appearance" group, you can pick Light, Dark or Automatic (it follows your phone or computer, and is the default). It applies to the whole app, from the navigation bar to the loading screen.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Nuove home per admin e magazzinieri', en: 'New home pages for admins and warehouse workers' },
        text: {
          it: 'Header bianco con il cielo che cambia durante la giornata (sole o luna e meteo), sezioni "Oggi", "Da vedere" e "Prossimi", strumenti in una fila compatta e, su computer, i numeri chiave in alto. L\'uscita dall\'app ora sta in fondo al Profilo, e un pallino rosso sull\'avatar segnala le novità.',
          en: 'A white header with a sky that follows the day (sun or moon and weather), "Today", "Needs attention" and "Upcoming" sections, tools in a compact row and, on desktop, key numbers at the top. Logging out is now at the bottom of the Profile, and a red dot on the avatar flags what\'s new.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario e timeline anche per i magazzinieri su computer', en: 'Calendar and timeline for warehouse workers on desktop' },
        text: {
          it: 'Chi usa un computer fisso vede il calendario del mese con la colonna dei dettagli (eventi, lista di carico, persone assegnate) e la timeline della settimana, in sola lettura. Le proprie assenze si segnalano e si modificano da lì.',
          en: 'On a desktop computer workers get the month calendar with a details column (events, loading list, assigned people) and the weekly timeline, read-only. They can report and edit their own absences there.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Archivio rifatto', en: 'Archive redesigned' },
        text: {
          it: 'Le card mostrano data, nome e luogo; un tocco apre tutti i dettagli e la lista di carico, con "Elimina" e "Usa lista" sempre in vista: in una colonna a destra su computer, in un foglio a scorrimento su telefono.',
          en: 'Cards show date, name and place; a tap opens every detail and the loading list, with "Delete" and "Use list" always in view: in a column on the right on desktop, in a scrollable sheet on phones.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Creazione e modifica eventi più ordinate', en: 'Tidier event creation and editing' },
        text: {
          it: 'Stesso modulo su computer e telefono: nome, luogo, "Quando" con inizio, fine e orario in un riquadro solo, note, e righe a comparsa per Ripeti, Montaggio/smontaggio e Riferimento. Scegliendo la data di fine il calendario parte dall\'inizio e mostra la durata mentre scorri.',
          en: 'One form on desktop and phone: name, place, a single "When" box with start, end and time, notes, and collapsible rows for Repeat, Setup/teardown and Reference. When you pick the end date the calendar starts from the start date and shows the duration as you hover.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Assenze: l\'admin le gestisce per tutti', en: 'Absences: admins manage them for everyone' },
        text: {
          it: 'Dalla colonna del Calendario l\'admin può registrare un\'assenza per un\'altra persona ("Per chi"), modificarla o eliminarla. Ogni assenza mostra tipo, date, orari e motivo.',
          en: 'From the Calendar column admins can record an absence for someone else ("For"), edit it or delete it. Each absence shows type, dates, hours and reason.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Timeline più ordinata', en: 'A tidier timeline' },
        text: {
          it: 'Le card hanno tutte la stessa altezza, con gli avatar delle persone assegnate (un puntino arancione segnala un orario diverso). Per creare un\'attività premi su uno spazio libero: compare l\'anteprima, un secondo clic conferma ed esce dalla creazione; Esc o tasto destro annullano.',
          en: 'Cards all have the same height, with avatars of assigned people (an orange dot flags a different time). To create a task click an empty spot: a preview appears, a second click confirms and leaves creation; Esc or right-click cancels.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Liste di carico: Seleziona più comodo', en: 'Loading lists: easier selection' },
        text: {
          it: 'Furgoni e stati si scelgono con bottoni dedicati (con "+ Esterno"), una spunta seleziona una lista intera, ogni bottone mostra subito un caricamento, e nei campi quantità puoi scrivere ad esempio 6x5 per ottenere 30.',
          en: 'Vehicles and statuses are picked with dedicated buttons (including "+ External"), one tick selects a whole list, every button shows progress right away, and in quantity fields you can type e.g. 6x5 to get 30.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Task, Scanner, Furgoni, Template, Impostazioni e Magazzino', en: 'Tasks, Scanner, Vehicles, Templates, Settings and Warehouse' },
        text: {
          it: 'Tutte le pagine hanno lo stesso header, le stesse card e gli stessi fogli, compresa la vista Magazzino per chi non può modificarlo. Sul telefono dei magazzinieri la barra di navigazione sparisce nella lista di carico, per distrarre meno.',
          en: 'All these pages share the same header, cards and sheets, including the read-only Warehouse view. On warehouse workers\' phones the navigation bar hides inside the loading list, to be less distracting.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Notifiche non più doppie', en: 'No more duplicate notifications' },
        text: {
          it: 'Nuovo evento, lista modificata e montaggio assegnato arrivano ora una volta sola.',
          en: 'New event, edited list and assigned setup now arrive only once.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Rent futuri e orari delle persone', en: 'Future rentals and people\'s hours' },
        text: {
          it: 'Un rent in programma più avanti non compare più tra gli eventi di oggi. Le persone aggiunte a un\'attività prendono l\'orario dell\'attività e lo seguono se lo modifichi.',
          en: 'A rental scheduled for later no longer shows among today\'s events. People added to a task take the task\'s hours and follow them if you change them.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Pulsanti che restavano in caricamento', en: 'Buttons stuck on loading' },
        text: {
          it: 'Premendo "Annulla" dopo "Elimina" in Seleziona, il pulsante non resta più bloccato. Il caricamento parte solo dopo la tua conferma.',
          en: 'Pressing "Cancel" after "Delete" in Select no longer leaves the button stuck. Loading only starts after you confirm.',
        },
      },
    ],
  },
  {
    id: '2026-10-14',
    date: '2026-10-14',
    title: { it: 'Nuova "Assegna personale", colonna laterale nel Calendario e sezione "Oggi"', en: 'New "Assign staff", Calendar side column and a "Today" section' },
    items: [
      {
        kind: 'new',
        title: { it: '"Assegna personale" completamente rifatta', en: '"Assign staff" completely redesigned' },
        text: {
          it: 'Card bianche che fluttuano su una griglia pulita, giornata intera 00:00–23:59, ricerca del personale con le 5 persone più usate sempre a portata di mano e una barra più ordinata. Trascina una persona su una card per assegnarla, oppure tocca la card: si apre una colonna con i dettagli, il personale assegnato, l\'orario preciso di ciascuno e una nota su cosa deve fare. Le attività libere si creano toccando due celle e possono anche scavalcare la mezzanotte (es. 23:00–02:00). La pagina non scorre più: è la griglia a scorrere, con le intestazioni dei giorni ferme in alto.',
          en: 'White cards floating on a clean grid, the whole day 00:00–23:59, staff search with your 5 most-used people always at hand and a tidier bar. Drag a person onto a card to assign them, or tap the card: a side column opens with the details, the assigned staff, each person\'s exact hours and a note on what they have to do. Free tasks are created by tapping two cells and can even go past midnight (e.g. 23:00–02:00). The page no longer scrolls: the grid does, with the day headers pinned at the top.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Montaggi e smontaggi con orari propri', en: 'Setup and teardown with their own hours' },
        text: {
          it: 'Ogni montaggio e smontaggio ha la sua card, con orario e persone indipendenti dall\'evento (di default il montaggio finisce quando inizia l\'evento e lo smontaggio parte quando finisce). L\'orario si cambia dalla colonna laterale e compare anche in calendario e al magazziniere.',
          en: 'Every setup and teardown has its own card, with hours and people independent from the event (by default setup ends when the event starts and teardown begins when it ends). The time is changed from the side column and also shows up in the calendar and to the warehouse worker.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario: colonna laterale e niente più modal', en: 'Calendar: side column, no more pop-ups' },
        text: {
          it: 'Su computer il giorno selezionato si legge in una colonna a destra: da lì si crea un evento al volo, si modifica o si elimina un evento senza aprire finestre, e si segnala un\'assenza (con l\'orario, se parziale). Nuova rubrica dei referenti: il nome, il telefono e l\'email di chi ricorre spesso (es. il referente di una fiera) si propongono da soli la volta dopo. La ricerca eventi mostra prima i futuri e poi i passati, e nel giorno selezionato ora si vedono anche montaggi e smontaggi.',
          en: 'On desktop the selected day is read in a column on the right: from there you create an event on the fly, edit or delete one without opening windows, and report an absence (with the time, if partial). New contacts directory: the name, phone and email of recurring contacts (e.g. a trade fair\'s organizer) are suggested next time. Event search lists upcoming events first and past ones after, and the selected day now also shows setups and teardowns.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Per i magazzinieri: sezione "Oggi" e le proprie attività', en: 'For warehouse workers: "Today" section and their own tasks' },
        text: {
          it: 'In home, in cima, la sezione "Oggi" raccoglie gli eventi di oggi e i montaggi/smontaggi di oggi — anche se l\'evento è la settimana dopo — con la data in blu per il montaggio e arancione per lo smontaggio, così si vede subito che la lista di carico è da preparare. Nel calendario si vedono le attività assegnate con il proprio orario e la propria nota.',
          en: 'On the home page, at the top, a "Today" section gathers today\'s events and today\'s setups/teardowns — even if the event itself is the following week — with the date in blue for setup and orange for teardown, so it\'s clear the loading list needs preparing. The calendar shows assigned tasks with your own hours and note.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Notifiche più utili e meno rumorose', en: 'More useful, quieter notifications' },
        text: {
          it: 'Chi viene assegnato a un\'attività, a un montaggio o a uno smontaggio riceve una notifica con giorno e orario, e se l\'orario cambia viene avvisata solo la persona interessata. Quando una lista di carico viene modificata arriva una sola notifica invece di una per oggetto.',
          en: 'Anyone assigned to a task, setup or teardown gets a notification with the day and time, and if the time changes only the person concerned is notified. When a loading list is edited you get a single notification instead of one per item.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Nuova barra di navigazione e calendario da telefono rinnovato', en: 'New navigation bar and refreshed phone calendar' },
        text: {
          it: 'La barra in basso ora è fluttuante: la pagina attuale è un cerchio che sporge sopra la barra, le altre icone sono piccole e si ingrandiscono al passaggio del mouse. Il calendario da telefono prende lo stesso stile del desktop (griglia a tutta larghezza con righe sottili, mese al centro con "Oggi").',
          en: 'The bottom bar is now floating: the current page is a circle popping above the bar, the other icons are small and grow on hover. The phone calendar takes the same style as desktop (full-width grid with thin lines, month in the centre with "Today").',
        },
      },
      {
        kind: 'new',
        title: { it: 'Assegna personale anche da telefono, dalla lista di carico', en: 'Assign staff from your phone, inside the loading list' },
        text: {
          it: 'Dal bottone "Assegna" di un evento, su telefono, si apre un foglio con i giorni dell\'evento e il montaggio/smontaggio: aggiungi persone con un tocco, dai a ciascuna un orario preciso e una nota su cosa deve fare.',
          en: 'From an event\'s "Assign" button, on phone, a sheet opens with the event\'s days and setup/teardown: add people with a tap, give each one exact hours and a note on what to do.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Liste di carico: per i magazzinieri si parte da "Tutte"', en: 'Loading lists: workers start from "All"' },
        text: {
          it: 'Quando un evento ha più liste, il magazziniere apre sempre la vista che le raggruppa tutte; le liste singole sono solo un filtro, e si può restare su una lista già completa per controllarla.',
          en: 'When an event has several lists, the worker always opens the view that groups them all; single lists are just a filter, and you can stay on an already completed list to check it.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Popup delle assenze dopo il caricamento', en: 'Absence pop-ups after loading' },
        text: {
          it: 'L\'avviso che un magazziniere ha segnalato o modificato un\'assenza compariva sopra l\'animazione di avvio: ora esce solo quando il caricamento è finito.',
          en: 'The notice that a worker reported or changed an absence used to appear on top of the startup animation: it now shows only once loading has finished.',
        },
      },
    ],
  },
  {
    id: '2026-10-06',
    date: '2026-10-06',
    title: { it: 'Selezione multipla ridisegnata, assenze a ore e orari su misura per gli eventi lunghi', en: 'Redesigned multi-select, hourly absences and custom hours for multi-day events' },
    items: [
      {
        kind: 'new',
        title: { it: 'Selezione multipla ridisegnata nelle liste di carico', en: 'Redesigned multi-select in loading lists' },
        text: {
          it: 'Un solo bottone "Seleziona" al posto di azioni separate: su telefono i bottoni restano flottanti e ben visibili sopra la lista (shift+clic e Esc su computer), il furgone si sceglie da un elenco invece che da una select piccola, e lo stato (pronto/caricato/rientrato) si può cambiare su tutti gli oggetti selezionati in un colpo solo.',
          en: 'One "Select" button instead of separate actions: on phone the buttons stay floating and clearly visible above the list (shift+click and Esc on desktop), the vehicle is picked from a list instead of a small dropdown, and the status (ready/loaded/returned) can be changed on all selected items at once.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Liste di carico più comode da gestire', en: 'Loading lists, easier to manage' },
        text: {
          it: 'Ogni lista si può chiudere e riaprire per non dover scorrere oltre quelle su cui non si sta lavorando; una lista appena creata compare subito in cima invece che in fondo. La lista principale non si può più eliminare per sbaglio — resta sempre possibile rinominarla.',
          en: 'Each list can be collapsed and reopened so you don\'t have to scroll past the ones you\'re not working on; a newly created list now shows up first instead of last. The main list can no longer be deleted by mistake — it can still be renamed.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Assenza di poche ore, non solo tutta la giornata', en: 'A few hours off, not just a whole day' },
        text: {
          it: 'Segnalando un\'assenza di un solo giorno ora si può scegliere un orario preciso (es. solo la mattina) invece che per forza l\'intera giornata. L\'admin può anche registrare un\'assenza per conto di un magazziniere dalla sua pagina ore di lavoro, utile quando viene avvisato a voce.',
          en: 'When reporting a single-day absence you can now set a precise time range (e.g. just the morning) instead of always the whole day. Admins can also log an absence on a warehouse worker\'s behalf from their hours page, handy when told about it in person.',
        },
      },
      {
        kind: 'new',
        title: { it: '"Assegna personale" ricorda la vista e mostra l\'orario', en: '"Assign staff" remembers the view and shows the time' },
        text: {
          it: 'La settimana e i filtri (eventi/rent-install/fasi) restano quelli impostati se si esce dalla pagina e si torna indietro, invece di ripartire sempre da oggi. Sopra ogni colonna ora c\'è un riferimento orario, prima assente.',
          en: 'The week and filters (events/rent-install/phases) stay as set if you leave the page and come back, instead of always starting over from today. Each column now has a time reference above it, missing before.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Orario su misura per ogni giorno di un evento lungo', en: 'Custom hours for each day of a multi-day event' },
        text: {
          it: 'Un evento di più giorni non impegna più l\'intera giornata su ogni data che tocca: toccando il titolo della sua card in "Assegna personale" si può impostare un orario diverso per quel giorno specifico (es. montaggio la mattina, spettacolo la sera). Si vede anche nel riepilogo del calendario e nella lista di carico dell\'evento.',
          en: 'A multi-day event no longer takes up the whole day on every date it spans: tapping its card\'s title in "Assign staff" lets you set different hours for that specific day (e.g. setup in the morning, show in the evening). It also shows up in the calendar summary and in the event\'s loading list.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Rent/install scaduti più visibili', en: 'Expired rent/installs are more visible' },
        text: {
          it: 'Un rent/install il cui noleggio è terminato ora sale in cima alla lista eventi, arancione come le card "da scaricare", invece di restare nella sua sezione senza saltare all\'occhio. Un nuovo promemoria avvisa quando ce n\'è uno da chiudere.',
          en: 'A rent/install whose rental period has ended now jumps to the top of the events list, orange like "to unload" cards, instead of staying in its own section without standing out. A new reminder flags when one needs closing.',
        },
      },
    ],
  },
  {
    id: '2026-10-04',
    date: '2026-10-04',
    title: { it: 'Nuova timeline per assegnare il personale, furgoni esterni e scadenze', en: 'New staff-assignment timeline, external vans and deadlines' },
    items: [
      {
        kind: 'new',
        title: { it: 'Assegna personale su una timeline oraria', en: 'Assign staff on an hourly timeline' },
        text: {
          it: 'La sezione "Assegna personale" del calendario è ora una griglia settimanale con le ore: trascina (o tocca) un magazziniere su un evento, una fase di montaggio/smontaggio o un rent/install per assegnarlo con l\'orario preciso — vale anche per il personale esterno, non registrato nell\'app. Si possono creare anche attività libere toccando due celle vuote, che compaiono poi anche nel calendario normale.',
          en: 'The calendar\'s "Assign staff" section is now a weekly hourly grid: drag (or tap) a warehouse worker onto an event, a setup/teardown phase or a rent/install to assign them with a precise time — works for external staff too, not just people registered in the app. Free tasks can also be created by tapping two empty cells, and then show up in the regular calendar too.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Furgoni esterni nella lista di carico', en: 'External vans in the loading list' },
        text: {
          it: 'Si può assegnare anche un furgone esterno (noleggiato), non solo quelli di flotta — resta in un elenco riutilizzabile per la prossima volta, come già succede per il personale esterno.',
          en: 'You can now also assign an external (rented) van, not just fleet ones — it\'s saved to a reusable list for next time, same as external staff.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Scadenze su furgoni e oggetti di magazzino', en: 'Deadlines on vans and warehouse items' },
        text: {
          it: 'Furgoni e oggetti importanti possono avere scadenze libere (assicurazione, revisione, bollo...) con un promemoria automatico che compare in calendario.',
          en: 'Vans and important items can now have free-form deadlines (insurance, inspection, road tax...) with an automatic reminder that shows up in the calendar.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Orario preciso sugli eventi', en: 'Precise time on events' },
        text: {
          it: 'Un evento può avere un orario di inizio e fine preciso in fase di creazione, non solo "tutto il giorno".',
          en: 'An event can now have a precise start and end time when created, not just "all day".',
        },
      },
      {
        kind: 'new',
        title: { it: 'Calendario del magazziniere uguale a quello admin', en: 'Warehouse calendar matching the admin one' },
        text: {
          it: 'Stessa veste grafica dell\'admin: card con il nome dell\'evento invece dei puntini colorati, un tocco su un giorno apre l\'anteprima dell\'evento con orari e assegnati, i rent/install lunghi compaiono solo su inizio e fine invece di occupare ogni giorno.',
          en: 'Same look as the admin calendar: cards with the event name instead of colored dots, tapping a day opens the event preview with times and who\'s assigned, long rents/installs only show on their start and end day instead of filling every day in between.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Evento a cui sei assegnato in evidenza nella home', en: 'Your assigned event stands out on the home page' },
        text: {
          it: 'Nella home del magazziniere, l\'evento a cui sei assegnato ha un bordo rosso e il tag "Assegnato a te", per riconoscerlo a colpo d\'occhio tra gli altri.',
          en: 'On the warehouse home page, the event you\'re assigned to has a red border and an "Assigned to you" tag, so it stands out from the rest.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Ordine degli eventi del giorno', en: 'Order of the day\'s events' },
        text: {
          it: 'Toccando una data, gli eventi a cui sei assegnato compaiono per primi, poi gli altri eventi, poi i rent/install — per admin e magazziniere.',
          en: 'Tapping a date, events you\'re assigned to show up first, then other events, then rents/installs — for both admin and warehouse staff.',
        },
      },
      {
        kind: 'new',
        title: { it: 'Montaggio o smontaggio lo stesso giorno dell\'evento', en: 'Setup or teardown on the same day as the event' },
        text: {
          it: 'Se il montaggio o lo smontaggio cade lo stesso giorno dell\'evento, ora si vedono entrambi, con un tag "Evento" accanto a quello della fase — prima uno dei due spariva.',
          en: 'If setup or teardown falls on the same day as the event, both now show, with an "Event" tag next to the phase one — before, one of the two used to disappear.',
        },
      },
      {
        kind: 'fix',
        title: { it: 'Assegnazione a montaggio/smontaggio', en: 'Assigning to setup/teardown' },
        text: {
          it: 'Corretto un bug che impediva di assegnare un magazziniere a una fase di montaggio o smontaggio dalla nuova timeline.',
          en: 'Fixed a bug that prevented assigning a warehouse worker to a setup or teardown phase from the new timeline.',
        },
      },
    ],
  },
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
