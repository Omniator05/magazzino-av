import { useState, useEffect } from 'react'
import { useModalDrag } from '../hooks/useModalDrag'
import { useNavigate, useLocation } from 'react-router-dom'
import DeleteButton from '../components/DeleteButton'
import DateBadge from '../components/DateBadge'
import EditButton from '../components/EditButton'
import { useAuth } from '../context/AuthContext'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}
function generateDates(startDate, recurrence, endDate) {
  if (recurrence === 'never' || !endDate || endDate <= startDate) return []
  const dates = []
  let current = startDate
  let count = 0
  while (count < 500) {
    let next
    if      (recurrence === 'daily')   next = addDays(current, 1)
    else if (recurrence === 'weekly')  next = addDays(current, 7)
    else if (recurrence === 'monthly') next = addMonths(current, 1)
    else if (recurrence === 'yearly')  next = addYears(current, 1)
    else break
    if (next > endDate) break
    dates.push(next)
    current = next
    count++
  }
  return dates
}

const RECURRENCE_OPTIONS = [
  { value:'never',   label:'Mai' },
  { value:'daily',   label:'Ogni giorno' },
  { value:'weekly',  label:'Ogni settimana' },
  { value:'monthly', label:'Ogni mese' },
  { value:'yearly',  label:'Ogni anno' },
]

const EVENT_CAP = 5

const PHASE_CONFIG = [
  { key:'montaggio',  label:'Montaggio',  color:'#2563eb', bg:'#dbeafe' },
  { key:'smontaggio', label:'Smontaggio', color:'#ea580c', bg:'#ffedd5' },
]

