import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore'
import EditButton from '../components/EditButton'
import DeleteButton from '../components/DeleteButton'
import { Pin, User, List, Wrench, Check, Search } from '../components/Icon'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useSwipeMonth } from '../hooks/useSwipeMonth'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import DateField from '../components/DateField'
import TimeField from '../components/TimeField'
import EventFormFields from '../components/EventFormFields'
import StaffTimeline from '../components/StaffTimeline'
import EventSummaryModal from '../components/EventSummaryModal'
import TaskSummaryModal from '../components/TaskSummaryModal'
import { deleteEventWithInventoryCheck } from '../utils/kitInventory'
import { notifyEventTimeChangedIfNeeded, notifyTeamPush } from '../utils/pushNotifications'
import { rememberEventManager } from '../utils/eventManagers'
import { formatDate, capitalize } from '../utils/formatDate'
import CreateEventFlow from '../components/CreateEventFlow'
import Toast from '../components/Toast'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { awaitIfOnline } from '../utils/offlineSave'
import SegmentedControl from '../components/SegmentedControl'
import AbsenceTypeBadge, { absenceTypeOptions } from '../components/AbsenceTypeBadge'
import CalendarSidePanel from '../components/CalendarSidePanel'

// Lun→Dom a partire da un lunedì noto: dà le iniziali dei giorni nella lingua attiva
const WEEKDAY_ANCHOR = new Date(2024, 0, 1)
function getWeekdayLabels(lang) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(WEEKDAY_ANCHOR)
    d.setDate(WEEKDAY_ANCHOR.getDate() + i)
    return formatDate(d, { weekday: 'narrow' }, lang)
  })
}

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
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, profile, isWorker, isAdmin, teamId } = useAuth()
  const confirm = useConfirm()
  const isOnline = useOnlineStatus()
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }
  const WEEKDAYS = getWeekdayLabels(i18n.language)
  const today = new Date()
  const todayStr = toDateStr(today)
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [events, setEvents] = useState([])
  const [googleEvents, setGoogleEvents] = useState([])
  const [unavailability, setUnavailability] = useState([])
  const [workers, setWorkers] = useState([])
  const [assignmentBlocks, setAssignmentBlocks] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  // Barra di ricerca eventi in header (solo desktop) — trova per nome,
  // cliccare un risultato salta al mese/giorno giusto nella griglia.
  const [eventSearch, setEventSearch] = useState('')
  const [eventSearchOpen, setEventSearchOpen] = useState(false)
  // Creazione rapida dal "+" (solo desktop) — trasforma la colonna laterale
  // in un form invece di aprire il modal, vedi CalendarSidePanel. Prima
  // versione sperimentale: si chiude da sola se si lascia la griglia.
  const [sidebarCreating, setSidebarCreating] = useState(false)

  // Modalità "Assegna personale" — timeline settimanale (StaffTimeline.jsx),
  // alternativa alla griglia mensile. Pensata quasi esclusivamente per
  // desktop (7 colonne affiancate, tanta info): su telefono il toggle
  // sparisce e, se ci si arriva comunque (es. finestra ridotta mentre era
  // già aperta), si torna automaticamente alla griglia.
  // Ricordata tra una visita e l'altra (sessionStorage, si perde solo
  // chiudendo la scheda): così se si era su "Assegna personale" e si passa
  // un attimo su un'altra pagina (es. la lista di carico di un evento), si
  // ritrova la stessa vista al ritorno invece di ripartire dalla griglia.
  const [mode, setMode] = useState(() => {
    try { return sessionStorage.getItem('calendar_mode') === 'assign' ? 'assign' : 'grid' } catch { return 'grid' }
  })
  const isMobile = useIsMobile()
  useEffect(() => { if (isMobile && mode === 'assign') setMode('grid') }, [isMobile, mode])
  useEffect(() => { if (mode !== 'grid' || isMobile) { setSidebarCreating(false); setEditingEvent(null) } }, [mode, isMobile])
  useEffect(() => { try { sessionStorage.setItem('calendar_mode', mode) } catch {} }, [mode])

  // Arrivo come scorciatoia dal bottone "Assegna" nella lista di carico
  // (EventDetail.jsx) — passa a "Assegna personale" già sulla settimana e
  // sull'evento giusti, invece di un modal separato lì. Lo stato di
  // navigazione va consumato una volta sola (altrimenti un refresh o un
  // back/forward ci farebbero tornare qui di continuo).
  const { state: navState, search: locSearch } = useLocation()
  const [focusAssign, setFocusAssign] = useState(null) // {eventId?, date}
  useEffect(() => {
    if (navState?.assignEventId && navState?.assignDate) {
      setMode('assign')
      setFocusAssign({ eventId: navState.assignEventId, date: navState.assignDate })
      window.history.replaceState({}, '')
      return
    }
    // Stessa scorciatoia ma arrivando da un link "esterno" alla navigazione
    // in-app (una notifica push) — che non può portare un location.state —
    // via query string: salta alla settimana giusta in Assegna personale,
    // senza eventId (StaffTimeline gestisce già focusAssign senza eventId,
    // vedi il suo useEffect: salta solo la settimana, nessuna modale).
    const qs = new URLSearchParams(locSearch)
    if (qs.get('mode') === 'assign' && qs.get('date')) {
      setMode('assign')
      setFocusAssign({ date: qs.get('date') })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [navState, locSearch])
  const [editingEvent, setEditingEvent] = useState(null)
  const [editForm, setEditForm] = useState({})
  // Aperta di default solo se l'evento in modifica ha già un valore qui
  // dentro (vedi openEdit sotto) — altrimenti resta chiusa come in creazione.
  const [saving, setSaving] = useState(false)
  // Flusso unico di creazione evento, condiviso con Events.jsx — vedi
  // src/components/CreateEventFlow.jsx.
  const [showCreate, setShowCreate] = useState(false)
  // Tap su un evento già esistente (griglia o timeline) apre un riepilogo
  // rapido invece di saltare dritti alla lista di carico — vedi EventSummaryModal.jsx.
  const [summaryEvent, setSummaryEvent] = useState(null)
  // Stesso riepilogo, versione per i task liberi (niente lista di carico) — vedi TaskSummaryModal.jsx.
  const [summaryTask, setSummaryTask] = useState(null)

  // Gestione assenze admin
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({ startDate:'', endDate:'', reason:'', type:'ferie', allDay:true, startTime:'', endTime:'', workerId:'' })
  const [savingAbsence, setSavingAbsence] = useState(false)
  // null = si sta creando una nuova assenza, altrimenti id di quella in modifica
  const [editingAbsenceId, setEditingAbsenceId] = useState(null)
  const [myAbsencesOpen, setMyAbsencesOpen] = useState(false)
  // Anche quelle passate: altrimenti non c'è più modo di correggere data o
  // motivo di un'assenza sbagliata una volta finita. La lista resta comunque
  // chiusa di default (myAbsencesOpen), quindi non allunga la pagina.
  const myAbsences = unavailability.filter(u => u.workerId === user?.uid)

  // Selezione assenza tap-sul-calendario
  const [reportMode, setReportMode] = useState(false)
  // Il dettaglio attività in colonna (desktop) sparisce cambiando giorno o aprendo un altro form.
  useEffect(() => { setSummaryTask(null) }, [selectedDate, sidebarCreating, editingEvent, reportMode, mode])
  const [rangeStart, setRangeStart] = useState(null)
  const [hoverDate, setHoverDate] = useState(null) // anteprima range stile "booking" al passaggio del mouse

  const startReportMode = () => { setReportMode(true); setRangeStart(null); setHoverDate(null); setSelectedDate(null) }
  const cancelReportMode = () => { setReportMode(false); setRangeStart(null); setHoverDate(null); setSelectedDate(todayStr) }

  const handleDayTap = (dStr) => {
    if (reportMode) {
      if (!rangeStart) {
        setRangeStart(dStr)
      } else {
        const start = dStr <= rangeStart ? dStr : rangeStart
        const end = dStr <= rangeStart ? rangeStart : dStr
        setAbsenceForm({ startDate: start, endDate: end, reason: '', type: 'ferie', allDay:true, startTime:'', endTime:'', workerId:'' })
        setEditingAbsenceId(null)
        setShowAbsenceModal(true)
        setReportMode(false)
        setRangeStart(null)
        setHoverDate(null)
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
      const endDate = absenceForm.endDate || absenceForm.startDate
      // Le ore hanno senso solo su un giorno singolo — se il modal era stato
      // messo su "solo alcune ore" e POI si allarga l'intervallo a più
      // giorni (il campo ore sparisce, ma allDay/startTime/endTime restano
      // quelli di prima nello stato), qui si forza comunque "tutto il
      // giorno" invece di salvare ore ormai non più visibili/valide.
      const allDay = endDate !== absenceForm.startDate || absenceForm.allDay !== false
      const data = {
        startDate: absenceForm.startDate,
        endDate,
        reason: absenceForm.reason.trim(),
        type: absenceForm.type || 'altro',
        allDay,
        startTime: allDay ? null : (absenceForm.startTime || null),
        endTime: allDay ? null : (absenceForm.endTime || null),
        // L'admin può registrare/spostare un'assenza per conto di un'altra persona.
        ...(isAdmin && absenceForm.workerId ? { workerId: absenceForm.workerId } : {}),
      }
      if (editingAbsenceId) {
        // Modifica: workerId/teamId/createdAt dell'originale restano invariati.
        // awaitIfOnline: offline non aspettiamo la conferma del server (che
        // arriverebbe solo al ritorno della rete) — il dato è già in coda
        // nella cache locale, il modal si chiude subito con un avviso.
        await awaitIfOnline(updateDoc(doc(db, 'unavailability', editingAbsenceId), data), isOnline)
      } else {
        await awaitIfOnline(addDoc(collection(db, 'unavailability'), {
          ...data, workerId: (isAdmin && absenceForm.workerId) || user.uid, teamId, createdAt: serverTimestamp(),
        }), isOnline)
        // Nuova assenza segnalata da un worker (non dall'admin stesso): avvisa
        // l'admin al prossimo accesso (badge in-app, vedi
        // AbsenceNotifications.jsx) E subito via push — prima arrivava SOLO
        // al prossimo accesso/email, niente di immediato.
        if (!isAdmin) {
          const workerName = profile?.name || profile?.username || t('common.noName')
          await awaitIfOnline(addDoc(collection(db, 'notifications'), {
            teamId, type: 'absence',
            workerName,
            startDate: data.startDate, endDate: data.endDate, reason: data.reason,
            seenBy: [], createdAt: serverTimestamp(),
          }), isOnline)
          const dateLabel = data.startDate === data.endDate
            ? formatDate(data.startDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)
            : `${formatDate(data.startDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} → ${formatDate(data.endDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}`
          notifyTeamPush({
            title: t('calendar.pushNewAbsenceTitle'),
            body: `${workerName} · ${dateLabel}`,
            url: '/calendar',
            audience: { type: 'admins' },
          })
          // Email best-effort, solo se online — offline non c'è comunque rete
          // per inviarla, e aspettare getIdToken()/fetch senza connessione
          // bloccherebbe la chiusura del modal. L'admin la vede in app al
          // prossimo accesso (sopra) anche senza questa notifica extra.
          if (isOnline) {
            try {
              const idToken = await user.getIdToken()
              await fetch('/api/send-email', {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'absence',
                  workerName: profile?.name || profile?.username || t('common.noName'),
                  startDate: data.startDate, endDate: data.endDate, reason: data.reason,
                }),
              })
            } catch {}
          }
        }
      }
      if (!isOnline) showToast(t('common.savedOfflineToast'))
      setAbsenceForm({ startDate:'', endDate:'', reason:'', type:'ferie', allDay:true, startTime:'', endTime:'', workerId:'' })
      setEditingAbsenceId(null)
      setShowAbsenceModal(false)
    } finally { setSavingAbsence(false) }
  }

  const openEditAbsence = (a) => {
    setAbsenceForm({ startDate: a.startDate, endDate: a.endDate, reason: a.reason || '', type: a.type || 'altro', allDay: a.allDay !== false, startTime: a.startTime || '', endTime: a.endTime || '', workerId: a.workerId || '' })
    setEditingAbsenceId(a.id)
    setShowAbsenceModal(true)
  }

  const closeAbsenceModal = () => {
    setShowAbsenceModal(false)
    setEditingAbsenceId(null)
  }

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.date) return
    setSaving(true)
    try {
      const updated = {
        name: editForm.name.trim(), date: editForm.date,
        dateEnd: editForm.dateEnd || null,
        allDay: editForm.allDay, timeStart: editForm.allDay ? null : (editForm.timeStart || null), timeEnd: editForm.allDay ? null : (editForm.timeEnd || null),
        location: editForm.location.trim(), notes: editForm.notes.trim(),
        phases: editForm.phases || {},
        quoteRef: (editForm.quoteRef || '').trim(),
        eventManager: {
          name: (editForm.managerName || '').trim(), phone: (editForm.managerPhone || '').trim(), email: (editForm.managerEmail || '').trim(),
        },
      }
      await awaitIfOnline(updateDoc(doc(db, 'events', editingEvent.id), updated), isOnline)
      if (updated.eventManager.name) rememberEventManager(teamId, user.uid, updated.eventManager).catch(() => {})
      notifyEventTimeChangedIfNeeded(editingEvent.id, editingEvent, updated)
      if (!isOnline) showToast(t('common.savedOfflineToast'))
      setEditingEvent(null)
    } finally { setSaving(false) }
  }

  const deleteEvent = async (e, ev) => {
    e.stopPropagation()
    if (!(await confirm({ title: t('calendar.confirmDeleteEventTitle'), message: t('calendar.confirmDeleteEventMessage', { name: ev.name }), confirmLabel: t('calendar.confirmDeleteEventLabel'), danger: true }))) return false
    await deleteEventWithInventoryCheck({ event: ev, confirm, t })
    return true
  }

  const editDrag = useModalDrag(() => setEditingEvent(null), undefined, saveEdit, !!editingEvent)
  const absenceDrag = useModalDrag(closeAbsenceModal, undefined, addAbsence, showAbsenceModal)

  // Oltre ai modal, blocca lo scroll della PAGINA anche nella griglia
  // desktop: header+nav+griglia+legenda devono stare tutti in un colpo
  // d'occhio, la colonna laterale scorre per conto suo (vedi il suo
  // max-height in CalendarSidePanel). Un'unica chiamata che somma tutte le
  // ragioni per bloccare — due istanze separate dell'hook si pesterebbero i
  // piedi sullo stesso body.style quando una si chiude mentre l'altra è
  // ancora attiva (es. chiudere un modal mentre si è ancora sulla griglia).
  useModalScrollLock(!!editingEvent || showAbsenceModal || showCreate || (!isMobile && (mode === 'grid' || mode === 'assign')))

  const removeAbsence = async (id) => {
    if (!(await confirm({ title: t('calendar.confirmRemoveAbsenceTitle'), message: t('calendar.confirmRemoveAbsenceMessage'), confirmLabel: t('calendar.confirmRemoveAbsenceLabel'), danger: true }))) return false
    await deleteDoc(doc(db, 'unavailability', id))
    return true
  }

  const openEdit = (e, ev) => {
    e.stopPropagation()
    setEditingEvent(ev)
    setEditForm({
      name:ev.name||'', date:ev.date||'', dateEnd:ev.dateEnd||'',
      allDay: ev.allDay !== false, timeStart: ev.timeStart||'', timeEnd: ev.timeEnd||'',
      location:ev.location||'', notes:ev.notes||'', phases:ev.phases||{},
      quoteRef: ev.quoteRef||'', managerName: ev.eventManager?.name||'', managerPhone: ev.eventManager?.phone||'', managerEmail: ev.eventManager?.email||'',
    })
  }

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => {
      // `archived` (solo i rent/install chiusi, vedi closeInstallationEvent
      // in utils/kitInventory.js) non va più tolto da qui: un noleggio
      // chiuso deve restare visibile sul proprio giorno in calendario per
      // poterlo ritrovare in futuro, non sparire del tutto. Continua a
      // sparire solo dalle sezioni "attive"/"da scaricare" di Events.jsx,
      // che lo escludono a parte — qui serve solo come promemoria storico.
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
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

  // Tutti i blocchi della timeline "Assegna personale" (collection
  // assignmentBlocks) — sia i task liberi (senza eventId, usati sotto per
  // tasksByDate) sia quelli legati a un evento/fase (usati da
  // EventSummaryModal per mostrare chi è assegnato con quali orari, vedi
  // sotto nel JSX).
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => {
      setAssignmentBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [teamId])

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
  // Un evento normale è quasi sempre ciò che si sta cercando aprendo un
  // giorno — gli eventi vengono prima, le fasi (montaggio/smontaggio) subito
  // dopo, i task liberi (creati dalla timeline "Assegna personale") dopo
  // ancora, i rent/install sempre per ultimi (un rent/install spesso occupa
  // il giorno per settimane, è "rumore di fondo" rispetto al resto), i
  // promemoria scadenza (non sono una vera prenotazione) ultimissimi — sia
  // nella griglia mensile che nell'elenco del giorno selezionato (entrambi
  // leggono da eventsByDate/phasesByDate/tasksByDate con questo stesso
  // ordine, vedi più sotto dove si uniscono). Sort stabile: l'ordine tra
  // eventi dello stesso rango resta quello originale.
  const eventRank = e => e.isDeadlineReminder ? 4 : e.type === 'installation' ? 3 : 0
  Object.values(eventsByDate).forEach(list => list.sort((a, b) => eventRank(a) - eventRank(b)))

  // Futuri (oggi compreso) prima, dal più vicino — poi i passati, dal più
  // recente: aprendo la ricerca si cerca quasi sempre un evento che deve
  // ancora succedere, i vecchi servono solo di tanto in tanto come storico.
  // Una riga più spessa separa i due gruppi nel dropdown (eventSearchSplit),
  // solo quando compaiono entrambi.
  const eventSearchMatches = eventSearch.trim().length < 2 ? [] : events
    .filter(e => e.date && !e.isDeadlineReminder && e.name?.toLowerCase().includes(eventSearch.trim().toLowerCase()))
  const eventSearchFuture = eventSearchMatches.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))
  const eventSearchPast = eventSearchMatches.filter(e => e.date < todayStr).sort((a, b) => b.date.localeCompare(a.date))
  const eventSearchResults = [...eventSearchFuture, ...eventSearchPast].slice(0, 8)
  const eventSearchSplit = Math.min(eventSearchFuture.length, eventSearchResults.length)

  const goToSearchResult = ev => {
    const d = new Date(ev.date + 'T12:00:00')
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setSelectedDate(ev.date)
    setMode('grid')
    setEventSearch('')
    setEventSearchOpen(false)
  }

  // Indice fasi: data → array di { event, key, color, label }
  const PHASE_META = {
    montaggio:  { color:'#2563eb', label:t('calendar.legendAssembly') },
    smontaggio: { color:'#ea580c', label:t('calendar.legendDisassembly') },
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

  // Task liberi per data (sempre un solo giorno, niente da espandere) — solo
  // i blocchi SENZA eventId, quelli legati a un evento/fase restano
  // rappresentati dall'evento stesso (vedi EventSummaryModal più sotto).
  // Raggruppati per taskGroupId: più persone collegate alla stessa attività
  // restano UNA voce con più assegnati, non una card a testa — stessa
  // tecnica già usata in StaffTimeline.jsx (dayTasks/taskGroupsByGid). b.id
  // come ripiego per i task creati prima che esistesse taskGroupId.
  const taskGroupsByDate = {}
  assignmentBlocks.filter(b => !b.eventId).forEach(b => {
    if (!b.date) return
    const gid = b.taskGroupId || b.id
    if (!taskGroupsByDate[b.date]) taskGroupsByDate[b.date] = {}
    ;(taskGroupsByDate[b.date][gid] ||= []).push(b)
  })
  const tasksByDate = {}
  Object.entries(taskGroupsByDate).forEach(([date, groups]) => {
    tasksByDate[date] = Object.values(groups).map(group => ({
      id: group[0].taskGroupId || group[0].id,
      date,
      label: group[0].label,
      description: group[0].description,
      linkedEventId: group.find(b => b.linkedEventId)?.linkedEventId || null,
      linkedListId: group.find(b => b.linkedListId)?.linkedListId || null,
      startTime: group.reduce((min, b) => (b.startTime < min ? b.startTime : min), group[0].startTime),
      endTime: group.reduce((max, b) => (b.endTime > max ? b.endTime : max), group[0].endTime),
      assigned: group,
    }))
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
  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth()

  const absencesOnDate = (dStr) => unavailability
    .filter(u => dStr >= u.startDate && dStr <= u.endDate)
    .map(u => ({ ...u, workerName: workers.find(w => w.id === u.workerId)?.name || t('common.unknown') }))

  // Stesso filtro della griglia qui sotto: un rent/install compare solo il
  // giorno di inizio e quello di fine, non su ogni giorno intermedio del
  // suo periodo — altrimenti "occupa" il pannello anche quando non c'è
  // nulla da fare quel giorno.
  const selectedEvents = (eventsByDate[selectedDate] || []).filter(ev => {
    if (ev.type !== 'installation') return true
    const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
    return selectedDate === ev.date || selectedDate === end
  })
  const selectedPhases = phasesByDate[selectedDate] || []
  // Aggiungi anche gli eventi con fasi nel giorno selezionato (non già
  // presenti come evento del giorno) — raggruppate per evento, non per
  // singola fase: un'installazione con montaggio E smontaggio lo stesso
  // giorno resta UNA riga con due badge, non due righe duplicate.
  const selectedPhaseGroups = {}
  selectedPhases.filter(p => !selectedEvents.some(e => e.id === p.event.id)).forEach(p => {
    (selectedPhaseGroups[p.event.id] ||= { event: p.event, phases: [] }).phases.push(p)
  })
  const selectedPhaseEvents = Object.values(selectedPhaseGroups)
  // Per la colonna laterale desktop: OGNI fase del giorno ha la sua card
  // (anche nello stesso giorno dell'evento), con l'orario impostato da
  // "Assegna personale" e le persone assegnate a quella fase. Le assegnazioni
  // senza campo `phase` (precedenti) su un giorno senza l'evento restano
  // della fase — stessa regola di StaffTimeline.
  const selectedDayPhases = selectedPhases.map(p => {
    const eventOnDay = (eventsByDate[selectedDate] || []).some(e => e.id === p.event.id)
    const pt = p.event.phaseTimes?.[p.key]
    return {
      event: p.event, key: p.key, label: p.label, color: p.color,
      time: pt?.timeStart && pt?.timeEnd ? `${pt.timeStart}–${pt.timeEnd}` : null,
      assigned: assignmentBlocks.filter(b => b.eventId === p.event.id && b.date === selectedDate && (b.phase === p.key || (!b.phase && !eventOnDay))),
    }
  })
  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] || []) : []
  const selectedAbsences = selectedDate ? absencesOnDate(selectedDate) : []
  const selectedGoogleEvents = selectedDate ? (googleEventsByDate[selectedDate] || []) : []
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null

  return (
    <div className="page" style={{ paddingBottom:160 }}>
      <Toast message={toast} />
      <div className="page-header" style={!isMobile ? { background:'#fff', borderBottom:'1px solid #e0ddd6', padding:'18px 32px 14px' } : { background:'#fff', borderBottom:'1px solid #e0ddd6', paddingBottom:14 }}>
        {isMobile ? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <h1 style={{ fontSize:26, letterSpacing:'-0.5px', color:'#1a1a1a' }}>{t('calendar.title')}</h1>
                <p style={{ color:'#9a9a9a' }}>{t('calendar.totalEvents', { count: events.length })}</p>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {/* Il flusso "tocca primo/ultimo giorno" dipende dalla griglia
                    mensile: in "Assegna personale" non c'è nulla su cui
                    toccare, quindi il bottone resterebbe acceso senza poter
                    funzionare. Solo mobile: su desktop la stessa azione vive
                    nel bottone "+ Aggiungi assenza" della colonna laterale. */}
                {mode === 'grid' && (
                  <button onClick={() => reportMode ? cancelReportMode() : startReportMode()}
                    aria-pressed={reportMode} className="btn-no-anim"
                    style={{
                      background: reportMode ? 'rgba(230,57,70,0.12)' : '#eceae6',
                      color: reportMode ? '#e63946' : '#6b6b6b',
                      border:'none', borderRadius:10, padding:'9px 13px', fontSize:12.5, fontWeight:700,
                    }}>
                    {t('calendar.reportAbsence')}
                  </button>
                )}
              </div>
            </div>

            {/* Navigazione mese sulla propria riga — tabs assenti (niente
                Assegna personale su schermi stretti). */}
            {mode === 'grid' && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:16 }}>
              <button onClick={goPrevMonth} aria-label={t('calendar.prevMonthAria')} className="btn-no-anim"
                style={{ width:40, height:40, borderRadius:10, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#9a9a9a' }}>‹</button>
              <button onClick={goToday} className="btn-no-anim rc-cal-today-btn"
                style={{ textAlign:'center', background:'none', border:'none', padding:'2px 12px', borderRadius:9, minWidth:150 }}>
                <div style={{ fontSize:17, fontWeight:800, whiteSpace:'nowrap', color:'#1a1a1a' }}>
                  {capitalize(formatDate(new Date(cursor.year, cursor.month, 1), { month:'long' }, i18n.language))} {cursor.year}
                </div>
                <div className="rc-cal-today-label" style={{ fontSize:11, fontWeight:800, marginTop:1, color: isCurrentMonth ? '#e63946' : '#6b6b6b' }}>
                  {t('calendar.today')}
                </div>
              </button>
              <button onClick={goNextMonth} aria-label={t('calendar.nextMonthAria')} className="btn-no-anim"
                style={{ width:40, height:40, borderRadius:10, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#9a9a9a' }}>›</button>
            </div>
            )}
          </>
        ) : (
          /* Desktop: tutto in un'unica riga — titolo, data/"Oggi" (solo in
             griglia) a sinistra, tab Calendario/Assegna SEMPRE centrati
             (posizione assoluta: restano centrati anche quando a sinistra
             non c'è nulla, cioè in "Assegna personale"). Niente più "Segna
             assenza" qui: la stessa azione vive nel bottone "+ Aggiungi
             assenza" della colonna laterale (CalendarSidePanel). Niente più
             vista settimanale (tolta: restava solo il mese). */
          <div style={{ position:'relative', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', minHeight:28 }}>
            <h1 style={{ margin:0, fontSize:24, fontWeight:800, letterSpacing:'-0.5px' }}>{t('calendar.title')}</h1>

            <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)', display:'flex', gap:4, background:'#eceae6', borderRadius:10, padding:3, width:'fit-content' }}>
              <button onClick={() => setMode('grid')} aria-pressed={mode === 'grid'} className="btn-no-anim" style={{ padding:'6px 16px', borderRadius:8, fontSize:12.5, fontWeight:700, background: mode === 'grid' ? '#e63946' : 'transparent', color: mode === 'grid' ? '#fff' : '#6b6b6b' }}>
                {t('calendar.viewGrid')}
              </button>
              <button onClick={() => { if (reportMode) cancelReportMode(); setMode('assign') }} aria-pressed={mode === 'assign'} className="btn-no-anim" style={{ padding:'6px 16px', borderRadius:8, fontSize:12.5, fontWeight:700, background: mode === 'assign' ? '#e63946' : 'transparent', color: mode === 'assign' ? '#fff' : '#6b6b6b' }}>
                {t('calendar.viewAssign')}
              </button>
            </div>
          </div>
        )}

        {/* Su desktop lo stesso avviso vive dentro la colonna laterale
            (CalendarSidePanel), che si trasforma mostrando anche i campi
            da compilare subito dopo — niente più banner qui + modal
            separato. Su mobile, senza colonna, resta questo banner. */}
        {mode === 'grid' && reportMode && isMobile && (
          <div style={{ marginTop:14, background:'rgba(216,56,63,0.08)', border:'1px solid rgba(216,56,63,0.3)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <p style={{ fontSize:13, color:'var(--accent)', fontWeight:600, lineHeight:1.4 }}>
              {!rangeStart ? t('calendar.tapFirstDay') : t('calendar.tapLastDay')}
            </p>
            <button onClick={cancelReportMode} style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'6px 12px', fontSize:13, fontWeight:700, flexShrink:0 }}>{t('common.cancel')}</button>
          </div>
        )}
      </div>

      {mode === 'grid' && (
      <div style={{ padding: isMobile ? '0 0 16px' : '0 0 16px 16px', display: isMobile ? 'block' : 'flex', gap: isMobile ? 0 : 16, alignItems: isMobile ? undefined : 'stretch' }}>
      <div style={{ flex: isMobile ? undefined : 1, minWidth: 0 }}>
        {/* Navigazione mese — dentro la colonna griglia (non più una riga a
            parte sopra tutta la pagina): così la colonna laterale bianca
            parte subito sotto l'header, senza il grigio dello sfondo pagina
            che prima comparse dietro a questa riga. Centrata sulla sola
            colonna griglia (è nello stesso contenitore flex:1 della
            griglia). Frecce leggere, senza sfondo. */}
        {!isMobile && (
          <div style={{ position:'relative', display:'flex', justifyContent:'center', padding:'20px 0 10px', minHeight:36 }}>
            <div style={{ display:'flex', alignItems:'center', gap:2 }}>
              <button onClick={goPrevMonth} aria-label={t('calendar.prevMonthAria')} className="btn-no-anim"
                style={{ width:22, height:22, borderRadius:6, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#9a9a9a' }}>‹</button>
              <button onClick={goToday} className="btn-no-anim rc-cal-today-btn"
                style={{ textAlign:'center', background:'none', border:'none', padding:'2px 10px', borderRadius:9 }}>
                <div style={{ fontSize:15, fontWeight:800, whiteSpace:'nowrap', color:'#1a1a1a' }}>
                  {capitalize(formatDate(new Date(cursor.year, cursor.month, 1), { month:'long' }, i18n.language))} {cursor.year}
                </div>
                <div className="rc-cal-today-label" style={{ fontSize:11, fontWeight:800, marginTop:1, color: isCurrentMonth ? '#e63946' : '#6b6b6b' }}>
                  {t('calendar.today')}
                </div>
              </button>
              <button onClick={goNextMonth} aria-label={t('calendar.nextMonthAria')} className="btn-no-anim"
                style={{ width:22, height:22, borderRadius:6, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#9a9a9a' }}>›</button>
            </div>

            {/* Ricerca evento — ancorata all'angolo in alto a destra della
                colonna griglia, larga quanto il dropdown dei risultati (280).
                onMouseDown invece di onClick sulle righe del dropdown, così
                scatta prima del blur dell'input che altrimenti lo chiuderebbe. */}
            <div style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', width:280, isolation:'isolate', zIndex:50 }}>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <span style={{ position:'absolute', left:10, display:'flex', color:'#9a9a9a', pointerEvents:'none' }}><Search size={15} /></span>
                <input
                  value={eventSearch}
                  onChange={e => { setEventSearch(e.target.value); setEventSearchOpen(true) }}
                  onFocus={() => setEventSearchOpen(true)}
                  onBlur={() => setTimeout(() => setEventSearchOpen(false), 150)}
                  onKeyDown={e => { if (e.key === 'Escape') { setEventSearch(''); setEventSearchOpen(false); e.target.blur() } }}
                  placeholder={t('calendar.searchPlaceholder')}
                  style={{ width:'100%', background:'#eceae6', border:'none', borderRadius:10, padding:'8px 10px 8px 32px', fontSize:12.5, color:'#1a1a1a' }}
                />
              </div>
              {eventSearchOpen && eventSearch.trim().length >= 2 && (
                <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, width:280, background:'#fff', opacity:1, border:'1px solid #e0ddd6', borderRadius:12, boxShadow:'0 12px 32px rgba(0,0,0,0.22)', overflow:'hidden' }}>
                  {eventSearchResults.length === 0 ? (
                    <div style={{ padding:'12px 14px', fontSize:12.5, color:'#9a9a9a', background:'#fff' }}>{t('calendar.searchNoResults')}</div>
                  ) : eventSearchResults.map((ev, i) => (
                    <div key={ev.id}>
                      {i === eventSearchSplit && i > 0 && i < eventSearchResults.length && (
                        <div style={{ padding:'5px 14px', background:'#f4f4f2', borderTop:'2px solid #e0ddd6', borderBottom:'1px solid #e0ddd6', fontSize:10, fontWeight:800, color:'#9a9a9a', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                          {t('calendar.searchPastSection')}
                        </div>
                      )}
                      <button onMouseDown={() => goToSearchResult(ev)} className="btn-no-anim"
                        style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:'#fff', borderBottom: i === eventSearchResults.length - 1 ? 'none' : '1px solid #f0efec' }}>
                        <div style={{ fontSize:12.5, fontWeight:700, color:'#1a1a1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</div>
                        <div style={{ fontSize:11, color:'#9a9a9a', marginTop:2 }}>
                          {capitalize(formatDate(ev.date + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language))}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header giorni settimana */}
        {/* Su desktop le celle sono unite in un'unica griglia dentro un
            contenitore con bordo — separate SOLO da righe (come il mockup),
            non più tante tessere arrotondate staccate da uno spazio; su
            mobile restano le tessere di sempre (più leggibili su schermi
            stretti, tocco più preciso). */}
        <div style={isMobile
          // Telefono: a tutta larghezza, senza margini né angoli — la linea sotto
          // l'intestazione fa da bordo in alto, qui solo quello in basso.
          ? { background:'#fff', borderBottom:'1px solid #e0ddd6', overflow:'hidden' }
          : { background:'#fff', border:'1px solid #e0ddd6', borderRadius:16, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #e0ddd6' }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign:'center', fontSize: isMobile ? 10 : 11.5, fontWeight:700, color:'#9a9a9a', textTransform:'uppercase', letterSpacing: isMobile ? '0.2px' : '0.4px', padding: isMobile ? '8px 0' : '9px 0' }}>{w}</div>
          ))}
        </div>

        {/* Griglia mese — puntini colorati, tap per selezionare il giorno; swipe orizzontale per cambiare mese */}
        <div key={`${cursor.year}-${cursor.month}`} className="cal-grid-swipe" {...swipeMonth} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {cells.map((cell, i) => {
            const isLastCol = i % 7 === 6
            const isLastRow = Math.floor(i / 7) === Math.ceil(cells.length / 7) - 1
            const dStr = toDateStr(cell.dateObj)
            // Un rent/install può durare mesi: ripeterlo su ogni giorno della
            // griglia mensile lo fa sembrare "occupato" anche nei giorni in
            // cui non c'è nulla da fare. Un rent/install compare solo il
            // giorno di inizio e quello di fine — stesso filtro su
            // selectedEvents più sotto, per il pannello del giorno selezionato.
            const dayEvents = (eventsByDate[dStr] || []).filter(ev => {
              if (ev.type !== 'installation') return true
              const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
              return dStr === ev.date || dStr === end
            })
            const dayGoogleEvents = googleEventsByDate[dStr] || []
            const dayAbsences = absencesOnDate(dStr)
            const hasMyAbsence = dayAbsences.some(a => a.workerId === user?.uid)
            const isToday = dStr === todayStr
            const isPast = dStr < todayStr
            const isSelected = dStr === selectedDate
            const isRangeStart = reportMode && dStr === rangeStart
            const isInPreviewRange = reportMode && rangeStart && hoverDate && !isRangeStart &&
              dStr >= (rangeStart <= hoverDate ? rangeStart : hoverDate) &&
              dStr <= (rangeStart <= hoverDate ? hoverDate : rangeStart)
            const otherAbsences = dayAbsences.filter(a => a.workerId !== user?.uid)

            return (
              <button
                key={i}
                onClick={() => handleDayTap(dStr)}
                onMouseEnter={() => { if (reportMode && rangeStart) setHoverDate(dStr) }}
                style={{
                  // Griglia unita da sole righe hairline (destra/basso; l'alto e
                  // la sinistra li dà il contenitore o la cella precedente),
                  // oggi con un filo rosso in alto, giorno selezionato con un
                  // anello blu — stesso linguaggio di desktop, celle più
                  // compatte sul telefono.
                  position:'relative',
                  minHeight: isMobile ? 76 : 118,
                  borderRadius:0,
                  padding: isMobile ? '6px 3px 4px' : '8px 6px 6px',
                  borderRight: isLastCol ? 'none' : '1px solid #e0ddd6',
                  borderBottom: isLastRow ? 'none' : '1px solid #e0ddd6',
                  background: isSelected ? 'rgba(0,102,204,0.08)' : isRangeStart ? 'rgba(216,56,63,0.12)' : isInPreviewRange ? 'rgba(216,56,63,0.06)' : isToday ? 'rgba(230,57,70,0.045)' : cell.current ? '#fff' : 'transparent',
                  boxShadow: isSelected ? 'inset 0 0 0 1.5px #0066cc' : isToday ? 'inset 0 2px 0 #e63946' : 'none',
                  opacity: cell.current ? (isPast ? 0.5 : 1) : 0.3,
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  gap: isMobile ? 2 : 3,
                  overflow:'hidden',
                  cursor:'pointer',
                  transition:'background 0.1s ease, box-shadow 0.1s ease',
                }}
              >
                <span style={{
                  fontSize: isMobile ? 13 : 14, fontWeight: isToday ? 800 : 600,
                  color: isToday ? 'var(--accent)' : (cell.current ? 'var(--text)' : 'var(--text3)'),
                }}>
                  {cell.day}
                </span>
                {/* Assenze personale (diverse dalla mia), in rosso al posto del vecchio triangolino */}
                {otherAbsences.length > 0 && (
                  <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:1 }}>
                    <span style={{ fontSize:9.5, fontWeight:800, lineHeight:1.2, color:'var(--red)', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {t('calendar.absencePrefix', { name: otherAbsences[0].workerName })}
                    </span>
                    {otherAbsences.length > 1 && (
                      <span style={{ fontSize:9, fontWeight:700, color:'var(--red)' }}>{t('common.moreCount', { count: otherAbsences.length - 1 })}</span>
                    )}
                  </div>
                )}
                {/* Nomi evento (fino a 2 righe, troncati) in una card del colore
                    dell'evento, come Google Calendar — niente più puntino separato,
                    il colore è la card stessa: si legge meglio e occupa meno
                    spazio in orizzontale. Include anche le fasi (montaggio/
                    smontaggio) che cadono in un giorno diverso da quello
                    dell'evento vero e proprio. */}
                {(() => {
                  // Prima una fase lo stesso giorno dell'evento vero spariva
                  // del tutto (per non ripetere due volte lo stesso nome) —
                  // ma così, es. uno smontaggio in giornata, non si vedeva
                  // più da nessuna parte. Resta sempre una riga a sé, con
                  // l'etichetta della fase ("Smontaggio") invece di ripetere
                  // il nome — la card dell'evento vero sopra mostra comunque
                  // il nome reale (qui nella griglia resta sempre quello, i
                  // due tag "Evento"/fase affiancati sono solo nel pannello
                  // del giorno selezionato e nel modal, dove c'è più spazio).
                  const dayPhasesAll = phasesByDate[dStr] || []
                  const dayTasksOnly = tasksByDate[dStr] || []
                  const phaseGroups = {}
                  dayPhasesAll.forEach(p => { (phaseGroups[p.event.id] ||= []).push(p) })
                  // Un evento NON produce mai più di una riga per giorno: se
                  // oggi è anche montaggio e/o smontaggio di quell'evento, la
                  // fase si fonde nella STESSA card (colore diviso a metà —
                  // evento+fase, o le due fasi se coincidono entrambe) invece
                  // di restare una seconda riga separata che sembra un altro
                  // evento. mergedEventIds tiene traccia di chi è già stato
                  // "assorbito" così dopo non viene ripetuto tra le fasi.
                  const mergedEventIds = new Set()
                  const eventRows = dayEvents.map(ev => {
                    const isAssigned = isWorker && (ev.assignedWorkers || []).includes(user?.uid)
                    const rank = ev.isDeadlineReminder ? 4 : ev.type === 'installation' ? 3 : 0
                    const baseColor = ev.isDeadlineReminder ? 'var(--text3)' : ev.type === 'installation' ? '#7c6fcd' : isWorker ? (isAssigned ? 'var(--accent)' : 'var(--blue)') : 'var(--accent)'
                    const phasesToday = !ev.isDeadlineReminder && phaseGroups[ev.id]
                    if (!phasesToday) return { key: ev.id, name: ev.name, isReminder: ev.isDeadlineReminder, rank, color: baseColor }
                    mergedEventIds.add(ev.id)
                    const split = phasesToday.length > 1 ? phasesToday.map(p => p.color) : [baseColor, phasesToday[0].color]
                    return { key: ev.id, name: ev.name, rank, split }
                  })
                  // Fasi rimaste "orfane" (l'evento vero non compare oggi in
                  // griglia — es. giorno di smontaggio fuori dal range
                  // date/dateEnd mostrato): restano una riga a sé, col nome
                  // vero dell'evento (non più un'etichetta "Montaggio" generica
                  // che da sola non direbbe più di chi è).
                  const dayPhaseRows = Object.values(phaseGroups)
                    .filter(group => !mergedEventIds.has(group[0].event.id))
                    .map(group => {
                      if (group.length > 1) {
                        return { key: `${group[0].event.id}-phases`, name: `${group.map(p => p.label).join('/')} · ${group[0].event.name}`, rank: 1, split: group.map(p => p.color) }
                      }
                      const p = group[0]
                      return { key: `${p.event.id}-${p.key}`, name: `${p.label} · ${p.event.name}`, rank: 1, color: p.color }
                    })
                  // Ordine di priorità fisso: evento vero > fase (montaggio/
                  // smontaggio) > task libero > rent/install > promemoria
                  // scadenza — stesso rango di eventRank sopra.
                  const titleRows = [
                    ...eventRows,
                    ...dayPhaseRows,
                    ...dayTasksOnly.map(group => {
                      const isAssigned = isWorker && group.assigned.some(b => b.workerId === user?.uid)
                      return { key: `tk${group.id}`, name: group.label || t('staffTimeline.untitledTask'), rank: 2, color: isWorker ? (isAssigned ? 'var(--accent)' : 'var(--blue)') : 'var(--blue)', isTask: true, task: group }
                    }),
                  ].sort((a, b) => a.rank - b.rank)
                  if (titleRows.length === 0) return null
                  return (
                    <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:2 }}>
                      {titleRows.slice(0, 2).map(row => (
                        <span key={row.key} style={{
                          display:'block', fontSize:9.5, fontWeight:700, lineHeight:1.35,
                          padding:'1.5px 4px', borderRadius:4, maxWidth:'100%',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          background: row.isReminder ? 'var(--card2)' : isPast ? 'var(--text2)' : row.split ? `linear-gradient(90deg, ${row.split[0]} 50%, ${row.split[1]} 50%)` : row.color,
                          color: row.isReminder ? 'var(--text3)' : '#fff',
                        }}>{row.name}</span>
                      ))}
                      {titleRows.length > 2 && (
                        <span style={{ fontSize:9, fontWeight:700, color:'var(--text3)' }}>+{titleRows.length - 2}</span>
                      )}
                    </div>
                  )
                })()}
                {/* Puntino secondario: solo eventi Google Calendar (le fasi ora hanno
                    la propria voce col titolo sopra, non serve più ripeterle qui). */}
                {dayGoogleEvents.length > 0 && (
                  <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'center', marginTop:'auto' }}>
                    <span style={{ width:6, height:6, borderRadius:2, flexShrink:0, background:'#4285F4', opacity: isPast ? 0.55 : 1 }} />
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
        </div>

        {/* Legenda */}
        <div style={{ display:'flex', gap:12, marginTop:14, padding: isMobile ? '0 16px' : '0 0 0 4px', flexWrap:'wrap' }}>
          {isWorker && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} />
              <span style={{ fontSize:12, color:'var(--text2)' }}>{t('calendar.legendAssignedToMe')}</span>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#7c6fcd', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('calendar.legendInstallations')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#2563eb', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('calendar.legendAssembly')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#ea580c', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('calendar.legendDisassembly')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:'repeating-linear-gradient(-50deg, rgba(144,144,176,0.45) 0px, rgba(144,144,176,0.45) 1.5px, transparent 1.5px, transparent 5px)', border:'1px solid rgba(144,144,176,0.3)', display:'inline-block' }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{t('calendar.legendMyAbsence')}</span>
          </div>
        </div>
      </div>
      {/* Colonna laterale desktop — sostituisce il vecchio pannello sotto la
          griglia + il collassabile "Le mie assenze" (visibili ancora SOLO
          su mobile, vedi sotto). */}
      {!isMobile && (
        <CalendarSidePanel
          absencesOnDate={absencesOnDate} workers={workers} teamId={teamId}
          todayStr={todayStr} selectedDate={selectedDate} selectedDayEvents={selectedEvents} selectedDayPhases={selectedDayPhases} selectedDayTasks={selectedTasks}
          user={user} isWorker={isWorker} onOpenTask={tk => setSummaryTask(tk)} taskDetail={!isMobile ? summaryTask : null} onCloseTask={() => setSummaryTask(null)} onEditEvent={(e, ev) => openEdit(e, ev)}
          onAddAbsence={() => { if (reportMode) { cancelReportMode() } else { setSidebarCreating(false); setEditingEvent(null); startReportMode() } }}
          creating={sidebarCreating} onCancelCreate={() => setSidebarCreating(false)}
          onEventCreated={() => setSidebarCreating(false)}
          reportMode={reportMode} rangeStart={rangeStart} onCancelReportMode={cancelReportMode}
          absenceFormOpen={showAbsenceModal} absenceForm={absenceForm} setAbsenceForm={setAbsenceForm}
          onSubmitAbsence={addAbsence} savingAbsence={savingAbsence} editingAbsenceId={editingAbsenceId}
          onCloseAbsenceForm={closeAbsenceModal}
          isAdmin={isAdmin} onEditAbsence={openEditAbsence}
          onDeleteAbsence={async () => { if (await removeAbsence(editingAbsenceId)) { closeAbsenceModal(); return true } return false }}
          editingEvent={editingEvent} editForm={editForm} setEditForm={setEditForm}
          onSaveEdit={saveEdit} saving={saving} onCancelEdit={() => setEditingEvent(null)}
          onDeleteEvent={async e => { if (await deleteEvent(e, editingEvent)) setEditingEvent(null) }}
        />
      )}
      </div>
      )}

      {/* Pannello giorno selezionato (solo mobile — su desktop la colonna
          laterale qui sopra lo sostituisce) — qui il testo è leggibile per intero */}
      {mode === 'grid' && isMobile && selectedDate && (() => {
        const isSelectedDayPast = selectedDate < todayStr
        return (
        <div style={{ padding:'0 16px 24px' }}>
          <p style={{ fontSize:12.5, fontWeight:800, color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:10 }}>
            {formatDate(selectedDateObj, { weekday:'long', day:'numeric', month:'long' }, i18n.language)}
            {selectedDate === todayStr && ` · ${t('calendar.today')}`}
          </p>
          {selectedEvents.length === 0 && selectedPhaseEvents.length === 0 && selectedTasks.length === 0 && selectedGoogleEvents.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic', padding:'8px 0' }}>{t('calendar.noEventsToday')}</p>
          ) : (
            <>
              {[
                // Ordine di priorità nel pannello: eventi assegnati a te >
                // eventi/fasi > task libero > rent/install > promemoria —
                // "assegnato" conta solo per un admin che è anche worker
                // (isWorker), altrimenti tutti gli eventi restano allo
                // stesso livello, non ha senso distinguerli per un admin
                // puro. coincides: true solo quando l'evento vero è DAVVERO
                // anche oggi (selectedEvents), non quando la riga esiste
                // solo perché c'è una fase quel giorno (selectedPhaseEvents,
                // dove ev è solo "di chi è" la fase) — serve a decidere se
                // aggiungere anche il tag "Evento" accanto a quello fase.
                ...selectedEvents.map(ev => {
                  const isAssigned = isWorker && (ev.assignedWorkers || []).includes(user?.uid)
                  const rank = ev.isDeadlineReminder ? 4 : ev.type === 'installation' ? 3 : isAssigned ? 0 : 1
                  return { ev, phasesOnDay: selectedPhases.filter(p => p.event.id === ev.id), coincides: true, rank, dotColor: ev.isDeadlineReminder ? 'var(--text3)' : ev.type === 'installation' ? '#7c6fcd' : 'var(--accent)', borderColor: 'var(--border)' }
                }),
                ...selectedPhaseEvents.map(({ event, phases }) => {
                  const isAssigned = isWorker && (event.assignedWorkers || []).includes(user?.uid)
                  return { ev: event, phasesOnDay: phases, coincides: false, rank: isAssigned ? 0 : 1, dotColor: phases[0].color, borderColor: phases[0].color + '44' }
                }),
                ...selectedTasks.map(b => ({ task: b, rank: 2, dotColor: 'var(--blue)', borderColor: 'var(--border)' })),
              ].sort((a, b) => a.rank - b.rank).map(({ ev, task, phasesOnDay, coincides, dotColor, borderColor }) => {
                // Il giorno selezionato è uno solo per tutta questa lista: se
                // è passato, il colore identificativo (puntino, bordo, badge
                // fase) si legge in grigio invece che nel colore vivo del tipo.
                if (isSelectedDayPast) { dotColor = 'var(--text2)'; borderColor = 'var(--border)' }

                // Task libero (creato dalla timeline "Assegna personale"):
                // riga semplice, niente location/fase/matita-cestino — il
                // tap apre il riepilogo (TaskSummaryModal), niente lista di
                // carico perché non è un evento Roadcase vero.
                if (task) {
                  // Un nome a testa per ogni persona nel gruppo (vedi
                  // taskGroupId in tasksByDate sopra) — stesso stile delle
                  // pillole degli eventi assegnati poco più sotto.
                  const taskAssignedNames = (task.assigned || [])
                    .map(b => b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName)
                    .filter(Boolean)
                  return (
                    <div key={`tk${task.id}`}
                      onClick={() => setSummaryTask(task)}
                      style={{ background:'#fff', border:`1px solid ${borderColor === 'var(--border)' ? '#e0ddd6' : borderColor}`, borderRadius:14, marginBottom:8, padding:'13px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                    >
                      <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: dotColor }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.label || t('staffTimeline.untitledTask')}</p>
                        <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{task.startTime} – {task.endTime}</p>
                        {taskAssignedNames.length > 0 && (
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:7 }}>
                            {taskAssignedNames.map(name => (
                              <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'var(--blue)' }}>
                                <User size={12} /> {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                const assignedNames = (ev.assignedWorkers || []).map(wid => workers.find(w => w.id === wid)?.name).filter(Boolean)
                // Promemoria scadenza (vedi utils/deadlines.js): non è una vera
                // lista di carico, non si apre e non si modifica/cancella da
                // qui — si cambia dalla scheda furgone/oggetto che l'ha
                // generato, altrimenti la scadenza e l'evento finirebbero
                // disallineati.
                if (ev.isDeadlineReminder) {
                  return (
                    <div key={ev.id} style={{ background:'#fff', border:`1px solid ${borderColor === 'var(--border)' ? '#e0ddd6' : borderColor}`, borderRadius:14, marginBottom:8, padding:'13px 14px', display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background: dotColor }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</p>
                      </div>
                      <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:'var(--text2)', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:8, padding:'3px 9px' }}>{t('deadlines.reminderBadge')}</span>
                    </div>
                  )
                }
                return (
                  <div key={ev.id}
                    onClick={() => setSummaryEvent(ev)}
                    style={{ background:'#fff', border:`1px solid ${borderColor === 'var(--border)' ? '#e0ddd6' : borderColor}`, borderRadius:14, marginBottom:8, cursor:'pointer' }}
                  >
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'13px 14px' }}>
                      <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, marginTop:5, background: dotColor }} />
                      <button type="button" className="btn-no-anim"
                        onClick={e => { e.stopPropagation(); setSummaryEvent(ev) }}
                        aria-label={t('events.openEventAria', { name: ev.name })}
                        style={{ flex:1, minWidth:0, background:'transparent', border:'none', padding:0, margin:0, textAlign:'left', font:'inherit', color:'inherit', cursor:'pointer' }}
                      >
                        <p style={{ fontWeight:700, fontSize:15, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                          {ev.type === 'installation' && <Wrench size={13} />}{ev.name}
                        </p>
                        {ev.location && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1, display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
                        {phasesOnDay && phasesOnDay.length > 0 && (() => {
                          // var(--text2) non si può concatenare con un suffisso
                          // alpha come un hex: colore/sfondo/bordo grigi vanno
                          // scelti a parte invece di derivarli dalla stessa stringa.
                          const eventColor = isSelectedDayPast ? 'var(--text2)' : 'var(--accent)'
                          const eventBg = isSelectedDayPast ? 'var(--card2)' : 'rgba(230,57,70,0.12)'
                          const eventBorder = isSelectedDayPast ? 'var(--border)' : 'rgba(230,57,70,0.35)'
                          return (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:5 }}>
                              {/* coincides: il titolo sopra è già il nome vero,
                                  ma da solo non dice che oggi è ANCHE la fase —
                                  il tag "Evento" accanto a quelli fase rende
                                  esplicito che vanno fatti entrambi oggi. Se
                                  montaggio e smontaggio coincidono lo stesso
                                  giorno, qui compaiono ENTRAMBI i badge (non
                                  solo il primo). */}
                              {coincides && (
                                <span style={{ display:'inline-block', background: eventBg, color: eventColor, border:`1px solid ${eventBorder}`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:800 }}>
                                  {t('calendar.genericEventTag')}
                                </span>
                              )}
                              {phasesOnDay.map(phase => {
                                const phaseColor = isSelectedDayPast ? 'var(--text2)' : phase.color
                                const phaseBg = isSelectedDayPast ? 'var(--card2)' : phase.color + '18'
                                const phaseBorder = isSelectedDayPast ? 'var(--border)' : phase.color + '44'
                                return (
                                  <span key={phase.key} style={{ display:'inline-block', background: phaseBg, color: phaseColor, border:`1px solid ${phaseBorder}`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:800 }}>
                                    {phase.label}
                                  </span>
                                )
                              })}
                            </div>
                          )
                        })()}
                        {assignedNames.length > 0 && (
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:7 }}>
                            {assignedNames.map(name => (
                              <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'var(--blue)' }}>
                                <User size={12} /> {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                      <div style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                        <EditButton onClick={e => openEdit(e, ev)} size={44} ariaLabel={t('events.editEventAria')} />
                        <DeleteButton onClick={e => deleteEvent(e, ev)} size={44} ariaLabel={t('events.deleteEventAria')} />
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

          {/* Assenze worker in questo giorno */}
          {selectedAbsences.length > 0 && (
            <div style={{ marginTop:14 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{t('calendar.absentSection')}</p>
              {selectedAbsences.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ flexShrink:0, color:'var(--text2)' }}><User size={18} /></span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:'var(--text)', display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                      {a.workerName}
                      {a.allDay === false && (a.startTime || a.endTime) && (
                        <span style={{ fontWeight:600, fontSize:12.5, color:'var(--text2)' }}>{a.startTime || '?'}–{a.endTime || '?'}</span>
                      )}
                      <AbsenceTypeBadge type={a.type} />
                    </p>
                    <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>
                      {a.reason || t('calendar.noReasonSpecified')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Le mie assenze — retraibile: è la lista COMPLETA delle proprie
              assenze (non solo quelle del giorno selezionato), quindi se
              aperta sempre finiva per allungare il pannello ad ogni giorno */}
          {myAbsences.length > 0 && (
            <div style={{ marginTop:14 }}>
              <button onClick={() => setMyAbsencesOpen(o => !o)} className="btn-no-anim" aria-expanded={myAbsencesOpen}
                style={{ width:'auto', display:'inline-flex', alignItems:'center', gap:6, marginBottom: myAbsencesOpen ? 8 : 0, background:'transparent', border:'none', padding:0 }}>
                <span style={{ color:'var(--text2)', display:'flex' }}><List size={13} /></span>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('calendar.myAbsences')}</span>
                <span style={{ background:'var(--bg3)', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700, color:'var(--text2)' }}>{myAbsences.length}</span>
                <span style={{ color:'var(--text2)', display:'flex', transition:'transform 0.2s', transform: myAbsencesOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </span>
              </button>
              {myAbsencesOpen && [...myAbsences].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(144,144,176,0.08)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:8 }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>🚫</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:13, color:'var(--text)', display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                      {a.startDate === a.endDate
                        ? formatDate(a.startDate+'T12:00:00', {day:'numeric',month:'long',year:'numeric'}, i18n.language)
                        : `${formatDate(a.startDate+'T12:00:00', {day:'numeric',month:'short'}, i18n.language)} → ${formatDate(a.endDate+'T12:00:00', {day:'numeric',month:'short',year:'numeric'}, i18n.language)}`}
                      {a.allDay === false && (a.startTime || a.endTime) && (
                        <span style={{ fontWeight:600, color:'var(--text2)' }}>{a.startTime || '?'}–{a.endTime || '?'}</span>
                      )}
                      <AbsenceTypeBadge type={a.type} />
                    </p>
                    {a.reason && <p style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>{a.reason}</p>}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => openEditAbsence(a)}
                      style={{ minHeight:44, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700 }}>
                      {t('common.edit')}
                    </button>
                    <button onClick={() => removeAbsence(a.id)}
                      style={{ minHeight:44, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700 }}>
                      {t('common.remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })()}

      {/* Vista "Assegna personale" — timeline settimanale ore per persona, vedi StaffTimeline.jsx */}
      {mode === 'assign' && (
        <StaffTimeline teamId={teamId} events={events} workers={workers} unavailability={unavailability} user={user} focusAssign={focusAssign} onFocusAssignConsumed={() => setFocusAssign(null)} />
      )}

      {/* FAB nuovo evento — solo in vista griglia, in "Assegna personale" lascia spazio alla lista.
          Su desktop trasforma la colonna laterale in un form invece di aprire
          il modal (sperimentale, vedi CalendarSidePanel); su mobile resta il
          modal di sempre, la colonna non esiste lì. Nascosto mentre il form è
          già aperto, per non doverci rinavigare sopra. */}
      {mode === 'grid' && !sidebarCreating && (
      <button
        onClick={() => { if (isMobile) { setShowCreate(true) } else { if (reportMode) cancelReportMode(); if (showAbsenceModal) closeAbsenceModal(); setEditingEvent(null); setSidebarCreating(true) } }}
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

      {/* Modal segnala assenza — SOLO mobile: su desktop lo stesso form vive
          dentro CalendarSidePanel (niente colonna lì, vedi sopra). */}
      {showAbsenceModal && isMobile && (
        <div className={`modal-overlay${absenceDrag.closing ? ' closing' : ''}`} onClick={absenceDrag.onOverlayClick}>
          <div className={`modal${absenceDrag.jiggling ? ' modal-jiggle' : ''}${absenceDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...absenceDrag.props}>
            <button className="close-btn" onClick={absenceDrag.close} aria-label={t("common.close")}>✕</button>
            <h2>{editingAbsenceId ? t('calendar.absenceModalEditTitle') : t('calendar.absenceModalTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16, lineHeight:1.5 }}>{t('calendar.absenceModalDesc')}</p>
            <div className="form-group">
              <label>{t('calendar.firstDay')}</label>
              <DateField value={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({...f, startDate:v, endDate: f.endDate < v ? v : f.endDate}))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.lastDay')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('calendar.lastDayHint')}</span></label>
              <DateField value={absenceForm.endDate} min={absenceForm.startDate} clearable placeholder={t('calendar.singleDayPlaceholder')} onChange={v => setAbsenceForm(f => ({...f, endDate:v}))} />
            </div>
            {/* Solo per un'assenza di un giorno solo — "qualche ora" su più
                giorni non ha senso con un unico orario, vedi commento su
                allDay in addAbsence sopra. */}
            {(!absenceForm.endDate || absenceForm.endDate === absenceForm.startDate) && (
              <div className="form-group">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <label style={{ marginBottom:0 }}>{t('calendar.absenceHoursLabel')}</label>
                  <button type="button" onClick={() => setAbsenceForm(f => ({ ...f, allDay: !f.allDay }))} aria-pressed={absenceForm.allDay}
                    style={{
                      flexShrink:0, display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:20,
                      background: absenceForm.allDay ? 'var(--accent)' : 'var(--card2)',
                      color: absenceForm.allDay ? '#fff' : 'var(--text2)',
                      border: `1px solid ${absenceForm.allDay ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize:13, fontWeight:700, whiteSpace:'nowrap',
                    }}>
                    {t('events.allDayLabel')}
                  </button>
                </div>
                {!absenceForm.allDay && (
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <label style={{ fontSize:11, color:'var(--text2)', fontWeight:700, display:'block', marginBottom:4 }}>{t('events.timeStartLabel')}</label>
                      <TimeField value={absenceForm.startTime} onChange={v => setAbsenceForm(f => ({ ...f, startTime:v }))} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <label style={{ fontSize:11, color:'var(--text2)', fontWeight:700, display:'block', marginBottom:4 }}>{t('events.timeEndLabel')}</label>
                      <TimeField value={absenceForm.endTime} onChange={v => setAbsenceForm(f => ({ ...f, endTime:v }))} clearable />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="form-group">
              <label>{t('calendar.absenceTypeLabel')}</label>
              <SegmentedControl options={absenceTypeOptions(t)} value={absenceForm.type} onChange={v => setAbsenceForm(f => ({...f, type:v}))} />
            </div>
            <div className="form-group">
              <label htmlFor="cal-absence-reason">{t('calendar.reason')} <span style={{ color:'var(--text2)', fontWeight:400, fontSize:12 }}>{t('common.optional')}</span></label>
              <input id="cal-absence-reason" value={absenceForm.reason} onChange={e => setAbsenceForm(f => ({...f, reason:e.target.value}))} placeholder={t('calendar.reasonPlaceholder')} />
            </div>
            <button onClick={addAbsence} className="btn btn-primary btn-full" style={{ marginTop:8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
              disabled={savingAbsence || !absenceForm.startDate}>
              {savingAbsence ? t('common.saving') : <><Check size={16} /> {editingAbsenceId ? t('common.save') : t('calendar.confirmAbsence')}</>}
            </button>
          </div>
        </div>
      )}

      {/* Creazione evento — flusso condiviso con Events.jsx, vedi CreateEventFlow.jsx */}
      <CreateEventFlow
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialDate={selectedDate || todayStr}
        skipChoice="blank"
        onCreated={(eventId, { fromTemplate }) => { if (fromTemplate) navigate(`/events/${eventId}`) }}
      />

      {/* Riepilogo rapido evento — tap su un evento già esistente, sia in
          griglia che nella timeline "Assegna personale" */}
      {summaryEvent && (
        <EventSummaryModal event={summaryEvent} date={selectedDate} blocks={assignmentBlocks} workers={workers} onClose={() => setSummaryEvent(null)} />
      )}

      {/* Stesso riepilogo per i task liberi — niente shortcut lista di carico */}
      {summaryTask && isMobile && (
        <TaskSummaryModal block={summaryTask} workers={workers} onClose={() => setSummaryTask(null)} />
      )}

      {/* Modal modifica evento — SOLO mobile: su desktop lo stesso form vive
          dentro CalendarSidePanel (niente più modal per il Calendario lì). */}
      {editingEvent && isMobile && (
        <div className={`modal-overlay${editDrag.closing ? ' closing' : ''}`} onClick={editDrag.onOverlayClick}>
          <div className={`modal${editDrag.jiggling ? ' modal-jiggle' : ''}${editDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...editDrag.props}>
            <button className="close-btn" onClick={editDrag.close} aria-label={t("common.close")}>✕</button>
            <h2>{t('calendar.editEventTitle')}</h2>
            {/* Stessi campi della colonna desktop (EventFormFields). */}
            <div className="rc-ev-form" style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <EventFormFields form={editForm} setForm={setEditForm} idp="cal-edit" teamId={teamId} today={todayStr} useRange />
            </div>
            <button onClick={saveEdit} className="btn btn-primary btn-full" style={{ marginTop:20 }}
              disabled={saving || !editForm.name?.trim() || !editForm.date}>
              {saving ? t('common.saving') : t('calendar.saveChanges')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
