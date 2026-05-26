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
      return saved ? JSON.parse(saved) : { recurring: true, unload: true, upcoming: true }
    } catch { return { recurring: true, unload: true, upcoming: true } }
  })
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [templates, setTemplates] = useState([])
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [pendingTemplateItems, setPendingTemplateItems] = useState(null)
  const [form, setForm]           = useState({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const anyModalOpen = showModal || showTemplateMenu
  useModalScrollLock(anyModalOpen)

  // Se arrivo dall'archivio con un template, apro subito il form
  useEffect(() => {
    if (navState?.templateItems) {
      setForm({ name: navState.templateName || '', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
      setPendingTemplateItems(navState.templateItems)
      setShowModal(true)
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

  const singleEvents   = events.filter(e => !e.seriesId)

  // Un evento rimane "attivo" se:
  // 1. la data è oggi o futura, OPPURE
  // 2. la data è passata ma non tutti gli articoli sono rientrati
  const isActive = e => {
    if (e.date >= today) return true
    const items = e.items || []
    if (items.length === 0) return false          // nessun articolo → va in archivio
    return items.some(i => i.loaded && !i.returned) // qualcosa ancora fuori
  }

  const upcomingSingle = singleEvents.filter(e => e.date >= today)
  const daScaricareSingle = singleEvents.filter(e => {
    if (e.date >= today) return false
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
    setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
    setPendingTemplateItems(null)
    setShowModal(true)
  }

  const openEdit = (e, event) => {
    e.stopPropagation()
    setEditing(event)
    setForm({ name:event.name||'', date:event.date||'', dateEnd:event.dateEnd||'', location:event.location||'', notes:event.notes||'', recurrence:'never', endDate:'' })
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
        })
        setShowModal(false)
        setEditing(null)
        setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
      } else {
        const seriesId = form.recurrence !== 'never' && futureDates.length > 0
          ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
        const base = {
          name: form.name.trim(), location: form.location.trim(),
          notes: form.notes.trim(), dateEnd: form.dateEnd || null,
          items: pendingTemplateItems || [],
          createdAt: serverTimestamp(), createdBy: user.uid,
          recurrence: form.recurrence, seriesId,
        }
        const ref = await addDoc(collection(db, 'events'), { ...base, date: form.date })
        for (const date of futureDates) {
          await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp() })
        }
        setShowModal(false)
        setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', location:'', notes:'', recurrence:'never', endDate:'' })
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
    const isPast      = event.date < today
    const daScaricare = isPast && items.some(i => i.loaded && !i.returned)

    // Colori card: rosso=oggi, arancio=da scaricare, neutro=futuro
    const cardBg     = isToday      ? 'rgba(220,38,38,0.06)'   : daScaricare ? 'rgba(234,88,12,0.06)'   : 'var(--card)'
    const cardBorder = isToday      ? 'rgba(220,38,38,0.35)'   : daScaricare ? 'rgba(234,88,12,0.35)'   : 'var(--border)'
    const badgeBg    = isToday      ? 'rgba(220,38,38,0.12)'   : daScaricare ? 'rgba(234,88,12,0.12)'   : ''
    const badgeBorder= isToday      ? 'rgba(220,38,38,0.25)'   : daScaricare ? 'rgba(234,88,12,0.3)'    : ''
    const badgeColor = isToday      ? 'var(--red)'              : daScaricare ? '#ea580c'               : ''
    const badgeLabel = isToday      ? '🔴 OGGI'                 : daScaricare ? '🟠 DA SCARICARE'        : ''

    let statusColor = 'var(--text2)', statusText = 'Lista vuota'
    if (total > 0) {
      if (returned === total)    { statusColor = 'var(--green)';   statusText = '✅ Tutto rientrato' }
      else if (loaded === total) { statusColor = 'var(--accent2)'; statusText = `In evento · ${returned}/${total} rientrati` }
      else if (loaded > 0)       { statusColor = 'var(--accent2)'; statusText = `Carico · ${loaded}/${total}` }
      else                       { statusColor = 'var(--text2)';   statusText = `${total} in lista` }
    }

    return (
      <div className="event-card" onClick={() => navigate(`/events/${event.id}`)}
        style={{ cursor:'pointer', background:cardBg, borderColor:cardBorder }}>
        {(isToday || daScaricare) && (
          <div style={{ background:badgeBg, padding:'5px 16px', borderBottom:`1px solid ${badgeBorder}` }}>
            <p style={{ color:badgeColor, fontSize:12, fontWeight:700 }}>{badgeLabel}</p>
          </div>
        )}
        <div className="event-card-header">
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:2 }}>
              <h3 style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.name}</h3>
              {event.seriesId && (
                <span style={{ background:'rgba(79,195,247,0.12)', color:'var(--blue)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:6, padding:'1px 7px', fontSize:10, fontWeight:800, flexShrink:0 }}>🔁</span>
              )}
            </div>
            <DateBadge dateStr={event.date} dateEndStr={event.dateEnd} location={event.location} today={today} />
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            <EditButton onClick={e => openEdit(e, event)} size={34} />
            <DeleteButton onClick={e => deleteEvent(e, event)} size={34} />
          </div>
        </div>
        <div style={{ padding:'10px 16px' }}>
          {total > 0 && (
            <div style={{ background:'var(--card2)', borderRadius:4, height:4, marginBottom:8 }}>
              <div style={{ background: returned === total ? 'var(--green)' : isToday ? 'var(--red)' : daScaricare ? '#ea580c' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.3s' }} />
            </div>
          )}
          <p style={{ color:statusColor, fontSize:13, fontWeight:600 }}>{statusText}</p>
        </div>
        {event.notes && <div style={{ padding:'0 16px 12px' }}><p style={{ color:'var(--text2)', fontSize:12, fontStyle:'italic' }}>📝 {event.notes}</p></div>}
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

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Eventi</h1><p>{upcomingSingle.length + pinnedRecurring.length} prossimi</p></div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => navigate('/archive')} className="btn btn-secondary" style={{ padding:'10px 14px', fontSize:14 }}>📁 Archivio</button>
            <button onClick={() => setShowTemplateMenu(true)} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Evento</button>
          </div>
        </div>
      </div>

      {/* Search bar SEMPRE visibile */}
      <div className="search-bar" style={{ position:'relative' }}>
        <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca evento per nome o location..." />
      </div>

      <div style={{ padding:'12px 0 0' }}>

        {/* Risultati ricerca */}
        {search.trim() ? (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Risultati ({searchResults.length})</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--text2)', textAlign:'center' }}>Nessun evento trovato per "{search}"</p>
              : searchResults.map(ev => <EventCard key={ev.id} event={ev} />)
            }
          </>
        ) : (
          <>
            {/* DA SCARICARE — collassabile */}
            {daScaricareSingle.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('unload')}
                  className="btn-section" style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'transparent', outline:'none' }}>
                  <span style={{ transition:'transform 0.2s', display:'inline-block', transform: openSections.unload ? 'rotate(90deg)' : 'rotate(0deg)', fontSize:20, lineHeight:1, color:'#ea580c' }}>›</span>
                  <span style={{ color:'#ea580c', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.5px' }}>🟠 Da scaricare</span>
                  <span style={{ background:'rgba(234,88,12,0.15)', border:'1px solid rgba(234,88,12,0.3)', borderRadius:10, padding:'1px 8px', fontSize:11, color:'#ea580c' }}>{daScaricareSingle.length}</span>
                  <div style={{ flex:1, height:1, background:'rgba(234,88,12,0.2)' }} />
                </button>
                {openSections.unload && daScaricareSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
              </div>
            )}

            {/* RICORRENTI — collassabile */}
            {pinnedRecurring.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('recurring')}
                  className="btn-section" style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'transparent', outline:'none' }}>
                  <span style={{ transition:'transform 0.2s', display:'inline-block', transform: openSections.recurring ? 'rotate(90deg)' : 'rotate(0deg)', fontSize:20, lineHeight:1, color:'var(--blue)' }}>›</span>
                  <span style={{ color:'var(--blue)', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.5px' }}>🔁 Ricorrenti</span>
                  <span style={{ background:'rgba(37,99,235,0.12)', border:'1px solid rgba(37,99,235,0.25)', borderRadius:10, padding:'1px 8px', fontSize:11, color:'var(--blue)' }}>{pinnedRecurring.length}</span>
                  <div style={{ flex:1, height:1, background:'rgba(37,99,235,0.15)' }} />
                </button>
                {openSections.recurring && pinnedRecurring.map(ev => <EventCard key={ev.id} event={ev} />)}
              </div>
            )}

            {/* PROSSIMI — collassabile con load more */}
            {upcomingSingle.length > 0 && (
              <div>
                <button onClick={() => toggle('upcoming')}
                  className="btn-section" style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'transparent', outline:'none' }}>
                  <span style={{ transition:'transform 0.2s', display:'inline-block', transform: openSections.upcoming ? 'rotate(90deg)' : 'rotate(0deg)', fontSize:20, lineHeight:1, color:'var(--text2)' }}>›</span>
                  <span style={{ color:'var(--text2)', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi</span>
                  <span style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'1px 8px', fontSize:11, color:'var(--text2)' }}>{upcomingSingle.length}</span>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'11px', borderRadius:12, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--accent)', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                          + {hiddenCount} altri eventi
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {events.length === 0 && (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                <h3>Nessun evento</h3>
                <p>Crea il primo evento per gestire i carichi</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal scelta: template o vuoto */}
      {showTemplateMenu && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTemplateMenu(false)}>
          <div className="modal" style={{ position:'relative' }} {...templateDrag}>
            <button className="close-btn" onClick={() => setShowTemplateMenu(false)}>✕</button>
            <h2>Nuovo evento</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16 }}>Vuoi partire da un template o creare un evento vuoto?</p>

            {/* Evento vuoto */}
            <button onClick={() => { setShowTemplateMenu(false); openNew() }}
              style={{ width:'100%', padding:'14px 16px', borderRadius:12, background:'var(--card2)', border:'2px solid var(--border)', color:'var(--text)', fontWeight:600, fontSize:15, textAlign:'left', marginBottom:12, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:28 }}>📄</span>
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
                    <span style={{ fontSize:24 }}>📋</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700 }}>{t.name}</p>
                      <p style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>
                        {(t.components||[]).length} articoli
                        {t.notes ? ` · ${t.notes}` : ''}
                      </p>
                    </div>
                    <span style={{ color:'var(--blue)', fontSize:18 }}>›</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }} {...eventDrag}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{editing ? 'Modifica evento' : pendingTemplateItems ? '📋 Nuovo evento da template' : 'Nuovo evento'}</h2>
            {pendingTemplateItems && (
              <div style={{ background:'rgba(79,195,247,0.08)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>
                <p style={{ color:'var(--blue)', fontSize:13, fontWeight:600 }}>
                  ✅ Lista carico pronta ({pendingTemplateItems.length} articoli) — compila i dettagli evento
                </p>
              </div>
            )}
            <div className="form-group">
              <label>Nome evento *</label>
              <input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Matrimonio Rossi" />
            </div>
            <div className="form-group">
              <label>Data inizio *</label>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})}
                  id="date-start" style={{ flex:1, paddingRight:40 }} />
                <button type="button" onClick={() => document.getElementById('date-start').showPicker?.()}
                  style={{ position:'absolute', right:10, background:'transparent', color:'var(--text2)', padding:0, fontSize:18, lineHeight:1 }}>
                  📅
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Data fine <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale — evento multi-giorno)</span></label>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <input type="date" value={form.dateEnd} min={form.date} id="date-end"
                  onChange={e => setForm({...form, dateEnd:e.target.value})} style={{ flex:1, paddingRight:40 }} />
                <button type="button" onClick={() => document.getElementById('date-end').showPicker?.()}
                  style={{ position:'absolute', right:10, background:'transparent', color:'var(--text2)', padding:0, fontSize:18, lineHeight:1 }}>
                  📅
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="es. Villa Belvedere, Verona" />
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Dettagli evento..." rows={2} />
            </div>
            {!editing && (
              <>
                <div className="form-group">
                  <label>🔁 Ripeti</label>
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
                    <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700 }}>🔁 {futureDates.length + 1} eventi totali</p>
                    <p style={{ color:'var(--text2)', fontSize:12, marginTop:3 }}>
                      Dal {new Date(form.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})} al {new Date(futureDates.at(-1)+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}
                    </p>
                  </div>
                )}
              </>
            )}
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? '⏳ Salvataggio...'
                : editing ? '💾 Salva modifiche'
                : pendingTemplateItems ? '✅ Crea evento e vai alla lista carico'
                : futureDates.length > 0 ? `✅ Crea ${futureDates.length + 1} eventi`
                : '✅ Crea evento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
