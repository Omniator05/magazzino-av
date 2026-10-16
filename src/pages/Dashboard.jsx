import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore'
import { Pin } from '../components/Icon'
import { formatDate } from '../utils/formatDate'
import { isModuleEnabled } from '../utils/modules'
import Profile from './Profile'
import TutorialModal from '../components/TutorialModal'
import GettingStartedWidget from '../components/GettingStartedWidget'
import TodayReminderModal from '../components/TodayReminderModal'
import DeadlineReminderModal from '../components/DeadlineReminderModal'
import RentalEndedReminderModal from '../components/RentalEndedReminderModal'
import ProUpsell from '../components/ProUpsell'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useIsMobile } from '../hooks/useIsMobile'
import { hasUnseenWhatsNew } from '../utils/whatsNew'
import SkyArc from '../components/SkyArc'

const RECAP_SEEN_KEY = 'weeklyRecapSeenWeek'
const RECAP_TASK_DOT = { alta:'#f87171', media:'#f5a623', bassa:'#34d399' }

// Lunedì e domenica della settimana di `d`, come stringhe YYYY-MM-DD
function getWeekRange(d) {
  const day = (d.getDay() + 6) % 7 // 0 = lunedì .. 6 = domenica
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const toStr = x => x.toISOString().split('T')[0]
  return { monday: toStr(monday), sunday: toStr(sunday) }
}

const greetingKey = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'dashboard.greeting_night'
  if (h < 12) return 'dashboard.greeting_morning'
  if (h < 18) return 'dashboard.greeting_afternoon'
  return 'dashboard.greeting_evening'
}

/* ── Inline SVG icons (no emoji, no icon libs) ──────────────── */
const IconCamera = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)
const IconCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
)
const IconTemplate = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M9 21V9"/>
  </svg>
)
const IconChevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconClipboard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>
  </svg>
)
const IconClock = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconTruck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8Z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)
const IconCalendarEmpty = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconPlusSm = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
// Dati della dashboard tenuti in memoria fra una visita e l'altra (vedi
// l'effetto sotto): tornando qui da un'altra pagina la schermata parte già
// piena, invece di montarsi vuota e riempirsi a pezzi — items, eventi,
// attività e furgoni arrivano da quattro ascolti Firestore separati, e
// ognuno ridisegnava l'intera pagina (hero animato compreso) mentre la
// dissolvenza di entrata era ancora in corso, con l'effetto "a scatti".
const EMPTY_DASH = { teamId: null, items: [], events: [], tasks: [], vehicles: [], itemsLoaded: false, eventsLoaded: false }
const dashCache = { ...EMPTY_DASH }
const dashSignature = d => JSON.stringify([d.items, d.events, d.tasks, d.vehicles, d.itemsLoaded, d.eventsLoaded])

