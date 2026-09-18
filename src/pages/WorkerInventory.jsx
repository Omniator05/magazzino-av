import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, where, getDocs } from 'firebase/firestore'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useAuth } from '../context/AuthContext'
import { Pin, Cart, Box, Wrench, Warn, Check, Filter, Kit } from '../components/Icon'
import { parseScannedCode } from '../utils/generateCode'
import DailyQuip from '../components/DailyQuip'

// Stessa lista di Inventory.jsx (vista admin) — usata qui solo per il
// filtro categoria del menu filtri avanzati, vedi sotto.
const CATEGORIES = ['Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti','Altro']
const ICONS = {
  'Audio':    '🔊',
  'Video':    '📺',
  'Luci':     '🔦',
  'Rigging':  '⛓️',
  'Corrente': '⚡',
  'Effetti':  '🎉',
  'Consumabili': '🪣',
  'Microfoni':   '🎤',
  'Traduzione':  '🌐',
  'Connettività':'📶',
  'Comunicazione':'📡',
  'Strumenti':   '🎸',
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
  const { t } = useTranslation()
  const { teamId } = useAuth()
  const [items, setItems]   = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const html5QrRef = useRef(null)

  // Filtri avanzati (ordina/categoria/posizione/solo kit) — stesso pannello
  // e stessa logica della vista admin in Inventory.jsx, qui applicati sopra
  // alla ricerca testo + ai chip rapidi già esistenti qui sotto.
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [filterMenuMounted, setFilterMenuMounted] = useState(false)
  const [filterMenuEntered, setFilterMenuEntered] = useState(false)
  const [filterMenuPos, setFilterMenuPos] = useState(null)
  const filterButtonRef = useRef(null)
  const [sortBy, setSortBy] = useState('')       // '' | 'az' | 'za' | 'qty'
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterKitOnly, setFilterKitOnly] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [teamId])

  // Menu filtri: resta montato durante il fade out (stesso pattern di
  // Inventory.jsx) così l'animazione a cascata gira anche in chiusura.
  useEffect(() => {
    if (showFilterMenu) {
      setFilterMenuMounted(true)
      const id = requestAnimationFrame(() => setFilterMenuEntered(true))
      return () => cancelAnimationFrame(id)
    }
    setFilterMenuEntered(false)
    setCategoryPickerOpen(false)
    const timeout = setTimeout(() => setFilterMenuMounted(false), 200)
    return () => clearTimeout(timeout)
  }, [showFilterMenu])

  // Su telefono, aprire la tastiera per scrivere nel campo posizione fa
  // scorrere la pagina per portare il campo in vista — non è l'utente che
  // sta scorrendo la pagina, quindi mentre si scrive lì dentro (l'input ha
  // il focus) lo scroll non deve chiudere il pannello (stesso fix di
  // Inventory.jsx).
  useEffect(() => {
    if (!showFilterMenu) return
    const closeOnScroll = () => {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      setShowFilterMenu(false)
    }
    window.addEventListener('scroll', closeOnScroll)
    return () => window.removeEventListener('scroll', closeOnScroll)
  }, [showFilterMenu])

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

  const uniqueLocations = [...new Set(items.map(i => i.location).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const advancedFiltersActive = !!(sortBy || filterCategory || filterLocation || filterKitOnly)
  const advancedFiltered = filtered.filter(i => {
    if (filterCategory && i.category !== filterCategory) return false
    if (filterLocation && !(i.location || '').toLowerCase().includes(filterLocation.trim().toLowerCase())) return false
    if (filterKitOnly && !i.isBundle) return false
    return true
  })
  const sortedFlat = [...advancedFiltered].sort((a, b) => {
    if (sortBy === 'za') return (b.name || '').localeCompare(a.name || '')
    if (sortBy === 'qty') return (b.totalQty || 0) - (a.totalQty || 0)
    return (a.name || '').localeCompare(b.name || '') // default e 'az': alfabetico
  })
  const clearAdvancedFilters = () => { setSortBy(''); setFilterCategory(''); setFilterLocation(''); setFilterKitOnly(false) }
  const displayItems = advancedFiltersActive ? sortedFlat : filtered

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

  // ── Scanner: trova un oggetto dal suo codice e apre il dettaglio ──
  const openScanner = () => { setShowScanner(true); setScanError(null) }

  const closeScanner = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop() } catch(e) {}
      try { html5QrRef.current.clear() } catch(e) {}
    }
    setShowScanner(false)
    setScanning(false)
    setScanError(null)
  }

  const startInventoryScanner = async () => {
    setScanError(null); setScanning(true)
    await new Promise(resolve => setTimeout(resolve, 80))
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (html5QrRef.current) {
        try { await html5QrRef.current.stop() } catch(e) {}
        try { html5QrRef.current.clear() } catch(e) {}
      }
      html5QrRef.current = new Html5Qrcode('qr-inventory', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
      })
      await html5QrRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.85)
            return { width: size, height: size }
          },
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }],
          },
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        async decodedText => {
          const { baseCode } = parseScannedCode(decodedText)
          const q = query(collection(db, 'items'), where('teamId', '==', teamId), where('code', '==', baseCode))
          const snap = await getDocs(q)
          if (snap.empty) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100])
            setScanError(t('workerInventory.notFoundWithCode', { code: baseCode }))
            return
          }
          const found = { id: snap.docs[0].id, ...snap.docs[0].data() }
          if (navigator.vibrate) navigator.vibrate([60, 40, 120])
          await closeScanner()
          setDetail(found)
        },
        () => {}
      )
    } catch(e) {
      setScanning(false)
      setScanError(t('workerInventory.cameraError'))
    }
  }

  useEffect(() => () => { if (html5QrRef.current) { try { html5QrRef.current.stop() } catch(e) {} } }, [])

  // ESC chiude il modal aperto (scanner o dettaglio)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (showScanner) closeScanner()
      else if (detail) setDetail(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showScanner, detail])

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>{t('inventory.title')}</h1>
            <p>{t('inventory.itemsCount', { count: items.length })}</p>
          </div>
          <button onClick={openScanner} className="btn btn-secondary" style={{ padding:'10px 14px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
            {t('workerInventory.scan')}
          </button>
        </div>
      </div>

      {/* Barra ricerca + filtri avanzati */}
      <div className="search-bar" style={{ position:'relative', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inventory.searchPlaceholder')} />
        </div>

        {/* Menu filtri avanzati (ordina/categoria/posizione/kit) — stesso
            pannello in portal della vista admin, vedi Inventory.jsx. */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <button
            ref={filterButtonRef}
            onClick={() => {
              if (!showFilterMenu && filterButtonRef.current) {
                const r = filterButtonRef.current.getBoundingClientRect()
                setFilterMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
              }
              setShowFilterMenu(v => !v)
            }}
            aria-label={t('inventory.filterButtonLabel')}
            className="btn btn-secondary"
            style={{ position:'relative', width:44, height:44, padding:0, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
          >
            <Filter size={17} />
            {advancedFiltersActive && (
              <span style={{ position:'absolute', top:-3, right:-3, width:10, height:10, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 2px 5px rgba(0,0,0,0.3)' }} />
            )}
          </button>
          {filterMenuMounted && filterMenuPos && createPortal((() => {
            const CASCADE_STEP = 26
            const CASCADE_BLOCKS = 5 // ordina, categoria, posizione, kit, cancella
            const cascade = index => ({
              opacity: filterMenuEntered ? 1 : 0,
              transform: filterMenuEntered ? 'translateY(0)' : 'translateY(-6px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              transitionDelay: filterMenuEntered ? `${index * CASCADE_STEP}ms` : `${(CASCADE_BLOCKS - 1 - index) * CASCADE_STEP}ms`,
            })
            return (
              <>
                <div onClick={() => setShowFilterMenu(false)} style={{ position:'fixed', inset:0, zIndex:99 }} />
                <div style={{
                  position:'fixed', top:filterMenuPos.top, right:filterMenuPos.right, zIndex:100,
                  background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.18)', width:250, padding:14,
                  maxHeight:'70vh', overflowY:'auto',
                  opacity: filterMenuEntered ? 1 : 0,
                  transition:'opacity 150ms ease',
                }}>
                  <div style={cascade(0)}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('inventory.filterSortLabel')}</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:14 }}>
                      {[
                        { key:'az',  label:t('inventory.filterSortAZ') },
                        { key:'za',  label:t('inventory.filterSortZA') },
                        { key:'qty', label:t('inventory.filterSortQty') },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setSortBy(s => s === opt.key ? '' : opt.key)}
                          aria-pressed={sortBy === opt.key}
                          className="btn-no-anim"
                          style={{
                            width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, fontSize:13, fontWeight:600,
                            background: sortBy === opt.key ? 'var(--card2)' : 'transparent',
                            color: sortBy === opt.key ? 'var(--accent)' : 'var(--text)',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={cascade(1)}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{t('inventory.filterCategoryLabel')}</p>
                    <button
                      onClick={() => setCategoryPickerOpen(o => !o)}
                      aria-expanded={categoryPickerOpen}
                      className="btn-no-anim"
                      style={{
                        width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'9px 10px', borderRadius:8, fontSize:13, fontWeight:600, marginBottom: categoryPickerOpen ? 6 : 14,
                        background:'var(--card2)', border:'1px solid var(--border)',
                        color: filterCategory ? 'var(--text)' : 'var(--text2)',
                      }}
                    >
                      <span style={{ display:'flex', alignItems:'center', gap:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {filterCategory || t('inventory.filterAllCategories')}
                      </span>
                      <span style={{ flexShrink:0, fontSize:10, color:'var(--text2)', transition:'transform 0.15s', transform: categoryPickerOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </button>
                    {categoryPickerOpen && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
                        <button
                          onClick={() => { setFilterCategory(''); setCategoryPickerOpen(false) }}
                          aria-pressed={filterCategory === ''}
                          className="btn-no-anim"
                          style={{
                            padding:'7px 8px', borderRadius:8, fontSize:11.5, fontWeight:700, textAlign:'left',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            background: filterCategory === '' ? 'var(--accent)' : 'var(--card2)',
                            color: filterCategory === '' ? '#fff' : 'var(--text2)',
                            border: `1px solid ${filterCategory === '' ? 'var(--accent)' : 'var(--border)'}`,
                          }}
                        >
                          {t('inventory.filterAllCategories')}
                        </button>
                        {CATEGORIES.map(c => (
                          <button
                            key={c}
                            onClick={() => { setFilterCategory(fc => fc === c ? '' : c); setCategoryPickerOpen(false) }}
                            aria-pressed={filterCategory === c}
                            className="btn-no-anim"
                            style={{
                              padding:'7px 8px', borderRadius:8, fontSize:11.5, fontWeight:700,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                              background: filterCategory === c ? 'var(--accent)' : 'var(--card2)',
                              color: filterCategory === c ? '#fff' : 'var(--text2)',
                              border: `1px solid ${filterCategory === c ? 'var(--accent)' : 'var(--border)'}`,
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={cascade(2)}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{t('inventory.filterLocationLabel')}</p>
                    <input
                      list="worker-inventory-filter-locations"
                      value={filterLocation}
                      onChange={e => setFilterLocation(e.target.value)}
                      placeholder={t('inventory.filterLocationPlaceholder')}
                      style={{ fontSize:13, marginBottom:14 }}
                    />
                    <datalist id="worker-inventory-filter-locations">
                      {uniqueLocations.map(loc => <option key={loc} value={loc} />)}
                    </datalist>
                  </div>

                  <div style={cascade(3)}>
                    <button
                      onClick={() => setFilterKitOnly(v => !v)}
                      aria-pressed={filterKitOnly}
                      className="btn-no-anim"
                      style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 10px', borderRadius:8, background: filterKitOnly ? 'rgba(245,166,35,0.10)' : 'var(--card2)', border: filterKitOnly ? '1.5px solid rgba(245,166,35,0.35)' : '1.5px solid var(--border)' }}
                    >
                      <span style={{ fontSize:13, fontWeight:700, color: filterKitOnly ? 'var(--accent2)' : 'var(--text2)', display:'flex', alignItems:'center', gap:6 }}><Kit size={14} /> {t('inventory.filterKitOnly')}</span>
                      <span style={{ width:34, height:19, borderRadius:10, background: filterKitOnly ? 'var(--accent2)' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', justifyContent: filterKitOnly ? 'flex-end' : 'flex-start' }}>
                        <span style={{ width:13, height:13, borderRadius:'50%', background:'white', display:'block' }} />
                      </span>
                    </button>
                  </div>

                  {advancedFiltersActive && (
                    <div style={cascade(4)}>
                      <button onClick={clearAdvancedFilters} className="btn-no-anim" style={{ width:'100%', marginTop:14, padding:'9px 10px', borderRadius:8, background:'transparent', color:'var(--red)', fontSize:13, fontWeight:700, textAlign:'center' }}>
                        {t('inventory.filterClear')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )
          })(), document.body)}
        </div>
      </div>

      {/* Filtri - scrollabili */}
      <div style={{ overflowX:'auto', background:'var(--bg2)', borderBottom:'1px solid var(--border)', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <div style={{ display:'flex', gap:8, padding:'10px 16px', width:'max-content', minWidth:'100%' }}>
        {[
          { key:'all',    label:t('inventory.filterAll'),      count: items.length },
          { key:'out',     label:t('inventory.filterOut'),         count: countOut,    color:'var(--accent2)', bg:'rgba(245,166,35,0.12)', border:'rgba(245,166,35,0.3)' },
          { key:'broken',  label:t('inventory.filterBroken'),         count: countBroken, color:'var(--red)',     bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)' },
          { key:'reorder', label:t('inventory.filterReorder'), count: countReorder,color:'var(--blue)',    bg:'rgba(79,195,247,0.12)',  border:'rgba(79,195,247,0.3)' },
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
        {displayItems.length === 0
          ? <div className="empty-state">
              <p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={42} /></p><h3>{t('workerInventory.emptyTitle')}</h3>
              {/* Stesso motivo dell'omologa in Inventory.jsx: solo a
                  magazzino davvero vuoto, non su un filtro senza risultati. */}
              {items.length === 0 && <DailyQuip quips={t('inventory.emptyQuips', { returnObjects:true })} />}
            </div>
          : displayItems.map(item => {
            const avail = item.availableQty ?? item.totalQty
            const isBroken = (item.brokenQty || 0) > 0
            const isOut    = avail < item.totalQty && !isBroken
            return (
              <div key={item.id} className="item-row" onClick={() => setDetail(item)}>
                <div className="item-icon" style={{ fontSize:22 }}>{ICONS[item.category] || '📦'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{item.name}</p>
                  <p style={{ color:'var(--text2)', fontSize:13 }}>{item.brand} {item.model}</p>
                  {item.location && <p style={{ color:'var(--blue)', fontSize:12, marginTop:2, display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {item.location}</p>}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <span style={{ fontWeight:800, fontSize:15, color: avail === item.totalQty ? 'var(--green)' : avail === 0 ? 'var(--red)' : 'var(--accent2)' }}>
                    {avail}/{item.totalQty}{item.category === 'Consumabili' ? ` ${t(`inventory.unitShort_${item.consumableUnit || 'pezzi'}`)}` : ''}
                  </span>
                  {isBroken && <div style={{ marginTop:4 }}><span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}><Wrench size={11} /> {t('inventory.brokenCount', { count: item.brokenQty })}</span></div>}
                  {isOut    && <div style={{ marginTop:4 }}><span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700 }}>{t('inventory.out')}</span></div>}
                  {item.category === 'Consumabili' && item.minStock > 0 && avail <= item.minStock && (
                    <div style={{ marginTop:4 }}><span style={{ background:'rgba(79,195,247,0.15)', color:'var(--blue)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}><Cart size={11} /> {t('inventory.toReorder')}</span></div>
                  )}
                  <p style={{ color:'var(--text2)', fontSize:11, marginTop:4 }}>{item.category}</p>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Scanner: trova un oggetto trovato/disperso tramite il suo codice */}
      {showScanner && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeScanner()}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={closeScanner}>✕</button>
            <h2>{t('workerInventory.scanModalTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>
              {t('workerInventory.scanModalDesc')}
            </p>

            {/* qr-inventory SEMPRE nel DOM - Html5Qrcode ne ha bisogno al momento dell'init */}
            <div id="qr-inventory" style={{ width:'100%', borderRadius:12, overflow:'hidden', background: scanning ? '#000' : 'transparent', minHeight: scanning ? 240 : 0 }} />

            {!scanning && (
              <button onClick={startInventoryScanner} style={{
                width:'100%', padding:'40px 16px', borderRadius:14,
                background:'rgba(79,195,247,0.08)', border:'2px dashed rgba(79,195,247,0.3)',
                display:'flex', flexDirection:'column', alignItems:'center', gap:10,
              }}>
                <span style={{ fontSize:36 }}>📷</span>
                <span style={{ fontWeight:800, fontSize:16, color:'var(--text)' }}>{t('scanner.startCamera')}</span>
                <span style={{ fontSize:12, color:'var(--text2)' }}>{t('scanner.aimCode')}</span>
              </button>
            )}

            {scanError && (
              <div style={{ marginTop:14, background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, padding:'12px 14px' }}>
                <p style={{ color:'var(--red)', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Warn size={14} /> {scanError}</p>
              </div>
            )}

            {scanning && (
              <button onClick={closeScanner} className="btn btn-secondary btn-full" style={{ marginTop:14 }}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}

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
                <span style={{ color:'var(--text2)', fontSize:14 }}>{t('inventory.detailAvailable')}</span>
                <span style={{ fontWeight:800, fontSize:18 }}>{detail.availableQty}/{detail.totalQty}</span>
              </div>
              <div style={{ background:'var(--card2)', borderRadius:4, height:8, overflow:'hidden', display:'flex' }}>
                <div style={{ background:'var(--green)', width:`${((detail.availableQty||0)/(detail.totalQty||1))*100}%`, transition:'width 0.3s' }} />
                {(detail.brokenQty||0) > 0 && <div style={{ background:'var(--red)', width:`${((detail.brokenQty||0)/(detail.totalQty||1))*100}%` }} />}
              </div>
              <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'var(--green)' }}>● {detail.availableQty} {t('inventory.available')}</span>
                {((detail.totalQty||0)-(detail.availableQty||0)-(detail.brokenQty||0)) > 0 && <span style={{ fontSize:12, color:'var(--accent2)' }}>● {(detail.totalQty||0)-(detail.availableQty||0)-(detail.brokenQty||0)} {t('inventory.out')}</span>}
                {(detail.brokenQty||0) > 0 && <span style={{ fontSize:12, color:'var(--red)' }}>● {t('inventory.brokenCount', { count: detail.brokenQty })}</span>}
              </div>
            </div>

            {detail.location && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
                <p style={{ color:'var(--blue)', fontSize:14, display:'flex', alignItems:'center', gap:6 }}><Pin size={14} /> {detail.location}</p>
              </div>
            )}
            {detail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{detail.notes}</p>}

            {/* Azioni */}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>

              {/* Consumabili — aggiusta quantità */}
              {detail.category === 'Consumabili' && (
                <div style={{ marginBottom:14 }}>
                  <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>{t('workerInventory.stockQuantityTitle')}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
                    <button onClick={() => adjustConsumable(detail, -1)} disabled={(detail.availableQty??detail.totalQty) <= 0}
                      style={{ width:48, height:48, borderRadius:12, background:'rgba(233,69,96,0.12)', border:'1px solid rgba(233,69,96,0.3)', color:'var(--accent)', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, opacity:(detail.availableQty??detail.totalQty)<=0?0.35:1 }}>−</button>
                    <div style={{ textAlign:'center', minWidth:60 }}>
                      <p style={{ fontWeight:900, fontSize:32, color:'var(--text)', lineHeight:1 }}>{detail.availableQty ?? detail.totalQty}</p>
                      <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>{t(`inventory.unitShort_${detail.consumableUnit || 'pezzi'}`)} {t('workerInventory.available')}</p>
                    </div>
                    <button onClick={() => adjustConsumable(detail, 1)}
                      style={{ width:48, height:48, borderRadius:12, background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'var(--green)', fontSize:24, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
                  </div>
                  {detail.minStock > 0 && (detail.availableQty??detail.totalQty) <= detail.minStock && (
                    <div style={{ marginTop:10, background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                      <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}><Cart size={14} /> {t('workerInventory.lowStock')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Segnala problema — nascosto per i consumabili */}
              {detail.category !== 'Consumabili' && (
                <div>
                  <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>{t('workerInventory.reportProblem')}</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <button
                      onClick={() => markBroken(detail, 1)}
                      disabled={(detail.brokenQty||0) >= detail.totalQty}
                      style={{ padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)', color:'var(--red)', opacity:(detail.brokenQty||0)>=detail.totalQty?0.4:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <Wrench size={15} /> {t('workerInventory.markBroken')}
                    </button>
                    <button
                      onClick={() => markBroken(detail, -1)}
                      disabled={(detail.brokenQty||0) === 0}
                      style={{ padding:'12px', borderRadius:10, fontWeight:700, fontSize:14, background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'var(--green)', opacity:(detail.brokenQty||0)===0?0.4:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <Check size={15} /> {t('workerInventory.markRepaired')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
