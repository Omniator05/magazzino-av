import { generateQRDataURL, qrPayloadForCode, generateBarcodeDataURL } from './generateCode'

// Dimensioni richieste dal software della stampante termica: un'immagine
// già pronta a questa risoluzione, niente dialogo di stampa del browser
// (che dipende da formato pagina/margini e non è affidabile per etichette).
// L'etichetta fisica è 60×38mm: 10px/mm mantiene esattamente quel rapporto,
// altrimenti l'app di stampa la importa storta rispetto alla cornice.
const LABEL_W = 600
const LABEL_H = 380
const PAD = 16
// Disegniamo tutto a risoluzione doppia e poi rimpiccioliamo al formato
// finale: il downscale con smoothing dà bordi di testo e QR molto più nitidi
// di un disegno diretto a 600×380 (che risulta "morbido"/poco definito).
const SS = 2

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Trova la dimensione massima di font (in un intervallo) che fa stare
// `text` su una riga sola dentro maxWidth — così un nome corto riempie
// bene lo spazio disponibile invece di restare piccolo con un vuoto attorno.
function fitFontSize(ctx, text, maxWidth, family, weight, maxSize, minSize) {
  for (let size = maxSize; size > minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return size
  }
  return minSize
}

// Spezza il testo su più righe dentro maxWidth, troncando con "…" oltre maxLines.
// Richiede che ctx.font sia già impostato al font da misurare/disegnare.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1]
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
      last = last.slice(0, -1)
    }
    lines[maxLines - 1] = last + (words.join(' ').length > lines.join(' ').length ? '…' : '')
  }
  return lines
}

// Segnaposto "posizione" disegnato a mano (le emoji come 📍 non escono bene sulla stampante termica: diventano
// una macchia). Una goccia nera con un foro bianco, alta quanto il testo accanto.
function drawPin(ctx, x, y, size) {
  const r = size * 0.36
  const cx = x + size * 0.4, cy = y + r + size * 0.04
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.82, Math.PI * 2.18)       // cerchio aperto in basso
  ctx.lineTo(cx, y + size * 0.98)                           // punta
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
const pinWidth = size => Math.round(size * 0.8)

