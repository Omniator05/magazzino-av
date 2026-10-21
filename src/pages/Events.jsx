import { useState, useEffect } from 'react'
import { useModalDrag } from '../hooks/useModalDrag'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../utils/formatDate'
import DeleteButton from '../components/DeleteButton'
import EditButton from '../components/EditButton'
import { Pin, Dot } from '../components/Icon'
import { EventListSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import EventFormFields from '../components/EventFormFields'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import FabButton from '../components/FabButton'
import { pushEventToGoogle } from '../utils/googleCalendar'
import { notifyEventTimeChangedIfNeeded } from '../utils/pushNotifications'
import { rememberEventManager } from '../utils/eventManagers'
import { db } from '../firebase'
import { collection, updateDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import { isModuleEnabled } from '../utils/modules'
import { deleteEventWithInventoryCheck, closeInstallationEvent } from '../utils/kitInventory'
import CloseInstallationModal from '../components/CloseInstallationModal'
import CreateEventFlow from '../components/CreateEventFlow'
import { useIsMobile } from '../hooks/useIsMobile'

const EVENT_CAP = 5

/* ── Inline SVG icons (coerenti con Dashboard.jsx, no emoji) ──────────────── */
const IconChevronSection = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition:'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconNote = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
  </svg>
)
const IconCheckSm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconArchive = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
)
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

// Definiti a livello di modulo (non dentro Events()) così React li riconosce
// come lo stesso tipo di componente tra un render e l'altro invece di
// smontare/rimontare ogni card a ogni tasto premuto nella ricerca.
// Fasi (montaggio/smontaggio) di un evento che cadono oggi.
const PHASE_TODAY_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }
function phaseKeysToday(ev, today) {
  return Object.entries(ev.phases || {}).filter(([k, d]) => d === today && PHASE_TODAY_COLORS[k]).map(([k]) => k)
}

