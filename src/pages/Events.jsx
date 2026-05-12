import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents]       = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ name:'', date:'', location:'', notes:'', recurrence:'never', endDate:'' })
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const today = new Date().toISOString().split('T')[0]

  // Separa eventi ricorrenti (mostra solo il prossimo di ogni serie) da eventi singoli
  const recurringSeriesMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringSeriesMap[ev.seriesId]) recurringSeriesMap[ev.seriesId] = []
      recurringSeriesMap[ev.seriesId].push(ev)
    }
  })
  // Per ogni serie, prendi solo il prossimo evento non passato (o l'ultimo se tutti passati)
  const pinnedRecurring = Object.values(recurringSeriesMap).map(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    return sorted.find(e => e.date >= today) || sorted[sorted.length - 1]
  })
  const pinnedIds = new Set(pinnedRecurring.map(e => e.id))

  // Tutti gli eventi non ricorrenti
  const singleEvents = events.filter(e => !e.seriesId)
  const upcomingSingle = singleEvents.filter(e => e.date >= today)
  const pastSingle     = singleEvents.filter(e => e.date < today)

  const openNew = () => {
    setEditing(null)
    setForm({ name:'', date:'', location:'', notes:'', recurrence:'never', endDate:'' })
    setShowModal(true)
  }

  const openEdit = (e, event) => {
    e.stopPropagation()
    setEditing(event)
    setForm({ name:event.name||'', date:event.date||'', location:event.location||'', notes:event.notes||'', recurrence:'never', endDate:'' })
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
          location: form.location.trim(), notes: form.notes.trim(),
        })
      } else {
        const seriesId = form.recurrence !== 'never' && futureDates.length > 0
          ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
        const base = {
          name: form.name.trim(), location: form.location.trim(),
          notes: form.notes.trim(),
          items: [], // lista carico condivisa — verrà sincronizzata tramite seriesId
          createdAt: serverTimestamp(), createdBy: user.uid,
          recurrence: form.recurrence, seriesId,
          seriesItems: [], // lista carico condivisa tra tutti gli eventi della serie
        }
        const firstRef = await addDoc(collection(db, 'events'), { ...base, date: form.date })
        for (const date of futureDates) {
          await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp() })
        }
      }
      setShowModal(false)
      setEditing(null)
      setForm({ name:'', date:'', location:'', notes:'', recurrence:'never', endDate:'' })
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

  const EventCard = ({ event, compact }) => {
    const items    = event.items || []
    const loaded   = items.filter(i => i.loaded).length
    const returned = items.filter(i => i.returned).length
    const total    = items.length
    const isToday  = event.date === today

    let statusColor = 'var(--text2)', statusText = 'Lista vuota'
    if (total > 0) {
      if (returned === total)    { statusColor = 'var(--green)';   statusText = '✅ Tutto rientrato' }
      else if (loaded === total) { statusColor = 'var(--accent2)'; statusText = `In evento · ${returned}/${total} rientrati` }
      else if (loaded > 0)       { statusColor = 'var(--accent2)'; statusText = `Carico · ${loaded}/${total}` }
      else                       { statusColor = 'var(--text2)';   statusText = `${total} in lista` }
    }

    return (
      <div className="event-card" onClick={() => navigate(`/events/${event.id}`)} style={{ cursor:'pointer' }}>
        {isToday && (
          <div style={{ background:'rgba(233,69,96,0.15)', padding:'5px 16px', borderBottom:'1px solid rgba(233,69,96,0.2)' }}>
            <p style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>🔴 OGGI</p>
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
            <p style={{ color:'var(--text2)', fontSize:13 }}>
              📅 {new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
              {event.location && ` · 📍 ${event.location}`}
            </p>
          </div>
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            <button onClick={e => openEdit(e, event)} style={{ background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, padding:'6px 10px', fontSize:13 }}>✏️</button>
            <button onClick={e => deleteEvent(e, event)} style={{ background:'transparent', color:'var(--text2)', fontSize:18, padding:'4px 8px' }}>🗑</button>
          </div>
        </div>
        <div style={{ padding:'10px 16px' }}>
          {total > 0 && (
            <div style={{ background:'var(--card2)', borderRadius:4, height:4, marginBottom:8 }}>
              <div style={{ background: returned === total ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded,returned)/total)*100}%`, transition:'width 0.3s' }} />
            </div>
          )}
          <p style={{ color:statusColor, fontSize:13, fontWeight:600 }}>{statusText}</p>
        </div>
        {event.notes && <div style={{ padding:'0 16px 12px' }}><p style={{ color:'var(--text2)', fontSize:12, fontStyle:'italic' }}>📝 {event.notes}</p></div>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Eventi</h1><p>{upcomingSingle.length + pinnedRecurring.length} prossimi · {pastSingle.length} passati</p></div>
          <button onClick={openNew} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Evento</button>
        </div>
      </div>

      <div style={{ padding:'16px 0 0' }}>

        {/* ── Sezione ricorrenti pinnata ── */}
        {pinnedRecurring.length > 0 && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px 10px' }}>
              <p style={{ color:'var(--blue)', fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>🔁 Ricorrenti</p>
              <div style={{ flex:1, height:1, background:'rgba(79,195,247,0.2)' }} />
            </div>
            {pinnedRecurring.map(ev => <EventCard key={ev.id} event={ev} />)}
            {(upcomingSingle.length > 0 || pastSingle.length > 0) && (
              <div style={{ margin:'4px 16px 10px', height:1, background:'var(--border)' }} />
            )}
          </>
        )}

        {/* ── Prossimi singoli ── */}
        {upcomingSingle.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi</p>
            {upcomingSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
          </>
        )}

        {/* ── Passati singoli ── */}
        {pastSingle.length > 0 && (
          <>
            <p style={{ padding:'16px 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Passati</p>
            {pastSingle.map(ev => <EventCard key={ev.id} event={ev} />)}
          </>
        )}

        {events.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            <h3>Nessun evento</h3>
            <p>Crea il primo evento per gestire i carichi</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>{editing ? 'Modifica evento' : 'Nuovo evento'}</h2>
            <div className="form-group">
              <label>Nome evento *</label>
              <input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Matrimonio Rossi" />
            </div>
            <div className="form-group">
              <label>Data *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} />
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
                    <p style={{ color:'var(--text2)', fontSize:12, marginTop:4, fontStyle:'italic' }}>Ogni evento parte con lista di carico vuota — la compilerai di volta in volta.</p>
                  </div>
                )}
              </>
            )}
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? '⏳ Salvataggio...'
                : editing ? '💾 Salva modifiche'
                : futureDates.length > 0 ? `✅ Crea ${futureDates.length + 1} eventi`
                : '✅ Crea evento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