/* ── Inline SVG icons (coerenti con Dashboard.jsx, no emoji) ──────────────── */
const IconAlertDot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
)
const IconRepeat = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
)
const IconWrench = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
)
const IconChevronSm = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconChevronSection = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition:'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconNote = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
  </svg>
)
const IconCheckSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconArchive = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
)
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconDoc = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const IconList = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)
const IconCalendarSm = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents]       = useState([])
  const [showModal, setShowModal] = useState(false)
  const eventDrag = useModalDrag(() => setShowModal(false))
  const templateDrag = useModalDrag(() => setShowTemplateMenu(false))
  const [showSearch, setShowSearch]     = useState(false)
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('events_sections')
      return saved ? JSON.parse(saved) : { recurring: true, unload: true, upcoming: true, installations: false }
    } catch { return { recurring: true, unload: true, upcoming: true } }
  })
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [templates, setTemplates] = useState([])
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [pendingTemplateItems, setPendingTemplateItems] = useState(null)
  const [form, setForm]           = useState({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{} })
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const anyModalOpen = showModal || showTemplateMenu
  useModalScrollLock(anyModalOpen)

  // Se arrivo dall'archivio con un template, apro subito il form
  useEffect(() => {
    if (navState?.templateItems) {
      setForm({ name: navState.templateName || '', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{} })
      setPendingTemplateItems(navState.templateItems)
      setShowModal(true)
      window.history.replaceState({}, '')
    } else if (navState?.openNewEvent) {
      openNew()
      window.history.replaceState({}, '')
    }
  }, [navState])

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'templates'), orderBy('name'))
    return onSnapshot(q, snap => setTemplates(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [])

  const today = new Date().toISOString().split('T')[0]

  // Separa ricorrenti (solo il prossimo per serie) da singoli
  const recurringSeriesMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringSeriesMap[ev.seriesId]) recurringSeriesMap[ev.seriesId] = []
      recurringSeriesMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringSeriesMap).map(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    // Preferisci il prossimo futuro, poi il più recente passato non ancora rientrato
    return sorted.find(e => e.date >= today)
      || sorted.filter(e => {
           const items = e.items || []
           return items.length > 0 && items.some(i => i.loaded && !i.returned)
         }).pop()
      || sorted[sorted.length - 1]
  })

  const singleEvents   = events.filter(e => !e.seriesId && e.type !== 'installation')
  const installations  = events.filter(e => e.type === 'installation' && !e.archived)

  // Un evento rimane "attivo" se:
  // 1. la data di FINE (o inizio, se monogiorno) è oggi o futura, OPPURE
  // 2. la data di fine è passata ma non tutti gli articoli sono rientrati
  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date

  const isActive = e => {
    if (effectiveEndDate(e) >= today) return true
    const items = e.items || []
    if (items.length === 0) return false          // nessun articolo → va in archivio
    return items.some(i => i.loaded && !i.returned) // qualcosa ancora fuori
  }

  const upcomingSingle = singleEvents.filter(e => effectiveEndDate(e) >= today)
  const daScaricareSingle = singleEvents.filter(e => {
    if (effectiveEndDate(e) >= today) return false
    const its = e.items || []
    return its.length > 0 && its.some(i => i.loaded && !i.returned)
  })

  // Cap con "carica altri"
  const [visibleCount, setVisibleCount] = useState(EVENT_CAP)
  const visibleSingle = upcomingSingle.slice(0, visibleCount)
  const hiddenCount   = upcomingSingle.length - visibleSingle.length

  const toggle = section => setOpenSections(s => {
    const next = { ...s, [section]: !s[section] }
    try { sessionStorage.setItem('events_sections', JSON.stringify(next)) } catch {}
    return next
  })

  // Ricerca su tutti gli eventi
  const searchResults = search.trim()
    ? events.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  const openNew = () => {
    setEditing(null)
    setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{} })
    setPendingTemplateItems(null)
    setShowModal(true)
  }

  const openEdit = (e, event) => {
    e.stopPropagation()
    setEditing(event)
    setForm({ name:event.name||'', date:event.date||'', dateEnd:event.dateEnd||'', location:event.location||'', notes:event.notes||'', recurrence:'never', endDate:'', type: event.type||'event', phases: event.phases||{} })
    setPendingTemplateItems(null)
    setShowModal(true)
  }

  const futureDates = form.recurrence !== 'never' && form.date && form.endDate
    ? generateDates(form.date, form.recurrence, form.endDate) : []

  const saveEvent = async () => {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      if (editing) {
        await updateDoc(doc(db, 'events', editing.id), {
          name: form.name.trim(), date: form.date,
          dateEnd: form.dateEnd || null,
          location: form.location.trim(), notes: form.notes.trim(),
          type: form.type || 'event',
          phases: form.phases || {},
        })
        setShowModal(false)
        setEditing(null)
        setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{} })
      } else {
        const seriesId = form.recurrence !== 'never' && futureDates.length > 0
          ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
        const base = {
          name: form.name.trim(), location: form.location.trim(),
          notes: form.notes.trim(), dateEnd: form.dateEnd || null,
          items: pendingTemplateItems || [],
          createdAt: serverTimestamp(), createdBy: user.uid,
          recurrence: form.recurrence, seriesId,
          type: form.type || 'event',
          phases: form.phases || {},
        }
        const ref = await addDoc(collection(db, 'events'), { ...base, date: form.date })
        for (const date of futureDates) {
          await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp() })
        }
        setShowModal(false)
        setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'', type:'event', phases:{} })
        setPendingTemplateItems(null)
        // Se creato da template, vai direttamente all'evento
        if (pendingTemplateItems) navigate(`/events/${ref.id}`)
      }
    } finally { setSaving(false) }
  }

  const deleteEvent = async (e, event) => {
    e.stopPropagation()
    if (event.seriesId) {
      if (confirm('Elimina SOLO questo evento della serie?'))
        await deleteDoc(doc(db, 'events', event.id))
    } else {
      if (confirm('Eliminare questo evento?'))
        await deleteDoc(doc(db, 'events', event.id))
    }
  }

  const EventCard = ({ event }) => {
    const items    = event.items || []
    const loaded   = items.filter(i => i.loaded).length
    const returned = items.filter(i => i.returned).length
    const total    = items.length
    const isToday  = event.date === today
    const evEnd        = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
    const isPast       = evEnd < today
    const daScaricare  = isPast && items.some(i => i.loaded && !i.returned)

    // Colori card: rosso=oggi, arancio=da scaricare, neutro=futuro
    const cardBg     = isToday      ? 'rgba(220,38,38,0.06)'   : daScaricare ? 'rgba(234,88,12,0.06)'   : 'var(--dash-card)'
    const cardBorder = isToday      ? 'rgba(220,38,38,0.35)'   : daScaricare ? 'rgba(234,88,12,0.35)'   : 'var(--dash-card-border)'
    const badgeBg    = isToday      ? 'rgba(220,38,38,0.12)'   : daScaricare ? 'rgba(234,88,12,0.12)'   : ''
    const badgeBorder= isToday      ? 'rgba(220,38,38,0.25)'   : daScaricare ? 'rgba(234,88,12,0.3)'    : ''
    const badgeColor = isToday      ? '#dc2626'                 : daScaricare ? '#ea580c'               : ''
    const badgeLabel = isToday      ? 'OGGI'                    : daScaricare ? 'DA SCARICARE'           : ''

    let statusColor = 'var(--dash-muted)', statusText = 'Lista vuota'
    if (total > 0) {
      if (returned === total)    { statusColor = '#15803d'; statusText = 'Tutto rientrato' }
      else if (loaded === total) { statusColor = '#b45309'; statusText = `In evento · ${returned}/${total} rientrati` }
      else if (loaded > 0)       { statusColor = '#b45309'; statusText = `Carico · ${loaded}/${total}` }
      else                       { statusColor = 'var(--dash-muted)'; statusText = `${total} in lista` }
    }

    return (
      <div onClick={() => navigate(`/events/${event.id}`)}
        style={{ cursor:'pointer', background:cardBg, border:`1.5px solid ${cardBorder}`, borderRadius:18, margin:'0 16px 10px', overflow:'hidden', boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
        {(isToday || daScaricare) && (
          <div style={{ background:badgeBg, padding:'5px 16px', borderBottom:`1px solid ${badgeBorder}`, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color:badgeColor }}><IconAlertDot /></span>
            <p style={{ color:badgeColor, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em' }}>{badgeLabel}</p>
          </div>
        )}
        <div style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:2 }}>
              <h3 style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:15, fontWeight:700, color:'var(--dash-title)' }}>{event.name}</h3>
              {event.seriesId && (
                <span style={{ background:'#dbeafe', color:'#1d6fce', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:800, flexShrink:0, display:'flex', alignItems:'center', gap:3 }}>
                  <IconRepeat />
                </span>
              )}
            </div>
            <DateBadge dateStr={event.date} dateEndStr={event.dateEnd} location={event.location} today={today} />
            {event.phases && PHASE_CONFIG.some(p => event.phases[p.key]) && (
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:5 }}>
                {PHASE_CONFIG.filter(p => event.phases[p.key]).map(p => (
                  <span key={p.key} style={{ background:p.bg, color:p.color, borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:800, letterSpacing:'0.02em' }}>
                    {p.label} · {new Date(event.phases[p.key]+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'})}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            <EditButton onClick={e => openEdit(e, event)} size={34} />
            <DeleteButton onClick={e => deleteEvent(e, event)} size={34} />
          </div>
        </div>
        <div style={{ padding:'0 16px 14px' }}>
          {total > 0 && (
            <div style={{ background:'#f3f4f6', borderRadius:4, height:4, marginBottom:8, overflow:'hidden' }}>
              <div style={{ background: returned === total ? '#22c55e' : isToday ? '#dc2626' : daScaricare ? '#ea580c' : '#f59e0b', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.3s' }} />
            </div>
          )}
          <p style={{ color:statusColor, fontSize:13, fontWeight:600 }}>{statusText}</p>
        </div>
        {event.notes && (
          <div style={{ padding:'0 16px 14px', display:'flex', alignItems:'flex-start', gap:6 }}>
            <span style={{ color:'var(--dash-muted)', flexShrink:0, marginTop:2 }}><IconNote /></span>
            <p style={{ color:'var(--dash-muted)', fontSize:12, fontStyle:'italic' }}>{event.notes}</p>
          </div>
        )}
      </div>
    )
  }

  const createFromTemplate = (template) => {
    setShowTemplateMenu(false)
    // Pre-compila il form con il template — l'utente sceglie nome/data/location
    setEditing(null)
    setForm({ name: template.name, date:'', dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
    // Salva gli articoli del template per usarli al salvataggio
    setPendingTemplateItems((template.components||[]).map(c => ({
      id:c.id, name:c.name, category:c.category, qty:c.qty,
      loaded:false, returned:false,
    })))
    setShowModal(true)
  }

  const closeInstallation = async (installation) => {
    if (!confirm(`Chiudere l'installazione "${installation.name}" e ripristinare la giacenza di tutti gli articoli?`)) return
    const items = installation.items || []
    for (const item of items) {
      if (item.loaded && !item.returned && !item.isExtra) {
        try {
          const itemRef = doc(db, 'items', item.id)
          const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(itemRef))
          if (snap.exists()) {
            const current = snap.data()
            const maxAvail = (current.totalQty||0) - (current.brokenQty||0)
            await updateDoc(itemRef, { availableQty: Math.min(maxAvail, (current.availableQty||0) + (item.qty||1)) })
          }
        } catch(e) { console.error(e) }
      }
    }
    await updateDoc(doc(db, 'events', installation.id), { archived: true })
  }

  const InstallationCard = ({ event: inst }) => {
    const items     = inst.items || []
    const loaded    = items.filter(i => i.loaded).length
    const total     = items.length
    const isExpired = inst.endDate && inst.endDate < today

    return (
      <div
        onClick={() => navigate(`/events/${inst.id}`)}
        style={{ margin:'0 16px 10px', borderRadius:18, overflow:'hidden', cursor:'pointer', boxShadow:'0 1px 6px rgba(0,0,0,0.05)',
          background: isExpired ? 'rgba(220,38,38,0.06)' : 'var(--dash-card)',
          border: `1.5px solid ${isExpired ? 'rgba(220,38,38,0.35)' : '#ddd6fe'}`,
        }}
      >
        {isExpired && (
          <div style={{ background:'rgba(220,38,38,0.12)', padding:'5px 16px', borderBottom:'1px solid rgba(220,38,38,0.2)', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color:'#dc2626' }}><IconAlertDot /></span>
            <p style={{ color:'#dc2626', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em' }}>Scaduta — segna come chiusa</p>
          </div>
        )}
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ color:'#5b4fcf', flexShrink:0 }}><IconWrench /></span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
              <h3 style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:15, fontWeight:700, color:'var(--dash-title)' }}>{inst.name}</h3>
              <span style={{ background:'#ede9fe', color:'#5b4fcf', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:800, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em' }}>Install.</span>
            </div>
            <DateBadge dateStr={inst.date} dateEndStr={inst.endDate} location={inst.location} today={today} />
            <p style={{ color: loaded > 0 ? '#5b4fcf' : 'var(--dash-muted)', fontSize:12, fontWeight:600, marginTop:4 }}>
              {total === 0 ? 'Lista vuota' : loaded === 0 ? `${total} in lista` : `${loaded}/${total} installati`}
            </p>
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
            <EditButton onClick={e => openEdit(e, inst)} size={34} />
            <DeleteButton onClick={e => deleteEvent(e, inst)} size={34} />
          </div>
        </div>
        <div style={{ padding:'0 16px 14px' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => closeInstallation(inst)}
            style={{ width:'100%', padding:'11px', borderRadius:12,
              background: isExpired ? 'rgba(220,38,38,0.10)' : '#ede9fe',
              border: 'none',
              color: isExpired ? '#dc2626' : '#5b4fcf',
              fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:8
            }}
          >
            <IconCheckSm /> Chiudi installazione e ripristina giacenza
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:140 }}>
      <div style={{ padding:'56px 22px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontSize:13, fontWeight:600, color:'var(--dash-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:4 }}>Gestione</p>
          <h1 style={{ fontSize:32, fontWeight:800, color:'var(--dash-title)', letterSpacing:'-0.5px', lineHeight:1.1, marginBottom:3 }}>Eventi</h1>
          <p style={{ fontSize:12, color:'var(--dash-muted)', fontWeight:500 }}>{upcomingSingle.length + pinnedRecurring.length} prossimi</p>
        </div>
        <div style={{ display:'flex', gap:8, paddingTop:4 }}>
          <button onClick={() => navigate('/archive')} style={{
            background:'var(--dash-pill-bg)', border:'1px solid var(--dash-pill-border)', color:'var(--dash-muted)',
            borderRadius:50, padding:'8px 14px', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
          }}>
            <IconArchive /> Archivio
          </button>
          <button onClick={() => setShowTemplateMenu(true)} style={{
            background:'#111827', color:'white', border:'none',
            borderRadius:50, padding:'8px 16px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6,
          }}>
            <IconPlus /> Evento
          </button>
        </div>
      </div>

      {/* Search bar SEMPRE visibile */}
      <div style={{ padding:'0 16px 12px' }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <svg style={{ position:'absolute', left:14 }} viewBox="0 0 24 24" fill="var(--dash-muted)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca evento per nome o location..."
            style={{ width:'100%', padding:'12px 14px 12px 40px', borderRadius:14, border:'1.5px solid var(--dash-card-border)', background:'var(--dash-card)', color:'var(--dash-title)', fontSize:14 }} />
        </div>
      </div>

      <div style={{ padding:'12px 0 0' }}>

        {/* Risultati ricerca */}
        {search.trim() ? (
          <>
            <p style={{ padding:'0 16px 12px', color:'var(--dash-muted)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>Risultati ({searchResults.length})</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--dash-muted)', textAlign:'center' }}>Nessun evento trovato per "{search}"</p>
              : searchResults.map(ev => <EventCard key={ev.id} event={ev} />)
            }
          </>
        ) : (
          <>
            {/* DA SCARICARE — collassabile */}
            {daScaricareSingle.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('unload')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#ea580c', display:'flex' }}><IconChevronSection open={openSections.unload} /></span>
                  <span className="section-label" style={{ color:'#ea580c', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>Da scaricare</span>
                  <span style={{ background:'#fed7aa', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#9a3412' }}>{daScaricareSingle.length}</span>
                </button>
                {openSections.unload && daScaricareSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
              </div>
            )}

            {/* RICORRENTI — collassabile */}
            {pinnedRecurring.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('recurring')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#1d6fce', display:'flex' }}><IconChevronSection open={openSections.recurring} /></span>
                  <span className="section-label" style={{ color:'#1d6fce', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>Ricorrenti</span>
                  <span style={{ background:'#dbeafe', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#1e3a5f' }}>{pinnedRecurring.length}</span>
                </button>
                {openSections.recurring && pinnedRecurring.map(ev => <EventCard key={ev.id} event={ev} />)}
              </div>
            )}

            {/* PROSSIMI — collassabile con load more */}
            {upcomingSingle.length > 0 && (
              <div>
                <button onClick={() => toggle('upcoming')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--dash-muted)', display:'flex' }}><IconChevronSection open={openSections.upcoming} /></span>
                  <span className="section-label" style={{ color:'var(--dash-muted)', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>Prossimi</span>
                  <span style={{ background:'var(--dash-pill-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--dash-muted)' }}>{upcomingSingle.length}</span>
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'12px', borderRadius:14, background:'var(--dash-pill-bg)', border:'1.5px solid var(--dash-pill-border)', color:'var(--dash-muted)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <IconPlus /> {hiddenCount} altri eventi
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* INSTALLAZIONI ATTIVE */}
            {installations.length > 0 && (
              <div style={{ marginTop:8 }}>
                <button onClick={() => toggle('installations')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#5b4fcf', display:'flex' }}><IconChevronSection open={openSections.installations} /></span>
                  <span className="section-label" style={{ color:'#5b4fcf', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>Installazioni</span>
                  <span style={{ background:'#ede9fe', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#5b4fcf' }}>{installations.length}</span>
                </button>
                {openSections.installations && installations.map(inst => <InstallationCard key={inst.id} event={inst} />)}
              </div>
            )}

            {events.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 24px' }}>
                <span style={{ color:'var(--dash-muted)' }}><svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg></span>
                <h3 style={{ fontSize:17, fontWeight:700, color:'var(--dash-title)', marginTop:14 }}>Nessun evento</h3>
                <p style={{ color:'var(--dash-muted)', fontSize:13, marginTop:4 }}>Crea il primo evento per gestire i carichi</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal scelta: template o vuoto */}
      {showTemplateMenu && (
        <div className="modal-overlay" onClick={templateDrag.onOverlayClick}>
          <div className={`modal${templateDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative' }} {...templateDrag}>
            <button className="close-btn" onClick={() => setShowTemplateMenu(false)}>✕</button>
            <h2>Nuovo evento</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16 }}>Vuoi partire da un template o creare un evento vuoto?</p>

            {/* Evento vuoto */}
            <button onClick={() => { setShowTemplateMenu(false); openNew() }}
              style={{ width:'100%', padding:'14px 16px', borderRadius:12, background:'var(--card2)', border:'2px solid var(--border)', color:'var(--text)', fontWeight:600, fontSize:15, textAlign:'left', marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ color:'#6b7280', flexShrink:0 }}><IconDoc /></span>
              <div>
                <p style={{ fontWeight:700 }}>Evento vuoto</p>
                <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>Compila la lista di carico manualmente</p>
              </div>
            </button>

            {/* Template */}
            {templates.length === 0 ? (
              <div style={{ padding:'16px', background:'var(--card2)', borderRadius:10, textAlign:'center' }}>
                <p style={{ color:'var(--text2)', fontSize:13 }}>Nessun template — creane uno dalla tab Template</p>
              </div>
            ) : (
              <>
                <p style={{ color:'var(--text2)', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Usa template</p>
                {templates.map(t => (
                  <button key={t.id} onClick={() => createFromTemplate(t)}
                    style={{ width:'100%', padding:'12px 16px', borderRadius:12, background:'rgba(79,195,247,0.07)', border:'1px solid rgba(79,195,247,0.25)', color:'var(--text)', fontWeight:600, fontSize:14, textAlign:'left', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:'var(--blue)', flexShrink:0 }}><IconList /></span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700 }}>{t.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>
                        {(t.components||[]).length} articoli
                        {t.notes ? ` · ${t.notes}` : ''}
                      </p>
                    </div>
                    <span style={{ color:'var(--blue)' }}><IconChevronSm /></span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={eventDrag.onOverlayClick}>
          <div className={`modal${eventDrag.jiggling ? ' modal-jiggle' : ''}`} style={{ position:'relative' }} {...eventDrag}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{editing ? 'Modifica evento' : pendingTemplateItems ? 'Nuovo evento da template' : 'Nuovo evento'}</h2>

            {/* Toggle tipo: Evento / Installazione */}
            {!editing && !pendingTemplateItems && (
              <div style={{ display:'flex', gap:8, marginBottom:16, background:'var(--card2)', borderRadius:12, padding:4 }}>
                <button
                  onClick={() => setForm(f => ({...f, type:'event'}))}
                  style={{ flex:1, padding:'9px', borderRadius:9, fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: form.type !== 'installation' ? 'var(--card)' : 'transparent',
                    color: form.type !== 'installation' ? 'var(--text)' : 'var(--text2)',
                    boxShadow: form.type !== 'installation' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    border: 'none', transition:'all 0.15s'
                  }}><IconCalendarSm /> Evento</button>
                <button
                  onClick={() => setForm(f => ({...f, type:'installation', recurrence:'never', endDate:''}))}
                  style={{ flex:1, padding:'9px', borderRadius:9, fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: form.type === 'installation' ? '#ede9fe' : 'transparent',
                    color: form.type === 'installation' ? '#5b4fcf' : 'var(--text2)',
                    boxShadow: form.type === 'installation' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    border: form.type === 'installation' ? '1px solid #ddd6fe' : '1px solid transparent',
                    transition:'all 0.15s'
                  }}><IconWrench /> Installazione</button>
              </div>
            )}
            {pendingTemplateItems && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'var(--blue)' }}><IconCheckSm /></span>
                <p style={{ color:'var(--blue)', fontSize:13, fontWeight:600 }}>
                  Lista carico pronta ({pendingTemplateItems.length} articoli) — compila i dettagli evento
                </p>
              </div>
            )}
            <div className="form-group">
              <label>Nome evento *</label>
              <input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Matrimonio Rossi" />
            </div>
            <div className="form-group">
              <label>Data inizio *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} />
            </div>
            <div className="form-group">
              <label>Data fine {form.type === 'installation' ? <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale — fine contratto prevista)</span> : <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale — evento multi-giorno)</span>}</label>
              <input type="date" value={form.dateEnd} min={form.date} onChange={e => setForm({...form, dateEnd:e.target.value})} />
            </div>
            {form.type !== 'installation' && (
              <div className="form-group">
                <label style={{ marginBottom:8, display:'block' }}>Fasi evento <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
                {PHASE_CONFIG.map(p => (
                  <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                    <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                    <input type="date" value={form.phases?.[p.key]||''}
                      onChange={e => setForm(f => ({...f, phases:{...(f.phases||{}), [p.key]:e.target.value}}))}
                      style={{ flex:1, fontSize:13, padding:'8px 10px' }} />
                    {form.phases?.[p.key] && (
                      <button type="button" onClick={() => setForm(f => { const ph={...(f.phases||{})}; delete ph[p.key]; return {...f,phases:ph} })}
                        style={{ background:'transparent', color:'var(--text3)', fontSize:16, padding:'0 4px', flexShrink:0 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label>Location</label>
              <input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="es. Villa Belvedere, Verona" />
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Dettagli evento..." rows={2} />
            </div>
            {!editing && form.type !== 'installation' && (
              <>
                <div className="form-group">
                  <label style={{ display:'flex', alignItems:'center', gap:6 }}><IconRepeat /> Ripeti</label>
                  <select value={form.recurrence} onChange={e => setForm({...form, recurrence:e.target.value, endDate:''})}>
                    {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {form.recurrence !== 'never' && (
                  <div className="form-group">
                    <label>Fine ripetizione</label>
                    <input type="date" value={form.endDate} min={form.date || today}
                      onChange={e => setForm({...form, endDate:e.target.value})} />
                  </div>
                )}
                {futureDates.length > 0 && (
                  <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                    <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><IconRepeat /> {futureDates.length + 1} eventi totali</p>
                    <p style={{ color:'var(--text2)', fontSize:12, marginTop:3 }}>
                      Dal {new Date(form.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})} al {new Date(futureDates.at(-1)+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}
                    </p>
                  </div>
                )}
              </>
            )}
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? 'Salvataggio...'
                : editing ? 'Salva modifiche'
                : pendingTemplateItems ? 'Crea evento e vai alla lista carico'
                : futureDates.length > 0 ? `Crea ${futureDates.length + 1} eventi`
                : 'Crea evento'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* ── Events: stessi token light/dark della Dashboard ── */
        :root {
          --surface:           #f5f5f3;
          --dash-title:        #111827;
          --dash-muted:        #6b7280;
          --dash-card:         #ffffff;
          --dash-card-border:  #e5e7eb;
          --dash-pill-bg:      #f3f4f6;
          --dash-pill-border:  #e5e7eb;
        }
        [data-theme="dark"] {
          --surface:           var(--bg);
          --dash-title:        var(--text);
          --dash-muted:        var(--text2);
          --dash-card:         var(--card);
          --dash-card-border:  var(--border2);
          --dash-pill-bg:      var(--card2);
          --dash-pill-border:  var(--border2);
        }
        /* Hover sezioni: si ingrandisce solo il testo label, non la barra intera */
        .section-label { display:inline-block; transition: transform 0.15s ease; transform-origin: left center; }
        .btn-section:hover .section-label { transform: scale(1.06); }
      `}</style>
    </div>
  )
}
