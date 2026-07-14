import { generateQRDataURL, qrPayloadForCode } from './generateCode'

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

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
}

// Disegna l'etichetta (QR a sinistra, blocco titolo/posizione/codice centrato
// verticalmente a destra, testo dimensionato per riempire lo spazio) e
// restituisce un data URL PNG 680×180 pronto da scaricare/importare.
export async function renderLabelPNG({ name, location, code }) {
  const W = LABEL_W * SS, H = LABEL_H * SS, pad = PAD * SS

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'

  const qrSize = H - pad * 2
  // Generiamo il QR già alla risoluzione finale di disegno: evita un
  // ulteriore passaggio di scala (e la conseguente sfocatura) sull'immagine.
  const qrDataUrl = await generateQRDataURL(qrPayloadForCode(code), Math.round(qrSize))
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, pad, pad, qrSize, qrSize)

  const textX = pad * 2 + qrSize
  const textW = W - textX - pad
  ctx.textBaseline = 'top'

  const FAMILY = 'Arial'
  let nameSize = fitFontSize(ctx, name, textW, FAMILY, 800, 64 * SS, 26 * SS)
  ctx.font = `800 ${nameSize}px ${FAMILY}`
  let nameLineHeight = Math.round(nameSize * 1.15)
  const nameFits = ctx.measureText(name).width <= textW
  const nameLines = nameFits ? [name] : wrapLines(ctx, name, textW, 3)

  let locLines = [], locSize = 0, locLineHeight = 0
  if (location) {
    const locText = `📍 ${location}`
    locSize = fitFontSize(ctx, locText, textW, FAMILY, 700, 30 * SS, 16 * SS)
    ctx.font = `700 ${locSize}px ${FAMILY}`
    locLineHeight = Math.round(locSize * 1.2)
    locLines = ctx.measureText(locText).width <= textW ? [locText] : wrapLines(ctx, locText, textW, 2)
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
  let y = pad + Math.round((qrSize - blockHeight) / 2)

  ctx.font = `800 ${nameSize}px ${FAMILY}`
  drawLines(ctx, nameLines, textX, y, nameLineHeight)
  y += nameLines.length * nameLineHeight

  if (locLines.length) {
    y += gap
    ctx.font = `700 ${locSize}px ${FAMILY}`
    drawLines(ctx, locLines, textX, y, locLineHeight)
    y += locLines.length * locLineHeight
  }

  y += gap
  ctx.font = `600 ${codeSize}px monospace`
  ctx.fillText(code, textX, y)

  // Rimpicciolisce dalla risoluzione di lavoro (2×) alla dimensione finale richiesta
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
