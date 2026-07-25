import { auth, db } from '../firebase'
import { signInWithEmailAndPassword, deleteUser, signOut, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

/**
 * Un account Auth "orfano" nasce quando la creazione utente riesce ma il
 * passo successivo (scrittura del profilo/della squadra) fallisce a metà —
 * l'email risulta "già in uso" per sempre, senza che esista alcun profilo,
 * bloccando chiunque riprovi con la stessa email.
 *
 * Lato client non si può eliminare un account arbitrario altrui (serve
 * l'Admin SDK). Ma se chi riprova è la STESSA persona con la STESSA
 * password del tentativo fallito, possiamo autenticarci come quell'account,
 * verificare che non abbia un profilo (= è davvero orfano) ed eliminarlo
 * da lì — un utente può sempre cancellare se stesso.
 *
 * Ritorna true se l'orfano è stato ripulito (si può ritentare la creazione
 * con la stessa email/password). Ritorna false se non si può fare nulla in
 * automatico: password diversa dal tentativo originale (non verificabile),
 * oppure l'email appartiene a un account reale e già completo.
 */
export async function tryReclaimOrphanedEmail(email, password) {
  let cred
  try {
    cred = await signInWithEmailAndPassword(auth, email, password)
  } catch {
    return false // password diversa: non possiamo verificare la proprietà, non tocchiamo nulla
  }

  const snap = await getDoc(doc(db, 'profiles', cred.user.uid))
  if (snap.exists()) {
    // Account reale (di questa o un'altra squadra) — non è un orfano da ripulire
    await signOut(auth)
    return false
  }

  await deleteUser(cred.user)
  return true
}

/**
 * Wrapper attorno a createUserWithEmailAndPassword usato da entrambi i flussi
 * di registrazione (crea squadra / unisciti): se l'email risulta già in uso,
 * tenta prima il recupero automatico dell'eventuale account orfano (vedi
 * sopra) e ritenta la creazione, invece di bloccare subito con l'errore.
 */
export async function createSignupUser(email, password) {
  try {
    return await createUserWithEmailAndPassword(auth, email, password)
  } catch (err) {
    if (err.code !== 'auth/email-already-in-use') throw err
    const reclaimed = await tryReclaimOrphanedEmail(email, password)
    if (!reclaimed) throw err
    return await createUserWithEmailAndPassword(auth, email, password)
  }
}
