import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

const ICONS = {'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦'}

export default function Scanner() {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [manualCode, setManualCode] = useState('')
  const html5QrCodeRef = useRef(null)

  const lookupCode = async code => {
    const normalized = code.trim().toUpperCase()
    const q = query(collection(db, 'items'), where('code', '==', normalized))
    const snap = await getDocs(q)
    if (!snap.empty) return { found: true, item: { id: snap.docs[0].id, ...snap.docs[0].data() } }
    return { found: false, code: normalized }
  }

  const [scanToast, setScanToast] = useState(null)

  const startScanner = async () => {
    setError(null); setResult(null); setScanning(true)
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      html5QrCodeRef.current = new Html5Qrcode('qr-reader')
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
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
          await html5QrCodeRef.current.stop()
          setScanning(false)
          const res = await lookupCode(decodedText)
          setResult(res)
          setScanToast({ ...res, ts: Date.now() })
          setTimeout(() => setScanToast(null), 3000)
        },
        () => {}
      )
    } catch(e) {
      setScanning(false)
      setError('Camera non accessibile. Verifica i permessi.')
    }
  }

  const stopScanner = async () => {
    if (html5QrCodeRef.current) { try { await html5QrCodeRef.current.stop() } catch(e) {} }
    setScanning(false)
  }

  useEffect(() => () => { if (html5QrCodeRef.current) { try { html5QrCodeRef.current.stop() } catch(e) {} } }, [])

  return (
    <div className="page">

      {/* Popup centrale post-scansione */}
      {scanToast && (
        <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{
            background: scanToast.found ? 'rgba(22,40,30,0.97)' : 'rgba(40,16,20,0.97)',
            border: `2px solid ${scanToast.found ? 'var(--green)' : 'var(--red)'}`,
            borderRadius:24, padding:'28px 32px', textAlign:'center', minWidth:260, maxWidth:320,
            boxShadow:'0 12px 48px rgba(0,0,0,0.7)',
            animation:'fadeInUp 0.2s cubic-bezier(0.32,0.72,0,1) both',
          }}>
            <div style={{ fontSize:52, marginBottom:12 }}>{scanToast.found ? '✅' : '❓'}</div>
            <p style={{ fontWeight:800, fontSize:20, color: scanToast.found ? 'var(--green)' : 'var(--red)', marginBottom:6 }}>
              {scanToast.found ? 'Trovato!' : 'Non trovato'}
            </p>
            {scanToast.found ? (
              <>
                <p style={{ color:'var(--text)', fontSize:15 }}>{scanToast.item.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>{scanToast.item.brand} {scanToast.item.model}</p>
                {scanToast.item.location && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:10, background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.3)', borderRadius:8, padding:'5px 14px' }}>
                    <span>📍</span>
                    <span style={{ color:'var(--blue)', fontWeight:800, fontSize:14 }}>{scanToast.item.location}</span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color:'var(--text2)', fontSize:13 }}>Codice: {scanToast.code}</p>
            )}
          </div>
        </div>
      )}
      <div className="page-header">
        <h1>Scanner QR/Barcode</h1>
        <p>Identifica un articolo dal codice</p>
      </div>

      <div style={{ padding:'20px 16px' }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', marginBottom:16 }}>
          {!scanning ? (
            <div style={{ padding:'30px 20px', textAlign:'center' }}>
              <div style={{ fontSize:64, marginBottom:12 }}>📷</div>
              <p style={{ color:'var(--text2)', marginBottom:20, fontSize:15 }}>Scansiona per identificare un articolo e vederne la disponibilità</p>
              <button onClick={startScanner} className="btn btn-primary" style={{ minWidth:200 }}>Avvia fotocamera</button>
            </div>
          ) : (
            <div style={{ position:'relative' }}>
              <div id="qr-reader" style={{ width:'100%' }} />
              <button onClick={stopScanner} style={{ position:'absolute', top:12, right:12, background:'rgba(0,0,0,0.7)', color:'white', borderRadius:20, padding:'8px 16px', fontSize:13, fontWeight:600 }}>✕ Stop</button>
              <div style={{ padding:'12px 16px', background:'rgba(233,69,96,0.1)', borderTop:'1px solid rgba(233,69,96,0.2)' }}>
                <p style={{ color:'var(--accent)', fontSize:13, textAlign:'center', fontWeight:600 }}>📡 Scansione in corso...</p>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:'var(--radius)', padding:'14px 16px', color:'var(--red)', marginBottom:16, fontSize:14 }}>{error}</div>}

        {result && (
          <div style={{ marginBottom:16 }}>
            <div style={{ background: result.found ? 'rgba(105,240,174,0.1)' : 'rgba(255,82,82,0.1)', border:`1px solid ${result.found ? 'rgba(105,240,174,0.3)' : 'rgba(255,82,82,0.3)'}`, borderRadius:'var(--radius)', padding:'16px' }}>
              {result.found ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                    <div style={{ fontSize:36 }}>{ICONS[result.item.category] || '📦'}</div>
                    <div>
                      <p style={{ fontWeight:800, fontSize:18 }}>{result.item.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:13 }}>{result.item.brand} {result.item.model}</p>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 12px' }}>
                      <p style={{ color:'var(--text2)', fontSize:12 }}>Categoria</p>
                      <p style={{ fontWeight:700, fontSize:14 }}>{result.item.category}</p>
                    </div>
                    <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 12px' }}>
                      <p style={{ color:'var(--text2)', fontSize:12 }}>Disponibili</p>
                      <p style={{ fontWeight:800, fontSize:18, color: (result.item.availableQty || 0) === 0 ? 'var(--accent)' : 'var(--green)' }}>{result.item.availableQty ?? result.item.totalQty}/{result.item.totalQty}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'10px' }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>❓</p>
                  <p style={{ fontWeight:700, color:'var(--red)' }}>Articolo non trovato</p>
                  <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>Codice: <code>{result.code}</code></p>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'16px' }}>
          <p style={{ fontWeight:700, marginBottom:12, fontSize:15 }}>Inserimento manuale</p>
          <div style={{ display:'flex', gap:10 }}>
            <input value={manualCode} onChange={e => setManualCode(e.target.value)} placeholder="Codice articolo (es. WAV-ABC12345)"
              onKeyDown={async e => { if (e.key === 'Enter') { const r = await lookupCode(manualCode); setResult(r); setManualCode('') } }}
              style={{ fontFamily:'monospace' }} />
            <button onClick={async () => { const r = await lookupCode(manualCode); setResult(r); setManualCode('') }} className="btn btn-primary" style={{ flexShrink:0, padding:'10px 16px' }}>Cerca</button>
          </div>
        </div>

        {result && (
          <button onClick={() => { setResult(null); setError(null) }} className="btn btn-secondary btn-full" style={{ marginTop:12 }}>🔄 Nuova scansione</button>
        )}
      </div>
    </div>
  )
}
