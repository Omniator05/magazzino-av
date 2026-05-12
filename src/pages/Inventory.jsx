import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { generateItemCode, generateQRDataURL, generateBarcodeSVG } from '../utils/generateCode'

const CATEGORIES = ['Audio','Video','Luci','Rigging','Altro']
const ICONS = {
  'Audio':   '🔊',
  'Video':   '📺',
  'Luci':    '🔦',
  'Rigging': '⛓️',
  'Altro':   '📦',
}

// Mappa vecchie categorie → nuove per migrazione automatica
const CATEGORY_MIGRATION = {
  'Mixer Audio':    'Audio',
  'Cassa':         'Audio',
  'Sub':           'Audio',
  'Cavo XLR':      'Audio',
  'Cavo Corrente': 'Audio',
  'Multipresa':    'Audio',
  'Console Luci':  'Luci',
  'Faro':          'Luci',
  'LED bar':       'Luci',
  'Par LED':       'Luci',
  'Moving head':   'Luci',
  'Dimmer':        'Luci',
  'Controller luci':'Luci',
  'Cavo DMX':      'Luci',
  'Ledwall':       'Video',
  'Proiettore':    'Video',
  'Console audio': 'Audio',
  'Mixer':         'Audio',
  'Amplificatore': 'Audio',
  'Casse':         'Audio',
  'Subwoofer':     'Audio',
  'Microfono':     'Audio',
  'Cavo audio':    'Audio',
  'Cavo elettrico':'Audio',
  'Flight case':   'Rigging',
  'Case':          'Rigging',
  'Valigetta':     'Rigging',
  'Stativi':       'Rigging',
}

