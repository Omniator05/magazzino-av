// Migrazione one-off: introduce il multi-tenant assegnando un `teamId` a tutti
// i documenti esistenti (creati prima del concetto di "squadra"), raggruppandoli
// nella squadra legacy "The Service Group". Idempotente: rilanciabile senza
// doppio lavoro, aggiorna solo i documenti che non hanno già un teamId.
//
// Uso:
//   node scripts/migrate-add-teamid.js --dry-run   → stampa i conteggi senza scrivere
//   node scripts/migrate-add-teamid.js             → esegue la migrazione

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')

const LEGACY_TEAM_NAME = 'The Service Group'
const BATCH_SIZE = 400 // sotto il limite di 500 operazioni/batch di Firestore

const COLLECTIONS = [
  'profiles', 'items', 'events', 'tasks', 'templates',
  'unavailability', 'brasserieWeeks', 'brasserieArtists',
  'googleCalendarEvents', 'eventOrganizerContent',
]

function loadServiceAccount() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('✗ Manca il file scripts/serviceAccountKey.json.')
    console.error('  Scaricalo da Firebase Console → ⚙️ Impostazioni progetto → Account di servizio → "Genera nuova chiave privata",')
    console.error(`  e salvalo esattamente come: ${SERVICE_ACCOUNT_PATH}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
}

async function findOrCreateLegacyTeam(db, dryRun) {
  const nameLower = LEGACY_TEAM_NAME.toLowerCase()
  const existing = await db.collection('teams').where('nameLower', '==', nameLower).limit(1).get()
  if (!existing.empty) {
    console.log(`✓ Squadra legacy già esistente: ${existing.docs[0].id} ("${LEGACY_TEAM_NAME}")`)
    return existing.docs[0].id
  }
  if (dryRun) {
    console.log(`[dry-run] Creerei la squadra legacy "${LEGACY_TEAM_NAME}"`)
    return '<dry-run-team-id>'
  }
  const ref = await db.collection('teams').add({
    name: LEGACY_TEAM_NAME,
    nameLower,
    createdAt: new Date().toISOString(),
    createdByUid: 'migration-script',
  })
  console.log(`✓ Creata squadra legacy: ${ref.id} ("${LEGACY_TEAM_NAME}")`)
  return ref.id
}

async function migrateCollection(db, collectionName, teamId, dryRun) {
  const snap = await db.collection(collectionName).get()
  const missing = snap.docs.filter(d => !d.data().teamId)

  if (missing.length === 0) {
    console.log(`  ${collectionName}: 0/${snap.size} da aggiornare`)
    return { total: snap.size, updated: 0 }
  }

  if (dryRun) {
    console.log(`  [dry-run] ${collectionName}: ${missing.length}/${snap.size} da aggiornare`)
    return { total: snap.size, updated: missing.length }
  }

  let updated = 0
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    chunk.forEach(d => batch.update(d.ref, { teamId }))
    await batch.commit()
    updated += chunk.length
  }
  console.log(`  ${collectionName}: ${updated}/${snap.size} aggiornati`)
  return { total: snap.size, updated }
}

async function verifyNoOrphans(db, collectionName) {
  const snap = await db.collection(collectionName).get()
  const orphans = snap.docs.filter(d => !d.data().teamId)
  if (orphans.length > 0) {
    console.warn(`  ⚠ ${collectionName}: ${orphans.length} documenti ancora senza teamId (${orphans.map(d => d.id).join(', ')})`)
  }
  return orphans.length
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  console.log(dryRun ? '=== DRY RUN (nessuna scrittura) ===\n' : '=== MIGRAZIONE ===\n')

  const app = initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore(app)

  const teamId = await findOrCreateLegacyTeam(db, dryRun)

  console.log('\nAssegnazione teamId per collection:')
  for (const collectionName of COLLECTIONS) {
    await migrateCollection(db, collectionName, teamId, dryRun)
  }

  if (!dryRun) {
    console.log('\nVerifica finale (nessun documento deve restare senza teamId):')
    let totalOrphans = 0
    for (const collectionName of COLLECTIONS) {
      totalOrphans += await verifyNoOrphans(db, collectionName)
    }
    console.log(totalOrphans === 0 ? '✓ Nessun documento orfano.' : `⚠ ${totalOrphans} documenti orfani totali — controlla sopra.`)
  }

  console.log('\nFatto.')
  process.exit(0)
}

main().catch(err => {
  console.error('✗ Migrazione fallita:', err)
  process.exit(1)
})
