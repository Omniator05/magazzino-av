// Modalità LIVE — durante l'evento, zero dipendenza da internet/Firestore.
// Legge solo config.json (generato da sync.js) e la cartella media/ locale,
// e fa ripuntare ogni clip di Resolume al file corretto via REST API in localhost.
//
// Uso:
//   node live.js

import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { toFileUri } from './resolume-map.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(__dirname, 'config.json')

async function openClip(base, clipId, absoluteFilePath) {
  return fetch(`${base}/composition/clips/by-id/${clipId}/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: toFileUri(absoluteFilePath),
  })
}

async function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.error('✗ Non trovo config.json in questa cartella.')
    console.error('  Esegui prima "node sync.js" quando hai una connessione internet.')
    process.exit(1)
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  const base = `http://${config.resolume.host}:${config.resolume.port}/api/v1`

  console.log(`Config generata il ${config.generatedAt}`)
  console.log(`Settimana: ${config.weekDate}`)
  console.log(`Applico ${config.targets.length} clip a Resolume su ${base} ...\n`)

  let okCount = 0
  let failCount = 0

  for (const target of config.targets) {
    const absPath = path.join(__dirname, target.file)

    if (!existsSync(absPath)) {
      console.error(`✗ ${target.label}: file mancante in locale (${target.file}). Esegui di nuovo il sync. Salto questa clip.`)
      failCount++
      continue
    }

    try {
      const res = await openClip(base, target.clipId, absPath)
      if (res.ok) {
        console.log(`✓ ${target.label} → clip ${target.clipId} (${target.file})`)
        okCount++
      } else {
        const text = await res.text().catch(() => '')
        console.error(`✗ ${target.label}: Resolume ha risposto ${res.status} ${res.statusText}. ${text}`)
        failCount++
      }
    } catch (e) {
      console.error(`✗ ${target.label}: impossibile contattare Resolume (${e.message}). È acceso con il webserver attivo su ${base}?`)
      failCount++
    }
  }

  console.log(`\nFatto: ${okCount} riuscite, ${failCount} fallite/saltate su ${config.targets.length} totali.`)
  if (failCount > 0) process.exit(1)
}

main().catch(e => {
  console.error('\n✗ Errore imprevisto:', e)
  process.exit(1)
})
