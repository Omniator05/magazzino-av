// Novità mostrate nel popup "cosa è cambiato" (vedi WhatsNewModal.jsx) — non
// un log di ogni commit, solo i cambiamenti che chi usa l'app noterebbe
// davvero. La più recente per prima. `version` è solo un'etichetta leggibile
// per capire fino a dove un dispositivo ha già visto (confronto lessicografico
// di stringhe: usa sempre 'YYYY-MM-DD', mai un formato che cambi ordine) — non
// deve corrispondere all'hash di build (__APP_VERSION__, usato solo per il
// piccolo avviso di riserva quando non c'è nessuna voce nuova da mostrare).
export const CHANGELOG = [
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