// Posizione in grande: il corpo più alto che sta in `maxLines` righe senza troncare (fino a minSize; sotto, si tronca
// con "…"). Lo spazio per il segnaposto è già tolto da maxWidth.
function wrapAll(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function fitWrapped(ctx, text, maxWidth, family, weight, maxSize, minSize, maxLines, singleMin = 0) {
  // Prima si prova una riga sola, se così il corpo resta almeno `singleMin`: "Scaffale B2" non va spezzato in due.
  if (singleMin) {
    for (let size = maxSize; size >= singleMin; size -= 2) {
      ctx.font = `${weight} ${size}px ${family}`
      if (ctx.measureText(text).width <= maxWidth) return { size, lines: [text] }
    }
  }
  // Poi il corpo più grande che entra in `maxLines` righe INTERE (nessuna parola tagliata).
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`
    const lines = wrapAll(ctx, text, maxWidth)
    if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxWidth)) return { size, lines }
  }
  // Troppo lungo anche al corpo minimo: si tronca con "…".
  ctx.font = `${weight} ${minSize}px ${family}`
  return { size: minSize, lines: wrapLines(ctx, text, maxWidth, maxLines) }
}

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
}

// Due formati, due cartucce diverse:
//  - 'qr': etichetta 60×38 mm (cartuccia ZP38-60), QR a sinistra e titolo/posizione/codice a destra;
//  - 'barcode': etichetta 41×13 mm (cartuccia ZP41-13), vedi renderBarcodeLabel più sotto.
// Misure fisiche e risoluzione di disegno di ciascun formato (px per mm): servono anche alla stampa diretta.
export const LABEL_SPEC = {
  qr:      { w: LABEL_W / 10, h: LABEL_H / 10, pxPerMm: 10 },
  barcode: { w: 41, h: 13, pxPerMm: 8 },
}

// Disegna l'etichetta e restituisce un data URL PNG pronto da scaricare/importare/stampare.
export async function renderLabelPNG({ name, location, code, teamId, format = 'qr' }) {
  if (format === 'barcode') return renderBarcodeLabel({ name, location, code })
  const W = LABEL_W * SS, H = LABEL_H * SS, pad = PAD * SS

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  // Il QR a 30 mm (non a tutta altezza) lascia più larghezza al testo: si scansiona senza problemi e la posizione
  // può essere scritta più grande.
  const qrSize = Math.min(H - pad * 2, 300 * SS)
  const qrTop = Math.round((H - qrSize) / 2)
  // Generiamo il QR già alla risoluzione finale di disegno: evita un
  // ulteriore passaggio di scala (e la conseguente sfocatura) sull'immagine.
  const qrDataUrl = await generateQRDataURL(qrPayloadForCode(code, teamId), Math.round(qrSize))
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, pad, qrTop, qrSize, qrSize)

  const textX = pad * 2 + qrSize
  const textW = W - textX - pad

  const FAMILY = 'Arial'
  let nameSize = fitFontSize(ctx, name, textW, FAMILY, 800, 64 * SS, 26 * SS)
  ctx.font = `800 ${nameSize}px ${FAMILY}`
  let nameLineHeight = Math.round(nameSize * 1.15)
  const nameFits = ctx.measureText(name).width <= textW
  const nameLines = nameFits ? [name] : wrapLines(ctx, name, textW, 3)

  let locLines = [], locSize = 0, locLineHeight = 0
  if (location) {
    // Posizione in grande (fino a 44 px), con il segnaposto disegnato a sinistra; fino a 2 righe senza troncare.
    const fit = fitWrapped(ctx, location, textW - pinWidth(44 * SS) - 8 * SS, FAMILY, 800, 44 * SS, 20 * SS, 2, 28 * SS)
    locSize = fit.size
    locLines = fit.lines
    locLineHeight = Math.round(locSize * 1.15)
  }

  let codeSize = fitFontSize(ctx, code, textW, 'monospace', 600, 24 * SS, 15 * SS)
  ctx.font = `600 ${codeSize}px monospace`
  let codeLineHeight = Math.round(codeSize * 1.2)

  let gap = 10 * SS

  // Se titolo + posizione + codice, alle dimensioni scelte per riempire la
  // larghezza, sono più alti del QR, li rimpiccioliamo tutti insieme in
  // proporzione: non devono mai sporgere sotto al QR.
  const naturalHeight =
    nameLines.length * nameLineHeight +
    (locLines.length ? gap + locLines.length * locLineHeight : 0) +
    gap + codeLineHeight
  let blockHeight = naturalHeight
  if (naturalHeight > qrSize) {
    const scale = qrSize / naturalHeight
    nameSize = Math.round(nameSize * scale)
    nameLineHeight = Math.round(nameLineHeight * scale)
    locSize = Math.round(locSize * scale)
    locLineHeight = Math.round(locLineHeight * scale)
    codeSize = Math.round(codeSize * scale)
    codeLineHeight = Math.round(codeLineHeight * scale)
    gap = Math.round(gap * scale)
    blockHeight = qrSize
  }

  // Blocco di testo centrato verticalmente sull'altezza del QR, invece di
  // partire sempre dal margine superiore.
  let y = qrTop + Math.round((qrSize - blockHeight) / 2)

  ctx.font = `800 ${nameSize}px ${FAMILY}`
  drawLines(ctx, nameLines, textX, y, nameLineHeight)
  y += nameLines.length * nameLineHeight

  if (locLines.length) {
    y += gap
    ctx.font = `800 ${locSize}px ${FAMILY}`
    drawPin(ctx, textX, y, locSize)
    drawLines(ctx, locLines, textX + pinWidth(locSize) + 8 * SS, y, locLineHeight)
    y += locLines.length * locLineHeight
  }

  y += gap
  ctx.font = `600 ${codeSize}px monospace`
  ctx.fillText(code, textX, y)

  return downscaleToFinal(canvas)
}

// Rimpicciolisce dalla risoluzione di lavoro (2×) alla dimensione finale
// richiesta — condiviso dai due layout (qr/barcode) sopra.
function downscaleToFinal(canvas) {
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = LABEL_W
  finalCanvas.height = LABEL_H
  const finalCtx = finalCanvas.getContext('2d')
  finalCtx.imageSmoothingEnabled = true
  finalCtx.imageSmoothingQuality = 'high'
  finalCtx.drawImage(canvas, 0, 0, LABEL_W, LABEL_H)
  return finalCanvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function slugify(s) {
  const normalized = (s || 'etichetta').toLowerCase().trim().normalize('NFD')
  const diacriticsPattern = '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']'
  const noDiacritics = normalized.replace(new RegExp(diacriticsPattern, 'g'), '')
  return noDiacritics.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'etichetta'
}

export function labelFilename(name, code) {
  return `${slugify(name)}-${code}.png`
}

// ── Etichetta con codice a barre: cartuccia ZP41-13, 41 × 13 mm ─────────────────────────────────────────────
// Sul rotolo ogni "etichetta" è una striscia con due adesivi già fustellati: a sinistra un RETTANGOLO di
// 25,4 × 12,7 mm (nome sopra, codice a barre sotto) e a destra un CERCHIO di 12,7 mm (una sigla breve: la
// posizione e, per un pezzo numerato, il numero). Si disegna alla risoluzione esatta della stampante (8 punti
// per mm → 328 × 104): ogni modulo del codice a barre è UN punto, niente scalature che lo rovinerebbero.
const BC_W = 328, BC_H = 104
const BC_RECT = { x: 0, y: 1, w: 203, h: 102 }     // 25,4 × 12,7 mm
const BC_CIRCLE = { d: 102, cx: 328 - 51, cy: 52 } // Ø 12,7 mm, appoggiato al bordo destro

// Il codice a barre non porta il prefisso "WAV-" (sono 4 caratteri in meno: così anche il codice di un pezzo
// numerato sta nei 25 mm del rettangolo); quando si scansiona, parseScannedCode rimette il prefisso.
export const barcodeText = code => String(code || '').replace(/^WAV-/i, '')

async function renderBarcodeLabel({ name, location, code }) {
  const SSB = 4                                   // il testo si disegna a 4× e poi si riduce (più morbido)
  const text = document.createElement('canvas')
  text.width = BC_W * SSB; text.height = BC_H * SSB
  const tctx = text.getContext('2d')
  tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, text.width, text.height)
  tctx.fillStyle = '#000'; tctx.textBaseline = 'top'; tctx.textAlign = 'left'
  const FAMILY = 'Arial'

  // Rettangolo: nome in una riga, il più grande che ci sta (da 22 a 12 px), poi tronca con "…".
  const padX = 6, nameTop = 6
  const nameW = (BC_RECT.w - padX * 2) * SSB
  let nameSize = fitFontSize(tctx, name, nameW, FAMILY, 800, 22 * SSB, 12 * SSB)
  tctx.font = `800 ${nameSize}px ${FAMILY}`
  let shown = name
  while (tctx.measureText(shown).width > nameW && shown.length > 1) shown = shown.slice(0, -1)
  if (shown !== name) shown = shown.slice(0, -1) + '…'
  tctx.fillText(shown, padX * SSB, nameTop * SSB)

  // Cerchio: posizione in 1–2 righe (la più grande che ci sta) e, per un pezzo numerato, il numero.
  const unit = (String(code).match(/-(\d{2,3})$/) || [])[1]
  const lines = []
  if (location) {
    const circleInner = 78 * SSB                  // larghezza utile al centro del cerchio
    const fit = fitWrapped(tctx, location, circleInner, FAMILY, 800, 24 * SSB, 12 * SSB, 2, 20 * SSB)
    lines.push(...fit.lines.map(l => ({ text: l, size: fit.size })))
  }
  if (unit) lines.push({ text: `#${parseInt(unit, 10)}`, size: 20 * SSB })
  if (lines.length) {
    const lh = l => Math.round(l.size * 1.1)
    const total = lines.reduce((n, l) => n + lh(l), 0)
    let y = BC_CIRCLE.cy * SSB - total / 2
    tctx.textAlign = 'center'
    for (const l of lines) {
      tctx.font = `800 ${l.size}px ${FAMILY}`
      tctx.fillText(l.text, BC_CIRCLE.cx * SSB, y)
      y += lh(l)
    }
  }

  const out = document.createElement('canvas')
  out.width = BC_W; out.height = BC_H
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, BC_W, BC_H)
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(text, 0, 0, BC_W, BC_H)

  // Codice a barre: moduli da un punto, alto quanto resta sotto il nome, centrato nel rettangolo.
  const { default: JsBarcode } = await import('jsbarcode')
  const bc = document.createElement('canvas')
  const barsTop = nameTop + Math.round(nameSize / SSB) + 8
  const barsH = BC_RECT.y + BC_RECT.h - 6 - barsTop
  JsBarcode(bc, barcodeText(code), { format: 'CODE128', width: 1, height: barsH, displayValue: false, margin: 0 })
  ctx.imageSmoothingEnabled = false
  const bx = BC_RECT.x + Math.round((BC_RECT.w - bc.width) / 2)
  ctx.drawImage(bc, bx, barsTop)
  return out.toDataURL('image/png')
}
