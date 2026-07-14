import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore'
import { parseScannedCode } from '../utils/generateCode'

const ICONS = {
  'Audio':    '🔊',
  'Video':    '📺',
  'Luci':     '🔦',
  'Rigging':  '⛓️',
  'Corrente': '⚡',
  'Effetti':  '🎉',
  'Consumabili': '🪣',
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
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Se arriviamo da /events/:id/scan (admin) torniamo all'evento, altrimenti alla home worker
  const backPath = location.pathname.endsWith('/scan') ? `/events/${id}` : '/'
  const [event, setEvent] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [manualCode, setManualCode] = useState('')
  const [mode, setMode] = useState('load') // 'load' | 'return'
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

  const processCode = async (code) => {
    const { baseCode: normalized } = parseScannedCode(code)

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
    const { collection, query, where, getDocs } = await import('firebase/firestore')
    const q = query(collection(db, 'items'), where('teamId', '==', profile.teamId), where('code', '==', normalized))
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
        },
        async decodedText => {
          await processCode(decodedText)
          setTimeout(() => setLastScan(prev => prev), 3000)
        },
        () => {}
      )
    } catch(e) {
      setScanning(false)
      setError('Camera non accessibile. Verifica i permessi del browser.')
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
  const loaded   = items.filter(i => i.loaded).length
  const returned = items.filter(i => i.returned).length
  const total    = items.length

  const firstUnloadedRef = useRef(null)
  const WS_ORDER_CONST = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Extra','Altro']
  let firstUnloadedId = null
  for (const cat of WS_ORDER_CONST) {
    const catItems = items
      .filter(i => (i.isExtra ? 'Extra' : (i.category || 'Altro')) === cat)
      .sort((a, b) => (a.loaded ? 1 : 0) - (b.loaded ? 1 : 0))
    const first = catItems.find(i => !i.loaded)
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

  if (!event) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}><p style={{ color:'var(--text2)' }}>Caricamento...</p></div>

  const scanResult = {
    loaded:           { bg:'rgba(245,166,35,0.15)', border:'rgba(245,166,35,0.4)', color:'var(--accent2)', icon:'🚛', title:'Caricato!', msg: i => `${i?.name} segnato come caricato sul furgone` },
    returned:         { bg:'rgba(105,240,174,0.15)', border:'rgba(105,240,174,0.4)', color:'var(--green)', icon:'✅', title:'Rientrato!', msg: i => `${i?.name} rientrato in magazzino` },
    not_found:        { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'❓', title:'Non trovato', msg: i => `Codice ${lastScan?.code} non presente nel magazzino` },
    not_in_list:      { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'⚠️', title:'Non in lista', msg: i => `${i?.name} non è nella lista di questo evento` },
    already_loaded:   { bg:'rgba(79,195,247,0.1)',  border:'rgba(79,195,247,0.3)',  color:'var(--blue)',   icon:'ℹ️', title:'Già caricato', msg: i => `${i?.name} era già segnato come caricato` },
    already_returned: { bg:'rgba(79,195,247,0.1)',  border:'rgba(79,195,247,0.3)',  color:'var(--blue)',   icon:'ℹ️', title:'Già rientrato', msg: i => `${i?.name} era già segnato come rientrato` },
    not_loaded:       { bg:'rgba(255,82,82,0.1)',   border:'rgba(255,82,82,0.3)',   color:'var(--red)',    icon:'⚠️', title:'Non caricato', msg: i => `${i?.name} non risulta ancora caricato` },
  }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)', display:'flex', flexDirection:'column', paddingBottom:140 }}>

      {/* - Popup centrale post-scansione - */}
      {scanToast && (() => {
        const r = scanResult[scanToast.action]
        const isOk = ['loaded','returned'].includes(scanToast.action)
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
              <p style={{ color:'var(--text)', fontSize:16, lineHeight:1.4 }}>{scanToast.item?.name || `Codice: ${scanToast.code}`}</p>
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
        .plane-switch {
          --dot: #fff;
          --street: #6B6D76;
          --street-line: #A8AAB4;
          --street-line-mid: #C0C2C8;
          --sky-1: #60A7FA;
          --sky-2: #2F8EFC;
          --light-1: rgba(255, 233, 0, 1);
          --light-2: rgba(255, 233, 0, .3);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .plane-switch input { display: none; }
        .plane-switch input + div {
          -webkit-mask-image: -webkit-radial-gradient(white, black);
          position: relative;
          overflow: hidden;
          width: 76px;
          height: 38px;
          padding: 2px;
          border-radius: 20px;
          background: linear-gradient(90deg, var(--street) 0%, var(--street) 25%, var(--sky-1) 75%, var(--sky-2) 100%) left var(--p, 0%) top 0;
          background-position-x: var(--p, 0%);
          background-size: 400% auto;
          transition: background-position 0.6s;
        }
        .plane-switch input + div:before, .plane-switch input + div:after {
          content: "";
          display: block;
          position: absolute;
          transform: translateX(var(--s, 0));
          transition: transform 0.3s;
        }
        .plane-switch input + div:before {
          width: 64px; right: 3px; top: 6px; height: 2px;
          background: var(--street-line);
          box-shadow: 0 24px 0 0 var(--street-line);
        }
        .plane-switch input + div:after {
          width: 3px; height: 3px; border-radius: 50%;
          left: 36px; top: 2px;
          animation: lights2 2s linear infinite;
          box-shadow: inset 0 0 0 3px var(--light-1), 0 32px 0 var(--light-1), 12px 0 0 var(--light-2), 12px 32px 0 var(--light-2), 24px 0 0 var(--light-2), 24px 32px 0 var(--light-2);
        }
        .plane-switch input + div span { display: block; position: absolute; }
        .plane-switch input + div span.street-middle {
          top: 18px; left: 32px; width: 5px; height: 2px;
          transform: translateX(var(--s, 0));
          background: var(--street-line-mid);
          box-shadow: 8px 0 0 var(--street-line-mid), 16px 0 0 var(--street-line-mid), 24px 0 0 var(--street-line-mid), 32px 0 0 var(--street-line-mid), 40px 0 0 var(--street-line-mid);
          transition: transform 0.3s;
        }
        .plane-switch input + div span.cloud {
          width: 18px; height: 6px; border-radius: 3px; background: #fff;
          position: absolute; top: var(--ct, 12px); left: 100%;
          opacity: var(--co, 0); transition: opacity 0.3s;
          animation: clouds2 2s linear infinite var(--cd, 0s);
        }
        .plane-switch input + div span.cloud:before, .plane-switch input + div span.cloud:after {
          content: ""; position: absolute; transform: translateX(var(--cx, 0));
          border-radius: 50%; width: var(--cs, 8px); height: var(--cs, 8px);
          background: #fff; bottom: 1px; left: 2px;
        }
        .plane-switch input + div span.cloud:after { --cs: 9px; --cx: 6px; }
        .plane-switch input + div span.cloud.two { --ct: 30px; --cd: 1s; opacity: var(--co-2, 0); }
        .plane-switch input + div div {
          display: table; position: relative; z-index: 1;
          padding: 7px; border-radius: 50%; background: var(--dot);
          transform: translateX(var(--x, 0));
          transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.35, 1.2);
        }
        .plane-switch input + div div svg {
          width: 18px; height: 18px; display: block;
          color: var(--c, var(--street)); transition: color 0.6s;
        }
        .plane-switch input:checked + div {
          --p: 100%; --x: 38px; --s: -75px; --c: var(--sky-2); --co: .8; --co-2: .6;
        }
        @keyframes lights2 {
          20%, 30% { box-shadow: inset 0 0 0 3px var(--light-2), 0 32px 0 var(--light-2), 12px 0 0 var(--light-1), 12px 32px 0 var(--light-1), 24px 0 0 var(--light-2), 24px 32px 0 var(--light-2); }
          55%, 65% { box-shadow: inset 0 0 0 3px var(--light-2), 0 32px 0 var(--light-2), 12px 0 0 var(--light-2), 12px 32px 0 var(--light-2), 24px 0 0 var(--light-1), 24px 32px 0 var(--light-1); }
          90%, 100% { box-shadow: inset 0 0 0 3px var(--light-1), 0 32px 0 var(--light-1), 12px 0 0 var(--light-2), 12px 32px 0 var(--light-2), 24px 0 0 var(--light-2), 24px 32px 0 var(--light-2); }
        }
        @keyframes clouds2 {
          97% { transform: translateX(-110px); visibility: visible; }
          98%, 100% { visibility: hidden; }
          99% { transform: translateX(-110px); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <div style={{ padding:'52px 16px 12px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => { stopScanner(); navigate(backPath) }}
            style={{ background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14, fontWeight:600 }}>
            ← Indietro
          </button>
          {/* Toggle carico/rientro */}
          <label className="plane-switch" title={mode === 'load' ? 'Modalità: Carico' : 'Modalità: Rientro'}>
            <input
              type="checkbox"
              checked={mode === 'return'}
              onChange={e => { setMode(e.target.checked ? 'return' : 'load'); setLastScan(null) }}
            />
            <div>
              <span className="street-middle" />
              <span className="cloud" />
              <span className="cloud two" />
              <div>
                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 4a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v2h2.382a1 1 0 0 1 .894.553l2 4A1 1 0 0 1 21 11v4a1 1 0 0 1-1 1h-1.17A3 3 0 0 1 13 16H9a3 3 0 0 1-5.83 0H3a1 1 0 0 1-1-1V4zm2 10.17A3 3 0 0 1 8.83 15H13a3 3 0 0 1 2.83-2H15V5H3v9.17zM17 9h-2v4h4v-2.382L17 9zm-10 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
                </svg>
              </div>
            </div>
          </label>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
          <h1 style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.name}</h1>
          {event.notes && (
            <button
              onClick={() => setShowEventNotes(v => !v)}
              style={{
                flexShrink:0, width:22, height:22, borderRadius:'50%',
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
          border:`2px solid ${scanning ? (mode === 'load' ? 'var(--accent2)' : 'var(--green)') : 'var(--border)'}`,
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
                          <span style={{ color:'#7dd3fc', fontSize:13, fontWeight:800 }}>{lastScan.location}</span>
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
                background: mode === 'load' ? 'rgba(245,166,35,0.15)' : 'rgba(52,211,153,0.12)',
                border:`2px dashed ${mode === 'load' ? 'rgba(245,166,35,0.5)' : 'rgba(52,211,153,0.4)'}`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:32,
              }}>
                📷
              </div>
              <div>
                <p style={{ fontWeight:800, fontSize:17, color:'var(--text)' }}>Avvia fotocamera</p>
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>
                  {mode === 'load' ? 'Scansiona per caricare sul furgone' : 'Scansiona per rientrare in magazzino'}
                </p>
              </div>
            </button>
          )}
        </div>

        {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:12, padding:'12px 16px', color:'var(--red)', marginTop:10, fontSize:14 }}>{error}</div>}

        {/* Inserimento manuale - compatto e collassabile */}
        <details style={{ marginTop:12 }}>
          <summary style={{ color:'var(--text2)', fontSize:13, fontWeight:600, cursor:'pointer', userSelect:'none', padding:'8px 0' }}>
            ⌨️ Inserisci codice manualmente
          </summary>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input value={manualCode} onChange={e => setManualCode(e.target.value)}
              placeholder="Codice articolo..." onKeyDown={e => { if (e.key === 'Enter') { processCode(manualCode); setManualCode('') } }}
              style={{ fontFamily:'monospace', fontSize:13 }} />
            <button onClick={() => { processCode(manualCode); setManualCode('') }} className="btn btn-primary" style={{ flexShrink:0, padding:'10px 14px' }}>OK</button>
          </div>
        </details>

        {/* Lista carico - compatta con categorie */}
        <div style={{ marginTop:14, marginBottom:16 }}>
          <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>
            Lista carico · {items.filter(i=>i.returned).length}/{total} rientrati
          </p>

          {/* Contatore mancanti al carico completo */}
          {total > 0 && mode === 'load' && (
            <div
              onClick={() => firstUnloadedRef.current?.scrollIntoView({ behavior:'smooth', block:'center' })}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 14px', borderRadius:12, marginBottom:8,
                background: loaded === total ? 'rgba(52,211,153,0.10)' : 'rgba(216,56,63,0.07)',
                border: `1px solid ${loaded === total ? 'rgba(52,211,153,0.30)' : 'rgba(216,56,63,0.20)'}`,
                cursor: loaded === total ? 'default' : 'pointer',
              }}>
              <div style={{
                width:36, height:36, borderRadius:10, flexShrink:0,
                background: loaded === total ? 'rgba(52,211,153,0.22)' : 'var(--accent)',
                color: loaded === total ? 'var(--green)' : 'white',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:900, fontSize: loaded === total ? 20 : 17,
              }}>
                {loaded === total ? '✓' : total - loaded}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>
                  {loaded === total
                    ? 'Tutto caricato!'
                    : `${total - loaded} ${total - loaded === 1 ? 'oggetto manca' : 'oggetti mancano'} al carico`}
                </p>
                <div style={{ marginTop:5, height:4, borderRadius:4, background:'var(--border)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:4, transition:'width 0.4s ease',
                    width:`${total > 0 ? (loaded / total) * 100 : 0}%`,
                    background: loaded === total ? 'var(--green)' : 'var(--accent)',
                  }} />
                </div>
                <p style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>{loaded} di {total} caricati</p>
              </div>
            </div>
          )}

          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            {items.length === 0
              ? <p style={{ padding:'20px', color:'var(--text2)', textAlign:'center', fontSize:14 }}>Lista non ancora preparata dall'admin</p>
              : (() => {
                  const WS_CAT_ICONS = { Audio:'🔊', Video:'📺', Luci:'🔦', Rigging:'⛓️', Corrente:'⚡', Effetti:'🎉', Consumabili:'🪣', Kit:'🧰', Extra:'✨', Altro:'📦' }
                  const WS_ORDER = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Extra','Altro']
                  const wsCatGrouped = {}
                  items.forEach(item => {
                    const cat = item.isExtra ? 'Extra' : (item.category || 'Altro')
                    if (!wsCatGrouped[cat]) wsCatGrouped[cat] = []
                    wsCatGrouped[cat].push(item)
                  })
                  // Dentro ogni categoria: da fare prima, caricati/rientrati in fondo
                  Object.keys(wsCatGrouped).forEach(cat => {
                    wsCatGrouped[cat].sort((a, b) => {
                      const aDone = mode === 'load' ? (a.loaded ? 1 : 0) : (a.returned ? 1 : 0)
                      const bDone = mode === 'load' ? (b.loaded ? 1 : 0) : (b.returned ? 1 : 0)
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
                <div key={item.id} ref={mode === 'load' && !item.loaded && item.id === firstUnloadedId ? firstUnloadedRef : null}>
                <ChecklistRow item={{
                  ...item,
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
            + Aggiungi oggetto extra
          </button>
        </div>
      </div>

      {/* Popup tutto caricato */}
      {showAllLoadedPopup && (
        <div className="modal-overlay" onClick={() => setShowAllLoadedPopup(false)}>
          <div className="modal" style={{ position:'relative', textAlign:'center', padding:'36px 24px 32px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
            <h2 style={{ fontSize:22, marginBottom:8 }}>Ottimo lavoro!</h2>
            <p style={{ color:'var(--text2)', fontSize:15, lineHeight:1.6, marginBottom:24 }}>
              Tutto caricato sul furgone.<br/>Per ora il tuo lavoro è finito — buon evento!
            </p>
            <button onClick={() => { setShowAllLoadedPopup(false); navigate('/') }}
              className="btn btn-primary btn-full" style={{ fontSize:16, padding:'14px' }}>
              🏠 Torna alla home
            </button>
            <button onClick={() => setShowAllLoadedPopup(false)}
              style={{ marginTop:12, width:'100%', padding:'10px', background:'transparent', color:'var(--text2)', fontSize:14 }}>
              Rimani qui
            </button>
          </div>
        </div>
      )}

      {/* Popup tutto scaricato */}
      {showAllReturnedPopup && (
        <div className="modal-overlay" onClick={() => setShowAllReturnedPopup(false)}>
          <div className="modal" style={{ position:'relative', textAlign:'center', padding:'36px 24px 32px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:64, marginBottom:12 }}>📦</div>
            <h2 style={{ fontSize:22, marginBottom:8 }}>Furgone svuotato!</h2>
            <p style={{ color:'var(--text2)', fontSize:15, lineHeight:1.6, marginBottom:24 }}>
              Tutto rientrato in magazzino.<br/>Ottimo lavoro — il furgone è libero!
            </p>
            <button onClick={() => {
                setShowAllReturnedPopup(false)
                navigate('/')
              }}
              className="btn btn-green btn-full" style={{ fontSize:16, padding:'14px' }}>
              ✅ Fatto, torna alla home
            </button>
            <button onClick={() => setShowAllReturnedPopup(false)}
              style={{ marginTop:12, width:'100%', padding:'10px', background:'transparent', color:'var(--text2)', fontSize:14 }}>
              Resta qui
            </button>
          </div>
        </div>
      )}

      {/* Modal extra worker */}
      {showExtraWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowExtraWorker(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowExtraWorker(false)}>✕</button>
            <h2>+ Oggetto extra</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>Non influisce sulla giacenza — per noleggi o oggetti dell'ultimo minuto.</p>
            <div className="form-group">
              <label>Nome *</label>
              <input value={extraWorkerForm.name} onChange={e => setExtraWorkerForm(f => ({...f, name:e.target.value}))} placeholder="es. Faro a noleggio..." autoFocus />
            </div>
            <div className="form-group">
              <label>Quantità</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => setExtraWorkerForm(f => ({...f, qty:Math.max(1,f.qty-1)}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                <input type="number" min="1" value={extraWorkerForm.qty}
                  onChange={e => setExtraWorkerForm(f => ({...f, qty:Math.max(1,parseInt(e.target.value)||1)}))}
                  style={{ textAlign:'center', fontWeight:800, fontSize:16, width:60, padding:'6px 4px' }} />
                <button onClick={() => setExtraWorkerForm(f => ({...f, qty:f.qty+1}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!extraWorkerForm.name.trim()) return
                const eventSnap = await getDoc(eventRef)
                if (!eventSnap.exists()) return
                const currentItems = eventSnap.data().items || []
                const extra = { id:`extra-${Date.now()}`, name:extraWorkerForm.name.trim(), qty:extraWorkerForm.qty, category:'Extra', isExtra:true, loaded:false, returned:false }
                await updateDoc(eventRef, { items: [...currentItems, extra] })
                setExtraWorkerForm({ name:'', qty:1 })
                setShowExtraWorker(false)
              }}
              className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!extraWorkerForm.name.trim()}>
              ✅ Aggiungi alla lista
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Riga checklist con bottoni touch-friendly e note accessibili
function ChecklistRow({ item }) {
  const [location, setLocation]   = useState(item.location || null)
  const [warehouseNotes, setWarehouseNotes] = useState(item.notes || null)
  const [liveComponents, setLiveComponents] = useState(item.components || null)
  const [showInfo, setShowInfo]   = useState(false)
  const isKit = item.isBundle || (liveComponents && liveComponents.length > 0)
  // La nota specifica dell'evento (aggiunta dall'admin sulla lista di carico) ha priorità su quella generale di magazzino
  const eventNote = item.eventNote || null
  const displayNote = eventNote || warehouseNotes
  const hasInfo = displayNote || isKit

  useEffect(() => {
    getDoc(doc(db, 'items', item.id)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setLocation(data.location || null)
        setWarehouseNotes(data.notes || null)
        // Auto-repair: se l'evento è stato salvato prima che i componenti fossero registrati
        // sul kit, recuperali in tempo reale dal magazzino così la lista è sempre aggiornata
        if (data.isBundle && data.components?.length) setLiveComponents(data.components)
      }
    }).catch(() => {})
  }, [item.id])

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
            {hasInfo && (
              <button onClick={() => setShowInfo(s => !s)}
                style={{
                  background: showInfo ? ((eventNote||isKit) ? 'var(--accent2)' : 'var(--blue)') : ((eventNote||isKit) ? 'rgba(245,166,35,0.15)' : 'rgba(79,195,247,0.15)'),
                  border: `1px solid ${(eventNote||isKit) ? 'rgba(245,166,35,0.4)' : 'rgba(79,195,247,0.3)'}`,
                  color: showInfo ? 'white' : ((eventNote||isKit) ? 'var(--accent2)' : 'var(--blue)'),
                  borderRadius:'50%', width:20, height:20, fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
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
            <span style={{ fontSize:12, color:'var(--text2)', fontWeight:500 }}>pz</span>
          </div>
        </div>
        </div>
        {/* Bottoni touch-friendly - grandi abbastanza per il dito */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
          {!item.loaded ? (
            <div style={{ display:'flex', gap:5 }}>
              <button
                style={{ padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700,
                  background: item.pronto ? 'rgba(5,150,105,0.15)' : 'var(--card2)',
                  color: item.pronto ? '#059669' : 'var(--text3)',
                  border: item.pronto ? '1.5px solid rgba(5,150,105,0.35)' : '1.5px solid transparent',
                  WebkitTapHighlightColor:'transparent',
                }}
                onClick={() => item._onTogglePronto && item._onTogglePronto(item.id)}
              >
                {item.pronto ? '✓ Pronto' : 'Pronto'}
              </button>
              <button
                style={{ minWidth:70, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700,
                  background: item.pronto ? 'rgba(245,166,35,0.20)' : 'var(--card2)',
                  color: item.pronto ? 'var(--accent2)' : 'var(--text)',
                  border: item.pronto ? '1.5px solid rgba(245,166,35,0.45)' : '1.5px solid var(--border)',
                  WebkitTapHighlightColor:'transparent',
                }}
                onClick={() => item._onToggleLoaded && item._onToggleLoaded(item.id)}
              >
                ○ Carico
              </button>
            </div>
          ) : (
            <button
              style={{ minWidth:80, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none',
                background:'rgba(245,166,35,0.18)', color:'var(--accent2)',
                WebkitTapHighlightColor:'transparent',
              }}
              onClick={() => item._onToggleLoaded && item._onToggleLoaded(item.id)}
            >
              🚛 Carico
            </button>
          )}
          <button
            disabled={!item.loaded}
            style={{ minWidth:80, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none',
              background: item.returned ? 'rgba(52,211,153,0.15)' : item.loaded ? 'var(--card2)' : 'var(--bg3)',
              color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--text3)',
              opacity: item.loaded ? 1 : 0.4,
              WebkitTapHighlightColor:'transparent',
            }}
            onClick={() => item._onToggleReturned && item._onToggleReturned(item.id)}
          >
            {item.returned ? '✅ Rientro' : '○ Rientro'}
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
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>🧰 Contenuto kit</p>
              {!(liveComponents?.length)
                ? <p style={{ fontSize:13, color:'var(--text2)', fontStyle:'italic' }}>Nessun componente registrato</p>
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
