import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, collection, query, orderBy, getDocs, getDoc } from 'firebase/firestore'

const ICONS = {'Console audio':'🎚️','Mixer':'🎛️','Amplificatore':'📡','Casse':'🔊','Subwoofer':'💥','Microfono':'🎤','Cavo audio':'🔌','Cavo DMX':'🔗','Proiettore':'💡','LED bar':'🌈','Par LED':'🔵','Moving head':'🎭','Dimmer':'🔆','Controller luci':'🎮','Cavo elettrico':'⚡','Multipresa':'🔌','Flight case':'🧳','Stativi':'🪜','Altro':'📦'}

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [allItems, setAllItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [search, setSearch] = useState('')

  const eventRef = doc(db, 'events', id)

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  useEffect(() => {
    // Items are under the admin's user collection - we need a shared items collection too
    // For now fetch from all users (admin creates items under shared 'items' collection)
    const fetchItems = async () => {
      const q = query(collection(db, 'items'), orderBy('name'))
      const snap = await getDocs(q)
      setAllItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    fetchItems()
    // Listen for real time updates
    const q = query(collection(db, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setAllItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  if (!event) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
      <p style={{ color:'var(--text2)' }}>Caricamento...</p>
    </div>
  )

  const eventItems = event.items || []
  const loaded = eventItems.filter(i => i.loaded).length
  const returned = eventItems.filter(i => i.returned).length
  const total = eventItems.length

  const updateEventItems = items => updateDoc(eventRef, { items })

  const toggleLoaded = async itemId => {
    const updated = eventItems.map(i => {
      if (i.id !== itemId) return i
      const newLoaded = !i.loaded
      return { ...i, loaded: newLoaded, returned: newLoaded ? false : i.returned }
    })
    await updateEventItems(updated)

    // Aggiorna disponibilità in magazzino
    const item = eventItems.find(i => i.id === itemId)
    const newState = updated.find(i => i.id === itemId)
    try {
      const itemRef = doc(db, 'items', itemId)
      const snap = await getDoc(itemRef)
      if (snap.exists()) {
        const current = snap.data()
        const delta = newState.loaded ? -(item.qty || 1) : (item.qty || 1)
        await updateDoc(itemRef, { availableQty: Math.max(0, Math.min(current.totalQty, (current.availableQty || 0) + delta)) })
      }
    } catch(e) { console.error(e) }
  }

  const toggleReturned = async itemId => {
    const item = eventItems.find(i => i.id === itemId)
    if (!item.loaded) return // deve essere caricato prima
    const updated = eventItems.map(i => i.id !== itemId ? i : { ...i, returned: !i.returned })
    await updateEventItems(updated)

    const newState = updated.find(i => i.id === itemId)
    try {
      const itemRef = doc(db, 'items', itemId)
      const snap = await getDoc(itemRef)
      if (snap.exists()) {
        const current = snap.data()
        const delta = newState.returned ? (item.qty || 1) : -(item.qty || 1)
        await updateDoc(itemRef, { availableQty: Math.max(0, Math.min(current.totalQty, (current.availableQty || 0) + delta)) })
      }
    } catch(e) { console.error(e) }
  }

  const addToEvent = async (item, qty) => {
    if (eventItems.some(i => i.id === item.id)) return
    const updated = [...eventItems, { id: item.id, name: item.name, category: item.category, qty, loaded: false, returned: false }]
    await updateEventItems(updated)
    setShowAddItem(false)
    setSearch('')
  }

  const removeFromEvent = async itemId => {
    const item = eventItems.find(i => i.id === itemId)
    if (item.loaded && !item.returned) {
      if (!confirm('Questo articolo risulta ancora fuori. Rimuoverlo dalla lista?')) return
      // Ripristina disponibilità
      try {
        const itemRef = doc(db, 'items', itemId)
        const snap = await getDoc(itemRef)
        if (snap.exists()) {
          const current = snap.data()
          await updateDoc(itemRef, { availableQty: Math.min(current.totalQty, (current.availableQty || 0) + (item.qty || 1)) })
        }
      } catch(e) {}
    }
    await updateEventItems(eventItems.filter(i => i.id !== itemId))
  }

  const notInEvent = allItems.filter(i => !eventItems.some(e => e.id === i.id))
  const filtered = notInEvent.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page">
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => navigate('/events')} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
        </div>
        <h1 style={{ fontSize:22, fontWeight:800 }}>{event.name}</h1>
        <p style={{ color:'var(--text2)', fontSize:14, marginTop:4 }}>
          📅 {event.date && new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          {event.location && ` · 📍 ${event.location}`}
        </p>
      </div>

      {/* Barra progresso */}
      <div style={{ padding:'16px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px' }}>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>🚛 Caricato</p>
            <p style={{ fontWeight:800, fontSize:22, color: total > 0 && loaded === total ? 'var(--green)' : 'var(--accent2)' }}>{loaded}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
          </div>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px' }}>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>🏠 Rientrato</p>
            <p style={{ fontWeight:800, fontSize:22, color: total > 0 && returned === total ? 'var(--green)' : 'var(--text2)' }}>{returned}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
          </div>
        </div>
        {total > 0 && (
          <div style={{ background:'var(--card2)', borderRadius:4, height:6 }}>
            <div style={{ background: returned === total ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.4s ease' }} />
          </div>
        )}
        {returned === total && total > 0 && <p style={{ color:'var(--green)', fontSize:13, marginTop:8, fontWeight:700 }}>✅ Tutto rientrato! Evento chiuso.</p>}
      </div>

      {/* Lista articoli */}
      <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {eventItems.length === 0
          ? <div className="empty-state" style={{ padding:'40px 20px' }}>
              <p style={{ fontSize:32 }}>📋</p>
              <h3>Lista vuota</h3>
              <p>Aggiungi articoli alla lista di carico</p>
            </div>
          : eventItems.map(item => (
            <div key={item.id} style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:24 }}>{ICONS[item.category] || '📦'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:15 }}>{item.name}</p>
                <p style={{ color:'var(--text2)', fontSize:13 }}>qty: {item.qty || 1}</p>
              </div>
              {/* Stato doppio: caricato + rientrato */}
              <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
                <button onClick={() => toggleLoaded(item.id)}
                  style={{ background: item.loaded ? 'rgba(245,166,35,0.15)' : 'var(--card2)', color: item.loaded ? 'var(--accent2)' : 'var(--text2)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center' }}>
                  {item.loaded ? '🚛 Caricato' : '○ Da caricare'}
                </button>
                <button onClick={() => toggleReturned(item.id)} disabled={!item.loaded}
                  style={{ background: item.returned ? 'rgba(105,240,174,0.15)' : item.loaded ? 'var(--card2)' : 'transparent', color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--border)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center', opacity: item.loaded ? 1 : 0.4 }}>
                  {item.returned ? '✅ Rientrato' : '○ Da rientrare'}
                </button>
              </div>
              <button onClick={() => removeFromEvent(item.id)} style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'4px 6px', flexShrink:0 }}>✕</button>
            </div>
          ))
        }
      </div>

      <div style={{ padding:'16px' }}>
        <button onClick={() => setShowAddItem(true)} className="btn btn-secondary btn-full">
          + Aggiungi articolo alla lista
        </button>
      </div>

      {showAddItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddItem(false)}>
          <div className="modal" style={{ position:'relative', maxHeight:'85dvh' }}>
            <button className="close-btn" onClick={() => setShowAddItem(false)}>✕</button>
            <h2>Aggiungi alla lista</h2>
            <div style={{ position:'relative', marginBottom:12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca articolo..." style={{ paddingLeft:36 }} />
              <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </div>
            <div style={{ maxHeight:'55dvh', overflowY:'auto' }}>
              {filtered.length === 0
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'20px' }}>Nessun articolo trovato</p>
                : filtered.map(item => <AddItemRow key={item.id} item={item} onAdd={addToEvent} icon={ICONS[item.category] || '📦'} />)
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
  const max = item.availableQty ?? item.totalQty ?? 1
  return (
    <div className="item-row" style={{ padding:'12px 0' }}>
      <div className="item-icon" style={{ fontSize:18 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
        <p style={{ color:'var(--text2)', fontSize:12 }}>{item.brand} {item.model} · {item.availableQty ?? item.totalQty} disp.</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div className="qty-ctrl">
          <button onClick={() => setQty(q => Math.max(1, q-1))}>−</button>
          <span>{qty}</span>
          <button onClick={() => setQty(q => Math.min(Math.max(1, max), q+1))}>+</button>
        </div>
        <button onClick={() => onAdd(item, qty)} className="btn btn-primary" style={{ padding:'8px 14px', fontSize:13 }}>+</button>
      </div>
    </div>
  )
}
