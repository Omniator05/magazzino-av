import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase'
import { useConfirm } from '../context/ConfirmProvider'
import { formatDate, capitalize } from '../utils/formatDate'
import { isWorkerUnavailable } from '../utils/workerAssignment'
import { createAssignmentBlock, updateAssignmentBlock, deleteAssignmentBlock, personColor } from '../utils/assignmentBlocks'
import { watchExternalWorkers, getOrCreateExternalWorker } from '../utils/externalWorkers'
import AssignmentBlockModal from './AssignmentBlockModal'
import EventDayHoursModal from './EventDayHoursModal'
import QuickExternalPopup from './QuickExternalPopup'
import EventSummaryModal from './EventSummaryModal'
import { ChevronLeft, ChevronRight, Plus, Wrench } from './Icon'

// Fascia oraria mostrata nella timeline — copre il grosso dei turni di un
// evento (montaggio mattutino fino a smontaggio serale); non è un limite
// hard, un blocco fuori fascia si vede comunque "appiattito" al bordo.
// Vista pensata quasi esclusivamente per desktop (tanta informazione in
// poco spazio): griglia e corsie più grandi di una tipica vista mobile,
// con solo lo scroll-snap a reggere lo schermo stretto come fallback.
const TIMELINE_START_HOUR = 7
const TIMELINE_END_HOUR = 23
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR
// Ogni item è UNA card (come all'inizio: titolo dentro, non più una striscia
// sottile) che però cresce in altezza man mano che si assegnano persone — una
// riga in più per ciascuna, con una barra colorata posizionata/larga secondo
// le SUE ore all'interno della durata dell'evento: è il punto centrale di
// questa vista, vedere a colpo d'occhio quanto qualcuno è impegnato, non solo
// che è stato assegnato. Le corsie (lanes) hanno quindi altezza variabile,
// calcolata una volta per tutta la settimana (il lane N è alto quanto il suo
// occupante più "pieno" in uno qualsiasi dei 7 giorni) così le colonne
// restano allineate fra loro.
const CARD_PAD = 7
const TITLE_ROW_H = 21
const PERSON_ROW_H = 16
const ROW_GAP = 3
const ITEM_MARGIN = 4 // sopra e sotto ogni card, dentro la propria corsia
const EMPTY_ITEM_H = CARD_PAD * 2 + TITLE_ROW_H
// L'altezza dipende da quante RIGHE di persone servono, non da quante
// persone sono assegnate — due persone su metà giornata ciascuna, senza
// sovrapposizione oraria, stanno affiancate sulla stessa riga (vedi
// packPersonLanes più sotto), non una sopra l'altra.
function itemContentHeight(personLaneCount) {
  return EMPTY_ITEM_H + (personLaneCount > 0 ? personLaneCount * (PERSON_ROW_H + ROW_GAP) : 0)
}
const MIN_LANES = 2
const DEFAULT_START = `${String(TIMELINE_START_HOUR).padStart(2, '0')}:00`
const DEFAULT_END = `${String(TIMELINE_END_HOUR).padStart(2, '0')}:00`
// Solo le linee verticali (ogni ora, il grano della selezione cella) restano
// un pattern CSS ripetuto — quelle orizzontali, non più equidistanti con
// corsie di altezza variabile, si disegnano come divisori espliciti (vedi
// render più sotto).
const VERTICAL_GRID_BG = `repeating-linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent calc(100%/${TIMELINE_HOURS}))`
// Righello orario sopra la griglia — un'etichetta ogni 2 ore (le linee
// verticali restano una per ogni ora, questo è solo il testo): senza non
// c'era alcun riferimento a che ora corrispondesse una colonna, solo le
// linee senza numeri.
const RULER_STEP_HOURS = 2
const RULER_HOURS = Array.from({ length: Math.floor(TIMELINE_HOURS / RULER_STEP_HOURS) + 1 }, (_, i) => TIMELINE_START_HOUR + i * RULER_STEP_HOURS)

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// La finestra di 7 giorni parte sempre da oggi, non dal lunedì della
// settimana corrente: qui il passato non serve mai (solo consultazione, non
// si assegna nessuno a un evento già concluso), quindi non ha senso
// sprecarci una colonna. Spostandosi di 7 giorni alla volta la colonna 0
// resta sempre lo stesso giorno della settimana di oggi — l'allineamento
// non peggiora navigando, è solo un punto di partenza diverso da Lun-Dom.
function startOfDay(d) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return m
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function pad(n) { return String(n).padStart(2, '0') }
function timeToFraction(hm) {
  const [h, m] = hm.split(':').map(Number)
  return Math.min(Math.max((h + m / 60 - TIMELINE_START_HOUR) / TIMELINE_HOURS, 0), 1)
}
function blockPosition(startTime, endTime) {
  const left = timeToFraction(startTime)
  const right = timeToFraction(endTime)
  return { left: `${left * 100}%`, width: `${Math.max(right - left, 0.02) * 100}%` }
}
// Posizione della barra di una persona RELATIVA alla durata dell'item (non
// alla giornata intera): l'item è già posizionato/largo secondo le sue ore,
// quindi la barra interna va espressa in percentuale del SUO contenitore —
// piena larghezza se la persona copre tutto l'evento, più stretta e
// spostata se ne copre solo una parte.
function relativeBarPos(item, a) {
  const evStart = timeToFraction(item.startTime)
  const evEnd = timeToFraction(item.endTime)
  const span = Math.max(evEnd - evStart, 0.0001)
  const pStart = timeToFraction(a.startTime)
  const pEnd = timeToFraction(a.endTime)
  const left = Math.min(Math.max((pStart - evStart) / span, 0), 1)
  const right = Math.min(Math.max((pEnd - evStart) / span, 0), 1)
  return { left: `${left * 100}%`, width: `${Math.max(right - left, 0.03) * 100}%` }
}
// Ora intera (grano della selezione a celle) dalla posizione X del click
// dentro la colonna del giorno.
function hourSlotFromClientX(clientX, rect) {
  const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.999)
  return Math.floor(frac * TIMELINE_HOURS)
}
// Corsia (riga) dalla posizione Y del click dentro la colonna del giorno —
// la selezione resta sempre dentro la riga su cui si è cliccato la prima
// volta, invece di coprire in altezza anche le corsie con altri eventi.
// Le corsie hanno altezza variabile (laneHeights/laneTop), non più uniforme.
function laneFromClientY(clientY, rect, laneTop, laneHeights) {
  const y = clientY - rect.top
  for (let i = 0; i < laneTop.length; i++) {
    if (y < laneTop[i] + laneHeights[i]) return i
  }
  return laneTop.length - 1
}
// Un evento compare nei giorni che tocca (anche multi-giorno, come
// eventsByDate in Calendar.jsx): se QUEL giorno ha un orario su misura
// (event.dayTimes, impostato toccando il titolo della card — vedi
// dayHoursModal più sotto) usa quello; sul giorno con l'orario "proprio"
// dell'evento (event.date, se non è "tutto il giorno") usa quello; sugli
// altri giorni "di passaggio" occupa l'intera fascia (è comunque in corso,
// nessun orario più preciso impostato).
function eventTimeForDay(ev, date) {
  const custom = ev.dayTimes?.[date]
  if (custom?.timeStart && custom?.timeEnd) return [custom.timeStart, custom.timeEnd]
  if (ev.date === date && ev.allDay === false && ev.timeStart && ev.timeEnd) return [ev.timeStart, ev.timeEnd]
  return [DEFAULT_START, DEFAULT_END]
}
// Impacchetta gli item di un giorno (eventi + fasi + task) in corsie senza
// sovrapposizioni orarie — stesso algoritmo greedy di un day-view di
// calendario: un nuovo item va nella prima corsia già libera a quell'ora,
// altrimenti ne apre una nuova. Ordinati prima per priorità (evento > fase >
// rent > task) e solo a parità per orario, così le corsie in alto sono
// sempre quelle "più importanti", non solo le più mattiniere.
function packLanes(items) {
  const sorted = [...items].sort((a, b) => (a.rank - b.rank) || a.startTime.localeCompare(b.startTime))
  const laneEnds = []
  const laneOf = {}
  sorted.forEach(it => {
    let lane = laneEnds.findIndex(end => end <= it.startTime)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.endTime) }
    else laneEnds[lane] = it.endTime
    laneOf[it.key] = lane
  })
  return { laneOf, laneCount: Math.max(laneEnds.length, MIN_LANES) }
}

