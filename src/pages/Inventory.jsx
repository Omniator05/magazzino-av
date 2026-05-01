import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore'
import { generateItemCode, generateQRDataURL, generateBarcodeSVG } from '../utils/generateCode'

const CATEGORIES = ['Console audio','Mixer','Amplificatore','Casse','Subwoofer','Microfono','Cavo audio','Cavo DMX','Proiettore','LED bar','Par LED','Moving head','Dimmer','Controller luci','Cavo elettrico','Multipresa','Flight case','Stativi','Altro']
const ICONS = { 'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦' }

export default function Inventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [form, setForm] = useState({ name:'', category:'Altro', qty:1, brand:'', model:'', notes:'' })

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  const colRef = () => collection(db, 'users', user.uid, 'items')
  const docRef = id => doc(db, 'users', user.uid, 'items', id)

  const openAdd = () => { setSelected(null); setForm({ name:'', category:'Altro', qty:1, brand:'', model:'', notes:'' }); setShowModal(true) }
  const openEdit = item => { setSelected(item); setForm({ name:item.name, category:item.category, qty:item.totalQty, brand:item.brand||'', model:item.model||'', notes:item.notes||'' }); setShowModal(true) }

  const saveItem = async () => {
    if (!form.name.trim()) return
    const qty = parseInt(form.qty) || 1
    if (selected) {
      await updateDoc(docRef(selected.id), { name:form.name, category:form.category, totalQty:qty, brand:form.brand, model:form.model, notes:form.notes })
    } else {
      const ref = await addDoc(colRef(), { name:form.name, category:form.category, totalQty:qty, availableQty:qty, brand:form.brand, model:form.model, notes:form.notes, createdAt:serverTimestamp() })
      // Update with code after creation
      const code = generateItemCode(ref.id)
      await updateDoc(ref, { code })
    }
    setShowModal(false)
  }

  const deleteItem = async id => {
    if (confirm('Eliminare questo articolo?')) await deleteDoc(docRef(id))
    setShowDetail(null)
  }

  const openDetail = async item => {
    setShowDetail(item)
    const code = item.code || generateItemCode(item.id)
    const url = await generateQRDataURL(code)
    setQrUrl(url)
    setTimeout(() => generateBarcodeSVG(code, 'barcode-svg'), 100)
  }

  const printCode = () => {
    const w = window.open('', '_blank')
    w.document.write(`<html><body style="text-align:center;padding:20px;font-family:sans-serif">
      <h2>${showDetail.name}</h2>
      <p>${showDetail.brand || ''} ${showDetail.model || ''}</p>
      <img src="${qrUrl}" style="width:200px"/>
      <p style="font-family:monospace;font-size:18px;font-weight:bold">${showDetail.code || generateItemCode(showDetail.id)}</p>
      <svg id="bc"></svg>
    </body></html>`)
    w.document.close()
    w.focus(); w.print()
  }

  const filtered = items.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()) || i.brand?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Magazzino</h1><p>{items.length} articoli totali</p></div>
          <button onClick={openAdd} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Aggiungi</button>
        </div>
      </div>

      <div className="search-bar" style={{ position:'relative' }}>
        <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, categoria, marca..." />
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'12px 16px 0', overflow:'hidden' }}>
        {filtered.length === 0
          ? <div className="empty-state"><svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.52 15.5 0 12.36 0 10.63 0 9.11.92 8.2 2.27L12 6H4.5L3 4H1v2h1l3 6.92V18c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8l1-2V6h-2z"/></svg><h3>Nessun articolo trovato</h3><p>Aggiungi il primo articolo al magazzino</p></div>
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

      {/* Add/Edit Modal */}
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
            <div className="form-group"><label>Note</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Note aggiuntive..." rows={2} /></div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {selected && <button onClick={() => { setShowModal(false); deleteItem(selected.id) }} className="btn btn-red" style={{ flex:1 }}>🗑 Elimina</button>}
              <button onClick={saveItem} className="btn btn-primary" style={{ flex:2 }}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail + QR Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowDetail(null)}>✕</button>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>{ICONS[showDetail.category] || '📦'}</div>
              <h2 style={{ margin:0 }}>{showDetail.name}</h2>
              {(showDetail.brand || showDetail.model) && <p style={{ color:'var(--text2)', marginTop:4 }}>{showDetail.brand} {showDetail.model}</p>}
            </div>

            {/* Stato */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:'var(--text2)', fontSize:14 }}>Disponibili</span>
                <span style={{ fontWeight:800, fontSize:18 }}>{showDetail.availableQty}/{showDetail.totalQty}</span>
              </div>
              <div style={{ background:'var(--card2)', borderRadius:4, height:6 }}>
                <div style={{ background: showDetail.availableQty === showDetail.totalQty ? 'var(--green)' : showDetail.availableQty === 0 ? 'var(--accent)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(showDetail.availableQty / showDetail.totalQty) * 100}%`, transition:'width 0.3s' }} />
              </div>
            </div>

            {/* QR Code */}
            <div className="code-preview" style={{ marginBottom:14 }}>
              {qrUrl ? <img src={qrUrl} style={{ width:180 }} /> : <div style={{ width:180, height:180, background:'#f0f0f0' }} />}
              <p style={{ color:'#333', fontFamily:'monospace', fontWeight:700, fontSize:16 }}>{showDetail.code || generateItemCode(showDetail.id)}</p>
              <svg id="barcode-svg"></svg>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button onClick={printCode} className="btn btn-secondary" style={{ flex:1 }}>🖨 Stampa codice</button>
              <button onClick={() => { setShowDetail(null); openEdit(showDetail) }} className="btn btn-secondary" style={{ flex:1 }}>✏️ Modifica</button>
            </div>
            {showDetail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginTop:12, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{showDetail.notes}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
