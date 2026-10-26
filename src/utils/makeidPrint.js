import { LABEL_MM } from './labelImage'

// Stampa diretta sulle stampanti MakeID (D50 e simili) dal browser, attraverso il "servizio di stampa" che il
// produttore fornisce per Windows e Mac (https://github.com/MakeID-Developer/label-print, cartella JS: programma
// label-print-server). Il servizio gira sul PC di magazzino e ascolta SOLO su quel computer (127.0.0.1, porta
// 18188): il sito gli manda l'immagine dell'etichetta e lui la gira alla stampante via USB.
// Documentazione ufficiale: HTTP/print-service-plugin-api-docs.md del repository.
//
// Protocollo: POST con il JSON "urlencoded" (come fa la loro libreria WewinPrintService.js), tutti i numeri come
// testo. handleType 0 = elenco stampanti, 1 = stampa, 2 = anteprima (restituisce l'immagine, non stampa).
const URL = 'http://127.0.0.1:18188'
const KEY = 'rcMakeidPrint'

// Impostazioni di questo computer (stampante scelta e rotazione): sono del PC, non della squadra.
export function loadPrintSettings() {
  try { return { printer: '', rotation: 0, ...(JSON.parse(localStorage.getItem(KEY)) || {}) } } catch { return { printer: '', rotation: 0 } }
}
export function savePrintSettings(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* memoria bloccata: si riparte dai valori di base */ }
}

const asText = v => JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === 'number' ? String(x) : x))

// Chiama il servizio e legge la risposta. Se il browser non lascia leggere la risposta (il servizio non invia i
// permessi per i siti esterni) ritorna { blind: true }: la richiesta è comunque arrivata.
// `blind`: manda la richiesta UNA sola volta senza leggere la risposta (serve quando il servizio non concede la
// lettura: per le stampe non si riprova mai, altrimenti l'etichetta uscirebbe due volte).
async function call(payload, { timeoutMs = 5000, blind = false } = {}) {
  const body = encodeURI(JSON.stringify(asText(payload)))
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    if (blind) {
      await fetch(URL, { method: 'POST', mode: 'no-cors', headers, body, signal: ctrl.signal })
      return { blind: true }
    }
    const res = await fetch(URL, { method: 'POST', headers, body, signal: ctrl.signal })
    return JSON.parse((await res.text()).replace(/\r\n/g, ''))
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('timeout')
    if (blind || payload.handleType !== '0') throw new Error('offline')
    // Solo per l'elenco stampanti (innocuo da ripetere): acceso ma senza permessi di lettura → la richiesta passa.
    try {
      await fetch(URL, { method: 'POST', mode: 'no-cors', headers, body, signal: ctrl.signal })
      return { blind: true }
    } catch { throw new Error('offline') }
  } finally { clearTimeout(timer) }
}

// Elenco stampanti con la stessa richiesta del servizio, ma via <script> (JSONP) quando la lettura diretta non
// è consentita — è il ripiego che usa anche la loro libreria.
function listViaJsonp() {
  return new Promise((resolve, reject) => {
    const cb = 'wwprint'
    const script = document.createElement('script')
    const done = (fn, v) => { script.remove(); try { delete window[cb] } catch { window[cb] = undefined } fn(v) }
    window[cb] = data => done(resolve, data)
    script.onerror = () => done(reject, new Error('offline'))
    script.src = `${URL}/?callback=${cb}&name=${encodeURI(JSON.stringify(asText({ handleType: '0' })))}&_=${Math.random()}`
    document.head.appendChild(script)
    setTimeout(() => { if (window[cb]) done(reject, new Error('timeout')) }, 5000)
  })
}

// Controlla se il servizio è acceso e quali stampanti vede. state: 'up' | 'down'.
export async function probeService() {
  try {
    let r = await call({ handleType: '0' }, { timeoutMs: 3000 })
    const readable = !r.blind
    if (r.blind) r = await listViaJsonp()
    return { state: 'up', readable, printers: Array.isArray(r.content) ? r.content : [] }
  } catch { return { state: 'down', printers: [] } }
}

// La D50 si riconosce dal nome o dal codice USB (inizia per "D50"); altrimenti la prima della lista.
export function pickPrinter(printers, saved) {
  return printers.find(p => p.printer === saved) || printers.find(p => /d50/i.test(`${p.printer} ${p.USBID || ''}`)) || printers[0] || null
}

const ERRORS = {
  PRINTER_ERROR_OPEN_PORT_FAIL: 'La stampante non risponde: accendila e controlla il cavo USB.',
  PRINTER_ERROR_TASKFULL: 'La coda di stampa è piena: aspetta qualche secondo e riprova.',
  PRINTER_ERROR_UNEXIST: 'Etichetta non valida per questa stampante.',
}
export const printErrorText = code => ERRORS[code] || `La stampante ha risposto con un errore (${code || 'sconosciuto'}).`

// Una pagina per etichetta, a tutta pagina: l'immagine (PNG già disegnata a 60×38 mm) riempie l'etichetta.
// rotation: 0, 90, 180, 270 (se l'etichetta esce girata). preview: true restituisce l'anteprima invece di stampare.
export async function printLabelImages(dataUrls, { printer, rotation = 0, preview = false, readable = true } = {}) {
  if (!printer) throw new Error('no-printer')
  const dots = Number(printer.dots) || 8
  const turn = rotation === 90 || rotation === 270
  const o = { 0: 0, 90: 1, 180: 2, 270: 3 }[rotation] ?? 0
  // Con la stampante a 90° o 270° il foglio è "in piedi": larghezza e altezza si scambiano, come fa la loro libreria.
  const wMm = turn ? LABEL_MM.h : LABEL_MM.w
  const hMm = turn ? LABEL_MM.w : LABEL_MM.h
  const W = Math.round(wMm * dots), H = Math.round(hMm * dots)
  const labels = dataUrls.map(path => ({
    labelWidth: W, labelHeight: H, rfid: '', ddfLength: '0',
    blocks: [{ type: '3', x: 0, y: 0, width: W, height: H, path, oritention: o }],
  }))
  const results = []
  for (let i = 0; i < labels.length; i += 20) {
    let r
    // Coda piena (molte etichette di fila): come fa la loro libreria, si riprova dopo un secondo.
    for (let attempt = 0; attempt < 30; attempt++) {
      r = await call({
        handleType: preview ? '2' : '1', printer: printer.printer, hasDrive: printer.hasDrive ?? 1, copyNum: 1,
        labels: labels.slice(i, i + 20),
      }, { timeoutMs: 30000, blind: !readable })
      if (r.errCode !== 'PRINTER_ERROR_TASKFULL') break
      await new Promise(res => setTimeout(res, 1000))
    }
    results.push(r)
    if (!r.blind && !['PRINTER_ERROR_SUCCESS', 'PRINTER_BASE64'].includes(r.errCode)) throw Object.assign(new Error(r.errCode || 'error'), { code: r.errCode })
  }
  return results
}
