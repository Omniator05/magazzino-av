import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore'

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
  const [extraWorkerForm, setExtraWorkerForm] = useState({ name:'', qty:1 }) // popup centrale post-scansione
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
    const normalized = code.trim().toUpperCase()

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
    const q = query(collection(db, 'items'), where('code', '==', normalized))
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
      html5QrRef.current = new Html5Qrcode('qr-worker')
      await html5QrRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 160 }, // rettangolo ottimale per barcode
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ]
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

  useEffect(() => () => { if (html5QrRef.current) { try { html5QrRef.current.stop() } catch(e) {} } }, [])

  if (!event) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}><p style={{ color:'var(--text2)' }}>Caricamento...</p></div>

  const items = event.items || []
  const loaded   = items.filter(i => i.loaded).length
  const returned = items.filter(i => i.returned).length
  const total    = items.length

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
      <div style={{ padding:'52px 16px 12px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => { stopScanner(); navigate(backPath) }}
            style={{ background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14, fontWeight:600 }}>
            ← Indietro
          </button>
          {/* Contatori inline */}
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ background:'rgba(245,166,35,0.12)', border:'1px solid rgba(245,166,35,0.25)', borderRadius:10, padding:'6px 14px', textAlign:'center' }}>
              <p style={{ color:'var(--accent2)', fontWeight:800, fontSize:18, lineHeight:1 }}>{loaded}<span style={{ color:'var(--text2)', fontWeight:400, fontSize:13 }}>/{total}</span></p>
              <p style={{ color:'var(--accent2)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginTop:2 }}>Caricati</p>
            </div>
            <div style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.22)', borderRadius:10, padding:'6px 14px', textAlign:'center' }}>
              <p style={{ color:'var(--green)', fontWeight:800, fontSize:18, lineHeight:1 }}>{returned}<span style={{ color:'var(--text2)', fontWeight:400, fontSize:13 }}>/{total}</span></p>
              <p style={{ color:'var(--green)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginTop:2 }}>Rientrati</p>
            </div>
          </div>
        </div>
        <h1 style={{ fontSize:18, fontWeight:800, marginTop:10, letterSpacing:'-0.3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.name}</h1>
        {event.location && <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>📍 {event.location}</p>}
      </div>

      {/* - Toggle modalità - grande e chiarissimo - */}
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={() => { setMode('load'); setLastScan(null) }}
            style={{
              borderRadius:16, padding:'18px 8px', textAlign:'center', fontWeight:800,
              fontSize:15, border:'2px solid',
              background: mode === 'load' ? 'rgba(245,166,35,0.15)' : 'var(--card)',
              borderColor: mode === 'load' ? 'var(--accent2)' : 'var(--border)',
              color: mode === 'load' ? 'var(--accent2)' : 'var(--text2)',
              boxShadow: mode === 'load' ? '0 0 20px rgba(245,166,35,0.2)' : 'none',
              transition:'all 0.2s ease',
            }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🚛</div>
            <div>Sto caricando</div>
            <div style={{ fontSize:11, fontWeight:500, marginTop:3, opacity:0.7 }}>articoli → furgone</div>
          </button>
          <button onClick={() => { setMode('return'); setLastScan(null) }}
            style={{
              borderRadius:16, padding:'18px 8px', textAlign:'center', fontWeight:800,
              fontSize:15, border:'2px solid',
              background: mode === 'return' ? 'rgba(52,211,153,0.12)' : 'var(--card)',
              borderColor: mode === 'return' ? 'var(--green)' : 'var(--border)',
              color: mode === 'return' ? 'var(--green)' : 'var(--text2)',
              boxShadow: mode === 'return' ? '0 0 20px rgba(52,211,153,0.15)' : 'none',
              transition:'all 0.2s ease',
            }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🏠</div>
            <div>Sto scaricando</div>
            <div style={{ fontSize:11, fontWeight:500, marginTop:3, opacity:0.7 }}>furgone → magazzino</div>
          </button>
        </div>
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

        {/* Lista carico - compatta */}
        <div style={{ marginTop:14, marginBottom:16 }}>
          <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>
            Lista carico · {items.filter(i=>i.returned).length}/{total} rientrati
          </p>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
            {items.length === 0
              ? <p style={{ padding:'20px', color:'var(--text2)', textAlign:'center', fontSize:14 }}>Lista non ancora preparata dall'admin</p>
              : items.map(item => (
                <ChecklistRow key={item.id} item={{
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
                }} />
              ))
            }
          </div>
          {/* Bottone Extra sempre in fondo alla lista */}
          <button onClick={() => setShowExtraWorker(true)}
            style={{ width:'100%', marginTop:10, background:'rgba(245,166,35,0.10)', border:'1px solid rgba(245,166,35,0.35)', color:'var(--accent2)', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14 }}>
            + Aggiungi oggetto extra
          </button>
        </div>
      </div>

      {/* Modal extra worker */}
      {showExtraWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowExtraWorker(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowExtraWorker(false)}>x</button>
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
  const [notes, setNotes]         = useState(item.notes || null)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'items', item.id)).then(snap => {
      if (snap.exists()) {
        setLocation(snap.data().location || null)
        setNotes(snap.data().notes || null)
      }
    }).catch(() => {})
  }, [item.id])

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom: showNotes ? 'none' : '1px solid var(--border)' }}>
        <span style={{ fontSize:20, flexShrink:0 }}>{ICONS[item.category] || '📦'}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <p style={{ fontWeight:700, fontSize:14, color: item.returned ? 'var(--text2)' : 'var(--text)', textDecoration: item.returned ? 'line-through' : 'none' }}>{item.name}</p>
            {item.isExtra && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.35)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>EXTRA</span>}
            {notes && (
              <button onClick={() => setShowNotes(!showNotes)}
                style={{ background: showNotes ? 'var(--blue)' : 'rgba(79,195,247,0.15)', border:'1px solid rgba(79,195,247,0.3)', color: showNotes ? 'white' : 'var(--blue)', borderRadius:'50%', width:20, height:20, fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {showNotes ? '✕' : 'i'}
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
        {/* Bottoni touch-friendly - grandi abbastanza per il dito */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
          <button
            style={{ minWidth:80, padding:'7px 10px', borderRadius:8, fontSize:12, fontWeight:700, border:'none',
              background: item.loaded ? 'rgba(245,166,35,0.18)' : 'var(--card2)',
              color: item.loaded ? 'var(--accent2)' : 'var(--text2)',
              WebkitTapHighlightColor:'transparent',
            }}
            onClick={() => item._onToggleLoaded && item._onToggleLoaded(item.id)}
          >
            {item.loaded ? '🚛 Carico' : '○ Carico'}
          </button>
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
      {/* Pannello note espandibile */}
      {showNotes && notes && (
        <div style={{ padding:'10px 16px 14px', borderBottom:'1px solid var(--border)', background:'rgba(79,195,247,0.04)', display:'flex', gap:8 }}>
          <span style={{ fontSize:16, flexShrink:0 }}>📝</span>
          <p style={{ color:'var(--text)', fontSize:13, lineHeight:1.6 }}>{notes}</p>
        </div>
      )}
    </>
  )
}
