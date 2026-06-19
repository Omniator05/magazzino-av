import { useModalDrag } from '../hooks/useModalDrag'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, collection, query, orderBy, getDocs, getDoc } from 'firebase/firestore'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import DateBadge from '../components/DateBadge'

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

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const today = new Date().toISOString().split('T')[0]
  const [allItems, setAllItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [showExtraModal, setShowExtraModal] = useState(false)
  const addItemDrag   = useModalDrag(() => setShowAddItem(false))
  const extraDrag     = useModalDrag(() => setShowExtraModal(false))
  const [extraForm, setExtraForm] = useState({ name:'', qty:1, notes:'' })
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [showEventNotes, setShowEventNotes] = useState(false)
  const [addAsMancante, setAddAsMancante] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const itemEditDrag = useModalDrag(() => setEditItem(null))
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [workers, setWorkers] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const assignDrag = useModalDrag(() => setShowAssignModal(false))

  const eventRef = doc(db, 'events', id)

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('name'))
    return onSnapshot(q, snap => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.role === 'worker' || p.role === 'admin'))
    })
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'unavailability'), snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

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
  const mancanti = eventItems.filter(i => i.mancante).length

  const updateEventItems = async (items) => {
    await updateDoc(eventRef, { items })
    // Propaga solo la struttura (nome, qty, categoria) agli altri eventi della serie,
    // senza copiare lo stato di carico/rientro che è specifico di ogni occorrenza
    if (event.seriesId) {
      const { collection: col, query: q, where, getDocs: gd } = await import('firebase/firestore')
      const seriesSnap = await gd(q(col(db, 'events'), where('seriesId', '==', event.seriesId)))
      const itemsTemplate = items.map(({ loaded, returned, mancante, ...rest }) => ({
        ...rest, loaded: false, returned: false, mancante: false
      }))
      const updates = seriesSnap.docs
        .filter(d => d.id !== event.id)
        .map(d => updateDoc(doc(db, 'events', d.id), { items: itemsTemplate }))
      await Promise.all(updates)
    }
  }

  const toggleWorkerAssignment = async (workerId) => {
    const current = event.assignedWorkers || []
    const updated = current.includes(workerId)
      ? current.filter(wid => wid !== workerId)
      : [...current, workerId]
    await updateDoc(eventRef, { assignedWorkers: updated })
  }

  const isWorkerUnavailable = (workerId) => {
    if (!event?.date) return false
    return unavailability.some(u => u.workerId === workerId && event.date >= u.startDate && event.date <= u.endDate)
  }

  const toggleLoaded = async itemId => {
    const updated = eventItems.map(i => {
      if (i.id !== itemId) return i
      const newLoaded = !i.loaded
      return { ...i, loaded: newLoaded, returned: newLoaded ? false : i.returned }
    })
    await updateEventItems(updated)

    // Extra non toccano la giacenza
    const item = eventItems.find(i => i.id === itemId)
    if (item?.isExtra) return

    const newState = updated.find(i => i.id === itemId)
    const firestoreId = item?.itemRef || itemId

    // Kit bundle o categoria Kit: legge sempre i componenti freschi da Firestore
    if (item?.isBundle || item?.category === 'Kit') {
      try {
        const kitRef = doc(db, 'items', firestoreId)
        const kitSnap = await getDoc(kitRef)
        if (kitSnap.exists()) {
          const kitData = kitSnap.data()
          const components = kitData.components || []
          console.log('Componenti freschi da Firestore:', JSON.stringify(components))
          for (const comp of components) {
            try {
              const compRef = doc(db, 'items', comp.itemId)
              const snap = await getDoc(compRef)
              if (snap.exists()) {
                const current = snap.data()
                const delta = newState.loaded ? -(comp.qty * (item.qty||1)) : (comp.qty * (item.qty||1))
                const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
                await updateDoc(compRef, { availableQty: Math.max(0, Math.min(maxAvail, (current.availableQty||0) + delta)) })
              }
            } catch(e) { console.error(e) }
          }
          // Aggiorna giacenza kit stesso
          const delta = newState.loaded ? -(item.qty || 1) : (item.qty || 1)
          await updateDoc(kitRef, { availableQty: Math.max(0, Math.min(kitData.totalQty||999, (kitData.availableQty||0) + delta)) })
        }
      } catch(e) { console.error(e) }
      return
    }

    // Articolo singolo: aggiorna disponibilità normale
    try {
      const itemRef = doc(db, 'items', firestoreId)
      const snap = await getDoc(itemRef)
      if (snap.exists()) {
        const current = snap.data()
        const delta = newState.loaded ? -(item.qty || 1) : (item.qty || 1)
        const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
        await updateDoc(itemRef, { availableQty: Math.max(0, Math.min(maxAvail, (current.availableQty || 0) + delta)) })
      }
    } catch(e) { console.error(e) }
  }

  const toggleMancante = async itemId => {
    const updated = eventItems.map(i => i.id !== itemId ? i : { ...i, mancante: !i.mancante })
    await updateDoc(eventRef, { items: updated })
  }

  const toggleReturned = async itemId => {
    const item = eventItems.find(i => i.id === itemId)
    if (!item.loaded) return
    const updated = eventItems.map(i => i.id !== itemId ? i : { ...i, returned: !i.returned })
    await updateEventItems(updated)

    // Extra non toccano la giacenza
    if (item?.isExtra) return

    const newState = updated.find(i => i.id === itemId)
    const firestoreId = item?.itemRef || itemId

    // Kit bundle o categoria Kit: legge sempre i componenti freschi da Firestore
    if (item?.isBundle || item?.category === 'Kit') {
      try {
        const kitRef = doc(db, 'items', firestoreId)
        const kitSnap = await getDoc(kitRef)
        if (kitSnap.exists()) {
          const kitData = kitSnap.data()
          const components = kitData.components || []
          for (const comp of components) {
            try {
              const compRef = doc(db, 'items', comp.itemId)
              const snap = await getDoc(compRef)
              if (snap.exists()) {
                const current = snap.data()
                const delta = newState.returned ? (comp.qty * (item.qty||1)) : -(comp.qty * (item.qty||1))
                const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
                await updateDoc(compRef, { availableQty: Math.max(0, Math.min(maxAvail, (current.availableQty||0) + delta)) })
              }
            } catch(e) { console.error(e) }
          }
          const delta = newState.returned ? (item.qty || 1) : -(item.qty || 1)
          const kitMaxAvail = (kitData.totalQty||0) - (kitData.brokenQty||0)
          await updateDoc(kitRef, { availableQty: Math.max(0, Math.min(kitMaxAvail, (kitData.availableQty||0) + delta)) })
        }
      } catch(e) { console.error(e) }
      return
    }

    // Articolo singolo
    try {
      const itemRef = doc(db, 'items', firestoreId)
      const snap = await getDoc(itemRef)
      if (snap.exists()) {
        const current = snap.data()
        const delta = newState.returned ? (item.qty || 1) : -(item.qty || 1)
        const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
        await updateDoc(itemRef, { availableQty: Math.max(0, Math.min(maxAvail, (current.availableQty || 0) + delta)) })
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
    let updated = [...eventItems]
    for (const c of cart) {
      const alreadyExists = updated.some(e => e.id === c.id || e.itemRef === c.id)
      if (alreadyExists) {
        // Riga separata con id unico, itemRef punta all'articolo Firebase originale
        updated.push({
          id: `${c.id}_extra_${Date.now()}`,
          itemRef: c.id,
          name: c.name, category: c.category, location: c.location||'',
          isKit: c.isKit||false, kitSize: c.kitSize||null,
          isBundle: c.isBundle||false, components: c.components||null,
          qty: c.qty, loaded: false, returned: false,
          mancante: true,
        })
      } else {
        updated.push({
          id: c.id, name: c.name, category: c.category, location: c.location||'',
          isKit: c.isKit||false, kitSize: c.kitSize||null,
          isBundle: c.isBundle||false, components: c.components||null,
          qty: c.qty, loaded: false, returned: false,
          mancante: addAsMancante || false,
        })
      }
    }
    await updateEventItems(updated)
    setCart([])
    setSearch('')
    setAddAsMancante(false)
    setShowAddItem(false)
  }

  const openAddModal = () => {
    setCart([])
    setSearch('')
    setAddAsMancante(false)
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
        const itemRef = doc(db, 'items', item.itemRef || itemId)
        const snap = await getDoc(itemRef)
        if (snap.exists()) {
          const current = snap.data()
          const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
          await updateDoc(itemRef, { availableQty: Math.min(maxAvail, (current.availableQty || 0) + (item.qty || 1)) })
        }
      } catch(e) {}
    }
    await updateEventItems(eventItems.filter(i => i.id !== itemId))
  }

  const saveItemEdit = async ({ id, qty, eventNote, mancante }) => {
    const updated = eventItems.map(i =>
      i.id !== id ? i : { ...i, qty, eventNote: eventNote || '', mancante: mancante || false }
    )
    await updateEventItems(updated)
    setEditItem(null)
  }

  const addExtraItem = async () => {
    if (!extraForm.name.trim()) return
    const extra = {
      id: `extra-${Date.now()}`,
      name: extraForm.name.trim(),
      qty: extraForm.qty || 1,
      notes: extraForm.notes.trim(),
      category: 'Extra',
      isExtra: true,
      loaded: false,
      returned: false,
    }
    await updateEventItems([...eventItems, extra])
    setExtraForm({ name:'', qty:1, notes:'' })
    setShowExtraModal(false)
  }

  const notInCart = allItems.filter(i => !cart.some(c => c.id === i.id))
  const filtered = notInCart.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase())
  )

  const exportPDF = () => {
    const items = event.items || []
    const loaded = items.filter(i => i.loaded && !i.isExtra)
    const extras = items.filter(i => i.loaded && i.isExtra)
    const date = event.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : ''

    const rows = [...loaded, ...extras].map(i =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e8e4fb;font-weight:600;">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e8e4fb;text-align:center;font-weight:700;color:#7c3aed;">${i.qty || 1}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lista Carico – ${event.name}</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 40px; color: #1a1033; }
      h1 { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
      .meta { color: #7c6faa; font-size: 14px; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; }
      thead th { background: #7c3aed; color: white; padding: 10px 12px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
      thead th:last-child { text-align: center; width: 80px; }
      tbody tr:hover { background: #f4f3ff; }
      .footer { margin-top: 24px; color: #9b8ec4; font-size: 12px; }
    </style></head><body>
    <h1>${event.name}</h1>
    <p class="meta">${date}${event.location ? ' · 📍 ' + event.location : ''}</p>
    <table>
      <thead><tr><th>Articolo</th><th>Qtà</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="footer">Lista carico generata il ${new Date().toLocaleDateString('it-IT')} – Magazzino TSG</p>
    </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.print()
  }

  const CAT_ICONS = { Audio:'🔊', Video:'📺', Luci:'🔦', Rigging:'⛓️', Corrente:'⚡', Effetti:'🎉', Consumabili:'🪣', Kit:'🧰', Extra:'✨', Altro:'📦' }
  const CAT_ORDER = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Extra','Altro']
  const catGrouped = {}
  eventItems.forEach(item => {
    const cat = item.isExtra ? 'Extra' : (item.category || 'Altro')
    if (!catGrouped[cat]) catGrouped[cat] = []
    catGrouped[cat].push(item)
  })
  const catKeys = CAT_ORDER.filter(c => catGrouped[c])
  const multiCat = catKeys.length > 1
  const groupedEventItems = catKeys.map(cat => (
    <div key={cat}>
      {multiCat && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px 4px' }}>
          <span style={{ fontSize:12 }}>{CAT_ICONS[cat]||'📦'}</span>
          <span style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{cat}</span>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
          <span style={{ fontSize:10, color:'var(--text3)' }}>{catGrouped[cat].length}</span>
        </div>
      )}
      {catGrouped[cat].map(item => (
        <EventItemRow key={item.id} item={item} onToggleLoaded={toggleLoaded} onToggleReturned={toggleReturned} onRemove={removeFromEvent} onEdit={setEditItem} onToggleMancante={toggleMancante} />
      ))}
    </div>
  ))

  return (
    <div className="page">
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <button onClick={() => navigate(-1)} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← Indietro</button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportPDF}
              style={{ background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', color:'var(--accent)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              PDF
            </button>
          <button
            onClick={() => navigate(`/events/${id}/scan`)}
            style={{ background:'linear-gradient(135deg,rgba(79,195,247,0.2),rgba(79,195,247,0.08))', border:'1px solid rgba(79,195,247,0.35)', color:'var(--blue)', borderRadius:10, padding:'8px 14px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg>
            Inizia a caricare
          </button>
          </div>
        </div>

        {/* Nome evento + badge installazione + tasto ℹ️ note */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <h1 style={{ fontSize:22, fontWeight:800 }}>{event.name}</h1>
              {event.type === 'installation' && (
                <span style={{ background:'rgba(90,82,201,0.15)', color:'#7c6fcd', border:'1px solid rgba(90,82,201,0.3)', borderRadius:8, padding:'2px 10px', fontSize:11, fontWeight:800, flexShrink:0 }}>🔧 INSTALLAZIONE</span>
              )}
            </div>
            <div style={{ marginTop:2 }}>
              <DateBadge dateStr={event.date} dateEndStr={event.dateEnd} location={event.location} today={today} />
            </div>
            {event.phases && ['montaggio','smontaggio'].some(k => event.phases[k]) && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                {[
                  { key:'montaggio',  label:'Montaggio',  color:'#2563eb', bg:'#dbeafe' },
                  { key:'smontaggio', label:'Smontaggio', color:'#ea580c', bg:'#ffedd5' },
                ].filter(p => event.phases[p.key]).map(p => {
                  const isToday = event.phases[p.key] === today
                  return (
                    <span key={p.key} style={{ display:'inline-flex', alignItems:'center', gap:5, background: isToday ? p.color : p.bg, color: isToday ? 'white' : p.color, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800, border: isToday ? 'none' : `1px solid ${p.color}33` }}>
                      {p.label} · {new Date(event.phases[p.key]+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}
                      {isToday && ' · OGGI'}
                    </span>
                  )
                })}
              </div>
            )}
            {/* Worker assegnati */}
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:8 }}>
              {(event.assignedWorkers || []).map(wid => {
                const w = workers.find(x => x.id === wid)
                if (!w) return null
                const unavail = isWorkerUnavailable(wid)
                return (
                  <span key={wid} style={{ display:'inline-flex', alignItems:'center', gap:5, background: unavail ? 'rgba(216,56,63,0.12)' : 'rgba(79,195,247,0.12)', border: `1px solid ${unavail ? 'rgba(216,56,63,0.35)' : 'rgba(79,195,247,0.3)'}`, borderRadius:20, padding:'3px 6px 3px 10px', fontSize:12, fontWeight:700, color: unavail ? 'var(--red)' : 'var(--blue)' }}>
                    {unavail ? '⚠️' : '👷'} {w.name}
                    <button onClick={() => toggleWorkerAssignment(wid)} style={{ width:16, height:16, borderRadius:'50%', background: unavail ? 'rgba(216,56,63,0.2)' : 'rgba(79,195,247,0.25)', color: unavail ? 'var(--red)' : 'var(--blue)', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </span>
                )
              })}
              <button
                onClick={() => setShowAssignModal(true)}
                style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--card2)', border:'1px dashed var(--border)', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, color:'var(--text2)' }}
              >
                + Assegna
              </button>
            </div>
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

        {/* Pannello note espandibile - scorre sotto il titolo, non copre tutto */}
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

      {event.fromArchive && (
        <div style={{ padding:'10px 16px', background:'rgba(79,195,247,0.08)', borderBottom:'1px solid rgba(79,195,247,0.2)' }}>
          <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700 }}>📋 Creato da template — ricordati di aggiornare la data tramite il tasto ✏️ nella pagina eventi.</p>
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
        {mancanti > 0 && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(234,88,12,0.08)', border:'1px solid rgba(234,88,12,0.25)', borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <p style={{ color:'#ea580c', fontSize:13, fontWeight:700 }}>{mancanti} articol{mancanti===1?'o':'i'} mancant{mancanti===1?'e':'i'} — da reperire o aggiungere</p>
          </div>
        )}

        {/* Bottone chiudi installazione */}
        {event.type === 'installation' && (
          <button
            onClick={async () => {
              if (!confirm(`Chiudere l'installazione e ripristinare la giacenza di tutti gli articoli?`)) return
              for (const item of eventItems) {
                if (item.loaded && !item.returned && !item.isExtra) {
                  try {
                    const itemRef = doc(db, 'items', item.id)
                    const snap = await getDoc(itemRef)
                    if (snap.exists()) {
                      const current = snap.data()
                      const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
                      await updateDoc(itemRef, { availableQty: Math.min(maxAvail, (current.availableQty||0) + (item.qty||1)) })
                    }
                  } catch(e) { console.error(e) }
                }
              }
              await updateDoc(doc(db, 'events', id), { archived: true })
              navigate('/events')
            }}
            style={{ width:'100%', marginTop:12, padding:'13px', borderRadius:12,
              background:'rgba(90,82,201,0.12)', border:'1px solid rgba(90,82,201,0.3)',
              color:'#7c6fcd', fontWeight:700, fontSize:14,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}
          >
            ✅ Chiudi installazione e ripristina giacenza
          </button>
        )}
      </div>

      {/* Lista articoli */}
      <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {eventItems.length === 0
          ? <div className="empty-state" style={{ padding:'40px 20px' }}>
              <p style={{ fontSize:32 }}>📋</p>
              <h3>Lista vuota</h3>
              <p>Aggiungi articoli alla lista di carico</p>
            </div>
          : <>{groupedEventItems}</>
        }
      </div>

      <div style={{ padding:'16px', display:'flex', gap:10 }}>
        <button onClick={openAddModal} className="btn btn-secondary" style={{ flex:2 }}>
          + Aggiungi dalla lista
        </button>
        <button onClick={() => setShowExtraModal(true)} className="btn btn-secondary" style={{ flex:1, borderColor:'rgba(245,166,35,0.4)', color:'var(--accent2)' }}>
          + Extra
        </button>
      </div>

      {showAddItem && (
        <div className="modal-overlay" onClick={addItemDrag.onOverlayClick}>
          <div className={`modal${addItemDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative', maxHeight:'60dvh', display:'flex', flexDirection:'column', padding:0 }} {...addItemDrag.props}>

            {/* Header fisso */}
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ margin:0, fontSize:18 }}>Aggiungi alla lista</h2>
                <button className="close-btn" onClick={() => setShowAddItem(false)}>✕</button>
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
              {/* Toggle mancanti */}
              <button
                className="btn-no-anim"
                onClick={() => setAddAsMancante(v => !v)}
                style={{ marginTop:10, width:'100%', padding:'10px 14px', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between',
                  background: addAsMancante ? 'rgba(234,88,12,0.08)' : 'var(--card2)',
                  border: addAsMancante ? '1.5px solid rgba(234,88,12,0.35)' : '1.5px solid var(--border)',
                  transition:'all 0.15s',
                }}
              >
                <span style={{ fontSize:13, fontWeight:700, color: addAsMancante ? '#ea580c' : 'var(--text2)' }}>
                  ⚠️ Segna come mancanti
                </span>
                <span style={{ width:36, height:20, borderRadius:10, background: addAsMancante ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: addAsMancante ? 'flex-end' : 'flex-start' }}>
                  <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
                </span>
              </button>
            </div>

            {/* Carrello selezionati (se ci sono) */}
            {cart.length > 0 && (
              <div style={{ background:'rgba(105,240,174,0.06)', borderBottom:'1px solid rgba(105,240,174,0.2)', padding:'10px 16px', flexShrink:0 }}>
                <p style={{ color:'var(--green)', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
                  ✅ Selezionati - {cart.length} articol{cart.length === 1 ? 'o' : 'i'}
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
                    alreadyInList={eventItems.some(e => e.id === item.id)}
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

      {/* Modal aggiunta extra */}
      {showExtraModal && (
        <div className="modal-overlay" onClick={extraDrag.onOverlayClick}>
          <div className={`modal${extraDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative' }} {...extraDrag.props}>
            <button className="close-btn" onClick={() => setShowExtraModal(false)}>✕</button>
            <h2>+ Oggetto extra</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>Non influisce sulla giacenza in magazzino — usalo per noleggi, adattatori dell'ultimo minuto, ecc.</p>
            <div className="form-group">
              <label>Nome *</label>
              <input value={extraForm.name} onChange={e => setExtraForm({...extraForm, name:e.target.value})} placeholder="es. Faro a noleggio, Adattatore HDMI..." autoFocus />
            </div>
            <div className="form-group">
              <label>Quantità</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => setExtraForm(f => ({...f, qty:Math.max(1,f.qty-1)}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                <input type="number" min="1" value={extraForm.qty}
                  onChange={e => setExtraForm(f => ({...f, qty:Math.max(1,parseInt(e.target.value)||1)}))}
                  style={{ textAlign:'center', fontWeight:800, fontSize:16, width:60, padding:'6px 4px' }} />
                <button onClick={() => setExtraForm(f => ({...f, qty:f.qty+1}))}
                  style={{ width:36, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
              </div>
            </div>
            <div className="form-group">
              <label>Note (opzionale)</label>
              <input value={extraForm.notes} onChange={e => setExtraForm({...extraForm, notes:e.target.value})} placeholder="es. Da restituire entro le 20:00" />
            </div>
            <button onClick={addExtraItem} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!extraForm.name.trim()}>
              ✅ Aggiungi alla lista
            </button>
          </div>
        </div>
      )}

      {/* Modal assegnazione worker */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={assignDrag.onOverlayClick}>
          <div className={`modal${assignDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative' }} {...assignDrag.props}>
            <button className="close-btn" onClick={() => setShowAssignModal(false)}>✕</button>
            <h2>👷 Assegna magazzinieri</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>Seleziona chi deve occuparsi di questo evento. Puoi assegnarne più di uno.</p>
            {workers.length === 0 ? (
              <p style={{ color:'var(--text2)', fontSize:13, fontStyle:'italic', textAlign:'center', padding:'20px 0' }}>Nessun magazziniere registrato.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'50dvh', overflowY:'auto' }}>
                {workers.map(w => {
                  const isAssigned = (event.assignedWorkers || []).includes(w.id)
                  const unavail = isWorkerUnavailable(w.id)
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleWorkerAssignment(w.id)}
                      style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12,
                        background: isAssigned ? 'rgba(79,195,247,0.10)' : 'var(--card2)',
                        border: `1.5px solid ${isAssigned ? 'rgba(79,195,247,0.4)' : 'var(--border)'}`,
                        textAlign:'left',
                      }}
                    >
                      <span style={{ fontSize:22 }}>👷</span>
                      <span style={{ flex:1, minWidth:0 }}>
                        <span style={{ display:'block', fontWeight:700, fontSize:14, color:'var(--text)' }}>{w.name}</span>
                        {unavail && <span style={{ display:'block', fontSize:11, color:'var(--red)', fontWeight:700, marginTop:1 }}>⚠️ Non disponibile in questa data</span>}
                      </span>
                      <span style={{
                        width:22, height:22, borderRadius:'50%', flexShrink:0,
                        background: isAssigned ? 'var(--blue)' : 'transparent',
                        border: `2px solid ${isAssigned ? 'var(--blue)' : 'var(--border)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'white', fontSize:13, fontWeight:900,
                      }}>
                        {isAssigned ? '✓' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <button onClick={() => setShowAssignModal(false)} className="btn btn-primary btn-full" style={{ marginTop:16 }}>
              Fatto
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet modifica oggetto */}
      {editItem && (
        <div className="modal-overlay" onClick={itemEditDrag.onOverlayClick}>
          <div className={`modal${itemEditDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative' }} {...itemEditDrag.props}>
            <button className="close-btn" onClick={() => setEditItem(null)}>✕</button>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>Modifica oggetto</p>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>{editItem.name}</h2>

            <div className="form-group">
              <label>Quantità</label>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <button
                  onClick={() => setEditItem(ei => ({ ...ei, qty: Math.max(1, ei.qty - 1) }))}
                  style={{ width:44, height:44, borderRadius:12, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
                <span style={{ flex:1, textAlign:'center', fontWeight:800, fontSize:24, color:'var(--text)' }}>{editItem.qty}</span>
                <button
                  onClick={() => setEditItem(ei => ({ ...ei, qty: ei.qty + 1 }))}
                  style={{ width:44, height:44, borderRadius:12, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
              </div>
            </div>

            <div className="form-group">
              <label>Nota per questo evento</label>
              <input
                value={editItem.eventNote || ''}
                onChange={e => setEditItem(ei => ({ ...ei, eventNote: e.target.value }))}
                placeholder="es. Portare cavo di ricambio, controllare connettori..."
              />
            </div>

            <button
              className="btn-no-anim"
              onClick={() => setEditItem(ei => ({ ...ei, mancante: !ei.mancante }))}
              style={{ width:'100%', marginBottom:12, padding:'11px 14px', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between',
                background: editItem.mancante ? 'rgba(234,88,12,0.08)' : 'var(--card2)',
                border: editItem.mancante ? '1.5px solid rgba(234,88,12,0.35)' : '1.5px solid var(--border)',
              }}
            >
              <span style={{ fontSize:13, fontWeight:700, color: editItem.mancante ? '#ea580c' : 'var(--text2)' }}>⚠️ Articolo mancante</span>
              <span style={{ width:36, height:20, borderRadius:10, background: editItem.mancante ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: editItem.mancante ? 'flex-end' : 'flex-start' }}>
                <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
              </span>
            </button>

            <button
              onClick={() => saveItemEdit(editItem)}
              className="btn btn-primary btn-full"
              style={{ marginTop:8 }}>
              Salva
            </button>

            <button
              onClick={async () => { setEditItem(null); await removeFromEvent(editItem.id) }}
              style={{ width:'100%', marginTop:10, padding:'12px', borderRadius:10, background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', fontWeight:700, fontSize:14 }}>
              Rimuovi dalla lista
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddItemRow({ item, onAdd, icon, inCart, cartQty, alreadyInList }) {
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
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
          <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
          {item.isKit && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>KIT</span>}
          {item.isBundle && <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>🧰 BUNDLE</span>}
          {alreadyInList && !inCart && <span style={{ background:'rgba(234,88,12,0.10)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>⚠️ Già in lista — verrà aggiunta come mancante</span>}
          {alreadyInList && inCart && <span style={{ background:'rgba(234,88,12,0.10)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>⚠️ Riga mancante separata</span>}
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
function EventItemRow({ item, onToggleLoaded, onToggleReturned, onRemove, onEdit, onToggleMancante }) {
  const [location, setLocation] = useState(item.location || null)
  const [warehouseNotes, setWarehouseNotes] = useState(null)

  useEffect(() => {
    getDoc(doc(db, 'items', item.id)).then(snap => {
      if (snap.exists()) {
        setLocation(snap.data().location || null)
        setWarehouseNotes(snap.data().notes || null)
      }
    }).catch(() => {})
  }, [item.id])

  return (
    <div style={{ borderBottom:'1px solid var(--border)', background: item.mancante ? 'rgba(234,88,12,0.04)' : 'transparent', borderLeft: item.mancante ? '3px solid #ea580c' : '3px solid transparent' }}>
      <div
        style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
        onClick={() => onEdit({ id: item.id, name: item.name, qty: item.qty || 1, eventNote: item.eventNote || '', mancante: item.mancante || false })}
      >
        <div style={{ fontSize:24 }}>{ICONS[item.category] || '📦'}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
            <p style={{ fontWeight:700, fontSize:15 }}>{item.name}</p>
            {item.isExtra && (
              <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.35)', borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, flexShrink:0 }}>EXTRA</span>
            )}
            {item.mancante && (
              <span style={{ background:'rgba(234,88,12,0.12)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.3)', borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, flexShrink:0 }}>⚠️ MANCA</span>
            )}
          </div>
          <p style={{ color:'var(--text2)', fontSize:13 }}>qty: {item.qty || 1}</p>
          {item.eventNote ? (
            <p style={{ color:'var(--accent2)', fontSize:12, marginTop:3, fontStyle:'italic' }}>📝 {item.eventNote}</p>
          ) : warehouseNotes ? (
            <p style={{ color:'var(--text3)', fontSize:11, marginTop:3, fontStyle:'italic' }}>💡 {warehouseNotes}</p>
          ) : null}
          {location ? (
            <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.22)', borderRadius:6, padding:'3px 8px' }}>
              <span style={{ fontSize:11 }}>📍</span>
              <span style={{ color:'var(--blue)', fontSize:12, fontWeight:700 }}>{location}</span>
            </div>
          ) : (
            <p style={{ color:'var(--text3)', fontSize:11, marginTop:4, fontStyle:'italic' }}>Posizione non specificata</p>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onToggleLoaded(item.id)}
            style={{ background: item.loaded ? 'rgba(245,166,35,0.15)' : 'var(--card2)', color: item.loaded ? 'var(--accent2)' : 'var(--text2)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center' }}>
            {item.loaded ? '🚛 Caricato' : '○ Da caricare'}
          </button>
          <button onClick={() => onToggleReturned(item.id)} disabled={!item.loaded}
            style={{ background: item.returned ? 'rgba(105,240,174,0.15)' : item.loaded ? 'var(--card2)' : 'transparent', color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--border)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center', opacity: item.loaded ? 1 : 0.4 }}>
            {item.returned ? '✅ Rientrato' : '○ Da rientrare'}
          </button>
        </div>
      </div>
    </div>
  )
}
