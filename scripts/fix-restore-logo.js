// Riparazione one-off per una squadra il cui logo ORIGINALE (bianco/chiaro) è
// stato sovrascritto da una precedente versione buggata della funzione
// "genera versione scura" (che sostituiva logoUrl invece di salvare in un
// campo separato, vedi src/pages/SettingsProfile.jsx). L'inversione colore è
// un'operazione perfettamente reversibile (255-(255-x)=x): l'originale si
// ricostruisce invertendo di nuovo il logo attuale, che è la versione scura.
//
// Cosa fa:
//   1. Trova la squadra per nome (case-insensitive, match parziale).
//   2. Scarica il file puntato da team.logoUrl (oggi = versione scura).
//   3. Lo inverte per ricostruire l'originale e lo ricarica come NUOVO file.
//   4. Aggiorna il doc team: logoUrl/logoPath → il file appena ricostruito
//      (originale), logoUrlDark/logoPathDark → il file attuale riusato SENZA
//      ri-caricarlo (stesso url/path, già valido).
//   5. Elimina il vecchio file "originale rotto" solo se non è più
//      referenziato da nessun campo dopo l'update (qui non lo è mai, quindi
//      NON lo cancelliamo: nessun file viene mai cancellato da questo script,
//      la vecchia versione scura resta raggiungibile come logoUrlDark).
//
// Uso:
//   node scripts/fix-restore-logo.js --team "the service" --dry-run   → stampa senza scrivere
//   node scripts/fix-restore-logo.js --team "the service"             → esegue

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage, getDownloadURL } from 'firebase-admin/storage'
import { PNG } from 'pngjs'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json')
const STORAGE_BUCKET = 'app-magazzino-9c5fa.firebasestorage.app'

function loadServiceAccount() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('✗ Manca il file scripts/serviceAccountKey.json.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`download fallito: HTTP ${res.statusCode}`)); return }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function invertPng(buffer) {
  const png = PNG.sync.read(buffer)
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255 - png.data[i]
    png.data[i + 1] = 255 - png.data[i + 1]
    png.data[i + 2] = 255 - png.data[i + 2]
    // alpha (i+3) invariato
  }
  return PNG.sync.write(png)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const teamArgIdx = process.argv.indexOf('--team')
  const teamQuery = teamArgIdx !== -1 ? process.argv[teamArgIdx + 1] : null
  if (!teamQuery) {
    console.error('✗ Specifica --team "<nome o parte del nome>"')
    process.exit(1)
  }

  console.log(dryRun ? '=== DRY RUN (nessuna scrittura) ===\n' : '=== RIPARAZIONE LOGO ===\n')

  const app = initializeApp({ credential: cert(loadServiceAccount()), storageBucket: STORAGE_BUCKET })
  const db = getFirestore(app)
  const bucket = getStorage(app).bucket()

  const snap = await db.collection('teams').get()
  const matches = snap.docs.filter(d => (d.data().name || '').toLowerCase().includes(teamQuery.toLowerCase()))

  if (matches.length === 0) {
    console.error(`✗ Nessuna squadra trovata con nome contenente "${teamQuery}".`)
    process.exit(1)
  }
  if (matches.length > 1) {
    console.error(`✗ Trovate ${matches.length} squadre, specifica un nome più preciso:`)
    matches.forEach(d => console.error(`  - ${d.id}  "${d.data().name}"`))
    process.exit(1)
  }

  const teamDoc = matches[0]
  const team = teamDoc.data()
  console.log(`Squadra: "${team.name}" (${teamDoc.id})`)

  if (!team.logoUrl) {
    console.error('✗ Questa squadra non ha nessun logoUrl impostato, niente da riparare.')
    process.exit(1)
  }
  if (team.logoUrlDark) {
    console.error('✗ Questa squadra ha già logoUrlDark impostato — probabilmente non ha bisogno di questa riparazione (o è già stata eseguita). Controlla manualmente prima di procedere.')
    process.exit(1)
  }

  console.log(`Logo attuale (presunta versione scura rotta): ${team.logoUrl}`)
  console.log('Scarico il file...')
  const currentBytes = await fetchBuffer(team.logoUrl)
  console.log(`  ${currentBytes.length} byte scaricati.`)

  console.log('Inverto i colori per ricostruire l\'originale...')
  const restoredBytes = invertPng(currentBytes)

  const restoredPath = `teamLogos/${teamDoc.id}/logo-restored-${Date.now()}.png`
  console.log(`Nuovo file originale ricostruito: ${restoredPath}`)

  if (dryRun) {
    console.log('\nAvrei caricato il file ricostruito e aggiornato:')
    console.log(`  logoUrl/logoPath → nuovo file ricostruito (${restoredPath})`)
    console.log(`  logoUrlDark/logoPathDark → file attuale riusato (${team.logoPath})`)
    console.log('\nFatto (nessuna scrittura eseguita).')
    process.exit(0)
  }

  const file = bucket.file(restoredPath)
  await file.save(restoredBytes, { metadata: { contentType: 'image/png' } })
  const restoredUrl = await getDownloadURL(file)

  await teamDoc.ref.update({
    logoUrl: restoredUrl,
    logoPath: restoredPath,
    logoUrlDark: team.logoUrl,
    logoPathDark: team.logoPath || null,
  })

  console.log('\n✓ Riparato:')
  console.log(`  logoUrl (originale, ricostruito) → ${restoredUrl}`)
  console.log(`  logoUrlDark (versione scura, file riusato) → ${team.logoUrl}`)
  process.exit(0)
}

main().catch(err => {
  console.error('✗ Riparazione fallita:', err)
  process.exit(1)
})
