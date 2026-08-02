import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, getDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore'
import { parseScannedCode } from '../utils/generateCode'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useKeyboardWedgeScanner } from '../hooks/useKeyboardWedgeScanner'
import { Check, Truck, Unload } from '../components/Icon'

const ICONS = {
  'Audio':    '🔊',
  'Video':    '📺',
  'Luci':     '🔦',
  'Rigging':  '⛓️',
  'Corrente': '⚡',
  'Effetti':  '🎉',
  'Consumabili': '🪣',
  'Microfoni':   '🎤',
  'Traduzione':  '🌐',
  'Connettività':'📶',
  'Comunicazione':'📡',
  'Strumenti':   '🎸',
  'Kit':      '🧰',
  'Altro':    '📦',
  // legacy
  'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥',
  'Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈',
  'Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮',
  'Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜',
  'Mixer Audio':'🎚️','Console Luci':'🕹️','Faro':'🔦','Ledwall':'📺',
  'Cavo XLR':'🎙️','Cavo Corrente':'⚡','Valigetta':'💼','Case':'🧳',
}

export default function WorkerScanner() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { profile, teamId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Se arriviamo da /events/:id/scan (admin) torniamo all'evento, altrimenti alla home worker
  const backPath = location.pathname.endsWith('/scan') ? `/events/${id}` : '/'
  const [event, setEvent] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [itemDetails, setItemDetails] = useState({}) // id/itemRef → { location, notes, components } dal catalogo
  const resolvedItemDetailIdsRef = useRef(new Set())
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [manualCode, setManualCode] = useState('')
  const [mode, setMode] = useState('load') // 'pronto' | 'load' | 'return'
  const [returnShake, setReturnShake] = useState(false)
  const [phaseBlockedMsg, setPhaseBlockedMsg] = useState('')
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false) // blocca scansioni doppie
  const [scanToast, setScanToast] = useState(null)
  const [showExtraWorker, setShowExtraWorker] = useState(false)
  const [extraWorkerForm, setExtraWorkerForm] = useState({ name:'', qty:1 })
  const [showAllLoadedPopup, setShowAllLoadedPopup] = useState(false)
  const [showAllReturnedPopup, setShowAllReturnedPopup] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showEventNotes, setShowEventNotes] = useState(false)
  const prevLoadedRef = useRef(0)
  const prevReturnedRef = useRef(0)
  useModalScrollLock(showExtraWorker || showAllLoadedPopup || showAllReturnedPopup)

  const fireConfetti = () => {
    const duration = 4000
    const load = () => {
      const colors = ['#7c3aed','#a78bfa','#34d399','#fbbf24','#f472b6','#60a5fa','#fb923c','#fff','#f87171']
      const end = Date.now() + duration

      // Prima salva: esplosione dai due lati in basso
      window.confetti({ particleCount: 80, angle: 60, spread: 80, startVelocity: 55, origin: { x: 0, y: 1 }, colors, zIndex: 9999 })
      window.confetti({ particleCount: 80, angle: 120, spread: 80, startVelocity: 55, origin: { x: 1, y: 1 }, colors, zIndex: 9999 })

      // Poi pioggia continua dall'alto
      const frame = () => {
        window.confetti({ particleCount: 4, startVelocity: 0, angle: 90, spread: 360, origin: { x: Math.random(), y: -0.1 }, colors, gravity: 0.8, scalar: 1.2, drift: Math.random() - 0.5, zIndex: 9999 })
        window.confetti({ particleCount: 3, startVelocity: 0, angle: 90, spread: 360, origin: { x: Math.random(), y: -0.1 }, colors, gravity: 1.1, scalar: 0.8, zIndex: 9999 })
        if (Date.now() < end) requestAnimationFrame(frame)
      }
      setTimeout(frame, 400)
    }

    if (window.confetti) { load() }
    else {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js'
      script.onload = load
      document.head.appendChild(script)
    }
  }
  const lastCodeRef = useRef('') // evita di riprocessare lo stesso codice di fila
  const lastCodeTimeRef = useRef(0)
  const html5QrRef = useRef(null)
  const eventRef = doc(db, 'events', id)

  // Suoni tramite Web Audio API (nessun file esterno necessario)
  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.25)
      } else {
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
      }
    } catch(e) {}
  }

  const vibrate = (pattern) => {
    if (navigator.vibrate) navigator.vibrate(pattern)
  }

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  // Solo visualizzazione (badge): quale furgone va caricato/rientrato per ogni oggetto
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'vehicles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  const processCode = async (code) => {
    const { baseCode: normalized, unitNumber } = parseScannedCode(code)

    // Ignora lo stesso codice scansionato entro 3 secondi (evita doppi)
    const now = Date.now()
    if (normalized === lastCodeRef.current && now - lastCodeTimeRef.current < 3000) return
    lastCodeRef.current = normalized
    lastCodeTimeRef.current = now

    if (processing) return
    setProcessing(true)

    const eventSnap = await getDoc(eventRef)
    if (!eventSnap.exists()) return

    const currentEvent = { id: eventSnap.id, ...eventSnap.data() }
    const eventItems = currentEvent.items || []

    // Trova l'articolo nella lista dell'evento tramite codice
    // Prima cerca in Firestore per trovare l'id dell'articolo dal codice
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), where('code', '==', normalized))
    const itemSnap = await getDocs(q)

    if (itemSnap.empty) {
      vibrate([100, 50, 100])
      playSound('error')
      const result = { action: 'not_found', code: normalized }
      setLastScan(result)
      setScanToast({ ...result, ts: Date.now() })
      setTimeout(() => setScanToast(null), 3000)
      setProcessing(false)
      return
    }

    const foundItem = { id: itemSnap.docs[0].id, ...itemSnap.docs[0].data() }
    const eventItem = eventItems.find(i => i.id === foundItem.id)

    if (!eventItem) {
      vibrate([100, 50, 100])
      playSound('error')
      const result = { action: 'not_in_list', item: foundItem }
      setLastScan(result)
      setScanToast({ ...result, ts: Date.now() })
      setTimeout(() => setScanToast(null), 3000)
      setProcessing(false)
      return
    }

    // Baule sbagliato: il kit ha bauli specifici assegnati a questa riga
    // (vedi src/utils/kitInstances.js) e l'etichetta scansionata è quella di
    // un'unità fisica precisa (…-NN, vedi generateUnitCode) — se il numero
    // non è tra quelli assegnati, il magazziniere ha in mano il baule
    // sbagliato. Blocca l'azione invece di segnarlo comunque: altrimenti lo
    // storico "dove è stato" di kitInstances risulterebbe falsato.
    if (foundItem.isBundle && unitNumber && (eventItem.instanceNumbers || []).length > 0) {
      const scannedInstance = parseInt(unitNumber, 10)
      if (!eventItem.instanceNumbers.includes(scannedInstance)) {
        vibrate([100, 50, 100])
        playSound('error')
        const result = { action: 'wrong_instance', item: eventItem, scannedInstance, expectedInstances: eventItem.instanceNumbers }
        setLastScan(result)
        setScanToast({ ...result, ts: Date.now() })
        setTimeout(() => setScanToast(null), 4000)
        setProcessing(false)
        return
      }
    }

    if (mode === 'pronto') {
      if (eventItem.pronto) {
        vibrate([50])
        const result = { action: 'already_pronto', item: eventItem }
        setLastScan(result)
        setScanToast({ ...result, ts: Date.now() })
        setTimeout(() => setScanToast(null), 3000)
        setProcessing(false)
        return
      }
      const updated = eventItems.map(i => i.id === foundItem.id ? { ...i, pronto: true } : i)
      await updateDoc(eventRef, { items: updated })
      vibrate([60, 40, 120])
      playSound('success')
      const result = { action: 'pronto', item: eventItem }
      setLastScan(result)
      setScanToast({ ...result, ts: Date.now() })
      setTimeout(() => setScanToast(null), 3000)
      setProcessing(false)
      return
    }

    if (mode === 'load') {
      if (eventItem.loaded) {
        vibrate([50])
        const result = { action: 'already_loaded', item: eventItem }
        setLastScan(result)
        setScanToast({ ...result, ts: Date.now() })
        setTimeout(() => setScanToast(null), 3000)
        setProcessing(false)
        return
      }
      const updated = eventItems.map(i => i.id === foundItem.id ? { ...i, loaded: true } : i)
      await updateDoc(eventRef, { items: updated })
      const invSnap = await getDoc(doc(db, 'items', foundItem.id))
      if (invSnap.exists()) {
        const inv = invSnap.data()
        await updateDoc(doc(db, 'items', foundItem.id), { availableQty: Math.max(0, (inv.availableQty || 0) - (eventItem.qty || 1)) })
      }
      vibrate([60, 40, 120])
      playSound('success')
      const result = { action: 'loaded', item: eventItem, location: foundItem.location || '' }
      setLastScan(result)
      setScanToast({ ...result, ts: Date.now() })
      setTimeout(() => setScanToast(null), 3000)
    } else {
      if (!eventItem.loaded) {
        vibrate([100, 50, 100])
        playSound('error')
        const result = { action: 'not_loaded', item: eventItem, location: foundItem.location || '' }
        setLastScan(result)
        setScanToast({ ...result, ts: Date.now() })
        setTimeout(() => setScanToast(null), 3000)
        setProcessing(false)
        return
      }
      if (eventItem.returned) {
        vibrate([50])
        const result = { action: 'already_returned', item: eventItem, location: foundItem.location || '' }
        setLastScan(result)
        setScanToast({ ...result, ts: Date.now() })
        setTimeout(() => setScanToast(null), 3000)
        setProcessing(false)
        return
      }
      const updated = eventItems.map(i => i.id === foundItem.id ? { ...i, returned: true } : i)
      await updateDoc(eventRef, { items: updated })
      const invSnap = await getDoc(doc(db, 'items', foundItem.id))
      if (invSnap.exists()) {
        const inv = invSnap.data()
        await updateDoc(doc(db, 'items', foundItem.id), { availableQty: Math.min(inv.totalQty, (inv.availableQty || 0) + (eventItem.qty || 1)) })
      }
      vibrate([60, 40, 120])
      playSound('success')
      const result = { action: 'returned', item: eventItem, location: foundItem.location || '' }
      setLastScan(result)
      setScanToast({ ...result, ts: Date.now() })
      setTimeout(() => setScanToast(null), 3000)
    }
    setProcessing(false)
  }

  // Lettore wireless (Netum C750 e simili in modalità Bluetooth HID): si
  // comporta come una tastiera, "digita" il codice e Invio da solo — stessa
  // funzione già usata da fotocamera e inserimento manuale.
  useKeyboardWedgeScanner(processCode)

  const startScanner = async () => {
    setError(null); setLastScan(null); setScanning(true)
    // Aspetta che React abbia renderizzato il div nel DOM
    await new Promise(resolve => setTimeout(resolve, 80))
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (html5QrRef.current) {
        try { await html5QrRef.current.stop() } catch(e) {}
        try { html5QrRef.current.clear() } catch(e) {}
      }
      html5QrRef.current = new Html5Qrcode('qr-worker', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
      })
      await html5QrRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.85)
            return { width: size, height: size }
          },
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }],
          },
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        async decodedText => {
          await processCode(decodedText)
          setTimeout(() => setLastScan(prev => prev), 3000)
        },
        () => {}
      )
    } catch(e) {
      setScanning(false)
      setError(t('workerInventory.cameraError'))
    }
  }

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop() } catch(e) {}
      try { html5QrRef.current.clear() } catch(e) {}
    }
    setScanning(false)
    setLastScan(null)
  }

  // Derivazioni items — calcolate sempre (prima del return anticipato)
  const items = event ? event.items || [] : []
  const prepared = items.filter(i => i.pronto).length
  const loaded   = items.filter(i => i.loaded).length
  const returned = items.filter(i => i.returned).length
  const total    = items.length
  // Campo "fatto" della fase corrente — usato per ordinamento liste, scroll
  // al primo da fare, e contatore di completamento: unica fonte invece di
  // ripetere lo stesso ternario in ogni punto che dipende dalla fase.
  const doneField = mode === 'pronto' ? 'pronto' : mode === 'load' ? 'loaded' : 'returned'
  const phaseColor = mode === 'pronto' ? 'var(--blue)' : mode === 'load' ? 'var(--accent2)' : 'var(--green)'
  const PHASE_KEYS = ['pronto', 'load', 'return']

  const firstUnloadedRef = useRef(null)
  const stepperBtnRefs = useRef({})
  const WS_ORDER_CONST = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Extra','Altro']

  const addExtraWorkerItem = async () => {
    if (!extraWorkerForm.name.trim()) return
    const eventSnap = await getDoc(eventRef)
    if (!eventSnap.exists()) return
    const currentItems = eventSnap.data().items || []
    const extra = { id:`extra-${Date.now()}`, name:extraWorkerForm.name.trim(), qty:extraWorkerForm.qty, category:'Extra', isExtra:true, loaded:false, returned:false }
    await updateDoc(eventRef, { items: [...currentItems, extra] })
    setExtraWorkerForm({ name:'', qty:1 })
    setShowExtraWorker(false)
  }
  const extraDrag       = useModalDrag(() => setShowExtraWorker(false), undefined, addExtraWorkerItem, showExtraWorker)
  const allLoadedDrag   = useModalDrag(() => setShowAllLoadedPopup(false), undefined, undefined, showAllLoadedPopup)
  const allReturnedDrag = useModalDrag(() => setShowAllReturnedPopup(false), undefined, undefined, showAllReturnedPopup)
  let firstUnloadedId = null
  for (const cat of WS_ORDER_CONST) {
    const catItems = items
      .filter(i => (i.isExtra ? 'Extra' : (i.category || 'Altro')) === cat)
      .sort((a, b) => (a[doneField] ? 1 : 0) - (b[doneField] ? 1 : 0))
    const first = catItems.find(i => !i[doneField])
    if (first) { firstUnloadedId = first.id; break }
  }

  // Popup quando tutto è caricato — non ripetere se già mostrato per questo evento
  useEffect(() => {
    if (
      mode === 'load' &&
      total > 0 &&
      loaded === total &&
      prevLoadedRef.current < total
    ) {
      const key = 'loaded_popup_shown_' + id
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        setShowAllLoadedPopup(true)
        fireConfetti()
      }
      setMode('return')
    }
    prevLoadedRef.current = loaded
  }, [loaded, total, mode])

  // Popup quando tutto è rientrato
  useEffect(() => {
    const loadedItems = items.filter(i => i.loaded)
    if (
      mode === 'return' &&
      loadedItems.length > 0 &&
      loadedItems.every(i => i.returned) &&
      prevReturnedRef.current < loadedItems.length
    ) {
      const key = 'returned_popup_shown_' + id
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        setShowAllReturnedPopup(true)
        fireConfetti()
      }
    }
    prevReturnedRef.current = loadedItems.filter(i => i.returned).length
  }, [returned, mode, items, id])

  useEffect(() => () => { if (html5QrRef.current) { try { html5QrRef.current.stop() } catch(e) {} } }, [])

  // Posizione/note/componenti kit live dal catalogo, recuperate in BLOCCO per
  // tutti gli oggetti della checklist (non riga per riga): risolvendo tutte
  // insieme invece che una alla volta con tempi scaglionati, la checklist non
  // "cresce" pezzo per pezzo sotto il dito mentre si sta per toccare un bottone.
  useEffect(() => {
    const list = event?.items || []
    const idsToFetch = [...new Set(list.filter(i => !i.isExtra).map(i => i.itemRef || i.id))]
      .filter(itemId => !resolvedItemDetailIdsRef.current.has(itemId))
    if (idsToFetch.length === 0) return
    idsToFetch.forEach(itemId => resolvedItemDetailIdsRef.current.add(itemId))
    Promise.all(idsToFetch.map(itemId =>
      getDoc(doc(db, 'items', itemId)).then(snap => [itemId, snap.exists() ? snap.data() : null])
    )).then(results => {
      setItemDetails(prev => {
        const next = { ...prev }
        results.forEach(([itemId, data]) => {
          next[itemId] = {
            location: data?.location || null,
            notes: data?.notes || null,
            components: data?.isBundle && data?.components?.length ? data.components : null,
            instances: data?.isBundle ? (data.instances || []) : null,
          }
        })
        return next
      })
    })
  }, [event])

  if (!event) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}><p style={{ color:'var(--text2)' }}>{t('eventDetail.loading')}</p></div>

  const scanResult = {
    pronto:           { bg:'rgba(79,195,247,0.15)',  border:'rgba(79,195,247,0.4)',  color:'var(--blue)',    icon:'📋', title:t('workerScanner.prontoTitle'), msg: i => t('workerScanner.prontoMsg', { name: i?.name }) },
    already_pronto:   { bg:'rgba(79,195,247,0.1)',   border:'rgba(79,195,247,0.3)',  color:'var(--blue)',    icon:'ℹ️', title:t('workerScanner.alreadyPreparedTitle'), msg: i => t('workerScanner.alreadyPreparedMsg', { name: i?.name }) },
    loaded:           { bg:'rgba(245,166,35,0.15)', border:'rgba(245,166,35,0.4)', color:'var(--accent2)', icon:'🚛', title:t('workerScanner.loadedTitle'), msg: i => t('workerScanner.loadedMsg', { name: i?.name }) },
    returned:         { bg:'rgba(105,240,174,0.15)', border:'rgba(105,240,174,0.4)', color:'var(--green)', icon:'✅', title:t('workerScanner.returnedTitle'), msg: i => t('workerScanner.returnedMsg', { name: i?.name }) },
    not_found:        { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'❓', title:t('workerScanner.notFoundTitle'), msg: i => t('workerScanner.notFoundMsg', { code: lastScan?.code }) },
    not_in_list:      { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'⚠️', title:t('workerScanner.notInListTitle'), msg: i => t('workerScanner.notInListMsg', { name: i?.name }) },
    already_loaded:   { bg:'rgba(79,195,247,0.1)',  border:'rgba(79,195,247,0.3)',  color:'var(--blue)',   icon:'ℹ️', title:t('workerScanner.alreadyLoadedTitle'), msg: i => t('workerScanner.alreadyLoadedMsg', { name: i?.name }) },
    already_returned: { bg:'rgba(79,195,247,0.1)',  border:'rgba(79,195,247,0.3)',  color:'var(--blue)',   icon:'ℹ️', title:t('workerScanner.alreadyReturnedTitle'), msg: i => t('workerScanner.alreadyReturnedMsg', { name: i?.name }) },
    not_loaded:       { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'⚠️', title:t('workerScanner.notLoadedTitle'), msg: i => t('workerScanner.notLoadedMsg', { name: i?.name }) },
    wrong_instance:   { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'🧳', title:t('workerScanner.wrongInstanceTitle'), msg: i => t('workerScanner.wrongInstanceMsg', { name: i?.name, scanned: lastScan?.scannedInstance, expected: (lastScan?.expectedInstances || []).join(', ') }) },
  }

  const srOnlyStyle = { position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', whiteSpace:'nowrap', border:0, clip:'rect(0,0,0,0)' }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)', display:'flex', flexDirection:'column', paddingBottom:140 }}>

      {/* Annunci per screen reader: il popup/il messaggio bloccato sono
          puramente visivi e temporizzati, altrimenti non arriverebbero a chi
          non guarda lo schermo nel momento esatto in cui compaiono. Regioni
          sempre montate (non condizionate) perché molti screen reader non
          annunciano l'inserimento di un intero live-region nuovo di zecca. */}
      <div aria-live="polite" role="status" style={srOnlyStyle}>
        {scanToast ? `${scanResult[scanToast.action].title}. ${scanToast.item?.name || (scanToast.code ? t('scanner.code', { code: scanToast.code }) : '')}` : ''}
      </div>
      <div aria-live="assertive" role="alert" style={srOnlyStyle}>
        {phaseBlockedMsg}
      </div>

      {/* - Popup centrale post-scansione - */}
      {scanToast && (() => {
        const r = scanResult[scanToast.action]
        const isOk = ['pronto','loaded','returned'].includes(scanToast.action)
        return (
          <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{
              background: isOk ? 'rgba(22,40,30,0.97)' : 'rgba(40,16,20,0.97)',
              border: `2px solid ${isOk ? 'var(--green)' : 'var(--red)'}`,
              borderRadius:24, padding:'28px 32px', textAlign:'center', minWidth:260, maxWidth:320,
              boxShadow:'0 12px 48px rgba(0,0,0,0.7)',
              animation:'fadeInUp 0.2s cubic-bezier(0.32,0.72,0,1) both',
            }}>
              <div style={{ fontSize:56, marginBottom:12 }}>{r.icon}</div>
              <p style={{ fontWeight:800, fontSize:22, color:r.color, marginBottom:8 }}>{r.title}</p>
              <p style={{ color:'var(--text)', fontSize:16, lineHeight:1.4 }}>{scanToast.item?.name || t('scanner.code', { code: scanToast.code })}</p>
              {scanToast.location && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:12, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.3)', borderRadius:8, padding:'6px 16px' }}>
                  <span>📍</span>
                  <span style={{ color:'var(--blue)', fontWeight:800, fontSize:15 }}>{scanToast.location}</span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* - Header compatto - */}
      <style>{`
        .phase-stepper {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          background: var(--card2);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 4px;
          margin-top: 10px;
        }
        .phase-stepper-thumb {
          position: absolute;
          top: 4px; bottom: 4px; left: 4px;
          width: calc((100% - 8px) / 3);
          border-radius: 10px;
          transition: transform 0.35s cubic-bezier(0.65,0,0.35,1), background 0.25s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .phase-stepper-btn {
          position: relative; z-index: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 6px;
          padding: 10px 4px;
          min-height: 44px;
          border-radius: 10px;
          background: transparent;
          color: var(--text2);
          font-size: 12.5px; font-weight: 700;
          transition: color 0.25s ease, opacity 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .phase-stepper-btn.active { color: white; }
        .phase-stepper-btn.blocked { opacity: 0.4; }
        @keyframes phaseShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .phase-stepper-btn.shake { animation: phaseShake 0.3s ease; }
        @media (prefers-reduced-motion: reduce) {
          .phase-stepper-thumb { transition: none; }
          .phase-stepper-btn.shake { animation: none; }
        }
      `}</style>
      <div style={{ padding:'52px 16px 12px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => { stopScanner(); navigate(backPath) }}
            style={{ background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14, fontWeight:600 }}>
            ← {t('common.back')}
          </button>
        </div>

        {/* Stepper a 3 fasi: Pronto ↔ Carico si scambiano liberamente (in
            tanti saltano la preparazione), ma non si passa a Scarico senza
            aver caricato almeno un oggetto — un tap lì mentre è bloccato fa
            un piccolo scatto e mostra il motivo, invece di non fare nulla. */}
        <div
          className="phase-stepper" role="tablist" aria-label={t('workerScanner.modeLoadTitle')}
          onKeyDown={e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const idx = PHASE_KEYS.indexOf(mode)
            const dir = e.key === 'ArrowRight' ? 1 : -1
            const nextKey = PHASE_KEYS[(idx + dir + PHASE_KEYS.length) % PHASE_KEYS.length]
            if (nextKey === 'return' && loaded === 0) {
              setReturnShake(true)
              setTimeout(() => setReturnShake(false), 320)
              setPhaseBlockedMsg(t('workerScanner.cannotStartReturnYet'))
              setTimeout(() => setPhaseBlockedMsg(''), 2200)
            } else {
              setMode(nextKey)
              setLastScan(null)
            }
            stepperBtnRefs.current[nextKey]?.focus()
          }}
        >
          <div className="phase-stepper-thumb" style={{
            transform: `translateX(${{ pronto:0, load:1, return:2 }[mode] * 100}%)`,
            background: phaseColor,
          }} />
          {[
            { key:'pronto', label:t('workerScanner.phasePronto'), Icon:Check },
            { key:'load',   label:t('workerScanner.phaseLoad'),   Icon:Truck },
            { key:'return', label:t('workerScanner.phaseReturn'), Icon:Unload },
          ].map(p => {
            const blocked = p.key === 'return' && mode !== 'return' && loaded === 0
            return (
              <button
                key={p.key}
                ref={el => { stepperBtnRefs.current[p.key] = el }}
                role="tab"
                aria-selected={mode === p.key}
                aria-disabled={blocked}
                tabIndex={mode === p.key ? 0 : -1}
                className={`phase-stepper-btn${mode === p.key ? ' active' : ''}${blocked ? ' blocked' : ''}${returnShake && p.key === 'return' ? ' shake' : ''}`}
                onClick={() => {
                  if (blocked) {
                    setReturnShake(true)
                    setTimeout(() => setReturnShake(false), 320)
                    setPhaseBlockedMsg(t('workerScanner.cannotStartReturnYet'))
                    setTimeout(() => setPhaseBlockedMsg(''), 2200)
                    return
                  }
                  if (mode !== p.key) { setMode(p.key); setLastScan(null) }
                }}
              >
                <p.Icon size={15} />
                {p.label}
              </button>
            )
          })}
        </div>
        {phaseBlockedMsg && (
          <p style={{ color:'var(--red)', fontSize:12, fontWeight:600, marginTop:6, textAlign:'center' }}>{phaseBlockedMsg}</p>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
          <h1 style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.name}</h1>
          {event.notes && (
            <button
              onClick={() => setShowEventNotes(v => !v)}
              aria-label={t('workerScanner.eventNotesToggle')}
              aria-pressed={showEventNotes}
              style={{
                flexShrink:0, width:40, height:40, borderRadius:'50%',
                background: showEventNotes ? 'var(--blue)' : 'rgba(79,195,247,0.15)',
                border:'1px solid rgba(79,195,247,0.35)',
                color: showEventNotes ? 'white' : 'var(--blue)',
                fontWeight:900, fontSize:12,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}
            >
              {showEventNotes ? '✕' : 'i'}
            </button>
          )}
        </div>
        {event.location && <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>📍 {event.location}</p>}
        {showEventNotes && event.notes && (
          <div style={{
            marginTop:10, padding:'12px 14px',
            background:'rgba(79,195,247,0.07)',
            border:'1px solid rgba(79,195,247,0.2)',
            borderRadius:10,
            maxHeight:160, overflowY:'auto',
          }}>
            <p style={{ color:'var(--text)', fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{event.notes}</p>
          </div>
        )}
      </div>

      {/* - Camera / Scanner - */}
      <div style={{ padding:'12px 16px 0', flex:1 }}>
        <div style={{
          borderRadius:20, overflow:'hidden',
          border:`2px solid ${scanning ? phaseColor : 'var(--border)'}`,
          transition:'border-color 0.3s',
          background:'var(--card)',
        }}>
          {/* qr-worker SEMPRE nel DOM - Html5Qrcode ne ha bisogno al momento dell'init */}
          <div style={{ position:'relative', display: scanning ? 'block' : 'none' }}>
            <div id="qr-worker" style={{ width:'100%' }} />
            {lastScan && (() => {
              const r = scanResult[lastScan.action]
              return (
                <div style={{ position:'absolute', bottom:0, left:0, right:0, background: r.bg.replace('0.1','0.95').replace('0.15','0.95'), backdropFilter:'blur(10px)', padding:'14px 16px', borderTop:`2px solid ${r.border}`, animation:'slideUp 0.2s ease' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:28 }}>{r.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:800, fontSize:16, color:r.color }}>{r.title}</p>
                      <p style={{ color:'var(--text)', fontSize:13, marginTop:1 }}>{r.msg(lastScan.item)}</p>
                      {lastScan.location && (
                        <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:5, background:'rgba(79,195,247,0.18)', border:'1px solid rgba(79,195,247,0.4)', borderRadius:6, padding:'3px 10px' }}>
                          <span style={{ fontSize:12 }}>📍</span>
                          <span style={{ color:'var(--blue)', fontSize:13, fontWeight:800 }}>{lastScan.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
            <button onClick={stopScanner}
              style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.65)', color:'white', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:700 }}>
              ■ Stop
            </button>
          </div>

          {!scanning && (
            <button onClick={startScanner} style={{
              width:'100%', padding:'36px 20px', textAlign:'center', background:'transparent',
              display:'flex', flexDirection:'column', alignItems:'center', gap:12,
            }}>
              <div style={{
                width:72, height:72, borderRadius:20,
                background: mode === 'pronto' ? 'rgba(79,195,247,0.13)' : mode === 'load' ? 'rgba(245,166,35,0.15)' : 'rgba(52,211,153,0.12)',
                border:`2px dashed ${mode === 'pronto' ? 'rgba(79,195,247,0.45)' : mode === 'load' ? 'rgba(245,166,35,0.5)' : 'rgba(52,211,153,0.4)'}`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:32,
              }}>
                📷
              </div>
              <div>
                <p style={{ fontWeight:800, fontSize:17, color:'var(--text)' }}>{t('scanner.startCamera')}</p>
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>
                  {mode === 'pronto' ? t('workerScanner.prontoHint') : mode === 'load' ? t('workerScanner.loadHint') : t('workerScanner.returnHint')}
                </p>
              </div>
            </button>
          )}
        </div>

        {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:12, padding:'12px 16px', color:'var(--red)', marginTop:10, fontSize:14 }}>{error}</div>}

        {/* Inserimento manuale - compatto e collassabile */}
        <details style={{ marginTop:12 }}>
          <summary style={{ color:'var(--text2)', fontSize:13, fontWeight:600, cursor:'pointer', userSelect:'none', padding:'8px 0' }}>
            {t('workerScanner.manualEntryToggle')}
          </summary>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <label htmlFor="ws-manual-code" style={srOnlyStyle}>{t('workerScanner.manualCodeLabel')}</label>
            <input id="ws-manual-code" value={manualCode} onChange={e => setManualCode(e.target.value)}
              placeholder={t('workerScanner.manualCodePlaceholder')} onKeyDown={e => { if (e.key === 'Enter') { processCode(manualCode); setManualCode('') } }}
              style={{ fontFamily:'monospace', fontSize:13 }} />
            <button onClick={() => { processCode(manualCode); setManualCode('') }} className="btn btn-primary" style={{ flexShrink:0, padding:'10px 14px' }}>{t('workerScanner.ok')}</button>
          </div>
        </details>

        {/* Lista carico - compatta con categorie */}
        <div style={{ marginTop:14, marginBottom:16 }}>
          <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>
            {t('workerScanner.loadListTitle', { returned: items.filter(i=>i.returned).length, total })}
          </p>

          {/* Contatore mancanti al completamento della fase corrente (pronto/carico) */}
          {total > 0 && (mode === 'pronto' || mode === 'load') && (() => {
            const done = mode === 'pronto' ? prepared : loaded
            const allDoneMsg = mode === 'pronto' ? t('workerScanner.allPrepared') : t('workerScanner.allLoaded')
            const missingMsg = mode === 'pronto' ? t('workerScanner.itemsMissingPrep', { count: total - done }) : t('workerScanner.itemsMissing', { count: total - done })
            const ofTotalMsg = mode === 'pronto' ? t('workerScanner.preparedOfTotal', { prepared: done, total }) : t('workerScanner.loadedOfTotal', { loaded: done, total })
            return (
              <div
                onClick={() => firstUnloadedRef.current?.scrollIntoView({ behavior:'smooth', block:'center' })}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'10px 14px', borderRadius:12, marginBottom:8,
                  background: done === total ? 'rgba(52,211,153,0.10)' : 'rgba(216,56,63,0.07)',
                  border: `1px solid ${done === total ? 'rgba(52,211,153,0.30)' : 'rgba(216,56,63,0.20)'}`,
                  cursor: done === total ? 'default' : 'pointer',
                }}>
                <div style={{
                  width:36, height:36, borderRadius:10, flexShrink:0,
                  background: done === total ? 'rgba(52,211,153,0.22)' : 'var(--accent)',
                  color: done === total ? 'var(--green)' : 'white',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:900, fontSize: done === total ? 20 : 17,
                }}>
                  {done === total ? '✓' : total - done}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>
                    {done === total ? allDoneMsg : missingMsg}
                  </p>
                  <div style={{ marginTop:5, height:4, borderRadius:4, background:'var(--border)', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:'100%', borderRadius:4,
                      transformOrigin:'left', transition:'transform 0.4s ease',
                      transform:`scaleX(${total > 0 ? done / total : 0})`,
                      background: done === total ? 'var(--green)' : 'var(--accent)',
                    }} />
                  </div>
                  <p style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>{ofTotalMsg}</p>
                </div>
              </div>
            )
          })()}

          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            {items.length === 0
              ? <p style={{ padding:'20px', color:'var(--text2)', textAlign:'center', fontSize:14 }}>{t('workerScanner.listNotPrepared')}</p>
              : (() => {
                  const WS_CAT_ICONS = { Audio:'🔊', Video:'📺', Luci:'🔦', Rigging:'⛓️', Corrente:'⚡', Effetti:'🎉', Consumabili:'🪣', Microfoni:'🎤', Traduzione:'🌐', Connettività:'📶', Comunicazione:'📡', Strumenti:'🎸', Kit:'🧰', Extra:'✨', Altro:'📦' }
                  const WS_ORDER = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti','Extra','Altro']
                  const wsCatGrouped = {}
                  items.forEach(item => {
                    // Categorie "orfane" (rinominate nel magazzino dopo l'aggiunta
                    // all'evento) finiscono in Altro invece di sparire dalla lista.
                    const rawCat = item.isExtra ? 'Extra' : (item.category || 'Altro')
                    const cat = WS_ORDER.includes(rawCat) ? rawCat : 'Altro'
                    if (!wsCatGrouped[cat]) wsCatGrouped[cat] = []
                    wsCatGrouped[cat].push(item)
                  })
                  // Dentro ogni categoria: da fare prima, caricati/rientrati in fondo
                  Object.keys(wsCatGrouped).forEach(cat => {
                    wsCatGrouped[cat].sort((a, b) => {
                      const aDone = a[doneField] ? 1 : 0
                      const bDone = b[doneField] ? 1 : 0
                      return aDone - bDone
                    })
                  })
                  const wsCatKeys = WS_ORDER.filter(c => wsCatGrouped[c])
                  const wsMultiCat = wsCatKeys.length > 1
                  return wsCatKeys.map(cat => (
                    <div key={cat}>
                      {wsMultiCat && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px 3px', background:'var(--bg2)' }}>
                          <span style={{ fontSize:11 }}>{WS_CAT_ICONS[cat]||'📦'}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{cat}</span>
                          <div style={{ flex:1, height:1, background:'var(--border)' }} />
                          <span style={{ fontSize:10, color:'var(--text3)' }}>{wsCatGrouped[cat].length}</span>
                        </div>
                      )}
                      {wsCatGrouped[cat].map(item => (
                <div key={item.id} ref={!item[doneField] && item.id === firstUnloadedId ? firstUnloadedRef : null}>
                <ChecklistRow item={{
                  ...item,
                  _vehicle: vehicles.find(v => v.id === item.vehicleId) || null,
                  _details: itemDetails[item.itemRef || item.id] || null,
                  _onToggleLoaded: async (itemId) => {
                    const snap = await getDoc(eventRef)
                    if (!snap.exists()) return
                    const evData = snap.data()
                    const evItems = evData.items || []
                    const itm = evItems.find(i => i.id === itemId)
                    if (!itm) return
                    const updated = evItems.map(i => i.id !== itemId ? i : { ...i, loaded: !i.loaded })
                    await updateDoc(eventRef, { items: updated })
                    const newLoaded = !itm.loaded
                    const invRef = doc(db, 'items', itemId)
                    const invSnap = await getDoc(invRef)
                    if (invSnap.exists()) {
                      const delta = newLoaded ? -(itm.qty||1) : (itm.qty||1)
                      await updateDoc(invRef, { availableQty: Math.max(0, Math.min(invSnap.data().totalQty, (invSnap.data().availableQty||0) + delta)) })
                    }
                  },
                  _onToggleReturned: async (itemId) => {
                    const snap = await getDoc(eventRef)
                    if (!snap.exists()) return
                    const evData = snap.data()
                    const evItems = evData.items || []
                    const itm = evItems.find(i => i.id === itemId)
                    if (!itm?.loaded) return
                    const updated = evItems.map(i => i.id !== itemId ? i : { ...i, returned: !i.returned })
                    await updateDoc(eventRef, { items: updated })
                    const newReturned = !itm.returned
                    const invRef = doc(db, 'items', itemId)
                    const invSnap = await getDoc(invRef)
                    if (invSnap.exists()) {
                      const delta = newReturned ? (itm.qty||1) : -(itm.qty||1)
                      await updateDoc(invRef, { availableQty: Math.max(0, Math.min(invSnap.data().totalQty, (invSnap.data().availableQty||0) + delta)) })
                    }
                  },
                  _onTogglePronto: async (itemId) => {
                    const snap = await getDoc(eventRef)
                    if (!snap.exists()) return
                    const evData = snap.data()
                    const evItems = evData.items || []
                    const updated = evItems.map(i => i.id !== itemId ? i : { ...i, pronto: !i.pronto })
                    await updateDoc(eventRef, { items: updated })
                  },
                }} />
                </div>
              ))}
                    </div>
                  ))
                })()
            }
          </div>
          {/* Bottone Extra sempre in fondo alla lista */}
          <button onClick={() => setShowExtraWorker(true)}
            style={{ width:'100%', marginTop:10, background:'rgba(245,166,35,0.10)', border:'1px solid rgba(245,166,35,0.35)', color:'var(--accent2)', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14 }}>
            {t('workerScanner.addExtraItem')}
          </button>
        </div>
      </div>

      {/* Popup tutto caricato */}
      {showAllLoadedPopup && (
        <div className={`modal-overlay${allLoadedDrag.closing ? ' closing' : ''}`} onClick={allLoadedDrag.onOverlayClick}>
          <div className={`modal${allLoadedDrag.jiggling ? ' modal-jiggle' : ''}${allLoadedDrag.closing ? ' closing' : ''}`} style={{ position:'relative', textAlign:'center', padding:'36px 24px 32px' }} {...allLoadedDrag.props}>
            <button className="close-btn" onClick={allLoadedDrag.close}>✕</button>
            <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
            <h2 style={{ fontSize:22, marginBottom:8 }}>{t('workerScanner.allLoadedPopupTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:15, lineHeight:1.6, marginBottom:24, whiteSpace:'pre-line' }}>
              {t('workerScanner.allLoadedPopupDesc')}
            </p>
            <button onClick={() => { setShowAllLoadedPopup(false); navigate('/') }}
              className="btn btn-primary btn-full" style={{ fontSize:16, padding:'14px' }}>
              {t('workerScanner.goHome')}
            </button>
            <button onClick={() => setShowAllLoadedPopup(false)}
              style={{ marginTop:12, width:'100%', padding:'10px', background:'transparent', color:'var(--text2)', fontSize:14 }}>
              {t('workerScanner.stayHereLoaded')}
            </button>
          </div>
        </div>
      )}

      {/* Popup tutto scaricato */}
      {showAllReturnedPopup && (
        <div className={`modal-overlay${allReturnedDrag.closing ? ' closing' : ''}`} onClick={allReturnedDrag.onOverlayClick}>
          <div className={`modal${allReturnedDrag.jiggling ? ' modal-jiggle' : ''}${allReturnedDrag.closing ? ' closing' : ''}`} style={{ position:'relative', textAlign:'center', padding:'36px 24px 32px' }} {...allReturnedDrag.props}>
            <button className="close-btn" onClick={allReturnedDrag.close}>✕</button>
            <div style={{ fontSize:64, marginBottom:12 }}>📦</div>
            <h2 style={{ fontSize:22, marginBottom:8 }}>{t('workerScanner.allReturnedPopupTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:15, lineHeight:1.6, marginBottom:24, whiteSpace:'pre-line' }}>
              {t('workerScanner.allReturnedPopupDesc')}
            </p>
            <button onClick={() => {
                setShowAllReturnedPopup(false)
                navigate('/')
              }}
              className="btn btn-green btn-full" style={{ fontSize:16, padding:'14px' }}>
              {t('workerScanner.doneGoHome')}
            </button>
            <button onClick={() => setShowAllReturnedPopup(false)}
              style={{ marginTop:12, width:'100%', padding:'10px', background:'transparent', color:'var(--text2)', fontSize:14 }}>
              {t('workerScanner.stayHereReturned')}
            </button>
          </div>
        </div>
      )}

      {/* Modal extra worker */}
      {showExtraWorker && (
        <div className={`modal-overlay${extraDrag.closing ? ' closing' : ''}`} onClick={extraDrag.onOverlayClick}>
          <div className={`modal${extraDrag.jiggling ? ' modal-jiggle' : ''}${extraDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...extraDrag.props}>
            <button className="close-btn" onClick={extraDrag.close}>✕</button>
            <h2>{t('eventDetail.extraItemTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('workerScanner.extraItemDesc')}</p>
            <div className="form-group">
              <label htmlFor="ws-extra-name">{t('eventDetail.nameLabel')}</label>
              <input id="ws-extra-name" value={extraWorkerForm.name} onChange={e => setExtraWorkerForm(f => ({...f, name:e.target.value}))} placeholder={t('workerScanner.extraNamePlaceholder')} autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="ws-extra-qty">{t('eventDetail.quantityLabel')}</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button aria-label={t('workerScanner.decreaseQty')} onClick={() => setExtraWorkerForm(f => ({...f, qty:Math.max(1,f.qty-1)}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                <input id="ws-extra-qty" type="number" min="1" value={extraWorkerForm.qty}
                  onChange={e => setExtraWorkerForm(f => ({...f, qty:Math.max(1,parseInt(e.target.value)||1)}))}
                  style={{ textAlign:'center', fontWeight:800, fontSize:16, width:60, padding:'6px 4px' }} />
                <button aria-label={t('workerScanner.increaseQty')} onClick={() => setExtraWorkerForm(f => ({...f, qty:f.qty+1}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
              </div>
            </div>
            <button
              onClick={addExtraWorkerItem}
              className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!extraWorkerForm.name.trim()}>
              {t('eventDetail.confirmAddToList')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Riga checklist con bottoni touch-friendly e note accessibili
function ChecklistRow({ item }) {
  const { t } = useTranslation()
  const [showInfo, setShowInfo]   = useState(false)
  const location = item._details?.location || null
  const warehouseNotes = item._details?.notes || null
  // Auto-repair: se l'evento è stato salvato prima che i componenti fossero
  // registrati sul kit, quelli live dal catalogo (risolti in blocco dal
  // genitore) hanno priorità così la lista è sempre aggiornata.
  const liveComponents = item._details?.components || item.components || null
  const isKit = item.isBundle || (liveComponents && liveComponents.length > 0)
  // Bauli assegnati a questa riga — letti in tempo reale dal kit, così se un
  // baule viene segnato incompleto in magazzino l'avviso arriva anche qui,
  // dove serve davvero (il magazziniere deve sapere QUALE baule caricare).
  const assignedInstances = (item._details?.instances || []).filter(inst => (item.instanceNumbers || []).includes(inst.number))
  const damagedInstances = assignedInstances.filter(inst => (inst.brokenComponents || []).length > 0)
  // La nota specifica dell'evento (aggiunta dall'admin sulla lista di carico) ha priorità su quella generale di magazzino
  const eventNote = item.eventNote || null
  const displayNote = eventNote || warehouseNotes
  const hasInfo = displayNote || isKit

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom: showInfo ? 'none' : '1px solid var(--border)', background: item.mancante ? 'rgba(234,88,12,0.04)' : 'transparent', borderLeft: item.mancante ? '3px solid #ea580c' : '3px solid transparent' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0, opacity: item.loaded ? 0.45 : 1, transition:'opacity 0.3s' }}>
        <span style={{ fontSize:20, flexShrink:0 }}>{ICONS[item.category] || '📦'}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <p style={{ fontWeight:700, fontSize:14, color: item.returned ? 'var(--text2)' : 'var(--text)', textDecoration: item.returned ? 'line-through' : 'none' }}>{item.name}</p>
            {item.isExtra && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.35)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>EXTRA</span>}
            {item.mancante && <span style={{ background:'rgba(234,88,12,0.12)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>⚠️ MANCA</span>}
            {item.pronto && !item.loaded && <span style={{ background:'rgba(5,150,105,0.12)', color:'#059669', border:'1px solid rgba(5,150,105,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>✓ PRONTO</span>}
            {item._vehicle && <span style={{ background:`${item._vehicle.color || 'var(--blue)'}22`, color: item._vehicle.color || 'var(--blue)', border:`1px solid ${item._vehicle.color || 'var(--blue)'}55`, borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>{item._vehicle.emoji || '🚐'} {item._vehicle.name}</span>}
            {item.isBundle && (item.instanceNumbers || []).length > 0 && (
              <span style={{
                background: damagedInstances.length ? 'rgba(248,113,113,0.15)' : 'rgba(148,163,184,0.15)',
                color: damagedInstances.length ? 'var(--red)' : 'var(--text2)',
                border: `1px solid ${damagedInstances.length ? 'rgba(248,113,113,0.35)' : 'var(--border)'}`,
                borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0,
              }}>
                {damagedInstances.length > 0 ? '⚠️ ' : ''}{t('workerScanner.kitInstancesBadge', { numbers: item.instanceNumbers.join(', ') })}
              </span>
            )}
            {hasInfo && (
              <button onClick={() => setShowInfo(s => !s)}
                aria-label={t('workerScanner.itemInfoToggle')}
                aria-pressed={showInfo}
                style={{
                  background: showInfo ? ((eventNote||isKit) ? 'var(--accent2)' : 'var(--blue)') : ((eventNote||isKit) ? 'rgba(245,166,35,0.15)' : 'rgba(79,195,247,0.15)'),
                  border: `1px solid ${(eventNote||isKit) ? 'rgba(245,166,35,0.4)' : 'rgba(79,195,247,0.3)'}`,
                  color: showInfo ? 'white' : ((eventNote||isKit) ? 'var(--accent2)' : 'var(--blue)'),
                  borderRadius:'50%', width:30, height:30, fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
                }}>
                {showInfo ? '✕' : 'i'}
              </button>
            )}
            {location && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:8, padding:'3px 10px' }}>
                <span style={{ fontSize:13 }}>📍</span>
                <span style={{ color:'var(--blue)', fontSize:13, fontWeight:800 }}>{location}</span>
              </div>
            )}
          </div>
          <div style={{ display:'inline-flex', alignItems:'baseline', gap:4, marginTop:4 }}>
            <span style={{ fontWeight:900, fontSize:20, color:'var(--text)', lineHeight:1 }}>{item.qty || 1}</span>
            <span style={{ fontSize:12, color:'var(--text2)', fontWeight:500 }}>{t('workerScanner.piecesUnit')}</span>
          </div>
          {damagedInstances.length > 0 && (
            <p style={{ color:'var(--red)', fontSize:11, marginTop:3, lineHeight:1.4 }}>
              {damagedInstances.map(inst => t('eventDetail.kitInstanceIssue', {
                number: inst.number,
                names: inst.brokenComponents.map(b => (liveComponents || []).find(c => c.itemId === b.itemId)?.name || '?').join(', '),
              })).join(' · ')}
            </p>
          )}
        </div>
        </div>
        {/* Bottoni touch-friendly - grandi abbastanza per il dito */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
          {!item.loaded ? (
            <div style={{ display:'flex', gap:5 }}>
              <button
                style={{ minHeight:44, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: item.pronto ? 'rgba(5,150,105,0.15)' : 'var(--card2)',
                  color: item.pronto ? '#059669' : 'var(--text3)',
                  border: item.pronto ? '1.5px solid rgba(5,150,105,0.35)' : '1.5px solid transparent',
                  WebkitTapHighlightColor:'transparent',
                }}
                onClick={() => item._onTogglePronto && item._onTogglePronto(item.id)}
              >
                {item.pronto ? t('eventDetail.readyDone') : t('eventDetail.ready')}
              </button>
              <button
                style={{ minWidth:70, minHeight:44, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: item.pronto ? 'rgba(245,166,35,0.20)' : 'var(--card2)',
                  color: item.pronto ? 'var(--accent2)' : 'var(--text)',
                  border: item.pronto ? '1.5px solid rgba(245,166,35,0.45)' : '1.5px solid var(--border)',
                  WebkitTapHighlightColor:'transparent',
                }}
                onClick={() => item._onToggleLoaded && item._onToggleLoaded(item.id)}
              >
                {t('workerScanner.toLoadShort')}
              </button>
            </div>
          ) : (
            <button
              style={{ minWidth:80, minHeight:44, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none',
                display:'flex', alignItems:'center', justifyContent:'center',
                background:'rgba(245,166,35,0.18)', color:'var(--accent2)',
                WebkitTapHighlightColor:'transparent',
              }}
              onClick={() => item._onToggleLoaded && item._onToggleLoaded(item.id)}
            >
              {t('workerScanner.loadedShort')}
            </button>
          )}
          <button
            disabled={!item.loaded}
            style={{ minWidth:80, minHeight:44, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: item.returned ? 'rgba(52,211,153,0.15)' : item.loaded ? 'var(--card2)' : 'var(--bg3)',
              color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--text3)',
              opacity: item.loaded ? 1 : 0.4,
              WebkitTapHighlightColor:'transparent',
            }}
            onClick={() => item._onToggleReturned && item._onToggleReturned(item.id)}
          >
            {item.returned ? t('workerScanner.returnedShort') : t('workerScanner.returnShort')}
          </button>
        </div>
      </div>
      {/* Pannello info unificato: nota in alto, componenti kit sotto (se presenti) */}
      {showInfo && hasInfo && (
        <div style={{ borderBottom:'1px solid var(--border)' }}>
          {displayNote && (
            <div style={{ padding:'10px 16px 10px', background: eventNote ? 'rgba(245,166,35,0.05)' : 'rgba(79,195,247,0.04)', display:'flex', gap:8 }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{eventNote ? '📝' : '💡'}</span>
              <p style={{ color:'var(--text)', fontSize:13, lineHeight:1.6 }}>{displayNote}</p>
            </div>
          )}
          {isKit && (
            <div style={{ background:'rgba(245,166,35,0.04)', padding:'10px 16px 12px' }}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('workerScanner.kitContents')}</p>
              {!(liveComponents?.length)
                ? <p style={{ fontSize:13, color:'var(--text2)', fontStyle:'italic' }}>{t('workerScanner.noComponentsRegistered')}</p>
                : liveComponents.map((comp, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom: i < liveComponents.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent2)', minWidth:30, background:'rgba(245,166,35,0.12)', borderRadius:6, padding:'1px 6px', textAlign:'center' }}>×{comp.qty}</span>
                    <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{comp.name}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}
    </>
  )
}
