import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore'
import EditButton from '../components/EditButton'
import DeleteButton from '../components/DeleteButton'
import { Pin, User, List, Wrench, Check } from '../components/Icon'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useSwipeMonth } from '../hooks/useSwipeMonth'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import DateField from '../components/DateField'
import { toggleWorkerAssignment, isWorkerUnavailable } from '../utils/workerAssignment'

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
  const { user, isWorker, teamId } = useAuth()
  const confirm = useConfirm()
  const today = new Date()
  const todayStr = toDateStr(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [events, setEvents] = useState([])
  const [googleEvents, setGoogleEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // Modalità "Assegna personale" — vista alternativa alla griglia, lista degli
  // eventi del mese con i worker assegnati sempre visibili.
  const [mode, setMode] = useState('grid') // 'grid' | 'assign'
  const [selectedWorkerId, setSelectedWorkerId] = useState(null) // tap-tap mobile
  const [dragOverEventId, setDragOverEventId] = useState(null)   // feedback drag desktop
  const [showPastAssign, setShowPastAssign] = useState(false)    // includi eventi già passati
  const [editingEvent, setEditingEvent] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  // Gestione assenze admin
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({ startDate:'', endDate:'', reason:'' })
  const [savingAbsence, setSavingAbsence] = useState(false)
  const myAbsences = unavailability.filter(u => u.workerId === user?.uid)

  // Selezione assenza tap-sul-calendario
  const [reportMode, setReportMode] = useState(false)
  const [rangeStart, setRangeStart] = useState(null)

  const startReportMode = () => { setReportMode(true); setRangeStart(null); setSelectedDate(null) }
  const cancelReportMode = () => { setReportMode(false); setRangeStart(null); setSelectedDate(todayStr) }

  const handleDayTap = (dStr) => {
    if (reportMode) {
      if (!rangeStart) {
        setRangeStart(dStr)
      } else {
        const start = dStr <= rangeStart ? dStr : rangeStart
        const end = dStr <= rangeStart ? rangeStart : dStr
        setAbsenceForm({ startDate: start, endDate: end, reason: '' })
        setShowAbsenceModal(true)
        setReportMode(false)
        setRangeStart(null)
      }
    } else {
      setSelectedDate(dStr)
    }
  }

  // Funzioni di salvataggio prima dei drag hook → Enter può invocarle
  const addAbsence = async () => {
    if (!absenceForm.startDate) return
    setSavingAbsence(true)
    try {
      await addDoc(collection(db, 'unavailability'), {
        workerId: user.uid,
        teamId,
        startDate: absenceForm.startDate,
        endDate: absenceForm.endDate || absenceForm.startDate,
        reason: absenceForm.reason.trim(),
        createdAt: serverTimestamp(),
      })
      setAbsenceForm({ startDate:'', endDate:'', reason:'' })
      setShowAbsenceModal(false)
    } finally { setSavingAbsence(false) }
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

  const deleteEvent = async (e, ev) => {
    e.stopPropagation()
    if (!(await confirm({ title: 'Elimina evento', message: `Eliminare "${ev.name}"? L'operazione non può essere annullata.`, confirmLabel: 'Elimina', danger: true }))) return
    await deleteDoc(doc(db, 'events', ev.id))
  }

  const createEvent = async () => {
    if (!editForm.name.trim() || !editForm.date) return
    setCreating(true)
    try {
      await addDoc(collection(db, 'events'), {
        name: editForm.name.trim(),
        date: editForm.date,
        dateEnd: editForm.dateEnd || null,
        location: (editForm.location || '').trim(),
        notes: (editForm.notes || '').trim(),
        phases: editForm.phases || {},
        teamId,
        createdAt: serverTimestamp(),
      })
      setShowCreate(false)
    } finally { setCreating(false) }
  }

  const editDrag = useModalDrag(() => setEditingEvent(null), undefined, saveEdit, !!editingEvent)
  const createDrag = useModalDrag(() => setShowCreate(false), undefined, createEvent, showCreate)
  const absenceDrag = useModalDrag(() => setShowAbsenceModal(false), undefined, addAbsence, showAbsenceModal)

  useModalScrollLock(!!editingEvent || showAbsenceModal || showCreate)

  const removeAbsence = async (id) => {
    if (!(await confirm({ title: 'Rimuovi assenza', message: 'Rimuovere questa assenza?', confirmLabel: 'Rimuovi', danger: true }))) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  // Assegnazione worker → evento, usata sia dal drag desktop sia dal tap-tap
  // mobile sia dalla ✕ sui chip già assegnati (rimozione, mai conferma).
  const handleAssign = async (ev, workerId) => {
    if (!workerId) return
    const alreadyAssigned = (ev.assignedWorkers || []).includes(workerId)
    if (!alreadyAssigned && isWorkerUnavailable(workerId, ev, unavailability)) {
      const w = workers.find(x => x.id === workerId)
      const ok = await confirm({
        title: 'Worker non disponibile',
        message: `${w?.name || 'Questo worker'} risulta assente in questa data. Assegnarlo comunque a "${ev.name}"?`,
        confirmLabel: 'Assegna comunque',
        danger: true,
      })
      if (!ok) return
    }
    await toggleWorkerAssignment(doc(db, 'events', ev.id), ev, workerId)
    setSelectedWorkerId(null)
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

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived))
    })
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'unavailability'), where('teamId', '==', teamId)), snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [teamId])

  // Eventi importati da Google Calendar (sync giornaliero in sola lettura, vedi /api/sync-google-calendar)
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'googleCalendarEvents'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => {
      setGoogleEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.role === 'worker' || p.role === 'admin'))
    })
  }, [teamId])

  const cells = getMonthGrid(cursor.year, cursor.month)

  // Eventi del mese in vista (per la modalità "Assegna personale"), con
  // overlap multi-giorno — un evento appare una sola volta anche se lungo.
  // Di default nasconde i già passati (si assegna personale a ciò che deve
  // ancora succedere), con un toggle per farli ricomparire.
  const monthStart = toDateStr(new Date(cursor.year, cursor.month, 1))
  const monthEnd = toDateStr(new Date(cursor.year, cursor.month + 1, 0))
  const monthEvents = events
    .filter(ev => {
      if (!ev.date) return false
      const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
      if (end < monthStart || ev.date > monthEnd) return false
      if (!showPastAssign && end < todayStr) return false
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))

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

  // Eventi Google raggruppati per data (stessa logica multi-giorno degli eventi normali)
  const googleEventsByDate = {}
  googleEvents.forEach(e => {
    if (!e.date) return
    const start = new Date(e.date + 'T12:00:00')
    const end = e.dateEnd && e.dateEnd >= e.date ? new Date(e.dateEnd + 'T12:00:00') : start
    const cur = new Date(start)
    while (cur <= end) {
      const dStr = toDateStr(cur)
      if (!googleEventsByDate[dStr]) googleEventsByDate[dStr] = []
      googleEventsByDate[dStr].push(e)
      cur.setDate(cur.getDate() + 1)
    }
  })

  const goPrevMonth = () => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  const goNextMonth = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  const goToday = () => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDate(todayStr) }
  const swipeMonth = useSwipeMonth(goPrevMonth, goNextMonth)

  const absencesOnDate = (dStr) => unavailability
    .filter(u => dStr >= u.startDate && dStr <= u.endDate)
    .map(u => ({ ...u, workerName: workers.find(w => w.id === u.workerId)?.name || 'Sconosciuto' }))

  const selectedEvents = eventsByDate[selectedDate] || []
  const selectedPhases = phasesByDate[selectedDate] || []
  // Aggiungi anche gli eventi con fasi nel giorno selezionato (non già presenti come evento del giorno)
  const selectedPhaseEvents = selectedPhases.filter(p => !selectedEvents.some(e => e.id === p.event.id))
  const selectedAbsences = selectedDate ? absencesOnDate(selectedDate) : []
  const selectedGoogleEvents = selectedDate ? (googleEventsByDate[selectedDate] || []) : []
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

  return (
    <div className="page" style={{ paddingBottom:160 }}>
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>Calendario</h1>
            <p>{events.length} eventi totali</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => reportMode ? cancelReportMode() : startReportMode()}
              style={{
                background: reportMode ? 'rgba(216,56,63,0.12)' : 'rgba(144,144,176,0.12)',
                border: `1px solid ${reportMode ? 'rgba(216,56,63,0.4)' : 'var(--border)'}`,
                color: reportMode ? 'var(--accent)' : 'var(--text2)',
                borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:600,
              }}>
              Segna assenza
            </button>
            <button onClick={goToday} className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>Oggi</button>
          </div>
        </div>

        {/* Toggle griglia / assegna personale */}
        <div style={{ display:'flex', gap:3, marginTop:22, background:'var(--card2)', borderRadius:10, padding:3, width:'fit-content', margin:'22px auto 0' }}>
          <button onClick={() => setMode('grid')} style={{ padding:'6px 16px', borderRadius:8, fontSize:12, fontWeight:700, background: mode === 'grid' ? 'var(--accent)' : 'transparent', color: mode === 'grid' ? 'white' : 'var(--text2)' }}>
            Calendario
          </button>
          <button onClick={() => setMode('assign')} style={{ padding:'6px 16px', borderRadius:8, fontSize:12, fontWeight:700, background: mode === 'assign' ? 'var(--accent)' : 'transparent', color: mode === 'assign' ? 'white' : 'var(--text2)' }}>
            Assegna personale
          </button>
        </div>

        {/* Navigazione mese */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:22 }}>
          <button onClick={goPrevMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>‹</button>
          <h2 style={{ fontSize:17, fontWeight:800 }}>{MONTHS[cursor.month]} {cursor.year}</h2>
          <button onClick={goNextMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>›</button>
        </div>

        {mode === 'grid' && reportMode && (
          <div style={{ marginTop:14, background:'rgba(216,56,63,0.08)', border:'1px solid rgba(216,56,63,0.3)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--accent)', fontWeight:600, lineHeight:1.4 }}>
              {!rangeStart ? 'Tocca il primo giorno della tua assenza' : 'Tocca l\'ultimo giorno (o lo stesso per un solo giorno)'}
            </p>
            <button onClick={cancelReportMode} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'6px 12px', fontSize:13, fontWeight:700, flexShrink:0 }}>Annulla</button>
          </div>
        )}
      </div>

      {mode === 'grid' && (
      <div style={{ padding:'0 16px 16px' }}>
        {/* Header giorni settimana */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text2)', padding:'6px 0' }}>{w}</div>
          ))}
        </div>

        {/* Griglia mese — puntini colorati, tap per selezionare il giorno; swipe orizzontale per cambiare mese */}
        <div key={`${cursor.year}-${cursor.month}`} className="cal-grid-swipe" {...swipeMonth} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
          {cells.map((cell, i) => {
            const dStr = toDateStr(cell.dateObj)
            const dayEvents = eventsByDate[dStr] || []
            const dayGoogleEvents = googleEventsByDate[dStr] || []
            const dayAbsences = absencesOnDate(dStr)
            const hasMyAbsence = dayAbsences.some(a => a.workerId === user?.uid)
            const isToday = dStr === todayStr
            const isPast = dStr < todayStr
            const isSelected = dStr === selectedDate
            const isRangeStart = reportMode && dStr === rangeStart
            const otherAbsences = dayAbsences.filter(a => a.workerId !== user?.uid)

            return (
              <button
                key={i}
                onClick={() => handleDayTap(dStr)}
                style={{
                  position:'relative',
                  minHeight:70,
                  borderRadius:10,
                  padding:'5px 3px 4px',
                  background: isSelected ? 'rgba(216,56,63,0.10)' : isRangeStart ? 'rgba(216,56,63,0.12)' : cell.current ? 'var(--card)' : 'transparent',
                  border: isSelected ? '1.5px solid var(--accent)' : isRangeStart ? '1.5px solid var(--accent)' : isToday ? '1.5px solid rgba(216,56,63,0.4)' : '1px solid var(--border)',
                  opacity: cell.current ? (isPast ? 0.5 : 1) : 0.3,
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  gap:2,
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
                {/* Assenze personale (diverse dalla mia), in rosso al posto del vecchio triangolino */}
                {otherAbsences.length > 0 && (
                  <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:1 }}>
                    <span style={{ fontSize:8, fontWeight:800, lineHeight:1.2, color:'var(--red)', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      Assenza - {otherAbsences[0].workerName}
                    </span>
                    {otherAbsences.length > 1 && (
                      <span style={{ fontSize:8, fontWeight:700, color:'var(--red)' }}>+{otherAbsences.length - 1} altri</span>
                    )}
                  </div>
                )}
                {/* Nomi evento (fino a 2 righe, troncati) invece dei puntini */}
                {dayEvents.length > 0 && (
                  <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:1 }}>
                    {dayEvents.slice(0, 2).map(ev => {
                      const isAssigned = isWorker && (ev.assignedWorkers || []).includes(user?.uid)
                      const dotColor = ev.type === 'installation' ? '#7c6fcd' : isWorker ? (isAssigned ? 'var(--accent)' : 'var(--blue)') : 'var(--accent)'
                      return (
                        <span key={ev.id} style={{
                          display:'flex', alignItems:'center', gap:3,
                          fontSize:8.5, fontWeight:700, lineHeight:1.2, color:'var(--text)',
                          maxWidth:'100%', opacity: isPast ? 0.55 : 1,
                        }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', flexShrink:0, background:dotColor }} />
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</span>
                        </span>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <span style={{ fontSize:8, fontWeight:700, color:'var(--text3)' }}>+{dayEvents.length - 2}</span>
                    )}
                  </div>
                )}
                {/* Puntini secondari: fasi + eventi Google Calendar */}
                {((phasesByDate[dStr]?.length > 0) || dayGoogleEvents.length > 0) && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center', marginTop:'auto' }}>
                    {dayGoogleEvents.length > 0 && (
                      <span style={{ width:6, height:6, borderRadius:2, flexShrink:0, background:'#4285F4', opacity: isPast ? 0.55 : 1 }} />
                    )}
                    {(phasesByDate[dStr] || []).slice(0, 2).map((p, i) => (
                      <span key={`ph${i}`} style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: p.color, opacity: isPast ? 0.55 : 1 }} />
                    ))}
                  </div>
                )}
                {/* Striscia solo per la mia assenza */}
                {hasMyAbsence && (
                  <div style={{
                    position:'absolute', inset:0,
                    background:'repeating-linear-gradient(-50deg, rgba(144,144,176,0.18) 0px, rgba(144,144,176,0.18) 1.5px, transparent 1.5px, transparent 6px)',
                    pointerEvents:'none',
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Legenda */}
        <div style={{ display:'flex', gap:12, marginTop:14, paddingLeft:4, flexWrap:'wrap' }}>
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
            <span style={{ width:10, height:10, borderRadius:2, background:'repeating-linear-gradient(-50deg, rgba(144,144,176,0.45) 0px, rgba(144,144,176,0.45) 1.5px, transparent 1.5px, transparent 5px)', border:'1px solid rgba(144,144,176,0.3)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>La mia assenza</span>
          </div>
        </div>
      </div>
      )}

      {/* Pannello giorno selezionato — qui il testo è leggibile per intero */}
      {mode === 'grid' && selectedDate && (
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
            {selectedDateObj.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })}
            {selectedDate === todayStr && ' · Oggi'}
          </p>
          {selectedEvents.length === 0 && selectedPhaseEvents.length === 0 && selectedGoogleEvents.length === 0 ? (
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
                      <div style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                        <EditButton onClick={e => openEdit(e, ev)} size={32} />
                        <DeleteButton onClick={e => deleteEvent(e, ev)} size={32} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Eventi importati da Google Calendar (sola lettura) */}
          {selectedGoogleEvents.length > 0 && (
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Da Google Calendar</p>
              {selectedGoogleEvents.map(ev => (
                <div key={ev.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(66,133,244,0.06)', border:'1px solid rgba(66,133,244,0.22)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ width:9, height:9, borderRadius:2, flexShrink:0, background:'#4285F4' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</p>
                  </div>
                </div>
              ))}
            </div>
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

      {/* Vista "Assegna personale" — striscia worker draggable/tap + lista eventi del mese come drop target */}
      {mode === 'assign' && (
        <>
          <div style={{ padding:'14px 16px 4px' }}>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
              Worker {selectedWorkerId ? '— tocca un evento qui sotto per assegnare' : ''}
            </p>
            <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:8, WebkitOverflowScrolling:'touch' }}>
              {workers.filter(w => w.active !== false).length === 0 && (
                <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>Nessun worker attivo.</p>
              )}
              {workers.filter(w => w.active !== false).map(w => {
                const isSelected = selectedWorkerId === w.id
                return (
                  <button key={w.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', w.id)}
                    onClick={() => setSelectedWorkerId(id => id === w.id ? null : w.id)}
                    style={{
                      flexShrink:0, display:'flex', alignItems:'center', gap:6,
                      padding:'8px 14px', borderRadius:20,
                      background: isSelected ? 'rgba(216,56,63,0.12)' : 'var(--card)',
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      boxShadow: isSelected ? '0 0 0 3px rgba(216,56,63,0.15)' : 'none',
                      fontSize:13, fontWeight:700, color: isSelected ? 'var(--accent)' : 'var(--text)',
                      cursor:'grab', whiteSpace:'nowrap',
                    }}
                  >
                    👷 {w.name || 'Senza nome'}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ padding:'8px 16px 24px' }}>
            <button onClick={() => setShowPastAssign(v => !v)}
              style={{ background: showPastAssign ? 'var(--card2)' : 'transparent', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, marginBottom:10 }}>
              {showPastAssign ? '✓ ' : ''}Vedi passati
            </button>
            {monthEvents.length === 0 ? (
              <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'20px 0', textAlign:'center' }}>
                Nessun evento{showPastAssign ? '' : ' futuro'} in {MONTHS[cursor.month]}.
              </p>
            ) : monthEvents.map(ev => {
              const assigned = (ev.assignedWorkers || []).map(wid => workers.find(w => w.id === wid)).filter(Boolean)
              const isDragOver = dragOverEventId === ev.id
              return (
                <div key={ev.id}
                  onDragOver={e => e.preventDefault()}
                  onDragEnter={e => { e.preventDefault(); setDragOverEventId(ev.id) }}
                  onDragLeave={() => setDragOverEventId(id => id === ev.id ? null : id)}
                  onDrop={e => { e.preventDefault(); setDragOverEventId(null); handleAssign(ev, e.dataTransfer.getData('text/plain')) }}
                  onClick={() => { if (selectedWorkerId) handleAssign(ev, selectedWorkerId) }}
                  style={{
                    background: isDragOver ? 'rgba(216,56,63,0.06)' : 'var(--card)',
                    border: isDragOver ? '2px dashed var(--accent)' : '1px solid var(--border)',
                    borderRadius:14, padding:'13px 14px', marginBottom:8,
                    cursor: selectedWorkerId ? 'pointer' : 'default',
                    transition:'background 0.15s, border-color 0.15s',
                  }}
                >
                  <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
                    {ev.type === 'installation' && <Wrench size={13} />}{ev.name}
                  </p>
                  <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
                    {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long' })}
                    {ev.dateEnd && ev.dateEnd !== ev.date ? ` → ${new Date(ev.dateEnd + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long' })}` : ''}
                  </p>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:8 }}>
                    {assigned.length === 0 && <span style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>Nessuno assegnato</span>}
                    {assigned.map(w => {
                      const unavail = isWorkerUnavailable(w.id, ev, unavailability)
                      return (
                        <span key={w.id} style={{ display:'inline-flex', alignItems:'center', gap:5, background: unavail ? 'rgba(216,56,63,0.12)' : 'rgba(79,195,247,0.12)', border: `1px solid ${unavail ? 'rgba(216,56,63,0.35)' : 'rgba(79,195,247,0.3)'}`, borderRadius:20, padding:'3px 6px 3px 10px', fontSize:12, fontWeight:700, color: unavail ? 'var(--red)' : 'var(--blue)' }}>
                          {unavail ? '⚠️' : '👷'} {w.name || 'Senza nome'}
                          <button onClick={e => { e.stopPropagation(); handleAssign(ev, w.id) }} style={{ width:16, height:16, borderRadius:'50%', background: unavail ? 'rgba(216,56,63,0.2)' : 'rgba(79,195,247,0.25)', color: unavail ? 'var(--red)' : 'var(--blue)', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* FAB nuovo evento — solo in vista griglia, in "Assegna personale" lascia spazio alla lista */}
      {mode === 'grid' && (
      <button
        onClick={() => {
          setEditForm({ name:'', date: selectedDate || todayStr, dateEnd:'', location:'', notes:'', phases:{} })
          setShowCreate(true)
        }}
        style={{
          position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 132px)', right:20, zIndex:50,
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
      )}

      {/* Modal segnala assenza */}
      {showAbsenceModal && (
        <div className={`modal-overlay${absenceDrag.closing ? ' closing' : ''}`} onClick={absenceDrag.onOverlayClick}>
          <div className={`modal${absenceDrag.jiggling ? ' modal-jiggle' : ''}${absenceDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...absenceDrag.props}>
            <button className="close-btn" onClick={absenceDrag.close}>✕</button>
            <h2>🚫 Segnala assenza</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>Indica i giorni in cui non sei disponibile. Apparirà nel calendario e negli avvisi di assegnazione evento.</p>
            <div className="form-group">
              <label>Primo giorno *</label>
              <DateField value={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({...f, startDate:v, endDate: f.endDate < v ? v : f.endDate}))} />
            </div>
            <div className="form-group">
              <label>Ultimo giorno <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(lascia vuoto se un solo giorno)</span></label>
              <DateField value={absenceForm.endDate} min={absenceForm.startDate} clearable placeholder="Un solo giorno" onChange={v => setAbsenceForm(f => ({...f, endDate:v}))} />
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

      {/* Modal crea evento */}
      {showCreate && (
        <div className={`modal-overlay${createDrag.closing ? ' closing' : ''}`} onClick={createDrag.onOverlayClick}>
          <div className={`modal${createDrag.jiggling ? ' modal-jiggle' : ''}${createDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...createDrag.props}>
            <button className="close-btn" onClick={createDrag.close}>✕</button>
            <h2>Nuovo evento</h2>
            <div className="form-group">
              <label>Nome evento *</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({...f, name:e.target.value}))} placeholder="es. Matrimonio Rossi" />
            </div>
            <div className="form-group">
              <label>Data inizio *</label>
              <DateField value={editForm.date} onChange={v => setEditForm(f => ({...f, date:v}))} />
            </div>
            <div className="form-group">
              <label>Data fine <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              <DateField value={editForm.dateEnd||''} min={editForm.date} clearable placeholder="Nessuna" onChange={v => setEditForm(f => ({...f, dateEnd:v}))} />
            </div>
            <div className="form-group">
              <label>Fasi <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              {PHASE_FORM_CONFIG.map(p => (
                <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                  <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <DateField value={editForm.phases?.[p.key]||''} clearable placeholder="—"
                      onChange={v => setEditForm(f => { const ph={...(f.phases||{})}; if (v) ph[p.key]=v; else delete ph[p.key]; return {...f, phases:ph} })} />
                  </div>
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
            <button onClick={createEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={creating || !editForm.name?.trim() || !editForm.date}>
              {creating ? 'Creazione...' : 'Crea evento'}
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
              <DateField value={editForm.date} onChange={v => setEditForm(f => ({...f, date:v}))} />
            </div>
            <div className="form-group">
              <label>Data fine <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              <DateField value={editForm.dateEnd||''} min={editForm.date} clearable placeholder="Nessuna" onChange={v => setEditForm(f => ({...f, dateEnd:v}))} />
            </div>
            <div className="form-group">
              <label>Fasi <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>(opzionale)</span></label>
              {PHASE_FORM_CONFIG.map(p => (
                <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:7 }}>
                  <span style={{ background:p.bg, color:p.color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:800, minWidth:82, textAlign:'center', flexShrink:0 }}>{p.label}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <DateField value={editForm.phases?.[p.key]||''} clearable placeholder="—"
                      onChange={v => setEditForm(f => { const ph={...(f.phases||{})}; if (v) ph[p.key]=v; else delete ph[p.key]; return {...f, phases:ph} })} />
                  </div>
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
