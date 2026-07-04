// Script di test standalone — verifica la connessione REST API di Resolume Arena
// e stampa la struttura reale di layer/colonne/clip così possiamo mappare
// ARTISTI / SPONSOR / NEXT sui layer giusti prima di scrivere la logica definitiva.
//
// Prerequisiti in Resolume: Preferences → Webserver → attiva il webserver (porta 8080).
//
// Uso:
//   node test-connection.js                          → stampa struttura composizione
//   node test-connection.js --open-clip <id> <path>   → prova sperimentale: riassegna
//                                                        il file <path> alla clip <id>
//                                                        (vedi avviso più sotto)

import { writeFile } from 'fs/promises'

const HOST = '127.0.0.1'
const PORT = 8080
const BASE = `http://${HOST}:${PORT}/api/v1`

const CONNECTED_STATES = ['Vuota', 'Disconnessa', 'In preview', 'Connessa', 'Connessa & preview']

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} su ${path}`)
  return res.json()
}

async function checkConnection() {
  console.log(`Connessione a Resolume su ${BASE} ...`)
  try {
    const product = await getJSON('/product')
    console.log(`✓ Connesso a ${product.name} v${product.major}.${product.minor}.${product.micro} (revision ${product.revision})\n`)
    return true
  } catch (e) {
    console.error('✗ Impossibile connettersi a Resolume.')
    console.error('  Verifica che: Resolume Arena sia avviato, Preferences → Webserver sia attivo,')
    console.error(`  e che la porta sia ${PORT}. Dettaglio errore: ${e.message}`)
    return false
  }
}

async function dumpComposition() {
  const composition = await getJSON('/composition')

  console.log(`Colonne (${composition.columns.length}):`)
  composition.columns.forEach((col, i) => {
    console.log(`  [${i}] id=${col.id}  nome="${col.name?.value ?? '(senza nome)'}"`)
  })

  console.log(`\nLayer (${composition.layers.length}):`)
  composition.layers.forEach((layer, layerIndex) => {
    console.log(`\n  Layer [${layerIndex}] id=${layer.id}  nome="${layer.name?.value ?? '(senza nome)'}"`)
    layer.clips.forEach((clip, clipIndex) => {
      const state = CONNECTED_STATES[clip.connected?.index] ?? '?'
      console.log(`    colonna ${clipIndex}: clip id=${clip.id}  nome="${clip.name?.value || '(vuota)'}"  stato=${state}`)
    })
  })

  await writeFile('composition-dump.json', JSON.stringify(composition, null, 2))
  console.log('\nStruttura completa salvata in composition-dump.json.')
  console.log('→ Guarda i "nome" dei layer qui sopra per capire quale corrisponde a ARTISTI / SPONSOR / NEXT,')
  console.log('  e annota gli "id" delle clip (colonne) che dovremo poter ripuntare a un file diverso ogni settimana.')
}

// ── Sperimentale: riassegnare un file a una clip ──────────────────────────
// Il meccanismo esatto (endpoint /composition/clips/by-id/{id}/open, body con
// URI tipo "file:///percorso/assoluto/file.png") è dedotto dal comportamento del
// drag&drop nel browser Resolume, ma NON ancora verificato con una richiesta HTTP
// diretta come la faremo dal bridge. Usa questa funzione solo su una clip di TEST,
// non durante un evento live, finché non confermiamo che funziona come previsto.
async function tryOpenClip(clipId, filePath) {
  const fileUri = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/^\/+/, '')}`
  const url = `${BASE}/composition/clips/by-id/${clipId}/open`
  console.log(`\nTentativo: POST ${url}`)
  console.log(`  body: "${fileUri}"`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: fileUri,
  })

  if (res.ok) {
    console.log(`✓ Risposta OK (${res.status}). Controlla su schermo/ledwall se la clip ${clipId} ha davvero caricato il file.`)
  } else {
    const text = await res.text().catch(() => '')
    console.error(`✗ Risposta ${res.status} ${res.statusText}. Body: ${text}`)
    console.error('  Il formato del body/endpoint potrebbe essere diverso da quello ipotizzato — riportami questo output.')
  }
}

async function main() {
  const ok = await checkConnection()
  if (!ok) process.exit(1)

  await dumpComposition()

  const args = process.argv.slice(2)
  const openIdx = args.indexOf('--open-clip')
  if (openIdx !== -1) {
    const clipId = args[openIdx + 1]
    const filePath = args[openIdx + 2]
    if (!clipId || !filePath) {
      console.error('\nUso: node test-connection.js --open-clip <clipId> <percorso-assoluto-file>')
      process.exit(1)
    }
    await tryOpenClip(clipId, filePath)
  }
}

main().catch(e => {
  console.error('Errore imprevisto:', e)
  process.exit(1)
})
