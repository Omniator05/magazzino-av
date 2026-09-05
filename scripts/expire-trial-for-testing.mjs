// One-off: fa "scadere" la prova di una squadra di test, portando
// trialEndsAt a ieri — così isProPlan(team) torna false e si può testare
// subito il comportamento del piano gratuito senza aspettare 30 giorni veri.
// Trova la squadra per nome + verifica che l'admin corrisponda (email/
// username), per non toccare la squadra sbagliata per errore.
//
// Uso:
//   node scripts/expire-trial-for-testing.mjs --team "Prova" --admin-email mat@gmail.com --dry-run
//   node scripts/expire-trial-for-testing.mjs --team "Prova" --admin-email mat@gmail.com

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')

function loadServiceAccount() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('✗ Manca scripts/serviceAccountKey.json')
    process.exit(1)
  }
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const teamName = arg('--team')
  const adminEmail = arg('--admin-email')
  if (!teamName || !adminEmail) {
    console.error('✗ Uso: --team "<nome>" --admin-email <email>')
    process.exit(1)
  }

  console.log(dryRun ? '=== DRY RUN ===\n' : '=== SCADENZA PROVA ===\n')

  const app = initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore(app)

  const teamSnap = await db.collection('teams').where('name', '==', teamName).get()
  if (teamSnap.empty) {
    console.error(`✗ Nessuna squadra trovata con nome "${teamName}".`)
    process.exit(1)
  }
  if (teamSnap.size > 1) {
    console.error(`✗ Trovate ${teamSnap.size} squadre con questo nome, servono più dettagli.`)
    teamSnap.forEach(d => console.error(`  - ${d.id}`))
    process.exit(1)
  }
  const teamDoc = teamSnap.docs[0]
  const team = teamDoc.data()
  console.log(`Squadra: "${team.name}" (${teamDoc.id}) — billingStatus attuale: ${team.billingStatus}`)

  const profileSnap = await db.collection('profiles')
    .where('teamId', '==', teamDoc.id)
    .where('role', '==', 'admin')
    .get()
  const match = profileSnap.docs.find(d => (d.data().email || '').toLowerCase() === adminEmail.toLowerCase())
  if (!match) {
    console.error(`✗ Nessun admin con email "${adminEmail}" trovato in questa squadra. Admin presenti:`)
    profileSnap.forEach(d => console.error(`  - ${d.data().name} (${d.data().email || 'nessuna email'})`))
    process.exit(1)
  }
  console.log(`Admin verificato: ${match.data().name} (${match.data().email})`)

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  console.log(`\nNuovo trialEndsAt: ${yesterday.toISOString()} (ieri)`)

  if (dryRun) {
    console.log('\nFatto (nessuna scrittura eseguita).')
    process.exit(0)
  }

  await teamDoc.ref.update({ trialEndsAt: Timestamp.fromDate(yesterday) })
  console.log('\n✓ Prova scaduta. La squadra ora opera nel piano gratuito.')
  process.exit(0)
}

main().catch(err => { console.error('✗', err); process.exit(1) })
