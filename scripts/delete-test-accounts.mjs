// One-off: toglie gli account di PROVA (e, se richiesto, le squadre di prova) per poter riprovare la
// registrazione con la stessa email. Cancella anche l'account di accesso in Firebase Authentication, cosa che
// il pannello super admin non può fare (resta "email già in uso").
//
// Di base NON cancella niente: mostra solo cosa verrebbe tolto. Per eseguire serve --yes.
// Una squadra si toglie solo con --with-teams e solo se, oltre alle email indicate, non ha altri membri.
//
// Uso:
//   node scripts/delete-test-accounts.mjs --list
//   node scripts/delete-test-accounts.mjs --email mat@gmail.com --email mat+prova@gmail.com
//   node scripts/delete-test-accounts.mjs --email mat@gmail.com --with-teams
//   node scripts/delete-test-accounts.mjs --email mat@gmail.com --with-teams --yes
//
// Non tocca i file in Storage (loghi, contenuti organizzatore): se servono, si tolgono dalla console Firebase.

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')

// Collection con un campo teamId: i dati di una squadra (profiles e teams si gestiscono a parte).
const TEAM_SCOPED = [
  'items', 'events', 'tasks', 'templates', 'unavailability', 'vehicles', 'externalVehicles', 'brasserieWeeks',
  'brasserieArtists', 'googleCalendarEvents', 'eventOrganizerContent', 'assignmentBlocks', 'externalWorkers',
  'timeEntries', 'itemActivity', 'eventManagers', 'notifications', 'pushTokens', 'guestLinks', 'operatorBadges',
  'teamSecrets',
]

const args = process.argv.slice(2)
const has = f => args.includes(f)
const emails = args.flatMap((a, i) => (a === '--email' && args[i + 1] ? [args[i + 1].trim().toLowerCase()] : []))
const yes = has('--yes')
const withTeams = has('--with-teams')

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('✗ Manca scripts/serviceAccountKey.json')
  process.exit(1)
}
let serviceAccount
try { serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8')) } catch {
  console.error('✗ scripts/serviceAccountKey.json è vuoto o non valido. Scarica una chiave nuova: Firebase Console → Impostazioni progetto → Account di servizio → "Genera nuova chiave privata", e salvala con quel nome in scripts/.')
  process.exit(1)
}
const app = initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth(app)
const db = getFirestore(app)

async function deleteWhere(collection, field, value) {
  const snap = await db.collection(collection).where(field, '==', value).get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.size
}

async function listTeams() {
  const teams = await db.collection('teams').get()
  console.log(`\n${teams.size} squadre:\n`)
  for (const t of teams.docs) {
    const d = t.data()
    const members = await db.collection('profiles').where('teamId', '==', t.id).get()
    const owner = d.createdByUid ? (await db.collection('profiles').doc(d.createdByUid).get()).data() : null
    const created = d.createdAt?.toDate ? d.createdAt.toDate().toISOString().slice(0, 10) : '—'
    console.log(`• ${d.name}  (${t.id})  creata ${created}  da ${owner?.email || d.createdByUid || '—'}  membri: ${members.size}`)
  }
}

async function main() {
  if (has('--list')) return listTeams()
  if (emails.length === 0) {
    console.error('✗ Indica almeno una email con --email <indirizzo> (oppure usa --list per vedere le squadre).')
    process.exit(1)
  }
  console.log(yes ? '=== CANCELLAZIONE ===\n' : '=== ANTEPRIMA (non cancella niente) ===\n')

  // 1) Chi sono: l'account di accesso con quella email e/o i profili che la portano.
  const uids = new Set()
  for (const email of emails) {
    let authUid = null
    try { authUid = (await auth.getUserByEmail(email)).uid; uids.add(authUid) } catch { /* nessun account */ }
    const profs = await db.collection('profiles').where('email', '==', email).get()
    profs.docs.forEach(d => uids.add(d.id))
    console.log(`${email}: account di accesso ${authUid ? 'SÌ' : 'no'}, profili ${profs.size}`)
  }
  if (uids.size === 0) { console.log('\nNiente da fare: nessun account trovato.'); return }

  // 2) Squadre create da loro, e se si possono togliere (nessun altro membro).
  const teamsToDelete = []
  const teamsSkipped = []
  for (const uid of uids) {
    const owned = await db.collection('teams').where('createdByUid', '==', uid).get()
    for (const t of owned.docs) {
      const members = await db.collection('profiles').where('teamId', '==', t.id).get()
      const others = members.docs.filter(m => !uids.has(m.id))
      if (others.length === 0) teamsToDelete.push({ id: t.id, name: t.data().name })
      else teamsSkipped.push({ id: t.id, name: t.data().name, others: others.map(m => m.data().email || m.data().name || m.id) })
    }
  }

  console.log(`\nVerrebbero tolti ${uids.size} account di accesso con i loro profili, le richieste d'accesso e i token push.`)
  if (withTeams) {
    teamsToDelete.forEach(t => console.log(`  squadra "${t.name}" (${t.id}) con TUTTI i suoi dati`))
    if (teamsToDelete.length === 0) console.log('  nessuna squadra da togliere')
  } else if (teamsToDelete.length > 0) {
    console.log('Squadre di loro che restano (aggiungi --with-teams per toglierle):')
    teamsToDelete.forEach(t => console.log(`  "${t.name}" (${t.id})`))
  }
  teamsSkipped.forEach(t => console.log(`⚠ squadra "${t.name}" (${t.id}) NON si tocca: ha altri membri → ${t.others.join(', ')}`))

  if (!yes) {
    console.log('\nAnteprima finita. Se è tutto giusto, riesegui lo stesso comando aggiungendo --yes.')
    return
  }

  // 3) Esecuzione.
  if (withTeams) {
    for (const t of teamsToDelete) {
      for (const c of TEAM_SCOPED) {
        const n = await deleteWhere(c, 'teamId', t.id)
        if (n) console.log(`  ${c}: ${n} documenti tolti`)
      }
      await deleteWhere('profiles', 'teamId', t.id)
      await db.collection('teams').doc(t.id).delete()
      console.log(`✓ squadra "${t.name}" tolta`)
    }
  }
  for (const uid of uids) {
    await deleteWhere('notifications', 'requesterId', uid)
    await deleteWhere('pushTokens', 'userId', uid)
    await db.collection('profiles').doc(uid).delete()
    try { await auth.deleteUser(uid); console.log(`✓ account ${uid} tolto da Authentication`) }
    catch (e) { if (e.code !== 'auth/user-not-found') console.error(`✗ account ${uid}:`, e.message) }
  }
  console.log('\nFatto. Ora puoi registrarti di nuovo con le stesse email.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
