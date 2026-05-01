import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import {
  doc, onSnapshot, updateDoc, collection,
  query, orderBy, onSnapshot as onSnap
} from 'firebase/firestore'

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [items, setItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [search, setSearch] = useState('')

  const eventRef = doc(db, 'users', user.uid, 'events', id)

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'items'), orderBy('name'))
    return onSnap(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  if (!event) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}><p style={{ color:'var(--text2)' }}>Caricamento...</p></div>

  const eventItems = event.items || []
  const done = eventItems.filter(i => i.checked).length
  const total = eventItems.length

  // Toggle check (rientrato/fuori)
  const toggleCheck = async itemId => {
    const updated = eventItems.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i)
    await updateDoc(eventRef, { items: updated })

    // Update availableQty in inventory
    const item = eventItems.find(i => i.id === itemId)
    const inventoryRef = doc(db, 'users', user.uid, 'items', itemId)
    try {
      const newItem = updated.find(i => i.id === itemId)
      // Fetch current item
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(inventoryRef)
      if (snap.exists()) {
        const current = snap.data()
        const wasChecked = item.checked
        const isNowChecked = newItem.checked
        let delta = 0
        if (!wasChecked && isNowChecked) delta = item.qty || 1   // rientrato: aumenta disponibili
        if (wasChecked && !isNowChecked) delta = -(item.qty || 1) // uscito: diminuisce disponibili
        await updateDoc(inventoryRef, { availableQty: Math.max(0, Math.min(current.totalQty, (current.availableQty || 0) + delta)) })
      }
    } catch(e) { console.error(e) }
  }

  // Add item to event list
  const addToEvent = async (item, qty) => {
    if (eventItems.some(i => i.id === item.id)) return
    const updated = [...eventItems, { id: item.id, name: item.name, category: item.category, qty, checked: false }]
    await updateDoc(eventRef, { items: updated })

    // Mark as out in inventory
    try {
      const inventoryRef = doc(db, 'users', user.uid, 'items', item.id)
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(inventoryRef)
      if (snap.exists()) {
        const current = snap.data()
        await updateDoc(inventoryRef, { availableQty: Math.max(0, (current.availableQty || 0) - qty) })
      }
    } catch(e) { console.error(e) }
    setShowAddItem(false)
  }

  // Remove from event
  const removeFromEvent = async itemId => {
    const item = eventItems.find(i => i.id === itemId)
    const updated = eventItems.filter(i => i.id !== itemId)
    await updateDoc(eventRef, { items: updated })
    if (!item.checked) {
      try {
        const inventoryRef = doc(db, 'users', user.uid, 'items', itemId)
        const { getDoc } = await import('firebase/firestore')
        const snap = await getDoc(inventoryRef)
        if (snap.exists()) {
          const current = snap.data()
          await updateDoc(inventoryRef, { availableQty: Math.min(current.totalQty, (current.availableQty || 0) + (item.qty || 1)) })
        }
      } catch(e) {}
    }
  }

  const notInEvent = items.filter(i => !eventItems.some(e => e.id === i.id))
  const filtered = notInEvent.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))

  const ICONS = { 'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦' }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => navigate('/events')} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
        </div>
        <h1 style={{ fontSize:22, fontWeight:800 }}>{event.name}</h1>
        <p style={{ color:'var(--text2)', fontSize:14, marginTop:4 }}>
          📅 {event.date && new Date(event.date).toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          {event.location && ` • 📍 ${event.location}`}
        </p>
      </div>

      {/* Progresso lista */}
      <div style={{ padding:'16px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>Lista carico</span>
          <span style={{ fontSize:14, color: done === total && total > 0 ? 'var(--green)' : 'var(--text2)' }}>{done}/{total} rientrati</span>
        </div>
        <div style={{ background:'var(--card2)', borderRadius:4, height:6 }}>
          <div style={{ background: done === total && total > 0 ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width: total > 0 ? `${(done/total)*100}%` : '0%', transition:'width 0.4s ease' }} />
        </div>
        {done === total && total > 0 && <p style={{ color:'var(--green)', fontSize:13, marginTop:8, fontWeight:700 }}>✅ Tutto rientrato! Evento chiuso.</p>}
      </div>

      {/* Lista articoli evento */}
      <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {eventItems.length === 0
          ? <div className="empty-state" style={{ padding:'40px 20px' }}>
              <p style={{ fontSize:32 }}>📋</p>
              <h3>Lista vuota</h3>
              <p>Aggiungi articoli alla lista di carico per questo evento</p>
            </div>
          : eventItems.map(item => (
            <div key={item.id} className="check-row">
              <div className={`checkmark ${item.checked ? 'checked' : ''}`} onClick={() => toggleCheck(item.id)}>
                {item.checked && <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700, fontSize:15, textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? 'var(--text2)' : 'var(--text)' }}>{item.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13 }}>{item.category} · qty: {item.qty || 1}</p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className={`badge ${item.checked ? 'in' : 'out'}`}>{item.checked ? 'Rientrato' : 'Fuori'}</span>
                <button onClick={() => removeFromEvent(item.id)} style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'4px 8px' }}>✕</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* Aggiungi articoli */}
      <div style={{ padding:'16px' }}>
        <button onClick={() => setShowAddItem(true)} className="btn btn-secondary btn-full">
          + Aggiungi articolo alla lista
        </button>
      </div>

      {/* Modal selezione articolo */}
      {showAddItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddItem(false)}>
          <div className="modal" style={{ position:'relative', maxHeight:'85dvh' }}>
            <button className="close-btn" onClick={() => setShowAddItem(false)}>✕</button>
            <h2>Aggiungi alla lista</h2>
            <div style={{ position:'relative', marginBottom:12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca articolo..." style={{ paddingLeft:36 }} />
              <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </div>
            <div style={{ maxHeight:'50dvh', overflowY:'auto' }}>
              {filtered.length === 0
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'20px' }}>Nessun articolo disponibile</p>
                : filtered.map(item => (
                  <AddItemRow key={item.id} item={item} onAdd={addToEvent} icon={ICONS[item.category] || '📦'} />
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddItemRow({ item, onAdd, icon }) {
  const [qty, setQty] = useState(1)
  const max = item.availableQty || item.totalQty || 1
  return (
    <div className="item-row" style={{ padding:'12px 0' }}>
      <div className="item-icon" style={{ fontSize:18 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
        <p style={{ color:'var(--text2)', fontSize:12 }}>{item.brand} {item.model} · {item.availableQty} disp.</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div className="qty-ctrl">
          <button onClick={() => setQty(q => Math.max(1, q-1))}>−</button>
          <span>{qty}</span>
          <button onClick={() => setQty(q => Math.min(max, q+1))}>+</button>
        </div>
        <button onClick={() => onAdd(item, qty)} className="btn btn-primary" style={{ padding:'8px 14px', fontSize:13 }}>+</button>
      </div>
    </div>
  )
}
