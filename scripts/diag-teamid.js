// Diagnostica di sola lettura: stampa lo stato di teams/profiles e un
// campione di items/events, per capire eventuali disallineamenti di teamId
// dopo la migrazione. Non scrive nulla.
//
// Uso: node scripts/diag-teamid.js

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
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
  const app = initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore(app)

  console.log('=== teams ===')
  const teamsSnap = await db.collection('teams').get()
  teamsSnap.docs.forEach(d => console.log(`  ${d.id}  name="${d.data().name}"  nameLower="${d.data().nameLower}"`))

  console.log('\n=== profiles ===')
  const profilesSnap = await db.collection('profiles').get()
  profilesSnap.docs.forEach(d => {
    const p = d.data()
    console.log(`  ${d.id}  name="${p.name}"  role=${p.role}  teamId=${p.teamId || '(MANCANTE)'}  approved=${p.approved}  active=${p.active}`)
  })

  console.log('\n=== items (conteggio per teamId) ===')
  const itemsSnap = await db.collection('items').get()
  const itemsByTeam = {}
  itemsSnap.docs.forEach(d => {
    const t = d.data().teamId || '(MANCANTE)'
    itemsByTeam[t] = (itemsByTeam[t] || 0) + 1
  })
  Object.entries(itemsByTeam).forEach(([t, c]) => console.log(`  ${t}: ${c} items`))

  console.log('\n=== events (conteggio per teamId) ===')
  const eventsSnap = await db.collection('events').get()
  const eventsByTeam = {}
  eventsSnap.docs.forEach(d => {
    const t = d.data().teamId || '(MANCANTE)'
    eventsByTeam[t] = (eventsByTeam[t] || 0) + 1
  })
  Object.entries(eventsByTeam).forEach(([t, c]) => console.log(`  ${t}: ${c} events`))

  process.exit(0)
}

main().catch(err => {
  console.error('✗ Errore:', err)
  process.exit(1)
})
