import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, where, serverTimestamp } from 'firebase/firestore'
import { Pin, User, Calendar, Wrench, Check } from '../components/Icon'
import { useSwipeMonth } from '../hooks/useSwipeMonth'

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false, dateObj: new Date(year, month - 1, daysInPrevMonth - i) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateObj: new Date(year, month, d) })
  }
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

export default function WorkerCalendar() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const today = new Date()
  const todayStr = toDateStr(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [allEvents, setAllEvents] = useState([])
  const [googleEvents, setGoogleEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // Flusso "Segnala assenza"
  const [reportMode, setReportMode] = useState(false)
  const [rangeStart, setRangeStart] = useState(null)
  const [pendingRange, setPendingRange] = useState(null)
  const [reasonInput, setReasonInput] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => {
      setAllEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'unavailability'), where('workerId', '==', user.uid))
    return onSnapshot(q, snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  // Eventi importati da Google Calendar (sync giornaliero in sola lettura, vedi /api/sync-google-calendar)
  useEffect(() => {
    const q = query(collection(db, 'googleCalendarEvents'), orderBy('date'))
    return onSnapshot(q, snap => {
      setGoogleEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // ESC chiude il modal di conferma assenza
  useEffect(() => {
    if (!pendingRange) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setPendingRange(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingRange])

  const cells = getMonthGrid(cursor.year, cursor.month)

  const isAssignedToMe = (ev) => (ev.assignedWorkers || []).includes(user?.uid)
  const isUnavailable = (dStr) => unavailability.some(u => dStr >= u.startDate && dStr <= u.endDate)

  const PHASE_META = {
    montaggio:  { color: '#2563eb', label: 'Montaggio' },
    smontaggio: { color: '#ea580c', label: 'Smontaggio' },
  }

  // Tutti gli "elementi" che toccano un giorno: l'evento (data inizio) + le fasi
  // (montaggio/smontaggio). Colore ROSSO se l'evento è assegnato a questo worker,
  // altrimenti blu (evento azienda) o il colore della fase.
  const dayItems = (dStr) => {
    const items = []
    allEvents.forEach(e => {
      if (!e.date) return
      const assigned = isAssignedToMe(e)
      const end = e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
      if (dStr >= e.date && dStr <= end) {
        items.push({ event: e, assigned, color: assigned ? 'var(--accent)' : 'var(--blue)' })
      }
      if (e.phases) {
        Object.entries(e.phases).forEach(([k, v]) => {
          if (v === dStr && PHASE_META[k]) {
            items.push({ event: e, assigned, color: assigned ? 'var(--accent)' : PHASE_META[k].color, phaseLabel: PHASE_META[k].label, phaseColor: PHASE_META[k].color })
          }
        })
      }
    })
    return items
  }

  // Eventi Google Calendar che toccano un giorno (multi-giorno se dateEnd è impostata)
  const dayGoogleEvents = (dStr) => googleEvents.filter(e => {
    if (!e.date) return false
    const end = e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
    return dStr >= e.date && dStr <= end
  })

  const goPrevMonth = () => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  const goNextMonth = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  const goToday = () => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDate(todayStr) }
  const swipeMonth = useSwipeMonth(goPrevMonth, goNextMonth)

  const startReportMode = () => {
    setReportMode(true)
    setRangeStart(null)
    setSelectedDate(null)
  }
  const cancelReportMode = () => {
    setReportMode(false)
    setRangeStart(null)
    setSelectedDate(todayStr)
  }

  const handleDayTap = (dStr, isPast) => {
    if (isPast) return

    if (reportMode) {
      if (!rangeStart) {
        setRangeStart(dStr)
      } else {
        const start = dStr < rangeStart ? dStr : rangeStart
        const end   = dStr < rangeStart ? rangeStart : dStr
        setPendingRange({ start, end })
        setReportMode(false)
        setRangeStart(null)
      }
    } else {
      setSelectedDate(dStr)
    }
  }

  const confirmUnavailability = async () => {
    if (!pendingRange || !user) return
    await addDoc(collection(db, 'unavailability'), {
      workerId: user.uid,
      startDate: pendingRange.start,
      endDate: pendingRange.end,
      reason: reasonInput.trim() || null,
      createdAt: serverTimestamp(),
    })
    setPendingRange(null)
    setReasonInput('')
    setSelectedDate(todayStr)
  }

  const removeUnavailability = async (id) => {
    if (!(await confirm({ title: 'Rimuovi indisponibilità', message: 'Rimuovere questo periodo di indisponibilità?', confirmLabel: 'Rimuovi', danger: true }))) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  const sortedUnavailability = [...unavailability].sort((a,b) => a.startDate.localeCompare(b.startDate))
  const selectedItems = selectedDate ? dayItems(selectedDate) : []
  const selectedEvents = (() => {
    const m = new Map()
    selectedItems.forEach(it => {
      const cur = m.get(it.event.id) || { event: it.event, assigned: it.assigned, phases: [] }
      if (it.phaseLabel) cur.phases.push({ label: it.phaseLabel, color: it.phaseColor })
      m.set(it.event.id, cur)
    })
    return [...m.values()]
  })()
  const selectedGoogleEvents = selectedDate ? dayGoogleEvents(selectedDate) : []
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

  return (
    <div className="page" style={{ paddingBottom:90 }}>
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>Il mio calendario</h1>
            <p>{allEvents.filter(isAssignedToMe).length} eventi assegnati a te</p>
          </div>
          {!reportMode && (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={startReportMode}
                style={{ background:'rgba(144,144,176,0.12)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:600 }}>
                🚫 Assenza
              </button>
              <button onClick={goToday} className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>Oggi</button>
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14 }}>
          <button onClick={goPrevMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>‹</button>
          <h2 style={{ fontSize:17, fontWeight:800 }}>{MONTHS[cursor.month]} {cursor.year}</h2>
          <button onClick={goNextMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>›</button>
        </div>

        {/* Banner modalità selezione assenza */}
        {reportMode && (
          <div style={{ marginTop:14, background:'rgba(216,56,63,0.08)', border:'1px solid rgba(216,56,63,0.3)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--accent)', fontWeight:600, lineHeight:1.4, display:'flex', alignItems:'center', gap:7 }}>
              <Calendar size={15} /> {!rangeStart ? 'Tocca il primo giorno della tua assenza' : 'Tocca l\'ultimo giorno (o lo stesso per un solo giorno)'}
            </p>
            <button onClick={cancelReportMode} style={{ color:'var(--text2)', fontSize:13, fontWeight:700, flexShrink:0 }}>Annulla</button>
          </div>
        )}
      </div>

      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text2)', padding:'6px 0' }}>{w}</div>
          ))}
        </div>

        <div key={`${cursor.year}-${cursor.month}`} className="cal-grid-swipe" {...swipeMonth} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
          {cells.map((cell, i) => {
            const dStr = toDateStr(cell.dateObj)
            const items = dayItems(dStr)
            const googleItems = dayGoogleEvents(dStr)
            const hasMyEvent = items.some(it => it.assigned)
            const unavail = isUnavailable(dStr)
            const isToday = dStr === todayStr
            const isPast = dStr < todayStr
            const isSelected = !reportMode && dStr === selectedDate
            const isRangeStart = reportMode && dStr === rangeStart

            let bg = cell.current ? 'var(--card)' : 'transparent'
            let border = isToday ? '1.5px solid rgba(216,56,63,0.4)' : '1px solid var(--border)'
            if (hasMyEvent) { bg = 'rgba(216,56,63,0.12)'; border = '1.5px solid var(--accent)' }
            if (isSelected) { bg = 'rgba(79,195,247,0.10)'; border = '1.5px solid var(--blue)' }
            if (isRangeStart) { border = '1.5px solid var(--accent)' }

            return (
              <button
                key={i}
                onClick={() => cell.current && handleDayTap(dStr, isPast)}
                disabled={!cell.current || isPast}
                style={{
                  position:'relative',
                  minHeight:52,
                  borderRadius:10,
                  padding:'5px 3px',
                  background: bg,
                  border,
                  opacity: cell.current ? (isPast ? 0.45 : 1) : 0.3,
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  gap:4,
                  overflow:'hidden',
                  cursor: cell.current && !isPast ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  fontSize:13, fontWeight: isToday || hasMyEvent ? 800 : 600,
                  color: hasMyEvent ? 'var(--accent)' : isToday ? 'var(--accent)' : (cell.current ? 'var(--text)' : 'var(--text3)'),
                }}>
                  {cell.day}
                </span>
                {(items.length > 0 || googleItems.length > 0) && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center', maxWidth:32 }}>
                    {googleItems.length > 0 && (
                      <span style={{ width:7, height:7, borderRadius:2, flexShrink:0, background:'#4285F4', opacity: isPast ? 0.55 : 1 }} />
                    )}
                    {items.slice(0, 4).map((it, i) => (
                      <span key={i} style={{
                        width:7, height:7, borderRadius:'50%', flexShrink:0,
                        background: it.color,
                        opacity: isPast ? 0.55 : 1,
                      }} />
                    ))}
                  </div>
                )}
                {unavail && (
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

        <div style={{ display:'flex', gap:14, marginTop:14, paddingLeft:4, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--blue)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Eventi azienda</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Assegnati a te</span>
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
            <span style={{ fontSize:12, color:'var(--text2)' }}>Non disponibile</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:'#4285F4', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Da Google Calendar</span>
          </div>
        </div>
      </div>

      {/* Pannello giorno selezionato (solo fuori da reportMode) */}
      {!reportMode && selectedDate && (
        <div style={{ padding:'8px 16px 16px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
            {selectedDateObj.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })}
            {selectedDate === todayStr && ' · Oggi'}
          </p>
          {selectedEvents.length === 0 && selectedGoogleEvents.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'8px 0' }}>Nessun evento in questo giorno.</p>
          ) : (
            selectedEvents.map(({ event: ev, assigned: mine, phases }) => (
                <div
                  key={ev.id}
                  onClick={() => navigate(`/events/${ev.id}`)}
                  style={{
                    display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                    background: mine ? 'rgba(216,56,63,0.06)' : 'var(--card)',
                    border: `1px solid ${mine ? 'rgba(216,56,63,0.3)' : 'var(--border)'}`, borderRadius:14,
                    padding:'13px 14px', marginBottom:8,
                  }}
                >
                  <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: mine ? 'var(--accent)' : 'var(--blue)' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                      {ev.type === 'installation' && <Wrench size={13} />}{ev.name}
                    </p>
                    {ev.location && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
                    {phases.length > 0 && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:5 }}>
                        {phases.map((p, i) => (
                          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5, background:p.color+'18', color:p.color, border:`1px solid ${p.color}44`, borderRadius:6, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:p.color }} /> {p.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {mine && <p style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginTop:4, display:'flex', alignItems:'center', gap:4 }}><User size={12} /> Assegnato a te</p>}
                  </div>
                  <span style={{ color:'var(--text3)', fontSize:20, flexShrink:0 }}>›</span>
                </div>
              ))
          )}
          {selectedGoogleEvents.length > 0 && (
            <div style={{ marginTop: selectedEvents.length > 0 ? 14 : 0 }}>
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
        </div>
      )}

      {/* Lista indisponibilità */}
      {sortedUnavailability.length > 0 && (
        <div style={{ padding:'8px 16px 24px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Le mie indisponibilità</p>
          {sortedUnavailability.map(u => (
            <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>🚫</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>
                  {u.startDate === u.endDate
                    ? new Date(u.startDate+'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })
                    : `${new Date(u.startDate+'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'short' })} → ${new Date(u.endDate+'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'numeric' })}`
                  }
                </p>
                {u.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{u.reason}</p>}
              </div>
              <button onClick={() => removeUnavailability(u.id)}
                style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700, flexShrink:0 }}>
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal conferma nuova indisponibilità */}
      {pendingRange && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPendingRange(null)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setPendingRange(null)}>✕</button>
            <h2>🚫 Segnala assenza</h2>
            <p style={{ color:'var(--text2)', fontSize:14, marginBottom:16 }}>
              {pendingRange.start === pendingRange.end
                ? new Date(pendingRange.start).toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' })
                : `Dal ${new Date(pendingRange.start).toLocaleDateString('it-IT', { day:'numeric', month:'short' })} al ${new Date(pendingRange.end).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'numeric' })}`
              }
            </p>
            <div className="form-group">
              <label>Motivo (opzionale)</label>
              <input value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder="es. Ferie, visita medica..." />
            </div>
            <button onClick={confirmUnavailability} className="btn btn-primary btn-full" style={{ marginTop:8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              <Check size={16} /> Confermo assenza
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
