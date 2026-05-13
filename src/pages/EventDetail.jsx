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
  const [cart, setCart] = useState([])
  const [showEventNotes, setShowEventNotes] = useState(false)

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

  const updateEventItems = async (items) => {
    // Se l'evento è parte di una serie ricorrente, aggiorna tutti gli eventi della serie
    if (event.seriesId) {
      const { collection: col, query: q, where, getDocs: gd } = await import('firebase/firestore')
      const seriesSnap = await gd(q(col(db, 'events'), where('seriesId', '==', event.seriesId)))
      const updates = seriesSnap.docs.map(d => updateDoc(doc(db, 'events', d.id), { items }))
      await Promise.all(updates)
    } else {
      await updateDoc(eventRef, { items })
    }
  }

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

  // Aggiunge al carrello temporaneo (non chiude il modal)
  const addToCart = (item, qty) => {
    setCart(prev => {
      if (prev.some(c => c.id === item.id)) {
        // Aggiorna qty se già nel carrello
        return prev.map(c => c.id === item.id ? { ...c, qty } : c)
      }
      return [...prev, { id: item.id, name: item.name, category: item.category, brand: item.brand, model: item.model, location: item.location || '', isKit: item.isKit || false, kitSize: item.kitSize || null, isBundle: item.isBundle||false, components: item.components||null, qty }]
    })
  }

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(c => c.id !== itemId))
  }

  // Conferma e salva tutto il carrello sulla lista evento
  const confirmCart = async () => {
    if (cart.length === 0) return
    const newItems = cart.filter(c => !eventItems.some(e => e.id === c.id))
    const updated = [...eventItems, ...newItems.map(c => ({
      id:c.id, name:c.name, category:c.category, location:c.location||'',
      isKit:c.isKit||false, kitSize:c.kitSize||null,
      isBundle:c.isBundle||false, components:c.components||null,
      qty:c.qty, loaded:false, returned:false
    }))]
    await updateEventItems(updated)

    // Per i kit-bundle: scala la giacenza di ogni componente
    for (const c of newItems) {
      if (c.isBundle && c.components?.length) {
        for (const comp of c.components) {
          try {
            const compRef = doc(db, 'items', comp.itemId)
            const snap = await getDoc(compRef)
            if (snap.exists()) {
              const data = snap.data()
              await updateDoc(compRef, {
                availableQty: Math.max(0, (data.availableQty||0) - (comp.qty * (c.qty||1)))
              })
            }
          } catch(e) { console.error(e) }
        }
      }
    }

    setCart([])
    setSearch('')
    setShowAddItem(false)
  }

  const openAddModal = () => {
    setCart([])
    setSearch('')
    setShowAddItem(true)
  }

  const addToEvent = async (item, qty) => {
    if (eventItems.some(i => i.id === item.id)) return
    const updated = [...eventItems, { id: item.id, name: item.name, category: item.category, location: item.location || '', isKit: item.isKit || false, kitSize: item.kitSize || null, qty, loaded: false, returned: false }]
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

  const notInEvent = allItems.filter(i => !eventItems.some(e => e.id === i.id) && !cart.some(c => c.id === i.id))
  const filtered = notInEvent.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page">
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <button onClick={() => navigate('/events')} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
          <button
            onClick={() => navigate(`/events/${id}/scan`)}
            style={{ background:'linear-gradient(135deg,rgba(79,195,247,0.2),rgba(79,195,247,0.08))', border:'1px solid rgba(79,195,247,0.35)', color:'var(--blue)', borderRadius:10, padding:'8px 14px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg>
            Scansiona
          </button>
        </div>

        {/* Nome evento + tasto ℹ️ note */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ fontSize:22, fontWeight:800 }}>{event.name}</h1>
            <p style={{ color:'var(--text2)', fontSize:14, marginTop:4 }}>
              📅 {event.date && new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
              {event.location && ` · 📍 ${event.location}`}
            </p>
          </div>
          {event.notes && (
            <button
              onClick={() => setShowEventNotes(v => !v)}
              style={{
                flexShrink:0, width:30, height:30, borderRadius:'50%', marginTop:4,
                background: showEventNotes ? 'var(--blue)' : 'rgba(79,195,247,0.15)',
                border:'1px solid rgba(79,195,247,0.35)',
                color: showEventNotes ? 'white' : 'var(--blue)',
                fontWeight:900, fontSize:14,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}
            >
              {showEventNotes ? '✕' : 'i'}
            </button>
          )}
        </div>

        {/* Pannello note espandibile — scorre sotto il titolo, non copre tutto */}
        {showEventNotes && event.notes && (
          <div style={{
            marginTop:12, padding:'12px 14px',
            background:'rgba(79,195,247,0.07)',
            border:'1px solid rgba(79,195,247,0.2)',
            borderRadius:10,
            maxHeight:160, overflowY:'auto',
          }}>
            <p style={{ color:'var(--text)', fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{event.notes}</p>
          </div>
        )}
      </div>

      {event.seriesId && (
        <div style={{ padding:'8px 16px', background:'rgba(79,195,247,0.07)', borderBottom:'1px solid rgba(79,195,247,0.15)' }}>
          <p style={{ color:'var(--blue)', fontSize:12, fontWeight:700 }}>🔁 Evento ricorrente · la lista di carico è condivisa con tutta la serie</p>
        </div>
      )}
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
            <EventItemRow key={item.id} item={item} onToggleLoaded={toggleLoaded} onToggleReturned={toggleReturned} onRemove={removeFromEvent} />
          ))
        }
      </div>

      <div style={{ padding:'16px' }}>
        <button onClick={openAddModal} className="btn btn-secondary btn-full">
          + Aggiungi articolo alla lista
        </button>
      </div>

      {showAddItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddItem(false)}>
          <div className="modal" style={{ position:'relative', maxHeight:'60dvh', display:'flex', flexDirection:'column', padding:0 }}>

            {/* Header fisso */}
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ margin:0, fontSize:18 }}>Aggiungi alla lista</h2>
                <button className="close-btn" style={{ position:'static' }} onClick={() => setShowAddItem(false)}>✕</button>
              </div>
              {/* Barra di ricerca */}
              <div style={{ position:'relative' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca per nome, categoria, marca..."
                  autoFocus
                  style={{ paddingLeft:36 }}
                />
                <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                {search && (
                  <button onClick={() => setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'var(--card2)', borderRadius:'50%', width:20, height:20, fontSize:12, color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                )}
              </div>
            </div>

            {/* Carrello selezionati (se ci sono) */}
            {cart.length > 0 && (
              <div style={{ background:'rgba(105,240,174,0.06)', borderBottom:'1px solid rgba(105,240,174,0.2)', padding:'10px 16px', flexShrink:0 }}>
                <p style={{ color:'var(--green)', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
                  ✅ Selezionati — {cart.length} articol{cart.length === 1 ? 'o' : 'i'}
                </p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {cart.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--card2)', borderRadius:20, padding:'4px 10px 4px 12px', fontSize:13 }}>
                      <span style={{ fontWeight:600 }}>{c.name}</span>
                      <span style={{ color:'var(--text2)', fontSize:12 }}>×{c.qty}</span>
                      <button onClick={() => removeFromCart(c.id)} style={{ background:'rgba(255,82,82,0.2)', color:'var(--red)', borderRadius:'50%', width:18, height:18, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista articoli scorrevole */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.length === 0 && search
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'30px 20px' }}>Nessun risultato per "{search}"</p>
                : filtered.length === 0
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'30px 20px' }}>Tutti gli articoli sono già in lista</p>
                : filtered.map(item => (
                  <AddItemRow
                    key={item.id}
                    item={item}
                    onAdd={addToCart}
                    icon={ICONS[item.category] || '📦'}
                    inCart={cart.some(c => c.id === item.id)}
                    cartQty={cart.find(c => c.id === item.id)?.qty}
                  />
                ))
              }
            </div>

            {/* Pulsante conferma fisso in basso */}
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg2)' }}>
              <button
                onClick={confirmCart}
                disabled={cart.length === 0}
                className="btn btn-primary btn-full"
                style={{ opacity: cart.length === 0 ? 0.4 : 1, fontSize:16, padding:'14px' }}
              >
                {cart.length === 0
                  ? 'Seleziona articoli dalla lista ↑'
                  : `✅ Aggiungi ${cart.length} articol${cart.length === 1 ? 'o' : 'i'} alla lista`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddItemRow({ item, onAdd, icon, inCart, cartQty }) {
  const [qty, setQty] = useState(cartQty || 1)
  const max = item.availableQty ?? item.totalQty ?? 1

  // Sincronizza qty se l'utente cambia nel carrello
  useEffect(() => { if (cartQty) setQty(cartQty) }, [cartQty])

  const handleAdd = () => {
    onAdd(item, qty)
  }

  return (
    <div className="item-row" style={{ padding:'12px 16px', background: inCart ? 'rgba(105,240,174,0.05)' : 'transparent', borderLeft: inCart ? '3px solid var(--green)' : '3px solid transparent' }}>
      <div className="item-icon" style={{ fontSize:18, flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
          {item.isKit && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>KIT</span>}
          {item.isBundle && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>🧰 BUNDLE</span>}
        </div>
        <p style={{ color:'var(--text2)', fontSize:12 }}>
          {[item.brand, item.model].filter(Boolean).join(' ')}
          {item.isBundle && item.components
            ? ` · ${item.components.length} componenti`
            : item.isKit && item.kitSize
            ? ` · ${item.availableQty ?? item.totalQty} bauli disp. (${(item.availableQty ?? item.totalQty) * item.kitSize} pz)`
            : ` · ${item.availableQty ?? item.totalQty} disp.`}
        </p>
        {item.location && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.22)', borderRadius:6, padding:'2px 8px' }}>
            <span style={{ fontSize:11 }}>📍</span>
            <span style={{ color:'var(--blue)', fontSize:11, fontWeight:700 }}>{item.location}</span>
          </div>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div className="qty-ctrl">
          <button onClick={() => { const q = Math.max(1, qty-1); setQty(q); if (inCart) onAdd(item, q) }}>−</button>
          <span>{qty}</span>
          <button onClick={() => { const q = Math.min(Math.max(1, max), qty+1); setQty(q); if (inCart) onAdd(item, q) }}>+</button>
        </div>
        <button
          onClick={handleAdd}
          style={{
            width:34, height:34, borderRadius:'50%', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, flexShrink:0,
            background: inCart ? 'var(--green)' : 'var(--accent)',
            color: 'white',
            transition: 'all 0.15s'
          }}
        >
          {inCart ? '✓' : '+'}
        </button>
      </div>
    </div>
  )
}

// Riga lista evento con location live
function EventItemRow({ item, onToggleLoaded, onToggleReturned, onRemove }) {
  const [location, setLocation]   = useState(item.location || null)
  const [itemNotes, setItemNotes] = useState(null)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'items', item.id)).then(snap => {
      if (snap.exists()) {
        setLocation(snap.data().location || null)
        setItemNotes(snap.data().notes || null)
      }
    }).catch(() => {})
  }, [item.id])

  return (
    <>
      <div style={{ borderBottom: showNotes ? 'none' : '1px solid var(--border)' }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:24 }}>{ICONS[item.category] || '📦'}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <p style={{ fontWeight:700, fontSize:15 }}>{item.name}</p>
              {itemNotes && (
                <button onClick={() => setShowNotes(v => !v)}
                  style={{ background: showNotes ? 'var(--blue)' : 'rgba(79,195,247,0.15)', border:'1px solid rgba(79,195,247,0.3)', color: showNotes ? 'white' : 'var(--blue)', borderRadius:'50%', width:22, height:22, fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {showNotes ? 'x' : 'i'}
                </button>
              )}
            </div>
            <p style={{ color:'var(--text2)', fontSize:13 }}>qty: {item.qty || 1}</p>
            {location ? (
              <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.22)', borderRadius:6, padding:'3px 8px' }}>
                <span style={{ fontSize:11 }}>📍</span>
                <span style={{ color:'var(--blue)', fontSize:12, fontWeight:700 }}>{location}</span>
              </div>
            ) : (
              <p style={{ color:'var(--text3)', fontSize:11, marginTop:4, fontStyle:'italic' }}>Posizione non specificata</p>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
            <button onClick={() => onToggleLoaded(item.id)}
              style={{ background: item.loaded ? 'rgba(245,166,35,0.15)' : 'var(--card2)', color: item.loaded ? 'var(--accent2)' : 'var(--text2)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center' }}>
              {item.loaded ? '🚛 Caricato' : '○ Da caricare'}
            </button>
            <button onClick={() => onToggleReturned(item.id)} disabled={!item.loaded}
              style={{ background: item.returned ? 'rgba(105,240,174,0.15)' : item.loaded ? 'var(--card2)' : 'transparent', color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--border)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center', opacity: item.loaded ? 1 : 0.4 }}>
              {item.returned ? '✅ Rientrato' : '○ Da rientrare'}
            </button>
          </div>
          <button onClick={() => onRemove(item.id)} style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'4px 6px', flexShrink:0 }}>x</button>
        </div>
      </div>
      {showNotes && itemNotes && (
        <div style={{ padding:'10px 16px 14px', borderBottom:'1px solid var(--border)', background:'rgba(79,195,247,0.04)', display:'flex', gap:8 }}>
          <span style={{ fontSize:16, flexShrink:0 }}>📝</span>
          <p style={{ color:'var(--text)', fontSize:13, lineHeight:1.6 }}>{itemNotes}</p>
        </div>
      )}
    </>
  )
}