export default function Inventory() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false) // menu scelta oggetto/kit
  const [showKitModal, setShowKitModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [form, setForm] = useState({ name:'', category:'Altro', qty:1, brand:'', model:'', location:'', notes:'', isKit:false, kitSize:2, brokenQty:0 })
  // Kit form: nome + componenti
  const [kitForm, setKitForm] = useState({ name:'', location:'', notes:'', qty:1 })
  const [kitComponents, setKitComponents] = useState([]) // [{itemId, name, qty}]
  const [kitSearch, setKitSearch] = useState('')

  // Items in shared global collection so workers can read them
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // Migrazione automatica vecchie categorie → nuove (gira una volta sola)
  useEffect(() => {
    if (items.length === 0) return
    const toMigrate = items.filter(i => CATEGORY_MIGRATION[i.category])
    if (toMigrate.length === 0) return
    toMigrate.forEach(item => {
      updateDoc(doc(db, 'items', item.id), { category: CATEGORY_MIGRATION[item.category] })
        .catch(() => {})
    })
  }, [items.length]) // solo quando cambia il numero di articoli

  const openAdd = () => { setSelected(null); setForm({ name:'', category:'Altro', qty:1, brand:'', model:'', location:'', notes:'', isKit:false, kitSize:2, brokenQty:0 }); setShowModal(true) }
  const openEdit = item => { setSelected(item); setForm({ name:item.name, category:item.category, qty:item.totalQty, brand:item.brand||'', model:item.model||'', location:item.location||'', notes:item.notes||'', isKit:item.isKit||false, kitSize:item.kitSize||2, brokenQty:item.brokenQty||0 }); setShowModal(true) }

  const saveItem = async () => {
    if (!form.name.trim()) return
    const qty = parseInt(form.qty) || 1
    if (selected) {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      // Ricalcola availableQty: totalQty - rotti - (quelli fuori, cioè totalQty - availableQty attuale - rotti vecchi)
      const prevBroken = selected.brokenQty || 0
      const prevOut = (selected.totalQty||0) - (selected.availableQty||0) - prevBroken
      const newAvailable = Math.max(0, qty - broken - prevOut)
      await updateDoc(doc(db, 'items', selected.id), { name:form.name, category:form.category, totalQty:qty, availableQty:newAvailable, brokenQty:broken, brand:form.brand, model:form.model, location:form.location, notes:form.notes, isKit:form.isKit, kitSize: form.isKit ? (parseInt(form.kitSize)||2) : null })
    } else {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      const ref = await addDoc(collection(db, 'items'), {
        name:form.name, category:form.category, totalQty:qty, availableQty:qty - broken,
        brokenQty:broken,
        brand:form.brand, model:form.model, location:form.location, notes:form.notes,
        isKit:form.isKit, kitSize: form.isKit ? (parseInt(form.kitSize)||2) : null,
        createdAt:serverTimestamp(), createdBy: user.uid
      })
      await updateDoc(ref, { code: generateItemCode(ref.id) })
    }
    setShowModal(false)
  }

  const deleteItem = async id => {
    if (confirm('Eliminare questo articolo dal magazzino?')) {
      await deleteDoc(doc(db, 'items', id))
      setShowDetail(null)
    }
  }

  const openDetail = async item => {
    setShowDetail(item); setQrUrl(null)
    const code = item.code || generateItemCode(item.id)
    const url = await generateQRDataURL(code)
    setQrUrl(url)
    setTimeout(() => generateBarcodeSVG(code, 'barcode-svg'), 100)
  }

  const printCode = () => {
    const code = showDetail.code || generateItemCode(showDetail.id)
    const w = window.open('', '_blank')
    w.document.write(`<html><body style="text-align:center;padding:20px;font-family:sans-serif">
      <h2>${showDetail.name}</h2>
      <p style="color:#666">${showDetail.brand || ''} ${showDetail.model || ''}</p>
      <img src="${qrUrl}" style="width:200px;margin:10px 0"/>
      <p style="font-family:monospace;font-size:18px;font-weight:bold;margin:10px 0">${code}</p>
      <script>window.onload=()=>window.print()</script>
    </body></html>`)
    w.document.close()
  }

  const exportCSV = () => {
    if (items.length === 0) return
    const headers = ['Nome', 'Categoria', 'Marca', 'Modello', 'Quantità totale', 'Disponibili', 'Posizione', 'Kit', 'Pezzi per baule', 'Codice', 'Note']
    const rows = items.map(i => [
      i.name || '',
      i.category || '',
      i.brand || '',
      i.model || '',
      i.totalQty ?? '',
      i.availableQty ?? '',
      i.location || '',
      i.isKit ? 'Sì' : 'No',
      i.isKit && i.kitSize ? i.kitSize : '',
      i.code || '',
      (i.notes || '').replace(/,/g, ';'),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `magazzino_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = items.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Magazzino</h1><p>{items.length} articoli</p></div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportCSV} className="btn btn-secondary" style={{ padding:'10px 14px', fontSize:13 }}>📤 Esporta</button>
            <button onClick={() => setShowAddMenu(true)} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Aggiungi</button>
          </div>
        </div>
      </div>

      <div className="search-bar" style={{ position:'relative' }}>
        <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, categoria, marca..." />
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'12px 16px 0', overflow:'hidden' }}>
        {filtered.length === 0
          ? <div className="empty-state"><p style={{ fontSize:40 }}>📦</p><h3>Nessun articolo</h3><p>Aggiungi il primo articolo al magazzino</p></div>
          : filtered.map(item => (
            <div key={item.id} className="item-row" onClick={() => openDetail(item)}>
              <div className="item-icon">{ICONS[item.category] || '📦'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                  <p style={{ fontWeight:700, fontSize:15 }}>{item.name}</p>
                  {item.isKit && (
                    <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.4px', flexShrink:0 }}>
                      KIT
                    </span>
                  )}
                </div>
                <p style={{ color:'var(--text2)', fontSize:13 }}>
                  {item.brand} {item.model}
                  {item.isKit && item.kitSize && <span style={{ color:'var(--accent2)' }}> · {item.kitSize} pz/baule</span>}
                </p>
                {item.location && <p style={{ color:'var(--blue)', fontSize:12, marginTop:2 }}>📍 {item.location}</p>}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <span className={`badge ${item.availableQty === item.totalQty ? 'in' : item.availableQty === 0 ? 'out' : 'partial'}`}>
                  {item.availableQty}/{item.totalQty}
                </span>
                {item.brokenQty > 0 && (
                  <div style={{ marginTop:4 }}>
                    <span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700 }}>
                      🔴 {item.brokenQty} rott{item.brokenQty === 1 ? 'o' : 'i'}
                    </span>
                  </div>
                )}
                <p style={{ color:'var(--text2)', fontSize:11, marginTop:4 }}>{item.category}</p>
              </div>
            </div>
          ))
        }
      </div>

      {/* Modal aggiunta/modifica */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{selected ? 'Modifica articolo' : 'Nuovo articolo'}</h2>
            <div className="form-group"><label>Nome *</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Cassa EV ZLX-12P" /></div>
            <div className="form-group"><label>Categoria</label>
              <select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group"><label>Marca</label><input value={form.brand} onChange={e => setForm({...form,brand:e.target.value})} placeholder="es. EV" /></div>
              <div className="form-group"><label>Modello</label><input value={form.model} onChange={e => setForm({...form,model:e.target.value})} placeholder="es. ZLX-12P" /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group"><label>Quantità totale</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setForm({...form, qty:Math.max(1,form.qty-1)})}
                    style={{ width:32, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                  <input type="number" min="1" value={form.qty}
                    onChange={e => setForm({...form, qty:Math.max(1,parseInt(e.target.value)||1)})}
                    style={{ textAlign:'center', fontWeight:800, fontSize:16, padding:'6px 4px', flex:1 }} />
                  <button onClick={() => setForm({...form, qty:form.qty+1})}
                    style={{ width:32, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                </div>
              </div>
              <div className="form-group">
                <label style={{ color: form.brokenQty > 0 ? 'var(--red)' : undefined }}>
                  🔴 Rotti {form.brokenQty > 0 && <span style={{ fontWeight:800 }}>({form.brokenQty})</span>}
                </label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setForm({...form, brokenQty:Math.max(0,form.brokenQty-1)})}
                    style={{ width:32, height:36, borderRadius:8, background: form.brokenQty > 0 ? 'rgba(248,113,113,0.15)' : 'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                  <input type="number" min="0" max={form.qty} value={form.brokenQty}
                    onChange={e => setForm({...form, brokenQty:Math.min(form.qty,Math.max(0,parseInt(e.target.value)||0))})}
                    style={{ textAlign:'center', fontWeight:800, fontSize:16, padding:'6px 4px', flex:1, color: form.brokenQty > 0 ? 'var(--red)' : 'var(--text2)' }} />
                  <button onClick={() => setForm({...form, brokenQty:Math.min(form.qty,form.brokenQty+1)})}
                    style={{ width:32, height:36, borderRadius:8, background:'rgba(248,113,113,0.15)', border:'1px solid var(--border)', color:'var(--red)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                </div>
              </div>
            </div>
            {form.brokenQty > 0 && (
              <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:4, fontSize:13, color:'var(--red)' }}>
                ⚠️ {form.qty - form.brokenQty} disponibili · {form.brokenQty} fuori uso
              </div>
            )}
            <div className="form-group"><label>Posizione in magazzino 📍</label><input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="es. Scaffale A3, Ripiano 2 sx, Fondo sala..." /></div>

            {/* Toggle Kit/Baule */}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'14px', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <p style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>📦 Kit / Baule</p>
                  <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>Contiene più pezzi dello stesso tipo</p>
                </div>
                <button
                  onClick={() => setForm({...form, isKit:!form.isKit})}
                  style={{
                    width:48, height:28, borderRadius:14, padding:3,
                    background: form.isKit ? 'var(--accent2)' : 'var(--card3)',
                    border: 'none', transition:'background 0.2s',
                    display:'flex', alignItems:'center',
                    justifyContent: form.isKit ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'white', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
                </button>
              </div>

              {form.isKit && (
                <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
                  <label style={{ display:'block', fontSize:12, color:'var(--text2)', marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                    Pezzi contenuti per baule
                  </label>
                  <div className="qty-ctrl">
                    <button onClick={() => setForm({...form, kitSize:Math.max(2, (parseInt(form.kitSize)||2)-1)})}>−</button>
                    <span>{form.kitSize}</span>
                    <button onClick={() => setForm({...form, kitSize:(parseInt(form.kitSize)||2)+1})}>+</button>
                    <span style={{ color:'var(--text2)', fontSize:13, marginLeft:4 }}>pezzi per baule</span>
                  </div>
                  <p style={{ color:'var(--text2)', fontSize:12, marginTop:8, lineHeight:1.5 }}>
                    {form.name.trim() ? `"${form.name.trim()}"` : '"Nome articolo"'} con qty <strong style={{ color:'var(--text)' }}>{form.qty||1} baul{(form.qty||1) === 1 ? 'e' : 'i'}</strong> e kit da <strong style={{ color:'var(--accent2)' }}>{form.kitSize} pezzi</strong> = {(form.qty||1) * (parseInt(form.kitSize)||2)} pezzi totali in magazzino
                  </p>
                </div>
              )}
            </div>

            <div className="form-group"><label>Note</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} /></div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {selected && <button onClick={() => { setShowModal(false); deleteItem(selected.id) }} className="btn btn-red" style={{ flex:1 }}>🗑 Elimina</button>}
              <button onClick={saveItem} className="btn btn-primary" style={{ flex:2 }}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dettaglio + QR */}
      {showDetail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowDetail(null)}>✕</button>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>{ICONS[showDetail.category] || '📦'}</div>
              <h2 style={{ margin:0 }}>{showDetail.name}</h2>
              {(showDetail.brand || showDetail.model) && <p style={{ color:'var(--text2)', marginTop:4 }}>{showDetail.brand} {showDetail.model}</p>}
            </div>
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:'var(--text2)', fontSize:14 }}>Disponibili</span>
                <span style={{ fontWeight:800, fontSize:18 }}>{showDetail.availableQty}/{showDetail.totalQty}</span>
              </div>
              {/* Barra segmentata: disponibili / fuori / rotti */}
              <div style={{ background:'var(--card2)', borderRadius:4, height:8, overflow:'hidden', display:'flex' }}>
                <div style={{ background:'var(--green)', width:`${((showDetail.availableQty||0)/(showDetail.totalQty||1))*100}%`, transition:'width 0.3s' }} />
                {showDetail.brokenQty > 0 && (
                  <div style={{ background:'var(--red)', width:`${((showDetail.brokenQty||0)/(showDetail.totalQty||1))*100}%` }} />
                )}
              </div>
              <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--green)' }}>● {showDetail.availableQty} disponibili</span>
                {((showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)) > 0 && (
                  <span style={{ fontSize:12, color:'var(--accent2)' }}>● {(showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)} fuori</span>
                )}
                {showDetail.brokenQty > 0 && (
                  <span style={{ fontSize:12, color:'var(--red)' }}>● {showDetail.brokenQty} rott{showDetail.brokenQty === 1 ? 'o' : 'i'}</span>
                )}
              </div>
            </div>
            <div className="code-preview" style={{ marginBottom:14 }}>
              {qrUrl ? <img src={qrUrl} style={{ width:180 }} /> : <div style={{ width:180, height:180, background:'#f0f0f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ color:'#999', fontSize:13 }}>Generazione...</p></div>}
              <p style={{ color:'#333', fontFamily:'monospace', fontWeight:700, fontSize:16 }}>{showDetail.code || generateItemCode(showDetail.id)}</p>
              <svg id="barcode-svg"></svg>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={printCode} className="btn btn-secondary">🖨 Stampa</button>
              <button onClick={() => { setShowDetail(null); openEdit(showDetail) }} className="btn btn-secondary">✏️ Modifica</button>
            </div>
            {/* Tasto riparato — appare SOLO se ci sono pezzi rotti */}
            {(showDetail.brokenQty||0) > 0 && (
              <button
                onClick={async () => {
                  const currentBroken = showDetail.brokenQty || 0
                  const newBroken = Math.max(0, currentBroken - 1)
                  const prevOut = (showDetail.totalQty||0) - (showDetail.availableQty||0) - currentBroken
                  const newAvailable = Math.max(0, showDetail.totalQty - newBroken - prevOut)
                  await updateDoc(doc(db, 'items', showDetail.id), { brokenQty: newBroken, availableQty: newAvailable })
                  setShowDetail(d => ({ ...d, brokenQty: newBroken, availableQty: newAvailable }))
                }}
                style={{ width:'100%', marginTop:10, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.4)', color:'var(--red)', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14 }}
              >
                🔴 {showDetail.brokenQty} rott{showDetail.brokenQty === 1 ? 'o' : 'i'}
              </button>
            )}
            {showDetail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginTop:12, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{showDetail.notes}</p>}
            {showDetail.isKit && showDetail.kitSize && (
              <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(245,166,35,0.08)', border:'1px solid rgba(245,166,35,0.25)', borderRadius:8 }}>
                <p style={{ color:'var(--accent2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>📦 Kit / Baule</p>
                <p style={{ color:'var(--text)', fontSize:14 }}>
                  <strong>{showDetail.kitSize} pezzi</strong> per baule ·{' '}
                  <strong>{(showDetail.availableQty||0) * showDetail.kitSize}</strong> pezzi disponibili in totale
                </p>
              </div>
            )}
            {showDetail.location && (
              <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>📍</span>
                <div>
                  <p style={{ color:'var(--text2)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>Posizione magazzino</p>
                  <p style={{ color:'var(--blue)', fontWeight:700, fontSize:15, marginTop:2 }}>{showDetail.location}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Menu scelta: Oggetto o Kit ── */}
      {showAddMenu && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddMenu(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowAddMenu(false)}>✕</button>
            <h2>Cosa vuoi aggiungere?</h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
              <button
                onClick={() => { setShowAddMenu(false); openAdd() }}
                style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:36 }}>📦</span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Nuovo oggetto</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>Un singolo articolo con quantità e posizione</span>
              </button>
              <button
                onClick={() => { setShowAddMenu(false); setKitForm({name:'',location:'',notes:'',qty:1}); setKitComponents([]); setKitSearch(''); setShowKitModal(true) }}
                style={{ background:'rgba(245,166,35,0.08)', border:'2px solid rgba(245,166,35,0.3)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:36 }}>🧰</span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--accent2)' }}>Nuovo kit</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>Un baule che raggruppa più oggetti</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kit Builder ── */}
      {showKitModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowKitModal(false)}>
          <div className="modal" style={{ position:'relative', maxHeight:'92dvh', display:'flex', flexDirection:'column', padding:0 }}>
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <button className="close-btn" style={{ position:'absolute', top:16, right:20 }} onClick={() => setShowKitModal(false)}>✕</button>
              <h2 style={{ marginBottom:14 }}>🧰 Nuovo kit</h2>
              <input value={kitForm.name} onChange={e => setKitForm({...kitForm,name:e.target.value})}
                placeholder="Nome kit (es. Baule Tornado)" style={{ marginBottom:8, fontWeight:600, fontSize:16 }} />
              <input value={kitForm.location} onChange={e => setKitForm({...kitForm,location:e.target.value})}
                placeholder="📍 Posizione in magazzino (opzionale)" style={{ fontSize:13, marginBottom:8 }} />
              {/* Quantità kit */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <p style={{ fontSize:13, color:'var(--text2)', fontWeight:600, whiteSpace:'nowrap' }}>Quanti kit uguali?</p>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setKitForm(f => ({...f, qty: Math.max(1, f.qty-1)}))}
                    style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                  <input
                    type="number" min="1" max="999"
                    value={kitForm.qty}
                    onChange={e => setKitForm(f => ({...f, qty: Math.max(1, parseInt(e.target.value)||1)}))}
                    style={{ width:52, textAlign:'center', fontWeight:800, fontSize:16, padding:'4px 6px' }}
                  />
                  <button onClick={() => setKitForm(f => ({...f, qty: f.qty+1}))}
                    style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                </div>
              </div>
            </div>

            {/* Componenti già aggiunti */}
            {kitComponents.length > 0 && (
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'rgba(245,166,35,0.04)' }}>
                <p style={{ color:'var(--accent2)', fontSize:12, fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Contenuto kit</p>
                {kitComponents.map(comp => (
                  <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text)' }}>{comp.name}</span>
                    <div className="qty-ctrl" style={{ gap:6 }}>
                      <button onClick={() => setKitComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:Math.max(1,c.qty-1)} : c))}
                        style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                      <span style={{ fontWeight:800, fontSize:15, minWidth:22, textAlign:'center' }}>{comp.qty}</span>
                      <button onClick={() => setKitComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:Math.min(c.maxQty,c.qty+1)} : c))}
                        style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                    </div>
                    <button onClick={() => setKitComponents(prev => prev.filter(c => c.itemId !== comp.itemId))}
                      style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'2px 6px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Ricerca oggetti da aggiungere */}
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, position:'relative' }}>
              <input value={kitSearch} onChange={e => setKitSearch(e.target.value)}
                placeholder="Aggiungi oggetto al kit..." style={{ paddingLeft:32, fontSize:13 }} />
              <svg style={{ position:'absolute', left:26, top:'50%', transform:'translateY(-50%)' }} viewBox="0 0 24 24" fill="var(--text2)" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </div>

            <div style={{ overflowY:'auto', flex:1 }}>
              {items
                .filter(i => !i.isBundle && !kitComponents.some(c => c.itemId===i.id))
                .filter(i => !kitSearch || i.name?.toLowerCase().includes(kitSearch.toLowerCase()) || i.brand?.toLowerCase().includes(kitSearch.toLowerCase()))
                .map(item => (
                  <div key={item.id} className="item-row" onClick={() => {
                    setKitComponents(prev => [...prev, { itemId:item.id, name:item.name, qty:1, maxQty:item.totalQty||1 }])
                    setKitSearch('')
                  }}>
                    <div className="item-icon" style={{ fontSize:18 }}>{ICONS[item.category]||'📦'}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:12 }}>{item.brand} {item.model} · {item.availableQty??item.totalQty} disp.</p>
                    </div>
                    <span style={{ color:'var(--accent)', fontSize:20, padding:'0 8px' }}>+</span>
                  </div>
                ))
              }
            </div>

            {/* Salva kit */}
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg2)' }}>
              <button
                onClick={async () => {
                  if (!kitForm.name.trim() || kitComponents.length === 0) return
                  const kitQty = kitForm.qty || 1
                  const ref = await addDoc(collection(db, 'items'), {
                    name: kitForm.name.trim(),
                    location: kitForm.location.trim(),
                    notes: kitForm.notes||'',
                    category: 'Kit',
                    isBundle: true,
                    components: kitComponents.map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty })),
                    totalQty: kitQty,
                    availableQty: kitQty,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid,
                  })
                  await updateDoc(ref, { code: generateItemCode(ref.id) })
                  setShowKitModal(false)
                }}
                className="btn btn-primary btn-full"
                disabled={!kitForm.name.trim() || kitComponents.length === 0}
                style={{ opacity: !kitForm.name.trim() || kitComponents.length === 0 ? 0.4 : 1 }}>
                🧰 Crea {kitForm.qty > 1 ? `${kitForm.qty}x ` : ''}kit con {kitComponents.length} componenti
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
