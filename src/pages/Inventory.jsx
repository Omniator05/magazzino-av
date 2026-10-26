import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useOperator } from '../context/OperatorContext'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { generateItemCode, generateUnitCode } from '../utils/generateCode'
import { eventRowIncludesItem } from '../utils/kitInventory'
import { renderLabelPNG, downloadDataUrl, labelFilename } from '../utils/labelImage'
import { formatDate } from '../utils/formatDate'
import { notifyTeamPush } from '../utils/pushNotifications'
import JSZip from 'jszip'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useModalDrag } from '../hooks/useModalDrag'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import ItemHistoryPanel from '../components/ItemHistoryPanel'
import { useCenteredModal } from '../hooks/useCenteredModal'
import { Pin, Cart, Box, Kit, Save, Wrench, Warn, Filter, Truck, Edit, Download, Plus, ChevronRight } from '../components/Icon'
import FabButton from '../components/FabButton'
import SaveButton from '../components/SaveButton'
import Picker from '../components/Picker'
import DailyQuip from '../components/DailyQuip'
import { parseCSV, mapRowsToItems } from '../utils/csvImport'
import { ensureInstanceList, kitHasIncompleteInstance } from '../utils/kitInstances'
import { warehouseLimit, promptLimitReached } from '../utils/planLimits'
import { getCodeDisplay } from '../utils/codeDisplay'
import LinkedItemsEditor from '../components/LinkedItemsEditor'
import { getLinkedItems, linkedItemsToFields } from '../utils/linkedItems'
import { QrCode, Barcode } from '../components/Icon'
import DeadlinesField from '../components/DeadlinesField'
import { syncDeadlineEvents } from '../utils/deadlines'
import { addIssue, removeIssueById, dropLastIssue, trimIssues, sortedIssues, countIssues } from '../utils/itemIssues'

