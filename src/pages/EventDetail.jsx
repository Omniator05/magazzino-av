import { useModalDrag } from '../hooks/useModalDrag'
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { doc, onSnapshot, updateDoc, collection, query, where, orderBy, getDocs, getDoc } from 'firebase/firestore'
import { deleteEventContentFile } from '../utils/eventOrganizerStorage'
import { toggleWorkerAssignment, isWorkerUnavailable } from '../utils/workerAssignment'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { useConfirm } from '../context/ConfirmProvider'
import DateBadge from '../components/DateBadge'
import { Warn } from '../components/Icon'
import { formatDate } from '../utils/formatDate'
import JSZip from 'jszip'

// Passata questa finestra di grazia dalla data dell'evento, i contenuti caricati
// dall'organizzatore vengono eliminati da Storage per non far crescere lo spazio occupato.
// A differenza della grafica "Next" di Brasserie (pulita lato organizzatore), qui il controllo
// è lato admin: un organizzatore di un evento one-off probabilmente non riapre più l'app dopo
// l'evento, quindi il trigger va agganciato a una pagina che l'admin visita regolarmente.
const ORGANIZER_CONTENT_RETENTION_DAYS = 7
const ORGANIZER_CATEGORY_LABELS = { video: 'Video', pptx: 'Presentazione (PPTX)', tappo: 'Sfondo di riserva' }

function slugifyName(s) {
  const normalized = (s || 'file').toLowerCase().trim().normalize('NFD')
  const diacriticsPattern = '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']'
  const noDiacritics = normalized.replace(new RegExp(diacriticsPattern, 'g'), '')
  return noDiacritics.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'file'
}

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

