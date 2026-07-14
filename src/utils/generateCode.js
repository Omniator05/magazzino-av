export function generateItemCode(id) {
  return `WAV-${id.slice(0, 8).toUpperCase()}`
}

// Codice per una singola unità fisica, calcolato al volo dal codice base
// dell'oggetto — non salvato su Firestore, così il codice "master" già
// stampato resta immutato e le etichette vecchie continuano a funzionare.
export function generateUnitCode(baseCode, unitIndex) {
  return `${baseCode}-${String(unitIndex).padStart(2, '0')}`
}

// Cosa viene effettivamente incorporato nel QR: un link al sito, così chi
// scansiona con la fotocamera del telefono (fuori dall'app) apre la pagina
// invece di vedere solo testo. Il barcode CODE128 resta sul codice grezzo.
export function qrPayloadForCode(code) {
  return `https://www.theservicegroup.it/?c=${encodeURIComponent(code)}`
}

// Ricava il codice oggetto da un testo scansionato, sia che provenga da
// un'etichetta vecchia (testo semplice) sia da una nuova (URL del sito).
// Se il codice è quello di una singola unità (…-01), risale anche al
// codice base dell'oggetto "genitore" per il lookup su Firestore.
export function parseScannedCode(decodedText) {
  const raw = (decodedText || '').trim()
  let code = raw
  try {
    const url = new URL(raw)
    const param = url.searchParams.get('c')
    if (param) code = param
  } catch { /* non è un URL: è già il codice grezzo (etichetta vecchia) */ }
  code = code.trim().toUpperCase()
  const unitMatch = code.match(/^(.*)-(\d{2,3})$/)
  const baseCode = unitMatch ? unitMatch[1] : code
  return { code, baseCode, unitNumber: unitMatch ? unitMatch[2] : null }
}

export async function generateQRDataURL(text, width = 256) {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(text, {
    width, margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

export function generateBarcodeSVG(code, elementId) {
  if (typeof window !== 'undefined') {
    import('jsbarcode').then(({ default: JsBarcode }) => {
      const el = document.getElementById(elementId)
      if (el) JsBarcode(el, code, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, margin: 10 })
    })
  }
}
