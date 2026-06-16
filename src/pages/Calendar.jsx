import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

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
  const today = new Date()
  const todayStr = toDateStr(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [events, setEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [workers, setWorkers] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)

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
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.role === 'worker'))
    })
  }, [])

  const cells = getMonthGrid(cursor.year, cursor.month)

  // Raggruppa eventi per data (solo il giorno di inizio, come da scelta)
  const eventsByDate = {}
  events.forEach(e => {
    if (!e.date) return
    if (!eventsByDate[e.date]) eventsByDate[e.date] = []
    eventsByDate[e.date].push(e)
  })

  const goPrevMonth = () => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  const goNextMonth = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  const goToday = () => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDate(todayStr) }

  const absencesOnDate = (dStr) => unavailability
    .filter(u => dStr >= u.startDate && dStr <= u.endDate)
    .map(u => ({ ...u, workerName: workers.find(w => w.id === u.workerId)?.name || 'Sconosciuto' }))

  const selectedEvents = eventsByDate[selectedDate] || []
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
          <button onClick={goToday} className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>Oggi</button>
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
                {/* Puntini: max 4 visibili (eventi), poi puntino grigio se ci sono assenze */}
                {(dayEvents.length > 0 || dayAbsences.length > 0) && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center', maxWidth:32 }}>
                    {dayEvents.slice(0, 4).map(ev => (
                      <span key={ev.id} style={{
                        width:7, height:7, borderRadius:'50%', flexShrink:0,
                        background: ev.type === 'installation' ? '#7c6fcd' : 'var(--accent)',
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
        <div style={{ display:'flex', gap:16, marginTop:14, paddingLeft:4, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Eventi</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#7c6fcd', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>Installazioni</span>
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
          {selectedEvents.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'8px 0' }}>Nessun evento in questo giorno.</p>
          ) : (
            selectedEvents.map(ev => (
              <div
                key={ev.id}
                onClick={() => navigate(`/events/${ev.id}`)}
                style={{
                  display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                  background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
                  padding:'13px 14px', marginBottom:8,
                }}
              >
                <span style={{
                  width:10, height:10, borderRadius:'50%', flexShrink:0,
                  background: ev.type === 'installation' ? '#7c6fcd' : 'var(--accent)',
                }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ev.type === 'installation' ? '🔧 ' : ''}{ev.name}
                  </p>
                  {ev.location && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>📍 {ev.location}</p>}
                </div>
                <span style={{ color:'var(--text3)', fontSize:20, flexShrink:0 }}>›</span>
              </div>
            ))
          )}

          {/* Assenze worker in questo giorno */}
          {selectedAbsences.length > 0 && (
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>🚫 Assenti</p>
              {selectedAbsences.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>👷</span>
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
        </div>
      )}

      {/* FAB nuovo evento */}
      <button
        onClick={() => navigate('/events', { state: { openNewEvent: true } })}
        style={{
          position:'fixed', bottom:88, right:20, zIndex:50,
          width:56, height:56, borderRadius:'50%',
          background:'var(--accent)', color:'white',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:28, fontWeight:400, lineHeight:1,
          boxShadow:'0 4px 16px rgba(216,56,63,0.4)',
          border:'none',
        }}
      >
        +
      </button>
    </div>
  )
}
