// Novità mostrate nel popup "cosa è cambiato" (vedi WhatsNewModal.jsx) — non
// un log di ogni commit, solo i cambiamenti che chi usa l'app noterebbe
// davvero. La più recente per prima. `version` è solo un'etichetta leggibile
// per capire fino a dove un dispositivo ha già visto (confronto lessicografico
// di stringhe: usa sempre 'YYYY-MM-DD', mai un formato che cambi ordine) — non
// deve corrispondere all'hash di build (__APP_VERSION__, usato solo per il
// piccolo avviso di riserva quando non c'è nessuna voce nuova da mostrare).
export const CHANGELOG = [
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
