import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase'
import { useConfirm } from '../context/ConfirmProvider'
import { formatDate, capitalize } from '../utils/formatDate'
import { isWorkerUnavailable } from '../utils/workerAssignment'
import { createAssignmentBlock, updateAssignmentBlock, deleteAssignmentBlock, personColor } from '../utils/assignmentBlocks'
import { watchExternalWorkers, getOrCreateExternalWorker } from '../utils/externalWorkers'
import GuestInvitePrompt from './GuestInvitePrompt'
import { isInvitePromptMuted, muteInvitePrompt } from '../utils/guestLinks'
import StaffAssignPanel from './StaffAssignPanel'
import ArchiveEventDetail from './ArchiveEventDetail'
import { TaskSummaryBody } from './TaskSummaryModal'
import { toMin, eventTimeForDay, phaseTimeFor } from '../utils/assignmentTimes'
import { Plus, Wrench, Search } from './Icon'

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

// Fascia oraria mostrata nella timeline — l'intera giornata, 00:00–23:59:
// montaggi notturni e smontaggi a notte fonda sono normali nel settore, una
// fascia più stretta (prima 7–23) li tagliava fuori dalla griglia.
// Vista pensata quasi esclusivamente per desktop (tanta informazione in
// poco spazio): griglia e corsie più grandi di una tipica vista mobile,
// con solo lo scroll-snap a reggere lo schermo stretto come fallback.
const TIMELINE_START_HOUR = 0
const TIMELINE_END_HOUR = 24
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR
// Ogni item è UNA card, sempre della stessa altezza: titolo, orario e — sotto —
// una riga di avatar con le iniziali delle persone assegnate (con "+N" se
// sono tante). Prima ogni persona aveva la sua barra colorata e le card
// crescevano in altezza in modo diverso l'una dall'altra, togliendo ordine
// alla griglia; le ore precise di ognuno restano nella colonna laterale e un
// puntino arancione sull'avatar segnala chi ha un orario diverso da quello
// della card.
const CARD_PAD = 8
const TITLE_ROW_H = 24
const SUBTITLE_ROW_H = 13
const AVATAR_ROW_H = 22
const AVATAR_SIZE = 22
const ROW_GAP = 5
const ITEM_MARGIN = 6 // sopra e sotto ogni card, dentro la propria corsia
const EMPTY_ITEM_H = CARD_PAD * 2 + TITLE_ROW_H + ROW_GAP + SUBTITLE_ROW_H + ROW_GAP + AVATAR_ROW_H
const MAX_AVATARS = 4
// Larghezza minima di una card, come frazione della colonna del giorno:
// un'attività di un'ora sarebbe larga pochi pixel e illeggibile, così ogni
// card ha comunque una dimensione "di default" (la posizione resta quella
// dell'orario d'inizio, la larghezza non è più strettamente proporzionale
// alla durata — per questo non ci sono più le linee verticali di guida).
const MIN_CARD_FRAC = 0.4
const MIN_LANES = 2

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfDay(d) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return m
}
// Lunedì della settimana che contiene d — la colonna 0 è sempre lunedì,
// più comodo da leggere a colpo d'occhio (settimana lavorativa intera)
// invece di doversi orientare rispetto a "oggi", che può cadere ovunque.
function startOfWeek(d) {
  const m = startOfDay(d)
  const day = m.getDay() // 0=domenica..6=sabato
  m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day))
  return m
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function pad(n) { return String(n).padStart(2, '0') }
// Ora intera della griglia → "HH:00". Il bordo destro (24) non è un orario
// valido: l'ultimo minuto utile della giornata è 23:59.
function hourToTime(h) { return h >= 24 ? '23:59' : `${pad(h)}:00` }
// Un'attività LIBERA (task) può scavalcare la mezzanotte: se l'ora di fine è
// uguale o precedente a quella d'inizio finisce il giorno dopo (23:00–02:00).
// Vale solo per i task — eventi e fasi restano dentro il loro giorno.
function isOvernight(startTime, endTime) { return toMin(endTime) <= toMin(startTime) }
// Posizione/larghezza (frazioni della colonna, 0–1) di una card che copre
// [startMin, endMin] di UNA giornata, con la larghezza minima di sopra;
// se non ci sta più a destra viene spostata a sinistra, mai tagliata.
function cardGeometry(startMin, endMin) {
  const width = Math.min(Math.max((endMin - startMin) / 1440, MIN_CARD_FRAC), 1)
  const left = Math.min(Math.max(startMin / 1440, 0), 1 - width)
  return { left, width, right: left + width }
}
// Orario di una persona dentro un'attività, in minuti ASSOLUTI dall'inizio
// del giorno dell'attività (oltre 1440 = giorno dopo). Dentro un task che
// scavalca la mezzanotte, un orario che parte "prima" dell'inizio del task
// (es. 01:00–02:00 in un task 23:00–03:00) è del giorno dopo.
function personAbs(a, anchor) {
  const s0 = toMin(a.startTime), e0 = toMin(a.endTime)
  let ps = s0, pe = e0 <= s0 ? e0 + 1440 : e0
  if (anchor.overnight && ps < anchor.startMin) { ps += 1440; pe += 1440 }
  return [ps, pe]
}
// Barre delle persone dentro UNA card: la finestra [winStart, winEnd] (minuti
// assoluti) è quella che la card mostra — l'intera durata, oppure solo la
// parte di un task a cavallo di due giorni. Ogni barra è posizionata in
// percentuale della card; chi non si sovrappone in orario (es. metà giornata
// a testa) condivide la stessa riga invece di impilarsi.
function buildBars(assigned, anchor, winStart, winEnd) {
  const span = Math.max(winEnd - winStart, 1)
  const ranges = assigned.map(a => {
    const [ps, pe] = personAbs(a, anchor)
    return { a, ps: Math.max(ps, winStart), pe: Math.min(pe, winEnd) }
  }).filter(r => r.pe > r.ps).sort((x, y) => x.ps - y.ps)
  const laneEnds = []
  const bars = ranges.map(r => {
    const width = Math.max((r.pe - r.ps) / span, 0.03)
    const occupiedEnd = r.ps + Math.max(r.pe - r.ps, span * 0.14) // barre strette: occupano comunque un minimo
    let lane = laneEnds.findIndex(end => end <= r.ps)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(occupiedEnd) } else laneEnds[lane] = occupiedEnd
    return { a: r.a, lane, left: (r.ps - winStart) / span, width }
  })
  return { bars, laneCount: laneEnds.length }
}
// Ora intera (grano della selezione a celle) dalla posizione X del click
// dentro la colonna del giorno.
function hourSlotFromClientX(clientX, rect) {
  const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.999)
  return Math.floor(frac * TIMELINE_HOURS)
}
// Impacchetta gli item di un giorno (eventi + fasi + task) in corsie senza
// sovrapposizioni orarie — stesso algoritmo greedy di un day-view di
// calendario: un nuovo item va nella prima corsia già libera a quell'ora,
// altrimenti ne apre una nuova. Ordinati prima per priorità (evento > fase >
// rent > task) e solo a parità per orario, così le corsie in alto sono
// sempre quelle "più importanti", non solo le più mattiniere.
function packLanes(items) {
  // Eventi, fasi e attività si dispongono per ORARIO d'inizio: il più presto in
  // alto, poi a scendere (a parità, evento prima di fase prima di task). I
  // rent/install (rank 3) restano sempre in fondo, sotto tutte le altre
  // corsie. Chi non si sovrappone a un elemento già posato può stare sulla sua
  // stessa riga, a destra.
  const byStart = (a, b) => (a.sortStart - b.sortStart) || (a.rank - b.rank) || (a.geoLeft - b.geoLeft)
  const regular = items.filter(i => i.rank !== 3).sort(byStart)
  const rents = items.filter(i => i.rank === 3).sort(byStart)
  const laneOf = {}
  const place = (list, offset) => {
    const laneEnds = []
    list.forEach(it => {
      let lane = laneEnds.findIndex(end => end <= it.geoLeft + 1e-6)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.geoRight) }
      else laneEnds[lane] = it.geoRight
      laneOf[it.key] = offset + lane
    })
    return laneEnds.length
  }
  const regularLanes = place(regular, 0)
  const rentLanes = place(rents, regularLanes)
  return { laneOf, laneCount: Math.max(regularLanes + rentLanes, MIN_LANES) }
}