// todayKind (dalla sezione "Oggi"): 'event' = l'evento è in corso oggi,
// 'phase' = oggi c'è solo un montaggio/smontaggio di un evento di un altro
// giorno — la card mostra OGGI nell'icona (blu/arancione come la fase) e
// la fase nella riga di stato.
function EventCard({ event, today, t, i18n, navigate, phaseConfig, onEdit, onDelete, loadListsOn, todayKind }) {
  const isPhaseOnly = todayKind === 'phase'
  const phaseKeys = isPhaseOnly ? phaseKeysToday(event, today) : []
  const phaseColor = isPhaseOnly && phaseKeys[0] ? PHASE_TODAY_COLORS[phaseKeys[0]] : null
  const shownDate = isPhaseOnly ? today : event.date
  const items    = event.items || []
  // Se il modulo liste di carico è disattivato, la riga di stato sotto il
  // titolo non va mostrata: azzerare qui invece che nel JSX fa sì che anche
  // i colori/bordo derivati (iconGradient, cardBorder) tornino da soli ai
  // rami "non caricato" senza doverli duplicare.
  const prepared = loadListsOn ? items.filter(i => i.pronto).length : 0
  const loaded   = loadListsOn ? items.filter(i => i.loaded).length : 0
  const returned = loadListsOn ? items.filter(i => i.returned).length : 0
  const total    = loadListsOn ? items.length : 0
  const isToday  = event.date === today || !!todayKind
  const evEnd    = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const isMultiDay = !isPhaseOnly && evEnd !== event.date
  const isPast   = evEnd < today
  // Un rent/install scaduto conta come "da scaricare" anche se tutto è già
  // rientrato — a differenza di un evento normale, qui l'urgenza non è "c'è
  // ancora roba fuori" ma "va chiuso": vedi il bottone "Termina Rent/Chiudi
  // Install" più sotto, raggiunto proprio passando da questa sezione.
  const daScaricare = loadListsOn && isPast && (event.type === 'installation' || items.some(i => i.loaded && !i.returned))

  // Segue lo stadio più avanzato raggiunto da almeno un oggetto — appena i
  // magazzinieri iniziano a lavorarci la dicitura passa da "N oggetti in
  // lista" (nessuno ancora toccato) a "Pronti"/"Caricati"/"Rientrati" con il
  // conteggio, nello stesso ordine in cui li segnano dallo scanner.
  let statusColor = 'var(--dash-muted)', statusText = t('events.statusEmptyList')
  if (total > 0) {
    if (returned > 0)      { statusColor = 'var(--c-green)'; statusText = t('events.statusReturnedCount', { returned, total }) }
    else if (loaded > 0)   { statusColor = 'var(--c-amber)'; statusText = t('events.statusLoadedCount', { loaded, total }) }
    else if (prepared > 0) { statusColor = 'var(--blue)'; statusText = t('events.statusReadyCount', { prepared, total }) }
    else                    { statusColor = 'var(--dash-muted)'; statusText = t('events.statusInList', { count: total }) }
  }

  const iconGradient = daScaricare
    ? '#fb8500'
    : phaseColor
    ? phaseColor
    : event.type === 'installation'
    ? '#a7c957'
    : (isToday || loaded > 0)
    ? 'var(--accent)'
    : '#a8dadc'

  const cardBorder = phaseColor ? `${phaseColor}66` : isToday ? 'rgba(220,38,38,0.4)' : daScaricare ? 'rgba(234,88,12,0.4)' : 'var(--dash-card-border)'

  return (
    <div onClick={() => navigate(`/events/${event.id}`)}
      className="event-card"
      style={{ cursor:'pointer', margin:'0 16px 10px', background:'var(--dash-card)', border:`1.5px solid ${cardBorder}`, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 12px 10px 10px', gap:12, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}
    >
      {/* Icona gradiente con data — se dura più giorni mostra l'intervallo
          (es. "14-18") invece del solo primo giorno, che da solo lasciava
          credere fosse un evento di un giorno. Font più piccolo per
          l'intervallo: due numeri e un trattino non ci stanno alla stessa
          taglia del singolo giorno nel riquadro da 52px. */}
      <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
        <div style={{ width:52, height:52, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
          <span style={{ fontSize: isMultiDay ? 15 : 20, fontWeight:800 }}>
            {shownDate ? (isMultiDay ? `${new Date(shownDate+'T12:00:00').getDate()}-${new Date(evEnd+'T12:00:00').getDate()}` : new Date(shownDate+'T12:00:00').getDate()) : '?'}
          </span>
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
            {shownDate ? formatDate(shownDate+'T12:00:00', {month:'short'}, i18n.language) : ''}
          </span>
        </div>
        {event.seriesId && (
          <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--dash-card)' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </span>
        )}
      </div>

      {/* Contenuto centrale — anche bottone reale per l'apertura da tastiera
          (il div esterno resta cliccabile per mouse/touch su tutta la riga;
          questo bottone copre solo la parte centrale, non le azioni, così
          non si annidano bottoni dentro bottoni). */}
      <button type="button"
        onClick={e => { e.stopPropagation(); navigate(`/events/${event.id}`) }}
        aria-label={t('events.openEventAria', { name: event.name })}
        style={{ flex:1, minWidth:0, background:'transparent', border:'none', padding:0, margin:0, textAlign:'left', cursor:'pointer', font:'inherit', color:'inherit' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, minWidth:0 }}>
          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--dash-title)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{event.name}</h3>
          {/* Qui finisce anche un rent/install scaduto (vedi daScaricare
              sopra) — senza questo tag perderebbe l'unico segno che lo
              distingue da un evento normale, visibile invece sulla sua
              card originale in "Installazioni". */}
          {event.type === 'installation' && (
            <span className="install-tag" style={{ background:'var(--c-violet-bg)', color:'#5b4fcf', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:800, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em' }}>{t('events.installLabel')}</span>
          )}
        </div>
        {isPhaseOnly && phaseKeys.map(k => {
          const pt = event.phaseTimes?.[k]
          return (
            <p key={k} style={{ fontSize:12, fontWeight:700, color:PHASE_TODAY_COLORS[k], display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
              <Dot size={7} color={PHASE_TODAY_COLORS[k]} />
              {t('workerHome.phaseTodayBadge', { phase: t(k === 'montaggio' ? 'calendar.legendAssembly' : 'calendar.legendDisassembly') })}
              {pt?.timeStart && pt?.timeEnd && <span style={{ fontVariantNumeric:'tabular-nums' }}>· {pt.timeStart}–{pt.timeEnd}</span>}
            </p>
          )
        })}
        {loadListsOn && (
          <p style={{ fontSize:12, fontWeight:600, color: daScaricare ? '#ea580c' : (isToday && !isPhaseOnly) ? 'var(--c-danger)' : statusColor, display:'flex', alignItems:'center', gap:5 }}>
            {(daScaricare || (isToday && !isPhaseOnly)) && <Dot size={7} color={daScaricare ? '#ea580c' : 'var(--c-danger)'} />}
            {daScaricare
              // Un rent/install scaduto va chiuso anche se non c'è più
              // nulla da rientrare fisicamente (total-returned potrebbe
              // essere 0) — "0 da rientrare" leggerebbe come "niente da
              // fare", il contrario del messaggio voluto.
              ? (event.type === 'installation' ? t('events.installationEnded') : t('events.daScaricareCount', { count: total-returned }))
              : (isToday && !isPhaseOnly) ? t('events.todayStatus', { status: statusText.toLowerCase() }) : statusText}
          </p>
        )}
        {(event.location || (event.phases && phaseConfig.some(p => event.phases[p.key]))) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
            {event.location && <span style={{ fontSize:11, color:'var(--dash-muted)', display:'inline-flex', alignItems:'center', gap:4 }}><Pin size={12} /> {event.location}</span>}
            {event.phases && phaseConfig.filter(p => event.phases[p.key]).map(p => (
              <span key={p.key} style={{ background:p.bg, color:p.color, borderRadius:5, padding:'1px 6px', fontSize:10, fontWeight:700 }}>
                {p.label} {formatDate(event.phases[p.key]+'T12:00:00', {day:'numeric',month:'short'}, i18n.language)}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Azioni */}
      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
        <EditButton onClick={e => onEdit(e, event)} size={44} ariaLabel={t('events.editEventAria')} />
        <DeleteButton onClick={e => onDelete(e, event)} size={44} ariaLabel={t('events.deleteEventAria')} />
      </div>
    </div>
  )
}

// Stessa "forma" delle card evento normali (icona-data 52px, bordo che
// segnala solo uno stato che conta, azioni a bottone nell'angolo) — prima
// questa card era strutturalmente un'altra cosa (icona piccola fissa,
// bordo viola permanente, bottone "chiudi" a piena larghezza incorporato),
// il che la faceva sembrare un pezzo di un'altra app. Violetto e tag "Rent/
// Install" restano — sono loro a dire "questo è diverso da un evento",
// non tutto il resto della card.
function InstallationCard({ event: inst, today, t, i18n, navigate, onEdit, onDelete, onClose, loadListsOn }) {
  const items     = inst.items || []
  const loaded    = items.filter(i => i.loaded).length
  const total     = items.length
  // Niente più stato "scaduto" qui: un rent/install con dateEnd passato non
  // arriva mai a questa card — è già stato spostato per intero nella
  // sezione "Da scaricare" (vedi installations/daScaricareSingle sopra).
  // "Oggi" per un rent/install = comincia oggi, cioè va preparato/caricato
  // oggi — stessa idea di isToday per gli eventi normali, così una riga che
  // altrimenti si perde in mezzo a tutte le altre nella sezione Rent/Install
  // si fa notare quando conta davvero (stessa richiesta di quel colore
  // "speciale": qui è lo stesso rosso urgente degli eventi di oggi, non un
  // terzo colore da imparare a riconoscere in più).
  const isToday = inst.date === today

  const cardBorder = isToday ? 'rgba(220,38,38,0.4)' : 'var(--dash-card-border)'
  const iconColor = isToday ? 'var(--accent)' : '#7c6fea'
  const statusColor = isToday ? 'var(--c-danger)' : loaded > 0 ? '#5b4fcf' : 'var(--dash-muted)'
  const baseStatusText = total === 0 ? t('events.emptyListShort') : loaded === 0 ? t('events.inListShort', { count: total }) : t('events.installedOfTotal', { loaded, total })
  const statusText = isToday ? t('events.todayStatus', { status: baseStatusText.toLowerCase() }) : baseStatusText

  return (
    <div onClick={() => navigate(`/events/${inst.id}`)}
      className="event-card"
      style={{ cursor:'pointer', margin:'0 16px 10px', background:'var(--dash-card)', border:`1.5px solid ${cardBorder}`, borderRadius:20, display:'flex', alignItems:'center', padding:'10px 12px 10px 10px', gap:12, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}
    >
      {/* Icona — stesso blocco data 52px delle card normali: violetto di
          norma (identità "rent/install"), rosso se comincia oggi — sempre
          l'identità del tag a dire "rent/install", il colore a dire "urgenza". */}
      <div style={{ width:52, height:52, borderRadius:13, background:iconColor, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'white', lineHeight:1.1 }}>
        <span style={{ fontSize:20, fontWeight:800 }}>{inst.date ? new Date(inst.date+'T12:00:00').getDate() : '?'}</span>
        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>{inst.date ? formatDate(inst.date+'T12:00:00', {month:'short'}, i18n.language) : ''}</span>
      </div>

      <button type="button"
        onClick={e => { e.stopPropagation(); navigate(`/events/${inst.id}`) }}
        aria-label={t('events.openEventAria', { name: inst.name })}
        style={{ flex:1, minWidth:0, background:'transparent', border:'none', padding:0, margin:0, textAlign:'left', cursor:'pointer', font:'inherit', color:'inherit' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, minWidth:0 }}>
          {/* Niente flex:1 qui: il titolo si allarga solo quanto serve al
              proprio testo (min-content grazie a minWidth:0), così il tag
              gli sta subito accanto invece di finire spinto in fondo alla
              riga per titoli corti. Continua comunque a troncare con
              ellissi quando lo spazio scarseggia. */}
          <h3 style={{ fontSize:15, fontWeight:700, color:'var(--dash-title)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{inst.name}</h3>
          {/* Nascosto sotto i 480px: su telefono, fra icona-data, titolo e i
              tre bottoni-azione, il tag finiva per mangiarsi quasi tutto lo
              spazio del titolo. Il colore della card (icona viola/rossa)
              basta comunque a distinguerla da un evento normale. */}
          <span className="install-tag" style={{ background:'var(--c-violet-bg)', color:'#5b4fcf', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:800, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em' }}>{t('events.installLabel')}</span>
        </div>
        {loadListsOn && (
          <p style={{ fontSize:12, fontWeight:600, color:statusColor, display:'flex', alignItems:'center', gap:5 }}>
            {isToday && <Dot size={7} color="var(--c-danger)" />}
            {statusText}
          </p>
        )}
        {inst.location && <span style={{ fontSize:11, color:'var(--dash-muted)', marginTop:4, display:'inline-flex', alignItems:'center', gap:4 }}><Pin size={12} /> {inst.location}</span>}
      </button>

      {/* Azioni — stessa fila a bottoni-icona 44px delle card normali, con
          in più la chiusura rapida (era prima un bottone a piena
          larghezza sotto, ora un'icona in fila con le altre due). */}
      <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onClose(inst)} aria-label={t('events.closeInstallationBtn')} title={t('events.closeInstallationBtn')}
          style={{ width:44, height:44, borderRadius:12, background:'var(--c-violet-bg)', color:'#5b4fcf', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <IconCheckSm />
        </button>
        <EditButton onClick={e => onEdit(e, inst)} size={44} ariaLabel={t('events.editInstallationAria')} />
        <DeleteButton onClick={e => onDelete(e, inst)} size={44} ariaLabel={t('events.deleteInstallationAria')} />
      </div>
    </div>
  )
}

export default function Events() {
  const { t, i18n } = useTranslation()
  const { team, teamId, user } = useAuth()
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const confirm = useConfirm()
  const PHASE_CONFIG = [
    { key:'montaggio',  label:t('calendar.legendAssembly'),    color:'#2563eb', bg:'var(--c-blue-bg)' },
    { key:'smontaggio', label:t('calendar.legendDisassembly'), color:'#ea580c', bg:'var(--c-orange-bg)' },
  ]
  const [events, setEvents]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const eventDrag = useModalDrag(() => setShowModal(false))
  const [showSearch, setShowSearch]     = useState(false)
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('events_sections')
      return saved ? JSON.parse(saved) : { recurring: true, unload: true, upcoming: true, installations: false }
    } catch { return { recurring: true, unload: true, upcoming: true } }
  })
  const [search, setSearch]       = useState('')
  const [closingInstallation, setClosingInstallation] = useState(null)
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', allDay:true, timeStart:'', timeEnd:'', location:'', notes:'', type:'event', phases:{}, quoteRef:'', managerName:'', managerPhone:'', managerEmail:'' })
  // Aperta di default solo se l'evento in modifica ha già un valore qui
  // dentro (vedi openEdit sotto) — altrimenti resta chiusa come in creazione.
  // Flusso unico di creazione evento (Calendar.jsx monta lo stesso componente):
  // vedi src/components/CreateEventFlow.jsx.
  const [createFlowOpen, setCreateFlowOpen] = useState(false)
  const [createFlowSkip, setCreateFlowSkip] = useState(null)
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const isMobile = useIsMobile()
  // Su computer un evento nuovo si crea dal Calendario (colonna laterale), non
  // più da questo modal: stesso flusso, un solo posto. Su telefono resta il modal,
  // lo stesso che usa il calendario mobile.
  const startNewEvent = () => {
    if (!isMobile) { navigate('/calendar', { state: { createEvent: true } }); return }
    setCreateFlowSkip('blank'); setCreateFlowOpen(true)
  }
  const anyModalOpen = showModal || createFlowOpen
  useModalScrollLock(anyModalOpen)

  // Se arrivo dall'archivio con un template, o dalla home con "crea evento",
  // apro subito il flusso di creazione saltando la schermata di scelta.
  useEffect(() => {
    if (navState?.templateItems) {
      setCreateFlowSkip({ name: navState.templateName || '', items: navState.templateItems, lists: navState.templateLists || [], mainListName: navState.templateMainListName || '' })
      setCreateFlowOpen(true)
      window.history.replaceState({}, '')
    } else if (navState?.openNewEvent) {
      if (!isMobile) { navigate('/calendar', { state: { createEvent: true }, replace: true }); return }
      setCreateFlowSkip('blank')
      setCreateFlowOpen(true)
      window.history.replaceState({}, '')
    }
  }, [navState])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    // isDeadlineReminder: promemoria scadenze auto-generati (vedi utils/deadlines.js)
    // — compaiono solo in Calendario, mai tra le liste di carico vere.
    return onSnapshot(q, snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.isDeadlineReminder)); setLoading(false) })
  }, [teamId])

  // ── Import da Google Calendar (i collaboratori scrivono lì, non in app) ──
  const today = new Date().toISOString().split('T')[0]

  // Separa ricorrenti (solo il prossimo per serie) da singoli
  const recurringSeriesMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringSeriesMap[ev.seriesId]) recurringSeriesMap[ev.seriesId] = []
      recurringSeriesMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringSeriesMap).flatMap(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    const nextFuture = sorted.find(e => e.date >= today)
    // Tutte le occorrenze passate con articoli ancora non rientrati — mai nascoste
    // solo perché esiste già una prossima occorrenza futura da mostrare
    const pastUnfinished = sorted.filter(e => {
      if (e.date >= today) return false
      const items = e.items || []
      return items.length > 0 && items.some(i => i.loaded && !i.returned)
    })
    const result = [...pastUnfinished]
    if (nextFuture) result.push(nextFuture)
    else if (result.length === 0) result.push(sorted[sorted.length - 1])
    return result
  })

  const singleEvents   = events.filter(e => !e.seriesId && e.type !== 'installation')
  // Un rent/install può avere una data di inizio anche molto lontana (resta
  // "attivo" finché non lo si chiude), quindi il normale ordine per data non
  // basta a farlo notare quando conta — a differenza degli eventi, dove
  // "oggi" è già in pratica il primo della lista essendo la data più vicina
  // fra quelle mostrate. Qui va promosso esplicitamente in cima, così si
  // vede a colpo d'occhio anche in mezzo a rent più vecchi.
  // Un rent/install SCADUTO (dateEnd passato) non resta anche qui: passa
  // per intero nella sezione "Da scaricare" sopra (vedi daScaricareSingle),
  // arancione e in cima — se restasse ANCHE qui finirebbe duplicato, in due
  // sezioni con due trattamenti diversi (qui era rosso "Scaduto") invece di
  // "salire" chiaramente in cima a una sola.
  // Un rent di un giorno solo lascia "data fine" vuota (solo "data inizio"
  // compilata): senza questo fallback, un e.dateEnd vuoto rendeva "e.dateEnd
  // && ..." sempre falso e un rent di un giorno scaduto non risultava MAI
  // scaduto — bug che valeva anche per `installations`/`daScaricareSingle`
  // sotto, spostata qui sopra apposta perché entrambe la usano.
  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date

  const installations  = events
    .filter(e => e.type === 'installation' && !e.archived && effectiveEndDate(e) >= today)
    .sort((a, b) => (a.date === today) === (b.date === today) ? 0 : a.date === today ? -1 : 1)

  // Un evento rimane "attivo" se:
  // 1. la data di FINE (o inizio, se monogiorno) è oggi o futura, OPPURE
  // 2. la data di fine è passata ma non tutti gli articoli sono rientrati

  const isActive = e => {
    if (effectiveEndDate(e) >= today) return true
    const items = e.items || []
    if (items.length === 0) return false          // nessun articolo → va in archivio
    return items.some(i => i.loaded && !i.returned) // qualcosa ancora fuori
  }

  // Un evento di OGGI il cui carico è già rientrato per intero (prova che
  // sia stato davvero eseguito — non basta "niente ancora caricato", che
  // varrebbe anche prima che la giornata inizi) sparisce subito dagli "in
  // programma", senza aspettare la mezzanotte — vedi anche Archive.jsx.
  const isWrappedToday = e => {
    if (effectiveEndDate(e) !== today) return false
    const items = e.items || []
    return items.some(i => i.returned) && !items.some(i => i.loaded && !i.returned)
  }

  const daScaricareSingle = events.filter(e => {
    if (e.seriesId) return false  // i ricorrenti passati non rientrati sono già in pastUnfinished sopra
    if (e.type === 'installation') {
      // Un rent/install resta caricato/non rientrato DI PROPOSITO finché è
      // ancora attivo — ma una volta SCADUTO (fine contratto prevista
      // passata) è la stessa urgenza di un evento dimenticato: va scaricato/
      // richiuso, quindi qui ci entra a pieno titolo invece di restare
      // invisibile nella sua sezione collassata.
      return !e.archived && effectiveEndDate(e) < today
    }
    if (effectiveEndDate(e) >= today) return false
    const its = e.items || []
    return its.length > 0 && its.some(i => i.loaded && !i.returned)
  }).sort((a, b) => (a.type === 'installation') === (b.type === 'installation') ? 0 : a.type === 'installation' ? -1 : 1)

  // Sezione "Oggi": eventi di oggi (anche in corso da prima; un rent/install
  // solo se parte oggi) e montaggi/smontaggi con data di OGGI — questi anche
  // se l'evento è un altro giorno. Chi è già in "Da scaricare" resta lì.
  // Quello che entra qui non si ripete nelle altre sezioni.
  const daScaricareIds = new Set(daScaricareSingle.map(e => e.id))
  const happeningToday = e => (e.type !== 'installation' && e.date <= today && effectiveEndDate(e) >= today && !isWrappedToday(e))
    || (e.type === 'installation' && e.date === today)
  const todayList = events.filter(e => !e.archived && !e.isDeadlineReminder && !daScaricareIds.has(e.id) && (happeningToday(e) || phaseKeysToday(e, today).length > 0))
    .sort((a, b) => (happeningToday(b) ? 1 : 0) - (happeningToday(a) ? 1 : 0))
  const todayIds = new Set(todayList.map(e => e.id))
  const upcomingSingle = singleEvents.filter(e => effectiveEndDate(e) >= today && !isWrappedToday(e) && !todayIds.has(e.id))
  const recurringShown = pinnedRecurring.filter(e => !todayIds.has(e.id))
  const installationsShown = installations.filter(e => !todayIds.has(e.id))

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
  // Solo quelli ancora "vivi" (in programma, di oggi, o passati ma con roba
  // ancora fuori / rent scaduto da chiudere) — i passati già conclusi stanno
  // nell'Archivio, che ha la sua ricerca.
  const isSearchable = e => !e.isDeadlineReminder && !e.archived && (e.type === 'installation' || (isActive(e) && !isWrappedToday(e)))
  const searchResults = search.trim()
    ? events.filter(e =>
        isSearchable(e) && (
          e.name?.toLowerCase().includes(search.toLowerCase()) ||
          e.location?.toLowerCase().includes(search.toLowerCase())
        )
      )
    : []

  const openEdit = (e, event) => {
    e.stopPropagation()
    setEditing(event)
    setForm({
      name:event.name||'', date:event.date||'', dateEnd:event.dateEnd||'',
      allDay: event.allDay !== false, timeStart: event.timeStart||'', timeEnd: event.timeEnd||'',
      location:event.location||'', notes:event.notes||'', type: event.type||'event', phases: event.phases||{},
      quoteRef: event.quoteRef||'', managerName: event.eventManager?.name||'', managerPhone: event.eventManager?.phone||'', managerEmail: event.eventManager?.email||'',
    })
    setShowModal(true)
  }

  // Solo modifica: la creazione (vuota, da template, ricorrente) passa tutta
  // da CreateEventFlow, montato più sotto — vedi src/components/CreateEventFlow.jsx.
  const saveEvent = async () => {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      const updated = {
        name: form.name.trim(), date: form.date,
        dateEnd: form.dateEnd || null,
        allDay: form.allDay, timeStart: form.allDay ? null : (form.timeStart || null), timeEnd: form.allDay ? null : (form.timeEnd || null),
        location: form.location.trim(), notes: form.notes.trim(),
        type: form.type || 'event',
        phases: form.phases || {},
        quoteRef: form.quoteRef.trim(),
        eventManager: { name: form.managerName.trim(), phone: form.managerPhone.trim(), email: form.managerEmail.trim() },
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'events', editing.id), updated)
      pushEventToGoogle(editing.id)
      if (updated.eventManager.name) rememberEventManager(teamId, user.uid, updated.eventManager).catch(() => {})
      notifyEventTimeChangedIfNeeded(editing.id, editing, updated)
      setShowModal(false)
      setEditing(null)
      setForm({ name:'', date:new Date().toISOString().split('T')[0], dateEnd:'', allDay:true, timeStart:'', timeEnd:'', location:'', notes:'', type:'event', phases:{}, quoteRef:'', managerName:'', managerPhone:'', managerEmail:'' })
    } finally { setSaving(false) }
  }

  const deleteEvent = async (e, event) => {
    e.stopPropagation()
    if (event.seriesId) {
      if (await confirm({ title: t('calendar.confirmDeleteEventTitle'), message: t('events.confirmDeleteSeriesMessage'), confirmLabel: t('calendar.confirmDeleteEventLabel'), danger: true })) {
        await deleteEventWithInventoryCheck({ event, confirm, t })
      }
    } else {
      if (await confirm({ title: t('calendar.confirmDeleteEventTitle'), message: t('events.confirmDeleteMessage'), confirmLabel: t('calendar.confirmDeleteEventLabel'), danger: true })) {
        await deleteEventWithInventoryCheck({ event, confirm, t })
      }
    }
  }

  const cardProps = { today, t, i18n, navigate, phaseConfig: PHASE_CONFIG, onEdit: openEdit, onDelete: deleteEvent, loadListsOn }

  const instCardProps = { today, t, i18n, navigate, onEdit: openEdit, onDelete: deleteEvent, onClose: setClosingInstallation, loadListsOn }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:140 }}>
      <div className="page-header rc-page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>{t('events.title')}</h1>
            <p>{t('events.upcomingCount', { count: upcomingSingle.length + recurringShown.length + todayList.length })}</p>
          </div>
          <button onClick={() => navigate('/archive')} className="rc-pill-btn" style={{ padding:'9px 14px', fontSize:12.5, gap:6 }}>
            <IconArchive /> {t('events.archive')}
          </button>
        </div>
      </div>

      <FabButton onClick={startNewEvent} ariaLabel={t('events.newEventButton')} />

      {/* Barra di ricerca SEMPRE visibile — stessa del Magazzino (fondo grigio,
          appiccicata in alto), con un po' d'aria sotto l'intestazione. */}
      <div className="search-bar rc-inv-search" style={{ marginTop:14 }}>
        <div>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('events.searchPlaceholder')} aria-label={t('events.searchPlaceholder')} />
        </div>
      </div>

      <div style={{ padding:'12px 0 0' }}>

        {/* Risultati ricerca */}
        {loading ? (
          <EventListSkeleton count={6} />
        ) : search.trim() ? (
          <>
            <p style={{ padding:'0 16px 12px', color:'var(--dash-muted)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.resultsCount', { count: searchResults.length })}</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--dash-muted)', textAlign:'center' }}>{t('events.noResultsFor', { search })}</p>
              : searchResults.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)
            }
          </>
        ) : (
          <>
            {/* OGGI — eventi di oggi e montaggi/smontaggi di oggi (anche di eventi
                in un altro giorno): separati dai "prossimi" per vedere subito
                cosa c'è da fare oggi. Sempre aperta, non collassabile. */}
            {todayList.length > 0 && (
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px' }}>
                  <span style={{ color:'#e63946', fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.todoToday')}</span>
                  <span style={{ background:'rgba(230,57,70,0.12)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:800, color:'#e63946' }}>{todayList.length}</span>
                </div>
                {todayList.map(ev => ev.type === 'installation'
                  ? <InstallationCard key={ev.id} event={ev} {...instCardProps} />
                  : <EventCard key={ev.id} event={ev} {...cardProps} todayKind={happeningToday(ev) ? 'event' : 'phase'} />)}
              </div>
            )}

            {/* DA SCARICARE — collassabile, solo se il modulo liste di carico è attivo */}
            {loadListsOn && daScaricareSingle.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('unload')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#ea580c', display:'flex' }}><IconChevronSection open={openSections.unload} /></span>
                  <span className="section-label" style={{ color:'#ea580c', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.toUnload')}</span>
                  <span style={{ background:'#fed7aa', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--c-orange-ink)' }}>{daScaricareSingle.length}</span>
                </button>
                {openSections.unload && daScaricareSingle.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
              </div>
            )}

            {/* RICORRENTI — collassabile */}
            {recurringShown.length > 0 && (
              <div style={{ marginBottom:4 }}>
                <button onClick={() => toggle('recurring')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#1d6fce', display:'flex' }}><IconChevronSection open={openSections.recurring} /></span>
                  <span className="section-label" style={{ color:'#1d6fce', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.recurring')}</span>
                  <span style={{ background:'var(--c-blue-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#1e3a5f' }}>{recurringShown.length}</span>
                </button>
                {openSections.recurring && recurringShown.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
              </div>
            )}

            {/* PROSSIMI — collassabile con load more */}
            {upcomingSingle.length > 0 && (
              <div>
                <button onClick={() => toggle('upcoming')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--dash-muted)', display:'flex' }}><IconChevronSection open={openSections.upcoming} /></span>
                  <span className="section-label" style={{ color:'var(--dash-muted)', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('workerHome.upcoming')}</span>
                  <span style={{ background:'var(--dash-pill-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--dash-muted)' }}>{upcomingSingle.length}</span>
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} event={ev} {...cardProps} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'12px', borderRadius:14, background:'var(--dash-pill-bg)', border:'1.5px solid var(--dash-pill-border)', color:'var(--dash-muted)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <IconPlus /> {t('events.moreEvents', { count: hiddenCount })}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* INSTALLAZIONI ATTIVE */}
            {installationsShown.length > 0 && (
              <div style={{ marginTop:8 }}>
                <button onClick={() => toggle('installations')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 16px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#5b4fcf', display:'flex' }}><IconChevronSection open={openSections.installations} /></span>
                  <span className="section-label" style={{ color:'#5b4fcf', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.installations')}</span>
                  <span style={{ background:'var(--c-violet-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#5b4fcf' }}>{installationsShown.length}</span>
                </button>
                {openSections.installations && installationsShown.map(inst => <InstallationCard key={inst.id} event={inst} {...instCardProps} />)}
              </div>
            )}

            {daScaricareSingle.length === 0 && todayList.length === 0 && recurringShown.length === 0 && upcomingSingle.length === 0 && installationsShown.length === 0 && (
              <button
                type="button"
                onClick={startNewEvent}
                className="btn-no-anim"
                style={{ width:'calc(100% - 32px)', margin:'20px 16px', background:'var(--dash-card)', border:'1.5px dashed var(--dash-pill-border)', borderRadius:20, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:10, cursor:'pointer', font:'inherit', color:'inherit' }}
              >
                <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--dash-pill-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dash-muted)' }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                </div>
                <div>
                  <p style={{ fontWeight:700, fontSize:15, color:'var(--dash-title)', marginBottom:4 }}>{t('events.noEventsFunTitle')}</p>
                  <p style={{ fontSize:12.5, color:'var(--dash-muted)', maxWidth:260 }}>{t('events.noEventsFunDesc')}</p>
                </div>
                <span style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:14, background:'var(--accent)', color:'white', fontWeight:700, fontSize:13 }}>
                  <IconPlus /> {t('dashboard.createFirstEvent')}
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Creazione (vuota, da template, ricorrente, event/installazione):
          flusso condiviso con Calendar.jsx, vedi CreateEventFlow.jsx. */}
      <CreateEventFlow
        open={createFlowOpen}
        onClose={() => { setCreateFlowOpen(false); setCreateFlowSkip(null) }}
        skipChoice={createFlowSkip}
        onCreated={(eventId, { fromTemplate }) => { if (fromTemplate) navigate(`/events/${eventId}`) }}
      />

      <CloseInstallationModal
        open={!!closingInstallation}
        onClose={() => setClosingInstallation(null)}
        message={closingInstallation ? t('events.confirmCloseInstallMessage', { name: closingInstallation.name }) : ''}
        onConfirm={async () => { await closeInstallationEvent(closingInstallation.id, closingInstallation.items || []); return true }}
      />

      {/* Modifica evento esistente — niente scelta template qui, quella si
          decide solo in creazione; il tipo (evento/rent-install) invece si
          può ancora cambiare qui: è solo un'etichetta che sposta la lista
          di carico in un'altra sezione, non tocca gli articoli né lo stato
          del carico, quindi non c'è motivo di bloccarla dopo la creazione —
          capita di creare un evento normale e accorgersi poi che in realtà
          è un noleggio lungo. Non offerta per un'occorrenza ricorrente
          (seriesId): ricorrenza e rent/install sono mutuamente esclusive
          anche in creazione, vedi CreateEventFlow.jsx. */}
      {showModal && (
        <div className={`modal-overlay${eventDrag.closing ? ' closing' : ''}`} onClick={eventDrag.onOverlayClick}>
          <div className={`modal${eventDrag.jiggling ? ' modal-jiggle' : ''}${eventDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...eventDrag.props}>
            <button className="close-btn" onClick={eventDrag.close} aria-label={t("common.close")}>✕</button>
            <h2>{t('calendar.editEventTitle')}</h2>
            {/* Stessi campi della colonna del Calendario (EventFormFields). Il tipo
                (evento/rent-install) si può cambiare solo se non è un'occorrenza
                ricorrente. */}
            <div className="rc-ev-form" style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <EventFormFields form={form} setForm={setForm} idp="ev" teamId={teamId} today={today} showType={!editing?.seriesId} useRange />
            </div>
            <button onClick={saveEvent} className="btn btn-primary btn-full" style={{ marginTop:20 }}
              disabled={saving || !form.name.trim() || !form.date}>
              {saving ? t('common.saving') : t('calendar.saveChanges')}
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* Hover sezioni: si ingrandisce solo il testo label, non la barra intera */
        .section-label { display:inline-block; transition: transform 0.15s ease; transform-origin: left center; }
        .btn-section:hover .section-label { transform: scale(1.06); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* La regola globale button:hover aggiunge un'ombra grigia a ogni bottone
           (Modifica/Elimina, il titolo cliccabile...) dentro le card — qui
           sopra a una card che ha già una sua ombra propria risultava sporco.
           Tolta solo l'ombra, non l'intero hover (colore/scala restano). */
        .event-card button:not(:disabled):hover { box-shadow: none; }
        /* Tag "Rent/Install" — via su telefono, dove icona+titolo+3 bottoni
           azione non lasciano spazio per leggere il titolo (vedi sopra). */
        @media (max-width: 480px) {
          .install-tag { display: none; }
        }
      `}</style>
    </div>
  )
}