// Stesso algoritmo greedy di packLanes ma per le persone assegnate DENTRO
// un singolo item: se due assegnazioni non si sovrappongono in orario (es.
// metà giornata a testa) finiscono sulla stessa riga invece che impilate —
// la card resta più compatta quando c'è spazio per stare affiancati.
function packPersonLanes(assigned) {
  const sorted = [...assigned].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const laneEnds = []
  const laneOf = {}
  sorted.forEach(a => {
    let lane = laneEnds.findIndex(end => end <= a.startTime)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(a.endTime) }
    else laneEnds[lane] = a.endTime
    laneOf[a.id] = lane
  })
  return { laneOf, laneCount: laneEnds.length }
}
function assignedMeta(assigned) {
  const { laneOf, laneCount } = packPersonLanes(assigned)
  return { personLaneOf: laneOf, personLaneCount: laneCount, contentHeight: itemContentHeight(laneCount) }
}

// Immagine di drag personalizzata: il drag-image nativo del browser a volte
// perde il border-radius del chip (soprattutto Safari) e mostra un
// rettangolo spigoloso invece della pillola arrotondata. Un piccolo nodo
// clonato fuori schermo, passato a setDragImage, garantisce lo stesso
// aspetto su ogni browser — rimosso al tick successivo, non serve a altro.
function makeDragGhost({ label, dotColor, dashed }) {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed; top:-200px; left:-200px; display:flex; align-items:center; gap:6px; padding:7px 13px; border-radius:20px; background:var(--card); border:${dashed ? '1.5px dashed var(--border2)' : '1px solid var(--border)'}; font-family:inherit; font-size:12.5px; font-weight:700; color:${dashed ? 'var(--text2)' : 'var(--text)'}; white-space:nowrap;`
  if (dotColor) {
    const dot = document.createElement('span')
    dot.style.cssText = `width:7px; height:7px; border-radius:50%; flex-shrink:0; background:${dotColor};`
    el.appendChild(dot)
  }
  el.appendChild(document.createTextNode(label))
  document.body.appendChild(el)
  return el
}
function setChipDragImage(e, opts) {
  const ghost = makeDragGhost(opts)
  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
  setTimeout(() => ghost.remove(), 0)
}

const QUICK_EXTERNAL = { id: '__quick_external__', kind: 'quick-external' }
// Stessi colori di PHASE_META in Calendar.jsx, per coerenza visiva fra le due viste.
const PHASE_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }

// Timeline settimanale "Assegna personale": gli eventi già in calendario
// compaiono da soli, posizionati per giorno/ora — si trascina (o si
// seleziona col tap, su mobile) il nome di un magazziniere/esterno sopra
// l'evento per assegnarlo. Toccando due celle vuote (inizio e fine, stesso
// schema tap-tap del selettore di intervallo già usato altrove in
// Calendar.jsx) si crea un task libero per quell'orario, con o senza
// persona assegnata. Colonne giorno in flex con min-width responsive:
// desktop i 7 giorni affiancati e larghi, mobile si scorre/snappa un
// giorno alla volta — nessuna logica JS di breakpoint.
export default function StaffTimeline({ teamId, events, workers, unavailability, user, focusAssign, onFocusAssignConsumed }) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  // Settimana e filtri ricordati tra una visita e l'altra (sessionStorage,
  // si perde solo chiudendo la scheda) — altrimenti ogni volta che si passa
  // di qui (es. per aprire la lista di carico di un evento e tornare
  // indietro) la vista ripartiva da oggi con tutti i filtri riattivati.
  // Letto una sola volta al mount (useState, non ricalcolato ad ogni render).
  const [savedView] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('staffTimeline_view')) } catch { return null }
  })
  const [weekStart, setWeekStart] = useState(() => savedView?.weekStart ? startOfDay(new Date(savedView.weekStart + 'T12:00:00')) : startOfDay(new Date()))
  const [blocks, setBlocks] = useState([])
  const [externalWorkers, setExternalWorkers] = useState([])
  const [shownExternalIds, setShownExternalIds] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null) // {id, kind, name} — tap-tap mobile
  const [draggedPerson, setDraggedPerson] = useState(null)
  const [modalState, setModalState] = useState(null)
  const [summaryTarget, setSummaryTarget] = useState(null) // {event, date} — riepilogo di un evento/fase già esistente
  const [dayHoursModal, setDayHoursModal] = useState(null) // {event, date} — orario su misura di QUEL giorno (eventi multi-giorno)
  const [pendingQuickExternal, setPendingQuickExternal] = useState(null) // {item}
  const [rangeSelect, setRangeSelect] = useState(null) // {date, lane, startHour}
  const [hoverHour, setHoverHour] = useState(null)
  const [hoverCell, setHoverCell] = useState(null) // {date, occupied} — solo per il cursore a riposo
  const [dragOverKey, setDragOverKey] = useState(null) // item.key sotto il drag di una persona
  // Filtro attività — eventi, rent/install e fasi montaggio-smontaggio sono
  // spesso "rumore di fondo" diverso a seconda di chi pianifica le ore,
  // quindi si possono togliere dalla vista uno alla volta.
  const [showEvents, setShowEvents] = useState(savedView?.showEvents ?? true)
  const [showInstallations, setShowInstallations] = useState(savedView?.showInstallations ?? true)
  const [showPhases, setShowPhases] = useState(savedView?.showPhases ?? true)
  useEffect(() => {
    try {
      sessionStorage.setItem('staffTimeline_view', JSON.stringify({
        weekStart: toDateStr(weekStart), showEvents, showInstallations, showPhases,
      }))
    } catch {}
  }, [weekStart, showEvents, showInstallations, showPhases])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => watchExternalWorkers(teamId, setExternalWorkers), [teamId])

  const cancelRangeSelect = () => { setRangeSelect(null); setHoverHour(null) }

  // Esc o tasto destro del mouse annullano una selezione a metà — il destro
  // non deve anche aprire il menu contestuale del browser.
  useEffect(() => {
    if (!rangeSelect) return
    const onKey = e => { if (e.key === 'Escape') cancelRangeSelect() }
    const onContextMenu = e => { e.preventDefault(); cancelRangeSelect() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [rangeSelect])

  const todayStr = toDateStr(new Date())
  const PHASE_META = {
    montaggio: { color: PHASE_COLORS.montaggio, label: t('calendar.legendAssembly') },
    smontaggio: { color: PHASE_COLORS.smontaggio, label: t('calendar.legendDisassembly') },
  }

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => toDateStr(addDays(weekStart, i))), [weekStart])
  const weekEnd = weekDates[6]

  // I promemoria scadenza (vedi utils/deadlines.js) non sono una vera
  // prenotazione da assegnare — esclusi qui come già in Events.jsx/
  // WorkerHome.jsx/Archive.jsx/Dashboard.jsx.
  const weekEvents = useMemo(() => events
    .filter(ev => {
      if (!ev.date || ev.isDeadlineReminder) return false
      const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
      return !(end < weekDates[0] || ev.date > weekEnd)
    })
    .sort((a, b) => a.date.localeCompare(b.date)), [events, weekDates, weekEnd])

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events])

  const weekBlockExternalIds = useMemo(() => {
    const set = new Set()
    blocks.forEach(b => { if (b.externalWorkerId && weekDates.includes(b.date)) set.add(b.externalWorkerId) })
    return set
  }, [blocks, weekDates])

  const activeWorkers = workers.filter(w => w.active !== false)
  const people = [
    ...activeWorkers.map(w => ({ id: w.id, name: w.name || t('common.noName'), kind: 'worker' })),
    ...externalWorkers
      .filter(w => weekBlockExternalIds.has(w.id) || shownExternalIds.includes(w.id))
      .map(w => ({ id: w.id, name: w.name, kind: 'external' })),
  ]

  // Item per giorno: gli eventi che toccano quel giorno (sempre, anche senza
  // nessuno assegnato: è il punto — vederli per poterci allocare qualcuno) +
  // le fasi (montaggio/smontaggio) che cadono su un giorno diverso da quello
  // dell'evento vero e proprio (altrimenti lì non comparirebbe nulla da
  // assegnare) + i task liberi creati su quel giorno. Priorità fissa:
  // evento vero (0) > fase (1) > task libero (2) > rent/install (3, sempre
  // per ultimo) — usata sia per l'ordine di impacchettamento delle corsie
  // (packLanes) sia, implicitamente, per quale item vince la prima corsia in alto.
  const itemsByDay = useMemo(() => {
    const map = {}
    weekDates.forEach(date => {
      const dayEvents = weekEvents.filter(ev => {
        const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
        return date >= ev.date && date <= end
      })
      const dayEventItems = dayEvents
        .filter(ev => ev.type === 'installation' ? showInstallations : showEvents)
        .map(ev => {
          const [startTime, endTime] = eventTimeForDay(ev, date)
          const rank = ev.type === 'installation' ? 3 : 0
          const assigned = blocks.filter(b => b.eventId === ev.id && b.date === date)
          return { key: `ev${ev.id}`, type: 'event', event: ev, date, startTime, endTime, rank, assigned, ...assignedMeta(assigned) }
        })
      const dayPhaseItems = !showPhases ? [] : weekEvents
        .filter(ev => !dayEvents.some(e => e.id === ev.id))
        .flatMap(ev => Object.entries(ev.phases || {})
          .filter(([key, pdate]) => pdate === date && PHASE_META[key])
          .map(([key]) => {
            const assigned = blocks.filter(b => b.eventId === ev.id && b.date === date)
            return { key: `ph${ev.id}-${key}`, type: 'phase', event: ev, phaseKey: key, date, startTime: DEFAULT_START, endTime: DEFAULT_END, rank: 1, assigned, ...assignedMeta(assigned) }
          }))
      const dayTasks = blocks
        .filter(b => b.date === date && !b.eventId)
        .map(b => {
          const assigned = (b.workerId || b.externalWorkerId) ? [b] : []
          return { key: `tk${b.id}`, type: 'task', block: b, date, startTime: b.startTime, endTime: b.endTime, rank: 2, assigned, ...assignedMeta(assigned) }
        })
      map[date] = [...dayEventItems, ...dayPhaseItems, ...dayTasks]
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekEvents, blocks, weekDates, showEvents, showInstallations, showPhases])

  // Corsie: l'assegnazione (quale lane) dipende solo da orario/priorità,
  // uguale per tutti i 7 giorni — calcolata una volta e riusata sia per il
  // render sia per capire a quale corsia corrisponde un click in verticale.
  const dayLaneInfo = useMemo(() => {
    const info = {}
    weekDates.forEach(date => { info[date] = packLanes(itemsByDay[date]) })
    return info
  }, [itemsByDay, weekDates])

  // +1 oltre la corsia più piena della settimana: garantisce una riga
  // sempre libera in fondo anche nel giorno più occupato, pronta per
  // aggiungere un'attività senza dover prima liberare spazio.
  const laneCount = Math.max(MIN_LANES, ...weekDates.map(d => dayLaneInfo[d].laneCount)) + 1

  // Altezza di ogni corsia: quanto serve al suo occupante più "pieno" in uno
  // qualsiasi dei 7 giorni (+ margine) — così tutte le colonne restano
  // allineate pur avendo contenuti diversi, invece di un'altezza fissa che
  // o spreca spazio o taglia chi ha più persone assegnate.
  const laneHeights = useMemo(() => {
    const heights = Array(laneCount).fill(EMPTY_ITEM_H)
    weekDates.forEach(date => {
      const { laneOf } = dayLaneInfo[date]
      itemsByDay[date].forEach(item => {
        const l = laneOf[item.key]
        heights[l] = Math.max(heights[l], item.contentHeight)
      })
    })
    return heights.map(h => h + ITEM_MARGIN * 2)
  }, [itemsByDay, dayLaneInfo, laneCount, weekDates])

  const laneTop = useMemo(() => {
    const offsets = []
    let acc = 0
    laneHeights.forEach(h => { offsets.push(acc); acc += h })
    return offsets
  }, [laneHeights])

  const totalGridHeight = laneHeights.reduce((a, b) => a + b, 0)

  // Un'ora è "occupata" in quella corsia se una card (evento/fase/task) la
  // coperta già — serve a bloccare la selezione a celle nel piccolo margine
  // sopra/sotto una card esistente, che altrimenti sembra libero ma non lo è.
  const laneHourOccupied = (date, lane, hour) => itemsByDay[date].some(it => {
    if (dayLaneInfo[date].laneOf[it.key] !== lane) return false
    const s = Math.floor(timeToFraction(it.startTime) * TIMELINE_HOURS)
    const e = Math.ceil(timeToFraction(it.endTime) * TIMELINE_HOURS)
    return hour >= s && hour < e
  })

  const openTaskModal = (block) => setModalState({ mode: 'edit', block })
  const openCreateForEvent = (ev, date) => {
    const [startTime, endTime] = eventTimeForDay(ev, date)
    setModalState({ mode: 'create', date, startTime, endTime, eventId: ev.id })
  }
  const openCreateTask = (date, startTime, endTime) => setModalState({ mode: 'create', date, startTime, endTime })
  const closeModal = () => setModalState(null)

  // Orario su misura di un giorno di un evento multi-giorno (vedi
  // eventTimeForDay sopra) — campo annidato (dayTimes.<data>) così si scrive
  // solo quel giorno senza leggere/riscrivere l'intera mappa. deleteField()
  // per "ripristina" invece di un oggetto vuoto: altrimenti la chiave
  // resterebbe lì con valore vuoto invece di sparire davvero.
  const saveDayHours = async (event, date, startTime, endTime) => {
    await updateDoc(doc(db, 'events', event.id), { [`dayTimes.${date}`]: { timeStart: startTime, timeEnd: endTime } })
    return true
  }
  const resetDayHours = async (event, date) => {
    await updateDoc(doc(db, 'events', event.id), { [`dayTimes.${date}`]: deleteField() })
  }

  // Arrivo come scorciatoia da EventDetail.jsx (bottone "Assegna" nella
  // lista di carico, vedi Calendar.jsx) — salta alla settimana dell'evento e
  // apre subito il modale di assegnazione, come se si fosse toccato quella
  // card. onFocusAssignConsumed azzera il target lato Calendar.jsx così non
  // si riapre da solo a ogni re-render.
  useEffect(() => {
    if (!focusAssign) return
    setWeekStart(startOfDay(new Date(focusAssign.date + 'T12:00:00')))
    const ev = events.find(e => e.id === focusAssign.eventId)
    if (ev) openCreateForEvent(ev, focusAssign.date)
    onFocusAssignConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAssign])

  // Assegna/disassegna una persona a un EVENTO (drag o tap-tap): toggle come
  // il vecchio handleAssign — ritrascinare la stessa persona la rimuove.
  const assignToEvent = async (ev, date, person) => {
    if (!person) return
    const existing = blocks.find(b => b.eventId === ev.id && b.date === date &&
      (person.kind === 'worker' ? b.workerId === person.id : b.externalWorkerId === person.id))
    if (existing) { await deleteAssignmentBlock(existing, { eventsById, allBlocks: blocks }); return }
    if (person.kind === 'worker' && isWorkerUnavailable(person.id, { date, dateEnd: date }, unavailability)) {
      const ok = await confirm({
        title: t('calendar.confirmUnavailableTitle'),
        message: t('calendar.confirmUnavailableMessage', { name: person.name, event: ev.name }),
        confirmLabel: t('calendar.confirmUnavailableLabel'),
        danger: true,
      })
      if (!ok) return
    }
    const [startTime, endTime] = eventTimeForDay(ev, date)
    await createAssignmentBlock({
      teamId, date, startTime, endTime,
      workerId: person.kind === 'worker' ? person.id : null,
      externalWorkerId: person.kind === 'external' ? person.id : null,
      externalWorkerName: person.kind === 'external' ? person.name : null,
      eventId: ev.id, label: '', createdBy: user.uid,
    }, { eventsById, allBlocks: blocks })
  }

  // Assegna/sostituisce la persona su un TASK libero (un solo slot persona
  // per task — per più persone sulla stessa commissione si creano più task).
  const assignToTask = async (block, person) => {
    if (!person) return
    await updateAssignmentBlock(block.id, block, {
      workerId: person.kind === 'worker' ? person.id : null,
      externalWorkerId: person.kind === 'external' ? person.id : null,
      externalWorkerName: person.kind === 'external' ? person.name : null,
    }, { eventsById, allBlocks: blocks })
  }

  // Una fase (montaggio/smontaggio) è legata allo stesso evento della card
  // principale, solo su una data diversa — va assegnata con assignToEvent
  // esattamente come l'evento vero (item.event + item.date), NON con
  // assignToTask: le fasi non hanno un item.block proprio (quello esiste
  // solo per i task liberi), quindi finirci dentro avrebbe sempre fallito.
  const handleDropOrTap = (item, person) => {
    if (!person) return
    if (person.kind === 'quick-external') { setPendingQuickExternal({ item }); return }
    if (item.type === 'event' || item.type === 'phase') assignToEvent(item.event, item.date, person)
    else assignToTask(item.block, person)
    setSelectedPerson(null)
  }

  const confirmQuickExternal = async (name) => {
    const id = await getOrCreateExternalWorker(teamId, name, user.uid, externalWorkers)
    setShownExternalIds(ids => (ids.includes(id) ? ids : [...ids, id]))
    const person = { id, kind: 'external', name }
    const { item } = pendingQuickExternal
    if (item.type === 'event' || item.type === 'phase') await assignToEvent(item.event, item.date, person)
    else await assignToTask(item.block, person)
    setPendingQuickExternal(null)
    setSelectedPerson(null)
  }

  const handleSubmit = async (payload) => {
    let externalWorkerId = payload.externalWorkerId
    if (payload.personType === 'external' && !externalWorkerId) {
      externalWorkerId = await getOrCreateExternalWorker(teamId, payload.externalWorkerName, user.uid, externalWorkers)
    }
    const shared = {
      startTime: payload.startTime, endTime: payload.endTime,
      workerId: payload.workerId || null,
      externalWorkerId: payload.personType === 'external' ? externalWorkerId : null,
      externalWorkerName: payload.personType === 'external' ? payload.externalWorkerName : null,
      eventId: payload.eventId || null,
      label: payload.label || '',
      description: payload.description || '',
    }
    if (modalState.mode === 'create') {
      await createAssignmentBlock({ ...shared, teamId, date: modalState.date, createdBy: user.uid }, { eventsById, allBlocks: blocks })
    } else {
      await updateAssignmentBlock(modalState.block.id, modalState.block, shared, { eventsById, allBlocks: blocks })
    }
    if (externalWorkerId) setShownExternalIds(ids => (ids.includes(externalWorkerId) ? ids : [...ids, externalWorkerId]))
    return true
  }

  const handleDelete = async () => {
    await deleteAssignmentBlock(modalState.block, { eventsById, allBlocks: blocks })
  }

  const handleGridClick = (e, date) => {
    if (selectedPerson || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = hourSlotFromClientX(e.clientX, rect)
    if (!rangeSelect || rangeSelect.date !== date) {
      // La riga si fissa qui, al primo tocco — il secondo tap conta solo per
      // l'ora di fine, non può più "scivolare" su un'altra corsia. Se la
      // cella di partenza è già coperta da una card esistente, niente da
      // fare: non si avvia nessuna selezione lì.
      const lane = laneFromClientY(e.clientY, rect, laneTop, laneHeights)
      if (laneHourOccupied(date, lane, hour)) return
      setRangeSelect({ date, lane, startHour: hour }); setHoverHour(hour); return
    }
    if (rangeSelect.startHour === hour) { cancelRangeSelect(); return }
    const lo = Math.min(rangeSelect.startHour, hour), hi = Math.max(rangeSelect.startHour, hour)
    // L'intero intervallo deve essere libero in quella corsia, non solo i
    // due estremi — altrimenti si creerebbe un task sovrapposto a una card.
    for (let h = lo; h <= hi; h++) { if (laneHourOccupied(date, rangeSelect.lane, h)) return }
    setRangeSelect(null); setHoverHour(null)
    openCreateTask(date, `${pad(TIMELINE_START_HOUR + lo)}:00`, `${pad(TIMELINE_START_HOUR + hi + 1)}:00`)
  }

  const weekRangeLabel = `${formatDate(weekDates[0] + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} – ${formatDate(weekEnd + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}`
  // Sulla settimana corrente "Oggi" è già dove siamo (rosso, informativo);
  // appena ci si allontana diventa grigio, un invito a tornare — l'hover lo
  // riaccende di rosso per far capire che il tap riporta alla data odierna.
  const isCurrentWeek = weekDates[0] === todayStr

  return (
    <div style={{ padding: '14px 16px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="staff-nav-btn" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label={t('staffTimeline.prevWeekAria')} style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><ChevronLeft size={16} /></button>
        <button className="staff-nav-today" onClick={() => setWeekStart(startOfDay(new Date()))} style={{ textAlign: 'center', background: 'none', border: 'none', padding: '4px 16px', borderRadius: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 800 }}>{capitalize(weekRangeLabel)}</p>
          <p className="staff-nav-today-label" style={{ fontSize: 12.5, color: isCurrentWeek ? 'var(--accent)' : 'var(--text2)', fontWeight: 800 }}>{t('calendar.today')}</p>
        </button>
        <button className="staff-nav-btn" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label={t('staffTimeline.nextWeekAria')} style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><ChevronRight size={16} /></button>
      </div>

      {/* Striscia persone — trascinabile su desktop, tap-tap su mobile (tocca
          la persona, poi tocca l'evento/task su cui assegnarla). Il primo
          chip, "Esterno", è generico: lo si assegna come chiunque altro, ma
          invece di creare subito un'assegnazione apre un popup per il nome. */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>
        {t('staffTimeline.peopleLabel')} {selectedPerson ? t('staffTimeline.peopleHint') : rangeSelect ? t('staffTimeline.rangeSelectHint') : ''}
      </p>
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
        {(() => {
          const isQuickSelected = selectedPerson?.kind === 'quick-external'
          return (
            <button className="chip-no-press"
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', 'x')
                setDraggedPerson(QUICK_EXTERNAL)
                setChipDragImage(e, { label: t('staffTimeline.externalQuickChip'), dashed: true })
              }}
              onDragEnd={() => { setDraggedPerson(null); setDragOverKey(null) }}
              onClick={() => setSelectedPerson(sel => (sel?.kind === 'quick-external') ? null : QUICK_EXTERNAL)}
              aria-pressed={isQuickSelected}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 13px', borderRadius: 20,
                background: isQuickSelected ? 'rgba(216,56,63,0.12)' : 'transparent',
                border: `1.5px dashed ${isQuickSelected ? 'var(--accent)' : 'var(--border2)'}`,
                fontSize: 12.5, fontWeight: 700, color: isQuickSelected ? 'var(--accent)' : 'var(--text2)',
                cursor: 'grab', whiteSpace: 'nowrap',
              }}
            >
              <Plus size={12} /> {t('staffTimeline.externalQuickChip')}
            </button>
          )
        })()}
        {people.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', alignSelf: 'center' }}>{t('calendar.noActiveWorkers')}</p>}
        {people.map(p => {
          const isSelected = selectedPerson?.id === p.id && selectedPerson?.kind === p.kind
          return (
            <div key={`${p.kind}-${p.id}`} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                className="chip-no-press"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', 'x')
                  setDraggedPerson(p)
                  setChipDragImage(e, { label: p.name, dotColor: personColor(p.id) })
                }}
                onDragEnd={() => { setDraggedPerson(null); setDragOverKey(null) }}
                onClick={() => setSelectedPerson(sel => (sel?.id === p.id && sel?.kind === p.kind) ? null : p)}
                aria-pressed={isSelected}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 13px', borderRadius: 20,
                  background: isSelected ? 'rgba(216,56,63,0.12)' : 'var(--card)',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  boxShadow: isSelected ? '0 0 0 3px rgba(216,56,63,0.15)' : 'none',
                  fontSize: 12.5, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text)',
                  cursor: 'grab', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: personColor(p.id) }} />
                {p.name}
              </button>
              {p.kind === 'external' && (
                <button type="button" className="btn-no-anim"
                  onClick={() => setShownExternalIds(ids => ids.filter(id => id !== p.id))}
                  aria-label={t('staffTimeline.removeExternalChipAria', { name: p.name })}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 17, height: 17, borderRadius: '50%',
                    background: 'var(--text3)', color: '#fff', border: '1.5px solid var(--card)',
                    fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)', marginTop: 10 }}>
        <div style={{ flex: 1, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', minWidth: '100%' }}>
            {weekDates.map(date => {
              const d = new Date(date + 'T12:00:00')
              const isToday = date === todayStr
              const isPast = date < todayStr
              const dayItems = itemsByDay[date]
              const { laneOf } = dayLaneInfo[date]
              const previewing = rangeSelect?.date === date && hoverHour != null
              const previewPos = previewing ? blockPosition(
                `${pad(TIMELINE_START_HOUR + Math.min(rangeSelect.startHour, hoverHour))}:00`,
                `${pad(TIMELINE_START_HOUR + Math.max(rangeSelect.startHour, hoverHour) + 1)}:00`,
              ) : null
              // Se l'intervallo in anteprima attraversa una cella già occupata,
              // il tap di chiusura verrà ignorato (handleGridClick) — qui si
              // segnala la stessa cosa visivamente, invece di promettere un
              // task che poi non si crea.
              let previewBlocked = false
              if (previewing) {
                const lo = Math.min(rangeSelect.startHour, hoverHour), hi = Math.max(rangeSelect.startHour, hoverHour)
                for (let h = lo; h <= hi; h++) { if (laneHourOccupied(date, rangeSelect.lane, h)) { previewBlocked = true; break } }
              }
              return (
                <div key={date} style={{ flex: '1 1 0', minWidth: 'min(90vw, 230px)', scrollSnapAlign: 'start', borderRight: isToday ? '1px solid rgba(216,56,63,0.25)' : '1px solid var(--border)' }}>
                  <div style={{ height: 32, borderBottom: isToday ? '1px solid rgba(216,56,63,0.3)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? 'rgba(216,56,63,0.16)' : 'var(--bg2)' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isToday ? 'var(--accent)' : 'var(--text2)' }}>
                      {capitalize(formatDate(d, { weekday: 'short' }, i18n.language))} {d.getDate()}
                    </span>
                  </div>
                  {/* Righello orario: un numero ogni 2 ore, allineato alle
                      stesse linee verticali della griglia sotto (vedi
                      RULER_HOURS/VERTICAL_GRID_BG) — prima non c'era alcun
                      riferimento a quale ora cadesse una colonna. */}
                  <div style={{ position: 'relative', height: 16, borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    {RULER_HOURS.map(h => (
                      <span key={h} style={{
                        position: 'absolute', top: 0, bottom: 0, left: `${(h - TIMELINE_START_HOUR) / TIMELINE_HOURS * 100}%`,
                        display: 'flex', alignItems: 'center',
                        transform: h === TIMELINE_START_HOUR ? 'translateX(2px)' : h === TIMELINE_END_HOUR ? 'translateX(calc(-100% - 2px))' : 'translateX(-50%)',
                        fontSize: 9.5, fontWeight: 700, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      }}>{h}</span>
                    ))}
                  </div>
                  <div
                    onClick={e => handleGridClick(e, date)}
                    onMouseMove={e => {
                      if (e.target !== e.currentTarget) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const hour = hourSlotFromClientX(e.clientX, rect)
                      if (rangeSelect?.date === date) { setHoverHour(hour); return }
                      const lane = laneFromClientY(e.clientY, rect, laneTop, laneHeights)
                      setHoverCell({ date, occupied: laneHourOccupied(date, lane, hour) })
                    }}
                    onMouseLeave={() => setHoverCell(null)}
                    style={{
                      position: 'relative', height: totalGridHeight,
                      backgroundColor: isToday ? 'rgba(216,56,63,0.045)' : 'transparent', backgroundImage: VERTICAL_GRID_BG,
                      cursor: selectedPerson ? 'default' : rangeSelect?.date === date ? (previewBlocked ? 'not-allowed' : 'crosshair') : (hoverCell?.date === date && hoverCell.occupied ? 'not-allowed' : 'crosshair'),
                    }}
                  >
                    {/* Divisori fra corsie — altezza variabile, non più un pattern ripetuto */}
                    {laneTop.slice(1).map((top, i) => (
                      <div key={i} style={{ position: 'absolute', top, left: 0, right: 0, height: 1, background: 'var(--border)', pointerEvents: 'none' }} />
                    ))}
                    {previewPos && (
                      <div style={{
                        position: 'absolute', top: laneTop[rangeSelect.lane] + ITEM_MARGIN, height: laneHeights[rangeSelect.lane] - ITEM_MARGIN * 2, ...previewPos,
                        background: previewBlocked ? 'rgba(74,74,122,0.14)' : 'rgba(230,57,70,0.14)',
                        border: `1.5px dashed ${previewBlocked ? 'var(--text3)' : 'var(--accent)'}`,
                        borderRadius: 8, pointerEvents: 'none',
                      }} />
                    )}
                    {dayItems.map(item => {
                      const pos = blockPosition(item.startTime, item.endTime)
                      const lane = laneOf[item.key]
                      const isTask = item.type === 'task'
                      const assigned = item.assigned
                      const title = isTask ? (item.block.label || t('staffTimeline.untitledTask')) : item.event.name
                      const typeColor = isTask ? 'var(--blue)' : item.type === 'phase' ? PHASE_META[item.phaseKey].color : (item.event.type === 'installation' ? '#7c6fcd' : 'var(--accent)')
                      const bg = isPast ? 'var(--text2)' : typeColor
                      const isDragOver = dragOverKey === item.key
                      // Solo per un evento vero su più giorni ha senso un
                      // orario su misura per QUESTO giorno — un evento di un
                      // giorno solo si modifica già dal form evento, una
                      // fase non ha questo concetto.
                      const isMultiDayEvent = item.type === 'event' && item.event.dateEnd && item.event.dateEnd !== item.event.date
                      const openOrAssign = () => {
                        setRangeSelect(null); setHoverHour(null)
                        if (selectedPerson) { handleDropOrTap(item, selectedPerson); return }
                        if (!isTask) setSummaryTarget({ event: item.event, date })
                        else openTaskModal(item.block)
                      }
                      return (
                        <div key={item.key}
                          onClick={e => { e.stopPropagation(); openOrAssign() }}
                          onDragEnter={e => { e.preventDefault(); setDragOverKey(item.key) }}
                          onDragOver={e => e.preventDefault()}
                          onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOverKey(k => k === item.key ? null : k) }}
                          onDrop={e => { e.preventDefault(); setDragOverKey(null); handleDropOrTap(item, draggedPerson); setDraggedPerson(null) }}
                          style={{
                            position: 'absolute', top: laneTop[lane] + ITEM_MARGIN, height: item.contentHeight, ...pos,
                            background: bg, color: '#fff', borderRadius: 8, padding: `${CARD_PAD}px 7px`,
                            display: 'flex', flexDirection: 'column', gap: ROW_GAP,
                            overflow: 'hidden', cursor: 'pointer',
                            border: isDragOver ? '1.5px solid #fff' : assigned.length === 0 ? '1.5px dashed rgba(255,255,255,0.55)' : 'none',
                            boxShadow: isDragOver ? '0 0 0 3px rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.3)' : 'none',
                            filter: isDragOver ? 'brightness(1.2)' : 'none',
                            transition: 'filter 0.1s ease, box-shadow 0.1s ease',
                          }}
                        >
                          <span
                            onClick={isMultiDayEvent && !selectedPerson ? e => { e.stopPropagation(); setDayHoursModal({ event: item.event, date }) } : undefined}
                            title={isMultiDayEvent ? t('staffTimeline.dayHoursHint') : undefined}
                            style={{ fontSize: 11, fontWeight: 700, height: TITLE_ROW_H, lineHeight: `${TITLE_ROW_H}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, textDecoration: isMultiDayEvent && !selectedPerson ? 'underline dotted' : 'none', textUnderlineOffset: 2 }}>
                            {item.type === 'event' && item.event.type === 'installation' && <Wrench size={11} />}{title}
                          </span>
                          {/* Una riga per CORSIA, non per persona — chi non si sovrappone
                              in orario (es. due metà giornata) condivide la stessa riga,
                              affiancato invece che impilato (vedi packPersonLanes). La
                              barra colorata dentro è posizionata/larga secondo le SUE ore
                              relative alla durata dell'evento. Tap apre la modifica di
                              quella specifica fascia; il drag/tap-tap sulla card resta il
                              modo rapido per assegnare/togliere. */}
                          {Array.from({ length: item.personLaneCount }).map((_, laneIdx) => (
                            <div key={laneIdx} style={{ position: 'relative', height: PERSON_ROW_H, flexShrink: 0 }}>
                              {assigned.filter(a => item.personLaneOf[a.id] === laneIdx).map(a => {
                                const name = (a.workerId ? people.find(p => p.id === a.workerId)?.name : a.externalWorkerName) || '?'
                                const personBg = isPast ? 'var(--text2)' : personColor(a.workerId || a.externalWorkerId)
                                const relPos = relativeBarPos(item, a)
                                return (
                                  <div key={a.id}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setRangeSelect(null); setHoverHour(null)
                                      if (selectedPerson) { handleDropOrTap(item, selectedPerson); return }
                                      openTaskModal(a)
                                    }}
                                    title={`${name} · ${a.startTime}–${a.endTime}`}
                                    style={{
                                      position: 'absolute', top: 0, height: PERSON_ROW_H, ...relPos,
                                      background: personBg, borderRadius: 4, cursor: 'pointer', padding: '0 5px',
                                      display: 'flex', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden',
                                    }}
                                  >
                                    {/* Spazio in abbondanza ora che la card cresce in altezza: il
                                        nome completo si legge meglio delle sole iniziali. */}
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filtro attività — per avere tutto sotto controllo: eventi veri,
          rent/install e fasi montaggio-smontaggio spesso non vanno assegnati
          a nessuno, quindi si tolgono dalla vista senza perdere il resto. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('staffTimeline.filterLabel')}</span>
        <button type="button" className="btn-no-anim" onClick={() => setShowEvents(v => !v)} aria-pressed={showEvents}
          style={{
            padding: '5px 11px', borderRadius: 16,
            border: `1.5px solid ${showEvents ? 'var(--accent)' : 'var(--border)'}`,
            background: showEvents ? 'rgba(216,56,63,0.1)' : 'transparent',
            color: showEvents ? 'var(--accent)' : 'var(--text3)',
            fontSize: 12, fontWeight: 700, textDecoration: showEvents ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterEvents')}
        </button>
        <button type="button" className="btn-no-anim" onClick={() => setShowInstallations(v => !v)} aria-pressed={showInstallations}
          style={{
            padding: '5px 11px', borderRadius: 16,
            border: `1.5px solid ${showInstallations ? '#7c6fcd' : 'var(--border)'}`,
            background: showInstallations ? '#7c6fcd18' : 'transparent',
            color: showInstallations ? '#7c6fcd' : 'var(--text3)',
            fontSize: 12, fontWeight: 700, textDecoration: showInstallations ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterInstallations')}
        </button>
        <button type="button" className="btn-no-anim" onClick={() => setShowPhases(v => !v)} aria-pressed={showPhases}
          style={{
            padding: '5px 11px', borderRadius: 16,
            border: `1.5px solid ${showPhases ? PHASE_COLORS.montaggio : 'var(--border)'}`,
            background: showPhases ? `${PHASE_COLORS.montaggio}18` : 'transparent',
            color: showPhases ? PHASE_COLORS.montaggio : 'var(--text3)',
            fontSize: 12, fontWeight: 700, textDecoration: showPhases ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterPhases')}
        </button>
      </div>

      {modalState && (
        <AssignmentBlockModal
          initial={modalState.mode === 'create' ? modalState : {
            date: modalState.block.date, startTime: modalState.block.startTime, endTime: modalState.block.endTime,
            workerId: modalState.block.workerId, externalWorkerId: modalState.block.externalWorkerId, externalWorkerName: modalState.block.externalWorkerName,
            eventId: modalState.block.eventId, label: modalState.block.label, description: modalState.block.description,
          }}
          isEdit={modalState.mode === 'edit'}
          workers={activeWorkers}
          events={weekEvents}
          externalWorkers={externalWorkers}
          unavailability={unavailability}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}

      {pendingQuickExternal && (
        <QuickExternalPopup onConfirm={confirmQuickExternal} onCancel={() => setPendingQuickExternal(null)} />
      )}

      {summaryTarget && (
        <EventSummaryModal
          event={summaryTarget.event}
          date={summaryTarget.date}
          blocks={blocks}
          workers={workers}
          onClose={() => setSummaryTarget(null)}
          onAssign={() => { const target = summaryTarget; setSummaryTarget(null); openCreateForEvent(target.event, target.date) }}
        />
      )}

      {dayHoursModal && (() => {
        const override = dayHoursModal.event.dayTimes?.[dayHoursModal.date]
        const [defaultStart, defaultEnd] = eventTimeForDay(dayHoursModal.event, dayHoursModal.date)
        return (
          <EventDayHoursModal
            event={dayHoursModal.event}
            date={dayHoursModal.date}
            hasOverride={!!override}
            initialStart={override?.timeStart || defaultStart}
            initialEnd={override?.timeEnd || defaultEnd}
            onClose={() => setDayHoursModal(null)}
            onSave={(startTime, endTime) => saveDayHours(dayHoursModal.event, dayHoursModal.date, startTime, endTime)}
            onReset={() => resetDayHours(dayHoursModal.event, dayHoursModal.date)}
          />
        )
      })()}
    </div>
  )
}