export default function EventDetail() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { user, teamId } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const today = new Date().toISOString().split('T')[0]
  const [allItems, setAllItems] = useState([])
  const [brasserieWeek, setBrasserieWeek] = useState(null)
  const [organizerContent, setOrganizerContent] = useState(null)
  const [zipping, setZipping] = useState(false)
  const [zipError, setZipError] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showExtraModal, setShowExtraModal] = useState(false)
  const [cart, setCart] = useState([])
  const [showDiscardCart, setShowDiscardCart] = useState(false)
  const addItemDrag   = useModalDrag(
    () => setShowAddItem(false),
    () => { if (cart.length > 0) { setShowDiscardCart(true); return false } return true }
  )
  const kbInset = useKeyboardInset(showAddItem)
  const [extraForm, setExtraForm] = useState({ name:'', qty:1, notes:'' })
  const addExtraItem = () => {
    if (!extraForm.name.trim()) return
    const extra = {
      id: `extra-${Date.now()}`,
      name: extraForm.name.trim(),
      qty: extraForm.qty || 1,
      notes: extraForm.notes.trim(),
      category: 'Extra',
      isExtra: true,
    }
    setCart(prev => [...prev, extra])
    setExtraForm({ name:'', qty:1, notes:'' })
    setShowExtraModal(false)
  }
  const extraDrag     = useModalDrag(() => setShowExtraModal(false), undefined, addExtraItem)
  const [templates, setTemplates] = useState([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const templatePickerDrag = useModalDrag(() => setShowTemplatePicker(false))
  const [search, setSearch] = useState('')
  const [showEventNotes, setShowEventNotes] = useState(false)
  // Assegnazione furgone in blocco — evita di dover aprire il menu su ogni riga
  // quando si vuole assegnare lo stesso furgone a più oggetti già in lista.
  const [bulkVehicleMode, setBulkVehicleMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set())
  const [bulkVehicleId, setBulkVehicleId] = useState('')
  const [addAsMancante, setAddAsMancante] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const saveItemEdit = async ({ id, qty, eventNote, mancante }) => {
    const updated = eventItems.map(i =>
      i.id !== id ? i : { ...i, qty, eventNote: eventNote || '', mancante: mancante || false }
    )
    await updateEventItems(updated)
    setEditItem(null)
  }
  const itemEditDrag = useModalDrag(() => setEditItem(null), undefined, () => editItem && saveItemEdit(editItem))
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [workers, setWorkers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [itemDetails, setItemDetails] = useState({}) // id/itemRef → { location, notes } dal catalogo
  const resolvedItemDetailIdsRef = useRef(new Set())
  const [unavailability, setUnavailability] = useState([])
  const assignDrag = useModalDrag(() => setShowAssignModal(false))
  const [suggestionMaps, setSuggestionMaps] = useState(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  useModalScrollLock(showAddItem || showExtraModal || showTemplatePicker || !!editItem || showAssignModal)

  const eventRef = doc(db, 'events', id)

  useEffect(() => {
    return onSnapshot(eventRef, snap => {
      if (snap.exists()) setEvent({ id: snap.id, ...snap.data() })
    })
  }, [id])

  // Se questa data corrisponde a una settimana Brasserie configurata da un organizzatore,
  // mostra la card di verifica contenuti in cima alla lista di carico
  useEffect(() => {
    if (!event?.date || !teamId) { setBrasserieWeek(null); return }
    const q = query(collection(db, 'brasserieWeeks'), where('teamId', '==', teamId), where('date', '==', event.date))
    return onSnapshot(q, snap => {
      if (snap.empty) { setBrasserieWeek(null); return }
      // Se per la stessa data esistono più documenti (es. residui di test con schema id vecchio),
      // prendi sempre quello aggiornato più di recente
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
      setBrasserieWeek(docs[0])
    })
  }, [event?.date, teamId])

  // Contenuti caricati da un organizzatore evento (generico) collegato a questo evento per id reale
  useEffect(() => {
    if (!id) { setOrganizerContent(null); return }
    return onSnapshot(doc(db, 'eventOrganizerContent', id), snap => {
      setOrganizerContent(snap.exists() ? snap.data() : null)
    })
  }, [id])

  // Pulizia contenuti organizzatore scaduti (evento passato da più di ORGANIZER_CONTENT_RETENTION_DAYS giorni)
  useEffect(() => {
    if (!event?.date || !organizerContent?.items?.length) return
    const eventEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - ORGANIZER_CONTENT_RETENTION_DAYS)
    const cutoffYMD = cutoff.toISOString().slice(0, 10)
    if (eventEnd >= cutoffYMD) return
    Promise.all(organizerContent.items.map(i => deleteEventContentFile(i.storagePath)))
      .then(() => updateDoc(doc(db, 'eventOrganizerContent', id), { items: [] }))
      .catch(() => {})
  }, [event?.date, event?.dateEnd, organizerContent, id])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.role === 'worker' || p.role === 'admin'))
    })
  }, [teamId])

  // Niente filtro active lato Firestore: un furgone disattivato deve poter
  // essere ancora risolto per nome sulle righe evento che lo referenziano già
  // (il filtro "solo attivi" per le nuove assegnazioni è lato client, vedi select).
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'vehicles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'unavailability'), where('teamId', '==', teamId)), snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    // Listen for real time updates
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setAllItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  // Template disponibili (per applicarli a un evento già esistente)
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'templates'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  const applyTemplate = async (template) => {
    const items = (template.components || []).map(c => ({
      id: c.id, name: c.name, category: c.category, qty: c.qty,
      loaded: false, returned: false,
    }))
    await updateEventItems(items)
    setShowTemplatePicker(false)
  }

  // Calcola frequenza e co-occorrenza dagli eventi passati ogni volta che si apre il modal
  useEffect(() => {
    if (!showAddItem) { setSuggestionMaps(null); return }
    setLoadingSuggestions(true)
    getDocs(query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc')))
      .then(snap => {
        const freq = {}, cooc = {}
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => e.id !== id && (e.items?.length || 0) > 0)
          .forEach(ev => {
            // ID canonico: usa itemRef se presente (righe mancante extra)
            const ids = [...new Set((ev.items || []).map(i => i.itemRef || i.id))]
            ids.forEach(a => {
              freq[a] = (freq[a] || 0) + 1
              if (!cooc[a]) cooc[a] = {}
              ids.forEach(b => { if (b !== a) cooc[a][b] = (cooc[a][b] || 0) + 1 })
            })
          })
        setSuggestionMaps({ freq, cooc })
        setLoadingSuggestions(false)
      })
  }, [showAddItem])

  // Posizione/note live dal catalogo, recuperate in BLOCCO per tutti gli
  // oggetti della lista (non riga per riga): risolvendo tutte insieme invece
  // che una alla volta con tempi scaglionati, la lista non "cresce" pezzo per
  // pezzo sotto il dito mentre l'utente sta per toccare un bottone.
  useEffect(() => {
    const items = event?.items || []
    const idsToFetch = [...new Set(items.filter(i => !i.isExtra).map(i => i.itemRef || i.id))]
      .filter(itemId => !resolvedItemDetailIdsRef.current.has(itemId))
    if (idsToFetch.length === 0) return
    idsToFetch.forEach(itemId => resolvedItemDetailIdsRef.current.add(itemId))
    Promise.all(idsToFetch.map(itemId =>
      getDoc(doc(db, 'items', itemId)).then(snap => [itemId, snap.exists() ? snap.data() : null])
    )).then(results => {
      setItemDetails(prev => {
        const next = { ...prev }
        results.forEach(([itemId, data]) => {
          next[itemId] = { location: data?.location || null, notes: data?.notes || null }
        })
        return next
      })
    })
  }, [event])

  if (!event) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh' }}>
      <p style={{ color:'var(--text2)' }}>{t('eventDetail.loading')}</p>
    </div>
  )

  const eventItems = event.items || []
  const loaded = eventItems.filter(i => i.loaded).length
  const returned = eventItems.filter(i => i.returned).length
  const total = eventItems.length
  const mancanti = eventItems.filter(i => i.mancante).length

  // Contenuti Brasserie per questa data (se un organizzatore ne ha configurata una)
  const brasserieArtistiSlots = brasserieWeek?.layers?.artisti || []
  const brasserieArtistiFilled = brasserieArtistiSlots.filter(s => s.logoUrl).length
  const brasserieSponsorSlots = brasserieWeek?.layers?.sponsor || []
  const brasserieFood = brasserieSponsorSlots.find(s => s.slotId === 'sponsor-food')
  const brasserieDj = brasserieSponsorSlots.find(s => s.slotId === 'sponsor-dj')
  const brasserieNext = brasserieWeek?.nextGraphic

  const downloadBrasserieZip = async () => {
    if (!brasserieWeek) return
    setZipping(true)
    setZipError('')
    try {
      const files = []
      brasserieArtistiSlots.forEach((s, i) => { if (s.logoUrl) files.push({ name: `artisti-${i + 1}-${slugifyName(s.artistName)}`, url: s.logoUrl }) })
      if (brasserieFood?.logoUrl) files.push({ name: `sponsor-cibo-${slugifyName(brasserieFood.artistName)}`, url: brasserieFood.logoUrl })
      if (brasserieDj?.logoUrl) files.push({ name: `sponsor-dj-${slugifyName(brasserieDj.artistName)}`, url: brasserieDj.logoUrl })
      if (brasserieNext?.url) files.push({ name: 'next', url: brasserieNext.url })

      if (files.length === 0) { setZipError('Nessun file da scaricare per questa settimana.'); return }

      const zip = new JSZip()
      await Promise.all(files.map(async f => {
        const res = await fetch(f.url)
        if (!res.ok) throw new Error(`Download fallito per ${f.name} (HTTP ${res.status})`)
        const blob = await res.blob()
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        zip.file(`${f.name}.${ext}`, blob)
      }))

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `brasserie-${event.date}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      // Errore con messaggio esplicito (es. "Download fallito per X (HTTP 404)") → mostralo così com'è,
      // è più utile del generico avviso CORS che altrimenti lo maschererebbe
      setZipError(e?.message?.startsWith('Download fallito per')
        ? e.message
        : 'Download fallito. Se il problema persiste, controlla la configurazione CORS di Firebase Storage.')
    } finally {
      setZipping(false)
    }
  }

  const updateEventItems = async (items) => {
    await updateDoc(eventRef, { items })
    // Propaga solo la struttura (nome, qty, categoria) agli altri eventi della serie,
    // senza copiare lo stato di carico/rientro che è specifico di ogni occorrenza
    if (event.seriesId) {
      const { collection: col, query: q, where, getDocs: gd } = await import('firebase/firestore')
      const seriesSnap = await gd(q(col(db, 'events'), where('teamId', '==', event.teamId), where('seriesId', '==', event.seriesId)))
      const itemsTemplate = items.map(({ loaded, returned, mancante, pronto, ...rest }) => ({
        ...rest, loaded: false, returned: false, mancante: false, pronto: false
      }))
      const updates = seriesSnap.docs
        .filter(d => d.id !== event.id)
        .map(d => updateDoc(doc(db, 'events', d.id), { items: itemsTemplate }))
      await Promise.all(updates)
    }
  }

  // Furgone assegnato a una riga — è struttura del carico (come categoria/qty),
  // non stato di avanzamento: passa da updateEventItems per propagarsi alla serie.
  const setItemVehicle = async (itemId, vehicleId) => {
    const updated = eventItems.map(i => i.id !== itemId ? i : { ...i, vehicleId: vehicleId || null })
    await updateEventItems(updated)
  }

  const toggleBulkSelect = (itemId) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  const exitBulkVehicleMode = () => {
    setBulkVehicleMode(false)
    setBulkSelectedIds(new Set())
    setBulkVehicleId('')
  }

  // Applica un furgone a tutti gli oggetti selezionati in un'unica scrittura,
  // invece di un giro di select per ciascuna riga.
  const applyBulkVehicle = async () => {
    if (bulkSelectedIds.size === 0 || !bulkVehicleId) return
    const vehicleId = bulkVehicleId === '__none__' ? null : bulkVehicleId
    const updated = eventItems.map(i => bulkSelectedIds.has(i.id) ? { ...i, vehicleId } : i)
    await updateEventItems(updated)
    exitBulkVehicleMode()
  }

  const toggleLoaded = async itemId => {
    const updated = eventItems.map(i => {
      if (i.id !== itemId) return i
      const newLoaded = !i.loaded
      return { ...i, loaded: newLoaded, returned: newLoaded ? false : i.returned, pronto: newLoaded ? i.pronto : false }
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

  const togglePronto = async itemId => {
    const updated = eventItems.map(i => i.id !== itemId ? i : { ...i, pronto: !i.pronto })
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
      if (c.isExtra) {
        updated.push({
          id: c.id, name: c.name, qty: c.qty || 1,
          notes: c.notes || '', category: 'Extra', isExtra: true,
          loaded: false, returned: false,
        })
        continue
      }
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
    setCart([])
    setSearch('')
    setAddAsMancante(false)
    setShowAddItem(false)
    await updateEventItems(updated)
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
      if (!(await confirm({ title: t('eventDetail.confirmStillOutTitle'), message: t('eventDetail.confirmStillOutMessage'), confirmLabel: t('eventDetail.confirmStillOutLabel'), danger: true }))) return
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

  // Con "segna come mancanti" attivo, un articolo già in lista deve restare
  // selezionabile — è esattamente il caso d'uso: te ne serve ancora, quindi
  // vuoi aggiungerne una seconda riga segnata mancante (gestito da confirmCart).
  const notInCart = allItems.filter(i =>
    !cart.some(c => c.id === i.id) &&
    (addAsMancante || !eventItems.some(e => (e.itemRef || e.id) === i.id))
  )
  const filtered = notInCart.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase())
  )

  // Suggerimenti intelligenti: frequenza + bonus co-occorrenza con articoli già in lista/carrello
  const currentEventIds = new Set([
    ...eventItems.map(i => i.itemRef || i.id),
    ...cart.map(c => c.id),
  ])
  const suggestions = suggestionMaps
    ? notInCart
        .map(item => {
          const base = suggestionMaps.freq[item.id] || 0
          let coocBonus = 0
          currentEventIds.forEach(cid => { coocBonus += (suggestionMaps.cooc[cid]?.[item.id] || 0) })
          return { item, score: base + coocBonus * 2 }
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(s => s.item)
    : []
  const suggestedIds = new Set(suggestions.map(s => s.id))
  // Nella lista principale (senza ricerca) nascondi gli articoli già mostrati nei suggerimenti
  const filteredForList = search ? filtered : filtered.filter(i => !suggestedIds.has(i.id))

  const exportPDF = () => {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]))
    const items = event.items || []
    const loaded = items.filter(i => i.loaded && !i.isExtra)
    const extras = items.filter(i => i.loaded && i.isExtra)
    const list = [...loaded, ...extras]
    const totPezzi = list.reduce((s, i) => s + (i.qty || 1), 0)

    const fmt = (d, opt) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', opt) : ''
    const dateFull = fmt(event.date, { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    const dateEnd  = event.dateEnd && event.dateEnd !== event.date ? ' → ' + fmt(event.dateEnd, { day:'numeric', month:'long', year:'numeric' }) : ''
    const phases = []
    if (event.phases?.montaggio)  phases.push('Montaggio: ' + fmt(event.phases.montaggio, { day:'numeric', month:'long' }))
    if (event.phases?.smontaggio) phases.push('Smontaggio: ' + fmt(event.phases.smontaggio, { day:'numeric', month:'long' }))
    const origin = window.location.origin
    const genDate = new Date().toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })

    const rows = list.map((i, n) =>
      `<tr>
        <td class="num">${n + 1}</td>
        <td class="art">${esc(i.name)}${i.isExtra ? ' <span class="tag">EXTRA</span>' : ''}${i.eventNote ? `<div class="note">${esc(i.eventNote)}</div>` : ''}</td>
        <td class="qty">${i.qty || 1}</td>
        <td class="chk"></td>
      </tr>`
    ).join('')

    const metaRow = (label, val) => val ? `<div class="mrow"><span class="mlabel">${label}</span><span class="mval">${esc(val)}</span></div>` : ''

    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Lista di Carico – ${esc(event.name)}</title>
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 40px; }
      .head { display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid #e63946; padding-bottom: 16px; margin-bottom: 22px; }
      .head img { height: 46px; width:auto; }
      .head .org { text-align:right; }
      .head .org .name { font-weight: 800; font-size: 15px; letter-spacing: 0.3px; }
      .head .org .sub  { color: #6b7280; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
      .doctitle { font-size: 12px; font-weight: 700; color: #e63946; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px; }
      h1 { font-size: 24px; font-weight: 800; margin: 0 0 14px; letter-spacing: -0.4px; }
      .meta { background:#f5f5f3; border:1px solid #e5e7eb; border-radius:10px; padding:12px 16px; margin-bottom:22px; }
      .mrow { display:flex; gap:10px; font-size:13px; padding:3px 0; }
      .mlabel { color:#6b7280; min-width:96px; font-weight:600; }
      .mval { color:#111827; font-weight:600; text-transform: capitalize; }
      table { width: 100%; border-collapse: collapse; }
      thead th { background: #222c42; color: #fff; padding: 9px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
      thead th.num { width: 36px; text-align:center; }
      thead th.qty { width: 60px; text-align:center; }
      thead th.chk { width: 44px; text-align:center; }
      tbody td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: top; }
      tbody td.num { text-align:center; color:#9ca3af; font-weight:700; }
      tbody td.art { font-weight: 600; }
      tbody td.qty { text-align:center; font-weight: 800; color:#e63946; }
      tbody td.chk { text-align:center; }
      tbody td.chk::before { content:''; display:inline-block; width:16px; height:16px; border:1.5px solid #9ca3af; border-radius:4px; }
      tbody tr:nth-child(even) { background:#fafafa; }
      .tag { background:#fef3c7; color:#92400e; border-radius:4px; padding:0 5px; font-size:9px; font-weight:800; vertical-align:middle; }
      .note { color:#6b7280; font-size:11px; font-weight:400; margin-top:2px; }
      .tot { margin-top:12px; text-align:right; font-size:13px; color:#374151; }
      .tot strong { color:#111827; }
      .sign { display:flex; gap:40px; margin-top:54px; }
      .sigbox { flex:1; }
      .sigline { border-top:1px solid #111827; padding-top:6px; font-size:12px; color:#6b7280; font-weight:600; }
      .footer { margin-top:40px; padding-top:12px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:11px; display:flex; justify-content:space-between; }
      @page { margin: 16mm; }
    </style></head><body>
      <div class="head">
        <img src="${origin}/logo.png" alt="The Service Group" onerror="this.style.display='none'" />
        <div class="org"><div class="name">The Service Group</div><div class="sub">Gestione Magazzino</div></div>
      </div>

      <div class="doctitle">Lista di Carico</div>
      <h1>${esc(event.name)}</h1>

      <div class="meta">
        ${metaRow('Data evento', dateFull + dateEnd)}
        ${metaRow('Luogo', event.location)}
        ${phases.length ? metaRow('Fasi', phases.join('  ·  ')) : ''}
        ${metaRow('Articoli', `${list.length} voci · ${totPezzi} pezzi totali`)}
      </div>

      <table>
        <thead><tr><th class="num">#</th><th>Articolo</th><th class="qty">Q.tà</th><th class="chk">✓</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:24px;">Nessun articolo caricato</td></tr>'}</tbody>
      </table>
      <p class="tot">Totale: <strong>${list.length} voci · ${totPezzi} pezzi</strong></p>

      <div class="sign">
        <div class="sigbox"><div class="sigline">Firma magazziniere</div></div>
        <div class="sigbox"><div class="sigline">Firma caricatore / autista</div></div>
      </div>

      <div class="footer">
        <span>Documento generato il ${genDate}</span>
        <span>The Service Group — Gestione Magazzino</span>
      </div>
    </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 250)
  }

  const CAT_ICONS = { Audio:'🔊', Video:'📺', Luci:'🔦', Rigging:'⛓️', Corrente:'⚡', Effetti:'🎉', Consumabili:'🪣', Microfoni:'🎤', Traduzione:'🌐', Connettività:'📶', Comunicazione:'📡', Strumenti:'🎸', Kit:'🧰', Extra:'✨', Altro:'📦' }
  const CAT_ORDER = ['Kit','Audio','Video','Luci','Rigging','Corrente','Effetti','Consumabili','Microfoni','Traduzione','Connettività','Comunicazione','Strumenti','Extra','Altro']
  const catGrouped = {}
  eventItems.forEach(item => {
    // Categorie "orfane" finiscono in Altro invece di sparire: un articolo può
    // avere qui la categoria congelata al momento dell'aggiunta all'evento,
    // che non esiste più tra quelle attuali se nel frattempo è stata rinominata
    // nel magazzino (es. vecchia migrazione categorie) — il dato non va perso.
    const rawCat = item.isExtra ? 'Extra' : (item.category || 'Altro')
    const cat = CAT_ORDER.includes(rawCat) ? rawCat : 'Altro'
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
        <EventItemRow key={item.id} item={item} onToggleLoaded={toggleLoaded} onToggleReturned={toggleReturned} onRemove={removeFromEvent} onEdit={setEditItem} onToggleMancante={toggleMancante} onTogglePronto={togglePronto} vehicles={vehicles} onSetVehicle={setItemVehicle} bulkMode={bulkVehicleMode} bulkSelected={bulkSelectedIds.has(item.id)} onBulkToggle={toggleBulkSelect} location={itemDetails[item.itemRef || item.id]?.location || null} warehouseNotes={itemDetails[item.itemRef || item.id]?.notes || null} />
      ))}
    </div>
  ))

  return (
    <div className="page">
      <div style={{ background:'var(--bg2)', padding:'52px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <button onClick={() => navigate(-1)} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px 14px', fontSize:14 }}>← {t('common.back')}</button>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={exportPDF}
              style={{ background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', color:'var(--accent)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              {t('eventDetail.pdf')}
            </button>
          <button
            onClick={() => navigate(`/events/${id}/scan`)}
            style={{ background:'linear-gradient(135deg,rgba(79,195,247,0.2),rgba(79,195,247,0.08))', border:'1px solid rgba(79,195,247,0.35)', color:'var(--blue)', borderRadius:10, padding:'8px 14px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M1 1h4v4H1zm14 0h4v4h-4zM1 15h4v4H1zM5 5h2V1h2v4h2V1h2v4h2V1h4v4h-2v2h2v2h-4V9h-2v4h2v2h-2v2h-2v-2H9v4H7v-4H5V9H3V7H1V5h2V3h2v2zm4 4H7V7h2v2zm8 8h-2v2h2v-2zm2-2h2v2h-2v-2zm2-2h-2v-2h2v2zm-4 0h-2v-2h2v2z"/></svg>
            {t('eventDetail.startLoading')}
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
                  { key:'montaggio',  label:t('calendar.legendAssembly'),    color:'#2563eb', bg:'#dbeafe' },
                  { key:'smontaggio', label:t('calendar.legendDisassembly'), color:'#ea580c', bg:'#ffedd5' },
                ].filter(p => event.phases[p.key]).map(p => {
                  const isToday = event.phases[p.key] === today
                  return (
                    <span key={p.key} style={{ display:'inline-flex', alignItems:'center', gap:5, background: isToday ? p.color : p.bg, color: isToday ? 'white' : p.color, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800, border: isToday ? 'none' : `1px solid ${p.color}33` }}>
                      {p.label} · {formatDate(event.phases[p.key]+'T12:00:00', {weekday:'short',day:'numeric',month:'short'}, i18n.language)}
                      {isToday && ` · ${t('calendar.today').toUpperCase()}`}
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
                const unavail = isWorkerUnavailable(wid, event, unavailability)
                return (
                  <span key={wid} style={{ display:'inline-flex', alignItems:'center', gap:5, background: unavail ? 'rgba(216,56,63,0.12)' : 'rgba(79,195,247,0.12)', border: `1px solid ${unavail ? 'rgba(216,56,63,0.35)' : 'rgba(79,195,247,0.3)'}`, borderRadius:20, padding:'3px 6px 3px 10px', fontSize:12, fontWeight:700, color: unavail ? 'var(--red)' : 'var(--blue)' }}>
                    {unavail ? '⚠️' : '👷'} {w.name}
                    <button onClick={() => toggleWorkerAssignment(eventRef, event, wid)} style={{ width:16, height:16, borderRadius:'50%', background: unavail ? 'rgba(216,56,63,0.2)' : 'rgba(79,195,247,0.25)', color: unavail ? 'var(--red)' : 'var(--blue)', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </span>
                )
              })}
              <button
                onClick={() => setShowAssignModal(true)}
                style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--card2)', border:'1px dashed var(--border)', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, color:'var(--text2)' }}
              >
                {t('eventDetail.assign')}
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
          <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700 }}>{t('eventDetail.createdFromTemplate')}</p>
        </div>
      )}
      <div style={{ padding:'16px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px' }}>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>{t('eventDetail.loadedStat')}</p>
            <p style={{ fontWeight:800, fontSize:22, color: total > 0 && loaded === total ? 'var(--green)' : 'var(--accent2)' }}>{loaded}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
          </div>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px' }}>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:4 }}>{t('eventDetail.returnedStat')}</p>
            <p style={{ fontWeight:800, fontSize:22, color: total > 0 && returned === total ? 'var(--green)' : 'var(--text2)' }}>{returned}<span style={{ color:'var(--text2)', fontSize:14, fontWeight:400 }}>/{total}</span></p>
          </div>
        </div>
        {total > 0 && (
          <div style={{ background:'var(--card2)', borderRadius:4, height:6 }}>
            <div style={{ background: returned === total ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.4s ease' }} />
          </div>
        )}
        {returned === total && total > 0 && <p style={{ color:'var(--green)', fontSize:13, marginTop:8, fontWeight:700 }}>{t('eventDetail.allReturned')}</p>}
        {mancanti > 0 && (
          <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(234,88,12,0.08)', border:'1px solid rgba(234,88,12,0.25)', borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <p style={{ color:'#ea580c', fontSize:13, fontWeight:700 }}>{t('eventDetail.missingItems', { count: mancanti })}</p>
          </div>
        )}

        {/* Bottone chiudi installazione */}
        {event.type === 'installation' && (
          <button
            onClick={async () => {
              if (!(await confirm({ title: t('eventDetail.confirmCloseInstallationTitle'), message: t('eventDetail.confirmCloseInstallationMessage'), confirmLabel: t('eventDetail.confirmCloseInstallationLabel') }))) return
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
            {t('eventDetail.closeInstallation')}
          </button>
        )}
      </div>

      {/* Contenuti Brasserie — solo se un organizzatore ha configurato una settimana per questa data */}
      {brasserieWeek && (
        <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid rgba(155,89,224,0.3)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <p style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:6 }}>{t('eventDetail.brasserieContent')}</p>
            <span className="badge" style={{
              background: brasserieWeek.status === 'published' ? 'rgba(105,240,174,0.15)' : 'rgba(245,166,35,0.15)',
              color: brasserieWeek.status === 'published' ? 'var(--green)' : 'var(--accent2)',
            }}>
              {brasserieWeek.status === 'published' ? t('eventDetail.published') : t('eventDetail.draft')}
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{t('eventDetail.artists')}</span>
              <span style={{ fontWeight:700, color: brasserieArtistiFilled === brasserieArtistiSlots.length && brasserieArtistiSlots.length > 0 ? 'var(--green)' : 'var(--text)' }}>{brasserieArtistiFilled}/{brasserieArtistiSlots.length}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{t('eventDetail.foodStand')}</span>
              <span style={{ fontWeight:700, color: brasserieFood?.logoUrl ? 'var(--green)' : 'var(--red)' }}>{brasserieFood?.logoUrl ? '✓' : '✗'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{t('eventDetail.preShowDj')}</span>
              <span style={{ fontWeight:700, color: brasserieDj?.logoUrl ? 'var(--green)' : 'var(--red)' }}>{brasserieDj?.logoUrl ? '✓' : '✗'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>{t('eventDetail.nextGraphic')}</span>
              <span style={{ fontWeight:700, color: brasserieNext?.url ? 'var(--green)' : 'var(--red)' }}>{brasserieNext?.url ? '✓' : '✗'}</span>
            </div>
          </div>
          <button onClick={downloadBrasserieZip} disabled={zipping} className="btn btn-secondary btn-full" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            {zipping ? t('eventDetail.preparingZip') : t('eventDetail.downloadLogosZip')}
          </button>
          {zipError && (
            <p style={{ color:'var(--red)', fontSize:12, marginTop:8, lineHeight:1.5 }}>{zipError}</p>
          )}
        </div>
      )}

      {/* Contenuti organizzatore evento (generico) — collegato per id reale, non per data */}
      {organizerContent?.items?.length > 0 && (
        <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid rgba(22,160,133,0.3)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <p style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>{t('eventDetail.organizerContent')}</p>
          {organizerContent.items.map(item => (
            <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg3)', borderRadius:10, padding:'10px 12px', marginBottom:8 }}>
              <div style={{ minWidth:0, marginRight:10 }}>
                <p style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.fileName}</p>
                <p style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>{ORGANIZER_CATEGORY_LABELS[item.category] || item.category}</p>
              </div>
              <a href={item.url} download={item.fileName} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:12, flexShrink:0 }}>{t('eventDetail.download')}</a>
            </div>
          ))}
        </div>
      )}

      {/* Assegnazione furgone in blocco */}
      {eventItems.length > 0 && vehicles.length > 0 && (
        bulkVehicleMode ? (
          <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1.5px solid var(--accent)', borderRadius:'var(--radius)', padding:'12px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{t('eventDetail.bulkSelectedCount', { count: bulkSelectedIds.size })}</p>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setBulkSelectedIds(new Set(eventItems.map(i => i.id)))} style={{ background:'transparent', color:'var(--blue)', fontSize:12, fontWeight:700 }}>{t('eventDetail.selectAll')}</button>
                <button onClick={() => setBulkSelectedIds(new Set())} style={{ background:'transparent', color:'var(--text2)', fontSize:12, fontWeight:700 }}>{t('eventDetail.selectNone')}</button>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <select
                value={bulkVehicleId}
                onChange={e => setBulkVehicleId(e.target.value)}
                style={{ flex:1, fontSize:13, borderRadius:10, padding:'9px 10px', border:'1.5px solid var(--border)', background:'var(--card2)', color:'var(--text)' }}
              >
                <option value="">{t('eventDetail.chooseVehicle')}</option>
                {vehicles.filter(v => v.active !== false).map(v => (
                  <option key={v.id} value={v.id}>{v.emoji ? v.emoji + ' ' : ''}{v.name}</option>
                ))}
                <option value="__none__">{t('eventDetail.noVehicleRemove')}</option>
              </select>
              <button onClick={applyBulkVehicle} disabled={bulkSelectedIds.size === 0 || !bulkVehicleId} className="btn btn-primary" style={{ padding:'9px 16px', fontSize:13, flexShrink:0, opacity: (bulkSelectedIds.size === 0 || !bulkVehicleId) ? 0.5 : 1 }}>
                {t('eventDetail.apply')}
              </button>
            </div>
            <button onClick={exitBulkVehicleMode} style={{ marginTop:10, width:'100%', background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'8px', fontSize:12, fontWeight:700 }}>{t('common.cancel')}</button>
          </div>
        ) : (
          <div style={{ margin:'12px 16px 0', display:'flex', justifyContent:'flex-end' }}>
            <button
              onClick={() => setBulkVehicleMode(true)}
              style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'9px 14px', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}
            >
              {t('eventDetail.assignVehicleToMultiple')}
            </button>
          </div>
        )
      )}

      {/* Lista articoli */}
      <div style={{ margin:'12px 16px 0', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        {eventItems.length === 0
          ? <div className="empty-state" style={{ padding:'40px 20px' }}>
              <p style={{ fontSize:32 }}>📋</p>
              <h3>{t('eventDetail.emptyListTitle')}</h3>
              <p>{t('eventDetail.emptyListDescBefore')} <strong style={{ color:'var(--accent)' }}>+</strong> {t('eventDetail.emptyListDescAfter')}</p>
              {templates.length > 0 && (
                <button
                  onClick={() => setShowTemplatePicker(true)}
                  style={{ marginTop:14, padding:'7px 16px', borderRadius:20, background:'transparent', border:'1px solid rgba(90,82,201,0.35)', color:'#7c6fcd', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}
                >
                  {t('eventDetail.useTemplate')}
                </button>
              )}
            </div>
          : <>{groupedEventItems}</>
        }
      </div>

      {/* FAB aggiungi articoli */}
      <button
        onClick={openAddModal}
        aria-label={t('eventDetail.addItemsAriaLabel')}
        style={{
          position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 132px)', right:20, zIndex:50,
          width:56, height:56, borderRadius:'50%',
          background:'var(--accent)', color:'white',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 20px rgba(230,57,70,0.45)', border:'none',
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* Conferma: chiusura con articoli selezionati non aggiunti */}
      {showDiscardCart && (
        <div onClick={() => setShowDiscardCart(false)} style={{ position:'fixed', inset:0, zIndex:10001, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background:'#fff', borderRadius:24, padding:'26px 22px 20px', width:'100%', maxWidth:320, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)' }}>
            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(234,88,12,0.12)', color:'#ea580c' }}>
              <Warn size={26} />
            </div>
            <h3 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.3px' }}>{t('eventDetail.discardTitle')}</h3>
            <p style={{ fontSize:14, color:'#6b7280', margin:0, lineHeight:1.45 }}>
              {t('eventDetail.discardMessage', { count: cart.length })}
            </p>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setShowDiscardCart(false)} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#f3f4f6', color:'#374151', border:'none' }}>{t('eventDetail.continue')}</button>
              <button onClick={() => { setShowDiscardCart(false); setCart([]); setShowAddItem(false) }} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#ea580c', color:'#fff', border:'none' }}>{t('eventDetail.exit')}</button>
            </div>
          </div>
        </div>
      )}

      {showAddItem && (
        <div className={`modal-overlay${addItemDrag.closing ? ' closing' : ''}`} onClick={addItemDrag.onOverlayClick}>
          <div className={`modal${addItemDrag.jiggling ? ' modal-jiggle' : ''}${addItemDrag.closing ? ' closing' : ''}`} style={{ position:'relative', height:`calc(88dvh - ${kbInset}px)`, maxHeight:`calc(88dvh - ${kbInset}px)`, marginBottom:kbInset, display:'flex', flexDirection:'column', padding:0, transition:'height 0.22s ease, margin-bottom 0.22s ease' }} {...addItemDrag.props}>

            {/* Header fisso */}
            <div style={{ padding:'20px 20px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <h2 style={{ margin:0, fontSize:18 }}>{t('eventDetail.addToListTitle')}</h2>
                <button className="close-btn" onClick={addItemDrag.close}>✕</button>
              </div>
              {/* Barra di ricerca */}
              <div style={{ position:'relative' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('inventory.searchPlaceholder')}
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
                  {t('eventDetail.markAsMissing')}
                </span>
                <span style={{ width:36, height:20, borderRadius:10, background: addAsMancante ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: addAsMancante ? 'flex-end' : 'flex-start' }}>
                  <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
                </span>
              </button>
              {/* Articolo extra */}
              <button
                className="btn-no-anim"
                onClick={() => setShowExtraModal(true)}
                style={{ marginTop:8, width:'100%', padding:'9px 14px', borderRadius:10, background:'#111827', border:'none', color:'#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
              >
                {t('eventDetail.addExtraItem')}
              </button>
            </div>

            {/* Carrello selezionati — riga unica scrollabile in orizzontale */}
            {cart.length > 0 && (
              <div style={{ background:'rgba(105,240,174,0.06)', borderBottom:'1px solid rgba(105,240,174,0.2)', padding:'10px 0 10px 16px', flexShrink:0 }}>
                <p style={{ color:'var(--green)', fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, paddingRight:16 }}>
                  {t('eventDetail.selectedCount', { count: cart.length })}
                </p>
                <div style={{ display:'flex', flexWrap:'nowrap', gap:6, overflowX:'auto', paddingRight:16, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' }}>
                  {cart.map(c => (
                    <div key={c.id} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, background:'var(--card2)', borderRadius:20, padding:'5px 8px 5px 12px', fontSize:13, whiteSpace:'nowrap' }}>
                      <span style={{ fontWeight:600 }}>{c.name}</span>
                      <span style={{ color:'var(--text2)', fontSize:12 }}>×{c.qty}</span>
                      <button onClick={() => removeFromCart(c.id)} style={{ background:'rgba(255,82,82,0.2)', color:'var(--red)', borderRadius:'50%', width:18, height:18, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista articoli scorrevole */}
            <div style={{ overflowY:'auto', flex:1 }}>

              {/* Sezione suggerimenti — visibile solo senza ricerca attiva */}
              {!search && (loadingSuggestions || suggestions.length > 0) && (
                <div style={{ borderBottom:'1px solid var(--border)' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', padding:'12px 16px 6px' }}>
                    {t('eventDetail.suggestedForEvent')}
                  </p>
                  {loadingSuggestions
                    ? <p style={{ fontSize:13, color:'var(--text2)', padding:'8px 16px 14px' }}>{t('eventDetail.analyzingPastEvents')}</p>
                    : suggestions.map(item => (
                      <AddItemRow
                        key={`sug_${item.id}`}
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
              )}

              {/* Lista completa */}
              {!search && filteredForList.length > 0 && (
                <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', padding:'12px 16px 6px' }}>
                  {t('eventDetail.allItems')}
                </p>
              )}
              {filteredForList.length === 0 && search
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'30px 20px' }}>{t('eventDetail.noResultsFor', { search })}</p>
                : filteredForList.length === 0 && !search && suggestions.length === 0
                ? <p style={{ color:'var(--text2)', textAlign:'center', padding:'30px 20px' }}>{t('eventDetail.allItemsAlreadyInList')}</p>
                : filteredForList.map(item => (
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
                  ? t('eventDetail.selectItemsPrompt')
                  : t('eventDetail.confirmAddItems', { count: cart.length })
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aggiunta extra — sovrapposto al modal principale (z-index 300) */}
      {showExtraModal && (
        <div className={`modal-overlay${extraDrag.closing ? ' closing' : ''}`} onClick={extraDrag.onOverlayClick} style={{ zIndex: 300 }}>
          <div className={`modal${extraDrag.jiggling ? ' modal-jiggle' : ''}${extraDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...extraDrag.props}>
            <button className="close-btn" onClick={extraDrag.close}>✕</button>
            <h2>{t('eventDetail.extraItemTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('eventDetail.extraItemDesc')}</p>
            <div className="form-group">
              <label>{t('eventDetail.nameLabel')}</label>
              <input value={extraForm.name} onChange={e => setExtraForm({...extraForm, name:e.target.value})} placeholder={t('eventDetail.extraNamePlaceholder')} autoFocus />
            </div>
            <div className="form-group">
              <label>{t('eventDetail.quantityLabel')}</label>
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
              <label>{t('eventDetail.notesOptional')}</label>
              <input value={extraForm.notes} onChange={e => setExtraForm({...extraForm, notes:e.target.value})} placeholder={t('eventDetail.extraNotesPlaceholder')} />
            </div>
            <button onClick={addExtraItem} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!extraForm.name.trim()}>
              {t('eventDetail.confirmAddToList')}
            </button>
          </div>
        </div>
      )}

      {/* Modal scelta template — applica una lista a evento già esistente */}
      {showTemplatePicker && (
        <div className={`modal-overlay${templatePickerDrag.closing ? ' closing' : ''}`} onClick={templatePickerDrag.onOverlayClick}>
          <div className={`modal${templatePickerDrag.jiggling ? ' modal-jiggle' : ''}${templatePickerDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...templatePickerDrag.props}>
            <button className="close-btn" onClick={templatePickerDrag.close}>✕</button>
            <h2>{t('eventDetail.useTemplateTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('eventDetail.useTemplateDesc')}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'55dvh', overflowY:'auto' }}>
              {templates.map(tpl => {
                const count = (tpl.components || []).length
                return (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'14px 16px', borderRadius:12, background:'var(--card2)', border:'1px solid var(--border)', textAlign:'left' }}
                  >
                    <div style={{ minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:13 }}>{t('eventDetail.templateItemCount', { count })}</p>
                    </div>
                    <span style={{ flexShrink:0, color:'#7c6fcd', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:3 }}>{t('eventDetail.useTemplateAction')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal assegnazione worker */}
      {showAssignModal && (
        <div className={`modal-overlay${assignDrag.closing ? ' closing' : ''}`} onClick={assignDrag.onOverlayClick}>
          <div className={`modal${assignDrag.jiggling ? ' modal-jiggle' : ''}${assignDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...assignDrag.props}>
            <button className="close-btn" onClick={assignDrag.close}>✕</button>
            <h2>{t('eventDetail.assignWorkersTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('eventDetail.assignWorkersDesc')}</p>
            {workers.length === 0 ? (
              <p style={{ color:'var(--text2)', fontSize:13, fontStyle:'italic', textAlign:'center', padding:'20px 0' }}>{t('eventDetail.noWorkersRegistered')}</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'50dvh', overflowY:'auto' }}>
                {workers.map(w => {
                  const isAssigned = (event.assignedWorkers || []).includes(w.id)
                  const unavail = isWorkerUnavailable(w.id, event, unavailability)
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleWorkerAssignment(eventRef, event, w.id)}
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
                        {unavail && <span style={{ display:'block', fontSize:11, color:'var(--red)', fontWeight:700, marginTop:1 }}>{t('eventDetail.workerUnavailable')}</span>}
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
              {t('eventDetail.done')}
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet modifica oggetto */}
      {editItem && (
        <div className={`modal-overlay${itemEditDrag.closing ? ' closing' : ''}`} onClick={itemEditDrag.onOverlayClick}>
          <div className={`modal${itemEditDrag.jiggling ? ' modal-jiggle' : ''}${itemEditDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...itemEditDrag.props}>
            <button className="close-btn" onClick={itemEditDrag.close}>✕</button>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>{t('eventDetail.editItemTitle')}</p>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>{editItem.name}</h2>

            <div className="form-group">
              <label>{t('eventDetail.quantityLabel')}</label>
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
              <label>{t('eventDetail.eventNoteLabel')}</label>
              <input
                value={editItem.eventNote || ''}
                onChange={e => setEditItem(ei => ({ ...ei, eventNote: e.target.value }))}
                placeholder={t('eventDetail.eventNotePlaceholder')}
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
              <span style={{ fontSize:13, fontWeight:700, color: editItem.mancante ? '#ea580c' : 'var(--text2)' }}>{t('eventDetail.missingItem')}</span>
              <span style={{ width:36, height:20, borderRadius:10, background: editItem.mancante ? '#ea580c' : 'var(--border)', display:'flex', alignItems:'center', padding:'0 3px', transition:'background 0.2s', justifyContent: editItem.mancante ? 'flex-end' : 'flex-start' }}>
                <span style={{ width:14, height:14, borderRadius:'50%', background:'white', display:'block' }} />
              </span>
            </button>

            <button
              onClick={() => saveItemEdit(editItem)}
              className="btn btn-primary btn-full"
              style={{ marginTop:8 }}>
              {t('eventDetail.save')}
            </button>

            <button
              onClick={async () => { setEditItem(null); await removeFromEvent(editItem.id) }}
              style={{ width:'100%', marginTop:10, padding:'12px', borderRadius:10, background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', fontWeight:700, fontSize:14 }}>
              {t('eventDetail.removeFromList')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddItemRow({ item, onAdd, icon, inCart, cartQty, alreadyInList }) {
  const { t } = useTranslation()
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
          {alreadyInList && !inCart && <span style={{ background:'rgba(234,88,12,0.10)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>{t('eventDetail.alreadyInListWillBeMissing')}</span>}
          {alreadyInList && inCart && <span style={{ background:'rgba(234,88,12,0.10)', color:'#ea580c', border:'1px solid rgba(234,88,12,0.25)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800 }}>{t('eventDetail.alreadyInListSeparateRow')}</span>}
        </div>
        <p style={{ color:'var(--text2)', fontSize:12 }}>
          {[item.brand, item.model].filter(Boolean).join(' ')}
          {' '}
          {item.isBundle && item.components
            ? t('eventDetail.componentsCount', { count: item.components.length })
            : item.isKit && item.kitSize
            ? t('eventDetail.kitsAvailable', { count: item.availableQty ?? item.totalQty, pieces: (item.availableQty ?? item.totalQty) * item.kitSize })
            : t('eventDetail.availableShort', { count: item.availableQty ?? item.totalQty })}
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
function EventItemRow({ item, location, warehouseNotes, onToggleLoaded, onToggleReturned, onRemove, onEdit, onToggleMancante, onTogglePronto, vehicles, onSetVehicle, bulkMode, bulkSelected, onBulkToggle }) {
  const { t } = useTranslation()
  const vehicle = vehicles.find(v => v.id === item.vehicleId)
  // Elenco selezionabile: solo furgoni attivi, più quello attualmente
  // assegnato anche se disattivato (per non "perdere" la selezione corrente).
  const vehicleOptions = vehicle && vehicle.active === false
    ? [...vehicles.filter(v => v.active !== false), vehicle]
    : vehicles.filter(v => v.active !== false)

  return (
    <div style={{ borderBottom:'1px solid var(--border)', background: bulkSelected ? 'rgba(216,56,63,0.06)' : item.mancante ? 'rgba(234,88,12,0.04)' : 'transparent', borderLeft: bulkSelected ? '3px solid var(--accent)' : item.mancante ? '3px solid #ea580c' : '3px solid transparent' }}>
      <div
        style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
        onClick={() => bulkMode ? onBulkToggle(item.id) : onEdit({ id: item.id, name: item.name, qty: item.qty || 1, eventNote: item.eventNote || '', mancante: item.mancante || false })}
      >
        {bulkMode && (
          <div style={{
            width:22, height:22, borderRadius:6, flexShrink:0,
            border: `2px solid ${bulkSelected ? 'var(--accent)' : 'var(--border)'}`,
            background: bulkSelected ? 'var(--accent)' : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:14, fontWeight:900,
          }}>
            {bulkSelected ? '✓' : ''}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0, opacity: item.loaded ? 0.45 : 1, transition:'opacity 0.3s' }}>
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
            {item.pronto && !item.loaded && (
              <span style={{ background:'rgba(5,150,105,0.12)', color:'#059669', border:'1px solid rgba(5,150,105,0.3)', borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, flexShrink:0 }}>✓ PRONTO</span>
            )}
            {vehicle && (
              <span style={{ background:`${vehicle.color || 'var(--blue)'}22`, color: vehicle.color || 'var(--blue)', border:`1px solid ${vehicle.color || 'var(--blue)'}55`, borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, flexShrink:0 }}>{vehicle.emoji || '🚐'} {vehicle.name}</span>
            )}
          </div>
          <p style={{ color:'var(--text2)', fontSize:13 }}>{t('eventDetail.qty', { count: item.qty || 1 })}</p>
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
            <p style={{ color:'var(--text3)', fontSize:11, marginTop:4, fontStyle:'italic' }}>{t('eventDetail.positionNotSpecified')}</p>
          )}
        </div>
        </div>
        {!bulkMode && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }} onClick={e => e.stopPropagation()}>
          <select
            value={item.vehicleId || ''}
            onChange={e => onSetVehicle(item.id, e.target.value)}
            style={{ fontSize:11, fontWeight:700, borderRadius:8, padding:'4px 6px', border:'1.5px solid var(--border)', background:'var(--card2)', color: vehicle ? (vehicle.color || 'var(--text2)') : 'var(--text3)', maxWidth:120 }}
          >
            <option value="">{t('eventDetail.vehicleSelectPlaceholder')}</option>
            {vehicleOptions.map(v => (
              <option key={v.id} value={v.id}>{v.emoji ? v.emoji + ' ' : ''}{v.name}{v.active === false ? t('eventDetail.deactivatedSuffix') : ''}</option>
            ))}
          </select>
          {!item.loaded ? (
            <div style={{ display:'flex', gap:5, alignItems:'center' }}>
              <button
                onClick={() => onTogglePronto(item.id)}
                style={{
                  background: item.pronto ? 'rgba(5,150,105,0.15)' : 'var(--card2)',
                  color: item.pronto ? '#059669' : 'var(--text3)',
                  border: item.pronto ? '1.5px solid rgba(5,150,105,0.35)' : '1.5px solid transparent',
                  borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700,
                }}>
                {item.pronto ? t('eventDetail.readyDone') : t('eventDetail.ready')}
              </button>
              <button onClick={() => onToggleLoaded(item.id)}
                style={{
                  background: item.pronto ? 'rgba(245,166,35,0.20)' : 'var(--card2)',
                  color: item.pronto ? 'var(--accent2)' : 'var(--text)',
                  border: item.pronto ? '1.5px solid rgba(245,166,35,0.45)' : '1.5px solid var(--border)',
                  borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center',
                }}>
                {t('eventDetail.toLoad')}
              </button>
            </div>
          ) : (
            <button onClick={() => onToggleLoaded(item.id)}
              style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center' }}>
              {t('eventDetail.loadedButton')}
            </button>
          )}
          <button onClick={() => onToggleReturned(item.id)} disabled={!item.loaded}
            style={{ background: item.returned ? 'rgba(105,240,174,0.15)' : item.loaded ? 'var(--card2)' : 'transparent', color: item.returned ? 'var(--green)' : item.loaded ? 'var(--text2)' : 'var(--border)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, minWidth:90, textAlign:'center', opacity: item.loaded ? 1 : 0.4 }}>
            {item.returned ? t('eventDetail.returnedButton') : t('eventDetail.toReturn')}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
