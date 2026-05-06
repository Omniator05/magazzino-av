import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore'

const ICONS = {'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦'}

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
  const [scanToast, setScanToast] = useState(null) // popup centrale post-scansione
  const lastCodeRef = useRef('') // evita di riprocessare lo stesso codice di fila
  const lastCodeTimeRef = useRef(0)
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
    <div className="page">

      {/* ── Popup centrale post-scansione ── */}
      {scanToast && (() => {
        const r = scanResult[scanToast.action]
        const isOk = ['loaded','returned'].includes(scanToast.action)
        return (
          <div style={{
            position:'fixed', inset:0, zIndex:500,
            display:'flex', alignItems:'center', justifyContent:'center',
            pointerEvents:'none'
          }}>
            <div style={{
              background: isOk ? 'rgba(22,40,30,0.97)' : 'rgba(40,16,20,0.97)',
              border: `2px solid ${isOk ? 'var(--green)' : 'var(--red)'}`,
              borderRadius:24, padding:'28px 32px',
              textAlign:'center', minWidth:260, maxWidth:320,
              boxShadow:'0 12px 48px rgba(0,0,0,0.7)',
              animation:'fadeInUp 0.2s cubic-bezier(0.32,0.72,0,1) both',
            }}>
              <div style={{ fontSize:52, marginBottom:12 }}>{r.icon}</div>
              <p style={{ fontWeight:800, fontSize:20, color:r.color, marginBottom:6 }}>{r.title}</p>
              <p style={{ color:'var(--text)', fontSize:15, lineHeight:1.4 }}>
                {scanToast.item?.name || `Codice: ${scanToast.code}`}
              </p>
              {scanToast.location && (
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:10, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.3)', borderRadius:8, padding:'5px 14px' }}>
                  <span>📍</span>
                  <span style={{ color:'var(--blue)', fontWeight:800, fontSize:14 }}>{scanToast.location}</span>
                </div>
              )}
            </div>
          </div>
        )
      })()}
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => { stopScanner(); navigate(backPath) }} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
        </div>
        <h1 style={{ fontSize:20, fontWeight:800 }}>{event.name}</h1>
        <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>
          📅 {new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' })}
          {event.location && ` · 📍 ${event.location}`}
        </p>
      </div>

      {/* Stato evento */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'14px 16px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px', textAlign:'center' }}>
          <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>🚛 Caricato</p>
          <p style={{ fontWeight:800, fontSize:22, color: total > 0 && loaded === total ? 'var(--green)' : 'var(--accent2)' }}>{loaded}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
        </div>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px', textAlign:'center' }}>
          <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>🏠 Rientrato</p>
          <p style={{ fontWeight:800, fontSize:22, color: total > 0 && returned === total ? 'var(--green)' : 'var(--text2)' }}>{returned}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
        </div>
      </div>

      <div style={{ padding:'16px' }}>
        {/* Toggle modalità */}
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:4, marginBottom:16 }}>
          {['load','return'].map(m => (
            <button key={m} onClick={() => { setMode(m); setLastScan(null) }}
              style={{ flex:1, padding:'10px', borderRadius:8, fontWeight:700, fontSize:14,
                background: mode === m ? (m === 'load' ? 'var(--accent2)' : 'var(--green)') : 'transparent',
                color: mode === m ? '#000' : 'var(--text2)' }}>
              {m === 'load' ? '🚛 Sto caricando' : '🏠 Sto scaricando'}
            </button>
          ))}
        </div>

        {/* Scanner area — la camera rimane sempre accesa */}
        <div style={{ background:'var(--card)', border:`2px solid ${scanning ? (mode === 'load' ? 'var(--accent2)' : 'var(--green)') : 'var(--border)'}`, borderRadius:'var(--radius)', overflow:'hidden', marginBottom:14, transition:'border-color 0.3s' }}>
          {/* Il div qr-worker esiste sempre nel DOM quando scanning=true */}
          {scanning && (
            <div style={{ position:'relative' }}>
              <div id="qr-worker" style={{ width:'100%' }} />
              {/* Banner risultato sovrapposto alla camera */}
              {lastScan && (() => {
                const r = scanResult[lastScan.action]
                return (
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, background: r.bg.replace('0.1','0.92').replace('0.15','0.92'), backdropFilter:'blur(8px)', padding:'12px 16px', borderTop:`2px solid ${r.border}`, animation:'slideUp 0.2s ease' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:24 }}>{r.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:800, fontSize:15, color:r.color }}>{r.title}</p>
                        <p style={{ color:'var(--text)', fontSize:12, marginTop:1 }}>{r.msg(lastScan.item)}</p>
                        {lastScan.location && (
                          <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, background:'rgba(79,195,247,0.18)', border:'1px solid rgba(79,195,247,0.4)', borderRadius:6, padding:'3px 10px' }}>
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
                style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.6)', color:'white', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:600 }}>
                ■ Stop
              </button>
            </div>
          )}

          {!scanning && (
            <div style={{ padding:'28px 20px', textAlign:'center' }}>
              <div style={{ fontSize:52, marginBottom:10 }}>📷</div>
              <p style={{ color:'var(--text2)', fontSize:14, marginBottom:16 }}>
                {mode === 'load' ? 'Avvia la camera e scansiona gli articoli da caricare — rimane accesa automaticamente' : 'Avvia la camera e scansiona gli articoli che rientrano in magazzino'}
              </p>
              <button onClick={startScanner} className="btn btn-primary" style={{ minWidth:200, fontSize:16, padding:'14px 24px' }}>
                📷 Avvia fotocamera
              </button>
            </div>
          )}
        </div>

        {/* Risultato fuori dalla camera (quando non si scansiona) */}
        {!scanning && lastScan && (() => {
          const r = scanResult[lastScan.action]
          return (
            <div style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:28 }}>{r.icon}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:800, fontSize:16, color:r.color }}>{r.title}</p>
                  <p style={{ color:'var(--text)', fontSize:13, marginTop:2 }}>{r.msg(lastScan.item)}</p>
                  {lastScan.location && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:8, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.30)', borderRadius:8, padding:'5px 12px' }}>
                      <span style={{ fontSize:14 }}>📍</span>
                      <span style={{ color:'var(--blue)', fontSize:14, fontWeight:800 }}>{lastScan.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:'var(--radius)', padding:'14px 16px', color:'var(--red)', marginBottom:14, fontSize:14 }}>{error}</div>}

        {/* Inserimento manuale */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
          <p style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Inserimento manuale</p>
          <div style={{ display:'flex', gap:10 }}>
            <input value={manualCode} onChange={e => setManualCode(e.target.value)} placeholder="Codice articolo (es. WAV-ABC12345)"
              onKeyDown={e => { if (e.key === 'Enter') { processCode(manualCode); setManualCode('') } }}
              style={{ fontFamily:'monospace', fontSize:13 }} />
            <button onClick={() => { processCode(manualCode); setManualCode('') }} className="btn btn-primary" style={{ flexShrink:0, padding:'10px 14px' }}>OK</button>
          </div>
        </div>

        {/* Lista articoli evento (mini checklist) */}
        <p style={{ color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Lista carico</p>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
          {items.length === 0
            ? <p style={{ padding:'20px', color:'var(--text2)', textAlign:'center', fontSize:14 }}>Lista non ancora preparata dall'admin</p>
            : items.map(item => (
              <ChecklistRow key={item.id} item={item} />
            ))
          }
        </div>
      </div>
    </div>
  )
}

// Riga checklist che legge la location LIVE da Firestore
// Risolve il problema degli articoli aggiunti prima che il campo esistesse
function ChecklistRow({ item }) {
  const [location, setLocation] = useState(item.location || null)

  useEffect(() => {
    // Carica sempre la location aggiornata da Firestore
    getDoc(doc(db, 'items', item.id)).then(snap => {
      if (snap.exists()) setLocation(snap.data().location || null)
    }).catch(() => {})
  }, [item.id])

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:20, flexShrink:0 }}>{ICONS[item.category] || '📦'}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontWeight:700, fontSize:14, color: item.returned ? 'var(--text2)' : 'var(--text)', textDecoration: item.returned ? 'line-through' : 'none' }}>{item.name}</p>
        <p style={{ color:'var(--text2)', fontSize:12, marginTop:1 }}>qty: {item.qty || 1}</p>
        {location ? (
          <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:5, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:6, padding:'3px 8px' }}>
            <span style={{ fontSize:11 }}>📍</span>
            <span style={{ color:'var(--blue)', fontSize:12, fontWeight:800 }}>{location}</span>
          </div>
        ) : (
          <p style={{ color:'var(--text3)', fontSize:11, marginTop:4, fontStyle:'italic' }}>Posizione non specificata</p>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end' }}>
        <span style={{ fontSize:11, fontWeight:700, color: item.loaded ? 'var(--accent2)' : 'var(--text2)', background: item.loaded ? 'rgba(245,166,35,0.15)' : 'var(--card2)', borderRadius:6, padding:'2px 8px' }}>
          {item.loaded ? '🚛' : '○'} Carico
        </span>
        <span style={{ fontSize:11, fontWeight:700, color: item.returned ? 'var(--green)' : 'var(--text2)', background: item.returned ? 'rgba(105,240,174,0.15)' : 'var(--card2)', borderRadius:6, padding:'2px 8px' }}>
          {item.returned ? '✅' : '○'} Rientro
        </span>
      </div>
    </div>
  )
}