// Colori pallino per la sezione Cronologia (dettaglio oggetto) — stessa
// mappa azione→colore usata nel modale modifica riga di EventDetail.jsx.
const ACTIVITY_COLORS = {
  added:'var(--blue)', removed:'var(--red)',
  pronto:'#059669', unpronto:'var(--text3)',
  loaded:'var(--accent2)', unloaded:'var(--text3)',
  returned:'var(--green)', unreturned:'var(--text3)',
  missing:'#ea580c', unmissing:'var(--text3)',
}
// Form oggetto. I dati tecnici (peso, consumo, portata, dimensioni in metri,
// seriale) restano stringhe finché non si salva (vuoto = non compilato,
// null su Firestore) — elenco riusato per decidere se la sezione "Dettagli
// oggetto" del modal parte aperta o chiusa (vedi sotto).
const DETAIL_FIELDS = ['weightKg', 'peakPowerW', 'loadCapacityKg', 'widthM', 'lengthM', 'heightM', 'serialNumber']
const emptyItemForm = () => ({
  name:'', category:'Altro', qty:1, brand:'', model:'', location:'', notes:'', brokenQty:0, defectQty:0, brokenNote:'', defectNote:'', issues:[], minStock:0, consumableUnit:'pezzi',
  weightKg:'', peakPowerW:'', loadCapacityKg:'', widthM:'', lengthM:'', heightM:'', serialNumber:'', linkedItems:[], deadlines:[],
})
const itemToForm = item => ({
  name:item.name, category:item.category, qty:item.totalQty, brand:item.brand||'', model:item.model||'', location:item.location||'', notes:item.notes||'',
  brokenQty:item.brokenQty||0, defectQty:item.defectQty||0, brokenNote:item.brokenNote||'', defectNote:item.defectNote||'', issues:item.issues||[], minStock:item.minStock||0, consumableUnit:item.consumableUnit||'pezzi',
  weightKg:item.weightKg ?? '', peakPowerW:item.peakPowerW ?? '', loadCapacityKg:item.loadCapacityKg ?? '',
  widthM:item.widthM ?? '', lengthM:item.lengthM ?? '', heightM:item.heightM ?? '', serialNumber:item.serialNumber || '',
  linkedItems:getLinkedItems(item), deadlines:item.deadlines || [],
})
// "1,5" o "1.5" → 1.5; vuoto/zero/non numerico → null (distingue "non compilato" da "davvero zero")
const parseDecimal = v => v !== '' && v != null ? (parseFloat(String(v).replace(',', '.')) || null) : null
const CATEGORIES =['Audio','Microfoni','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Traduzione','Connettività','Comunicazione','Strumenti','Altro']
const KIT_CATEGORIES = CATEGORIES
// Ordine di visualizzazione nella lista raggruppata — audio e microfoni
// vicini, poi video, poi luci e strutture (rigging) di seguito.
const CATEGORY_ORDER = ['Audio','Microfoni','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Traduzione','Connettività','Comunicazione','Strumenti','Altro']
// Unità di misura per i Consumabili — non tutti si contano allo stesso modo:
// moquette/gonna palco a metri, nastro a rotoli, taniche/fascette/pile a pezzi.
// "pezzi" resta il default per tutto il resto (retrocompatibile: gli oggetti
// esistenti senza questo campo si comportano come prima, in pezzi).
const CONSUMABLE_UNITS = ['pezzi', 'metri', 'rotoli']
const MAIN_CATS = ['Audio','Microfoni','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Traduzione','Connettività','Comunicazione','Strumenti']
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
  const { user, teamId, team, profile, isOwner } = useAuth()
  const confirm = useConfirm()
  const { operator } = useOperator()   // alla postazione: chi è collegato in quel momento (le aggiunte portano il suo nome)
  const navigate = useNavigate()
  const { state: navState, search: locationSearch } = useLocation()
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
  const [kitForm, setKitForm]           = useState({ name:'', location:'', qty:1, category:'Altro', linkedItems:[] })
  const [kitComponents, setKitComponents] = useState([])
  const [kitSearch, setKitSearch]       = useState('')
  const [kitLinkedSearch, setKitLinkedSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(null)
  const [itemActivityLog, setItemActivityLog] = useState([])
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showPrintPopup, setShowPrintPopup] = useState(false)
  // Menu rapido "Segnala": rotti / con difetto / pezzi ancora fuori (rientro parziale)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [issueDlg, setIssueDlg] = useState(null) // 'broken' | 'defect': popup "Segnala rotto/difetto" della modifica oggetto
  const [statusDraft, setStatusDraft] = useState({ broken: 0, defect: 0, out: 0, note: '', issues: [], addOpen: false, addType: 'broken', addUnit: '', addNote: '' })
  // Formato scelto per il download etichetta corrente — null finché non si
  // sceglie (solo se la squadra ha impostato "entrambi"; altrimenti è già
  // deciso dall'impostazione, vedi il click che apre il popup più sotto).
  const [printFormat, setPrintFormat] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importStep, setImportStep] = useState('instructions') // instructions | preview | importing | done
  const [importParsed, setImportParsed] = useState(null) // { items, warnings }
  const [importError, setImportError] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [form, setForm] = useState(emptyItemForm)
  const [linkedSearch, setLinkedSearch] = useState('')
  // Override manuale apertura/chiusura delle sezioni secondarie nel modal
  // oggetto (Dettagli/Scadenze/Collegati, Rotto) — per default una sezione si apre
  // da sola solo se ha già qualcosa dentro, altrimenti resta chiusa per
  // tenere il modal corto; un tap sull'intestazione vince sempre sul
  // default. Azzerato a ogni apertura del modal (openAdd/openEdit) così un
  // oggetto non eredita le sezioni aperte/chiuse di quello aperto prima.
  const [modalSectionToggle, setModalSectionToggle] = useState({})
  // Sezione del modal oggetto da portare in vista dopo l'apertura (es. dal
  // pulsante "Segnala rotto o difetto" del dettaglio).
  const [scrollToSection, setScrollToSection] = useState(null)
  useEffect(() => {
    if (!scrollToSection || !showModal) return
    const id = setTimeout(() => {
      document.getElementById(`rc-section-${scrollToSection}`)?.scrollIntoView({ block:'center', behavior:'smooth' })
      setScrollToSection(null)
    }, 380)
    return () => clearTimeout(id)
  }, [scrollToSection, showModal])
  // Modifiche non salvate: se non è stato toccato nulla un clic fuori dalla colonna la chiude subito, altrimenti
  // compare "Salvare le modifiche?" (vedi hooks/useUnsavedGuard.js). Si confronta il modulo con una fotografia
  // scattata all'apertura (formBase) o, per i kit, quando la colonna si apre.
  const formBase = useRef('')
  const kitEditBase = useRef('')
  const kitNewBase = useRef('')
  const itemGuard = useUnsavedGuard(() => showModal && JSON.stringify(form) !== formBase.current)
  const kitEditGuard = useUnsavedGuard(() => showKitEditModal && JSON.stringify([kitForm, kitEditComponents, kitEditInstances]) !== kitEditBase.current)
  const kitNewGuard = useUnsavedGuard(() => showKitModal && JSON.stringify([kitForm, kitComponents]) !== kitNewBase.current)
  const myDrag      = useModalDrag(() => setShowModal(false), itemGuard.guard)
  const detailDrag  = useModalDrag(() => setShowDetail(null))
  const addMenuDrag = useModalDrag(() => setShowAddMenu(false))
  const kitEditDrag = useModalDrag(() => setShowKitEditModal(false), kitEditGuard.guard)
  const kitDrag     = useModalDrag(() => setShowKitModal(false), kitNewGuard.guard)
  itemGuard.attach(myDrag); kitEditGuard.attach(kitEditDrag); kitNewGuard.attach(kitDrag)
  useEffect(() => { if (showKitEditModal) kitEditBase.current = JSON.stringify([kitForm, kitEditComponents, kitEditInstances]) }, [showKitEditModal])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showKitModal) kitNewBase.current = JSON.stringify([kitForm, kitComponents]) }, [showKitModal])   // eslint-disable-line react-hooks/exhaustive-deps
  // Computer con il mouse: lo storico sta dentro la colonna della scheda oggetto invece che in un'altra pagina
  const [desktopDrawer, setDesktopDrawer] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px) and (pointer: fine)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 900px) and (pointer: fine)')
    if (!mq) return
    const on = () => setDesktopDrawer(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const historyRef = useRef(null)
  const importModal = useCenteredModal(() => setShowImportModal(false))
  useModalScrollLock(showModal || showAddMenu || showKitModal || showKitEditModal || !!showDetail || showPrintPopup || showStatusMenu || !!issueDlg || showImportModal)
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
  // Eccezione: su telefono, aprire la tastiera per scrivere nel campo
  // posizione fa scorrere la pagina per portare il campo in vista — non è
  // l'utente che sta scorrendo la pagina, quindi mentre si scrive lì dentro
  // (l'input ha il focus) lo scroll non deve chiudere il pannello.
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

  // Cronologia "chi ha fatto cosa" sull'oggetto selezionato, attraverso TUTTI
  // gli eventi in cui è comparso — non solo quello corrente, che può anche
  // averlo già rimosso dalla propria lista (vedi src/utils/itemActivity.js).
  // Query solo quando il dettaglio è aperto: non serve caricarla per ogni
  // riga dell'intero magazzino.
  useEffect(() => {
    if (!showDetail?.id) { setItemActivityLog([]); return }
    const q = query(collection(db, 'itemActivity'), where('catalogItemId', '==', showDetail.id), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setItemActivityLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [showDetail?.id])

  // Riga evento che corrisponde all'oggetto selezionato — usata solo per il
  // riepilogo "Dove si trova" qui nel dettaglio compatto (dove/quando è
  // fuori ora, o l'ultima volta). Il filtro per singolo baule di un kit vive
  // ora nella pagina dedicata (InventoryItemHistory.jsx), non più qui.
  const matchesDetailItem = i => eventRowIncludesItem(i, showDetail.id, items)

  // Eventi in cui l'oggetto attualmente selezionato è caricato e non ancora rientrato
  const detailEvents = showDetail
    ? events.filter(ev => (ev.items || []).some(i => matchesDetailItem(i) && i.loaded && !i.returned))
    : []

  // Solo gli ultimi 5 (di qualunque stato) — qui serve giusto per il
  // riepilogo "ultima volta fuori" del dettaglio compatto qui sotto, non
  // per lo storico vero e proprio (quello, completo, sta nella pagina
  // dedicata InventoryItemHistory.jsx).
  const detailEventHistory = showDetail
    ? events
        .filter(ev => (ev.items || []).some(matchesDetailItem))
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

  // "Risolto" su una singola segnalazione del dettaglio: toglie quel pezzo da
  // rotti / con difetto (e per i rotti lo rimette tra i disponibili).
  const resolveIssue = async (issue) => {
    const it = showDetail
    const issues = removeIssueById(it.issues, issue.id)
    let upd
    if (issue.type === 'broken') {
      const newBroken = Math.max(0, (it.brokenQty || 0) - 1)
      const prevOut = (it.totalQty || 0) - (it.availableQty || 0) - (it.brokenQty || 0)
      upd = { issues, brokenQty: newBroken, availableQty: Math.max(0, it.totalQty - newBroken - prevOut), ...(newBroken === 0 ? { brokenNote: '' } : {}) }
    } else {
      const newDefect = Math.max(0, (it.defectQty || 0) - 1)
      upd = { issues, defectQty: newDefect, ...(newDefect === 0 ? { defectNote: '' } : {}) }
    }
    await updateDoc(doc(db, 'items', it.id), upd)
    setShowDetail(cur => ({ ...cur, ...upd }))
  }

  // Modifica oggetto: rotti / difetti si segnalano dal popup e finiscono nel form (si salvano con "Salva").
  // Un pezzo numerato rientra nel conteggio; "extra" sono i pezzi segnalati senza numero.
  const applyIssueReport = ({ type, extra, pieces, comment }) => setForm(f => {
    const qty = Math.max(1, parseInt(f.qty, 10) || 1)
    const clamp = v => Math.min(qty, Math.max(0, v))
    let issues = f.issues || []
    pieces.forEach(p => { issues = addIssue(issues, { type, unit: p.unit, note: p.note }) })
    const count = k => (f[k === 'broken' ? 'brokenQty' : 'defectQty'] || 0) + countIssues(issues, k) - countIssues(f.issues, k) + (k === type ? extra : 0)
    const noteKey = type === 'broken' ? 'brokenNote' : 'defectNote'
    const prev = (f[noteKey] || '').trim()
    const c = comment.trim()
    return { ...f, issues, brokenQty: clamp(count('broken')), defectQty: clamp(count('defect')), [noteKey]: c ? (prev && prev !== c ? `${prev} · ${c}` : c) : prev }
  })
  // "Riparato" (−1) o ✕ su un pezzo segnalato, dalla modifica oggetto
  const clearFormIssue = (type, issueId) => setForm(f => {
    const qtyKey = type === 'broken' ? 'brokenQty' : 'defectQty'
    const left = Math.max(0, (f[qtyKey] || 0) - 1)
    return { ...f, [qtyKey]: left, issues: issueId ? removeIssueById(f.issues, issueId) : dropLastIssue(f.issues, type), ...(left === 0 ? { [type === 'broken' ? 'brokenNote' : 'defectNote']: '' } : {}) }
  })

  const openStatusMenu = () => {
    const it = showDetail
    const prevOut = Math.max(0, (it.totalQty||0) - (it.availableQty||0) - (it.brokenQty||0))
    setStatusDraft({ broken: it.brokenQty || 0, defect: it.defectQty || 0, out: prevOut, note: '', issues: it.issues || [], addOpen: false, addType: 'broken', addUnit: '', addNote: '' })
    setShowStatusMenu(true)
  }
  // Segnalazioni per pezzo nel menu Segnala: aggiungere o togliere una voce
  // sposta di conseguenza i contatori rotti/con difetto.
  const applyDraftIssues = (issues) => setStatusDraft(d => {
    const total = showDetail?.totalQty || 0
    const clamp = v => Math.min(total, Math.max(0, v))
    return {
      ...d, issues,
      broken: clamp(d.broken + countIssues(issues, 'broken') - countIssues(d.issues, 'broken')),
      defect: clamp(d.defect + countIssues(issues, 'defect') - countIssues(d.issues, 'defect')),
    }
  })
  const addDraftIssue = () => {
    const total = showDetail?.totalQty || 1
    let unit = total > 1 ? parseInt(statusDraft.addUnit, 10) : null
    if (total > 1 && (!unit || unit < 1 || unit > total)) return
    const next = addIssue(statusDraft.issues, { type: statusDraft.addType, unit, note: statusDraft.addNote })
    applyDraftIssues(next)
    setStatusDraft(d => ({ ...d, addUnit: '', addNote: '', addOpen: false }))
  }
  // Applica in un colpo rotti / difetti / rientro parziale. availableQty si
  // ricalcola come nel salvataggio dell'oggetto: totale - rotti - ancora fuori.
  const saveStatusMenu = async () => {
    const it = showDetail
    const d = statusDraft
    const total = it.totalQty || 0
    const prevBroken = it.brokenQty || 0
    const prevDefect = it.defectQty || 0
    const prevOut = Math.max(0, total - (it.availableQty || 0) - prevBroken)
    const broken = Math.min(total, Math.max(0, d.broken))
    const defect = Math.min(total, Math.max(0, d.defect))
    const out = Math.min(prevOut, Math.max(0, d.out))
    const note = d.note.trim()
    const manualRaised = (cnt, type, prev) => (cnt - countIssues(d.issues, type)) > (prev - countIssues(it.issues, type))
    const upd = {
      brokenQty: broken,
      availableQty: Math.max(0, total - broken - out),
      defectQty: defect,
      brokenNote: broken === 0 ? '' : (manualRaised(broken, 'broken', prevBroken) && note ? note : (it.brokenNote || '')),
      defectNote: defect === 0 ? '' : (manualRaised(defect, 'defect', prevDefect) && note ? note : (it.defectNote || '')),
      issues: trimIssues(d.issues, broken, defect),
    }
    // Segnalazioni nuove per il testo della notifica ("n° 7: la porta non funziona")
    const knownIds = new Set((it.issues || []).map(i => i.id))
    const describe = type => upd.issues.filter(i => i.type === type && !knownIds.has(i.id))
      .map(i => (i.unit ? `n° ${i.unit}` : '') + (i.note ? `${i.unit ? ': ' : ''}${i.note}` : '')).filter(Boolean)
    await updateDoc(doc(db, 'items', it.id), upd)
    setShowDetail(cur => ({ ...cur, ...upd }))
    if (broken > prevBroken) {
      notifyTeamPush({ title: t('inventory.pushBrokenTitle'), body: [it.name, ...describe('broken'), note].filter(Boolean).join(' — '), url: '/inventory?filter=broken', audience: { type: 'admins' } })
    }
    if (defect > prevDefect) {
      notifyTeamPush({ title: t('inventory.pushDefectTitle'), body: [it.name, ...describe('defect'), note].filter(Boolean).join(' — '), url: '/inventory?filter=defect', audience: { type: 'admins' } })
    }
    return true
  }

  const openAdd = () => { const f = emptyItemForm(); formBase.current = JSON.stringify(f); setSelected(null); setForm(f); setLinkedSearch(''); setModalSectionToggle({}); setShowModal(true) }
  const openEdit = (item, focusSection = null) => {
    if (item.isBundle) {
      // Kit — apri il builder dedicato
      setEditingKit(item)
      setKitForm({ name:item.name, location:item.location||'', qty:item.totalQty||1, category:item.category||'Altro', linkedItems:getLinkedItems(item) })
      setKitEditComponents((item.components||[]).map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty, maxQty:99 })))
      setKitEditInstances(item.instances || [])
      setKitEditSearch('')
      setKitLinkedSearch('')
      setShowKitEditModal(true)
    } else {
      const f = itemToForm(item); formBase.current = JSON.stringify(f)
      setSelected(item); setForm(f); setLinkedSearch(''); setModalSectionToggle(focusSection ? { [focusSection]: true } : {}); setScrollToSection(focusSection); setShowModal(true)
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

  // Ritorna true solo se ha davvero scritto qualcosa — SaveButton mostra la
  // spunta e chiude il modal solo in quel caso, mai sui rami che si fermano
  // prima (validazione, limite piano gratuito, conferma rifiutata).
  const saveItem = async () => {
    if (!form.name.trim()) return false
    const qty = parseInt(form.qty) || 1
    // Entrambi opzionali (solo per gli oggetti "importanti" che vale la pena
    // tracciare) — stringa vuota resta null, non 0, per distinguere "non
    // compilato" da "davvero zero" e non sporcare la scheda di ogni oggetto.
    const details = {
      weightKg: parseDecimal(form.weightKg),
      peakPowerW: form.peakPowerW !== '' ? (parseInt(form.peakPowerW) || null) : null,
      loadCapacityKg: parseDecimal(form.loadCapacityKg),
      widthM: parseDecimal(form.widthM),
      lengthM: parseDecimal(form.lengthM),
      heightM: parseDecimal(form.heightM),
      serialNumber: form.serialNumber.trim() || null,
    }
    if (!selected) {
      const warehouseCap = warehouseLimit(team)
      if (items.length >= warehouseCap) {
        await promptLimitReached({ confirm, navigate, isAdmin: isOwner, t, message: t('planLimits.itemsInWarehouseMsg', { limit: warehouseCap }) })
        return false
      }
      const dup = items.find(i => i.name.trim().toLowerCase() === form.name.trim().toLowerCase())
      if (dup && !(await confirm({ title: t('inventory.confirmDuplicateTitle'), message: t('inventory.confirmDuplicateMessage', { name: dup.name }), confirmLabel: t('inventory.confirmDuplicateLabel') }))) return false
    }
    if (selected) {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      // Ricalcola availableQty: totalQty - rotti - (quelli fuori, cioè totalQty - availableQty attuale - rotti vecchi)
      const prevBroken = selected.brokenQty || 0
      const prevOut = (selected.totalQty||0) - (selected.availableQty||0) - prevBroken
      const newAvailable = Math.max(0, qty - broken - prevOut)
      const deadlines = await syncDeadlineEvents(selected.deadlines || [], form.deadlines || [], { subjectName: form.name, teamId, userId: user.uid })
      await updateDoc(doc(db, 'items', selected.id), { name:form.name, category:form.category, totalQty:qty, availableQty:newAvailable, brokenQty:broken, brokenNote: broken > 0 ? (form.brokenNote || '').trim() : '', defectQty: Math.min(parseInt(form.defectQty)||0, qty), defectNote: (parseInt(form.defectQty)||0) > 0 ? (form.defectNote || '').trim() : '', issues: trimIssues(form.issues, broken, Math.min(parseInt(form.defectQty)||0, qty)), brand:form.brand, model:form.model, location:form.location, notes:form.notes, minStock:parseInt(form.minStock)||0, consumableUnit: form.category === 'Consumabili' ? form.consumableUnit : null, ...details, ...linkedItemsToFields(form.linkedItems), deadlines })
      // Solo admin, solo quando aumenta (non quando si segna "riparato"): è
      // l'unico verso che segnala davvero un problema da gestire.
      // Pezzi segnalati nuovi (con numero e descrizione) per il testo: "n° 7: lente crepata"
      const knownIds = new Set((selected.issues || []).map(i => i.id))
      const describe = type => (form.issues || []).filter(i => i.type === type && !knownIds.has(i.id))
        .map(i => (i.unit ? `n° ${i.unit}` : '') + (i.note ? `${i.unit ? ': ' : ''}${i.note}` : '')).filter(Boolean)
      if (broken > prevBroken) {
        notifyTeamPush({
          title: t('inventory.pushBrokenTitle'),
          body: [form.name, ...describe('broken'), (form.brokenNote || '').trim()].filter(Boolean).join(' — '),
          url: '/inventory?filter=broken',
          audience: { type: 'admins' },
        })
      }
      if ((parseInt(form.defectQty)||0) > (selected.defectQty || 0)) {
        notifyTeamPush({
          title: t('inventory.pushDefectTitle'),
          body: [form.name, ...describe('defect'), (form.defectNote || '').trim()].filter(Boolean).join(' — '),
          url: '/inventory?filter=defect',
          audience: { type: 'admins' },
        })
      }
    } else {
      const broken = Math.min(parseInt(form.brokenQty)||0, qty)
      const ref = await addDoc(collection(db, 'items'), {
        name:form.name, category:form.category, totalQty:qty, availableQty:qty - broken, minStock:parseInt(form.minStock)||0,
        brokenQty:broken, brokenNote: broken > 0 ? (form.brokenNote || '').trim() : '', defectQty: Math.min(parseInt(form.defectQty)||0, qty), defectNote: (parseInt(form.defectQty)||0) > 0 ? (form.defectNote || '').trim() : '', issues: trimIssues(form.issues, broken, Math.min(parseInt(form.defectQty)||0, qty)), consumableUnit: form.category === 'Consumabili' ? form.consumableUnit : null,
        brand:form.brand, model:form.model, location:form.location, notes:form.notes, ...details, ...linkedItemsToFields(form.linkedItems),
        deadlines:[], teamId, createdAt:serverTimestamp(), createdBy: operator?.userId || user.uid
      })
      await updateDoc(ref, { code: generateItemCode(ref.id) })
      if (form.deadlines.length > 0) {
        const deadlines = await syncDeadlineEvents([], form.deadlines, { subjectName: form.name, teamId, userId: user.uid })
        await updateDoc(ref, { deadlines })
      }
    }
    return true
  }

  const deleteItem = async item => {
    if (await confirm({ title: t('inventory.confirmDeleteItemTitle'), message: t('inventory.confirmDeleteItemMessage'), confirmLabel: t('inventory.confirmDeleteItemLabel'), danger: true })) {
      // Toglie anche gli eventuali promemoria di calendario collegati alle
      // scadenze — altrimenti un oggetto eliminato lascerebbe eventi orfani.
      if (item.deadlines?.length) await syncDeadlineEvents(item.deadlines, [], { subjectName: item.name, teamId, userId: user.uid })
      await deleteDoc(doc(db, 'items', item.id))
      setShowDetail(null)
    }
  }

  const openDetail = item => {
    setShowDetail(item)
  }

  // Etichette come immagine PNG 680×180 pronta per il software della stampante
  // termica — niente dialogo di stampa del browser, che dipende da formato
  // pagina/margini ed è inaffidabile per etichette di quella dimensione.
  const printCode = async (format) => {
    const code = showDetail.code || generateItemCode(showDetail.id)
    const png = await renderLabelPNG({ name: showDetail.name, location: showDetail.location, code, teamId, format })
    downloadDataUrl(png, labelFilename(showDetail.name, code))
  }

  const printUnitLabels = async (format) => {
    const baseCode = showDetail.code || generateItemCode(showDetail.id)
    const totalUnits = showDetail.totalQty || 1
    const unitCodes = Array.from({ length: totalUnits }, (_, i) => generateUnitCode(baseCode, i + 1))

    const zip = new JSZip()
    for (const code of unitCodes) {
      const png = await renderLabelPNG({ name: showDetail.name, location: showDetail.location, code, teamId, format })
      zip.file(labelFilename(showDetail.name, code), png.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadDataUrl(URL.createObjectURL(blob), `etichette-${labelFilename(showDetail.name, baseCode).replace('.png', '')}.zip`)
  }

  const printAllLabels = async () => {
    if (items.length === 0) return
    // Nessuna scelta interattiva qui (esportazione di tutto il magazzino in
    // blocco): se la squadra usa "entrambi" si stampa in QR, il default storico.
    const format = getCodeDisplay(team) === 'barcode' ? 'barcode' : 'qr'
    const itemsWithCodes = items.map(i => ({ ...i, code: i.code || generateItemCode(i.id) }))

    const zip = new JSZip()
    for (const item of itemsWithCodes) {
      const totalUnits = item.totalQty || 1
      const unitCodes = totalUnits > 1
        ? Array.from({ length: totalUnits }, (_, i) => generateUnitCode(item.code, i + 1))
        : [item.code]
      for (const code of unitCodes) {
        const png = await renderLabelPNG({ name: item.name, location: item.location, code, teamId, format })
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
    // Piano gratuito: un import CSV può portare ben oltre il limite in un
    // colpo solo — si importa solo fino a riempire lo spazio rimasto, il
    // resto va scartato con un avviso invece di sforare in silenzio.
    const warehouseCap = warehouseLimit(team)
    const headroom = Math.max(0, warehouseCap - items.length)
    const toImport = importParsed.items.slice(0, headroom)
    const skipped = importParsed.items.length - toImport.length
    for (let i = 0; i < toImport.length; i++) {
      const it = toImport[i]
      const ref = await addDoc(collection(db, 'items'), {
        name: it.name, category: it.category, totalQty: it.totalQty, availableQty: it.totalQty,
        minStock: 0, brokenQty: 0, brand: it.brand, model: it.model, location: it.location, notes: it.notes,
        teamId, createdAt: serverTimestamp(), createdBy: operator?.userId || user.uid,
      })
      await updateDoc(ref, { code: generateItemCode(ref.id) })
      setImportProgress(i + 1)
    }
    setImportStep('done')
    if (skipped > 0) {
      await promptLimitReached({ confirm, navigate, isAdmin: isOwner, t, message: t('planLimits.importCappedMsg', { imported: toImport.length, limit: warehouseCap, skipped }) })
    }
  }

  // location.state (navigazione interna, es. da Dashboard) oppure ?filter=
  // nell'URL — quest'ultimo serve ad aprire il filtro giusto da un link
  // "esterno" alla navigazione in-app (es. una notifica push), che non può
  // portare con sé un location.state.
  const [activeFilter, setActiveFilter] = useState(navState?.filter || new URLSearchParams(locationSearch).get('filter') || 'all')
  // Override manuale dell'utente sull'apertura/chiusura di una categoria —
  // per default sono tutte aperte, ma un tap sulla freccia vince sempre sul
  // default finché non cambia ricerca/filtro.
  const [manualCollapse, setManualCollapse] = useState({})

  const filtered = items.filter(i => {
    const matchSearch = !search ||
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase()) ||
      i.brand?.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (activeFilter === 'out')     return (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)
    if (activeFilter === 'broken')  return (i.brokenQty || 0) > 0
    if (activeFilter === 'defect')  return (i.defectQty || 0) > 0
    if (activeFilter === 'reorder') return i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock
    return true
  })

  // Per il filtro "Fuori": a quali eventi è dovuta la giacenza ridotta, a
  // colpo d'occhio senza dover aprire ogni oggetto — riusa `events`, già
  // caricato per l'intera pagina (stessa logica di "dove si trova" nel
  // dettaglio), niente query aggiuntive.
  // "Fuori" copre anche il caso "segnato rientrato ma lasciato fuori"
  // (pressione lunga su Scarico in WorkerScanner, returnedConsumed:true):
  // lì `returned` è true — solo `loaded && !returned` non basterebbe a
  // farlo comparire qui, nonostante la giacenza resti comunque ridotta.
  const getOutEventNames = (item) => events
    .filter(ev => (ev.items || []).some(i =>
      eventRowIncludesItem(i, item.id, items) && i.loaded && (!i.returned || i.returnedConsumed)
    ))
    .map(ev => ev.name)

  const countOut    = items.filter(i => (i.availableQty ?? i.totalQty) < i.totalQty && !(i.brokenQty > 0)).length
  const countBroken = items.filter(i => (i.brokenQty || 0) > 0).length
  const countDefect = items.filter(i => (i.defectQty || 0) > 0).length
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

  // "Dimenticato": segnato rientrato con la pressione lunga in WorkerScanner
  // (returnedConsumed) — in pratica lasciato fuori senza ripristinare la
  // giacenza. Va isolato in un gruppo suo, in cima, invece di restare
  // mescolato nella sua categoria normale dove passerebbe inosservato.
  // category !== 'Consumabili': per un consumabile returnedConsumed non
  // significa mai "dimenticato" — è il suo esito normale, "consumato" (vedi
  // askConsumableIntact in WorkerScanner.jsx, che ora scala anche totalQty).
  // Stessa esclusione già usata da isForgottenReturn in WorkerScanner.jsx.
  const isForgottenItem = (item) => item.category !== 'Consumabili' && events.some(ev => (ev.items || []).some(i =>
    (i.id === item.id || i.itemRef === item.id) && i.returned && i.returnedConsumed
  ))

  // Raggruppa per categoria — kit appaiono nel loro gruppo, non in 'Kit';
  // i "dimenticati" escono dalla loro categoria normale per finire nel
  // gruppo dedicato in cima, ma SOLO quando si sta guardando il filtro
  // "Fuori" — altrove restano nella loro categoria come tutti gli altri.
  const showForgottenGroup = activeFilter === 'out'
  const forgottenItems = showForgottenGroup ? filtered.filter(isForgottenItem) : []
  // Un oggetto "richiede attenzione" se c'è qualcosa da fare su di lui (fuori,
  // rotto, sotto scorta minima, kit incompleto) — una categoria con almeno
  // uno così parte aperta di default, le altre (tutto a posto) collassate:
  // si vede subito cosa serve senza scorrere categorie già ok.
  const itemNeedsAttention = i =>
    (i.availableQty || 0) < (i.totalQty || 0) || (i.brokenQty || 0) > 0 ||
    (i.category === 'Consumabili' && (i.minStock || 0) > 0 && (i.availableQty || 0) <= i.minStock) ||
    kitHasIncompleteInstance(i)
  const groupedFiltered = [
    ...(forgottenItems.length > 0 ? [{ cat: '__forgotten__', catItems: forgottenItems, isForgottenGroup: true }] : []),
    ...CATEGORY_ORDER.map(cat => ({
      cat,
      catItems: cat === 'Altro'
        ? filtered.filter(i => !MAIN_CATS.includes(i.category) && !(showForgottenGroup && isForgottenItem(i)))
        : filtered.filter(i => i.category === cat && !(showForgottenGroup && isForgottenItem(i))),
    })).filter(g => g.catItems.length > 0),
  ].map(g => ({ ...g, needsAttention: g.isForgottenGroup || g.catItems.some(itemNeedsAttention) }))
  const narrowed = search.trim() !== '' || activeFilter !== 'all'

  return (
    <div className="page">
      <div className="page-header rc-page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>{t('inventory.title')}</h1><p>{t('inventory.itemsCount', { count: items.length })}</p></div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Menu azioni — 3 puntini */}
            <div style={{ position:'relative' }}>
              <button
                onClick={() => setShowActionsMenu(v => !v)}
                aria-label={t('inventory.actionsMenuAria')}
                aria-expanded={showActionsMenu}
                className="rc-pill-btn"
                style={{ padding:'9px 14px', fontSize:18, lineHeight:1 }}
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
                    background:'var(--c-surface)', border:'1px solid var(--c-line)',
                    borderRadius:14, boxShadow:'0 12px 32px rgba(0,0,0,0.20)',
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

      <div className="search-bar rc-inv-search" style={{ position:'relative', display:'flex', alignItems:'center', gap:8 }}>
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
            className="rc-pill-btn"
            style={{ position:'relative', width:42, height:42, padding:0, flexShrink:0 }}
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
                  background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:14,
                  boxShadow:'0 12px 32px rgba(0,0,0,0.20)', width:250, padding:14,
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
                    {/* Campo compatto che si espande al tap — stesso principio del
                        DateField: di default il pannello resta basso (soprattutto
                        su mobile), la griglia con le 13 categorie si vede solo
                        quando serve davvero cambiarla. */}
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

      {/* Filtri rapidi - scrollabili orizzontalmente */}
      <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <div style={{ display:'flex', gap:8, padding:'10px 16px', width:'max-content', minWidth:'100%' }}>
        {[
          { key:'all',    label:t('inventory.filterAll'), count: items.length },
          { key:'out',     label:t('inventory.filterOut'),         count: countOut,    color:'var(--accent2)', bg:'rgba(245,166,35,0.12)', border:'rgba(245,166,35,0.3)' },
          { key:'broken',  label:t('inventory.filterBroken'),         count: countBroken, color:'var(--red)',     bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.3)' },
          ...(countDefect > 0 || activeFilter === 'defect' ? [{ key:'defect', label:t('inventory.filterDefect'), count: countDefect, color:'#b45309', bg:'rgba(217,119,6,0.14)', border:'rgba(217,119,6,0.35)' }] : []),
          { key:'reorder', label:t('inventory.filterReorder'), count: countReorder,color:'var(--blue)',    bg:'rgba(79,195,247,0.12)',  border:'rgba(79,195,247,0.3)' },
        ].map(f => (
          <button key={f.key} onClick={() => setActiveFilter(f.key)} aria-pressed={activeFilter === f.key}
            style={{
              padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:700,
              background: activeFilter === f.key ? (f.bg || '#e63946') : 'var(--c-fill)',
              color: activeFilter === f.key ? (f.color || '#fff') : 'var(--c-ink2)',
              border: `1px solid ${activeFilter === f.key ? (f.border || '#e63946') : 'transparent'}`,
              display:'flex', alignItems:'center', gap:5,
            }}>
            {f.label}
            {f.count > 0 && (
              <span style={{ background: activeFilter === f.key ? 'rgba(0,0,0,0.12)' : 'var(--c-line)', borderRadius:10, padding:'1px 6px', fontSize:11 }}>
                {f.count}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {(advancedFiltersActive ? sortedFlat.length === 0 : filtered.length === 0)
        ? <div className="rc-inv-card" style={{ background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:16, margin:'12px 16px 0', overflow:'hidden' }}>
            <div className="empty-state">
              <p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={42} /></p><h3>{t('inventory.emptyTitle')}</h3><p>{t('inventory.emptyDesc')}</p>
              {/* Solo se il magazzino è VERAMENTE vuoto — non quando questo
                  stesso blocco compare per un filtro/ricerca senza risultati,
                  dove una battuta sarebbe fuori posto. */}
              {items.length === 0 && <DailyQuip quips={t('inventory.emptyQuips', { returnObjects:true })} />}
            </div>
          </div>
        : advancedFiltersActive
        ? <div className="rc-inv-card" style={{ background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:16, margin:'12px 16px 0', overflow:'hidden' }}>
            {sortedFlat.map(item => <ItemRow key={item.id} item={item} onOpen={openDetail} t={t} outEvents={activeFilter === 'out' ? getOutEventNames(item) : null} />)}
          </div>
        : groupedFiltered.map(({ cat, catItems, isForgottenGroup, needsAttention }) => {
            // Tutte le categorie sono aperte di default (anche nelle squadre nuove, dove
            // altrimenti si vedrebbero solo intestazioni chiuse) — un tap dell'utente sulla
            // freccia vince sempre sul default.
            const defaultOpen = true
            const open = manualCollapse[cat] != null ? !manualCollapse[cat] : defaultOpen
            return (
              <div key={cat} className="rc-inv-card" style={{ background:'var(--c-surface)', border: isForgottenGroup ? '1px solid rgba(245,166,35,0.35)' : '1px solid var(--c-line)', borderRadius:16, margin:'12px 16px 0', overflow:'hidden' }}>
                {/* Intestazione categoria (o gruppo "dimenticati", sempre in cima) —
                    cliccabile per aprire/chiudere, non solo decorativa. */}
                <button type="button" className="btn-no-anim" onClick={() => setManualCollapse(c => ({ ...c, [cat]: open }))}
                  aria-expanded={open}
                  style={{ width:'100%', padding:'7px 14px', background: isForgottenGroup ? 'rgba(245,166,35,0.12)' : 'var(--c-alt)', borderBottom: open ? `1px solid ${isForgottenGroup ? 'rgba(245,166,35,0.3)' : 'var(--c-line)'}` : 'none', display:'flex', alignItems:'center', gap:8, textAlign:'left' }}>
                  {isForgottenGroup && <span style={{ color:'var(--accent2)', display:'flex' }}><Warn size={14} /></span>}
                  <span style={{ fontWeight:800, fontSize:12, color: isForgottenGroup ? 'var(--accent2)' : 'var(--c-ink)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{isForgottenGroup ? t('inventory.forgottenCategory') : cat}</span>
                  {!isForgottenGroup && needsAttention && (
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent2)', flexShrink:0 }} />
                  )}
                  <span style={{ fontSize:12, color: isForgottenGroup ? 'var(--accent2)' : 'var(--text3)', marginLeft:'auto', fontWeight: isForgottenGroup ? 700 : 400 }}>{catItems.length}</span>
                  <span style={{ color:'var(--text3)', display:'flex', transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.15s ease' }}><ChevronRight size={14} /></span>
                </button>
                {open && catItems.map(item => <ItemRow key={item.id} item={item} onOpen={openDetail} t={t} outEvents={isForgottenGroup || activeFilter === 'out' ? getOutEventNames(item) : null} />)}
              </div>
            )
          })
      }

      {/* Modal aggiunta/modifica */}
      {/* Modal aggiunta/modifica articolo — informazioni di base sempre
          visibili, le altre tre sezioni sono accordion sempre chiusi per
          default (anche se già contengono dati): tiene il modal corto
          invece di scrollare tutto sempre aperto. */}
      {showModal && (() => {
        const detailsFilledCount = DETAIL_FIELDS.filter(k => String(form[k] ?? '').trim() !== '').length
        const deadlinesCount = (form.deadlines || []).length
        const linkedCount = (form.linkedItems || []).length
        const detailsOpen = modalSectionToggle.details === true
        const deadlinesOpen = modalSectionToggle.deadlines === true
        const linkedOpen = modalSectionToggle.linked === true
        // Rotto / con difetto: si apre da sola se c'è già un problema segnalato
        const issuesCount = (form.brokenQty || 0) + (form.defectQty || 0)
        const issuesOpen = modalSectionToggle.issues ?? issuesCount > 0
        // Sezioni a scomparsa come schede arrotondate (stesso linguaggio della
        // colonna del Calendario): intestazione sempre visibile, contenuto
        // dentro la scheda quando è aperta.
        const section = (key, label, open, count, body) => (
          <div id={`rc-section-${key}`} className="rc-acc" style={{ border:'1px solid var(--c-line)', borderRadius:14, background:'var(--c-alt)', overflow:'hidden' }}>
            <button type="button" className="btn-no-anim rc-acc-head" onClick={() => setModalSectionToggle(s => ({ ...s, [key]: !open }))}
              aria-expanded={open}
              style={{ width:'100%', padding:'13px 14px', background:'transparent', display:'flex', alignItems:'center', gap:8, textAlign:'left', borderBottom: open ? '1px solid var(--c-line)' : 'none' }}>
              <span style={{ fontSize:12.5, fontWeight:800, color:'var(--c-ink)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</span>
              {count > 0 && <span style={{ fontSize:11, fontWeight:800, color:'var(--c-ink2)', background:'var(--c-fill)', borderRadius:20, padding:'1px 8px' }}>{count}</span>}
              <span style={{ marginLeft:'auto', color:'var(--c-ink3)', display:'flex', transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.15s ease' }}><ChevronRight size={14} /></span>
            </button>
            {open && <div className="rc-acc-body" style={{ padding:'14px 14px 2px' }}>{body}</div>}
          </div>
        )
        return (
        <div className={`modal-overlay rc-drawer-overlay${myDrag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) myDrag.close() }}>
          <div className={`modal rc-sheet rc-drawer${myDrag.jiggling ? ' modal-jiggle' : ''}${myDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...myDrag.props}>
            <div className="rc-drawer-head rc-dc"><div className="rc-drawer-titlebar rc-dc">
              <button className="close-btn" onClick={myDrag.close} aria-label={t("common.close")}>✕</button>
              <h2>{selected ? t('inventory.editItemTitle') : t('inventory.newItemTitle')}</h2>
            </div></div>

            <div className="rc-drawer-body rc-dc rc-cols">
              <div className="form-group"><label>{t('inventory.nameLabel')}</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder={t('inventory.namePlaceholder')} /></div>
              <div className="form-group"><label>{t('inventory.categoryLabel')}</label>
                <Picker
                  value={form.category}
                  onChange={category => setForm({...form, category})}
                  ariaLabel={t('inventory.categoryLabel')}
                  options={CATEGORIES.map(c => ({ value:c, label:c, icon:ICONS[c] }))}
                />
              </div>
              {/* Unità di misura — solo Consumabili: non tutti si contano allo
                  stesso modo (moquette/gonna palco a metri, nastro a rotoli,
                  taniche a pezzi). Determina in cosa si esprime la giacenza
                  sotto, quindi va scelta PRIMA della quantità. */}
              {form.category === 'Consumabili' && (
                <div className="form-group">
                  <label>{t('inventory.consumableUnitLabel')}</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {CONSUMABLE_UNITS.map(u => (
                      <button key={u} type="button" onClick={() => setForm({...form, consumableUnit:u})}
                        aria-pressed={form.consumableUnit === u}
                        style={{
                          flex:1, padding:'10px 8px', borderRadius:10, fontSize:13, fontWeight:700,
                          background: form.consumableUnit === u ? '#e63946' : 'var(--c-fill)',
                          color: form.consumableUnit === u ? '#fff' : 'var(--c-ink2)',
                          border:'none',
                        }}>
                        {t(`inventory.consumableUnit_${u}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group"><label>{t('inventory.brandLabel')}</label><input value={form.brand} onChange={e => setForm({...form,brand:e.target.value})} placeholder={t('inventory.brandPlaceholder')} /></div>
                <div className="form-group"><label>{t('inventory.modelLabel')}</label><input value={form.model} onChange={e => setForm({...form,model:e.target.value})} placeholder={t('inventory.modelPlaceholder')} /></div>
              </div>
              <div className="form-group"><label>{form.category === 'Consumabili' ? t(`inventory.totalQtyLabel_${form.consumableUnit}`) : t('inventory.totalQtyLabel')}</label>
                <Stepper value={form.qty} min={1} onChange={qty => setForm({...form, qty, brokenQty: Math.min(form.brokenQty, qty), defectQty: Math.min(form.defectQty || 0, qty)})}
                  decAria={t('eventDetail.decreaseQtyAria')} incAria={t('eventDetail.increaseQtyAria')} />
              </div>
              <div className="form-group"><label>{t('inventory.locationLabel')}</label><input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder={t('inventory.locationPlaceholder')} /></div>
              <div className="form-group"><label>{t('inventory.notesLabel')}</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} /></div>
              {/* Soglia scorta minima — solo per Consumabili */}
              {form.category === 'Consumabili' && (
                <div className="form-group">
                  <label>{t('inventory.minStockLabel')}</label>
                  <Stepper value={form.minStock || 0} min={0} onChange={minStock => setForm({...form, minStock})}
                    decAria={t('inventory.decreaseMinStockAria')} incAria={t('inventory.increaseMinStockAria')} />
                  {(form.minStock||0) > 0 && <p style={{ color:'var(--c-ink2)', fontSize:12, marginTop:8 }}>{t('inventory.minStockHint', { count: form.minStock, unit: t(`inventory.unitShort_${form.consumableUnit || 'pezzi'}`) })}</p>}
                </div>
              )}

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
              {section('issues', t('inventory.issuesSectionTitle'), issuesOpen, issuesCount, (
                <div style={{ paddingBottom:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <button type="button" className="btn-no-anim" onClick={() => setIssueDlg('broken')}
                      style={{ minHeight:46, borderRadius:12, background:'rgba(230,57,70,0.10)', border:'1px solid rgba(230,57,70,0.3)', color:'#e63946', fontWeight:800, fontSize:13.5, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <Wrench size={15} /> {t('inventory.reportBrokenBtn')}
                    </button>
                    <button type="button" className="btn-no-anim" onClick={() => setIssueDlg('defect')}
                      style={{ minHeight:46, borderRadius:12, background:'rgba(217,119,6,0.10)', border:'1px solid rgba(217,119,6,0.35)', color:'#b45309', fontWeight:800, fontSize:13.5, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <Warn size={15} /> {t('inventory.reportDefectBtn')}
                    </button>
                  </div>
                  {[['broken', 'brokenQty', 'brokenNote', '#e63946', 'rgba(230,57,70,0.08)', 'rgba(230,57,70,0.25)', 'brokenLabel', 'repairOneButton'],
                    ['defect', 'defectQty', 'defectNote', '#b45309', 'rgba(217,119,6,0.08)', 'rgba(217,119,6,0.3)', 'defectLabel', 'defectFixedButton']].map(([type, qk, nk, color, bg, border, label, fixKey]) => (form[qk] || 0) > 0 && (
                    <div key={type} style={{ marginTop:12, padding:'10px 12px', borderRadius:12, background:bg, border:`1px solid ${border}` }}>
                      <p style={{ margin:0, fontSize:13.5, fontWeight:800, color }}>{t(`inventory.${label}`)}: {form[qk]}</p>
                      {form[nk] && <p style={{ margin:'3px 0 0', fontSize:13, color:'var(--c-ink)', lineHeight:1.45, overflowWrap:'anywhere' }}>{form[nk]}</p>}
                      {sortedIssues(form.issues).filter(i => i.type === type).map(i => (
                        <div key={i.id} style={{ display:'flex', alignItems:'center', gap:8, paddingTop:6 }}>
                          <span style={{ fontSize:12, fontWeight:800, color, whiteSpace:'nowrap' }}>{i.unit ? t('inventory.issuePieceNumber', { n: i.unit }) : t('inventory.issuePieceNoNumber')}</span>
                          <span style={{ flex:1, minWidth:0, fontSize:12.5, color:'var(--c-ink)', overflowWrap:'anywhere' }}>{i.note || '—'}</span>
                          <button type="button" className="btn-no-anim" aria-label={t('inventory.issueRemoveAria')} onClick={() => clearFormIssue(type, i.id)}
                            style={{ background:'transparent', color:'var(--c-ink3)', fontSize:15, width:30, height:30, flexShrink:0 }}>✕</button>
                        </div>
                      ))}
                      <button type="button" className="btn-no-anim" onClick={() => clearFormIssue(type)}
                        style={{ marginTop:8, background:'var(--c-surface)', border:'1px solid var(--c-line)', color:'var(--c-ink)', borderRadius:10, padding:'8px 12px', fontWeight:800, fontSize:13 }}>
                        {t(`inventory.${fixKey}`)}
                      </button>
                    </div>
                  ))}
                  {form.brokenQty > 0 && (
                    <div style={{ marginTop:12, background:'rgba(230,57,70,0.08)', border:'1px solid rgba(230,57,70,0.25)', borderRadius:10, padding:'9px 12px', fontSize:13, fontWeight:600, color:'#e63946', display:'flex', alignItems:'center', gap:6 }}>
                      <Wrench size={14} /> {t('inventory.availableOutOfUse', { available: form.qty - form.brokenQty, broken: form.brokenQty })}
                    </div>
                  )}
                </div>
              ))}
              {section('details', t('inventory.detailsPageTitle'), detailsOpen, detailsFilledCount, (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div className="form-group"><label>{t('inventory.weightLabel')}</label><input type="text" inputMode="decimal" value={form.weightKg} onChange={e => setForm({...form,weightKg:e.target.value})} placeholder={t('inventory.weightPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.peakPowerLabel')}</label><input type="text" inputMode="numeric" value={form.peakPowerW} onChange={e => setForm({...form,peakPowerW:e.target.value.replace(/[^0-9]/g,'')})} placeholder={t('inventory.peakPowerPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.loadCapacityLabel')}</label><input type="text" inputMode="decimal" value={form.loadCapacityKg} onChange={e => setForm({...form,loadCapacityKg:e.target.value})} placeholder={t('inventory.loadCapacityPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.serialNumberLabel')}</label><input value={form.serialNumber} onChange={e => setForm({...form,serialNumber:e.target.value})} placeholder={t('inventory.serialNumberPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.widthLabel')}</label><input type="text" inputMode="decimal" value={form.widthM} onChange={e => setForm({...form,widthM:e.target.value})} placeholder={t('inventory.dimensionPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.lengthLabel')}</label><input type="text" inputMode="decimal" value={form.lengthM} onChange={e => setForm({...form,lengthM:e.target.value})} placeholder={t('inventory.dimensionPlaceholder')} /></div>
                  <div className="form-group"><label>{t('inventory.heightLabel')}</label><input type="text" inputMode="decimal" value={form.heightM} onChange={e => setForm({...form,heightM:e.target.value})} placeholder={t('inventory.dimensionPlaceholder')} /></div>
                </div>
              ))}
              {section('deadlines', t('deadlines.sectionLabel'), deadlinesOpen, deadlinesCount, (
                <div style={{ paddingBottom:12 }}><DeadlinesField value={form.deadlines} onChange={deadlines => setForm({...form, deadlines})} /></div>
              ))}
              {section('linked', t('inventory.linkedPageTitle'), linkedOpen, linkedCount, (
                <div style={{ paddingBottom:14 }}>
                  <LinkedItemsEditor
                    items={items} selfId={selected?.id}
                    value={form.linkedItems} onChange={links => setForm({...form, linkedItems:links})}
                    search={linkedSearch} onSearchChange={setLinkedSearch}
                  />
                </div>
              ))}
            </div>
            </div>

            <div className="rc-drawer-foot" style={{ display:'flex', gap:10, marginTop:20 }}>
              {selected && <button onClick={() => { setShowModal(false); deleteItem(selected) }} className="btn btn-red" style={{ flex:1 }}>{t('inventory.delete')}</button>}
              <SaveButton onSave={saveItem} onDone={() => { itemGuard.skip(); myDrag.close() }} onError={myDrag.triggerJiggle} className="btn btn-primary" style={{ flex:2 }}><Save size={16} /> {t('inventory.save')}</SaveButton>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Modal dettaglio — un solo flusso verticale: titolo e stato subito in
          cima, storico subito sotto senza dover toccare nulla per vederlo,
          codice/azioni in fondo (vedi feedback utente: prima lo storico stava
          dietro un tap sulla disponibilità, in un pannello separato). */}
      {showDetail && (() => {
        const outCount = (showDetail.totalQty||0) - (showDetail.availableQty||0) - (showDetail.brokenQty||0)
        const row = (i) => ({ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:'12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' })
        const rowLabel = { color:'var(--text2)', fontSize:13, flexShrink:0 }
        const rowValue = { fontWeight:600, fontSize:13, color:'var(--text)', textAlign:'right' }
        let r = 0
        const Where = 'button'
        return (
        <div className={`modal-overlay rc-drawer-overlay${detailDrag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) detailDrag.close() }}>
          <div className={`modal rc-sheet rc-drawer${detailDrag.jiggling ? ' modal-jiggle' : ''}${detailDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...detailDrag.props}>
            <div className="rc-drawer-head rc-dc"><div className="rc-drawer-titlebar rc-dc">
              <button className="close-btn" onClick={detailDrag.close} aria-label={t("common.close")}>✕</button>

              {/* ── Titolo documento ── */}
              <div className="rc-drawer-titleblock" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <span className="rc-emoji-phone" style={{ fontSize:26, flexShrink:0 }}>{ICONS[showDetail.category] || '📦'}</span>
                <div style={{ minWidth:0 }}>
                  <h2 style={{ margin:0, fontSize:19 }}>{showDetail.name}</h2>
                  {/* Computer: la categoria sotto il nome (sul telefono c'è l'icona accanto) */}
                  <p className="rc-sub-desktop">{showDetail.category}{showDetail.isBundle ? ' · Kit' : ''}</p>
                </div>
              </div>
            </div></div>

            <div className="rc-drawer-body rc-dc">
            {/* ── Scheda: una riga per campo, come un documento ── */}
            <div className="rc-detail-card" style={{ background:'var(--c-alt)', border:'1px solid var(--c-line)', borderRadius:16, overflow:'hidden', marginBottom:14 }}>
              {(showDetail.brand || showDetail.model) && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.brandModelLabel')}</span>
                  <span style={rowValue}>{[showDetail.brand, showDetail.model].filter(Boolean).join(' ')}</span>
                </div>
              )}
              {showDetail.location && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.warehousePosition')}</span>
                  <span style={rowValue}>{showDetail.location}</span>
                </div>
              )}
              {showDetail.weightKg != null && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.weightLabel')}</span>
                  <span style={rowValue}>{t('inventory.weightValue', { value: showDetail.weightKg })}</span>
                </div>
              )}
              {showDetail.peakPowerW != null && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.peakPowerLabel')}</span>
                  <span style={rowValue}>{t('inventory.peakPowerValue', { value: showDetail.peakPowerW })}</span>
                </div>
              )}
              {showDetail.loadCapacityKg != null && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.loadCapacityLabel')}</span>
                  <span style={rowValue}>{t('inventory.weightValue', { value: showDetail.loadCapacityKg })}</span>
                </div>
              )}
              {(showDetail.lengthM != null || showDetail.widthM != null || showDetail.heightM != null) && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.dimensionsLabel')}</span>
                  <span style={rowValue}>
                    {[['length', showDetail.lengthM], ['width', showDetail.widthM], ['height', showDetail.heightM]]
                      .filter(([, v]) => v != null)
                      .map(([k, v]) => `${t(`inventory.dimShort_${k}`)} ${v}`).join(' · ')} m
                  </span>
                </div>
              )}
              {showDetail.serialNumber && (
                <div style={row(r++)}>
                  <span style={rowLabel}>{t('inventory.serialNumberLabel')}</span>
                  <span style={{ ...rowValue, fontFamily:'monospace' }}>{showDetail.serialNumber}</span>
                </div>
              )}
              {getLinkedItems(showDetail).length > 0 && (
                <div className="rc-span" style={{ ...row(r++), flexDirection:'column', alignItems:'stretch', gap:6 }}>
                  <span style={rowLabel}>{t('inventory.linkedAutoAddLabel')}</span>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {getLinkedItems(showDetail).map(l => {
                      const li = items.find(i => i.id === l.itemId)
                      if (!li) return null
                      return (
                        <span key={l.itemId} style={{ ...rowValue, textAlign:'left' }}>
                          {l.qty}× {li.name} <span style={{ color:'var(--text2)', fontWeight:500 }}>· {t(l.mode === 'perUnit' ? 'inventory.linkModePerUnit' : 'inventory.linkModeOnce')}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="rc-span" style={{ ...row(r++), flexDirection:'column', alignItems:'stretch', gap:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14 }}>
                  <span style={rowLabel}>{t('inventory.detailAvailable')}</span>
                  <span style={rowValue}>
                    {showDetail.category === 'Consumabili'
                      ? `${showDetail.availableQty ?? showDetail.totalQty} ${t(`inventory.unitShort_${showDetail.consumableUnit || 'pezzi'}`)}`
                      : `${showDetail.availableQty}/${showDetail.totalQty}`
                    }
                  </span>
                </div>
                {/* Barra segmentata: disponibili / fuori / rotti */}
                <div style={{ background:'var(--card2)', borderRadius:4, height:8, overflow:'hidden', display:'flex' }}>
                  <div style={{ background:'var(--green)', width:`${((showDetail.availableQty||0)/(showDetail.totalQty||1))*100}%` }} />
                  {showDetail.brokenQty > 0 && (
                    <div style={{ background:'var(--red)', width:`${((showDetail.brokenQty||0)/(showDetail.totalQty||1))*100}%` }} />
                  )}
                </div>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  <span style={{ fontSize:12, color:'var(--green)' }}>● {showDetail.availableQty} {t('inventory.available')}{desktopDrawer && outCount === 0 && detailEvents.length === 0 ? ` · ${t('inventory.whereItIsInWarehouse')}` : ''}</span>
                  {outCount > 0 && (
                    <span style={{ fontSize:12, color:'var(--accent2)' }} title={detailEvents.map(e => e.name).join('\n') || undefined}>
                      ● {outCount} {t('inventory.out')}
                      {/* Computer: dove sono usciti, nella stessa riga (una lista = il suo titolo, più liste = quante) */}
                      {desktopDrawer && detailEvents.length > 0 && ` · ${detailEvents.length === 1 ? detailEvents[0].name : t('inventory.whereItIsOutLists', { count: detailEvents.length })}`}
                    </span>
                  )}
                  {showDetail.brokenQty > 0 && (
                    <span style={{ fontSize:12, color:'var(--red)' }}>● {brokenText(showDetail, t)}</span>
                  )}
                  {showDetail.defectQty > 0 && (
                    <span style={{ fontSize:12, color:'#d97706' }}>● {defectText(showDetail, t)}</span>
                  )}
                </div>
              </div>
              {/* Sempre cliccabile (anche se l'oggetto non è mai uscito): la pagina dello storico ha il suo stato vuoto */}
              {/* Telefono: bottone verso la pagina dello storico. Computer: la riga non c'è, dove si trova l'oggetto sta nella legenda della disponibilità qui sopra e lo storico è in fondo alla colonna. */}
              {!desktopDrawer && <Where className="rc-span" onClick={() => navigate(`/inventory/${showDetail.id}/history`)}
                style={{ ...row(r++), width:'100%', textAlign:'left', cursor:'pointer' }}>
                <span style={rowLabel}>{t('inventory.whereItIs')}</span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={rowValue}>
                    {/* Basta che ne esca anche solo 1 pezzo: compare il titolo della lista di carico (o delle liste, se sono più d'una). Altrimenti è in magazzino. */}
                    {detailEvents.length > 0
                      ? t('inventory.whereItIsOutNow', { name: detailEvents[0].name, extra: detailEvents.length > 1 ? t('inventory.whereItIsOutNowMore', { count: detailEvents.length - 1 }) : '' })
                      : t('inventory.whereItIsInWarehouse')
                    }
                  </span>
                  <span style={{ color:'var(--text2)', flexShrink:0 }}>→</span>
                </span>
              </Where>}
              {/* Note: come le altre righe, con il filo sopra e sotto */}
              {showDetail.notes && (
                <div className="rc-span rc-notes" style={{ ...row(r++), flexDirection:'column', alignItems:'stretch', gap:4 }}>
                  <span style={rowLabel}>{t('inventory.notesInline')}</span>
                  <span style={{ ...rowValue, textAlign:'left', fontWeight:500, lineHeight:1.5, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{showDetail.notes}</span>
                </div>
              )}
            </div>

            {/* Pezzi segnalati con numero e difetto, ognuno risolvibile da solo */}
            {(showDetail.issues || []).length > 0 && (
              <div style={{ margin:'0 0 10px', padding:'8px 10px', borderRadius:10, background:'var(--c-alt)', border:'1px solid var(--c-line)' }}>
                <p style={{ margin:'0 0 6px', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--c-ink3)' }}>{t('inventory.issuesPiecesTitle')}</p>
                {sortedIssues(showDetail.issues).map(i => (
                  <div key={i.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                    <span style={{ fontSize:12, fontWeight:800, whiteSpace:'nowrap', color: i.type === 'broken' ? '#e63946' : '#b45309' }}>
                      {i.unit ? t('inventory.issuePieceNumber', { n: i.unit }) : t('inventory.issuePieceNoNumber')}
                    </span>
                    <span style={{ flex:1, minWidth:0, fontSize:13, color:'var(--c-ink)', overflowWrap:'anywhere' }}>
                      <strong>{i.type === 'broken' ? t('inventory.brokenSingle') : t('inventory.defectSingle')}</strong>{i.note ? ` — ${i.note}` : ''}
                    </span>
                    <button type="button" className="btn-no-anim" onClick={() => resolveIssue(i)}
                      style={{ flexShrink:0, background:'var(--c-surface)', border:'1px solid var(--c-line)', color:'var(--c-ink)', borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:800 }}>
                      {t('inventory.issueResolved')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Descrizioni dei problemi segnalati (rotto / con difetto) */}
            {((showDetail.brokenQty||0) > 0 && showDetail.brokenNote) && (
              <p style={{ margin:'0 0 10px', padding:'10px 12px', borderRadius:10, background:'rgba(230,57,70,0.08)', border:'1px solid rgba(230,57,70,0.25)', color:'var(--c-ink)', fontSize:13, lineHeight:1.45 }}>
                <strong style={{ color:'#e63946' }}>{t('inventory.brokenLabel')}:</strong> {showDetail.brokenNote}
              </p>
            )}
            {((showDetail.defectQty||0) > 0) && (
              <div style={{ margin:'0 0 10px', padding:'10px 12px', borderRadius:10, background:'rgba(217,119,6,0.08)', border:'1px solid rgba(217,119,6,0.3)', fontSize:13, lineHeight:1.45, color:'var(--c-ink)' }}>
                <p style={{ margin:0 }}><strong style={{ color:'#b45309' }}>{t('inventory.defectLabel')}:</strong> {showDetail.defectNote || t('inventory.defectNoNote')}</p>
                <button
                  onClick={async () => {
                    const newDefect = Math.max(0, (showDetail.defectQty || 0) - 1)
                    const upd = { defectQty: newDefect, issues: dropLastIssue(showDetail.issues, 'defect'), ...(newDefect === 0 ? { defectNote: '' } : {}) }
                    await updateDoc(doc(db, 'items', showDetail.id), upd)
                    setShowDetail(d => ({ ...d, ...upd }))
                  }}
                  className="btn-no-anim" style={{ marginTop:8, background:'var(--c-surface)', border:'1px solid var(--c-line)', color:'var(--c-ink)', borderRadius:10, padding:'8px 12px', fontWeight:800, fontSize:13 }}
                >{t('inventory.defectFixedButton')}</button>
              </div>
            )}
            {/* Tasto riparato - appare SOLO se ci sono pezzi rotti */}
            {(showDetail.brokenQty||0) > 0 && (
              <button
                onClick={async () => {
                  const currentBroken = showDetail.brokenQty || 0
                  const newBroken = Math.max(0, currentBroken - 1)
                  const prevOut = (showDetail.totalQty||0) - (showDetail.availableQty||0) - currentBroken
                  const newAvailable = Math.max(0, showDetail.totalQty - newBroken - prevOut)
                  const upd = { brokenQty: newBroken, availableQty: newAvailable, issues: dropLastIssue(showDetail.issues, 'broken'), ...(newBroken === 0 ? { brokenNote: '' } : {}) }
                  await updateDoc(doc(db, 'items', showDetail.id), upd)
                  setShowDetail(d => ({ ...d, ...upd }))
                }}
                className="btn-no-anim" style={{ width:'100%', marginBottom:10, background:'var(--c-surface)', border:'1px solid var(--c-line)', color:'var(--c-ink)', borderRadius:12, padding:'12px', fontWeight:800, fontSize:14, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
              >
                <Wrench size={15} /> {t('inventory.repairOneButton')}
              </button>
            )}

            {/* Computer: storico e controllo disponibilità direttamente qui, sotto le informazioni (sul telefono
                "Dove si trova" apre la pagina dedicata) */}
            {desktopDrawer && (
              <div ref={historyRef} style={{ scrollMarginTop:8, marginTop:6 }}>
                <ItemHistoryPanel itemId={showDetail.id} embedded />
              </div>
            )}

            </div>

            {/* Tre azioni sempre su una riga (anche da telefono): etichetta,
                menu rapido Segnala (rotto / difetto / rientro), modifica. */}
            <div className="rc-drawer-foot" style={{ display:'grid', gridTemplateColumns: showDetail.isBundle ? '1fr 1fr' : '1fr 1fr 1fr', gap:8 }}>
              <button
                onClick={() => {
                  const display = getCodeDisplay(team)
                  setPrintFormat(display === 'both' ? null : display)
                  setShowPrintPopup(true)
                }}
                className="btn btn-secondary" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'12px 6px', fontSize:13.5, whiteSpace:'nowrap' }}
              ><Download size={15} /> {t('inventory.downloadShort')}</button>
              {!showDetail.isBundle && (
                <button onClick={openStatusMenu} aria-label={t('inventory.reportIssueButton')}
                  className="btn btn-secondary" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'12px 6px', fontSize:13.5, whiteSpace:'nowrap' }}
                ><Warn size={15} /> {t('inventory.reportShort')}</button>
              )}
              <button onClick={() => { setShowDetail(null); openEdit(showDetail) }} className="btn btn-secondary" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'12px 6px', fontSize:13.5, whiteSpace:'nowrap' }}><Edit size={15} /> {t('inventory.edit')}</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Menu rapido "Segnala": rotti, con difetto e rientro parziale in un
          unico riquadro centrato (stesso stile del popup di stampa). */}
      {showStatusMenu && showDetail && (() => {
        const total = showDetail.totalQty || 0
        const prevOut = Math.max(0, total - (showDetail.availableQty || 0) - (showDetail.brokenQty || 0))
        // La descrizione generica serve solo per i rotti/difetti aggiunti coi +/− (quelli
        // aggiunti come "pezzo" hanno la propria descrizione).
        const manual = (cnt, issuesList, type) => cnt - countIssues(issuesList, type)
        const raised = manual(statusDraft.broken, statusDraft.issues, 'broken') > manual(showDetail.brokenQty || 0, showDetail.issues, 'broken')
          || manual(statusDraft.defect, statusDraft.issues, 'defect') > manual(showDetail.defectQty || 0, showDetail.issues, 'defect')
        const rowLabel = { fontSize:13, fontWeight:800, margin:0, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }
        const rowHint = { fontSize:12, color:'var(--c-ink2)', margin:'1px 0 7px' }
        return (
          <div onClick={() => setShowStatusMenu(false)}
            style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t('inventory.statusMenuTitle')}
              style={{ position:'relative', width:'100%', maxWidth:340, maxHeight:'88dvh', overflowY:'auto', background:'var(--card)', borderRadius:16, padding:'20px 18px 18px', boxShadow:'0 12px 40px rgba(0,0,0,0.3)' }}>
              <button onClick={() => setShowStatusMenu(false)} aria-label={t('common.close')} className="btn-no-anim"
                style={{ position:'absolute', top:6, right:6, background:'transparent', color:'var(--text2)', fontSize:16, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              <h2 style={{ margin:'0 40px 2px 0', fontSize:17 }}>{t('inventory.statusMenuTitle')}</h2>
              <p style={{ margin:'0 0 16px', fontSize:13, color:'var(--c-ink2)' }}>{showDetail.name}</p>

              <div style={{ marginBottom:14 }}>
                <p style={{ ...rowLabel, color:'#e63946' }}>{t('inventory.brokenLabel')}</p>
                <p style={rowHint}>{t('inventory.brokenHint')}</p>
                <Stepper tone="red" value={statusDraft.broken} min={0} max={total} onChange={broken => setStatusDraft(d => ({ ...d, broken }))}
                  decAria={t('inventory.decreaseBrokenAria')} incAria={t('inventory.increaseBrokenAria')} />
              </div>
              <div style={{ marginBottom:14 }}>
                <p style={{ ...rowLabel, color:'#b45309' }}>{t('inventory.defectLabel')}</p>
                <p style={rowHint}>{t('inventory.defectHint')}</p>
                <Stepper tone="amber" value={statusDraft.defect} min={0} max={total} onChange={defect => setStatusDraft(d => ({ ...d, defect }))}
                  decAria={t('inventory.decreaseDefectAria')} incAria={t('inventory.increaseDefectAria')} />
              </div>
              {/* Pezzi segnalati: numero esatto + difetto, per non prendere proprio quello */}
              <div style={{ marginBottom:14 }}>
                <p style={{ ...rowLabel, color:'var(--c-ink)' }}>
                  {t('inventory.issuesPiecesTitle')}
                  <button type="button" className="btn-no-anim" onClick={() => setStatusDraft(d => ({ ...d, addOpen: !d.addOpen }))}
                    style={{ background:'transparent', color:'#e63946', fontWeight:800, fontSize:12.5, padding:'2px 0' }}>
                    {statusDraft.addOpen ? t('common.cancel') : t('inventory.issuesAddPiece')}
                  </button>
                </p>
                <p style={rowHint}>{total > 1 ? t('inventory.issuesPiecesHint') : t('inventory.issuesPiecesHintSingle')}</p>
                {sortedIssues(statusDraft.issues).map(i => (
                  <div key={i.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', marginBottom:6, borderRadius:10, background: i.type === 'broken' ? 'rgba(230,57,70,0.08)' : 'rgba(217,119,6,0.10)' }}>
                    <span style={{ fontSize:12, fontWeight:800, color: i.type === 'broken' ? '#e63946' : '#b45309', whiteSpace:'nowrap' }}>
                      {i.unit ? t('inventory.issuePieceNumber', { n: i.unit }) : t('inventory.issuePieceNoNumber')}
                    </span>
                    <span style={{ flex:1, minWidth:0, fontSize:12.5, color:'var(--c-ink)', overflowWrap:'anywhere' }}>
                      <strong>{i.type === 'broken' ? t('inventory.brokenSingle') : t('inventory.defectSingle')}</strong>{i.note ? ` — ${i.note}` : ''}
                    </span>
                    <button type="button" className="btn-no-anim" aria-label={t('inventory.issueRemoveAria')} onClick={() => applyDraftIssues(removeIssueById(statusDraft.issues, i.id))}
                      style={{ background:'transparent', color:'var(--c-ink3)', fontSize:15, width:28, height:28, flexShrink:0 }}>✕</button>
                  </div>
                ))}
                {statusDraft.addOpen && (
                  <div style={{ padding:10, borderRadius:12, border:'1px solid var(--c-line)', background:'var(--c-alt)', display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', gap:6 }}>
                      {['broken', 'defect'].map(k => (
                        <button key={k} type="button" className="btn-no-anim" aria-pressed={statusDraft.addType === k} onClick={() => setStatusDraft(d => ({ ...d, addType: k }))}
                          style={{ flex:1, minHeight:38, borderRadius:10, fontSize:13, fontWeight:800,
                            background: statusDraft.addType === k ? (k === 'broken' ? '#e63946' : '#d97706') : 'var(--c-fill)',
                            color: statusDraft.addType === k ? '#fff' : 'var(--c-ink2)', border:'none' }}>
                          {k === 'broken' ? t('inventory.brokenSingle') : t('inventory.defectSingle')}
                        </button>
                      ))}
                    </div>
                    {total > 1 && (
                      <input type="number" inputMode="numeric" min={1} max={total} value={statusDraft.addUnit} onChange={e => setStatusDraft(d => ({ ...d, addUnit: e.target.value }))}
                        placeholder={t('inventory.issuePieceNumberPlaceholder', { total })} aria-label={t('inventory.issuePieceNumberLabel')} style={{ fontSize:14 }} />
                    )}
                    <input value={statusDraft.addNote} onChange={e => setStatusDraft(d => ({ ...d, addNote: e.target.value }))}
                      placeholder={t('inventory.issueNotePlaceholder')} aria-label={t('inventory.issueNoteLabel')} style={{ fontSize:14 }} />
                    <button type="button" className="btn btn-secondary" onClick={addDraftIssue}
                      disabled={total > 1 && !(parseInt(statusDraft.addUnit, 10) >= 1 && parseInt(statusDraft.addUnit, 10) <= total)}
                      style={{ minHeight:40, fontSize:13.5, opacity: (total > 1 && !(parseInt(statusDraft.addUnit, 10) >= 1 && parseInt(statusDraft.addUnit, 10) <= total)) ? 0.5 : 1 }}>
                      {t('inventory.issuesAddConfirm')}
                    </button>
                  </div>
                )}
              </div>
              {prevOut > 0 && (
                <div style={{ marginBottom:14 }}>
                  <p style={{ ...rowLabel, color:'var(--c-ink)' }}>
                    {t('inventory.outStillLabel')}
                    {statusDraft.out > 0 && (
                      <button type="button" className="btn-no-anim" onClick={() => setStatusDraft(d => ({ ...d, out: 0 }))}
                        style={{ background:'transparent', color:'#e63946', fontWeight:800, fontSize:12.5, padding:'2px 0' }}>{t('inventory.allReturned')}</button>
                    )}
                  </p>
                  <p style={rowHint}>{t('inventory.partialReturnHint')}</p>
                  <Stepper value={statusDraft.out} min={0} max={prevOut} onChange={out => setStatusDraft(d => ({ ...d, out }))}
                    decAria={t('inventory.decreaseOutAria')} incAria={t('inventory.increaseOutAria')} />
                </div>
              )}
              {raised && (
                <div style={{ marginBottom:14 }}>
                  <label htmlFor="rc-status-note" style={{ display:'block', fontSize:12.5, fontWeight:800, color:'var(--c-ink2)', marginBottom:6 }}>
                    {t('inventory.issueNoteLabel')} <span style={{ color:'var(--c-ink3)', fontWeight:500 }}>{t('common.optional')}</span>
                  </label>
                  <textarea id="rc-status-note" rows={2} value={statusDraft.note} onChange={e => setStatusDraft(d => ({ ...d, note: e.target.value }))} placeholder={t('inventory.issueNotePlaceholder')} />
                </div>
              )}
              <SaveButton onSave={saveStatusMenu} onDone={() => setShowStatusMenu(false)} className="btn btn-primary" style={{ width:'100%' }}>
                <Save size={16} /> {t('inventory.save')}
              </SaveButton>
              <button type="button" className="btn-no-anim"
                onClick={() => { const it = showDetail; setShowStatusMenu(false); setShowDetail(null); openEdit(it, 'issues') }}
                style={{ width:'100%', marginTop:8, background:'transparent', color:'var(--c-ink2)', fontWeight:700, fontSize:13, padding:'10px 0' }}>
                {t('inventory.moreInEdit')}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modifica oggetto: popup "Segnala rotto / Segnala difetto" (contatore, pezzi segnalati, commento) */}
      {issueDlg && showModal && (
        <IssueReportDialog type={issueDlg} name={form.name} qty={Math.max(1, parseInt(form.qty, 10) || 1)}
          already={issueDlg === 'broken' ? (form.brokenQty || 0) : (form.defectQty || 0)}
          onClose={() => setIssueDlg(null)}
          onConfirm={r => { applyIssueReport({ type: issueDlg, ...r }); setIssueDlg(null) }} t={t} />
      )}

      {/* Popup scelta stampa — volutamente leggero (niente bottom-sheet/drag),
          solo un riquadro centrato fisso. Due passaggi solo se la squadra usa
          "entrambi" i formati (altrimenti il formato è già deciso e si vede
          subito la scelta uno/tutti): 1) QR o Barcode, 2) una etichetta o
          tutte le unità. */}
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
              aria-label={t('common.close')}
              className="btn-no-anim"
              style={{ position:'absolute', top:10, right:10, background:'transparent', color:'var(--text2)', fontSize:16, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              ✕
            </button>
            {printFormat === null ? (
              <>
                <h2 style={{ marginBottom:16, fontSize:17 }}>{t('inventory.chooseCodeFormat')}</h2>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <button onClick={() => setPrintFormat('qr')}
                    style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:14, padding:'18px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <QrCode size={26} />
                    <span style={{ fontWeight:700, fontSize:13 }}>{t('adminUsers.codeDisplayQr')}</span>
                  </button>
                  <button onClick={() => setPrintFormat('barcode')}
                    style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:14, padding:'18px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <Barcode size={26} />
                    <span style={{ fontWeight:700, fontSize:13 }}>{t('adminUsers.codeDisplayBarcode')}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ marginBottom:16, fontSize:17 }}>{t('inventory.downloadLabel')}</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <button
                    onClick={() => { printCode(printFormat); setShowPrintPopup(false) }}
                    className="btn btn-secondary"
                  >
                    {t('inventory.printOneLabel')}
                  </button>
                  {(showDetail.totalQty || 1) > 1 && (
                    <button
                      onClick={() => { printUnitLabels(printFormat); setShowPrintPopup(false) }}
                      className="btn btn-secondary"
                    >
                      {t('inventory.printAllUnits', { count: showDetail.totalQty })}
                    </button>
                  )}
                </div>
              </>
            )}
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
              <button onClick={importModal.close} aria-label={t('common.close')} style={{ position:'absolute', top:16, right:16, width:44, height:44, borderRadius:'50%', background:'var(--card2)', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, border:'none' }}>✕</button>
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
                  <input type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', whiteSpace:'nowrap', border:0, clip:'rect(0,0,0,0)' }} />
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
        <div className={`modal-overlay rc-drawer-overlay${addMenuDrag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) addMenuDrag.close() }}>
          <div className={`modal rc-sheet rc-drawer rc-drawer-narrow${addMenuDrag.jiggling ? ' modal-jiggle' : ''}${addMenuDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...addMenuDrag.props}>
            <div className="rc-drawer-head rc-dc"><div className="rc-drawer-titlebar rc-dc">
              <button className="close-btn" onClick={addMenuDrag.close} aria-label={t("common.close")}>✕</button>
              <h2>{t('inventory.addMenuTitle')}</h2>
            </div></div>
            <div className="rc-drawer-body rc-dc"><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
              <button onClick={() => { setShowAddMenu(false); openAdd() }}
                className="rc-choice" style={{ background:'var(--card2)', border:'2px solid var(--border)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span className="rc-choice-icon" style={{ color:'var(--text)' }}><Box size={34} /></span>
                <span className="rc-choice-text rc-dc">
                  <span className="rc-choice-title" style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{t('inventory.newItemOption')}</span>
                  <span className="rc-choice-desc" style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('inventory.newItemOptionDesc')}</span>
                </span>
              </button>
              <button onClick={() => { setShowAddMenu(false); setKitForm({name:'',location:'',qty:1,category:'Altro',linkedItems:[]}); setKitComponents([]); setKitSearch(''); setKitLinkedSearch(''); setShowKitModal(true) }}
                className="rc-choice" style={{ background:'rgba(245,166,35,0.08)', border:'2px solid rgba(245,166,35,0.3)', borderRadius:16, padding:'24px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span className="rc-choice-icon" style={{ color:'var(--accent2)' }}><Kit size={34} /></span>
                <span className="rc-choice-text rc-dc">
                  <span className="rc-choice-title" style={{ fontWeight:700, fontSize:15, color:'var(--accent2)' }}>{t('inventory.newKitOption')}</span>
                  <span className="rc-choice-desc" style={{ fontSize:12, color:'var(--text2)', textAlign:'center', lineHeight:1.4 }}>{t('inventory.newKitOptionDesc')}</span>
                </span>
              </button>
            </div></div>
          </div>
        </div>
      )}

      {/* Baule (kit): un solo foglio a schede per creare e modificare —
          Contenuto (dati + componenti), Stato bauli (solo modifica), Collegati. */}
      {showKitEditModal && editingKit && (
        <KitSheet mode="edit" drag={kitEditDrag} t={t} items={items} selfId={editingKit.id}
          form={kitForm} setForm={setKitForm}
          components={kitEditComponents} setComponents={setKitEditComponents}
          instances={kitEditInstances} onToggleBroken={toggleInstanceBroken}
          search={kitEditSearch} setSearch={setKitEditSearch}
          linkedSearch={kitLinkedSearch} setLinkedSearch={setKitLinkedSearch}
          footer={(
            <div style={{ display:'flex', gap:10 }}>
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
                    ...linkedItemsToFields(kitForm.linkedItems),
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
          )} />
      )}

      {showKitModal && (
        <KitSheet mode="new" drag={kitDrag} t={t} items={items} selfId={null}
          form={kitForm} setForm={setKitForm}
          components={kitComponents} setComponents={setKitComponents}
          search={kitSearch} setSearch={setKitSearch}
          linkedSearch={kitLinkedSearch} setLinkedSearch={setKitLinkedSearch}
          footer={(
            <SaveButton
              onSave={async () => {
                if (!kitForm.name.trim() || kitComponents.length === 0) return false
                const warehouseCap = warehouseLimit(team)
                if (items.length >= warehouseCap) {
                  await promptLimitReached({ confirm, navigate, isAdmin: isOwner, t, message: t('planLimits.itemsInWarehouseMsg', { limit: warehouseCap }) })
                  return false
                }
                const kitQty = kitForm.qty || 1
                const ref = await addDoc(collection(db, 'items'), {
                  name: kitForm.name.trim(), location: kitForm.location.trim(),
                  category: kitForm.category || 'Altro', isBundle: true,
                  components: kitComponents.map(c => ({ itemId:c.itemId, name:c.name, qty:c.qty })),
                  totalQty: kitQty, availableQty: kitQty,
                  instances: ensureInstanceList([], kitQty),
                  ...linkedItemsToFields(kitForm.linkedItems),
                  teamId, createdAt: serverTimestamp(), createdBy: operator?.userId || user.uid,
                })
                await updateDoc(ref, { code: generateItemCode(ref.id) })
                return true
              }}
              onDone={() => { kitNewGuard.skip(); kitDrag.close() }}
              onError={kitDrag.triggerJiggle}
              className="btn btn-primary btn-full"
              disabled={!kitForm.name.trim() || kitComponents.length === 0}
              style={{ opacity: !kitForm.name.trim() || kitComponents.length === 0 ? 0.4 : 1 }}>
              {t('inventory.createKit', { prefix: kitForm.qty > 1 ? `${kitForm.qty}x ` : '', count: kitComponents.length })}
            </SaveButton>
          )} />
      )}
    </div>
  )
}

// Foglio per creare e modificare un baule (kit). Prima era un unico scroll che
// mescolava dati, componenti, stato dei singoli bauli, oggetti collegati e
// l'intero elenco del magazzino; ora tre schede con un'unica cosa per scheda:
//  · Contenuto — dati del kit e cosa c'è dentro (aggiunta componenti a richiesta)
//  · Stato bauli — solo in modifica: pezzi mancanti/rotti baule per baule
//  · Collegati — oggetti da portare insieme
function KitSheet({ mode, drag, t, items, selfId, form, setForm, components, setComponents, instances, onToggleBroken, search, setSearch, linkedSearch, setLinkedSearch, footer }) {
  const isEdit = mode === 'edit'
  const [tab, setTab] = useState('content')
  const [addOpen, setAddOpen] = useState(components.length === 0)
  const instanceList = isEdit ? ensureInstanceList(instances, form.qty) : []
  const incomplete = instanceList.filter(i => (i.brokenComponents || []).length > 0).length
  const tabs = [
    { key:'content', label:t('inventory.kitTabContent'), count: components.length },
    ...(isEdit ? [{ key:'state', label:t('inventory.kitTabState'), count: incomplete, alert: true }] : []),
    { key:'linked', label:t('inventory.kitTabLinked'), count: (form.linkedItems || []).length },
  ]
  const sectionLabel = { margin:0, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--c-ink3)' }
  const miniBtn = { width:34, height:34, borderRadius:9, background:'var(--c-surface)', color:'var(--c-ink)', fontSize:18, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.08)', flexShrink:0 }
  const card = { border:'1px solid var(--c-line)', borderRadius:14, background:'var(--c-alt)', overflow:'hidden' }
  const candidates = items.filter(i => !i.isBundle && !components.some(c => c.itemId === i.id))
    .filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className={`modal-overlay rc-drawer-overlay${drag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) drag.close() }}>
      <div className={`modal rc-sheet rc-drawer${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position:'relative', maxHeight:'92dvh', display:'flex', flexDirection:'column', padding:0 }} {...drag.props}>
        <div className="rc-drawer-head" style={{ padding:'20px 20px 0', flexShrink:0 }}>
          <div className="rc-drawer-titlebar rc-dc">
            <button className="close-btn" onClick={drag.close} aria-label={t('common.close')}>✕</button>
            <h2 style={{ margin:'0 0 12px', display:'flex', alignItems:'center', gap:8 }}><Kit size={20} /> {isEdit ? t('inventory.editKitTitle') : t('inventory.newKitTitle')}</h2>
          </div>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} aria-label={t('inventory.nameLabel')}
            placeholder={isEdit ? t('inventory.kitNamePlaceholder') : t('inventory.kitNamePlaceholderNew')} style={{ fontWeight:600, fontSize:16, marginBottom:12 }} />
          <div role="tablist" style={{ display:'flex', gap:3, padding:3, borderRadius:12, background:'var(--c-fill)' }}>
            {tabs.map(tb => (
              <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className="btn-no-anim" onClick={() => setTab(tb.key)}
                style={{ flex:1, minWidth:0, minHeight:38, padding:'6px 4px', borderRadius:9, fontSize:12.5, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5,
                  background: tab === tb.key ? 'var(--c-surface)' : 'transparent', color: tab === tb.key ? 'var(--c-ink)' : 'var(--c-ink2)',
                  boxShadow: tab === tb.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tb.label}</span>
                {tb.count > 0 && (
                  <span style={{ fontSize:11, fontWeight:800, borderRadius:20, padding:'1px 7px', flexShrink:0,
                    background: tb.alert ? 'rgba(230,57,70,0.14)' : 'var(--c-fill)', color: tb.alert ? '#e63946' : 'var(--c-ink2)' }}>{tb.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="rc-drawer-body" style={{ flex:1, overflowY:'auto', minHeight:0, padding:'16px 16px 18px' }}>
          {tab === 'content' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group" style={{ margin:0 }}>
                  <label>{t('inventory.categoryLabel')}</label>
                  <Picker value={form.category || 'Altro'} onChange={category => setForm({ ...form, category })} ariaLabel={t('inventory.categoryLabel')}
                    options={KIT_CATEGORIES.map(c => ({ value:c, label:c, icon:ICONS[c] }))} />
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label>{t('inventory.howManyKits')}</label>
                  <Stepper value={form.qty} min={1} onChange={qty => setForm(f => ({ ...f, qty }))}
                    decAria={t('eventDetail.decreaseQtyAria')} incAria={t('eventDetail.increaseQtyAria')} />
                </div>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label>{t('inventory.locationLabel')}</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={isEdit ? t('inventory.kitLocationPlaceholder') : t('inventory.kitLocationPlaceholderNew')} />
              </div>

              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 }}>
                  <p style={sectionLabel}>{t('inventory.componentsCount', { count: components.length })}</p>
                  <button type="button" className="btn-no-anim" onClick={() => setAddOpen(o => !o)} aria-expanded={addOpen}
                    style={{ background:'transparent', color:'#e63946', fontWeight:800, fontSize:13, padding:'4px 0' }}>
                    {addOpen ? t('inventory.kitAddDone') : t('inventory.kitAddComponent')}
                  </button>
                </div>
                {components.length === 0 ? (
                  <p style={{ margin:0, padding:'14px 12px', borderRadius:12, border:'1.5px dashed var(--c-dash)', color:'var(--c-ink2)', fontSize:13, textAlign:'center' }}>{t('inventory.kitNoComponents')}</p>
                ) : (
                  <div className="rc-flatcard" style={card}>
                    {components.map((comp, i) => (
                      <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderTop: i > 0 ? '1px solid var(--c-line)' : 'none' }}>
                        <span style={{ flex:1, minWidth:0, fontSize:14, fontWeight:600, color:'var(--c-ink)', overflowWrap:'anywhere' }}>{comp.name}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--c-fill2)', borderRadius:11, padding:2 }}>
                          <button type="button" className="btn-no-anim" style={miniBtn} aria-label={t('eventDetail.decreaseQtyAria')}
                            onClick={() => setComponents(prev => prev.map(c => c.itemId === comp.itemId ? { ...c, qty: Math.max(1, c.qty - 1) } : c))}>−</button>
                          <span style={{ fontWeight:800, fontSize:15, minWidth:22, textAlign:'center', color:'var(--c-ink)' }}>{comp.qty}</span>
                          <button type="button" className="btn-no-anim" style={miniBtn} aria-label={t('eventDetail.increaseQtyAria')}
                            onClick={() => setComponents(prev => prev.map(c => c.itemId === comp.itemId ? { ...c, qty: Math.min(c.maxQty ?? Infinity, c.qty + 1) } : c))}>+</button>
                        </div>
                        <button type="button" className="btn-no-anim" aria-label={t('inventory.removeComponentAria', { name: comp.name })}
                          onClick={() => setComponents(prev => prev.filter(c => c.itemId !== comp.itemId))}
                          style={{ background:'transparent', color:'var(--c-ink3)', fontSize:16, width:32, height:32, flexShrink:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {addOpen && (
                  <div style={{ ...card, marginTop:10 }}>
                    <div style={{ padding:10, borderBottom:'1px solid var(--c-line)' }}>
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inventory.searchItemToAdd')} aria-label={t('inventory.searchItemToAdd')} style={{ fontSize:14 }} autoFocus={components.length > 0} />
                    </div>
                    <div style={{ maxHeight:260, overflowY:'auto' }}>
                      {candidates.length === 0 ? (
                        <p style={{ margin:0, padding:'14px 12px', fontSize:13, color:'var(--c-ink3)', textAlign:'center' }}>{t('inventory.kitNoResults')}</p>
                      ) : candidates.map(item => (
                        <button type="button" key={item.id} className="item-row" aria-label={t('inventory.addComponentAria', { name: item.name })}
                          onClick={() => { setComponents(prev => [...prev, { itemId:item.id, name:item.name, qty:1, maxQty:item.totalQty || 1 }]); setSearch('') }}>
                          <div className="item-icon" style={{ fontSize:18 }}>{ICONS[item.category] || '📦'}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontWeight:700, fontSize:14 }}>{item.name}</p>
                            <p style={{ color:'var(--c-ink2)', fontSize:12 }}>{t('inventory.availableShort', { count: item.availableQty ?? item.totalQty })}</p>
                          </div>
                          <span style={{ color:'var(--accent)', fontSize:20, padding:'0 8px' }}>+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'state' && isEdit && (
            <div>
              <p style={{ margin:'0 0 12px', fontSize:13, color:'var(--c-ink2)', lineHeight:1.45 }}>{t('inventory.kitInstancesHint')}</p>
              {components.length === 0 ? (
                <p style={{ margin:0, padding:'14px 12px', borderRadius:12, border:'1.5px dashed var(--c-dash)', color:'var(--c-ink2)', fontSize:13, textAlign:'center' }}>{t('inventory.kitStateNeedsComponents')}</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {instanceList.map(inst => {
                    const missing = (inst.brokenComponents || []).reduce((n, b) => n + (b.qty || 0), 0)
                    return (
                      <div key={inst.number} style={{ ...card, background: missing ? 'rgba(230,57,70,0.05)' : 'var(--c-alt)', borderColor: missing ? 'rgba(230,57,70,0.28)' : 'var(--c-line)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderBottom:'1px solid var(--c-line)' }}>
                          <span style={{ fontSize:14, fontWeight:800, color:'var(--c-ink)' }}>{t('inventory.kitInstanceLabel', { number: inst.number })}</span>
                          <span style={{ marginLeft:'auto', fontSize:12, fontWeight:800, borderRadius:20, padding:'2px 10px',
                            background: missing ? 'rgba(230,57,70,0.12)' : 'rgba(34,197,94,0.14)', color: missing ? '#e63946' : 'var(--c-green)' }}>
                            {missing ? t('inventory.kitInstanceMissingTotal', { count: missing }) : t('inventory.kitInstanceComplete')}
                          </span>
                        </div>
                        {components.map(comp => {
                          const brokenQty = (inst.brokenComponents || []).find(b => b.itemId === comp.itemId)?.qty || 0
                          return (
                            <div key={comp.itemId} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px' }}>
                              <span style={{ flex:1, minWidth:0, fontSize:13.5, color:'var(--c-ink)', overflowWrap:'anywhere' }}>{comp.name}{comp.qty > 1 ? <span style={{ color:'var(--c-ink3)' }}> ×{comp.qty}</span> : null}</span>
                              <div style={{ display:'flex', alignItems:'center', gap:4, background:'var(--c-fill2)', borderRadius:11, padding:2 }}>
                                <button type="button" className="btn-no-anim" disabled={brokenQty === 0} style={{ ...miniBtn, opacity: brokenQty === 0 ? 0.4 : 1 }}
                                  aria-label={t('inventory.decreaseBrokenComponentAria', { name: comp.name, number: inst.number })}
                                  onClick={() => onToggleBroken(inst.number, comp.itemId, comp.qty, -1)}>−</button>
                                <span style={{ fontSize:13, fontWeight:800, minWidth:38, textAlign:'center', color: brokenQty > 0 ? '#e63946' : 'var(--c-green)' }}>
                                  {brokenQty > 0 ? t('inventory.kitInstanceMissingCount', { count: brokenQty }) : '✓'}
                                </span>
                                <button type="button" className="btn-no-anim" disabled={brokenQty >= comp.qty} style={{ ...miniBtn, opacity: brokenQty >= comp.qty ? 0.4 : 1 }}
                                  aria-label={t('inventory.increaseBrokenComponentAria', { name: comp.name, number: inst.number })}
                                  onClick={() => onToggleBroken(inst.number, comp.itemId, comp.qty, 1)}>+</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'linked' && (
            <div>
              <p style={{ margin:'0 0 12px', fontSize:13, color:'var(--c-ink2)', lineHeight:1.45 }}>{t('inventory.kitLinkedHint')}</p>
              <LinkedItemsEditor items={items} selfId={selfId} value={form.linkedItems} onChange={links => setForm({ ...form, linkedItems: links })}
                search={linkedSearch} onSearchChange={setLinkedSearch} />
            </div>
          )}
        </div>

        <div className="rc-drawer-foot" style={{ padding:'14px 16px', borderTop:'1px solid var(--c-line)', flexShrink:0, background:'var(--c-surface)' }}>{footer}</div>
      </div>
    </div>
  )
}

// Riga oggetto — estratta per essere riusata sia nella vista raggruppata per
// categoria (default) sia nella lista piatta ordinata (quando un filtro
// avanzato è attivo), senza duplicare tutto il markup nei due rami.
// Contatore − / valore / + in un'unica pillola grigia (stesso linguaggio dei
// controlli del Calendario): pulsanti bianchi arrotondati, numero al centro.
// tone="red" per i pezzi rotti (si tinge di rosso quando > 0).
function Stepper({ value, onChange, min = 0, max, tone, decAria, incAria }) {
  const clamp = v => Math.min(max ?? Infinity, Math.max(min, v))
  const red = (tone === 'red' || tone === 'amber') && value > 0
  const toneColor = tone === 'amber' ? '#d97706' : '#e63946'
  const btn = {
    width:40, height:40, borderRadius:9, background:'var(--c-surface)', color: tone === 'red' ? '#e63946' : tone === 'amber' ? '#d97706' : 'var(--c-ink)',
    fontSize:19, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    boxShadow:'0 1px 2px rgba(0,0,0,0.08)',
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, background: red ? (tone === 'amber' ? 'rgba(217,119,6,0.12)' : 'rgba(230,57,70,0.10)') : 'var(--c-fill2)', borderRadius:12, padding:3 }}>
      <button type="button" className="btn-no-anim" onClick={() => onChange(clamp(value - 1))} aria-label={decAria} style={btn}>−</button>
      <input type="number" min={min} max={max} value={value}
        onChange={e => onChange(clamp(parseInt(e.target.value, 10) || min))}
        onFocus={e => e.target.select()}
        style={{ flex:1, minWidth:0, textAlign:'center', fontWeight:800, fontSize:16, padding:'6px 2px', border:'none', background:'transparent', boxShadow:'none', color: red ? toneColor : 'var(--c-ink)' }} />
      <button type="button" className="btn-no-anim" onClick={() => onChange(clamp(value + 1))} aria-label={incAria} style={btn}>+</button>
    </div>
  )
}

// Popup "Segnala rotto / difetto" della modifica oggetto: quanti pezzi, (facoltativo) quali pezzi
// numerati e con che problema, un commento. Stessa impostazione del menu rapido "Segnala".
function IssueReportDialog({ type, name, qty, already, onClose, onConfirm, t }) {
  const broken = type === 'broken'
  const color = broken ? '#e63946' : '#d97706'
  const room = Math.max(0, qty - already)
  const [n, setN] = useState(room > 0 ? 1 : 0)
  const [pieces, setPieces] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [unit, setUnit] = useState('')
  const [pieceNote, setPieceNote] = useState('')
  const [comment, setComment] = useState('')
  const unitNum = parseInt(unit, 10)
  const unitOk = unitNum >= 1 && unitNum <= qty
  const total = Math.max(n, pieces.length)
  const addPiece = () => {
    if (!unitOk) return
    const next = addIssue(pieces, { type, unit: unitNum, note: pieceNote })
    setPieces(next); setN(v => Math.max(v, next.length)); setUnit(''); setPieceNote(''); setAddOpen(false)
  }
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t(broken ? 'inventory.brokenSingle' : 'inventory.defectSingle')}
        style={{ position:'relative', width:'100%', maxWidth:340, maxHeight:'88dvh', overflowY:'auto', background:'var(--card)', borderRadius:16, padding:'20px 18px 18px', boxShadow:'0 12px 40px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} aria-label={t('common.close')} className="btn-no-anim"
          style={{ position:'absolute', top:6, right:6, background:'transparent', color:'var(--text2)', fontSize:16, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        <h2 style={{ margin:'0 40px 2px 0', fontSize:17, color }}>{t(broken ? 'inventory.brokenSingle' : 'inventory.defectSingle')}</h2>
        <p style={{ margin:'0 0 16px', fontSize:13, color:'var(--c-ink2)' }}>{name}</p>

        <div style={{ marginBottom:14 }}>
          <p style={{ fontSize:13, fontWeight:800, margin:'0 0 1px' }}>{t('inventory.issueHowMany')}</p>
          <p style={{ fontSize:12, color:'var(--c-ink2)', margin:'0 0 7px' }}>{t(broken ? 'inventory.brokenHint' : 'inventory.defectHint')}</p>
          <Stepper tone={broken ? 'red' : 'amber'} value={total} min={pieces.length} max={Math.max(pieces.length, room)} onChange={setN}
            decAria={t(broken ? 'inventory.decreaseBrokenAria' : 'inventory.decreaseDefectAria')} incAria={t(broken ? 'inventory.increaseBrokenAria' : 'inventory.increaseDefectAria')} />
        </div>

        {qty > 1 && (
          <div style={{ marginBottom:14 }}>
            {pieces.map(i => (
              <div key={i.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', marginBottom:6, borderRadius:10, background: broken ? 'rgba(230,57,70,0.08)' : 'rgba(217,119,6,0.10)' }}>
                <span style={{ fontSize:12, fontWeight:800, color, whiteSpace:'nowrap' }}>{t('inventory.issuePieceNumber', { n: i.unit })}</span>
                <span style={{ flex:1, minWidth:0, fontSize:12.5, color:'var(--c-ink)', overflowWrap:'anywhere' }}>{i.note || '—'}</span>
                <button type="button" className="btn-no-anim" aria-label={t('inventory.issueRemoveAria')} onClick={() => setPieces(removeIssueById(pieces, i.id))}
                  style={{ background:'transparent', color:'var(--c-ink3)', fontSize:15, width:28, height:28, flexShrink:0 }}>✕</button>
              </div>
            ))}
            {addOpen ? (
              <div style={{ padding:10, borderRadius:12, border:'1px solid var(--c-line)', background:'var(--c-alt)', display:'flex', flexDirection:'column', gap:8 }}>
                <input type="number" inputMode="numeric" min={1} max={qty} value={unit} onChange={e => setUnit(e.target.value)} autoFocus
                  placeholder={t('inventory.issuePieceNumberPlaceholder', { total: qty })} aria-label={t('inventory.issuePieceNumberLabel')} style={{ fontSize:14 }} />
                <input value={pieceNote} onChange={e => setPieceNote(e.target.value)} placeholder={t('inventory.issueNotePlaceholder')} aria-label={t('inventory.issueNoteLabel')} style={{ fontSize:14 }} />
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(false)} style={{ flex:1, minHeight:40, fontSize:13.5 }}>{t('common.cancel')}</button>
                  <button type="button" className="btn btn-secondary" onClick={addPiece} disabled={!unitOk} style={{ flex:2, minHeight:40, fontSize:13.5, opacity: unitOk ? 1 : 0.5 }}>{t('inventory.issuesAddConfirm')}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setAddOpen(true)} style={{ minHeight:42, fontSize:13.5, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Plus size={14} /> {t('inventory.issuesAddReported')}
              </button>
            )}
            <p style={{ fontSize:12, color:'var(--c-ink2)', margin:'6px 0 0' }}>{t('inventory.issuesPiecesHint')}</p>
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <label htmlFor="rc-issue-comment" style={{ display:'block', fontSize:12.5, fontWeight:800, color:'var(--c-ink2)', marginBottom:6 }}>
            {t('inventory.issueCommentLabel')} <span style={{ color:'var(--c-ink3)', fontWeight:500 }}>{t('common.optional')}</span>
          </label>
          <textarea id="rc-issue-comment" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('inventory.issueNotePlaceholder')} />
        </div>

        <button type="button" className="btn btn-primary" disabled={total < 1} onClick={() => onConfirm({ extra: Math.max(0, total - pieces.length), pieces, comment })}
          style={{ width:'100%', opacity: total < 1 ? 0.5 : 1 }}>
          {t(broken ? 'inventory.reportBrokenBtn' : 'inventory.reportDefectBtn')}
        </button>
      </div>
    </div>
  )
}

// Un solo pezzo in totale: "Rotto" / "Difettoso" invece di "1 rotto" / "1 con difetto".
const brokenText = (item, t) => (item.totalQty || 0) === 1 ? t('inventory.brokenSingle') : t('inventory.brokenCount', { count: item.brokenQty })
const defectText = (item, t) => (item.totalQty || 0) === 1 ? t('inventory.defectSingle') : t('inventory.defectCount', { count: item.defectQty })

function ItemRow({ item, onOpen, t, outEvents }) {
  return (
    <button type="button" className="item-row btn-no-anim" onClick={() => onOpen(item)} aria-label={t('inventory.openItemAria', { name: item.name })}>
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
        {/* Filtro "Fuori": a colpo d'occhio a quale evento è dovuta la
            giacenza ridotta, senza dover aprire ogni oggetto. Giacenza ridotta
            senza nessun evento corrispondente = probabilmente fuori a mano
            (segnato "fuori" da un rientro forzato, o mai stato in una lista). */}
        {outEvents && (
          <p style={{ color:'var(--accent2)', fontSize:12, marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
            <Truck size={12} />
            {outEvents.length > 0 ? outEvents.join(', ') : t('inventory.outNoEvent')}
          </p>
        )}
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <span className={`badge ${
          item.category === 'Consumabili'
            ? (item.minStock > 0 && (item.availableQty ?? item.totalQty) <= item.minStock ? 'partial' : 'in')
            : (item.availableQty === (item.totalQty - (item.brokenQty||0)) ? 'in' : item.availableQty === 0 ? 'out' : 'partial')
        }`}>
          {item.category === 'Consumabili'
            ? `${item.availableQty ?? item.totalQty} ${t(`inventory.unitShort_${item.consumableUnit || 'pezzi'}`)}`
            : `${item.availableQty}/${item.totalQty}`
          }
        </span>
        {item.brokenQty > 0 && (
          <div style={{ marginTop:4 }}>
            <span style={{ background:'rgba(248,113,113,0.15)', color:'var(--red)', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
              <Wrench size={11} /> {brokenText(item, t)}
            </span>
          </div>
        )}
        {item.defectQty > 0 && (
          <div style={{ marginTop:4 }}>
            <span style={{ background:'rgba(217,119,6,0.15)', color:'#b45309', borderRadius:6, padding:'2px 7px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
              <Warn size={11} /> {defectText(item, t)}
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
    </button>
  )
}