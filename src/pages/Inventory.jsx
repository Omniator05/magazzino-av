import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { generateItemCode, generateQRDataURL, generateBarcodeSVG, generateUnitCode, qrPayloadForCode } from '../utils/generateCode'
import { renderLabelPNG, downloadDataUrl, labelFilename } from '../utils/labelImage'
import { formatDate } from '../utils/formatDate'
import JSZip from 'jszip'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useModalDrag } from '../hooks/useModalDrag'
import { useCenteredModal } from '../hooks/useCenteredModal'
import { Pin, Cart, Box, Kit, Save, Wrench, Warn, Filter } from '../components/Icon'
import FabButton from '../components/FabButton'
import { parseCSV, mapRowsToItems } from '../utils/csvImport'
import { ensureInstanceList, kitHasIncompleteInstance } from '../utils/kitInstances'

const CATEGORIES =['Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti','Altro']
const KIT_CATEGORIES = CATEGORIES
// Ordine di visualizzazione nella lista raggruppata
const CATEGORY_ORDER = ['Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti','Altro']
const MAIN_CATS = ['Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti']
const ICONS = {
  'Audio':       '🔊',
  'Video':       '📺',
  'Luci':        '🔦',
  'Rigging':     '⛓️',
  'Corrente':    '⚡',
  'Effetti':     '🎉',
  'Consumabili': '🪣',
  'Microfoni':   '🎤',
  'Traduzione':  '🌐',
  'Connettività':'📶',
  'Comunicazione':'📡',
  'Strumenti':   '🎸',
  'Kit':         '🧰',
  'Altro':       '📦',
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
  const { t, i18n } = useTranslation()
  const { user, teamId } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
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
  const [showModal, setShowModal] = useState(false)
  const [showAddMenu, setShowAddMenu]   = useState(false)
  const [showKitModal, setShowKitModal]         = useState(false)
  const [showKitEditModal, setShowKitEditModal] = useState(false)
  const [editingKit, setEditingKit]             = useState(null)
  const [kitEditComponents, setKitEditComponents] = useState([])
  const [kitEditInstances, setKitEditInstances] = useState([])
  const [kitEditSearch, setKitEditSearch]       = useState('')
  const [kitForm, setKitForm]           = useState({ name:'', location:'', qty:1, category:'Altro' })
  const [kitComponents, setKitComponents] = useState([])
  const [kitSearch, setKitSearch]       = useState('')
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [showDetailEvents, setShowDetailEvents] = useState(false)
  const [qrUrl, setQrUrl] = useState(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showPrintPopup, setShowPrintPopup] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importStep, setImportStep] = useState('instructions') // instructions | preview | importing | done
  const [importParsed, setImportParsed] = useState(null) // { items, warnings }
  const [importError, setImportError] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [form, setForm] = useState({ name:'', category:'Altro', qty:1, brand:'', model:'', location:'', notes:'', brokenQty:0, minStock:0 })
  const myDrag      = useModalDrag(() => setShowModal(false))
  const detailDrag  = useModalDrag(() => setShowDetail(null))
  const addMenuDrag = useModalDrag(() => setShowAddMenu(false))
  const kitEditDrag = useModalDrag(() => setShowKitEditModal(false))
  const kitDrag     = useModalDrag(() => setShowKitModal(false))
  const importModal = useCenteredModal(() => setShowImportModal(false))
  useModalScrollLock(showModal || showAddMenu || showKitModal || showKitEditModal || !!showDetail || showPrintPopup || showImportModal)
  // Kit form: nome + componenti

  // Menu filtri: resta montato durante il fade out (invece di sparire di
  // scatto) così l'animazione a cascata può girare anche in chiusura, in
  // ordine inverso — stesso pattern già usato per il widget "Per iniziare".
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

  // Il pannello è in portal, con posizione calcolata una volta all'apertura:
  // se la pagina scorre resta "appeso" dov'era invece di seguire il bottone.
  // Più semplice e affidabile ricalcolare tutto: lo si chiude e basta. Ascolto
  // solo lo scroll della PAGINA (non capturing), così lo scroll interno del
  // pannello stesso (es. dentro la griglia categorie) non lo chiude da solo.
  useEffect(() => {
    if (!showFilterMenu) return
    const closeOnScroll = () => setShowFilterMenu(false)
    window.addEventListener('scroll', closeOnScroll)
    return () => window.removeEventListener('scroll', closeOnScroll)
  }, [showFilterMenu])

  // Items in shared global collection so workers can read them
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  // Arrivo dallo Scanner con un codice già identificato → apri direttamente il modal dettaglio
  useEffect(() => {
    if (!navState?.openItemId || items.length === 0) return
    const found = items.find(i => i.id === navState.openItemId)
    if (found) openDetail(found)
    navigate('.', { replace: true, state: {} })
  }, [navState?.openItemId, items])

  // Eventi — per rintracciare in quale evento/lista si trova un oggetto "fuori"
  const [events, setEvents] = useState([])
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  // Eventi in cui l'oggetto attualmente selezionato è caricato e non ancora rientrato
  const detailEvents = showDetail
    ? events.filter(ev => (ev.items || []).some(i =>
        (i.id === showDetail.id || i.itemRef === showDetail.id) && i.loaded && !i.returned
      ))
    : []

  // Storico: ultimi 5 eventi (di qualunque stato) in cui è comparso l'oggetto
  const detailEventHistory = showDetail
    ? events
        .filter(ev => (ev.items || []).some(i => i.id === showDetail.id || i.itemRef === showDetail.id))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
    : []

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

  const openAdd = () => { setSelected(null); setForm({ name:'', category:'Altro', qty:1, brand:'', model:'', location:'', notes:'', brokenQty:0, minStock:0 }); setShowModal(true) }
  const openEdit = item => {
    if (item.isBundle) {
      // Kit — apri il builder dedicato
      setEditingKit(item)
      setKitForm({ name:item.name, location:item.location||'', qty:item.totalQty||1, category:item.category||'Altro' })
      setKitEditComponents((item.components||[]).map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty, maxQty:99 })))
      setKitEditInstances(item.instances || [])
      setKitEditSearch('')
      setShowKitEditModal(true)
    } else {
      setSelected(item); setForm({ name:item.name, category:item.category, qty:item.totalQty, brand:item.brand||'', model:item.model||'', location:item.location||'', notes:item.notes||'', brokenQty:item.brokenQty||0, minStock:item.minStock||0 }); setShowModal(true)
    }
  }

  // Segna/toglie N pezzi rotti di un componente DENTRO un baule specifico —
  // stato persistente sul kit (non sull'evento): resta finché non lo si
  // riporta a 0 da qui, e ricompare in ogni evento a cui quel baule viene
  // assegnato (vedi src/utils/kitInstances.js).
  const toggleInstanceBroken = (instanceNumber, componentItemId, maxQty, delta) => {
    setKitEditInstances(prev => {
      const list = ensureInstanceList(prev, kitForm.qty)
      return list.map(inst => {
        if (inst.number !== instanceNumber) return inst
        const current = (inst.brokenComponents || []).find(b => b.itemId === componentItemId)?.qty || 0
        const next = Math.max(0, Math.min(maxQty, current + delta))
        const brokenComponents = (inst.brokenComponents || []).filter(b => b.itemId !== componentItemId)
        if (next > 0) brokenComponents.push({ itemId: componentItemId, qty: next })
        return { ...inst, brokenComponents }
      })
    })
  }

  const saveItem = async () => {
    if (!form.name.trim()) return
    const qty = parseInt(form.qty) || 1
    if (!selected) {
      const dup = items.find(i => i.name.trim().toLowerCase() === form.name.trim().toLowerCase())
      if (dup && !(await confirm({ title: t('inventory.confirmDuplicateTitle'), message: t('inventory.confirmDuplicateMessage', { name: dup.name }), confirmLabel: t('inventory.confirmDuplicateLabel') }))) return
    }
    if (selected) {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      // Ricalcola availableQty: totalQty - rotti - (quelli fuori, cioè totalQty - availableQty attuale - rotti vecchi)
      const prevBroken = selected.brokenQty || 0
      const prevOut = (selected.totalQty||0) - (selected.availableQty||0) - prevBroken
      const newAvailable = Math.max(0, qty - broken - prevOut)
      await updateDoc(doc(db, 'items', selected.id), { name:form.name, category:form.category, totalQty:qty, availableQty:newAvailable, brokenQty:broken, brand:form.brand, model:form.model, location:form.location, notes:form.notes, minStock:parseInt(form.minStock)||0 })
    } else {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      const ref = await addDoc(collection(db, 'items'), {
        name:form.name, category:form.category, totalQty:qty, availableQty:qty - broken, minStock:parseInt(form.minStock)||0,
        brokenQty:broken,
        brand:form.brand, model:form.model, location:form.location, notes:form.notes,
        teamId, createdAt:serverTimestamp(), createdBy: user.uid
      })
      await updateDoc(ref, { code: generateItemCode(ref.id) })
    }
    setShowModal(false)
  }

  const deleteItem = async id => {
    if (await confirm({ title: t('inventory.confirmDeleteItemTitle'), message: t('inventory.confirmDeleteItemMessage'), confirmLabel: t('inventory.confirmDeleteItemLabel'), danger: true })) {
      await deleteDoc(doc(db, 'items', id))
      setShowDetail(null)
    }
  }

  const openDetail = async item => {
    setShowDetail(item); setQrUrl(null)
    const code = item.code || generateItemCode(item.id)
    const url = await generateQRDataURL(qrPayloadForCode(code, teamId))
    setQrUrl(url)
    setTimeout(() => generateBarcodeSVG(code, 'barcode-svg'), 100)
  }

  // Etichette come immagine PNG 680×180 pronta per il software della stampante
  // termica — niente dialogo di stampa del browser, che dipende da formato
  // pagina/margini ed è inaffidabile per etichette di quella dimensione.
  const printCode = async () => {
    const code = showDetail.code || generateItemCode(showDetail.id)
    const png = await renderLabelPNG({ name: showDetail.name, location: showDetail.location, code, teamId })
    downloadDataUrl(png, labelFilename(showDetail.name, code))
  }

  const printUnitLabels = async () => {
    const baseCode = showDetail.code || generateItemCode(showDetail.id)
    const totalUnits = showDetail.totalQty || 1
    const unitCodes = Array.from({ length: totalUnits }, (_, i) => generateUnitCode(baseCode, i + 1))

    const zip = new JSZip()
    for (const code of unitCodes) {
      const png = await renderLabelPNG({ name: showDetail.name, location: showDetail.location, code, teamId })
      zip.file(labelFilename(showDetail.name, code), png.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadDataUrl(URL.createObjectURL(blob), `etichette-${labelFilename(showDetail.name, baseCode).replace('.png', '')}.zip`)
  }

  const printAllLabels = async () => {
    if (items.length === 0) return
    const itemsWithCodes = items.map(i => ({ ...i, code: i.code || generateItemCode(i.id) }))

    const zip = new JSZip()
    for (const item of itemsWithCodes) {
      const totalUnits = item.totalQty || 1
      const unitCodes = totalUnits > 1
        ? Array.from({ length: totalUnits }, (_, i) => generateUnitCode(item.code, i + 1))
        : [item.code]
      for (const code of unitCodes) {
        const png = await renderLabelPNG({ name: item.name, location: item.location, code, teamId })
        zip.file(labelFilename(item.name, code), png.split(',')[1], { base64: true })
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadDataUrl(URL.createObjectURL(blob), 'etichette-magazzino.zip')
  }

  const exportCSV = () => {
    if (items.length === 0) return
    const headers = [t('inventory.csv.name'), t('inventory.csv.category'), t('inventory.csv.brand'), t('inventory.csv.model'), t('inventory.csv.totalQty'), t('inventory.csv.available'), t('inventory.csv.location'), t('inventory.csv.kit'), t('inventory.csv.piecesPerCase'), t('inventory.csv.code'), t('inventory.csv.notes')]
    const rows = items.map(i => [
      i.name || '',
      i.category || '',
      i.brand || '',
      i.model || '',
      i.totalQty ?? '',
      i.availableQty ?? '',
      i.location || '',
      i.isKit ? t('inventory.csv.yes') : t('inventory.csv.no'),
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

  // \u2500\u2500 Importa lista da CSV \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Riconosce le intestazioni per nome (IT/EN, anche quelle del nostro
  // export) invece di richiedere un ordine di colonne rigido \u2014 cos\u00EC una
  // lista che qualcuno ha gi\u00E0 in un foglio di calcolo ha buone probabilit\u00E0
  // di funzionare senza doverla riformattare. Ogni articolo importato parte
  // sempre "tutto disponibile, niente rotti": non fidiamoci di eventuali
  // colonne disponibilit\u00E0/rotti/codice in un file esterno, potrebbero non
  // rispecchiare lo stato reale del magazzino.
  const openImport = () => {
    setImportStep('instructions')
    setImportParsed(null)
    setImportError('')
    setImportProgress(0)
    setShowImportModal(true)
  }

  const handleImportFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      const { items: parsedItems, warnings } = mapRowsToItems(rows, CATEGORIES)
      if (parsedItems.length === 0) { setImportError(t('inventory.importErrorNoRows')); return }
      setImportParsed({ items: parsedItems, warnings })
      setImportStep('preview')
    } catch (err) {
      setImportError(err.code === 'no-name-column' ? t('inventory.importErrorNoNameColumn') : t('inventory.importErrorNoRows'))
    }
  }

  const confirmImport = async () => {
    if (!importParsed) return
    setImportStep('importing')
    setImportProgress(0)
    const toImport = importParsed.items
    for (let i = 0; i < toImport.length; i++) {
      const it = toImport[i]
      const ref = await addDoc(collection(db, 'items'), {
        name: it.name, category: it.category, totalQty: it.totalQty, availableQty: it.totalQty,
        minStock: 0, brokenQty: 0, brand: it.brand, model: it.model, location: it.location, notes: it.notes,
        teamId, createdAt: serverTimestamp(), createdBy: user.uid,
      })
      await updateDoc(ref, { code: generateItemCode(ref.id) })
      setImportProgress(i + 1)
    }
    setImportStep('done')
  }

  const [activeFilter, setActiveFilter] = useState(navState?.filter || 'all')

  const filtered = items.filter(i => {
    const matchSearch = !search ||
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase()) ||
      i.brand?.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (activeFilter === 'out')     return (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)
    if (activeFilter === 'broken')  return (i.brokenQty || 0) > 0
    if (activeFilter === 'reorder') return i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock
    return true
  })

  const countOut    = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)).length
  const countBroken = items.filter(i => (i.brokenQty || 0) > 0).length
  const countReorder = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock).length

  // Filtri avanzati (menu filtri): si combinano con ricerca testo + chip
  // rapidi qui sopra. Non appena uno di questi è attivo, la vista passa da
  // "raggruppata per categoria" a lista piatta ordinata — le due modalità
  // non hanno senso insieme (un ordinamento per quantità o un filtro per
  // posizione attraversa le categorie).
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

  // Raggruppa per categoria — kit appaiono nel loro gruppo, non in 'Kit'
  const groupedFiltered = CATEGORY_ORDER.map(cat => ({
    cat,
    catItems: cat === 'Altro'
      ? filtered.filter(i => !MAIN_CATS.includes(i.category))
      : filtered.filter(i => i.category === cat),
  })).filter(g => g.catItems.length > 0)

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>{t('inventory.title')}</h1><p>{t('inventory.itemsCount', { count: items.length })}</p></div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Menu azioni — 3 puntini */}
            <div style={{ position:'relative' }}>
              <button
                onClick={() => setShowActionsMenu(v => !v)}
                className="btn btn-secondary"
                style={{ padding:'10px 13px', fontSize:18, lineHeight:1 }}
              >⋯</button>
              {showActionsMenu && (
                <>
                  {/* overlay trasparente per chiudere */}
                  <div
                    onClick={() => setShowActionsMenu(false)}
                    style={{ position:'fixed', inset:0, zIndex:99 }}
                  />
                  <div style={{
                    position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100,
                    background:'var(--card)', border:'1px solid var(--border)',
                    borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.18)',
                    minWidth:190, overflow:'hidden',
                  }}>
                    <button
                      onClick={() => { setShowActionsMenu(false); openImport() }}
                      style={{ width:'100%', padding:'13px 16px', textAlign:'left', background:'transparent', color:'var(--text)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}
                    >
                      <span>📥</span> {t('inventory.importList')}
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); exportCSV() }}
                      style={{ width:'100%', padding:'13px 16px', textAlign:'left', background:'transparent', color:'var(--text)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}
                    >
                      <span>📤</span> {t('inventory.exportCsv')}
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); printAllLabels() }}
                      style={{ width:'100%', padding:'13px 16px', textAlign:'left', background:'transparent', color:'var(--text)', fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:10 }}
                    >
                      <span>⬇</span> {t('inventory.downloadLabelsZip')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <FabButton onClick={() => setShowAddMenu(true)} ariaLabel={t('inventory.addButton')} />

      <div className="search-bar" style={{ position:'relative', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inventory.searchPlaceholder')} />
        </div>

        {/* Menu filtri avanzati (ordina/categoria/kit/posizione) — il pannello
            va in portal su document.body: la search-bar ha backdrop-filter,
            che in CSS crea un nuovo contenimento per gli elementi "fixed"
            annidati, quindi l'overlay per chiudere al tap-fuori restava
            confinato dentro la barra invece di coprire tutta la pagina. */}
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
                {/* Copre tutto lo schermo: un tap ovunque fuori dal pannello lo chiude */}
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
                    {/* Campo compatto che si espande al tap — stesso principio del
                        DateField: di default il pannello resta basso (soprattutto
                        su mobile), la griglia con le 13 categorie si vede solo
                        quando serve davvero cambiarla. */}
                    <button
                      onClick={() => setCategoryPickerOpen(o => !o)}
                      className="btn-no-anim"
                      style={{
                        width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'9px 10px', borderRadius:8, fontSize:13, fontWeight:600, marginBottom: categoryPickerOpen ? 6 : 14,
                        background:'var(--card2)', border:'1px solid var(--border)',
                        color: filterCategory ? 'var(--text)' : 'var(--text2)',
                      }}
                    >
                      <span style={{ display:'flex', alignItems:'center', gap:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {filterCategory && <span style={{ flexShrink:0 }}>{ICONS[filterCategory] || '📦'}</span>}
                        {filterCategory || t('inventory.filterAllCategories')}
                      </span>
                      <span style={{ flexShrink:0, fontSize:10, color:'var(--text2)', transition:'transform 0.15s', transform: categoryPickerOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </button>
                    {categoryPickerOpen && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
                        <button
                          onClick={() => { setFilterCategory(''); setCategoryPickerOpen(false) }}
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
                            className="btn-no-anim"
                            style={{
                              padding:'7px 8px', borderRadius:8, fontSize:11.5, fontWeight:700,
                              display:'flex', alignItems:'center', gap:5, overflow:'hidden',
                              background: filterCategory === c ? 'var(--accent)' : 'var(--card2)',
                              color: filterCategory === c ? '#fff' : 'var(--text2)',
                              border: `1px solid ${filterCategory === c ? 'var(--accent)' : 'var(--border)'}`,
                            }}
                          >
                            <span style={{ flexShrink:0 }}>{ICONS[c] || '📦'}</span>
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={cascade(2)}>
                    <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{t('inventory.filterLocationLabel')}</p>
                    <input
                      list="inventory-filter-locations"
                      value={filterLocation}
                      onChange={e => setFilterLocation(e.target.value)}
                      placeholder={t('inventory.filterLocationPlaceholder')}
                      style={{ fontSize:13, marginBottom:14 }}
                    />
                    <datalist id="inventory-filter-locations">
                      {uniqueLocations.map(loc => <option key={loc} value={loc} />)}
                    </datalist>
                  </div>

                  <div style={cascade(3)}>
                    <button
                      onClick={() => setFilterKitOnly(v => !v)}
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

      {/* Filtri rapidi - scrollabili orizzontalmente */}
      <div style={{ overflowX:'auto', background:'var(--bg2)', borderBottom:'1px solid var(--border)', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <div style={{ display:'flex', gap:8, padding:'10px 16px', width:'max-content', minWidth:'100%' }}>
        {[
          { key:'all',    label:t('inventory.filterAll'), count: items.length },
          { key:'out',     label:t('inventory.filterOut'),         count: countOut,    color:'var(--accent2)', bg:'rgba(245,166,35,0.12)', border:'rgba(245,166,35,0.3)' },
          { key:'broken',  label:t('inventory.filterBroken'),         count: countBroken, color:'var(--red)',     bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)' },
          { key:'reorder', label:t('inventory.filterReorder'), count: countReorder,color:'var(--blue)',    bg:'rgba(79,195,247,0.12)',  border:'rgba(79,195,247,0.3)' },
        ].map(f => (
          <button key={f.key} onClick={() => setActiveFilter(f.key)}
            style={{
              padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:700,
              background: activeFilter === f.key ? (f.bg || 'var(--accent)') : 'var(--card2)',
              color: activeFilter === f.key ? (f.color || '#fff') : 'var(--text2)',
              border: `1px solid ${activeFilter === f.key ? (f.border || 'var(--accent)') : 'var(--border)'}`,
              display:'flex', alignItems:'center', gap:5,
            }}>
            {f.label}
            {f.count > 0 && (
              <span style={{ background: activeFilter === f.key ? 'rgba(0,0,0,0.15)' : 'var(--card3)', borderRadius:10, padding:'1px 6px', fontSize:11 }}>
                {f.count}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {(advancedFiltersActive ? sortedFlat.length === 0 : filtered.length === 0)
        ? <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'12px 16px 0', overflow:'hidden' }}>
            <div className="empty-state"><p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={42} /></p><h3>{t('inventory.emptyTitle')}</h3><p>{t('inventory.emptyDesc')}</p></div>
          </div>
        : advancedFiltersActive
        ? <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'12px 16px 0', overflow:'hidden' }}>
            {sortedFlat.map(item => <ItemRow key={item.id} item={item} onOpen={openDetail} t={t} />)}
          </div>
        : groupedFiltered.map(({ cat, catItems }) => (
          <div key={cat} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', margin:'12px 16px 0', overflow:'hidden' }}>
            {/* Intestazione categoria */}
            <div style={{ padding:'7px 14px', background:'var(--bg2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:15 }}>{ICONS[cat] || '📦'}</span>
              <span style={{ fontWeight:700, fontSize:12, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{cat}</span>
              <span style={{ fontSize:12, color:'var(--text3)', marginLeft:'auto' }}>{catItems.length}</span>
            </div>
            {catItems.map(item => <ItemRow key={item.id} item={item} onOpen={openDetail} t={t} />)}
          </div>
        ))
      }

      {/* Modal aggiunta/modifica */}
      {/* Modal aggiunta/modifica articolo */}
      {showModal && (
        <div className={`modal-overlay${myDrag.closing ? ' closing' : ''}`} onClick={myDrag.onOverlayClick}>
          <div className={`modal${myDrag.jiggling ? ' modal-jiggle' : ''}${myDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...myDrag.props}>
            <button className="close-btn" onClick={myDrag.close}>✕</button>
            <h2>{selected ? t('inventory.editItemTitle') : t('inventory.newItemTitle')}</h2>
            <div className="form-group"><label>{t('inventory.nameLabel')}</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder={t('inventory.namePlaceholder')} /></div>
            <div className="form-group"><label>{t('inventory.categoryLabel')}</label>
              <select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group"><label>{t('inventory.brandLabel')}</label><input value={form.brand} onChange={e => setForm({...form,brand:e.target.value})} placeholder={t('inventory.brandPlaceholder')} /></div>
              <div className="form-group"><label>{t('inventory.modelLabel')}</label><input value={form.model} onChange={e => setForm({...form,model:e.target.value})} placeholder={t('inventory.modelPlaceholder')} /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group"><label>{t('inventory.totalQtyLabel')}</label>
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
                  {t('inventory.brokenLabel')} {form.brokenQty > 0 && <span style={{ fontWeight:800 }}>({form.brokenQty})</span>}
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
              <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:4, fontSize:13, color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}>
                <Wrench size={14} /> {t('inventory.availableOutOfUse', { available: form.qty - form.brokenQty, broken: form.brokenQty })}
              </div>
            )}
            <div className="form-group"><label>{t('inventory.locationLabel')}</label><input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder={t('inventory.locationPlaceholder')} /></div>


            <div className="form-group"><label>{t('inventory.notesLabel')}</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} /></div>

            {/* Soglia scorta minima — solo per Consumabili */}
            {form.category === 'Consumabili' && (
              <div className="form-group">
                <label>{t('inventory.minStockLabel')}</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
                    <button onClick={() => setForm({...form, minStock:Math.max(0,(form.minStock||0)-1)})}
                      style={{ width:32, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                    <input type="number" min="0" value={form.minStock||0}
                      onChange={e => setForm({...form, minStock:Math.max(0,parseInt(e.target.value)||0)})}
                      style={{ textAlign:'center', fontWeight:800, fontSize:16, padding:'6px 4px', flex:1 }} />
                    <button onClick={() => setForm({...form, minStock:(form.minStock||0)+1})}
                      style={{ width:32, height:36, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                  </div>
                </div>
                {(form.minStock||0) > 0 && <p style={{ color:'var(--text2)', fontSize:12, marginTop:6 }}>{t('inventory.minStockHint', { count: form.minStock })}</p>}
              </div>
            )}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              {selected && <button onClick={() => { setShowModal(false); deleteItem(selected.id) }} className="btn btn-red" style={{ flex:1 }}>{t('inventory.delete')}</button>}
              <button onClick={saveItem} className="btn btn-primary" style={{ flex:2, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}><Save size={16} /> {t('inventory.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dettaglio + QR */}
      {showDetail && (
        <div className={`modal-overlay${detailDrag.closing ? ' closing' : ''}`} onClick={detailDrag.onOverlayClick}>
          <div className={`modal${detailDrag.jiggling ? ' modal-jiggle' : ''}${detailDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...detailDrag.props}>
            <button className="close-btn" onClick={detailDrag.close}>✕</button>

            {/* Wrapper scorrevole: pannello principale + pannello "dove si trova" */}
            <div style={{ overflow:'hidden' }}>
              <div style={{
                display:'flex', alignItems:'flex-start',
                transform: showDetailEvents ? 'translateX(-100%)' : 'translateX(0)',
                transition:'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
              }}>

                {/* ── Pannello principale ── */}
                <div style={{ width:'100%', flexShrink:0 }}>
                  <div style={{ textAlign:'center', marginBottom:20 }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>{ICONS[showDetail.category] || '📦'}</div>
                    <h2 style={{ margin:0 }}>{showDetail.name}</h2>
                    {(showDetail.brand || showDetail.model) && <p style={{ color:'var(--text2)', marginTop:4 }}>{showDetail.brand} {showDetail.model}</p>}
                  </div>
                  <div
                    onClick={() => setShowDetailEvents(true)}
                    style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16, cursor:'pointer' }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ color:'var(--text2)', fontSize:14 }}>{t('inventory.detailAvailable')}</span>
                      <span style={{ fontWeight:800, fontSize:18 }}>
                        {showDetail.category === 'Consumabili'
                          ? (showDetail.availableQty ?? showDetail.totalQty)
                          : `${showDetail.availableQty}/${showDetail.totalQty}`
                        }
                      </span>
                    </div>
                    {/* Barra segmentata: disponibili / fuori / rotti */}
                    <div style={{ background:'var(--card2)', borderRadius:4, height:8, overflow:'hidden', display:'flex' }}>
                      <div style={{ background:'var(--green)', width:`${((showDetail.availableQty||0)/(showDetail.totalQty||1))*100}%`, transition:'width 0.3s' }} />
                      {showDetail.brokenQty > 0 && (
                        <div style={{ background:'var(--red)', width:`${((showDetail.brokenQty||0)/(showDetail.totalQty||1))*100}%` }} />
                      )}
                    </div>
                    <div style={{ display:'flex', gap:12, marginTop:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, color:'var(--green)' }}>● {showDetail.availableQty} {t('inventory.available')}</span>
                      {((showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)) > 0 && (
                        <span style={{ fontSize:12, color:'var(--accent2)' }}>● {(showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)} {t('inventory.out')}</span>
                      )}
                      {showDetail.brokenQty > 0 && (
                        <span style={{ fontSize:12, color:'var(--red)' }}>● {t('inventory.brokenCount', { count: showDetail.brokenQty })}</span>
                      )}
                    </div>
                    <p style={{ fontSize:11, color:'var(--accent)', marginTop:8, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                      🔍 {t('inventory.detailTapToSeeLocation')}
                      <span style={{ marginLeft:'auto' }}>→</span>
                    </p>
                  </div>
                  <div className="code-preview" style={{ marginBottom:14 }}>
                    {qrUrl ? <img src={qrUrl} style={{ width:180 }} /> : <div style={{ width:180, height:180, background:'#f0f0f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ color:'#999', fontSize:13 }}>{t('inventory.generating')}</p></div>}
                    <p style={{ color:'#333', fontFamily:'monospace', fontWeight:700, fontSize:16 }}>{showDetail.code || generateItemCode(showDetail.id)}</p>
                    <svg id="barcode-svg"></svg>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <button onClick={() => setShowPrintPopup(true)} className="btn btn-secondary">⬇ {t('inventory.downloadLabel')}</button>
                    <button onClick={() => { setShowDetail(null); openEdit(showDetail) }} className="btn btn-secondary">✏️ {t('inventory.edit')}</button>
                  </div>
                  {/* Tasto riparato - appare SOLO se ci sono pezzi rotti */}
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
                      style={{ width:'100%', marginTop:10, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.4)', color:'var(--red)', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
                    >
                      <Wrench size={15} /> {t('inventory.brokenCount', { count: showDetail.brokenQty })}
                    </button>
                  )}
                  {/* Tasto ripristina giacenza — appare solo se risultano articoli "fuori" */}
                  {((showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)) > 0 && (
                    <button
                      onClick={async () => {
                        const newAvailable = (showDetail.totalQty||0) - (showDetail.brokenQty||0)
                        await updateDoc(doc(db, 'items', showDetail.id), { availableQty: newAvailable })
                        setShowDetail(d => ({ ...d, availableQty: newAvailable }))
                      }}
                      style={{ width:'100%', marginTop:10, background:'rgba(47,107,203,0.10)', border:'1px solid rgba(47,107,203,0.3)', color:'var(--blue)', borderRadius:10, padding:'12px', fontWeight:700, fontSize:14 }}
                    >
                      {t('inventory.restoreStock', { count: (showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0) })}
                    </button>
                  )}
                  {showDetail.notes && <p style={{ color:'var(--text2)', fontSize:13, marginTop:12, padding:'10px 12px', background:'var(--bg3)', borderRadius:8 }}>{showDetail.notes}</p>}
                  {showDetail.location && (
                    <div style={{ marginTop:12, padding:'12px 14px', background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ color:'var(--blue)' }}><Pin size={17} /></span>
                      <div>
                        <p style={{ color:'var(--text2)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>{t('inventory.warehousePosition')}</p>
                        <p style={{ color:'var(--blue)', fontWeight:700, fontSize:15, marginTop:2 }}>{showDetail.location}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Pannello "dove si trova" ── */}
                <div style={{ width:'100%', flexShrink:0, paddingLeft:2 }}>
                  <button
                    onClick={() => setShowDetailEvents(false)}
                    className="btn-no-anim"
                    style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', color:'var(--text2)', fontWeight:700, fontSize:14, marginBottom:16 }}
                  >
                    ← {t('common.back')}
                  </button>
                  <h2 style={{ marginBottom:4 }}>{t('inventory.whereItIs')}</h2>
                  <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16 }}>{showDetail.name}</p>

                  {detailEvents.length === 0 && detailEventHistory.length === 0 && (
                    <p style={{ color:'var(--text3)', fontSize:13, fontStyle:'italic', padding:'8px 0' }}>{t('inventory.noHistoryAvailable')}</p>
                  )}

                  {detailEvents.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                      <p style={{ fontSize:11, fontWeight:700, color:'var(--accent2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('inventory.currentlyOut')}</p>
                      {detailEvents.map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => { setShowDetailEvents(false); setShowDetail(null); navigate(`/events/${ev.id}`) }}
                          style={{ display:'flex', alignItems:'center', gap:12, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'left' }}
                        >
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</p>
                            <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                              {formatDate(ev.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long' }, i18n.language)}
                              {ev.location ? ` · ${ev.location}` : ''}
                            </p>
                          </div>
                          <span style={{ color:'var(--text2)' }}>→</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {detailEventHistory.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('inventory.history', { count: detailEventHistory.length })}</p>
                      {detailEventHistory.map(ev => {
                        const itm = (ev.items || []).find(i => i.id === showDetail.id || i.itemRef === showDetail.id)
                        const stillOut = itm?.loaded && !itm?.returned
                        return (
                          <button
                            key={ev.id}
                            onClick={() => { setShowDetailEvents(false); setShowDetail(null); navigate(`/events/${ev.id}`) }}
                            style={{ display:'flex', alignItems:'center', gap:12, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'left' }}
                          >
                            <div style={{ flex:1, minWidth:0 }}>
                              <p style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</p>
                              <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                                {formatDate(ev.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long' }, i18n.language)}
                                {ev.location ? ` · ${ev.location}` : ''}
                              </p>
                            </div>
                            {stillOut && (
                              <span className="badge" style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', fontSize:11, flexShrink:0 }}>{t('inventory.out')}</span>
                            )}
                            <span style={{ color:'var(--text2)' }}>→</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup scelta stampa: una etichetta o tutte le unità — volutamente
          leggero (niente bottom-sheet/drag), solo un riquadro centrato fisso */}
      {showPrintPopup && showDetail && (
        <div
          onClick={() => setShowPrintPopup(false)}
          style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position:'relative', width:'100%', maxWidth:300, background:'var(--card)', borderRadius:16, padding:20, boxShadow:'0 12px 40px rgba(0,0,0,0.3)' }}
          >
            <button
              onClick={() => setShowPrintPopup(false)}
              style={{ position:'absolute', top:10, right:10, background:'transparent', color:'var(--text2)', fontSize:16, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              ✕
            </button>
            <h2 style={{ marginBottom:16, fontSize:17 }}>{t('inventory.downloadLabel')}</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button
                onClick={() => { printCode(); setShowPrintPopup(false) }}
                className="btn btn-secondary"
              >
                {t('inventory.printOneLabel')}
              </button>
              {(showDetail.totalQty || 1) > 1 && (
                <button
                  onClick={() => { printUnitLabels(); setShowPrintPopup(false) }}
                  className="btn btn-secondary"
                >
                  {t('inventory.printAllUnits', { count: showDetail.totalQty })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Importa lista da CSV — finestra centrata (non bottom-sheet): prima
          le istruzioni sul formato, poi l'anteprima di cosa verrà importato,
          poi il progresso. Sempre annullabile finché non si conferma. */}
      {showImportModal && (
        <div
          onClick={importModal.close}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: importModal.closing ? 'invImportFadeOut 0.2s ease forwards' : 'invImportFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ position:'relative', background:'var(--card)', borderRadius:24, padding:'26px 24px 24px', width:'100%', maxWidth:420, maxHeight:'85dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: importModal.closing ? 'invImportPopOut 0.2s ease forwards' : 'invImportPopIn 0.28s cubic-bezier(0.32,0.72,0,1)' }}
          >
            {importStep !== 'importing' && (
              <button onClick={importModal.close} style={{ position:'absolute', top:16, right:16, width:28, height:28, borderRadius:'50%', background:'var(--card2)', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, border:'none' }}>✕</button>
            )}

            {importStep === 'instructions' && (
              <>
                <h2 style={{ fontSize:19, fontWeight:800, marginBottom:6 }}>{t('inventory.importInstructionsTitle')}</h2>
                <p style={{ color:'var(--text2)', fontSize:13.5, lineHeight:1.55, marginBottom:16 }}>{t('inventory.importInstructionsDesc')}</p>

                <div style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('inventory.importColumnsTitle')}</p>
                  <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:'var(--text)', lineHeight:1.7 }}>
                    <li><strong>{t('inventory.csv.name')}</strong> — {t('inventory.importColRequired')}</li>
                    <li>{t('inventory.csv.category')} — {t('inventory.importColCategory')}</li>
                    <li>{t('inventory.csv.brand')} / {t('inventory.csv.model')}</li>
                    <li>{t('inventory.csv.totalQty')} — {t('inventory.importColQty')}</li>
                    <li>{t('inventory.csv.location')}</li>
                    <li>{t('inventory.csv.notes')}</li>
                  </ul>
                </div>

                <p style={{ fontSize:12.5, color:'var(--text2)', marginBottom:16, lineHeight:1.5 }}>{t('inventory.importFormatHint')}</p>

                {importError && <p style={{ color:'var(--accent)', fontSize:13, fontWeight:600, marginBottom:12 }}>{importError}</p>}

                <label className="btn btn-primary btn-full" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, cursor:'pointer' }}>
                  {t('inventory.importChooseFile')}
                  <input type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display:'none' }} />
                </label>
              </>
            )}

            {importStep === 'preview' && importParsed && (
              <>
                <h2 style={{ fontSize:19, fontWeight:800, marginBottom:6 }}>{t('inventory.importPreviewTitle', { count: importParsed.items.length })}</h2>
                <p style={{ color:'var(--text2)', fontSize:13.5, lineHeight:1.5, marginBottom:14 }}>{t('inventory.importPreviewDesc')}</p>

                <div style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:12, padding:'4px 14px', marginBottom:14, maxHeight:180, overflowY:'auto' }}>
                  {importParsed.items.slice(0, 8).map((it, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                      <span style={{ fontSize:13.5, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.name}</span>
                      <span style={{ fontSize:12, color:'var(--text2)', flexShrink:0 }}>{it.category} · ×{it.totalQty}</span>
                    </div>
                  ))}
                  {importParsed.items.length > 8 && (
                    <p style={{ fontSize:12, color:'var(--text2)', padding:'8px 0', borderTop:'1px solid var(--border)' }}>{t('common.moreCount', { count: importParsed.items.length - 8 })}</p>
                  )}
                </div>

                {(importParsed.warnings.categoryFallbacks > 0 || importParsed.warnings.qtyFallbacks > 0 || importParsed.warnings.skippedEmptyName > 0 || importParsed.warnings.malformedRows > 0) && (
                  <div style={{ background:'rgba(245,166,35,0.10)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:10, padding:'10px 12px', marginBottom:16, fontSize:12.5, color:'var(--accent2)', lineHeight:1.6 }}>
                    {importParsed.warnings.malformedRows > 0 && <p>{t('inventory.importWarnMalformed', { count: importParsed.warnings.malformedRows })}</p>}
                    {importParsed.warnings.categoryFallbacks > 0 && <p>{t('inventory.importWarnCategory', { count: importParsed.warnings.categoryFallbacks })}</p>}
                    {importParsed.warnings.qtyFallbacks > 0 && <p>{t('inventory.importWarnQty', { count: importParsed.warnings.qtyFallbacks })}</p>}
                    {importParsed.warnings.skippedEmptyName > 0 && <p>{t('inventory.importWarnSkipped', { count: importParsed.warnings.skippedEmptyName })}</p>}
                  </div>
                )}

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setImportStep('instructions')} className="btn-no-anim" style={{ flex:1, padding:13, borderRadius:12, background:'var(--card2)', color:'var(--text2)', fontWeight:700, fontSize:14 }}>
                    {t('common.back')}
                  </button>
                  <button onClick={confirmImport} className="btn btn-primary" style={{ flex:2 }}>
                    {t('inventory.importConfirm', { count: importParsed.items.length })}
                  </button>
                </div>
              </>
            )}

            {importStep === 'importing' && (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
                <p style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{t('inventory.importingProgress', { done: importProgress, total: importParsed?.items.length || 0 })}</p>
                <p style={{ color:'var(--text2)', fontSize:13 }}>{t('inventory.importingHint')}</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {importStep === 'done' && (
              <div style={{ textAlign:'center', padding:'12px 0' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(52,211,153,0.12)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <Save size={26} />
                </div>
                <h2 style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>{t('inventory.importDoneTitle', { count: importParsed?.items.length || 0 })}</h2>
                <button onClick={() => setShowImportModal(false)} className="btn btn-primary btn-full">{t('common.close')}</button>
              </div>
            )}
          </div>
          <style>{`
            @keyframes invImportFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes invImportFadeOut { from{opacity:1} to{opacity:0} }
            @keyframes invImportPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
            @keyframes invImportPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
          `}</style>
        </div>
      )}

      {/* Menu scelta: Oggetto o Kit */}
      {showAddMenu && (
        <div className={`modal-overlay${addMenuDrag.closing ? ' closing' : ''}`} onClick={addMenuDrag.onOverlayClick}>
          <div className={`modal${addMenuDrag.jiggling ? ' modal-jiggle' : ''}${addMenuDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...addMenuDrag.props}>
            <button className="close-btn" onClick={addMenuDrag.close}>✕</button>
            <h2>{t('inventory.addMenuTitle')}</h2>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
              <button onClick={() => { setShowAddMenu(false); openAdd() }}
                style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text)' }}><Box size={34} /></span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{t('inventory.newItemOption')}</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('inventory.newItemOptionDesc')}</span>
              </button>
              <button onClick={() => { setShowAddMenu(false); setKitForm({name:'',location:'',qty:1,category:'Altro'}); setKitComponents([]); setKitSearch(''); setShowKitModal(true) }}
                style={{ background:'rgba(245,166,35,0.08)', border:'2px solid rgba(245,166,35,0.3)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--accent2)' }}><Kit size={34} /></span>
                <span style={{ fontWeight:700, fontSize:15, color:'var(--accent2)' }}>{t('inventory.newKitOption')}</span>
                <span style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('inventory.newKitOptionDesc')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kit Builder */}
      {/* ── Kit Edit Modal ─────────────────────── */}
      {showKitEditModal && editingKit && (
        <div className={`modal-overlay${kitEditDrag.closing ? ' closing' : ''}`} onClick={kitEditDrag.onOverlayClick}>
          <div className={`modal${kitEditDrag.jiggling ? ' modal-jiggle' : ''}${kitEditDrag.closing ? ' closing' : ''}`} style={{ position:'relative', maxHeight:'92dvh', display:'flex', flexDirection:'column', padding:0 }} {...kitEditDrag.props}>
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <button className="close-btn" onClick={kitEditDrag.close}>✕</button>
              <h2 style={{ marginBottom:14, display:'flex', alignItems:'center', gap:8 }}><Kit size={20} /> {t('inventory.editKitTitle')}</h2>
              <input value={kitForm.name} onChange={e => setKitForm({...kitForm,name:e.target.value})} placeholder={t('inventory.kitNamePlaceholder')} style={{ marginBottom:8, fontWeight:600, fontSize:16 }} />
              <input value={kitForm.location} onChange={e => setKitForm({...kitForm,location:e.target.value})} placeholder={t('inventory.kitLocationPlaceholder')} style={{ fontSize:13, marginBottom:10 }} />
              <select value={kitForm.category||'Altro'} onChange={e => setKitForm({...kitForm,category:e.target.value})} style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>
                {KIT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <p style={{ fontSize:13, color:'var(--text2)', fontWeight:600, whiteSpace:'nowrap' }}>{t('inventory.howManyKits')}</p>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button type="button" onClick={() => setKitForm(f => ({...f, qty:Math.max(1,f.qty-1)}))} style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                  <input type="number" min="1" value={kitForm.qty} onChange={e => setKitForm(f => ({...f, qty:Math.max(1,parseInt(e.target.value)||1)}))} style={{ width:52, textAlign:'center', fontWeight:800, fontSize:16, padding:'4px 6px' }} />
                  <button type="button" onClick={() => setKitForm(f => ({...f, qty:f.qty+1}))} style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                </div>
              </div>
            </div>
            {/* Un solo scroll per tutto il contenuto centrale (componenti, stato
                bauli, ricerca + risultati): prima queste erano sezioni fisse
                separate, e con più bauli/componenti la ricerca finiva spinta
                fuori dalla modale, irraggiungibile. Header e bottoni restano
                fissi (flexShrink:0), solo questo blocco scorre. */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {kitEditComponents.length > 0 && (
                <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'rgba(245,166,35,0.04)' }}>
                  <p style={{ color:'var(--accent2)', fontSize:12, fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('inventory.componentsCount', { count: kitEditComponents.length })}</p>
                  {kitEditComponents.map(comp => (
                    <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{comp.name}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <button onClick={() => setKitEditComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:Math.max(1,c.qty-1)} : c))} style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                        <span style={{ fontWeight:800, fontSize:15, minWidth:22, textAlign:'center' }}>{comp.qty}</span>
                        <button onClick={() => setKitEditComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:c.qty+1} : c))} style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                      </div>
                      <button onClick={() => setKitEditComponents(prev => prev.filter(c => c.itemId !== comp.itemId))} style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'2px 6px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {kitEditComponents.length > 0 && (
                <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                  <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, marginBottom:2, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('inventory.kitInstancesTitle')}</p>
                  <p style={{ color:'var(--text3)', fontSize:11.5, marginBottom:8, lineHeight:1.4 }}>{t('inventory.kitInstancesHint')}</p>
                  {ensureInstanceList(kitEditInstances, kitForm.qty).map(inst => {
                    const hasBroken = (inst.brokenComponents || []).length > 0
                    return (
                      <div key={inst.number} style={{ marginBottom:8, padding:'8px 10px', borderRadius:8, background: hasBroken ? 'rgba(248,113,113,0.06)' : 'var(--card2)', border: hasBroken ? '1px solid rgba(248,113,113,0.25)' : '1px solid var(--border)' }}>
                        <p style={{ fontSize:12.5, fontWeight:800, color: hasBroken ? 'var(--red)' : 'var(--text)', marginBottom:6, display:'flex', alignItems:'center', gap:5 }}>
                          {hasBroken && <Warn size={12} />} {t('inventory.kitInstanceLabel', { number: inst.number })}
                        </p>
                        {kitEditComponents.map(comp => {
                          const brokenQty = (inst.brokenComponents || []).find(b => b.itemId === comp.itemId)?.qty || 0
                          return (
                            <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                              <span style={{ flex:1, fontSize:12.5, color:'var(--text2)' }}>{comp.name}</span>
                              <button
                                onClick={() => toggleInstanceBroken(inst.number, comp.itemId, comp.qty, -1)}
                                disabled={brokenQty === 0}
                                style={{ width:22, height:22, borderRadius:5, background:'var(--card3)', border:'1px solid var(--border)', fontSize:12, opacity: brokenQty === 0 ? 0.4 : 1, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                              <span style={{ fontSize:12, fontWeight:800, minWidth:36, textAlign:'center', color: brokenQty > 0 ? 'var(--red)' : 'var(--text2)' }}>
                                {brokenQty > 0 ? t('inventory.kitInstanceMissingCount', { count: brokenQty }) : '✓'}
                              </span>
                              <button
                                onClick={() => toggleInstanceBroken(inst.number, comp.itemId, comp.qty, 1)}
                                disabled={brokenQty >= comp.qty}
                                style={{ width:22, height:22, borderRadius:5, background:'var(--card3)', border:'1px solid var(--border)', fontSize:12, opacity: brokenQty >= comp.qty ? 0.4 : 1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                <input value={kitEditSearch} onChange={e => setKitEditSearch(e.target.value)} placeholder={t('inventory.addComponentPlaceholder')} style={{ fontSize:13 }} />
              </div>
              {items
                .filter(i => !i.isBundle && !kitEditComponents.some(c => c.itemId===i.id))
                .filter(i => !kitEditSearch || i.name?.toLowerCase().includes(kitEditSearch.toLowerCase()))
                .map(item => (
                  <div key={item.id} className="item-row" onClick={() => { setKitEditComponents(prev => [...prev, { itemId:item.id, name:item.name, qty:1, maxQty:item.totalQty||1 }]); setKitEditSearch('') }}>
                    <div className="item-icon" style={{ fontSize:18 }}>{ICONS[item.category]||'📦'}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:12 }}>{t('inventory.availableShort', { count: item.availableQty??item.totalQty })}</p>
                    </div>
                    <span style={{ color:'var(--accent)', fontSize:20, padding:'0 8px' }}>+</span>
                  </div>
                ))
              }
            </div>
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg2)', display:'flex', gap:10 }}>
              <button
                onClick={async () => {
                  if (!(await confirm({ title: t('inventory.deleteKit'), message: t('inventory.confirmDeleteKitMessage', { name: editingKit.name }), confirmLabel: t('inventory.delete'), danger: true }))) return
                  await deleteDoc(doc(db, 'items', editingKit.id))
                  setShowKitEditModal(false)
                  setShowDetail(null)
                }}
                className="btn btn-red"
                style={{ flex:1 }}>
                {t('inventory.delete')}
              </button>
              <button
                onClick={async () => {
                  if (!kitForm.name.trim()) return
                  const currentOut = (editingKit.totalQty || 0) - (editingKit.availableQty || 0)
                  const newTotal = kitForm.qty || 1
                  const newAvailable = Math.max(0, newTotal - currentOut)
                  await updateDoc(doc(db, 'items', editingKit.id), {
                    name: kitForm.name.trim(),
                    location: kitForm.location.trim(),
                    category: kitForm.category || 'Altro',
                    totalQty: newTotal,
                    availableQty: newAvailable,
                    components: kitEditComponents.map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty })),
                    instances: ensureInstanceList(kitEditInstances, newTotal),
                  })
                  setShowKitEditModal(false)
                  setShowDetail(null)
                }}
                className="btn btn-primary"
                disabled={!kitForm.name.trim() || kitEditComponents.length === 0}
                style={{ flex:2, opacity: !kitForm.name.trim() || kitEditComponents.length === 0 ? 0.4 : 1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                <Save size={16} /> {t('inventory.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showKitModal && (
        <div className={`modal-overlay${kitDrag.closing ? ' closing' : ''}`} onClick={kitDrag.onOverlayClick}>
          <div className={`modal${kitDrag.jiggling ? ' modal-jiggle' : ''}${kitDrag.closing ? ' closing' : ''}`} style={{ position:'relative', maxHeight:'92dvh', display:'flex', flexDirection:'column', padding:0 }} {...kitDrag.props}>
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <button className="close-btn" onClick={kitDrag.close}>✕</button>
              <h2 style={{ marginBottom:14, display:'flex', alignItems:'center', gap:8 }}><Kit size={20} /> {t('inventory.newKitTitle')}</h2>
              <input value={kitForm.name} onChange={e => setKitForm({...kitForm,name:e.target.value})} placeholder={t('inventory.kitNamePlaceholderNew')} style={{ marginBottom:8, fontWeight:600, fontSize:16 }} />
              <input value={kitForm.location} onChange={e => setKitForm({...kitForm,location:e.target.value})} placeholder={t('inventory.kitLocationPlaceholderNew')} style={{ fontSize:13, marginBottom:10 }} />
              <select value={kitForm.category} onChange={e => setKitForm({...kitForm,category:e.target.value})} style={{ marginBottom:10, fontSize:13, fontWeight:600 }}>
                {KIT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <p style={{ fontSize:13, color:'var(--text2)', fontWeight:600, whiteSpace:'nowrap' }}>{t('inventory.howManyKits')}</p>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <button onClick={() => setKitForm(f => ({...f, qty:Math.max(1,f.qty-1)}))} style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                  <input type="number" min="1" value={kitForm.qty} onChange={e => setKitForm(f => ({...f, qty:Math.max(1,parseInt(e.target.value)||1)}))} style={{ width:52, textAlign:'center', fontWeight:800, fontSize:16, padding:'4px 6px' }} />
                  <button onClick={() => setKitForm(f => ({...f, qty:f.qty+1}))} style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                </div>
              </div>
            </div>
            {kitComponents.length > 0 && (
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'rgba(245,166,35,0.04)' }}>
                <p style={{ color:'var(--accent2)', fontSize:12, fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('inventory.kitContents')}</p>
                {kitComponents.map(comp => (
                  <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text)' }}>{comp.name}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <button onClick={() => setKitComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:Math.max(1,c.qty-1)} : c))} style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>-</button>
                      <span style={{ fontWeight:800, fontSize:15, minWidth:22, textAlign:'center' }}>{comp.qty}</span>
                      <button onClick={() => setKitComponents(prev => prev.map(c => c.itemId===comp.itemId ? {...c,qty:Math.min(c.maxQty,c.qty+1)} : c))} style={{ width:26, height:26, borderRadius:6, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                    </div>
                    <button onClick={() => setKitComponents(prev => prev.filter(c => c.itemId !== comp.itemId))} style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'2px 6px' }}>x</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <input value={kitSearch} onChange={e => setKitSearch(e.target.value)} placeholder={t('inventory.searchItemToAdd')} style={{ fontSize:13 }} />
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {items.filter(i => !i.isBundle && !kitComponents.some(c => c.itemId===i.id)).filter(i => !kitSearch || i.name?.toLowerCase().includes(kitSearch.toLowerCase())).map(item => (
                <div key={item.id} className="item-row" onClick={() => { setKitComponents(prev => [...prev, { itemId:item.id, name:item.name, qty:1, maxQty:item.totalQty||1 }]); setKitSearch('') }}>
                  <div className="item-icon" style={{ fontSize:18 }}>{ICONS[item.category]||'📦'}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
                    <p style={{ color:'var(--text2)', fontSize:12 }}>{item.availableQty??item.totalQty} disp.</p>
                  </div>
                  <span style={{ color:'var(--accent)', fontSize:20, padding:'0 8px' }}>+</span>
                </div>
              ))}
            </div>
            <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', flexShrink:0, background:'var(--bg2)' }}>
              <button
                onClick={async () => {
                  if (!kitForm.name.trim() || kitComponents.length === 0) return
                  const kitQty = kitForm.qty || 1
                  const ref = await addDoc(collection(db, 'items'), {
                    name: kitForm.name.trim(), location: kitForm.location.trim(),
                    category: kitForm.category || 'Altro', isBundle: true,
                    components: kitComponents.map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty })),
                    totalQty: kitQty, availableQty: kitQty,
                    instances: ensureInstanceList([], kitQty),
                    teamId, createdAt: serverTimestamp(), createdBy: user.uid,
                  })
                  await updateDoc(ref, { code: generateItemCode(ref.id) })
                  setShowKitModal(false)
                }}
                className="btn btn-primary btn-full"
                disabled={!kitForm.name.trim() || kitComponents.length === 0}
                style={{ opacity: !kitForm.name.trim() || kitComponents.length === 0 ? 0.4 : 1 }}>
                {t('inventory.createKit', { prefix: kitForm.qty > 1 ? `${kitForm.qty}x ` : '', count: kitComponents.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Riga oggetto — estratta per essere riusata sia nella vista raggruppata per
// categoria (default) sia nella lista piatta ordinata (quando un filtro
// avanzato è attivo), senza duplicare tutto il markup nei due rami.
function ItemRow({ item, onOpen, t }) {
  return (
    <div className="item-row" onClick={() => onOpen(item)}>
      <div className="item-icon">{ICONS[item.category] || '📦'}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <p style={{ fontWeight:700, fontSize:15 }}>{item.name}</p>
          {item.isBundle && (
            <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', border:'1px solid rgba(245,166,35,0.3)', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:800, flexShrink:0, display:'inline-flex', alignItems:'center', gap:3 }}><Kit size={11} /> KIT</span>
          )}
        </div>
        <p style={{ color:'var(--text2)', fontSize:13 }}>{item.brand} {item.model}</p>
        {item.location && <p style={{ color:'var(--blue)', fontSize:12, marginTop:2, display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {item.location}</p>}
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <span className={`badge ${
          item.category === 'Consumabili'
            ? (item.minStock > 0 && (item.availableQty ?? item.totalQty) <= item.minStock ? 'partial' : 'in')
            : (item.availableQty === (item.totalQty - (item.brokenQty||0)) ? 'in' : item.availableQty === 0 ? 'out' : 'partial')
        }`}>
          {item.category === 'Consumabili'
            ? (item.availableQty ?? item.totalQty)
            : `${item.availableQty}/${item.totalQty}`
          }
        </span>
        {item.brokenQty > 0 && (
          <div style={{ marginTop:4 }}>
            <span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
              <Wrench size={11} /> {t('inventory.brokenCount', { count: item.brokenQty })}
            </span>
          </div>
        )}
        {kitHasIncompleteInstance(item) && (
          <div style={{ marginTop:4 }}>
            <span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
              <Warn size={11} /> {t('inventory.kitIncomplete')}
            </span>
          </div>
        )}
        {item.category === 'Consumabili' && item.minStock > 0 && (item.availableQty ?? item.totalQty) <= item.minStock && (
          <div style={{ marginTop:4 }}>
            <span style={{ background:'rgba(79,195,247,0.15)', color:'var(--blue)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
              <Cart size={11} /> {t('inventory.toReorder')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}