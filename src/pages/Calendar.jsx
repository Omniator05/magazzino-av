import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore'
import EditButton from '../components/EditButton'
import { Pin, User, List, Wrench, Check } from '../components/Icon'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useAuth } from '../context/AuthContext'

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

// Restituisce le celle (con padding dal mese prec/succ) per la griglia del mese
function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  // Lun=0 ... Dom=6 (l'app usa settimana che parte di lunedì)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  // Giorni di padding dal mese precedente
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false, dateObj: new Date(year, month - 1, daysInPrevMonth - i) })
  }
  // Giorni del mese corrente
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateObj: new Date(year, month, d) })
  }
  // Padding finale per arrivare a multiplo di 7
  let nextDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay, current: false, dateObj: new Date(year, month + 1, nextDay) })
    nextDay++
  }
  return cells
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function Calendar() {
  const navigate = useNavigate()
  const { user, isWorker } = useAuth()
  const today = new Date()
  const todayStr = toDateStr(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [events, setEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [editingEvent, setEditingEvent] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const editDrag = useModalDrag(() => setEditingEvent(null))

  // Gestione assenze admin
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({ startDate:'', endDate:'', reason:'' })
  const [savingAbsence, setSavingAbsence] = useState(false)
  const absenceDrag = useModalDrag(() => setShowAbsenceModal(false))
  const myAbsences = unavailability.filter(u => u.workerId === user?.uid)

  useModalScrollLock(!!editingEvent || showAbsenceModal)

  const addAbsence = async () => {
    if (!absenceForm.startDate) return
    setSavingAbsence(true)
    try {
      await addDoc(collection(db, 'unavailability'), {
        workerId: user.uid,
        startDate: absenceForm.startDate,
        endDate: absenceForm.endDate || absenceForm.startDate,
        reason: absenceForm.reason.trim(),
        createdAt: serverTimestamp(),
      })
      setAbsenceForm({ startDate:'', endDate:'', reason:'' })
      setShowAbsenceModal(false)
    } finally { setSavingAbsence(false) }
  }

  const removeAbsence = async (id) => {
    if (!confirm('Rimuovere questa assenza?')) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  const PHASE_FORM_CONFIG = [
    { key:'montaggio',  label:'Montaggio',  color:'#2563eb', bg:'#dbeafe' },
    { key:'smontaggio', label:'Smontaggio', color:'#ea580c', bg:'#ffedd5' },
  ]

  const openEdit = (e, ev) => {
    e.stopPropagation()
    setEditingEvent(ev)
    setEditForm({ name:ev.name||'', date:ev.date||'', dateEnd:ev.dateEnd||'', location:ev.location||'', notes:ev.notes||'', phases:ev.phases||{} })
  }

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.date) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'events', editingEvent.id), {
        name: editForm.name.trim(), date: editForm.date,
        dateEnd: editForm.dateEnd || null,
        location: editForm.location.trim(), notes: editForm.notes.trim(),
        phases: editForm.phases || {},
      })
      setEditingEvent(null)
    } finally { setSaving(false) }
  }

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived))
    })
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'unavailability'), snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('name'))
    return onSnapshot(q, snap => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.role === 'worker' || p.role === 'admin'))
    })
  }, [])

  const cells = getMonthGrid(cursor.year, cursor.month)

  // Raggruppa eventi per data — tutti i giorni tra inizio e fine
  const eventsByDate = {}
  events.forEach(e => {
    if (!e.date) return
    const start = new Date(e.date + 'T12:00:00')
    const end = e.dateEnd && e.dateEnd >= e.date ? new Date(e.dateEnd + 'T12:00:00') : start
    const cur = new Date(start)
    while (cur <= end) {
      const dStr = toDateStr(cur)
      if (!eventsByDate[dStr]) eventsByDate[dStr] = []
      eventsByDate[dStr].push(e)
      cur.setDate(cur.getDate() + 1)
    }
  })

  // Indice fasi: data → array di { event, key, color, label }
  const PHASE_META = {
    montaggio:  { color:'#2563eb', label:'Montaggio' },
    smontaggio: { color:'#ea580c', label:'Smontaggio' },
  }
  const phasesByDate = {}
  events.forEach(e => {
    if (!e.phases) return
    Object.entries(e.phases).forEach(([key, date]) => {
      if (!date || !PHASE_META[key]) return
      if (!phasesByDate[date]) phasesByDate[date] = []
      phasesByDate[date].push({ event: e, key, ...PHASE_META[key] })
    })
  })

  const goPrevMonth = () => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  const goNextMonth = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  const goToday = () => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDate(todayStr) }

  const absencesOnDate = (dStr) => unavailability
    .filter(u => dStr >= u.startDate && dStr <= u.endDate)
    .map(u => ({ ...u, workerName: workers.find(w => w.id === u.workerId)?.name || 'Sconosciuto' }))

  const selectedEvents = eventsByDate[selectedDate] || []
  const selectedPhases = phasesByDate[selectedDate] || []
  // Aggiungi anche gli eventi con fasi nel giorno selezionato (non già presenti come evento del giorno)
  const selectedPhaseEvents = selectedPhases.filter(p => !selectedEvents.some(e => e.id === p.event.id))
  const selectedAbsences = selectedDate ? absencesOnDate(selectedDate) : []
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

  return (
    <div className="page" style={{ paddingBottom:90 }}>
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>Calendario</h1>
            <p>{events.length} eventi totali</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setAbsenceForm({ startDate: selectedDate || todayStr, endDate:'', reason:'' }); setShowAbsenceModal(true) }}
              style={{ background:'rgba(144,144,176,0.12)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:600 }}>
              🚫 Assenza
            </button>
            <button onClick={goToday} className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>Oggi</button>
          </div>
        </div>

        {/* Navigazione mese */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14 }}>
          <button onClick={goPrevMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>‹</button>
          <h2 style={{ fontSize:17, fontWeight:800 }}>{MONTHS[cursor.month]} {cursor.year}</h2>
          <button onClick={goNextMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>›</button>
        </div>
      </div>

      <div style={{ padding:'0 16px 16px' }}>
        {/* Header giorni settimana */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text2)', padding:'6px 0' }}>{w}</div>
          ))}
        </div>

        {/* Griglia mese — puntini colorati, tap per selezionare il giorno */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
          {cells.map((cell, i) => {
            const dStr = toDateStr(cell.dateObj)
            const dayEvents = eventsByDate[dStr] || []
            const dayAbsences = absencesOnDate(dStr)
            const isToday = dStr === todayStr
            const isPast = dStr < todayStr
            const isSelected = dStr === selectedDate

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dStr)}
                style={{
                  minHeight:52,
                  borderRadius:10,
                  padding:'5px 3px',
                  background: isSelected ? 'rgba(216,56,63,0.10)' : cell.current ? 'var(--card)' : 'transparent',
                  border: isSelected ? '1.5px solid var(--accent)' : isToday ? '1.5px solid rgba(216,56,63,0.4)' : '1px solid var(--border)',
                  opacity: cell.current ? (isPast ? 0.5 : 1) : 0.3,
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  gap:4,
                  overflow:'hidden',
                  cursor:'pointer',
                }}
              >
                <span style={{
                  fontSize:13, fontWeight: isToday ? 800 : 600,
                  color: isToday ? 'var(--accent)' : (cell.current ? 'var(--text)' : 'var(--text3)'),
                }}>
                  {cell.day}
                </span>
                {/* Puntini: eventi + fasi + assenze */}
                {(dayEvents.length > 0 || (phasesByDate[dStr]?.length > 0) || dayAbsences.length > 0) && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center', maxWidth:32 }}>
                    {dayEvents.slice(0, 3).map(ev => {
                      const isAssigned = isWorker && (ev.assignedWorkers || []).includes(user?.uid)
                      return (
                        <span key={ev.id} style={{
                          width:7, height:7, borderRadius:'50%', flexShrink:0,
                          background: ev.type === 'installation' ? '#7c6fcd' : isWorker ? (isAssigned ? 'var(--accent)' : 'var(--blue)') : 'var(--accent)',
                          opacity: isPast ? 0.55 : 1,
                        }} />
                      )
                    })}
                    {(phasesByDate[dStr] || []).slice(0, 2).map((p, i) => (
                      <span key={`ph${i}`} style={{
                        width:7, height:7, borderRadius:'50%', flexShrink:0,
                        background: p.color,
                        opacity: isPast ? 0.55 : 1,
                      }} />
                    ))}
                    {dayAbsences.length > 0 && (
                      <span style={{
                        width:7, height:7, borderRadius:'50%', flexShrink:0,
                        background: 'var(--text3)',
                        opacity: isPast ? 0.55 : 1,
                      }} />
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legenda */}
        <div style={{ display:'flex', gap:12, marginTop:14, paddingLeft:4, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{isWorker ? 'Eventi' : 'Eventi'}</span>
          </div>
          {isWorker && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} />
              <span style={{ fontSize:12, color:'var(--text2)' }}>Assegnato a me</span>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#7c6fcd', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Installazioni</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#2563eb', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Montaggio</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#ea580c', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Smontaggio</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--text3)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Assenze</span>
          </div>
        </div>
      </div>

      {/* Pannello giorno selezionato — qui il testo è leggibile per intero */}
      {selectedDate && (
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
            {selectedDateObj.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })}
            {selectedDate === todayStr && ' · Oggi'}
          </p>
          {selectedEvents.length === 0 && selectedPhaseEvents.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'8px 0' }}>Nessun evento in questo giorno.</p>
          ) : (
            <>
              {[...selectedEvents.map(ev => ({ ev, phaseOnDay: selectedPhases.find(p => p.event.id === ev.id), dotColor: ev.type === 'installation' ? '#7c6fcd' : 'var(--accent)', borderColor: 'var(--border)' })),
                ...selectedPhaseEvents.map(p => ({ ev: p.event, phaseOnDay: p, dotColor: p.color, borderColor: p.color + '44' }))
              ].map(({ ev, phaseOnDay, dotColor, borderColor }) => {
                const assignedNames = (ev.assignedWorkers || []).map(wid => workers.find(w => w.id === wid)?.name).filter(Boolean)
                return (
                  <div key={ev.id + (phaseOnDay?.key||'')} style={{ background:'var(--card)', border:`1px solid ${borderColor}`, borderRadius:14, marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'13px 14px' }}>
                      <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, marginTop:5, background: dotColor }} />
                      <div onClick={() => navigate(`/events/${ev.id}`)} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
                        <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                          {ev.type === 'installation' && <Wrench size={13} />}{ev.name}
                        </p>
                        {ev.location && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
                        {phaseOnDay && (
                          <span style={{ display:'inline-block', marginTop:5, background: phaseOnDay.color + '18', color: phaseOnDay.color, border:`1px solid ${phaseOnDay.color}44`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:800 }}>
                            {phaseOnDay.label}
                          </span>
                        )}
                        {assignedNames.length > 0 && (
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:7 }}>
                            {assignedNames.map(name => (
                              <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'var(--blue)' }}>
                                <User size={12} /> {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <EditButton onClick={e => openEdit(e, ev)} size={32} />
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Assenze worker in questo giorno */}
          {selectedAbsences.length > 0 && (
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Assenti</p>
              {selectedAbsences.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ flexShrink:0, color:'var(--text2)' }}><User size={18} /></span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{a.workerName}</p>
                    <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
                      {a.reason || 'Nessun motivo specificato'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Le mie assenze */}
          {myAbsences.length > 0 && (
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}><List size={13} /> Le mie assenze</p>
              {myAbsences.sort((a,b) => a.startDate.localeCompare(b.startDate)).map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>🚫</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>
                      {a.startDate === a.endDate
                        ? new Date(a.startDate+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})
                        : `${new Date(a.startDate+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'})} → ${new Date(a.endDate+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})}`}
                    </p>
                    {a.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{a.reason}</p>}
                  </div>
                  <button onClick={() => removeAbsence(a.id)}
                    style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700 }}>
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAB nuovo evento */}
      <button
        onClick={() => navigate('/events', { state: { openNewEvent: true } })}
        style={{
          position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 110px)', right:20, zIndex:50,
          width:56, height:56, borderRadius:'50%',
          background:'var(--accent)', color:'white',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 16px rgba(216,56,63,0.4)',
          border:'none',
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* Modal segnala assenza */}
      {showAbsenceModal && (
        <div className={`modal-overlay${absenceDrag.closing ? ' closing' : ''}`} onClick={absenceDrag.onOverlayClick}>
          <div className={`modal${absenceDrag.jiggling ? ' modal-jiggle' : ''}${absenceDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...absenceDrag.props}>
            <button className="close-btn" onClick={absenceDrag.close}>✕</button>
            <h2>🚫 Segnala assenza</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>Indica i giorni in cui non sei disponibile. Apparirà nel calendario e negli avvisi di assegnazione evento.</p>
            <div className="form-group">
              <label>Primo giorno *</label>
              <input type="date" value={absenceForm.startDate} onChange={e => setAbsenceForm(f => ({...f, startDate:e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate}))} />
            </div>
            <div className="form-group">
              <label>Ultimo giorno <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(lascia vuoto se un solo giorno)</span></label>
              <input type="date" value={absenceForm.endDate} min={absenceForm.startDate} onChange={e => setAbsenceForm(f => ({...f, endDate:e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Motivo <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              <input value={absenceForm.reason} onChange={e => setAbsenceForm(f => ({...f, reason:e.target.value}))} placeholder="es. Ferie, impegno personale..." />
            </div>
            <button onClick={addAbsence} className="btn btn-primary btn-full" style={{ marginTop:8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
              disabled={savingAbsence || !absenceForm.startDate}>
              {savingAbsence ? 'Salvataggio...' : <><Check size={16} /> Conferma assenza</>}
            </button>
          </div>
        </div>
      )}

      {/* Modal modifica evento */}
      {editingEvent && (
        <div className={`modal-overlay${editDrag.closing ? ' closing' : ''}`} onClick={editDrag.onOverlayClick}>
          <div className={`modal${editDrag.jiggling ? ' modal-jiggle' : ''}${editDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...editDrag.props}>
            <button className="close-btn" onClick={editDrag.close}>✕</button>
            <h2>Modifica evento</h2>
            <div className="form-group">
              <label>Nome evento *</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({...f, name:e.target.value}))} placeholder="es. Matrimonio Rossi" />
            </div>
            <div className="form-group">
              <label>Data inizio *</label>
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({...f, date:e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Data fine <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              <input type="date" value={editForm.dateEnd||''} min={editForm.date} onChange={e => setEditForm(f => ({...f, dateEnd:e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Fasi <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              {PHASE_FORM_CONFIG.map(p => (
                <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                  <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                  <input type="date" value={editForm.phases?.[p.key]||''}
                    onChange={e => setEditForm(f => ({...f, phases:{...(f.phases||{}), [p.key]:e.target.value}}))}
                    style={{ flex:1, fontSize:13, padding:'8px 10px' }} />
                  {editForm.phases?.[p.key] && (
                    <button type="button" className="btn-no-anim" onClick={() => setEditForm(f => { const ph={...(f.phases||{})}; delete ph[p.key]; return {...f,phases:ph} })}
                      style={{ background:'transparent', color:'var(--text3)', fontSize:16, padding:'0 4px', flexShrink:0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={editForm.location||''} onChange={e => setEditForm(f => ({...f, location:e.target.value}))} placeholder="es. Villa Belvedere, Verona" />
            </div>
            <div className="form-group">
              <label>Note</label>
              <textarea value={editForm.notes||''} onChange={e => setEditForm(f => ({...f, notes:e.target.value}))} rows={2} />
            </div>
            <button onClick={saveEdit} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={saving || !editForm.name?.trim() || !editForm.date}>
              {saving ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