export default function Dashboard({ toggleTheme, theme }) {
  const { t, i18n } = useTranslation()
  const { profile, logout, teamId, team, showOverlay } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [showProfile, setShowProfile] = useState(false)
  const [dash, setDash] = useState(() => (dashCache.teamId && dashCache.teamId === teamId ? { ...dashCache } : { ...EMPTY_DASH }))
  const { items, vehicles, tasks, events, itemsLoaded, eventsLoaded } = dash
  const [weather, setWeather] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weatherCache')) } catch { return null }
  })
  const [showRecapBanner, setShowRecapBanner] = useState(false)
  const [showRecapModal, setShowRecapModal] = useState(false)
  const [recapClosing, setRecapClosing] = useState(false)
  const [recapWeek, setRecapWeek] = useState(null)
  const [recapAbsences, setRecapAbsences] = useState([])
  const [recapWorkers, setRecapWorkers] = useState([])
  useModalScrollLock(showRecapModal || showRecapBanner)

  useEffect(() => {
    if (!teamId) return
    // Parte dai dati in memoria (stessa squadra) e riunisce in UN solo
    // aggiornamento le risposte dei quattro ascolti che arrivano a ridosso
    // l'una dell'altra; se i dati sono identici a quelli già a schermo non
    // ridisegna nulla.
    const buffer = dashCache.teamId === teamId ? { ...dashCache } : { ...EMPTY_DASH, teamId }
    let timer = null
    const flush = () => {
      timer = null
      Object.assign(dashCache, buffer, { teamId })
      setDash(prev => (dashSignature(prev) === dashSignature(buffer) ? prev : { ...buffer }))
    }
    const push = patch => { Object.assign(buffer, patch); if (!timer) timer = setTimeout(flush, 40) }
    const docsOf = s => s.docs.map(d => ({ id:d.id, ...d.data() }))
    const u1 = onSnapshot(query(collection(db, 'items'),  where('teamId','==',teamId), orderBy('name')),  s => push({ items: docsOf(s), itemsLoaded: true }))
    // isDeadlineReminder: promemoria scadenze auto-generati (vedi utils/deadlines.js)
    // — compaiono solo in Calendario, mai tra i "prossimi eventi" qui.
    const u2 = onSnapshot(query(collection(db, 'events'), where('teamId','==',teamId), orderBy('date')),  s => push({ events: docsOf(s).filter(e => !e.isDeadlineReminder), eventsLoaded: true }))
    const u3 = onSnapshot(query(collection(db, 'tasks'),  where('teamId','==',teamId)),                   s => push({ tasks: docsOf(s) }))
    const u4 = onSnapshot(query(collection(db, 'vehicles'), where('teamId','==',teamId)),                 s => push({ vehicles: docsOf(s) }))
    return () => { if (timer) clearTimeout(timer); u1(); u2(); u3(); u4() }
  }, [teamId])

  // Resoconto settimanale: solo il lunedì, una volta a settimana (per dispositivo).
  // Aspetta che l'overlay di login/caricamento sia sparito, altrimenti il popup
  // spunterebbe sopra l'animazione invece che dopo.
  useEffect(() => {
    if (!teamId || showOverlay) return
    if (new Date().getDay() !== 1) return
    const { monday, sunday } = getWeekRange(new Date())
    if (localStorage.getItem(RECAP_SEEN_KEY) === monday) return
    setRecapWeek({ monday, sunday })
    setShowRecapBanner(true)
    Promise.all([
      getDocs(query(collection(db, 'unavailability'), where('teamId', '==', teamId))),
      getDocs(query(collection(db, 'profiles'), where('teamId', '==', teamId))),
    ]).then(([unavailSnap, profilesSnap]) => {
      setRecapAbsences(unavailSnap.docs.map(d => ({ id:d.id, ...d.data() })))
      setRecapWorkers(profilesSnap.docs.map(d => ({ id:d.id, ...d.data() })))
    }).catch(() => {})
  }, [teamId, showOverlay])

  const skipRecap = () => {
    if (recapWeek) localStorage.setItem(RECAP_SEEN_KEY, recapWeek.monday)
    setShowRecapBanner(false)
  }
  const openRecap = () => {
    if (recapWeek) localStorage.setItem(RECAP_SEEN_KEY, recapWeek.monday)
    setShowRecapBanner(false)
    setShowRecapModal(true)
  }
  const closeRecap = () => {
    setRecapClosing(true)
    setTimeout(() => { setShowRecapModal(false); setRecapClosing(false) }, 150)
  }

  useEffect(() => {
    if (!showRecapBanner) return
    const onKey = e => { if (e.key === 'Escape') skipRecap() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRecapBanner])

  useEffect(() => {
    if (!showRecapModal) return
    const onKey = e => { if (e.key === 'Escape') closeRecap() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRecapModal])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=46.4983&longitude=11.3548&current=weather_code,temperature_2m&timezone=Europe/Rome')
      .then(r => r.json())
      .then(d => {
        const w = { code: d.current.weather_code, temp: Math.round(d.current.temperature_2m) }
        // Stesso valore di prima (cache): niente nuovo render della pagina.
        setWeather(prev => (prev && prev.code === w.code && prev.temp === w.temp ? prev : w))
        localStorage.setItem('weatherCache', JSON.stringify(w))
      })
      .catch(() => {})
  }, [])

  const today        = new Date().toISOString().split('T')[0]
  const name         = profile?.name?.split(' ')[0] || profile?.username || 'Admin'
  const brokenItems  = items.filter(i => (i.brokenQty || 0) > 0)
  const totalBroken  = brokenItems.reduce((sum, i) => sum + (i.brokenQty || 0), 0)
  const reorderItems = items.filter(i => i.category === 'Consumabili' && i.minStock > 0 && (i.availableQty ?? i.totalQty) <= i.minStock)
  const openTasks    = tasks.filter(t => !t.done)
  // Un rent/install non ha bisogno di personale ogni giorno finché dura —
  // solo a inizio, fine, e alle fasi montaggio/smontaggio (che possono
  // cadere su date ancora diverse). Un evento normale invece resta
  // rilevante per TUTTA la sua durata, perché lì serve personale ogni
  // giorno. Senza questa distinzione un rent lungo settimane resterebbe
  // "in evidenza" ogni singolo giorno intermedio, senza nulla da fare.
  // dateEnd <= today (non solo ===): un rent scaduto e non ancora chiuso
  // (archived) deve restare visibile qui finché non lo si chiude — è
  // proprio il momento in cui serve notarlo di più, non quello in cui deve
  // sparire. Si ferma solo quando closeInstallationEvent lo archivia.
  // Un rent di un giorno solo lascia la casella "data fine" vuota (solo
  // "data inizio" compilata) — senza questo fallback a `e.date`, `e.dateEnd`
  // vuoto rendeva `e.dateEnd && ...` sempre falso e un rent di un giorno
  // scaduto non risultava MAI scaduto, qualunque sia la data.
  const effectiveEnd = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
  const rentNeedsAttention = e => {
    if (e.archived) return false
    const phases = e.phases || {}
    return e.date >= today || effectiveEnd(e) <= today || phases.montaggio === today || phases.smontaggio === today
  }
  // Scaduto per davvero (non solo "finisce oggi"): va trattato diverso da
  // un evento di oggi qualsiasi, con un colore proprio e in testa alla
  // lista, altrimenti si confonde con gli altri e non salta all'occhio che
  // c'è un rent da smontare/controllare rimasto indietro.
  const isOverdueRent = e => e.type === 'installation' && !e.archived && effectiveEnd(e) < today
  // "Oggi" per un rent/install: solo se oggi è il suo inizio, la sua fine o una
  // sua fase (o se è scaduto e non chiuso) — NON per tutta la durata né in
  // anticipo: un rent di sabato non è "di oggi" il lunedì prima.
  const rentIsToday = e => {
    const phases = e.phases || {}
    return e.date === today || effectiveEnd(e) === today || phases.montaggio === today || phases.smontaggio === today || isOverdueRent(e)
  }
  const isRelevantToday = e => e.type === 'installation'
    ? rentIsToday(e)
    : e.date <= today && (e.dateEnd || e.date) >= today
  // Un rent scaduto va in testa a prescindere dalla data (è il più urgente
  // da notare), poi tutto il resto in ordine cronologico come sempre.
  const upcomingAll = events
    .filter(e => e.type === 'installation' ? rentNeedsAttention(e) : (e.dateEnd || e.date) >= today)
    .sort((a, b) => {
      const overdueA = isOverdueRent(a), overdueB = isOverdueRent(b)
      if (overdueA !== overdueB) return overdueA ? -1 : 1
      return (a.date || '').localeCompare(b.date || '')
    })
  // Telefono: tre; computer: sei (c'è lo spazio).
  const upcoming = upcomingAll.slice(0, isMobile ? 3 : 6)

  const weekEvents = recapWeek
    ? events.filter(e => e.date && e.date <= recapWeek.sunday && (e.dateEnd || e.date) >= recapWeek.monday)
    : []
  const weekAbsences = recapWeek
    ? recapAbsences
        .filter(u => u.startDate <= recapWeek.sunday && u.endDate >= recapWeek.monday)
        .map(u => ({ ...u, workerName: recapWorkers.find(w => w.id === u.workerId)?.name || t('common.unknown') }))
    : []
  const recapSectionLabel = { fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }

  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' }, i18n.language)

  /* Tool cards config — icone monocromatiche, un solo colore per tutte le tile.
     La 4ª tile è dinamica: "Ore di lavoro" quando il modulo è attivo,
     altrimenti "Furgoni" al suo posto — così la griglia 2x2 resta sempre
     piena invece di lasciare un buco / ridursi a 3 tile. La gestione furgoni
     resta comunque anche in Impostazioni. */
  const tools = [
    {
      label: t('dashboard.tools.scanner'),
      icon:  <IconCamera />,
      path:  '/scanner',
      badge: null,
    },
    {
      label: t('dashboard.tools.tasks'),
      icon:  <IconCheck />,
      path:  '/tasks',
      badge: openTasks.length > 0 ? openTasks.length : null,
    },
    {
      label: t('dashboard.tools.templates'),
      icon:  <IconTemplate />,
      path:  '/templates',
      badge: null,
    },
    isModuleEnabled(team, 'workHours')
      ? { label: t('dashboard.tools.workHours'), icon: <IconClock />, path: '/work-hours', badge: null }
      : { label: t('dashboard.tools.vehicles'), icon: <IconTruck />, path: '/vehicles', badge: null },
  ]

  // Stessi dati di prima, solo raggruppati: "Oggi" = quelli rilevanti oggi
  // (compresi i rent scaduti, in testa), "Prossimi" = gli altri della stessa
  // lista di tre.
  const todayEvents = upcoming.filter(e => isRelevantToday(e) || isOverdueRent(e))
  const nextEvents = upcoming.filter(e => !(isRelevantToday(e) || isOverdueRent(e)))
  const sectionLabel = { fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', color:'var(--c-ink3)', margin:'0 0 12px 2px' }
  const attentionRow = { width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:12, background:'var(--c-surface)', border:'1px solid var(--c-line)', fontSize:13, fontWeight:600, color:'var(--c-ink)' }
  const attentionDot = { width:8, height:8, borderRadius:'50%', flexShrink:0 }

  const renderEventCard = ev => {
    const isToday = isRelevantToday(ev)
    const overdue = isOverdueRent(ev)
    const dateLabel = ev.date ? formatDate(ev.date+'T12:00:00', {weekday:'short',day:'numeric',month:'short'}, i18n.language) : ''
    const dateEndLabel = ev.dateEnd && ev.dateEnd !== ev.date ? ' — ' + formatDate(ev.dateEnd+'T12:00:00', {day:'numeric',month:'short'}, i18n.language) : ''
    // Avanzamento della lista di carico, come nella card di Eventi.
    const evItems = loadListsOn ? (ev.items || []) : []
    const nTot = evItems.length
    const nReturned = evItems.filter(i => i.returned).length
    const nLoaded = evItems.filter(i => i.loaded).length
    const nReady = evItems.filter(i => i.pronto).length
    const status = nTot === 0 ? null
      : nReturned > 0 ? { color:'var(--c-green)', text:t('events.statusReturnedCount', { returned:nReturned, total:nTot }) }
      : nLoaded > 0 ? { color:'var(--c-amber)', text:t('events.statusLoadedCount', { loaded:nLoaded, total:nTot }) }
      : nReady > 0 ? { color:'#2563eb', text:t('events.statusReadyCount', { prepared:nReady, total:nTot }) }
      : { color:'var(--c-ink3)', text:t('events.statusInList', { count:nTot }) }
    const tileBg = overdue ? '#ea580c' : isToday ? '#e63946' : 'var(--c-fill)'
    const tileFg = overdue || isToday ? '#fff' : 'var(--c-ink)'
    const tileSub = overdue || isToday ? 'rgba(255,255,255,0.85)' : 'var(--c-ink2)'
    return (
      <button type="button" key={ev.id} onClick={() => navigate(`/events/${ev.id}`)} aria-label={t('events.openEventAria', { name: ev.name })} className="btn-no-anim"
        style={{ width:'100%', marginBottom:12, background:'var(--c-surface)', border:`1px solid ${overdue ? 'rgba(234,88,12,0.45)' : 'var(--c-line)'}`, borderRadius:18, display:'flex', alignItems:'center', gap:14, padding:'15px 16px', textAlign:'left' }}>
        <div style={{ position:'relative', width:50, height:50, flexShrink:0 }}>
          <div style={{ width:50, height:50, borderRadius:13, background:tileBg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:tileFg, lineHeight:1.1 }}>
            <span style={{ fontSize:19, fontWeight:800 }}>{ev.date ? new Date(ev.date+'T12:00:00').getDate() : '?'}</span>
            <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:tileSub }}>{ev.date ? formatDate(ev.date+'T12:00:00', {month:'short'}, i18n.language) : ''}</span>
          </div>
          {ev.seriesId && (
            <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--c-surface)' }}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </span>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, minWidth:0 }}>
            <p style={{ fontWeight:800, fontSize:15, color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0, margin:0 }}>{ev.name}</p>
            {overdue && (
              <span style={{ flexShrink:0, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.4px', color:'#ea580c', background:'rgba(234,88,12,0.12)', borderRadius:6, padding:'2px 7px' }}>{t('dashboard.overdueRentBadge')}</span>
            )}
          </div>
          <p style={{ fontSize:12, fontWeight:500, color:'var(--c-ink2)', margin:0, textTransform:'capitalize' }}>{dateLabel}{dateEndLabel}</p>
          {status && <p style={{ fontSize:11.5, fontWeight:700, color:status.color, margin:'4px 0 0' }}>{status.text}</p>}
          {ev.location && <p style={{ fontSize:11.5, color:'var(--c-ink3)', margin:'4px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={11} /> {ev.location}</p>}
        </div>
        <span style={{ color:'var(--c-ink3)', display:'flex', flexShrink:0 }}><IconChevron /></span>
      </button>
    )
  }

  const IconBox = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 7.5L12 12.5l8.7-5"/><line x1="12" y1="22" x2="12" y2="12.5"/></svg>
  )
  const stats = [
    { label:t('dashboard.stats.items'), value:items.length, path:'/inventory', icon:<IconBox />, tint:'var(--c-t-blue)', fg:'#2563eb' },
    { label:t('dashboard.stats.events'), value:upcomingAll.length, path:'/events', icon:<IconCalendarEmpty />, tint:'var(--c-t-red)', fg:'#e63946' },
    { label:t('dashboard.stats.tasks'), value:openTasks.length, path:'/tasks', icon:<IconCheck />, tint:'var(--c-t-amber)', fg:'var(--c-amber)' },
    { label:t('dashboard.stats.broken'), value:totalBroken, path:'/inventory', state:{ filter:'broken' }, icon:<IconClipboard />, tint: totalBroken > 0 ? 'var(--c-t-red)' : 'var(--c-t-green)', fg: totalBroken > 0 ? '#e63946' : 'var(--c-green)' },
  ]

  const toolsBlock = isMobile ? (
    <div className="dash-tools-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, marginBottom:32 }}>
      {tools.map((tool) => (
        <button key={tool.path} className="dash-tool-tile btn-no-anim" onClick={() => navigate(tool.path)}
          style={{ position:'relative', background:'var(--c-fill)', border:'none', borderRadius:16, padding:'18px 4px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:9, color:'var(--c-ink)' }}>
          {tool.badge !== null && (
            <span style={{ position:'absolute', top:-6, right:-4, minWidth:20, height:20, padding:'0 6px', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--accent)', color:'#fff', borderRadius:10, fontSize:11, fontWeight:800 }}>{tool.badge}</span>
          )}
          <span style={{ display:'flex', transform:'scale(0.82)' }}>{tool.icon}</span>
          <span style={{ fontSize:11.5, fontWeight:700, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tool.label}</span>
        </button>
      ))}
    </div>
  ) : (
    <>
      <p style={sectionLabel}>{t('dashboard.toolsSection')}</p>
      <div className="dash-tools-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:12, marginBottom:28 }}>
        {tools.map((tool) => (
          <button key={tool.path} className="dash-tool-tile btn-no-anim" onClick={() => navigate(tool.path)}
            style={{ position:'relative', background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:18, padding:'18px 16px', display:'flex', alignItems:'center', gap:12, color:'var(--c-ink)', textAlign:'left' }}>
            <span style={{ width:42, height:42, borderRadius:13, background:'var(--c-fill)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{tool.icon}</span>
            <span style={{ fontSize:14, fontWeight:700 }}>{tool.label}</span>
            {tool.badge !== null && (
              <span style={{ marginLeft:'auto', minWidth:22, height:22, padding:'0 7px', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--accent)', color:'#fff', borderRadius:11, fontSize:12, fontWeight:800 }}>{tool.badge}</span>
            )}
          </button>
        ))}
      </div>
    </>
  )

  const attentionBlock = (brokenItems.length > 0 || reorderItems.length > 0) ? (
    <>
      <p style={sectionLabel}>{t('dashboard.attentionSection')}</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:32 }}>
        {brokenItems.length > 0 && (
          <button type="button" className="btn-no-anim" onClick={() => navigate('/inventory', { state: { filter: 'broken' } })} style={attentionRow}>
            <span style={{ ...attentionDot, background:'#e63946' }} />
            <span style={{ flex:1, textAlign:'left' }}>{t('dashboard.brokenAlert', { count: totalBroken })}</span>
            <span style={{ color:'var(--c-ink3)', display:'flex' }}><IconChevron /></span>
          </button>
        )}
        {reorderItems.length > 0 && (
          <button type="button" className="btn-no-anim" onClick={() => navigate('/inventory', { state:{ filter:'reorder' } })} style={attentionRow}>
            <span style={{ ...attentionDot, background:'#ea580c' }} />
            <span style={{ flex:1, textAlign:'left' }}>
              {reorderItems.length === 1
                ? t('dashboard.reorderSingle', { name: reorderItems[0].name })
                : t('dashboard.reorderMultiple', { count: reorderItems.length })}
            </span>
            <span style={{ color:'var(--c-ink3)', display:'flex' }}><IconChevron /></span>
          </button>
        )}
      </div>
    </>
  ) : null

  const upcomingBlock = upcoming.length === 0 ? (
    <>
      <p style={sectionLabel}>{t('dashboard.upcomingEvents')}</p>
      <button type="button" onClick={() => navigate('/events', { state: { openNewEvent: true } })} className="btn-no-anim"
        style={{ width:'100%', background:'var(--c-surface)', border:'1.5px dashed var(--c-dash)', borderRadius:16, padding:'26px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, textAlign:'center' }}>
        <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--c-fill)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--c-ink2)' }}>
          <IconCalendarEmpty />
        </div>
        <div>
          <p style={{ fontWeight:700, fontSize:15, color:'var(--c-ink)', marginBottom:4 }}>{t('dashboard.noUpcomingEventsTitle')}</p>
          <p style={{ fontSize:12.5, color:'var(--c-ink2)', maxWidth:260 }}>{t('dashboard.noUpcomingEventsDesc')}</p>
        </div>
        <span style={{ marginTop:4, display:'inline-flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:12, background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:13 }}>
          <IconPlusSm /> {t('dashboard.createFirstEvent')}
        </span>
      </button>
    </>
  ) : (
    <>
      {nextEvents.length > 0 && (
        <>
          <p style={sectionLabel}>{t('dashboard.upcomingEvents')}</p>
          <div>{nextEvents.map(renderEventCard)}</div>
        </>
      )}
      <button onClick={() => navigate('/events')} className="btn-no-anim"
        style={{ width:'100%', padding:'13px', borderRadius:14, background:'var(--c-fill)', border:'none', color:'var(--c-ink2)', fontWeight:700, fontSize:13, marginTop:10, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
        {t('dashboard.viewAllEvents')} <IconChevron />
      </button>
    </>
  )

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom: isMobile ? 150 : 110 }}>

      {/* ── Header: stesso stile delle altre pagine (bianco, filo sottile).
          Saluto, nome, data e meteo a sinistra; l'avatar a destra apre il
          profilo (da lì anche l'uscita). Niente più scena animata. ── */}
      <div className="page-header rc-page-header" style={{ position:'relative', overflow:'hidden', ...(isMobile ? { padding:'calc(env(safe-area-inset-top) + 36px) 22px 24px' } : {}) }}>
        <SkyArc weather={weather} isMobile={isMobile} />
        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:12.5, color:'var(--c-ink3)', fontWeight:600, margin:0 }}>{t(greetingKey())}</p>
            <h1 style={{ fontSize:isMobile ? 28 : 26, margin:'4px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</h1>
            <p style={{ fontSize:12.5, color:'var(--c-ink3)', fontWeight:500, margin:'6px 0 0', textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}{weather ? ` · ${weather.temp}°C` : ''}</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            {profile?.superAdmin && (
              <button onClick={() => navigate('/super')} aria-label={t('dashboard.superAdminAria')} className="rc-pill-btn" style={{ width:38, height:38, padding:0 }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                  <line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="9" y1="15" x2="9" y2="15.01"/>
                </svg>
              </button>
            )}
            <button onClick={() => setShowProfile(true)} aria-label={t('dashboard.openSettings')} className="btn-no-anim"
              style={{ position:'relative', width:46, height:46, borderRadius:'50%', background:'var(--c-surface)', color:'var(--c-ink)', border:'1px solid var(--c-line)', fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {name.charAt(0).toUpperCase()}
              {hasUnseenWhatsNew() && <span aria-hidden="true" style={{ position:'absolute', top:-2, right:-2, width:13, height:13, borderRadius:'50%', background:'#e63946', border:'2px solid var(--c-surface)' }} />}
            </button>
          </div>
        </div>
      </div>

      <div style={isMobile ? { padding:'26px 18px 0' } : { padding:'24px 32px 0' }}>

        {/* Promemoria piano Pro (solo admin non abbonati) — subito sotto l'header. */}
        <ProUpsell />

        {/* Computer: quattro numeri in alto, ognuno apre la pagina relativa. */}
        {!isMobile && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:14, marginBottom:28 }}>
            {stats.map(st => (
              <button key={st.label} type="button" className="btn-no-anim dash-stat" onClick={() => navigate(st.path, st.state ? { state: st.state } : undefined)}
                style={{ background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:18, padding:'18px 20px', display:'flex', alignItems:'center', gap:14, textAlign:'left' }}>
                <span style={{ width:46, height:46, borderRadius:14, background:st.tint, color:st.fg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{st.icon}</span>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:'block', fontSize:28, fontWeight:800, letterSpacing:'-0.6px', lineHeight:1, color:'var(--c-ink)', fontVariantNumeric:'tabular-nums' }}>{st.value}</span>
                  <span style={{ display:'block', fontSize:12.5, fontWeight:600, color:'var(--c-ink2)', marginTop:5 }}>{st.label}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={isMobile ? { display:'flex', flexDirection:'column' } : { display:'grid', gridTemplateColumns:'minmax(0, 1.8fr) minmax(340px, 1fr)', gap:36, alignItems:'start' }}>

          {/* Colonna principale (computer) — su telefono tutto in fila */}
          <div style={{ order: isMobile ? 2 : 1, minWidth:0 }}>
            {todayEvents.length > 0 && (
              <>
                <p style={sectionLabel}>{t('dashboard.todaySection')}</p>
                <div style={{ marginBottom:32 }}>{todayEvents.map(renderEventCard)}</div>
              </>
            )}
            {isMobile && attentionBlock}
            {upcomingBlock}
          </div>

          {/* Colonna laterale (computer): strumenti e avvisi. Su telefono gli
              strumenti stanno SOPRA a tutto (fila compatta, posizione stabile
              prima dei dati asincroni), gli avvisi dopo "Oggi". */}
          <div style={{ order: isMobile ? 1 : 2, minWidth:0 }}>
            {toolsBlock}
            {!isMobile && attentionBlock}
          </div>
        </div>
      </div>

      <style>{`
        .dash-tool-tile { transition: background-color 0.15s ease; }
        .dash-tool-tile:active { background: var(--c-fill-hover) !important; }
        .dash-stat, .dash-tool-tile { transition: border-color 0.15s ease, background-color 0.15s ease; }
        @media (hover: hover) { .dash-stat:hover { border-color: var(--c-dash) !important; } }
      `}</style>

      {showProfile && <Profile onClose={() => setShowProfile(false)} showLogout />}

      {!showOverlay && !showRecapBanner && !showRecapModal && <TutorialModal role="admin" />}

      {/* Non insieme al resoconto settimanale (si sovrapporrebbero il lunedì
          mattina) — quello prevale, questo arriva al prossimo giro. */}
      {!showOverlay && !showRecapBanner && !showRecapModal && (
        <>
          <TodayReminderModal events={events} today={today} navigate={navigate} />
          <DeadlineReminderModal vehicles={vehicles} items={items} today={today} />
          <RentalEndedReminderModal events={events} today={today} navigate={navigate} />
        </>
      )}

      <GettingStartedWidget teamId={teamId} items={items} events={events} dataReady={itemsLoaded && eventsLoaded} />

      {/* Popup avviso resoconto pronto — stesso stile del popup di conferma (logout ecc.) */}
      {showRecapBanner && (
        <div
          onClick={skipRecap}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation:'recapFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background:'var(--c-surface)', borderRadius:24, padding:'26px 22px 20px', width:'100%', maxWidth:330, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation:'recapPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,132,199,0.12)', color:'#0284c7' }}>
              <IconClipboard />
            </div>
            <h3 style={{ fontSize:18, fontWeight:800, color:'var(--c-ink)', margin:'0 0 6px', letterSpacing:'-0.3px' }}>{t('dashboard.weeklyRecapTitle')}</h3>
            <p style={{ fontSize:14, color:'var(--c-ink2)', margin:0, lineHeight:1.45 }}>{t('dashboard.weeklyRecapPrompt')}</p>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={skipRecap} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'var(--c-fill)', color:'var(--c-ink2)', border:'none', cursor:'pointer' }}>
                {t('dashboard.weeklyRecapSkip')}
              </button>
              <button onClick={openRecap} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#0284c7', color:'#fff', border:'none', cursor:'pointer' }}>
                {t('dashboard.weeklyRecapRead')}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes recapFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes recapPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
          `}</style>
        </div>
      )}

      {/* Popup resoconto settimanale — stesso stile del popup di conferma (logout ecc.) */}
      {showRecapModal && (
        <div
          onClick={closeRecap}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: recapClosing ? 'recapFadeOut 0.15s ease forwards' : 'recapFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background:'var(--c-surface)', borderRadius:24, padding:'26px 22px 22px', width:'100%', maxWidth:380, maxHeight:'82dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: recapClosing ? 'recapPopOut 0.15s ease forwards' : 'recapPopIn 0.24s cubic-bezier(0.32,0.72,0,1)', position:'relative' }}
          >
            <button onClick={closeRecap} aria-label={t('common.close')} style={{ position:'absolute', top:16, right:16, width:28, height:28, borderRadius:'50%', background:'var(--c-fill)', color:'var(--c-ink2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✕</button>

            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(2,132,199,0.12)', color:'#0284c7' }}>
              <IconClipboard />
            </div>
            <h3 style={{ fontSize:18, fontWeight:800, color:'var(--c-ink)', margin:'0 0 4px', letterSpacing:'-0.3px', textAlign:'center' }}>{t('dashboard.weeklyRecapTitle')}</h3>
            {recapWeek && (
              <p style={{ color:'var(--c-ink2)', fontSize:13, textAlign:'center', margin:'0 0 20px' }}>
                {formatDate(recapWeek.monday+'T12:00:00', { day:'numeric', month:'long' }, i18n.language)}
                {' — '}
                {formatDate(recapWeek.sunday+'T12:00:00', { day:'numeric', month:'long' }, i18n.language)}
              </p>
            )}

            <div style={{ textAlign:'left', marginBottom:18 }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapEvents', { count: weekEvents.length })}</p>
              {weekEvents.length === 0 ? (
                <p style={{ color:'var(--c-ink2)', fontSize:13 }}>{t('dashboard.weeklyRecapNoEvents')}</p>
              ) : (
                weekEvents.map(ev => (
                  <button type="button" key={ev.id} className="btn-no-anim" onClick={() => { setShowRecapModal(false); navigate(`/events/${ev.id}`) }}
                    aria-label={t('events.openEventAria', { name: ev.name })}
                    style={{ width:'100%', background:'transparent', border:'none', font:'inherit', color:'inherit', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid var(--c-line)', cursor:'pointer', textAlign:'left' }}>
                    <span style={{ fontSize:13.5, fontWeight:600, color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</span>
                    <span style={{ fontSize:12, color:'var(--c-ink2)', flexShrink:0 }}>{formatDate(ev.date+'T12:00:00', { weekday:'short', day:'numeric' }, i18n.language)}</span>
                  </button>
                ))
              )}
            </div>

            <div style={{ textAlign:'left', marginBottom:18 }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapAbsences')}</p>
              {weekAbsences.length === 0 ? (
                <p style={{ color:'var(--c-ink2)', fontSize:13 }}>{t('dashboard.weeklyRecapNoAbsences')}</p>
              ) : (
                weekAbsences.map(u => (
                  <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderTop:'1px solid var(--c-line)' }}>
                    <span style={{ fontSize:13.5, fontWeight:600, color:'var(--c-ink)' }}>{u.workerName}</span>
                    <span style={{ fontSize:12, color:'var(--c-ink2)', flexShrink:0 }}>
                      {formatDate(u.startDate+'T12:00:00', { day:'numeric', month:'short' }, i18n.language)}
                      {u.endDate !== u.startDate ? ' — ' + formatDate(u.endDate+'T12:00:00', { day:'numeric', month:'short' }, i18n.language) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ textAlign:'left' }}>
              <p style={recapSectionLabel}>{t('dashboard.weeklyRecapTasks', { count: openTasks.length })}</p>
              {openTasks.length === 0 ? (
                <p style={{ color:'var(--c-ink2)', fontSize:13 }}>{t('dashboard.weeklyRecapNoTasks')}</p>
              ) : (
                <>
                  {openTasks.slice(0, 5).map(task => (
                    <button type="button" key={task.id} className="btn-no-anim" onClick={() => { setShowRecapModal(false); navigate('/tasks') }}
                      aria-label={t('dashboard.openTaskAria', { title: task.title })}
                      style={{ width:'100%', background:'transparent', border:'none', font:'inherit', color:'inherit', display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderTop:'1px solid var(--c-line)', cursor:'pointer', textAlign:'left' }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: RECAP_TASK_DOT[task.priority] || RECAP_TASK_DOT.media }} />
                      <span style={{ fontSize:13.5, fontWeight:600, color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</span>
                    </button>
                  ))}
                  {openTasks.length > 5 && (
                    <button type="button" className="btn-no-anim" onClick={() => { setShowRecapModal(false); navigate('/tasks') }}
                      style={{ background:'transparent', border:'none', font:'inherit', fontSize:12, fontWeight:700, color:'#0284c7', marginTop:8, cursor:'pointer', textAlign:'left' }}>
                      {t('common.moreCount', { count: openTasks.length - 5 })}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <style>{`
            @keyframes recapFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes recapFadeOut { from{opacity:1} to{opacity:0} }
            @keyframes recapPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
            @keyframes recapPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
          `}</style>
        </div>
      )}
    </div>
  )
}
