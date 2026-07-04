// Mappatura concreta layer/colonna verificata con test-connection.js il 03/07/2026.
// Attenzione: Resolume mostra colonne e layer numerati a partire da 1 nella sua UI,
// mentre qui (come nella REST API) sono tutti 0-based.

export const RESOLUME_HOST = '127.0.0.1'
export const RESOLUME_PORT = 8080
export const RESOLUME_BASE = `http://${RESOLUME_HOST}:${RESOLUME_PORT}/api/v1`

// Nomi esatti dei layer nella composizione Resolume (case-sensitive)
export const LAYER_NAMES = {
  artisti: 'ARTISTI',
  sponsor: 'SPONSOR',
  next: 'NEXT',
}

// Colonne fisse (0-based) per gli slot variabili del layer SPONSOR
// (Resolume UI: colonna 17 = cibo, colonna 18 = DJ pre-serata)
export const SPONSOR_COLUMNS = { food: 16, dj: 17 }

// Colonna fissa (0-based) per la grafica Next (Resolume UI: colonna 2)
export const NEXT_COLUMN = 1

export function findLayer(composition, name) {
  const layer = composition.layers.find(l => l.name?.value === name)
  if (!layer) throw new Error(`Layer "${name}" non trovato nella composizione Resolume attuale. Layer sono stati rinominati?`)
  return layer
}

export function clipIdAt(layer, columnIndex) {
  const clip = layer.clips[columnIndex]
  if (!clip) throw new Error(`Colonna ${columnIndex} (0-based) non esiste nel layer "${layer.name?.value}"`)
  return clip.id
}

export async function getComposition() {
  const res = await fetch(`${RESOLUME_BASE}/composition`)
  if (!res.ok) throw new Error(`Impossibile leggere la composizione da Resolume (HTTP ${res.status}). È avviato con il webserver attivo?`)
  return res.json()
}

// Costruisce un file:// URI valido sia su macOS/Linux che su Windows
export function toFileUri(absolutePath) {
  let p = absolutePath.replace(/\\/g, '/')
  if (!p.startsWith('/')) p = '/' + p
  return `file://${p}`
}
