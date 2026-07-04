// Modalità SYNC — da lanciare manualmente quando c'è internet, prima dell'evento.
// Legge la config pubblicata su Firestore per la settimana corrente, scarica i PNG
// necessari in locale, e genera config.json risolvendo già i clip-id reali di Resolume
// (layer + colonna → id), così che live.js possa girare offline durante l'evento.
//
// Uso:
//   node sync.js                 → sincronizza la prossima settimana pubblicata (data >= oggi)
//   node sync.js --date 2026-07-10  → forza una data specifica

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getComposition, findLayer, clipIdAt, LAYER_NAMES, SPONSOR_COLUMNS, NEXT_COLUMN, RESOLUME_HOST, RESOLUME_PORT } from './resolume-map.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(__dirname, 'config.json')
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')

function loadServiceAccount() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`✗ Manca il file serviceAccountKey.json in questa cartella.`)
    console.error('  Scaricalo da Firebase Console → ⚙️ Impostazioni progetto → Account di servizio → "Genera nuova chiave privata",')
    console.error(`  e salvalo esattamente come: ${SERVICE_ACCOUNT_PATH}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
}

async function downloadFromUrl(url, localPath) {
  mkdirSync(path.dirname(localPath), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download fallito (HTTP ${res.status}) per ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(localPath, buffer)
}

function pickTargetWeek(weeks, explicitDate) {
  if (explicitDate) {
    const found = weeks.find(w => w.date === explicitDate)
    if (!found) throw new Error(`Nessuna configurazione trovata per la data ${explicitDate}.`)
    return found
  }
  const today = new Date().toISOString().split('T')[0]
  const upcoming = weeks
    .filter(w => w.status === 'published' && w.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (upcoming.length === 0) {
    throw new Error('Nessuna configurazione pubblicata con data odierna o futura. Pubblica una settimana dalla pagina web (stato "Pubblicata"), oppure specifica --date YYYY-MM-DD.')
  }
  return upcoming[0]
}

async function main() {
  const args = process.argv.slice(2)
  const dateIdx = args.indexOf('--date')
  const explicitDate = dateIdx !== -1 ? args[dateIdx + 1] : null

  console.log('Connessione a Firestore...')
  const serviceAccount = loadServiceAccount()
  initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore()

  console.log('Cerco la configurazione della settimana da sincronizzare...')
  const weeksSnap = await db.collection('brasserieWeeks').get()
  const weeks = weeksSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const week = pickTargetWeek(weeks, explicitDate)
  console.log(`✓ Settimana selezionata: ${week.date} (stato: ${week.status})\n`)

  console.log(`Connessione a Resolume su ${RESOLUME_HOST}:${RESOLUME_PORT} per leggere la struttura attuale...`)
  const composition = await getComposition()
  const artistiLayer = findLayer(composition, LAYER_NAMES.artisti)
  const sponsorLayer = findLayer(composition, LAYER_NAMES.sponsor)
  const nextLayer = findLayer(composition, LAYER_NAMES.next)
  console.log('✓ Struttura letta, layer trovati: ARTISTI, SPONSOR, NEXT\n')

  const config = {
    generatedAt: new Date().toISOString(),
    weekDate: week.date,
    resolume: { host: RESOLUME_HOST, port: RESOLUME_PORT },
    targets: [],
  }

  const skipped = []

  // ARTISTI: slot i (ordine nella pagina web) → colonna i del layer ARTISTI
  const artistiSlots = week.layers?.artisti || []
  for (let i = 0; i < artistiSlots.length; i++) {
    const slot = artistiSlots[i]
    if (!slot.logoUrl) { skipped.push(`ARTISTI slot ${i + 1}: nessun logo assegnato`); continue }
    try {
      const clipId = clipIdAt(artistiLayer, i)
      const localFile = path.join('media', 'artisti', `${i}.png`)
      await downloadFromUrl(slot.logoUrl, path.join(__dirname, localFile))
      config.targets.push({ label: `ARTISTI colonna ${i + 1} — ${slot.artistName}`, clipId, file: localFile })
      console.log(`  ✓ ARTISTI colonna ${i + 1} "${slot.artistName}" → clip ${clipId}`)
    } catch (e) {
      skipped.push(`ARTISTI slot ${i + 1} ("${slot.artistName}"): ${e.message}`)
    }
  }

  // SPONSOR: 2 slot fissi (cibo + DJ), colonne fisse
  const sponsorSlots = week.layers?.sponsor || []
  const food = sponsorSlots.find(s => s.slotId === 'sponsor-food')
  const dj = sponsorSlots.find(s => s.slotId === 'sponsor-dj')

  if (food?.logoUrl) {
    try {
      const clipId = clipIdAt(sponsorLayer, SPONSOR_COLUMNS.food)
      const localFile = path.join('media', 'sponsor', 'food.png')
      await downloadFromUrl(food.logoUrl, path.join(__dirname, localFile))
      config.targets.push({ label: `SPONSOR bancarella cibo — ${food.artistName}`, clipId, file: localFile })
      console.log(`  ✓ SPONSOR cibo "${food.artistName}" → clip ${clipId}`)
    } catch (e) {
      skipped.push(`SPONSOR cibo: ${e.message}`)
    }
  } else {
    skipped.push('SPONSOR cibo: nessun logo assegnato')
  }

  if (dj?.logoUrl) {
    try {
      const clipId = clipIdAt(sponsorLayer, SPONSOR_COLUMNS.dj)
      const localFile = path.join('media', 'sponsor', 'dj.png')
      await downloadFromUrl(dj.logoUrl, path.join(__dirname, localFile))
      config.targets.push({ label: `SPONSOR DJ pre-serata — ${dj.artistName}`, clipId, file: localFile })
      console.log(`  ✓ SPONSOR DJ "${dj.artistName}" → clip ${clipId}`)
    } catch (e) {
      skipped.push(`SPONSOR DJ: ${e.message}`)
    }
  } else {
    skipped.push('SPONSOR DJ: nessun logo assegnato')
  }

  // NEXT
  if (week.nextGraphic?.url) {
    try {
      const clipId = clipIdAt(nextLayer, NEXT_COLUMN)
      const localFile = path.join('media', 'next.png')
      await downloadFromUrl(week.nextGraphic.url, path.join(__dirname, localFile))
      config.targets.push({ label: 'NEXT (settimana successiva)', clipId, file: localFile })
      console.log(`  ✓ NEXT → clip ${clipId}`)
    } catch (e) {
      skipped.push(`NEXT: ${e.message}`)
    }
  } else {
    skipped.push('NEXT: nessuna grafica caricata')
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

  console.log(`\n✓ Sync completato: ${config.targets.length} file scaricati, config.json aggiornato.`)
  if (skipped.length > 0) {
    console.log(`\n⚠ ${skipped.length} elementi saltati:`)
    skipped.forEach(s => console.log(`  - ${s}`))
  }
  console.log('\nOra puoi lanciare "node live.js" (anche offline) per applicare la config a Resolume.')
}

main().catch(e => {
  console.error('\n✗ Errore durante il sync:', e.message)
  process.exit(1)
})
