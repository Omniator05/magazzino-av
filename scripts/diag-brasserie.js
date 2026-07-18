// Diagnostica di sola lettura per il problema di permessi sulle settimane Brasserie.
// Uso: node scripts/diag-brasserie.js

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf-8'))) })
const db = getFirestore(app)

console.log('=== Profili organizzatore-brasserie ===')
const profSnap = await db.collection('profiles').where('role', '==', 'organizzatore-brasserie').get()
profSnap.docs.forEach(d => {
  const p = d.data()
  console.log(`  uid=${d.id}  name="${p.name}"  teamId=${p.teamId || '(MANCANTE)'}  approved=${p.approved}  active=${p.active}`)
})

console.log('\n=== Documenti brasserieWeeks ===')
const weeksSnap = await db.collection('brasserieWeeks').get()
weeksSnap.docs.forEach(d => {
  const w = d.data()
  console.log(`  id=${d.id}  organizerId=${w.organizerId}  teamId=${w.teamId || '(MANCANTE)'}  date=${w.date}`)
})

process.exit(0)
