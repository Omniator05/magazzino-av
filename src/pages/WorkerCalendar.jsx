import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, serverTimestamp } from 'firebase/firestore'
import { Pin, User, Calendar, Wrench, Check, List } from '../components/Icon'
import { useSwipeMonth } from '../hooks/useSwipeMonth'
import { formatDate, capitalize } from '../utils/formatDate'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import DateField from '../components/DateField'
import Toast from '../components/Toast'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { awaitIfOnline } from '../utils/offlineSave'
import SegmentedControl from '../components/SegmentedControl'
import AbsenceTypeBadge, { absenceTypeOptions } from '../components/AbsenceTypeBadge'

// Lun→Dom a partire da un lunedì noto: dà le iniziali dei giorni nella lingua attiva
const WEEKDAY_ANCHOR = new Date(2024, 0, 1)
function getWeekdayLabels(lang) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(WEEKDAY_ANCHOR)
    d.setDate(WEEKDAY_ANCHOR.getDate() + i)
    return formatDate(d, { weekday: 'narrow' }, lang)
  })
}

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
  const { t, i18n } = useTranslation()
  const { user, profile, teamId } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const today = new Date()
  const todayStr = toDateStr(today)
  const WEEKDAYS = getWeekdayLabels(i18n.language)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [allEvents, setAllEvents] = useState([])
  const [googleEvents, setGoogleEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Flusso "Segnala assenza"
  const [reportMode, setReportMode] = useState(false)
  const [rangeStart, setRangeStart] = useState(null)
  const [hoverDate, setHoverDate] = useState(null) // anteprima range stile "booking" al passaggio del mouse
  const [pendingRange, setPendingRange] = useState(null)
  const [reasonInput, setReasonInput] = useState('')
  const [typeInput, setTypeInput] = useState('ferie')
  const [editingId, setEditingId] = useState(null)
  const [savingUnavail, setSavingUnavail] = useState(false)
  const [unavailOpen, setUnavailOpen] = useState(false)
  useModalScrollLock(!!pendingRange)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => {
      setAllEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived))
    })
  }, [teamId])

  useEffect(() => {
    if (!user || !teamId) return
    const q = query(collection(db, 'unavailability'), where('teamId', '==', teamId), where('workerId', '==', user.uid))
    return onSnapshot(q, snap => {
      setUnavailability(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [user, teamId])

  // Eventi importati da Google Calendar (sync giornaliero in sola lettura, vedi /api/sync-google-calendar)
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'googleCalendarEvents'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => {
      setGoogleEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [teamId])

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
    montaggio:  { color: '#2563eb', label: t('calendar.legendAssembly') },
    smontaggio: { color: '#ea580c', label: t('calendar.legendDisassembly') },
  }

  // Tutti gli "elementi" che toccano un giorno: l'evento (data inizio) + le fasi
  // (montaggio/smontaggio). Per un magazziniere il colore del PUNTINO conta
  // una cosa sola — rosso se assegnato a lui, blu altrimenti — anche nei
  // giorni di sola fase: niente colori extra per montaggio/smontaggio senza
  // una legenda che li spieghi. `phaseLabel`/`phaseColor` restano comunque
  // sull'item: servono al badge testuale (già autoesplicativo, ha la scritta)
  // nel pannello del giorno selezionato più sotto, non al puntino nella griglia.
  const dayItems = (dStr) => {
    const items = []
    allEvents.forEach(e => {
      if (!e.date) return
      const assigned = isAssignedToMe(e)
      const color = assigned ? 'var(--accent)' : 'var(--blue)'
      const end = e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
      if (dStr >= e.date && dStr <= end) {
        items.push({ event: e, assigned, color })
      }
      if (e.phases) {
        Object.entries(e.phases).forEach(([k, v]) => {
          if (v === dStr && PHASE_META[k]) {
            items.push({ event: e, assigned, color, phaseLabel: PHASE_META[k].label, phaseColor: PHASE_META[k].color })
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
    setHoverDate(null)
    setSelectedDate(null)
  }
  const cancelReportMode = () => {
    setReportMode(false)
    setRangeStart(null)
    setHoverDate(null)
    setSelectedDate(todayStr)
  }

  const handleDayTap = (dStr) => {
    if (reportMode) {
      if (!rangeStart) {
        setRangeStart(dStr)
      } else {
        const start = dStr < rangeStart ? dStr : rangeStart
        const end   = dStr < rangeStart ? rangeStart : dStr
        setPendingRange({ start, end })
        setReportMode(false)
        setRangeStart(null)
        setHoverDate(null)
      }
    } else {
      setSelectedDate(dStr)
    }
  }

  const confirmUnavailability = async () => {
    if (!pendingRange || !user) return
    setSavingUnavail(true)
    try {
      const data = {
        startDate: pendingRange.start,
        endDate: pendingRange.end,
        reason: reasonInput.trim(),
        type: typeInput || 'altro',
      }
      if (editingId) {
        // awaitIfOnline: offline non aspettiamo la conferma del server
        // (arriva solo al ritorno della rete) — il dato è già in coda in
        // locale, il modal si chiude subito con un avviso invece di
        // restare bloccato.
        await awaitIfOnline(updateDoc(doc(db, 'unavailability', editingId), data), isOnline)
      } else {
        await awaitIfOnline(addDoc(collection(db, 'unavailability'), {
          ...data, workerId: user.uid, teamId, createdAt: serverTimestamp(),
        }), isOnline)
        // Avvisa l'admin (badge in-app + email best-effort) — stesso
        // meccanismo di Calendar.jsx (lì serve solo quando è un worker a
        // segnalare, qui siamo sempre un worker).
        await awaitIfOnline(addDoc(collection(db, 'notifications'), {
          teamId, type: 'absence',
          workerName: profile?.name || profile?.username || t('common.noName'),
          startDate: data.startDate, endDate: data.endDate, reason: data.reason,
          seenBy: [], createdAt: serverTimestamp(),
        }), isOnline)
        // Email best-effort, solo se online — offline non c'è comunque
        // rete per inviarla, e aspettare getIdToken()/fetch senza
        // connessione bloccherebbe la chiusura del modal. L'admin la vede
        // in app al prossimo accesso (sopra) anche senza questa email.
        if (isOnline) {
          try {
            const idToken = await user.getIdToken()
            await fetch('/api/send-absence-notification', {
              method: 'POST',
              headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workerName: profile?.name || profile?.username || t('common.noName'),
                startDate: data.startDate, endDate: data.endDate, reason: data.reason,
              }),
            })
          } catch {}
        }
      }
      if (!isOnline) showToast(t('common.savedOfflineToast'))
      setPendingRange(null)
      setReasonInput('')
      setTypeInput('ferie')
      setEditingId(null)
      setSelectedDate(todayStr)
    } finally { setSavingUnavail(false) }
  }

  const openEditAbsence = (u) => {
    setEditingId(u.id)
    setPendingRange({ start: u.startDate, end: u.endDate })
    setReasonInput(u.reason || '')
    setTypeInput(u.type || 'altro')
  }

  const closeAbsenceModal = () => {
    setPendingRange(null)
    setReasonInput('')
    setTypeInput('ferie')
    setEditingId(null)
  }

  const absenceDrag = useModalDrag(closeAbsenceModal, undefined, confirmUnavailability, !!pendingRange)

  const removeUnavailability = async (id) => {
    if (!(await confirm({ title: t('workerCalendar.confirmRemoveTitle'), message: t('workerCalendar.confirmRemoveMessage'), confirmLabel: t('workerCalendar.confirmRemoveLabel'), danger: true }))) return
    await deleteDoc(doc(db, 'unavailability', id))
  }

  // Anche quelle passate: altrimenti non c'è più modo di correggere data o
  // motivo di un'assenza sbagliata una volta finita — stesso motivo di
  // Calendar.jsx (myAbsences) lato admin. La lista resta comunque chiusa di
  // default (unavailOpen), quindi non allunga la pagina.
  const sortedUnavailability = [...unavailability]
    .sort((a,b) => a.startDate.localeCompare(b.startDate))
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
      <Toast message={toast} />
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>{t('workerCalendar.title')}</h1>
            <p>{t('workerCalendar.assignedCount', { count: allEvents.filter(isAssignedToMe).length })}</p>
          </div>
          {!reportMode && (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={startReportMode}
                style={{ background:'rgba(144,144,176,0.12)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:10, padding:'8px 12px', fontSize:13, fontWeight:600 }}>
                {t('workerCalendar.reportAbsence')}
              </button>
              <button onClick={goToday} className="btn btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>{t('calendar.today')}</button>
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14 }}>
          <button onClick={goPrevMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>‹</button>
          <h2 style={{ fontSize:17, fontWeight:800 }}>{capitalize(formatDate(new Date(cursor.year, cursor.month, 1), { month:'long' }, i18n.language))} {cursor.year}</h2>
          <button onClick={goNextMonth} style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--text)' }}>›</button>
        </div>

        {/* Banner modalità selezione assenza */}
        {reportMode && (
          <div style={{ marginTop:14, background:'rgba(216,56,63,0.08)', border:'1px solid rgba(216,56,63,0.3)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--accent)', fontWeight:600, lineHeight:1.4, display:'flex', alignItems:'center', gap:7 }}>
              <Calendar size={15} /> {!rangeStart ? t('calendar.tapFirstDay') : t('calendar.tapLastDay')}
            </p>
            {/* Stessa pillola (sfondo + angoli arrotondati) del bottone admin
                equivalente in Calendar.jsx: senza background/border-radius
                propri, l'hover globale ci disegnava sopra un'ombra ad angoli
                vivi — "quadrata" — invece di seguire una forma arrotondata. */}
            <button onClick={cancelReportMode} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'6px 12px', fontSize:13, fontWeight:700, flexShrink:0 }}>{t('common.cancel')}</button>
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
            // Anteprima range stile "booking" mentre passi il mouse dopo aver
            // scelto il primo giorno — stessa logica di Calendar.jsx lato admin.
            const isInPreviewRange = reportMode && rangeStart && hoverDate && !isRangeStart &&
              dStr >= (rangeStart <= hoverDate ? rangeStart : hoverDate) &&
              dStr <= (rangeStart <= hoverDate ? hoverDate : rangeStart)

            let bg = cell.current ? 'var(--card)' : 'transparent'
            let border = isToday ? '1.5px solid rgba(216,56,63,0.4)' : '1px solid var(--border)'
            if (hasMyEvent) { bg = 'rgba(216,56,63,0.12)'; border = '1.5px solid var(--accent)' }
            if (isSelected) { bg = 'rgba(79,195,247,0.10)'; border = '1.5px solid var(--blue)' }
            if (isInPreviewRange) { bg = 'rgba(216,56,63,0.07)'; border = '1px solid rgba(216,56,63,0.3)' }
            if (isRangeStart) { border = '1.5px solid var(--accent)' }

            return (
              <button
                key={i}
                onClick={() => handleDayTap(dStr)}
                onMouseEnter={() => { if (reportMode && rangeStart) setHoverDate(dStr) }}
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
                  cursor:'pointer',
                }}
              >
                <span style={{
                  fontSize:13, fontWeight: isToday || hasMyEvent ? 800 : 600,
                  color: hasMyEvent ? 'var(--accent)' : isToday ? 'var(--accent)' : (cell.current ? 'var(--text)' : 'var(--text3)'),
                }}>
                  {cell.day}
                </span>
                {/* Un puntino per elemento, tutti uguali (rosso/blu) — anche
                    gli eventi importati da Google diventano un puntino blu
                    come gli altri, non serve distinguerli qui. Container a
                    tutta larghezza invece di un max-width stretto: prima ci
                    stavano 3 puntini per riga, c'è spazio per il doppio. */}
                {(items.length > 0 || googleItems.length > 0) && (
                  <div style={{ display:'flex', gap:2, flexWrap:'wrap', justifyContent:'center', width:'100%' }}>
                    {items.map((it, i) => (
                      <span key={`e${i}`} style={{
                        width:5, height:5, borderRadius:'50%', flexShrink:0,
                        background: it.color,
                        opacity: isPast ? 0.55 : 1,
                      }} />
                    ))}
                    {googleItems.map((_, i) => (
                      <span key={`g${i}`} style={{ width:5, height:5, borderRadius:'50%', flexShrink:0, background:'var(--blue)', opacity: isPast ? 0.55 : 1 }} />
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
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('workerCalendar.legendCompanyEvents')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('workerCalendar.legendAssignedToYou')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:'repeating-linear-gradient(-50deg, rgba(144,144,176,0.45) 0px, rgba(144,144,176,0.45) 1.5px, transparent 1.5px, transparent 5px)', border:'1px solid rgba(144,144,176,0.3)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('workerCalendar.legendUnavailable')}</span>
          </div>
        </div>
      </div>

      {/* Pannello giorno selezionato (solo fuori da reportMode) */}
      {!reportMode && selectedDate && (
        <div style={{ padding:'8px 16px 16px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
            {formatDate(selectedDateObj, { weekday:'long', day:'numeric', month:'long' }, i18n.language)}
            {selectedDate === todayStr && ` · ${t('calendar.today')}`}
          </p>
          {selectedEvents.length === 0 && selectedGoogleEvents.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'8px 0' }}>{t('calendar.noEventsToday')}</p>
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
                    {mine && <p style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginTop:4, display:'flex', alignItems:'center', gap:4 }}><User size={12} /> {t('workerCalendar.assignedToYouInline')}</p>}
                  </div>
                  <span style={{ color:'var(--text3)', fontSize:20, flexShrink:0 }}>›</span>
                </div>
              ))
          )}
          {selectedGoogleEvents.length > 0 && (
            <div style={{ marginTop: selectedEvents.length > 0 ? 14 : 0 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('calendar.fromGoogleCalendar')}</p>
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

      {/* Lista indisponibilità — retraibile come "Le mie assenze" lato admin
          (Calendar.jsx): sono già filtrate a quelle non ancora passate, ma
          restando comunque chiusa di default non allunga la pagina ad ogni
          apertura del calendario. */}
      {sortedUnavailability.length > 0 && (
        <div style={{ padding:'8px 16px 24px' }}>
          <button onClick={() => setUnavailOpen(o => !o)} className="btn-no-anim" aria-expanded={unavailOpen}
            style={{ width:'auto', display:'inline-flex', alignItems:'center', gap:6, marginBottom: unavailOpen ? 10 : 0, background:'transparent', border:'none', padding:0 }}>
            <span style={{ color:'var(--text2)', display:'flex' }}><List size={13} /></span>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('workerCalendar.myUnavailability')}</span>
            <span style={{ background:'var(--bg3)', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700, color:'var(--text2)' }}>{sortedUnavailability.length}</span>
            <span style={{ color:'var(--text2)', display:'flex', transition:'transform 0.2s', transform: unavailOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
          </button>
          {unavailOpen && sortedUnavailability.map(u => (
            <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>🚫</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:13, color:'var(--text)', display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                  {u.startDate === u.endDate
                    ? formatDate(u.startDate+'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)
                    : `${formatDate(u.startDate+'T12:00:00', { day:'numeric', month:'short' }, i18n.language)} → ${formatDate(u.endDate+'T12:00:00', { day:'numeric', month:'short', year:'numeric' }, i18n.language)}`
                  }
                  <AbsenceTypeBadge type={u.type} />
                </p>
                {u.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{u.reason}</p>}
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={() => openEditAbsence(u)}
                  style={{ background:'rgba(79,195,247,0.12)', border:'1px solid rgba(79,195,247,0.3)', color:'var(--blue)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700 }}>
                  {t('common.edit')}
                </button>
                <button onClick={() => removeUnavailability(u.id)}
                  style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:700 }}>
                  {t('common.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal conferma nuova indisponibilità */}
      {pendingRange && (
        <div className={`modal-overlay${absenceDrag.closing ? ' closing' : ''}`} onClick={absenceDrag.onOverlayClick}>
          <div className={`modal${absenceDrag.jiggling ? ' modal-jiggle' : ''}${absenceDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...absenceDrag.props}>
            <button className="close-btn" onClick={absenceDrag.close} aria-label={t('common.close')}>✕</button>
            <h2>{editingId ? t('workerCalendar.editAbsenceTitle') : t('calendar.absenceModalTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('calendar.absenceModalDesc')}</p>
            {/* Stesso DateField (e stessa possibilità di correggere le date
                prima di confermare) sia per una nuova assenza sia in
                modifica — identico al flusso admin in Calendar.jsx. */}
            <div className="form-group">
              <label>{t('calendar.firstDay')}</label>
              <DateField value={pendingRange.start} onChange={v => setPendingRange(r => ({ start:v, end: r.end < v ? v : r.end }))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.lastDay')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('calendar.lastDayHint')}</span></label>
              <DateField value={pendingRange.end} min={pendingRange.start} onChange={v => setPendingRange(r => ({ ...r, end:v }))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.absenceTypeLabel')}</label>
              <SegmentedControl options={absenceTypeOptions(t)} value={typeInput} onChange={setTypeInput} />
            </div>
            <div className="form-group">
              <label>{t('calendar.reason')} {t('common.optional')}</label>
              <input value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder={t('workerCalendar.reasonPlaceholder')} />
            </div>
            <button onClick={confirmUnavailability} className="btn btn-primary btn-full" style={{ marginTop:8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
              disabled={savingUnavail || !pendingRange.start}>
              {savingUnavail ? t('common.saving') : <><Check size={16} /> {editingId ? t('common.save') : t('workerCalendar.confirmAbsence')}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
