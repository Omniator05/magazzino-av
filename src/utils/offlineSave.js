// Quando siamo offline, Firestore mette comunque la scrittura (updateDoc/
// addDoc/setDoc) in coda nella cache locale e la invia da sola al ritorno
// della rete — MA la Promise che quelle funzioni restituiscono non si
// risolve finché il server non conferma. Un `await` normale su quella
// Promise resterebbe quindi bloccato per tutta la durata dell'assenza di
// rete, facendo sembrare l'app ferma (modal che non si chiude, bottone
// bloccato su "salvataggio...") anche se il dato è già salvato in locale.
//
// Qui invece: se siamo online aspettiamo come sempre (comportamento
// invariato); se siamo offline NON aspettiamo — il chiamante prosegue
// subito (chiude il modal, mostra "si sincronizza al ritorno online"),
// mentre la scrittura resta in coda e arriva da sola quando torna la rete.
// Il chiamante deve aver già invocato updateDoc/addDoc/setDoc PRIMA di
// passare la Promise qui: questa funzione non la avvia, decide solo se
// aspettarla.
export function awaitIfOnline(writePromise, isOnline) {
  if (isOnline) return writePromise
  // Non propaghiamo un eventuale rifiuto tardivo (es. permessi negati) come
  // unhandled rejection — se il server la respinge una volta tornata la
  // rete, l'utente non è più lì ad aspettarla; le pagine che vogliono
  // reagire a quel caso restano libere di controllare la Promise originale.
  writePromise.catch(() => {})
  return Promise.resolve()
}
