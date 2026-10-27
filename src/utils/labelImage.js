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
//  - 'barcode': cartuccia 41×13 mm (ZP41-13, rettangolo + cerchio), vedi renderBarcodeLabel più sotto.
// Misure fisiche e risoluzione di disegno di ciascun formato (px per mm): servono anche alla stampa diretta.
export const LABEL_SPEC = {
  qr:      { w: LABEL_W / 10, h: LABEL_H / 10, pxPerMm: 10 },
  barcode: { w: 41, h: 15, pxPerMm: 8 },   // cartuccia ZP41-13: pagina 41 × 15 mm (vedi renderBarcodeLabel)
  calib:   { w: 41, h: 13, pxPerMm: 8 },   // etichetta di prova con il righello: tutta la cartuccia ZP41-13
}

// Etichetta di prova: righello a 1 punto di spessore, un tacco ogni mm (più lungo ogni 5), tutta la cartuccia.
// Serve per vedere sull'adesivo vero quale parte dell'immagine finisce sul rettangolo e quale sul cerchio.
function renderCalibrationLabel() {
  const W = 328, H = 104
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1); ctx.fillRect(0, 0, 1, H); ctx.fillRect(W - 1, 0, 1, H)
  ctx.font = 'bold 10px Arial'; ctx.textBaseline = 'top'
  for (let mm = 0; mm <= 41; mm++) {
    const x = Math.min(mm * 8, W - 1), len = mm % 5 === 0 ? 10 : 5
    ctx.fillRect(x, 0, 1, len); ctx.fillRect(x, H - len, 1, len)
    if (mm % 5 === 0 && mm > 0 && mm < 40) { ctx.textAlign = 'center'; ctx.fillText(String(mm), x, 12); ctx.fillText(String(mm), x, H - 23) }
  }
  for (let mm = 0; mm <= 13; mm++) {
    const y = Math.min(mm * 8, H - 1), len = mm % 5 === 0 ? 10 : 5
    ctx.fillRect(0, y, len, 1); ctx.fillRect(W - len, y, len, 1)
  }
  // Un quadrato pieno in alto a sinistra e una freccia: si capisce se è girata
  ctx.fillRect(14, 44, 12, 12)
  ctx.textAlign = 'center'; ctx.font = 'bold 13px Arial'
  ctx.fillText('41 x 13 mm  ->', W / 2, 44)
  return canvas.toDataURL('image/png')
}

