import { useState, useEffect } from 'react'
import { useModalDrag } from '../hooks/useModalDrag'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../utils/formatDate'
import DeleteButton from '../components/DeleteButton'
import DateBadge from '../components/DateBadge'
import EditButton from '../components/EditButton'
import { Pin, Dot } from '../components/Icon'
import { EventListSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import DateField from '../components/DateField'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import FabButton from '../components/FabButton'
import { syncEventToGoogle, deleteGoogleEvent, listUpcomingGoogleEvents, fromGoogleEvent, connectGoogleCalendar } from '../utils/googleCalendar'
import { db } from '../firebase'
import { collection, addDoc, deleteDoc, updateDoc, doc, getDoc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'
import { deleteEventWithInventoryCheck } from '../utils/kitInventory'
import CreateEventFlow from '../components/CreateEventFlow'

const EVENT_CAP = 5

/* ── Inline SVG icons (coerenti con Dashboard.jsx, no emoji) ──────────────── */
const IconAlertDot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
)
const IconWrench = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
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
const IconSync = ({ spinning }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    style={spinning ? { animation:'spin 0.9s linear infinite' } : undefined}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
)
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

// Definiti a livello di modulo (non dentro Events()) così React li riconosce
// come lo stesso tipo di componente tra un render e l'altro invece di
// smontare/rimontare ogni card a ogni tasto premuto nella ricerca.
function EventCard({ event, today, t, i18n, navigate, phaseConfig, onEdit, onDelete, loadListsOn }) {
  const items    = event.items || []
  // Se il modulo liste di carico è disattivato, la riga di stato sotto il
  // titolo non va mostrata: azzerare qui invece che nel JSX fa sì che anche
  // i colori/bordo derivati (iconGradient, cardBorder) tornino da soli ai
  // rami "non caricato" senza doverli duplicare.
  const loaded   = loadListsOn ? items.filter(i => i.loaded).length : 0
  const returned = loadListsOn ? items.filter(i => i.returned).length : 0
  const total    = loadListsOn ? items.length : 0
  const isToday  = event.date === today
  const evEnd    = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const isPast   = evEnd < today
  const daScaricare = loadListsOn && isPast && items.some(i => i.loaded && !i.returned)

  let statusColor = 'var(--dash-muted)', statusText = t('events.statusEmptyList')
  if (total > 0) {
    if (returned === total)    { statusColor = '#15803d'; statusText = t('events.statusAllReturned') }
    else if (loaded === total) { statusColor = '#b45309'; statusText = t('events.statusInEventReturned', { returned, total }) }
    else if (loaded > 0)       { statusColor = '#b45309'; statusText = t('events.statusLoading', { loaded, total }) }
    else                       { statusColor = 'var(--dash-muted)'; statusText = t('events.statusInList', { count: total }) }
  }

  const iconGradient = daScaricare
    ? '#fb8500'
    : event.type === 'installation'
    ? '#a7c957'
    : (isToday || loaded > 0)
    ? 'var(--accent)'
    : '#a8dadc'

  const cardBorder = isToday ? 'rgba(220,38,38,0.4)' : daScaricare ? 'rgba(234,88,12,0.4)' : 'var(--dash-card-border)'

  return (
    <div onClick={() => navigate(`/events/${event.id}`)}
      className="event-card"
      style={{ cursor:'pointer', margin:'0 16px 10px', background:'var(--dash-card)', border:`1.5px solid ${cardBorder}`, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 12px 10px 10px', gap:12, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}
    >
      {/* Icona gradiente con data */}
      <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
        <div style={{ width:52, height:52, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
          <span style={{ fontSize:20, fontWeight:800 }}>{event.date ? new Date(event.date+'T12:00:00').getDate() : '?'}</span>
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
            {event.date ? formatDate(event.date+'T12:00:00', {month:'short'}, i18n.language) : ''}
          </span>
        </div>
        {event.seriesId && (
          <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--dash-card)' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </span>
        )}
      </div>

      {/* Contenuto centrale — anche bottone reale per l'apertura da tastiera
          (il div esterno resta cliccabile per mouse/touch su tutta la riga;
          questo bottone copre solo la parte centrale, non le azioni, così
          non si annidano bottoni dentro bottoni). */}
      <button type="button"
        onClick={e => { e.stopPropagation(); navigate(`/events/${event.id}`) }}
        aria-label={t('events.openEventAria', { name: event.name })}
        style={{ flex:1, minWidth:0, background:'transparent', border:'none', padding:0, margin:0, textAlign:'left', cursor:'pointer', font:'inherit', color:'inherit' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, minWidth:0 }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--dash-title)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{event.name}</h3>
        </div>
        {loadListsOn && (
          <p style={{ fontSize:12, fontWeight:600, color: daScaricare ? '#ea580c' : isToday ? '#dc2626' : statusColor, display:'flex', alignItems:'center', gap:5 }}>
            {(daScaricare || isToday) && <Dot size={7} color={daScaricare ? '#ea580c' : '#dc2626'} />}
            {daScaricare ? t('events.daScaricareCount', { count: total-returned }) : isToday ? t('events.todayStatus', { status: statusText.toLowerCase() }) : statusText}
          </p>
        )}
        {(event.location || (event.phases && phaseConfig.some(p => event.phases[p.key]))) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
            {event.location && <span style={{ fontSize:11, color:'var(--dash-muted)', display:'inline-flex', alignItems:'center', gap:4 }}><Pin size={12} /> {event.location}</span>}
            {event.phases && phaseConfig.filter(p => event.phases[p.key]).map(p => (
              <span key={p.key} style={{ background:p.bg, color:p.color, borderRadius:5, padding:'1px 6px', fontSize:10, fontWeight:700 }}>
                {p.label} {formatDate(event.phases[p.key]+'T12:00:00', {day:'numeric',month:'short'}, i18n.language)}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Azioni */}
      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
        <EditButton onClick={e => onEdit(e, event)} size={44} ariaLabel={t('events.editEventAria')} />
        <DeleteButton onClick={e => onDelete(e, event)} size={44} ariaLabel={t('events.deleteEventAria')} />
      </div>
    </div>
  )
}

function InstallationCard({ event: inst, today, t, navigate, onEdit, onDelete, onClose, loadListsOn }) {
  const items     = inst.items || []
  const loaded    = items.filter(i => i.loaded).length
  const total     = items.length
  const isExpired = inst.endDate && inst.endDate < today

  return (
    <div
      onClick={() => navigate(`/events/${inst.id}`)}
      className="event-card"
      style={{ margin:'0 16px 10px', borderRadius:18, overflow:'hidden', cursor:'pointer', boxShadow:'0 1px 6px rgba(0,0,0,0.05)',
        background: isExpired ? 'rgba(220,38,38,0.06)' : 'var(--dash-card)',
        border: `1.5px solid ${isExpired ? 'rgba(220,38,38,0.35)' : '#ddd6fe'}`,
      }}
    >
      {isExpired && (
        <div style={{ background:'rgba(220,38,38,0.12)', padding:'5px 16px', borderBottom:'1px solid rgba(220,38,38,0.2)', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'#dc2626' }}><IconAlertDot /></span>
          <p style={{ color:'#dc2626', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em' }}>{t('events.expiredBadge')}</p>
        </div>
      )}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ color:'#5b4fcf', flexShrink:0 }}><IconWrench /></span>
        <button type="button"
          onClick={e => { e.stopPropagation(); navigate(`/events/${inst.id}`) }}
          aria-label={t('events.openEventAria', { name: inst.name })}
          style={{ flex:1, minWidth:0, background:'transparent', border:'none', padding:0, margin:0, textAlign:'left', cursor:'pointer', font:'inherit', color:'inherit' }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
            <h3 style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:15, fontWeight:700, color:'var(--dash-title)' }}>{inst.name}</h3>
            <span style={{ background:'#ede9fe', color:'#5b4fcf', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:800, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em' }}>{t('events.installLabel')}</span>
          </div>
          <DateBadge dateStr={inst.date} dateEndStr={inst.endDate} location={inst.location} today={today} />
          {loadListsOn && (
            <p style={{ color: loaded > 0 ? '#5b4fcf' : 'var(--dash-muted)', fontSize:12, fontWeight:600, marginTop:4 }}>
              {total === 0 ? t('events.emptyListShort') : loaded === 0 ? t('events.inListShort', { count: total }) : t('events.installedOfTotal', { loaded, total })}
            </p>
          )}
        </button>
        <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
          <EditButton onClick={e => onEdit(e, inst)} size={44} ariaLabel={t('events.editInstallationAria')} />
          <DeleteButton onClick={e => onDelete(e, inst)} size={44} ariaLabel={t('events.deleteInstallationAria')} />
        </div>
      </div>
      <div style={{ padding:'0 16px 14px' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onClose(inst)}
          style={{ width:'100%', padding:'11px', borderRadius:12,
            background: isExpired ? 'rgba(220,38,38,0.10)' : '#ede9fe',
            border: 'none',
            color: isExpired ? '#dc2626' : '#5b4fcf',
            fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:8
          }}
        >
          <IconCheckSm /> {t('events.closeInstallationBtn')}
        </button>
      </div>
    </div>
  )
}

export default function Events() {
  const { t, i18n } = useTranslation()
  const { user, team, teamId } = useAuth()
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const confirm = useConfirm()
  const PHASE_CONFIG = [
    { key:'montaggio',  label:t('calendar.legendAssembly'),    color:'#2563eb', bg:'#dbeafe' },
    { key:'smontaggio', label:t('calendar.legendDisassembly'), color:'#ea580c', bg:'#ffedd5' },
  ]
  const [events, setEvents]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [gSyncing, setGSyncing]   = useState(false)
  const [toast, setToast]         = useState('')
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const [showModal, setShowModal] = useState(false)
  const eventDrag = useModalDrag(() => setShowModal(false))
  const [showSearch, setShowSearch]     = useState(false)
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('events_sections')
      return saved ? JSON.parse(saved) : { recurring: true, unload: true, upcoming: true, installations: false }
    } catch { return { recurring: true, unload: true, upcoming: true } }
  })
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', type:'event', phases:{} })
  // Flusso unico di creazione evento (Calendar.jsx monta lo stesso componente):
  // vedi src/components/CreateEventFlow.jsx.
  const [createFlowOpen, setCreateFlowOpen] = useState(false)
  const [createFlowSkip, setCreateFlowSkip] = useState(null)
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const anyModalOpen = showModal || createFlowOpen
  useModalScrollLock(anyModalOpen)

  // Se arrivo dall'archivio con un template, o dalla home con "crea evento",
  // apro subito il flusso di creazione saltando la schermata di scelta.
  useEffect(() => {
    if (navState?.templateItems) {
      setCreateFlowSkip({ name: navState.templateName || '', items: navState.templateItems })
      setCreateFlowOpen(true)
      window.history.replaceState({}, '')
    } else if (navState?.openNewEvent) {
      setCreateFlowSkip('blank')
      setCreateFlowOpen(true)
      window.history.replaceState({}, '')
    }
  }, [navState])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
  }, [teamId])

  // ── Import da Google Calendar (i collaboratori scrivono lì, non in app) ──
  // Confronta gli eventi Google con quelli già collegati (googleEventId) fra
  // quelli già caricati: crea i nuovi, aggiorna quelli cambiati. Non cancella
  // mai nulla in automatico — un evento sparito da Google resta in app finché
  // qualcuno non lo elimina a mano (troppo rischioso farlo alla cieca su
  // eventi che magari hanno già oggetti caricati).
  const importFromGoogle = async (googleEvents) => {
    const byGoogleId = new Map(events.filter(ev => ev.googleEventId).map(ev => [ev.googleEventId, ev]))
    let created = 0, updated = 0
    for (const gEv of googleEvents) {
      const mapped = fromGoogleEvent(gEv)
      if (!mapped) continue
      const existing = byGoogleId.get(gEv.id)
      if (existing) {
        const changed = existing.name !== mapped.name || existing.date !== mapped.date
          || (existing.dateEnd || null) !== mapped.dateEnd
          || (existing.location || '') !== mapped.location || (existing.notes || '') !== mapped.notes
        if (changed) { await updateDoc(doc(db, 'events', existing.id), mapped); updated++ }
      } else {
        await addDoc(collection(db, 'events'), {
          ...mapped, googleEventId: gEv.id, items: [], teamId,
          createdAt: serverTimestamp(), createdBy: user.uid,
          recurrence: 'never', seriesId: null, type: 'event', phases: {},
        })
        created++
      }
    }
    return { created, updated }
  }

  const syncFromGoogle = async (interactive) => {
    if (!team?.googleCalendarId || gSyncing) return
    setGSyncing(true)
    try {
      if (interactive) await connectGoogleCalendar()
      const googleEvents = await listUpcomingGoogleEvents(team.googleCalendarId)
      if (googleEvents === null) {
        if (interactive) showToast(t('events.googleSyncUnavailable'))
        return
      }
      const { created, updated } = await importFromGoogle(googleEvents)
      if (interactive) showToast(t('events.googleSyncDone', { created, updated }))
    } catch {
      if (interactive) showToast(t('events.googleSyncUnavailable'))
    } finally { setGSyncing(false) }
  }

  // Tentativo automatico e silenzioso: all'apertura pagina (appena gli eventi
  // già esistenti sono stati caricati, altrimenti rischierebbe di ricreare
  // come "nuovi" eventi già collegati ma non ancora arrivati da Firestore) e
  // ogni volta che si torna su questa scheda/app — es. dopo essere passati su
  // Google Calendar ad aggiungere una data e poi tornati indietro.
  useEffect(() => {
    if (!team?.googleCalendarId) return
    if (!loading) syncFromGoogle(false)
    const onVisible = () => { if (document.visibilityState === 'visible') syncFromGoogle(false) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loading, team?.googleCalendarId])

  const today = new Date().toISOString().split('T')[0]

  // Separa ricorrenti (solo il prossimo per serie) da singoli
  const recurringSeriesMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringSeriesMap[ev.seriesId]) recurringSeriesMap[ev.seriesId] = []
      recurringSeriesMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringSeriesMap).flatMap(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    const nextFuture = sorted.find(e => e.date >= today)
    // Tutte le occorrenze passate con articoli ancora non rientrati — mai nascoste
    // solo perché esiste già una prossima occorrenza futura da mostrare
    const pastUnfinished = sorted.filter(e => {
      if (e.date >= today) return false
      const items = e.items || []
      return items.length > 0 && items.some(i => i.loaded && !i.returned)
    })
    const result = [...pastUnfinished]
    if (nextFuture) result.push(nextFuture)
    else if (result.length === 0) result.push(sorted[sorted.length - 1])
    return result
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

  const openEdit = (e, event) => {
    e.stopPropagation()
    setEditing(event)
    setForm({ name:event.name||'', date:event.date||'', dateEnd:event.dateEnd||'', location:event.location||'', notes:event.notes||'', type: event.type||'event', phases: event.phases||{} })
    setShowModal(true)
  }

  // Solo modifica: la creazione (vuota, da template, ricorrente) passa tutta
  // da CreateEventFlow, montato più sotto — vedi src/components/CreateEventFlow.jsx.
  const saveEvent = async () => {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      const updated = {
        name: form.name.trim(), date: form.date,
        dateEnd: form.dateEnd || null,
        location: form.location.trim(), notes: form.notes.trim(),
        type: form.type || 'event',
        phases: form.phases || {},
      }
      await updateDoc(doc(db, 'events', editing.id), updated)
      const gId = await syncEventToGoogle({ ...updated, googleEventId: editing.googleEventId }, team?.googleCalendarId)
      if (gId && gId !== editing.googleEventId) await updateDoc(doc(db, 'events', editing.id), { googleEventId: gId })
      setShowModal(false)
      setEditing(null)
      setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', type:'event', phases:{} })
    } finally { setSaving(false) }
  }

  const deleteEvent = async (e, event) => {
    e.stopPropagation()
    if (event.seriesId) {
      if (await confirm({ title: t('calendar.confirmDeleteEventTitle'), message: t('events.confirmDeleteSeriesMessage'), confirmLabel: t('calendar.confirmDeleteEventLabel'), danger: true })) {
        await deleteEventWithInventoryCheck({ event, confirm, t })
        await deleteGoogleEvent(event.googleEventId, team?.googleCalendarId)
      }
    } else {
      if (await confirm({ title: t('calendar.confirmDeleteEventTitle'), message: t('events.confirmDeleteMessage'), confirmLabel: t('calendar.confirmDeleteEventLabel'), danger: true })) {
        await deleteEventWithInventoryCheck({ event, confirm, t })
        await deleteGoogleEvent(event.googleEventId, team?.googleCalendarId)
      }
    }
  }

  const cardProps = { today, t, i18n, navigate, phaseConfig: PHASE_CONFIG, onEdit: openEdit, onDelete: deleteEvent, loadListsOn }

  const closeInstallation = async (installation) => {
    if (!(await confirm({ title: t('eventDetail.confirmCloseInstallationTitle'), message: t('events.confirmCloseInstallMessage', { name: installation.name }), confirmLabel: t('eventDetail.confirmCloseInstallationLabel') }))) return
    const items = installation.items || []
    for (const item of items) {
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
    await updateDoc(doc(db, 'events', installation.id), { archived: true })
  }

  const instCardProps = { today, t, navigate, onEdit: openEdit, onDelete: deleteEvent, onClose: closeInstallation, loadListsOn }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:140 }}>
      {/* Il toast è visivo e a scomparsa automatica: senza questa regione chi
          usa uno screen reader non saprebbe mai se la sincronizzazione è
          andata a buon fine. Regione sempre montata, non condizionata. */}
      <div aria-live="polite" role="status" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', whiteSpace:'nowrap', border:0, clip:'rect(0,0,0,0)' }}>
        {toast}
      </div>
      {toast && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, color:'var(--text)', boxShadow:'var(--shadow)', whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}
      <div style={{ padding:'56px 22px 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontSize:32, fontWeight:800, color:'var(--dash-title)', letterSpacing:'-0.5px', lineHeight:1.1 }}>{t('events.title')}</h1>
          <p style={{ fontSize:13, color:'var(--dash-muted)', fontWeight:500, marginTop:3 }}>{t('events.upcomingCount', { count: upcomingSingle.length + pinnedRecurring.length })}</p>
        </div>
        <div style={{ display:'flex', gap:8, paddingTop:4 }}>
          {team?.googleCalendarId && (
            <button onClick={() => syncFromGoogle(true)} disabled={gSyncing} style={{
              background:'var(--dash-pill-bg)', border:'1px solid var(--dash-pill-border)', color:'var(--dash-muted)',
              borderRadius:50, padding:'8px 14px', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
              opacity: gSyncing ? 0.6 : 1,
            }}>
              <IconSync spinning={gSyncing} /> {t('events.googleSyncButton')}
            </button>
          )}
          <button onClick={() => navigate('/archive')} style={{
            background:'var(--dash-pill-bg)', border:'1px solid var(--dash-pill-border)', color:'var(--dash-muted)',
            borderRadius:50, padding:'8px 14px', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
          }}>
            <IconArchive /> {t('events.archive')}
          </button>
        </div>
      </div>

      <FabButton onClick={() => { setCreateFlowSkip(null); setCreateFlowOpen(true) }} ariaLabel={t('events.newEventButton')} />

      {/* Search bar SEMPRE visibile */}
      <div style={{ padding:'0 16px 12px' }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <svg style={{ position:'absolute', left:14 }} viewBox="0 0 24 24" fill="var(--dash-muted)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('events.searchPlaceholder')}
            aria-label={t('events.searchPlaceholder')}
            style={{ width:'100%', padding:'12px 14px 12px 40px', borderRadius:14, border:'1.5px solid var(--dash-card-border)', background:'var(--dash-card)', color:'var(--dash-title)', fontSize:14 }} />
        </div>
      </div>

      <div style={{ padding:'12px 0 0' }}>

        {/* Risultati ricerca */}
        {loading ? (
          <EventListSkeleton count={6} />
        ) : search.trim() ? (
          <>
            <p style={{ padding:'0 16px 12px', color:'var(--dash-muted)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.resultsCount', { count: searchResults.length })}</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--dash-muted)', textAlign:'center' }}>{t('events.noResultsFor', { search })}</p>
              : searchResults.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)
            }
          </>
        ) : (
          <>
            {/* DA SCARICARE — collassabile, solo se il modulo liste di carico è attivo */}
            {loadListsOn && daScaricareSingle.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('unload')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#ea580c', display:'flex' }}><IconChevronSection open={openSections.unload} /></span>
                  <span className="section-label" style={{ color:'#ea580c', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.toUnload')}</span>
                  <span style={{ background:'#fed7aa', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#9a3412' }}>{daScaricareSingle.length}</span>
                </button>
                {openSections.unload && daScaricareSingle.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
              </div>
            )}

            {/* RICORRENTI — collassabile */}
            {pinnedRecurring.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('recurring')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#1d6fce', display:'flex' }}><IconChevronSection open={openSections.recurring} /></span>
                  <span className="section-label" style={{ color:'#1d6fce', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.recurring')}</span>
                  <span style={{ background:'#dbeafe', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#1e3a5f' }}>{pinnedRecurring.length}</span>
                </button>
                {openSections.recurring && pinnedRecurring.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
              </div>
            )}

            {/* PROSSIMI — collassabile con load more */}
            {upcomingSingle.length > 0 && (
              <div>
                <button onClick={() => toggle('upcoming')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--dash-muted)', display:'flex' }}><IconChevronSection open={openSections.upcoming} /></span>
                  <span className="section-label" style={{ color:'var(--dash-muted)', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.upcoming')}</span>
                  <span style={{ background:'var(--dash-pill-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--dash-muted)' }}>{upcomingSingle.length}</span>
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'12px', borderRadius:14, background:'var(--dash-pill-bg)', border:'1.5px solid var(--dash-pill-border)', color:'var(--dash-muted)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <IconPlus /> {t('events.moreEvents', { count: hiddenCount })}
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
                  <span className="section-label" style={{ color:'#5b4fcf', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.installations')}</span>
                  <span style={{ background:'#ede9fe', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#5b4fcf' }}>{installations.length}</span>
                </button>
                {openSections.installations && installations.map(inst => <InstallationCard key={inst.id} event={inst} {...instCardProps} />)}
              </div>
            )}

            {daScaricareSingle.length === 0 && pinnedRecurring.length === 0 && upcomingSingle.length === 0 && installations.length === 0 && (
              <button
                type="button"
                onClick={() => { setCreateFlowSkip(null); setCreateFlowOpen(true) }}
                className="btn-no-anim"
                style={{ width:'calc(100% - 32px)', margin:'20px 16px', background:'var(--dash-card)', border:'1.5px dashed var(--dash-pill-border)', borderRadius:20, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:10, cursor:'pointer', font:'inherit', color:'inherit' }}
              >
                <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--dash-pill-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dash-muted)' }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                </div>
                <div>
                  <p style={{ fontWeight:700, fontSize:15, color:'var(--dash-title)', marginBottom:4 }}>{t('events.noEventsFunTitle')}</p>
                  <p style={{ fontSize:12.5, color:'var(--dash-muted)', maxWidth:260 }}>{t('events.noEventsFunDesc')}</p>
                </div>
                <span style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:14, background:'var(--accent)', color:'white', fontWeight:700, fontSize:13 }}>
                  <IconPlus /> {t('dashboard.createFirstEvent')}
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Creazione (vuota, da template, ricorrente, event/installazione):
          flusso condiviso con Calendar.jsx, vedi CreateEventFlow.jsx. */}
      <CreateEventFlow
        open={createFlowOpen}
        onClose={() => { setCreateFlowOpen(false); setCreateFlowSkip(null) }}
        skipChoice={createFlowSkip}
        onCreated={(eventId, { fromTemplate }) => { if (fromTemplate) navigate(`/events/${eventId}`) }}
      />

      {/* Modifica evento esistente — niente scelta template/tipo qui, quella
          si decide solo in creazione. */}
      {showModal && (
        <div className={`modal-overlay${eventDrag.closing ? ' closing' : ''}`} onClick={eventDrag.onOverlayClick}>
          <div className={`modal${eventDrag.jiggling ? ' modal-jiggle' : ''}${eventDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...eventDrag.props}>
            <button className="close-btn" onClick={eventDrag.close} aria-label={t("common.close")}>✕</button>
            <h2>{t('calendar.editEventTitle')}</h2>
            <div className="form-group">
              <label htmlFor="ev-name">{t('calendar.eventNameLabel')}</label>
              <input id="ev-name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder={t('calendar.eventNamePlaceholder')} />
            </div>
            <div className="form-group">
              <label>{t('calendar.startDateLabel')}</label>
              <DateField value={form.date} onChange={v => setForm({...form,date:v})} />
            </div>
            <div className="form-group">
              <label>{t('calendar.endDateLabel')} {form.type === 'installation' ? <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintInstallation')}</span> : <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('events.endDateHintEvent')}</span>}</label>
              <DateField value={form.dateEnd} min={form.date} clearable onChange={v => setForm({...form, dateEnd:v})} placeholder={t('common.noneOption')} />
            </div>
            {form.type !== 'installation' && (
              <div className="form-group">
                <label style={{ marginBottom:8, display:'block' }}>{t('events.phasesEventLabel')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('common.optional')}</span></label>
                {PHASE_CONFIG.map(p => (
                  <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                    <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <DateField value={form.phases?.[p.key]||''} clearable placeholder="—"
                        onChange={v => setForm(f => { const ph={...(f.phases||{})}; if (v) ph[p.key]=v; else delete ph[p.key]; return {...f, phases:ph} })} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="ev-location">{t('calendar.locationLabel')}</label>
              <input id="ev-location" value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder={t('calendar.locationPlaceholder')} />
            </div>
            <div className="form-group">
              <label htmlFor="ev-notes">{t('calendar.notesLabel')}</label>
              <textarea id="ev-notes" value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder={t('events.notesPlaceholder')} rows={2} />
            </div>
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? t('common.saving') : t('calendar.saveChanges')}
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* Hover sezioni: si ingrandisce solo il testo label, non la barra intera */
        .section-label { display:inline-block; transition: transform 0.15s ease; transform-origin: left center; }
        .btn-section:hover .section-label { transform: scale(1.06); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* La regola globale button:hover aggiunge un'ombra grigia a ogni bottone
           (Modifica/Elimina, il titolo cliccabile...) dentro le card — qui
           sopra a una card che ha già una sua ombra propria risultava sporco.
           Tolta solo l'ombra, non l'intero hover (colore/scala restano). */
        .event-card button:not(:disabled):hover { box-shadow: none; }
      `}</style>
    </div>
  )
}
