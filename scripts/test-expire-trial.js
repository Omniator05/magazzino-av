// Test manuale: forza la scadenza del trial di una squadra impostando
// trialEndsAt a ieri, per verificare la schermata BillingGate senza
// aspettare 30 giorni veri. billingStatus resta 'trialing' (non 'canceled'),
// così si esercita esattamente il percorso "prova scaduta".
//
// Uso: node scripts/test-expire-trial.js <teamId>

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

async function main() {
  const teamId = process.argv[2]
  if (!teamId) {
    console.error('Uso: node scripts/test-expire-trial.js <teamId>')
    process.exit(1)
  }

  const app = initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore(app)

  const teamRef = db.collection('teams').doc(teamId)
  const snap = await teamRef.get()
  if (!snap.exists) {
    console.error(`✗ Squadra ${teamId} non trovata`)
    process.exit(1)
  }
  const team = snap.data()
  console.log(`Squadra: "${team.name}" — billingStatus attuale: ${team.billingStatus}, trialEndsAt attuale: ${team.trialEndsAt?.toDate?.()}`)

  const yesterday = Timestamp.fromDate(new Date(Date.now() - 86400000))
  await teamRef.update({ trialEndsAt: yesterday })

  console.log(`✓ trialEndsAt impostato a ieri (${yesterday.toDate()}). billingStatus resta 'trialing'.`)
  process.exit(0)
}

main().catch(err => {
  console.error('✗ Errore:', err)
  process.exit(1)
})
