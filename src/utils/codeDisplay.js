// Preferenza squadra: quale codice generare/mostrare per gli oggetti di
// magazzino — 'qr' | 'barcode' | 'both'. Assente sui documenti team esistenti
// (retrocompatibile, equivale a 'both' come già oggi).
export const getCodeDisplay = (team) => team?.codeDisplay || 'both'
