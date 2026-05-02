import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore'

const ICONS = {'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦'}

export default function WorkerScanner() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState(null) // { item, action: 'loaded'|'returned'|'not_found'|'not_in_list' }
  const [manualCode, setManualCode] = useState('')
  const [mode, setMode] = useState('load') // 'load' | 'return'
  const [error, setError] = useState(null)
  const html5QrRef = useRef(null)
  const eventRef = doc(db, 'events', id)

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  const processCode = async (code) => {
    const normalized = code.trim().toUpperCase()
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
      setLastScan({ action: 'not_found', code: normalized })
      return
    }

    const foundItem = { id: itemSnap.docs[0].id, ...itemSnap.docs[0].data() }
    const eventItem = eventItems.find(i => i.id === foundItem.id)

    if (!eventItem) {
      setLastScan({ action: 'not_in_list', item: foundItem })
      return
    }

    if (mode === 'load') {
      if (eventItem.loaded) {
        setLastScan({ action: 'already_loaded', item: eventItem })
        return
      }
      // Segna come caricato
      const updated = eventItems.map(i => i.id === foundItem.id ? { ...i, loaded: true } : i)
      await updateDoc(eventRef, { items: updated })
      // Aggiorna disponibilità
      const invSnap = await getDoc(doc(db, 'items', foundItem.id))
      if (invSnap.exists()) {
        const inv = invSnap.data()
        await updateDoc(doc(db, 'items', foundItem.id), { availableQty: Math.max(0, (inv.availableQty || 0) - (eventItem.qty || 1)) })
      }
      setLastScan({ action: 'loaded', item: eventItem })
    } else {
      // mode === 'return'
      if (!eventItem.loaded) {
        setLastScan({ action: 'not_loaded', item: eventItem })
        return
      }
      if (eventItem.returned) {
        setLastScan({ action: 'already_returned', item: eventItem })
        return
      }
      const updated = eventItems.map(i => i.id === foundItem.id ? { ...i, returned: true } : i)
      await updateDoc(eventRef, { items: updated })
      const invSnap = await getDoc(doc(db, 'items', foundItem.id))
      if (invSnap.exists()) {
        const inv = invSnap.data()
        await updateDoc(doc(db, 'items', foundItem.id), { availableQty: Math.min(inv.totalQty, (inv.availableQty || 0) + (eventItem.qty || 1)) })
      }
      setLastScan({ action: 'returned', item: eventItem })
    }
  }

  const startScanner = async () => {
    setError(null); setLastScan(null); setScanning(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      html5QrRef.current = new Html5Qrcode('qr-worker')
      await html5QrRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async decodedText => {
          await html5QrRef.current.stop()
          setScanning(false)
          await processCode(decodedText)
        },
        () => {}
      )
    } catch(e) {
      setScanning(false)
      setError('Camera non accessibile. Verifica i permessi.')
    }
  }

  const stopScanner = async () => {
    if (html5QrRef.current) { try { await html5QrRef.current.stop() } catch(e) {} }
    setScanning(false)
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
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => { stopScanner(); navigate('/') }} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
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

        {/* Scanner area */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden', marginBottom:14 }}>
          {!scanning ? (
            <div style={{ padding:'24px 20px', textAlign:'center' }}>
              <div style={{ fontSize:52, marginBottom:10 }}>📷</div>
              <p style={{ color:'var(--text2)', fontSize:14, marginBottom:16 }}>
                {mode === 'load' ? 'Scansiona per segnare l\'articolo come caricato sul furgone' : 'Scansiona per segnare l\'articolo come rientrato in magazzino'}
              </p>
              <button onClick={startScanner} className="btn btn-primary" style={{ minWidth:200 }}>
                Avvia fotocamera
              </button>
            </div>
          ) : (
            <div style={{ position:'relative' }}>
              <div id="qr-worker" style={{ width:'100%' }} />
              <button onClick={stopScanner}
                style={{ position:'absolute', top:12, right:12, background:'rgba(0,0,0,0.7)', color:'white', borderRadius:20, padding:'8px 16px', fontSize:13, fontWeight:600 }}>
                ✕ Stop
              </button>
              <div style={{ padding:'10px 16px', background: mode === 'load' ? 'rgba(245,166,35,0.1)' : 'rgba(105,240,174,0.1)', borderTop:'1px solid var(--border)' }}>
                <p style={{ color: mode === 'load' ? 'var(--accent2)' : 'var(--green)', fontSize:13, textAlign:'center', fontWeight:700 }}>
                  {mode === 'load' ? '🚛 Modalità carico attiva...' : '🏠 Modalità scarico attiva...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:'var(--radius)', padding:'14px 16px', color:'var(--red)', marginBottom:14, fontSize:14 }}>{error}</div>}

        {/* Risultato scansione */}
        {lastScan && (() => {
          const r = scanResult[lastScan.action]
          return (
            <div style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:'var(--radius)', padding:'16px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:28 }}>{r.icon}</span>
                <div>
                  <p style={{ fontWeight:800, fontSize:17, color:r.color }}>{r.title}</p>
                  <p style={{ color:'var(--text)', fontSize:14, marginTop:2 }}>{r.msg(lastScan.item)}</p>
                </div>
              </div>
              <button onClick={() => { setLastScan(null); startScanner() }} className="btn btn-secondary" style={{ marginTop:8, width:'100%' }}>
                📷 Scansiona prossimo
              </button>
            </div>
          )
        })()}

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
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:20 }}>{ICONS[item.category] || '📦'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:14, color: item.returned ? 'var(--text2)' : 'var(--text)', textDecoration: item.returned ? 'line-through' : 'none' }}>{item.name}</p>
                  <p style={{ color:'var(--text2)', fontSize:12 }}>qty: {item.qty || 1}</p>
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
            ))
          }
        </div>
      </div>
    </div>
  )
}
