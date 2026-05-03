import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { generateItemCode, generateQRDataURL, generateBarcodeSVG } from '../utils/generateCode'

const CATEGORIES = ['Console audio','Mixer','Amplificatore','Casse','Subwoofer','Microfono','Cavo audio','Cavo DMX','Proiettore','LED bar','Par LED','Moving head','Dimmer','Controller luci','Cavo elettrico','Multipresa','Flight case','Stativi','Altro']
const ICONS = {'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦'}

export default function Inventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [form, setForm] = useState({ name:'', category:'Altro', qty:1, brand:'', model:'', notes:'' })

  // Items in shared global collection so workers can read them
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const openAdd = () => { setSelected(null); setForm({ name:'', category:'Altro', qty:1, brand:'', model:'', notes:'' }); setShowModal(true) }
  const openEdit = item => { setSelected(item); setForm({ name:item.name, category:item.category, qty:item.totalQty, brand:item.brand||'', model:item.model||'', notes:item.notes||'' }); setShowModal(true) }

  const saveItem = async () => {
    if (!form.name.trim()) return
    const qty = parseInt(form.qty) || 1
    if (selected) {
      await updateDoc(doc(db, 'items', selected.id), { name:form.name, category:form.category, totalQty:qty, brand:form.brand, model:form.model, notes:form.notes })
    } else {
      const ref = await addDoc(collection(db, 'items'), {
        name:form.name, category:form.category, totalQty:qty, availableQty:qty,
        brand:form.brand, model:form.model, notes:form.notes,
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
          <button onClick={openAdd} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Aggiungi</button>
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
                <p style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{item.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13 }}>{item.brand} {item.model}</p>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <span className={`badge ${item.availableQty === item.totalQty ? 'in' : item.availableQty === 0 ? 'out' : 'partial'}`}>
                  {item.availableQty}/{item.totalQty}
                </span>
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
            <div className="form-group"><label>Quantità</label>
              <div className="qty-ctrl">
                <button onClick={() => setForm({...form,qty:Math.max(1,form.qty-1)})}>−</button>
                <span>{form.qty}</span>
                <button onClick={() => setForm({...form,qty:form.qty+1})}>+</button>
              </div>
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
              <div style={{ background:'var(--card2)', borderRadius:4, height:6 }}>
                <div style={{ background: showDetail.availableQty === showDetail.totalQty ? 'var(--green)' : showDetail.availableQty === 0 ? 'var(--accent)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${((showDetail.availableQty||0) / (showDetail.totalQty||1)) * 100}%` }} />
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
            {showDetail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginTop:12, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{showDetail.notes}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
