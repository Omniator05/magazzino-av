// Migrazione one-off: introduce il sistema di abbonamento. Le squadre che
// esistono GIÀ (create prima di questa feature) vengono "grandfathered" —
// segnate come billingStatus 'exempt' (accesso pieno, nessuna prova/scadenza)
// invece di ritrovarsi con una prova di 30 giorni già in corso o già scaduta
// per un abbonamento che non hanno mai avuto modo di sottoscrivere. Le
// squadre create DA ORA IN POI partono già in 'trialing' (vedi Signup.jsx).
// Idempotente: salta le squadre che hanno già un billingStatus impostato.
//
// Uso:
//   node scripts/migrate-billing-grandfather.js --dry-run   → stampa senza scrivere
//   node scripts/migrate-billing-grandfather.js             → esegue

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')

function loadServiceAccount() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('✗ Manca il file scripts/serviceAccountKey.json.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  console.log(dryRun ? '=== DRY RUN (nessuna scrittura) ===\n' : '=== MIGRAZIONE ===\n')

  const app = initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore(app)

  const snap = await db.collection('teams').get()
  const toUpdate = snap.docs.filter(d => !d.data().billingStatus)

  console.log(`Squadre totali: ${snap.size}`)
  console.log(`Già con billingStatus impostato (saltate): ${snap.size - toUpdate.length}`)
  console.log(`Da rendere exempt: ${toUpdate.length}`)
  toUpdate.forEach(d => console.log(`  - ${d.id}  "${d.data().name || '(senza nome)'}"`))

  if (dryRun || toUpdate.length === 0) {
    console.log('\nFatto (nessuna scrittura eseguita).')
    process.exit(0)
  }

  const batch = db.batch()
  toUpdate.forEach(d => batch.update(d.ref, { billingStatus: 'exempt' }))
  await batch.commit()

  console.log(`\n✓ ${toUpdate.length} squadre aggiornate a "exempt".`)
  process.exit(0)
}

main().catch(err => {
  console.error('✗ Migrazione fallita:', err)
  process.exit(1)
})
