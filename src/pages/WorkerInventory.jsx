import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'

const CATEGORIES = ['Audio','Video','Luci','Rigging','Kit','Altro']
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

export default function WorkerInventory() {
  const [items, setItems]   = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [])

  const countOut    = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)).length
  const countBroken = items.filter(i => (i.brokenQty || 0) > 0).length
  const countReorder = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock).length

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      i.name?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q) ||
      i.brand?.toLowerCase().includes(q)
    if (!matchSearch) return false
    if (filter === 'out')     return (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)
    if (filter === 'broken')  return (i.brokenQty || 0) > 0
    if (filter === 'reorder') return i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock
    return true
  })

  const markBroken = async (item, delta) => {
    const newBroken = Math.max(0, Math.min(item.totalQty, (item.brokenQty||0) + delta))
    const prevBroken = item.brokenQty || 0
    const prevOut = (item.totalQty||0) - (item.availableQty||0) - prevBroken
    const newAvailable = Math.max(0, item.totalQty - newBroken - prevOut)
    await updateDoc(doc(db, 'items', item.id), { brokenQty: newBroken, availableQty: newAvailable })
    setDetail(d => d?.id === item.id ? { ...d, brokenQty: newBroken, availableQty: newAvailable } : d)
  }

  // Aggiusta la qty di un consumabile (es. bombole usate)
  const adjustConsumable = async (item, delta) => {
    const newAvail = Math.max(0, (item.availableQty ?? item.totalQty) + delta)
    const newTotal = Math.max(newAvail, item.totalQty) // non scende mai sotto il disponibile
    // Se aggiungiamo, aumenta anche il totale
    const updates = delta > 0
      ? { availableQty: newAvail, totalQty: newAvail > item.totalQty ? newAvail : item.totalQty }
      : { availableQty: newAvail }
    await updateDoc(doc(db, 'items', item.id), updates)
    setDetail(d => d?.id === item.id ? { ...d, ...updates } : d)
    // Aggiorna anche la lista locale
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i))
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Magazzino</h1>
        <p>{items.length} articoli</p>
      </div>

      {/* Barra ricerca */}
      <div className="search-bar" style={{ position:'relative' }}>
        <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, categoria, marca..." />
      </div>

      {/* Filtri - scrollabili */}
      <div style={{ overflowX:'auto', background:'var(--bg2)', borderBottom:'1px solid var(--border)', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <div style={{ display:'flex', gap:8, padding:'10px 16px', width:'max-content', minWidth:'100%' }}>
        {[
          { key:'all',    label:'Tutti',      count: items.length },
          { key:'out',     label:'🚛 Fuori',        count: countOut,    color:'var(--accent2)', bg:'rgba(245,166,35,0.12)', border:'rgba(245,166,35,0.3)' },
          { key:'broken',  label:'🔴 Rotti',         count: countBroken, color:'var(--red)',     bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)' },
          { key:'reorder', label:'🛒 Da riordinare', count: countReorder,color:'var(--blue)',    bg:'rgba(79,195,247,0.12)',  border:'rgba(79,195,247,0.3)' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:700,
              background: filter === f.key ? (f.bg || 'var(--accent)') : 'var(--card2)',
              color: filter === f.key ? (f.color || '#fff') : 'var(--text2)',
              border: `1px solid ${filter === f.key ? (f.border || 'var(--accent)') : 'var(--border)'}`,
              display:'flex', alignItems:'center', gap:5 }}>
            {f.label}
            {f.count > 0 && <span style={{ background: filter === f.key ? 'rgba(0,0,0,0.15)' : 'var(--card3)', borderRadius:10, padding:'1px 6px', fontSize:11 }}>{f.count}</span>}
          </button>
        ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ paddingBottom:8 }}>
        {filtered.length === 0
          ? <div className="empty-state"><p style={{ fontSize:40 }}>📦</p><h3>Nessun articolo</h3></div>
          : filtered.map(item => {
            const avail = item.availableQty ?? item.totalQty
            const isBroken = (item.brokenQty || 0) > 0
            const isOut    = avail < item.totalQty && !isBroken
            return (
              <div key={item.id} className="item-row" onClick={() => setDetail(item)}>
                <div className="item-icon" style={{ fontSize:22 }}>{ICONS[item.category] || '📦'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{item.name}</p>
                  <p style={{ color:'var(--text2)', fontSize:13 }}>{item.brand} {item.model}</p>
                  {item.location && <p style={{ color:'var(--blue)', fontSize:12, marginTop:2 }}>📍 {item.location}</p>}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <span style={{ fontWeight:800, fontSize:15, color: avail === item.totalQty ? 'var(--green)' : avail === 0 ? 'var(--red)' : 'var(--accent2)' }}>
                    {avail}/{item.totalQty}
                  </span>
                  {isBroken && <div style={{ marginTop:4 }}><span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700 }}>🔴 {item.brokenQty} rott{item.brokenQty===1?'o':'i'}</span></div>}
                  {isOut    && <div style={{ marginTop:4 }}><span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700 }}>🚛 fuori</span></div>}
                  {item.category === 'Consumabili' && item.minStock > 0 && avail <= item.minStock && (
                    <div style={{ marginTop:4 }}><span style={{ background:'rgba(79,195,247,0.15)', color:'var(--blue)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700 }}>🛒 da riordinare</span></div>
                  )}
                  <p style={{ color:'var(--text2)', fontSize:11, marginTop:4 }}>{item.category}</p>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Dettaglio articolo */}
      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setDetail(null)}>x</button>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>{ICONS[detail.category] || '📦'}</div>
              <h2 style={{ fontSize:20 }}>{detail.name}</h2>
              {detail.brand && <p style={{ color:'var(--text2)', marginTop:4 }}>{detail.brand} {detail.model}</p>}
            </div>

            {/* Disponibilità */}
            <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ color:'var(--text2)', fontSize:14 }}>Disponibili</span>
                <span style={{ fontWeight:800, fontSize:18 }}>{detail.availableQty}/{detail.totalQty}</span>
              </div>
              <div style={{ background:'var(--card2)', borderRadius:4, height:8, overflow:'hidden', display:'flex' }}>
                <div style={{ background:'var(--green)', width:`${((detail.availableQty||0)/(detail.totalQty||1))*100}%`, transition:'width 0.3s' }} />
                {(detail.brokenQty||0) > 0 && <div style={{ background:'var(--red)', width:`${((detail.brokenQty||0)/(detail.totalQty||1))*100}%` }} />}
              </div>
              <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--green)' }}>● {detail.availableQty} disponibili</span>
                {((detail.totalQty||0)-(detail.availableQty||0)-(detail.brokenQty||0)) > 0 && <span style={{ fontSize:12, color:'var(--accent2)' }}>● {(detail.totalQty||0)-(detail.availableQty||0)-(detail.brokenQty||0)} fuori</span>}
                {(detail.brokenQty||0) > 0 && <span style={{ fontSize:12, color:'var(--red)' }}>● {detail.brokenQty} rott{detail.brokenQty===1?'o':'i'}</span>}
              </div>
            </div>

            {detail.location && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
                <p style={{ color:'var(--blue)', fontSize:14 }}>📍 {detail.location}</p>
              </div>
            )}
            {detail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{detail.notes}</p>}

            {/* Azioni */}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>

              {/* Consumabili — aggiusta quantità */}
              {detail.category === 'Consumabili' && (
                <div style={{ marginBottom:14 }}>
                  <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Quantità in magazzino</p>
                  <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
                    <button onClick={() => adjustConsumable(detail, -1)} disabled={(detail.availableQty??detail.totalQty) <= 0}
                      style={{ width:48, height:48, borderRadius:12, background:'rgba(233,69,96,0.12)', border:'1px solid rgba(233,69,96,0.3)', color:'var(--accent)', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, opacity:(detail.availableQty??detail.totalQty)<=0?0.35:1 }}>−</button>
                    <div style={{ textAlign:'center', minWidth:60 }}>
                      <p style={{ fontWeight:900, fontSize:32, color:'var(--text)', lineHeight:1 }}>{detail.availableQty ?? detail.totalQty}</p>
                      <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>disponibili</p>
                    </div>
                    <button onClick={() => adjustConsumable(detail, 1)}
                      style={{ width:48, height:48, borderRadius:12, background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'var(--green)', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
                  </div>
                  {detail.minStock > 0 && (detail.availableQty??detail.totalQty) <= detail.minStock && (
                    <div style={{ marginTop:10, background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                      <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700 }}>🛒 Scorta bassa — da riordinare</p>
                    </div>
                  )}
                </div>
              )}

              {/* Segnala problema */}
              <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>Segnala problema</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <button
                  onClick={() => markBroken(detail, 1)}
                  disabled={(detail.brokenQty||0) >= detail.totalQty}
                  style={{ padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)', color:'var(--red)', opacity:(detail.brokenQty||0)>=detail.totalQty?0.4:1 }}>
                  🔴 Segna rotto
                </button>
                <button
                  onClick={() => markBroken(detail, -1)}
                  disabled={(detail.brokenQty||0) === 0}
                  style={{ padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'var(--green)', opacity:(detail.brokenQty||0)===0?0.4:1 }}>
                  ✅ Segna riparato
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