// Disegna l'etichetta e restituisce un data URL PNG pronto da scaricare/importare/stampare.
export async function renderLabelPNG({ name, location, code, teamId, format = 'qr', offset }) {
  if (format === 'barcode') return renderBarcodeLabel({ name, location, code, offset })
  if (format === 'calib') return renderCalibrationLabel()
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

// ── Etichetta piccola (cartuccia ZP41-13) ────────────────────────────────────────────────────────────────────
// La cartuccia è una striscia 41 × 13 mm con DUE adesivi: un rettangolo (25,4 × 12,7 mm) a sinistra e un cerchio
// (Ø 12,5 mm) a destra. Misure ricavate stampando righelli e disegni di prova sull'adesivo vero:
//  - il punto 0 in orizzontale è il bordo sinistro del rettangolo; il rettangolo arriva a 203 punti (8 per mm), il
//    cerchio ha il centro a 276;
//  - la testina non stampa le prime ~22 righe di una pagina (in alto nell'adesivo). Si manda quindi una pagina più
//    alta del necessario (15 mm = 120 punti, quanto il nastro): la stampante la centra sulla striscia, quindi la
//    parte persa cade sopra il rettangolo e quasi tutta l'altezza dell'adesivo diventa utilizzabile. Le
//    coordinate qui sotto sono quelle della pagina (= adesivo + 8 punti in verticale);
//  - il centro verticale del rettangolo e del cerchio è a 47 + 8 = 55.
// Il codice è un QR "pulito" (21 × 21 moduli da 3 punti = 7,9 mm); nome (e posizione) accanto, il tutto centrato
// nel rettangolo. Nel cerchio il numero del pezzo (#n) oppure la posizione, in grande.
const BC_W = 328, BC_H = 120
const BC_TOP = 26, BC_BOTTOM = 92            // fascia sicura per QR e testo (coordinate di pagina)
const BC_RECT_CX = 101.5, BC_RECT_INNER = 193 // centro orizzontale del rettangolo e larghezza utile (margine 5 + 5)
const BC_CIRCLE_X = 276, BC_CIRCLE_Y = 55, BC_CIRCLE_W = 64

// offset: spostamento a mano in decimi di millimetro { x, y } (impostazioni di stampa), per centrare l'etichetta
// su quella stampante: +x verso destra, +y verso il basso.
async function renderBarcodeLabel({ name, location, code, offset }) {
  const dx = Math.round((offset?.x || 0) * 0.8), dy = Math.round((offset?.y || 0) * 0.8)   // 8 punti per mm
  const out = document.createElement('canvas')
  out.width = BC_W; out.height = BC_H
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, BC_W, BC_H)

  // QR: solo il codice, livello di correzione basso → 21 × 21 moduli (versione 1) per i nostri codici.
  const QRCode = (await import('qrcode')).default
  const qr = QRCode.create(String(code || '').toUpperCase(), { errorCorrectionLevel: 'L' })
  const n = qr.modules.size
  const band = BC_BOTTOM - BC_TOP
  const mod = Math.max(2, Math.min(3, Math.floor(band / n)))      // punti per modulo
  const qrPx = n * mod
  const GAP = 7

  // Il testo si disegna a 4× e poi si riduce: i bordi restano più netti.
  const SSB = 4
  const text = document.createElement('canvas')
  text.width = BC_W * SSB; text.height = BC_H * SSB
  const t = text.getContext('2d')
  t.fillStyle = '#000'; t.textBaseline = 'top'; t.textAlign = 'left'
  const FAMILY = 'Arial'
  const unit = (String(code).match(/-(\d{2,3})$/) || [])[1]
  const lh = b => Math.round(b.size * 1.12)
  const heightOf = blocks => blocks.reduce((sum, b) => sum + (b.gap || 0) + b.lines.length * lh(b), 0)
  const widthOf = blocks => Math.max(...blocks.flatMap(b => b.lines.map(l => { t.font = `${b.weight} ${b.size}px ${FAMILY}`; return t.measureText(l).width })))

  // Rettangolo: nome (fino a 3 righe) e, se il pezzo è numerato (la posizione va nel cerchio altrimenti), la posizione.
  const textW = (BC_RECT_INNER - qrPx - GAP) * SSB
  let blocks = []
  for (let top = 18; top >= 10; top--) {
    const nameFit = fitWrapped(t, name, textW, FAMILY, 800, top * SSB, 10 * SSB, 3)
    blocks = [{ lines: nameFit.lines, size: nameFit.size, weight: 800 }]
    if (unit && location) {
      const loc = fitWrapped(t, location, textW, FAMILY, 700, 14 * SSB, 9 * SSB, 1)
      blocks.push({ lines: loc.lines, size: loc.size, weight: 700, gap: 3 * SSB })
    }
    if (heightOf(blocks) <= band * SSB) break
  }
  // QR + testo come un blocco solo, centrato nel rettangolo in orizzontale (e il testo in verticale sul QR)
  const contentW = qrPx + GAP + widthOf(blocks) / SSB
  const qx = Math.round(BC_RECT_CX - contentW / 2) + dx
  const qy = BC_TOP + Math.round((band - qrPx) / 2) + dy
  ctx.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(qx + c * mod, qy + r * mod, mod, mod)
  const tx = qx + qrPx + GAP
  let y = Math.round((qy + qrPx / 2) * SSB - heightOf(blocks) / 2)
  for (const b of blocks) {
    y += b.gap || 0
    t.font = `${b.weight} ${b.size}px ${FAMILY}`
    for (const line of b.lines) { t.fillText(line, tx * SSB, y); y += lh(b) }
  }

  // Cerchio: #n in grande, oppure la posizione (una riga se ci sta in grande, altrimenti fino a 3).
  const circleText = unit ? `#${parseInt(unit, 10)}` : (location || '')
  if (circleText) {
    const w = BC_CIRCLE_W * SSB
    const fit = unit
      ? { size: fitFontSize(t, circleText, w, FAMILY, 800, 44 * SSB, 14 * SSB), lines: [circleText] }
      : fitWrapped(t, circleText, w, FAMILY, 800, 40 * SSB, 10 * SSB, 3, 20 * SSB)
    t.font = `800 ${fit.size}px ${FAMILY}`
    const step = Math.round(fit.size * 1.12)
    t.textAlign = 'center'
    // l'asse del testo è a metà del corpo: per centrare otticamente si parte dal centro della prima riga
    fit.lines.forEach((line, i) => t.fillText(line, (BC_CIRCLE_X + dx) * SSB, (BC_CIRCLE_Y + dy) * SSB - (fit.lines.length * step) / 2 + i * step + Math.round(fit.size * 0.06)))
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(text, 0, 0, BC_W * SSB, BC_H * SSB, 0, 0, BC_W, BC_H)
  return out.toDataURL('image/png')
}