// Completa un item con geometria (geoLeft/geoWidth/geoRight, frazioni della
// colonna) e barre persona. winStart/winEnd = minuti ASSOLUTI coperti da
// QUESTO pezzo di card (per un task a cavallo di due giorni il giorno 1 va
// da start a 1440, il giorno 2 da 1440 a end); geoStartMin/geoEndMin = gli
// stessi minuti riportati dentro la sola giornata della colonna.
function finishItem(item, { winStart, winEnd, geoStartMin, geoEndMin, anchor }) {
  const g = cardGeometry(geoStartMin, geoEndMin)
  const { bars } = buildBars(item.assigned, anchor, winStart, winEnd)
  return { ...item, sortStart: geoStartMin, geoLeft: g.left, geoWidth: g.width, geoRight: g.right, bars, contentHeight: EMPTY_ITEM_H }
}

// Immagine di drag personalizzata: il drag-image nativo del browser a volte
// perde il border-radius del chip (soprattutto Safari) e mostra un
// rettangolo spigoloso invece della pillola arrotondata. Un piccolo nodo
// clonato fuori schermo, passato a setDragImage, garantisce lo stesso
// aspetto su ogni browser — rimosso al tick successivo, non serve a altro.
function makeDragGhost({ label, dotColor, dashed }) {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed; top:-200px; left:-200px; display:flex; align-items:center; gap:6px; padding:7px 13px; border-radius:20px; background:var(--c-surface); border:${dashed ? '1.5px dashed var(--c-line)' : '1px solid var(--c-line)'}; font-family:inherit; font-size:12.5px; font-weight:700; color:${dashed ? 'var(--c-ink2)' : 'var(--c-ink)'}; white-space:nowrap;`
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
// readOnly: vista per i magazzinieri — stessa timeline ma niente assegnazioni né
// creazione; un tocco su una card apre i dettagli (e la lista di carico) in una colonna.
export default function StaffTimeline({ teamId, events, workers, unavailability, user, focusAssign, onFocusAssignConsumed, readOnly = false }) {
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(savedView?.weekStart ? new Date(savedView.weekStart + 'T12:00:00') : new Date()))
  const [blocks, setBlocks] = useState([])
  const [externalWorkers, setExternalWorkers] = useState([])
  // Domanda "Utente esterno inserito, vuoi invitarlo?" dopo il Salva della colonna;
  // promptedExternalIds = già chiesto in questa sessione (non si ripete a ogni salvataggio).
  const [invitePrompt, setInvitePrompt] = useState(null) // [{ id, name }] | null
  const promptedExternalIds = useRef(new Set())
  const [shownExternalIds, setShownExternalIds] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null) // {id, kind, name} — tap-tap mobile
  const [peopleQuery, setPeopleQuery] = useState('')
  const [draggedPerson, setDraggedPerson] = useState(null)
  // Colonna laterale aperta (vedi StaffAssignPanel.jsx): {key, date, isNew,
  // focusToken}. Punta alla card per chiave + giorno e non ne tiene una
  // copia — così mostra sempre lo stato vivo dei blocchi su Firestore.
  const [panel, setPanel] = useState(null)
  const panelDirtyRef = useRef(false)
  const navigate = useNavigate()
  // Il Calendario blocca lo scroll della pagina su desktop (vedi
  // useModalScrollLock in Calendar.jsx): la griglia si adatta allo spazio
  // rimasto sotto di sé e scorre al suo interno quando le corsie sono tante.
  const gridBoxRef = useRef(null)
  const gridScrollRef = useRef(null)
  const filterRowRef = useRef(null)
  const [gridMaxH, setGridMaxH] = useState(null)
  const measureGridRef = useRef(null)
  // Modalità creazione: spenta all'apertura della pagina. Si accende col pulsante
  // "Crea attività" sopra la griglia o con il primo clic su uno spazio libero; da
  // lì l'anteprima segue il mouse e il clic successivo crea l'attività e spegne
  // la modalità. Esc o tasto destro sulla griglia la spengono senza creare.
  const [createOn, setCreateOn] = useState(false)
  const [hoverCell, setHoverCell] = useState(null) // {date, hour, lane, occupied} — cella libera sotto il mouse: mostra l'anteprima della nuova attività
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

  useEffect(() => {
    measureGridRef.current = () => {
      const box = gridBoxRef.current
      if (!box) return
      // sotto la griglia: riga filtri + margini + barra di navigazione in basso
      const below = (filterRowRef.current?.offsetHeight || 30) + 16 + 78
      const next = Math.max(240, Math.floor(window.innerHeight - box.getBoundingClientRect().top - below))
      setGridMaxH(prev => (prev === next ? prev : next))
    }
    measureGridRef.current()
  })
  useEffect(() => {
    const onResize = () => measureGridRef.current?.()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const todayStr = toDateStr(new Date())
  // Striscia "ora attuale": un punto di riferimento verticale sulla colonna
  // di oggi, utile con tante attività affiancate per capire a colpo d'occhio
  // cosa è già passato e cosa deve ancora iniziare. Un minuto di
  // aggiornamento basta (non è un cronometro) ed evita un re-render ad ogni
  // secondo per una vista pensata per restare aperta a lungo su un monitor.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  const nowHour = now.getHours() + now.getMinutes() / 60
  const nowFraction = (nowHour - TIMELINE_START_HOUR) / TIMELINE_HOURS
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
      // Anche un evento fuori settimana ma con montaggio/smontaggio dentro:
      // la fase va assegnata questa settimana anche se l'evento è dopo.
      const phaseInWeek = Object.values(ev.phases || {}).some(d => d >= weekDates[0] && d <= weekEnd)
      return phaseInWeek || !(end < weekDates[0] || ev.date > weekEnd)
    })
    .sort((a, b) => a.date.localeCompare(b.date)), [events, weekDates, weekEnd])

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events])

  const weekBlockExternalIds = useMemo(() => {
    const set = new Set()
    blocks.forEach(b => { if (b.externalWorkerId && weekDates.includes(b.date)) set.add(b.externalWorkerId) })
    return set
  }, [blocks, weekDates])

  const activeWorkers = workers.filter(w => w.active !== false)
  const peopleQ = peopleQuery.trim().toLowerCase()
  const people = [
    ...activeWorkers.map(w => ({ id: w.id, name: w.name || t('common.noName'), kind: 'worker' })),
    ...externalWorkers
      // Con una ricerca in corso compaiono TUTTI gli esterni che corrispondono, non solo quelli già in uso questa settimana
      .filter(w => weekBlockExternalIds.has(w.id) || shownExternalIds.includes(w.id) || (peopleQ && (w.name || '').toLowerCase().includes(peopleQ)))
      .map(w => ({ id: w.id, name: w.name, kind: 'external' })),
  ]

  // Con tanto personale una fila di chip con avatar non regge: si cerca per
  // nome e compaiono solo i risultati. La persona selezionata (tap-tap)
  // resta visibile anche a ricerca svuotata, altrimenti non si saprebbe
  // più chi si sta per assegnare.
  // Più utilizzati = più assegnazioni in assoluto (tutti i blocchi della
  // squadra, non solo la settimana mostrata): compaiono da subito sotto la
  // barra, così le persone di sempre sono a un tap senza dover cercare. Con
  // pochi dati (squadra nuova) si completa in ordine alfabetico.
  const topPeople = useMemo(() => {
    const counts = {}
    blocks.forEach(b => { const id = b.workerId || b.externalWorkerId; if (id) counts[id] = (counts[id] || 0) + 1 })
    return [...people]
      .sort((a, b) => (counts[b.id] - counts[a.id]) || a.name.localeCompare(b.name))
      .slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, workers, externalWorkers, shownExternalIds])
  const visiblePeople = (() => {
    const base = peopleQ ? people.filter(p => p.name.toLowerCase().includes(peopleQ)) : topPeople
    const sel = selectedPerson && people.find(p => p.id === selectedPerson.id && p.kind === selectedPerson.kind)
    return sel && !base.includes(sel) ? [...base, sel] : base
  })()

  // Item per giorno: gli eventi che toccano quel giorno (sempre, anche senza
  // nessuno assegnato: è il punto — vederli per poterci allocare qualcuno) +
  // le fasi (montaggio/smontaggio) che cadono su un giorno diverso da quello
  // dell'evento vero e proprio (altrimenti lì non comparirebbe nulla da
  // assegnare) + i task liberi creati su quel giorno. L'ordine delle corsie
  // (packLanes) è per orario d'inizio, con i rent/install (rank 3) sempre
  // in fondo; `rank` (evento 0 < fase 1 < task 2) conta solo a parità d'orario.
  const itemsByDay = useMemo(() => {
    const map = {}
    // Un giorno IN PIÙ prima della settimana mostrata: un task che parte la
    // domenica notte e finisce il lunedì deve comparire (come "continua") sul
    // lunedì, e la colonna laterale deve poterlo ritrovare dal suo giorno vero.
    const prevDate = toDateStr(addDays(weekStart, -1))
    const allDates = [prevDate, ...weekDates]
    allDates.forEach(date => {
      const dayEvents = weekEvents.filter(ev => {
        const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
        return date >= ev.date && date <= end
      })
      const dayEventItems = dayEvents
        .filter(ev => ev.type === 'installation' ? showInstallations : showEvents)
        .map(ev => {
          const [startTime, endTime] = eventTimeForDay(ev, date)
          const rank = ev.type === 'installation' ? 3 : 0
          // Le persone di una fase (b.phase) hanno la loro card: qui solo
          // quelle dell'evento vero e proprio.
          const assigned = blocks.filter(b => b.eventId === ev.id && b.date === date && !b.phase)
          const sm = toMin(startTime), em = toMin(endTime)
          return finishItem({ key: `ev${ev.id}`, type: 'event', event: ev, date, startTime, endTime, rank, assigned },
            { winStart: sm, winEnd: em, geoStartMin: sm, geoEndMin: em, anchor: { overnight: false, startMin: 0 } })
        })
      // Le fasi hanno SEMPRE la propria card (anche nello stesso giorno
      // dell'evento) con orario e persone indipendenti dall'evento. Le
      // assegnazioni fatte prima che esistesse il campo `phase`, su un
      // giorno in cui l'evento non c'è, restano della fase.
      const dayPhaseItems = !showPhases ? [] : weekEvents
        .flatMap(ev => Object.entries(ev.phases || {})
          .filter(([key, pdate]) => pdate === date && PHASE_META[key])
          .map(([key]) => {
            const eventOnDay = dayEvents.some(e => e.id === ev.id)
            const assigned = blocks.filter(b => b.eventId === ev.id && b.date === date && (b.phase === key || (!b.phase && !eventOnDay)))
            const [startTime, endTime] = phaseTimeFor(ev, key, date)
            const sm = toMin(startTime), em = toMin(endTime)
            return finishItem({ key: `ph${ev.id}-${key}`, type: 'phase', event: ev, phaseKey: key, date, startTime, endTime, rank: 1, assigned },
              { winStart: sm, winEnd: em, geoStartMin: sm, geoEndMin: em, anchor: { overnight: false, startMin: 0 } })
          }))
      // Più persone sullo stesso task libero: i blocchi che condividono
      // taskGroupId sono la STESSA commissione (una card, una riga a testa,
      // come un evento con più assegnati) — non più un blocco = un task.
      // b.id come ripiego per i blocchi creati prima di taskGroupId: restano
      // task "solisti" finché non gli si trascina sopra una seconda persona
      // (a quel punto il nuovo blocco eredita lo stesso id come taskGroupId,
      // vedi addPersonToItem, e si raggruppano da soli).
      const dayTaskBlocks = blocks.filter(b => b.date === date && !b.eventId)
      const taskGroupsByGid = {}
      dayTaskBlocks.forEach(b => {
        const gid = b.taskGroupId || b.id
        ;(taskGroupsByGid[gid] ||= []).push(b)
      })
      const dayTasks = Object.entries(taskGroupsByGid).map(([gid, group]) => {
        // Orario dell'attività: salvato su ogni blocco (taskStart/taskEnd);
        // per i blocchi più vecchi, l'inviluppo min/max del gruppo.
        const withTask = group.find(b => b.taskStart && b.taskEnd)
        const startTime = withTask ? withTask.taskStart : group.reduce((min, b) => (b.startTime < min ? b.startTime : min), group[0].startTime)
        const endTime = withTask ? withTask.taskEnd : group.reduce((max, b) => (b.endTime > max ? b.endTime : max), group[0].endTime)
        const assigned = group.filter(b => b.workerId || b.externalWorkerId)
        const overnight = !!withTask && isOvernight(startTime, endTime)
        const sm = toMin(startTime), em = toMin(endTime)
        const anchor = { overnight, startMin: sm }
        const base = { key: `tk${gid}`, type: 'task', block: group[0], group, taskGroupId: gid, date, startTime, endTime, overnight, rank: 2, assigned,
          linkedEventId: group.find(b => b.linkedEventId)?.linkedEventId || null, linkedListId: group.find(b => b.linkedListId)?.linkedListId || null }
        return finishItem(base, overnight
          ? { winStart: sm, winEnd: 1440, geoStartMin: sm, geoEndMin: 1440, anchor }
          : { winStart: sm, winEnd: em, geoStartMin: sm, geoEndMin: em, anchor })
      })
      map[date] = [...dayEventItems, ...dayPhaseItems, ...dayTasks]
    })
    // Seconda metà dei task a cavallo di due giorni: sul giorno dopo compare
    // un pezzo "continua" (00:00 → fine), che punta allo stesso task (stessa
    // chiave, `date` resta quello d'origine per colonna laterale e scritture).
    allDates.slice(1).forEach((date, i) => {
      const prev = allDates[i]
      const conts = map[prev].filter(it => it.type === 'task' && it.overnight && !it.cont).map(it => {
        const em = toMin(it.endTime)
        return finishItem({ ...it, cont: true, assigned: it.assigned },
          { winStart: 1440, winEnd: 1440 + em, geoStartMin: 0, geoEndMin: em, anchor: { overnight: true, startMin: toMin(it.startTime) } })
      })
      map[date] = [...map[date], ...conts]
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
    const full = heights.map(h => h + ITEM_MARGIN * 2)
    // Corsie vuote in più finché la griglia non riempie tutto lo spazio
    // disponibile: la timeline arriva in fondo alla pagina invece di
    // fermarsi sotto l'ultima card, e c'è sempre spazio dove creare.
    if (gridMaxH) {
      let sum = full.reduce((a, b) => a + b, 0)
      const emptyLane = EMPTY_ITEM_H + ITEM_MARGIN * 2
      while (sum < gridMaxH - 36) { full.push(emptyLane); sum += emptyLane }
    }
    return full
  }, [itemsByDay, dayLaneInfo, laneCount, weekDates, gridMaxH])

  const laneTop = useMemo(() => {
    const offsets = []
    let acc = 0
    laneHeights.forEach(h => { offsets.push(acc); acc += h })
    return offsets
  }, [laneHeights])

  const totalGridHeight = laneHeights.reduce((a, b) => a + b, 0)

  // Dove finirà una nuova attività di un'ora che parte a quell'ora: si rifà
  // l'impacchettamento in corsie del giorno con l'attività in più e si legge
  // la corsia che le tocca (può essere sopra una card che parte dopo: quella
  // scenderà di una riga alla creazione). L'anteprima è sempre mostrata,
  // sopra le altre card, così si capisce sempre che si è in creazione.
  const previewLane = (date, hour) => {
    const g = cardGeometry(hour * 60, (hour + 1) * 60)
    const { laneOf } = packLanes([...itemsByDay[date], { key: '__preview__', rank: 2, sortStart: hour * 60, geoLeft: g.left, geoRight: g.right }])
    return Math.min(laneOf.__preview__, laneTop.length - 1)
  }

  // Card aperta nella colonna laterale, ricavata ad ogni render dagli item
  // della settimana (non salvata): se la card sparisce (cancellata, o si
  // cambia settimana) la colonna si nasconde da sola.
  const panelItem = panel ? ((itemsByDay[panel.date] || []).find(it => it.key === panel.key) || null) : null

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
  // Orario di una fase — stesso schema di dayTimes, un campo annidato per
  // fase (phaseTimes.montaggio / phaseTimes.smontaggio).
  const savePhaseHours = async (event, key, startTime, endTime) => {
    await updateDoc(doc(db, 'events', event.id), { [`phaseTimes.${key}`]: { timeStart: startTime, timeEnd: endTime } })
  }
  const resetPhaseHours = async (event, key) => {
    await updateDoc(doc(db, 'events', event.id), { [`phaseTimes.${key}`]: deleteField() })
  }

  const blocksCtx = () => ({ eventsById, allBlocks: blocks })
  const personFields = person => ({
    workerId: person.kind === 'worker' ? person.id : null,
    externalWorkerId: person.kind === 'external' ? person.id : null,
    externalWorkerName: person.kind === 'external' ? person.name : null,
  })

  // Un task appena creato esiste subito come blocco "vuoto" (senza persona)
  // per poter ricevere un drag e comparire in griglia; se si chiude la
  // colonna senza nome né persone, quel guscio va tolto.
  const discardEmptyNewTask = async () => {
    if (!panel?.isNew || !panelItem || panelItem.type !== 'task') return
    if (panelItem.assigned.length > 0 || (panelItem.block.label || '').trim()) return
    await Promise.all(panelItem.group.map(b => deleteAssignmentBlock(b, blocksCtx())))
  }

  // Cambiare card (o chiudere) con modifiche non salvate chiede conferma:
  // la bozza di orari/note vive solo nella colonna.
  const requestPanel = async (target) => {
    if (panel && target && panel.key === target.key && panel.date === target.date) {
      setPanel(p => ({ ...p, focusToken: target.focusToken || p.focusToken }))
      return true
    }
    if (panel && panelDirtyRef.current) {
      const ok = await confirm({
        title: t('staffTimeline.unsavedTitle'),
        message: t('staffTimeline.unsavedMessage'),
        confirmLabel: t('staffTimeline.unsavedDiscard'),
        danger: true,
      })
      if (!ok) return false
    }
    await discardEmptyNewTask()
    panelDirtyRef.current = false
    setPanel(target)
    return true
  }
  const closePanel = () => requestPanel(null)

  // Esc esce dalla modalità creazione (se non c'è una colonna aperta — quella
  // ha il suo Esc qui sotto — né si sta scrivendo in un campo).
  useEffect(() => {
    if (panel || !createOn) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      setCreateOn(false)
      setHoverCell(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, createOn])

  // Esc chiude la colonna (se non si sta scrivendo in un campo né a metà di
  // una selezione a celle, che ha già il suo Esc).
  useEffect(() => {
    if (!panel) return
    const onKey = e => {
      if (e.key !== 'Escape') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Quando si apre (o cambia) la colonna laterale la griglia si restringe, e
  // le card dei giorni a destra (da giovedì in poi) finirebbero coperte o
  // tagliate: la card selezionata viene portata al centro dell'area visibile,
  // con uno scorrimento morbido. Si ripete una volta se la card non c'è
  // ancora (task appena creato: compare al primo snapshot di Firestore).
  const panelKey = panel ? `${panel.key}|${panel.date}` : null
  useEffect(() => {
    if (!panelKey) return
    let tries = 0
    let timer
    const centerCard = () => {
      const scroller = gridScrollRef.current
      const card = scroller?.querySelector(`[data-card="${panelKey}"]`)
      if (!scroller || !card) {
        if (tries++ < 4) timer = setTimeout(centerCard, 120)
        return
      }
      const s = scroller.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      const left = scroller.scrollLeft + (c.left - s.left) - (s.width - c.width) / 2
      const top = scroller.scrollTop + (c.top - s.top) - (s.height - c.height) / 2
      scroller.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth' })
    }
    timer = setTimeout(centerCard, 60)
    return () => clearTimeout(timer)
  }, [panelKey])

  // Arrivo come scorciatoia da EventDetail.jsx (bottone "Assegna" nella
  // lista di carico, vedi Calendar.jsx) — salta alla settimana dell'evento e
  // apre subito la colonna di quella card. onFocusAssignConsumed azzera il
  // target lato Calendar.jsx così non si riapre da solo a ogni re-render.
  useEffect(() => {
    if (!focusAssign) return
    const ev = events.find(e => e.id === focusAssign.eventId)
    // Arrivando da un'altra pagina gli eventi possono non essere ancora
    // caricati: aspettarli, invece di consumare il target a vuoto (la colonna
    // dell'evento non si apriva e si finiva sulla timeline "nuda").
    if (focusAssign.eventId && !ev && events.length === 0) return
    setWeekStart(startOfWeek(new Date(focusAssign.date + 'T12:00:00')))
    if (ev) {
      const end = ev.dateEnd && ev.dateEnd >= ev.date ? ev.dateEnd : ev.date
      const covers = focusAssign.date >= ev.date && focusAssign.date <= end
      const phaseKey = covers ? null : Object.entries(ev.phases || {}).find(([k, d]) => d === focusAssign.date && PHASE_META[k])?.[0]
      setPanel({ key: covers || !phaseKey ? `ev${ev.id}` : `ph${ev.id}-${phaseKey}`, date: focusAssign.date, isNew: false })
    }
    onFocusAssignConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAssign, events])

  const confirmAvailability = async (person, date, eventName) => {
    if (person.kind !== 'worker' || !isWorkerUnavailable(person.id, { date, dateEnd: date }, unavailability)) return true
    return confirm({
      title: t('calendar.confirmUnavailableTitle'),
      message: t('calendar.confirmUnavailableMessage', { name: person.name, event: eventName || '' }),
      confirmLabel: t('calendar.confirmUnavailableLabel'),
      danger: true,
    })
  }

  // Aggiunge una persona a una card (mai toggle: per quello c'è
  // togglePersonOnItem). Su un EVENTO/FASE eredita l'orario della card; su
  // un TASK, se esiste ancora il blocco "vuoto" di partenza lo riempie
  // invece di crearne un secondo.
  const addPersonToItem = async (item, person, times) => {
    const st = times?.startTime || item.startTime
    const et = times?.endTime || item.endTime
    const eventName = item.type === 'task' ? (item.block.label || '') : item.event.name
    if (!(await confirmAvailability(person, item.date, eventName))) return
    if (item.type === 'task') {
      const placeholder = item.group.find(b => !b.workerId && !b.externalWorkerId)
      if (placeholder) { await updateAssignmentBlock(placeholder.id, placeholder, { ...personFields(person), ...(times?.note ? { note: times.note } : {}), startTime: st, endTime: et, taskStart: item.startTime, taskEnd: item.endTime, linkedEventId: item.linkedEventId, linkedListId: item.linkedListId }, blocksCtx()); return placeholder.id }
      return createAssignmentBlock({
        teamId, date: item.date, startTime: st, endTime: et,
        ...personFields(person),
        ...(times?.note ? { note: times.note } : {}),
        eventId: null, taskGroupId: item.taskGroupId, label: item.block.label || '', description: item.block.description || '',
        taskStart: item.startTime, taskEnd: item.endTime, linkedEventId: item.linkedEventId, linkedListId: item.linkedListId, createdBy: user.uid,
      }, blocksCtx())
    }
    return createAssignmentBlock({
      teamId, date: item.date, startTime: st, endTime: et,
      ...personFields(person),
      ...(times?.note ? { note: times.note } : {}),
      eventId: item.event.id, label: '', ...(item.type === 'phase' ? { phase: item.phaseKey } : {}), createdBy: user.uid,
    }, blocksCtx())
  }

  // Toglie una persona da una card. L'ultima persona di un TASK non fa
  // sparire il task: il blocco torna "vuoto" (nome e orario restano), così
  // si può riassegnare senza ricrearlo — per cancellarlo c'è il cestino.
  const removeBlockFromItem = async (item, block) => {
    if (item.type === 'task' && item.assigned.length === 1) {
      await updateAssignmentBlock(block.id, block, { workerId: null, externalWorkerId: null, externalWorkerName: null, note: '' }, blocksCtx())
      return
    }
    await deleteAssignmentBlock(block, blocksCtx())
  }

  // Drag o tap-tap di una persona su una card: toggle — ritrascinare la
  // stessa persona la rimuove.
  const togglePersonOnItem = async (item, person) => {
    const existing = item.assigned.find(b => (person.kind === 'worker' ? b.workerId === person.id : b.externalWorkerId === person.id))
    if (existing) { await removeBlockFromItem(item, existing); return }
    await addPersonToItem(item, person)
  }

  // Una fase (montaggio/smontaggio) è legata allo stesso evento della card
  // principale, solo su una data diversa: per i blocchi conta `item.event` +
  // `item.date` (l'item di una fase ha già l'orario di default).
  // Il chip "Esterno" non crea nulla da solo: apre la colonna con il campo
  // "aggiungi" già attivo, dove scrivere il nome.
  const handleDropOrTap = (item, person) => {
    if (!person) return
    if (person.kind === 'quick-external') {
      requestPanel({ key: item.key, date: item.date, isNew: false, focusToken: Date.now() })
      setSelectedPerson(null)
      return
    }
    togglePersonOnItem(item, person)
    setSelectedPerson(null)
  }

  // ✕ sul chip di un utente temporaneo: lo elimina dall'anagrafica (con conferma).
  // Le assegnazioni già fatte restano nel calendario con il suo nome; il suo link
  // ospite smette di funzionare (il server controlla che la persona esista ancora).
  const deleteExternal = async (p) => {
    const ok = await confirm({
      title: t('guest.tempDeleteTitle', { name: p.name }),
      message: t('guest.tempDeleteMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await deleteDoc(doc(db, 'externalWorkers', p.id))
    setShownExternalIds(ids => ids.filter(id => id !== p.id))
    if (selectedPerson?.id === p.id) setSelectedPerson(null)
  }

  // Aggiunta dalla colonna (campo di ricerca): un nome nuovo diventa un
  // esterno salvato in anagrafica e riusabile.
  const addFromPanel = async (person, times) => {
    if (!panelItem) return null
    let resolved = person
    if (person.kind === 'external' && !person.id) {
      const id = await getOrCreateExternalWorker(teamId, person.name, user.uid, externalWorkers)
      if (!id) return null
      setShownExternalIds(ids => (ids.includes(id) ? ids : [...ids, id]))
      resolved = { ...person, id }
    }
    const blockId = await addPersonToItem(panelItem, resolved, times)
    return { id: resolved.id, name: resolved.name, blockId }
  }

  // Salva la bozza della colonna: orari/note di ogni persona + (per un task)
  // nome e descrizione su TUTTI i blocchi del gruppo, (per un evento su più
  // giorni) l'orario di QUEL giorno. Scrive solo i blocchi cambiati.
  const savePanel = async (payload) => {
    const item = panelItem
    if (!item) return
    const apply = async (b, data) => {
      const changed = Object.entries(data).some(([k, v]) => (b[k] ?? '') !== (v ?? ''))
      if (changed) await updateAssignmentBlock(b.id, b, data, blocksCtx())
    }
    if (item.type === 'task') {
      for (const b of item.group) {
        const row = payload.rows.find(r => r.blockId === b.id)
        const data = { label: payload.label, description: payload.description, taskStart: payload.startTime, taskEnd: payload.endTime, linkedEventId: payload.linkedEventId, linkedListId: payload.linkedListId }
        if (row) Object.assign(data, { startTime: row.startTime, endTime: row.endTime, note: row.note })
        else if (!b.workerId && !b.externalWorkerId) Object.assign(data, { startTime: payload.startTime, endTime: payload.endTime })
        await apply(b, data)
      }
    } else {
      for (const row of payload.rows) {
        const b = blocks.find(x => x.id === row.blockId)
        if (b) await apply(b, { startTime: row.startTime, endTime: row.endTime, note: row.note })
      }
      if (item.type === 'phase' && (payload.startTime !== item.startTime || payload.endTime !== item.endTime)) {
        await savePhaseHours(item.event, item.phaseKey, payload.startTime, payload.endTime)
      }
      const isMultiDay = item.type === 'event' && item.event.dateEnd && item.event.dateEnd !== item.event.date
      if (isMultiDay && (payload.startTime !== item.startTime || payload.endTime !== item.endTime)) {
        await saveDayHours(item.event, item.date, payload.startTime, payload.endTime)
      }
    }
    setPanel(p => (p ? { ...p, isNew: false } : p))

    // Esterni appena salvati senza ancora un link ospite: chiede se invitarli
    // (una volta per persona a sessione, salvo "non mostrare più").
    if (!isInvitePromptMuted()) {
      const toAsk = []
      // Esterno appena scritto nella card "?": non è ancora nell'elenco locale
      ;(payload.newExternals || []).forEach(w => {
        if (w.id && !promptedExternalIds.current.has(w.id) && !toAsk.some(x => x.id === w.id)) toAsk.push({ id: w.id, name: w.name })
      })
      payload.rows.forEach(r => {
        const b = blocks.find(x => x.id === r.blockId)
        const w = b?.externalWorkerId && externalWorkers.find(x => x.id === b.externalWorkerId)
        if (w && !w.guestLinkActive && !promptedExternalIds.current.has(w.id) && !toAsk.some(x => x.id === w.id)) toAsk.push({ id: w.id, name: w.name })
      })
      if (toAsk.length > 0) {
        toAsk.forEach(w => promptedExternalIds.current.add(w.id))
        setInvitePrompt(toAsk)
        // La colonna si chiude dietro il popup: uscendo dal popup si resta sulla timeline.
        panelDirtyRef.current = false
        setPanel(null)
      }
    }
  }

  const deleteTaskFromPanel = async () => {
    if (!panelItem || panelItem.type !== 'task') return
    const ok = await confirm({ title: t('staffTimeline.confirmDeleteTitle'), message: t('staffTimeline.confirmDeleteMessage'), confirmLabel: t('common.delete'), danger: true })
    if (!ok) return
    panelDirtyRef.current = false
    const group = panelItem.group
    setPanel(null)
    await Promise.all(group.map(b => deleteAssignmentBlock(b, blocksCtx())))
  }

  // Selezione a celle conclusa: il task nasce subito (blocco vuoto, nome da
  // dare nella colonna) così compare in griglia e può ricevere un drag.
  const createTaskAndOpen = async (date, startTime, endTime) => {
    if (panel && panelDirtyRef.current) {
      const ok = await confirm({ title: t('staffTimeline.unsavedTitle'), message: t('staffTimeline.unsavedMessage'), confirmLabel: t('staffTimeline.unsavedDiscard'), danger: true })
      if (!ok) return
    }
    await discardEmptyNewTask()
    panelDirtyRef.current = false
    const taskGroupId = doc(collection(db, 'assignmentBlocks')).id
    await createAssignmentBlock({
      teamId, date, startTime, endTime, taskStart: startTime, taskEnd: endTime, taskGroupId, eventId: null, label: '', description: '',
      workerId: null, externalWorkerId: null, externalWorkerName: null, createdBy: user.uid,
    }, blocksCtx())
    setPanel({ key: `tk${taskGroupId}`, date, isNew: true })
  }

  // Creazione a due passi. Modalità spenta: un clic su uno spazio libero la
  // ACCENDE soltanto (compare l'anteprima in quel punto, niente viene creato).
  // Modalità accesa: il clic conferma — crea l'attività di un'ora dall'ora
  // cliccata, apre la colonna per nome/orario/persone e ESCE da sola dalla
  // modalità (Esc o tasto destro la spengono prima della conferma).
  const handleGridClick = (e, date) => {
    if (readOnly || selectedPerson || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hour = hourSlotFromClientX(e.clientX, rect)
    if (!createOn) {
      setCreateOn(true)
      setHoverCell({ date, hour, lane: previewLane(date, hour), occupied: false })
      return
    }
    setCreateOn(false)
    setHoverCell(null)
    createTaskAndOpen(date, hourToTime(TIMELINE_START_HOUR + hour), hourToTime(TIMELINE_START_HOUR + hour + 1))
  }

  const weekRangeLabel = `${formatDate(weekDates[0] + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} – ${formatDate(weekEnd + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}`
  // Sulla settimana corrente "Oggi" è già dove siamo (rosso, informativo);
  // appena ci si allontana diventa grigio, un invito a tornare — l'hover lo
  // riaccende di rosso per far capire che il tap riporta alla data odierna.
  const isCurrentWeek = weekDates[0] === todayStr

  return (
    <div className="rc-view-in" style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, padding: '20px 32px 32px' }}>
      {/* Striscia personale — trascinabile su desktop, tap-tap su mobile
          (tocca la persona, poi tocca l'evento/task su cui assegnarla). La
          barra di ricerca occupa tutta la larghezza (con il chip "Esterno"
          a destra, che invece di creare subito un'assegnazione apre la
          colonna laterale per scrivere il nome) e i risultati compaiono
          su una riga a parte, sotto. Sopra alla navigazione settimana —
          così la settimana resta vicina alla griglia che controlla. */}
      {!readOnly && (<>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--c-ink)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
        {t('staffTimeline.peopleLabel')}
        <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--c-ink3)', textTransform: 'none', letterSpacing: 0 }}>
          {selectedPerson ? t('staffTimeline.peopleHint') : t('staffTimeline.searchHint')}
        </span>
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 10, display: 'flex', color: 'var(--c-ink3)', pointerEvents: 'none' }}><Search size={15} /></span>
          <input
            value={peopleQuery}
            onChange={e => setPeopleQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setPeopleQuery(''); e.target.blur() } }}
            placeholder={t('staffTimeline.searchPlaceholder')}
            aria-label={t('staffTimeline.searchPlaceholder')}
            style={{ width: '100%', background: 'var(--c-fill)', border: 'none', borderRadius: 10, padding: '8px 10px 8px 32px', fontSize: 12.5, color: 'var(--c-ink)' }}
          />
        </div>
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
                padding: '5px 12px 5px 9px', borderRadius: 20,
                background: isQuickSelected ? 'rgba(230,57,70,0.1)' : 'transparent',
                border: `1.5px dashed ${isQuickSelected ? '#e63946' : 'var(--c-line)'}`,
                fontSize: 12.5, fontWeight: 700, color: isQuickSelected ? '#e63946' : 'var(--c-ink2)',
                cursor: 'grab', whiteSpace: 'nowrap',
              }}
            >
              <Plus size={12} /> {t('staffTimeline.externalQuickChip')}
            </button>
          )
        })()}
      </div>
      {/* Riga risultati — altezza minima fissa, altrimenti la griglia sotto
          salterebbe ogni volta che compare/sparisce un risultato. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 34, margin: '10px 0 14px' }}>
        {people.length === 0 && <p style={{ fontSize: 13, color: 'var(--c-ink3)', fontStyle: 'italic' }}>{t('calendar.noActiveWorkers')}</p>}
        {people.length > 0 && peopleQ && visiblePeople.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--c-ink3)' }}>{t('staffTimeline.searchNoResults')}</p>
        )}
        {visiblePeople.map(p => {
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
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '3px 11px 3px 3px', borderRadius: 20,
                  background: isSelected ? 'rgba(230,57,70,0.1)' : 'var(--c-surface)',
                  border: isSelected ? '1.5px solid #e63946' : '1.5px solid var(--c-line)',
                  boxShadow: isSelected ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
                  fontSize: 12.5, fontWeight: 700, color: isSelected ? '#e63946' : 'var(--c-ink)',
                  cursor: 'grab', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: personColor(p.id), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(p.name)}</span>
                {p.name}
                {p.kind === 'external' && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--c-ink3)', background: 'var(--c-fill)', borderRadius: 5, padding: '1px 5px', marginLeft: 1 }}>
                    {t('staffTimeline.externalTag')}
                  </span>
                )}
              </button>
              {p.kind === 'external' && (
                <button type="button" className="btn-no-anim"
                  onClick={() => deleteExternal(p)}
                  aria-label={t('staffTimeline.removeExternalChipAria', { name: p.name })}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 17, height: 17, borderRadius: '50%',
                    background: 'var(--c-ink3)', color: '#fff', border: '1.5px solid var(--c-surface)',
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

      </>)}

      {/* Navigazione settimana — stesso idioma della navigazione mese nella
          vista "Calendario" (frecce leggere senza sfondo, "Oggi" sotto la
          data che diventa rosso solo sulla settimana corrente). Subito
          sopra alla griglia che controlla. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginBottom: 14 }}>
        {!readOnly && <button type="button" className="btn-no-anim" onClick={() => { setCreateOn(v => !v); setHoverCell(null) }} aria-pressed={createOn} title={t('staffTimeline.createToggleHint')}
          style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 800,
            border: `1.5px solid ${createOn ? '#e63946' : 'var(--c-line)'}`, background: createOn ? 'rgba(230,57,70,0.1)' : 'var(--c-surface)', color: createOn ? '#e63946' : 'var(--c-ink3)' }}>
          {createOn ? t('staffTimeline.createExit') : `+ ${t('staffTimeline.createToggle')}`}
        </button>}
        <button onClick={() => setWeekStart(w => addDays(w, -7))} aria-label={t('staffTimeline.prevWeekAria')} className="btn-no-anim"
          style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', color: 'var(--c-ink3)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <button className="btn-no-anim staff-nav-today" onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ textAlign: 'center', background: 'none', border: 'none', padding: '2px 10px', borderRadius: 9 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-ink)', whiteSpace: 'nowrap' }}>{capitalize(weekRangeLabel)}</div>
          <div className="staff-nav-today-label" style={{ fontSize: 11, fontWeight: 800, marginTop: 1, color: isCurrentWeek ? '#e63946' : 'var(--c-ink2)' }}>{t('calendar.today')}</div>
        </button>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} aria-label={t('staffTimeline.nextWeekAria')} className="btn-no-anim"
          style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', color: 'var(--c-ink3)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      <div ref={gridBoxRef} style={{ display: 'flex', border: '1px solid var(--c-line)', borderRadius: 16, overflow: 'hidden', background: 'var(--c-alt)' }}>
        <div ref={gridScrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', maxHeight: gridMaxH || undefined, WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', minWidth: '100%' }}>
            {weekDates.map(date => {
              const d = new Date(date + 'T12:00:00')
              const isToday = date === todayStr
              const isPast = date < todayStr
              const dayItems = itemsByDay[date]
              const { laneOf } = dayLaneInfo[date]
              // Anteprima della nuova attività: una card chiara che segue il mouse
              // sulle celle libere di questa colonna.
              const ghost = createOn && !selectedPerson && hoverCell?.date === date && !hoverCell.occupied ? hoverCell : null
              const ghostGeo = ghost ? cardGeometry(ghost.hour * 60, (ghost.hour + 1) * 60) : null
              return (
                <div key={date} style={{ flex: '1 1 0', minWidth: 'min(90vw, 230px)', borderRight: '1px solid var(--c-line)' }}>
                  <div style={{ height: 36, position: 'sticky', top: 0, zIndex: 6, background: 'var(--c-surface)', borderBottom: isToday ? '2px solid #e63946' : '1px solid var(--c-line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: isToday ? 800 : 700, color: isToday ? '#e63946' : 'var(--c-ink3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {capitalize(formatDate(d, { weekday: 'short' }, i18n.language))} {d.getDate()}
                    </span>
                  </div>
                  <div
                    onClick={e => handleGridClick(e, date)}
                    onMouseMove={e => {
                      if (!createOn || e.target !== e.currentTarget) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const hour = hourSlotFromClientX(e.clientX, rect)
                      const lane = previewLane(date, hour)
                      setHoverCell(prev => (prev && prev.date === date && prev.hour === hour && prev.lane === lane ? prev : { date, hour, lane, occupied: false }))
                    }}
                    onMouseLeave={() => setHoverCell(null)}
                    onContextMenu={e => { if (createOn && e.target === e.currentTarget) { e.preventDefault(); setCreateOn(false); setHoverCell(null) } }}
                    style={{
                      position: 'relative', height: totalGridHeight,
                      backgroundColor: isToday ? 'rgba(230,57,70,0.045)' : 'transparent', 
                      cursor: !createOn || selectedPerson ? 'default' : (ghost ? 'pointer' : 'default'),
                    }}
                  >
                    {/* Striscia "ora attuale", solo sulla colonna di oggi — vedi
                        now/nowFraction più sopra. Un colore diverso dal rosso
                        già usato per "oggi" (bordo/intestazione): qui serve
                        un secondo segnale distinto, non un doppione. */}
                    {isToday && nowFraction != null && (
                      <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${nowFraction * 100}%`, width: 2, background: '#0066cc', pointerEvents: 'none', zIndex: 5 }}>
                        <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#0066cc' }} />
                      </div>
                    )}
                    {ghost && (
                      <div aria-hidden="true" style={{
                        position: 'absolute', top: laneTop[ghost.lane] + ITEM_MARGIN, height: EMPTY_ITEM_H, left: `${ghostGeo.left * 100}%`, width: `${ghostGeo.width * 100}%`,
                        background: 'rgba(255,255,255,0.94)', border: '1.5px dashed #b5b2ab', borderRadius: 10, boxShadow: '4px 2px 14px -2px rgba(0,0,0,0.16)', zIndex: 4,
                        pointerEvents: 'none', padding: `${CARD_PAD}px 10px`, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: ROW_GAP,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-ink3)', height: TITLE_ROW_H, lineHeight: `${TITLE_ROW_H}px`, whiteSpace: 'nowrap' }}>+ {t('staffTimeline.newTaskGhost')}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: '#b5b2ab', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{hourToTime(TIMELINE_START_HOUR + ghost.hour)}–{hourToTime(TIMELINE_START_HOUR + ghost.hour + 1)}</span>
                      </div>
                    )}
                    {dayItems.map(item => {
                      const lane = laneOf[item.key]
                      const isTask = item.type === 'task'
                      const title = isTask ? (item.block.label || t('staffTimeline.untitledTask')) : item.type === 'phase' ? `${PHASE_META[item.phaseKey].label} · ${item.event.name}` : item.event.name
                      const typeColor = isTask ? '#0066cc' : item.type === 'phase' ? PHASE_META[item.phaseKey].color : (item.event.type === 'installation' ? '#7c6fcd' : '#e63946')
                      const stripe = isPast ? '#c9c6bf' : typeColor
                      const isDragOver = dragOverKey === item.key
                      // item.date è sempre il giorno VERO dell'attività (anche
                      // sul pezzo "continua" del giorno dopo): è quello che
                      // identifica la card per la colonna laterale.
                      const isPanelOpen = panel?.key === item.key && panel?.date === item.date
                      const openOrAssign = () => {
                        if (readOnly) { setPanel({ key: item.key, date: item.date, isNew: false }); return }
                        if (selectedPerson) { handleDropOrTap(item, selectedPerson); return }
                        requestPanel({ key: item.key, date: item.date, isNew: false })
                      }
                      const timeLabel = item.cont ? `‹ 00:00–${item.endTime}` : item.overnight ? `${item.startTime}–${item.endTime} +1` : `${item.startTime}–${item.endTime}`
                      return (
                        <div key={item.key} data-card={`${item.key}|${item.date}`}
                          onClick={e => { e.stopPropagation(); openOrAssign() }}
                          onDragEnter={e => { e.preventDefault(); setDragOverKey(item.key) }}
                          onDragOver={e => e.preventDefault()}
                          onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOverKey(k => k === item.key ? null : k) }}
                          onDrop={e => { e.preventDefault(); setDragOverKey(null); handleDropOrTap(item, draggedPerson); setDraggedPerson(null) }}
                          style={{
                            position: 'absolute', top: laneTop[lane] + ITEM_MARGIN, height: item.contentHeight, left: `${item.geoLeft * 100}%`, width: `${item.geoWidth * 100}%`,
                            background: 'var(--c-surface)', color: isPast ? 'var(--c-ink3)' : 'var(--c-ink)', borderRadius: 10, padding: `${CARD_PAD}px 12px ${CARD_PAD}px 10px`,
                            display: 'flex', flexDirection: 'column', gap: ROW_GAP,
                            overflow: 'hidden', cursor: 'pointer',
                            boxShadow: isDragOver ? '0 0 0 2px var(--c-ink), 6px 3px 16px rgba(0,0,0,0.18)'
                              : isPanelOpen ? '0 0 0 2px var(--c-ink), 6px 3px 14px rgba(0,0,0,0.14)'
                              : '5px 2px 12px -1px rgba(0,0,0,0.13), 1px 0 2px rgba(0,0,0,0.05)',
                            transition: 'box-shadow 0.12s ease',
                          }}
                        >
                          {/* Riga sul lato destro, del colore dell'evento */}
                          <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 4, background: stripe }} />
                          <span
                            style={{ fontSize: 11, fontWeight: 700, height: TITLE_ROW_H, lineHeight: `${TITLE_ROW_H}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {item.type === 'event' && item.event.type === 'installation' && <Wrench size={11} />}{title}
                          </span>
                          <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--c-ink3)', height: SUBTITLE_ROW_H, lineHeight: `${SUBTITLE_ROW_H}px`, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {timeLabel}
                          </span>
                          {/* Persone assegnate: avatar sovrapposti, sempre su UNA riga così
                              tutte le card hanno la stessa altezza. Con una sola persona
                              compare anche il nome. Puntino arancione = orario diverso da
                              quello della card (dettaglio nella colonna laterale). */}
                          <div style={{ display: 'flex', alignItems: 'center', height: AVATAR_ROW_H, flexShrink: 0, minWidth: 0 }}>
                            {(() => {
                              const people_ = item.bars
                              const shownBars = people_.length > MAX_AVATARS ? people_.slice(0, MAX_AVATARS - 1) : people_
                              const extra = people_.length - shownBars.length
                              const nameOf = a => (a.workerId ? people.find(p => p.id === a.workerId)?.name : a.externalWorkerName) || '?'
                              return (
                                <>
                                  {shownBars.map(({ a, left, width }, i) => {
                                    const name = nameOf(a)
                                    const personId = a.workerId || a.externalWorkerId
                                    const differs = left > 0.005 || width < 0.995
                                    return (
                                      <span key={a.id} title={`${name} · ${a.startTime}–${a.endTime}`}
                                        style={{ position: 'relative', width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: '50%', flexShrink: 0, marginLeft: i === 0 ? 0 : -6, background: isPast ? '#9a9a9a' : personColor(personId), color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--c-surface)', zIndex: shownBars.length - i }}>
                                        {initials(name)}
                                        {differs && <span aria-hidden="true" style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#ea580c', boxShadow: '0 0 0 1.5px var(--c-surface)' }} />}
                                      </span>
                                    )
                                  })}
                                  {extra > 0 && (
                                    <span title={people_.slice(shownBars.length).map(b => nameOf(b.a)).join(', ')}
                                      style={{ marginLeft: -6, height: AVATAR_SIZE, minWidth: AVATAR_SIZE, padding: '0 6px', boxSizing: 'border-box', borderRadius: AVATAR_SIZE / 2, flexShrink: 0, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--c-surface)' }}>+{extra}</span>
                                  )}
                                  {people_.length === 1 && (
                                    <span style={{ marginLeft: 7, minWidth: 0, fontSize: 10.5, fontWeight: 700, color: isPast ? 'var(--c-ink3)' : 'var(--c-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(people_[0].a)}</span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
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
      <div ref={filterRowRef} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('staffTimeline.filterLabel')}</span>
        <button type="button" className="btn-no-anim" onClick={() => setShowEvents(v => !v)} aria-pressed={showEvents}
          style={{
            padding: '5px 12px', borderRadius: 20,
            border: `1.5px solid ${showEvents ? '#e63946' : 'var(--c-line)'}`,
            background: showEvents ? 'rgba(230,57,70,0.1)' : 'var(--c-surface)',
            color: showEvents ? '#e63946' : 'var(--c-ink3)',
            fontSize: 12, fontWeight: 700, textDecoration: showEvents ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterEvents')}
        </button>
        <button type="button" className="btn-no-anim" onClick={() => setShowInstallations(v => !v)} aria-pressed={showInstallations}
          style={{
            padding: '5px 12px', borderRadius: 20,
            border: `1.5px solid ${showInstallations ? '#7c6fcd' : 'var(--c-line)'}`,
            background: showInstallations ? '#7c6fcd18' : 'var(--c-surface)',
            color: showInstallations ? '#7c6fcd' : 'var(--c-ink3)',
            fontSize: 12, fontWeight: 700, textDecoration: showInstallations ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterInstallations')}
        </button>
        <button type="button" className="btn-no-anim" onClick={() => setShowPhases(v => !v)} aria-pressed={showPhases}
          style={{
            padding: '5px 12px', borderRadius: 20,
            border: `1.5px solid ${showPhases ? PHASE_COLORS.montaggio : 'var(--c-line)'}`,
            background: showPhases ? `${PHASE_COLORS.montaggio}18` : 'var(--c-surface)',
            color: showPhases ? PHASE_COLORS.montaggio : 'var(--c-ink3)',
            fontSize: 12, fontWeight: 700, textDecoration: showPhases ? 'none' : 'line-through',
          }}>
          {t('staffTimeline.filterPhases')}
        </button>
      </div>

      </div>

      {panelItem && readOnly && (
        <aside key={`${panel.key}-${panel.date}`} className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 76px)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 28px 8px', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--c-ink)', letterSpacing: '-0.3px', overflowWrap: 'anywhere' }}>
              {panelItem.type === 'task' ? (panelItem.block.label || t('staffTimeline.untitledTask')) : panelItem.type === 'phase' ? `${PHASE_META[panelItem.phaseKey].label} · ${panelItem.event.name}` : panelItem.event.name}
            </h2>
            <button onClick={() => setPanel(null)} className="btn-no-anim" aria-label={t('common.close')}
              style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 20px' }}>
            {panelItem.type === 'task'
              ? <TaskSummaryBody block={{ ...panelItem.block, startTime: panelItem.startTime, endTime: panelItem.endTime, assigned: panelItem.assigned }} workers={workers} />
              : <ArchiveEventDetail event={panelItem.event} workers={workers} blocks={blocks.filter(b => b.eventId === panelItem.event.id)} vehicles={[]} loadListsOn />}
          </div>
          {panelItem.type !== 'task' && (
            <div className="rc-side-footer">
              <button onClick={() => navigate(`/events/${panelItem.event.id}`)} className="btn-no-anim"
                style={{ width: '100%', padding: '14px 16px', borderRadius: 13, background: '#e63946', color: '#fff', fontSize: 15, fontWeight: 800 }}>
                {t('eventSummary.goToLoadList')}
              </button>
            </div>
          )}
        </aside>
      )}

      {panelItem && !readOnly && (
        <StaffAssignPanel
          key={`${panel.key}-${panel.date}-${panelItem.event?.dayTimes?.[panel.date] ? 'o' : 'n'}-${panelItem.phaseKey && panelItem.event?.phaseTimes?.[panelItem.phaseKey] ? 'p' : 'q'}`}
          item={panelItem}
          date={panel.date}
          isNew={!!panel.isNew}
          activeWorkers={activeWorkers}
          events={events}
          externalWorkers={externalWorkers}
          unavailability={unavailability}
          focusAddToken={panel.focusToken}
          draggedPerson={draggedPerson}
          onDropPerson={person => { setDraggedPerson(null); if (person.kind === 'quick-external') setPanel(p => (p ? { ...p, focusToken: Date.now() } : p)); else addFromPanel(person) }}
          onClose={closePanel}
          onAddPerson={addFromPanel}
          onRemoveBlock={b => removeBlockFromItem(panelItem, b)}
          onSave={savePanel}
          onDeleteTask={deleteTaskFromPanel}
          onResetDayHours={() => (panelItem.type === 'phase' ? resetPhaseHours(panelItem.event, panelItem.phaseKey) : resetDayHours(panelItem.event, panel.date))}
          onOpenEvent={() => navigate(`/events/${panelItem.event.id}`)}
          onDirtyChange={d => { panelDirtyRef.current = d }}
        />
      )}
      {invitePrompt && (
        <GuestInvitePrompt count={invitePrompt.length}
          onGo={dontShow => { if (dontShow) muteInvitePrompt(); const ids = invitePrompt.map(p => p.id); setInvitePrompt(null); navigate('/admin/settings/users', { state: { highlightExternalIds: ids } }) }}
          onClose={dontShow => { if (dontShow) muteInvitePrompt(); setInvitePrompt(null) }} />
      )}
    </div>
  )
}
