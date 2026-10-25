import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore'
import DateBadge from '../components/DateBadge'
import SkyArc from '../components/SkyArc'
import { useIsMobile } from '../hooks/useIsMobile'
import TutorialModal from '../components/TutorialModal'
import { Unload, Recurring, Pin, Box, ChevronRight, Plus, User } from '../components/Icon'
import { formatDate, capitalize } from '../utils/formatDate'
import { isModuleEnabled } from '../utils/modules'
import DailyQuip from '../components/DailyQuip'
import Profile from './Profile'
import { hasUnseenWhatsNew } from '../utils/whatsNew'
import TodayReminderModal from '../components/TodayReminderModal'
import ActivityCard from '../components/ActivityCard'
import { groupActivities, activitiesForDay, setActivityDone, isAssignedTo } from '../utils/activities'

const EVENT_CAP = 5

const greetingKey = () => {
  const h = new Date().getHours()
  if (h < 5)  return 'workerHome.greeting_night'
  if (h < 12) return 'workerHome.greeting_morning'
  if (h < 18) return 'workerHome.greeting_afternoon'
  return 'workerHome.greeting_evening'
}

export default function WorkerHome() {
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()
  const { user, profile, logout, team, teamId, showOverlay } = useAuth()
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const [showProfile, setShowProfile] = useState(false)
  const [events, setEvents] = useState([])
  const [teamBlocks, setTeamBlocks] = useState([]) // tutte le assegnazioni di "Assegna personale" (le attività libere sono quelle senza evento)
  const [people, setPeople] = useState({})         // uid → nome, per dire a chi è assegnata un'attività
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(EVENT_CAP)
  const [openSections, setOpenSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('workerhome_sections')
      return saved ? JSON.parse(saved) : { recurring: true, upcoming: true, installations: false }
    } catch { return { recurring: true, upcoming: true, installations: false } }
  })
  const toggle = section => setOpenSections(s => {
    const next = { ...s, [section]: !s[section] }
    try { sessionStorage.setItem('workerhome_sections', JSON.stringify(next)) } catch {}
    return next
  })
  const [weather, setWeather] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weatherCache')) } catch { return null }
  })
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    // isDeadlineReminder: promemoria scadenze auto-generati (vedi utils/deadlines.js)
    // — compaiono solo in Calendario, mai tra gli eventi del magazziniere.
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => !e.isDeadlineReminder))
    })
  }, [teamId])

  useEffect(() => {
    if (!teamId || !user?.uid) return
    return onSnapshot(
      query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId)),
      snap => setTeamBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [teamId, user?.uid])

  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'profiles'), where('teamId', '==', teamId)), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data().name || d.data().username || '' })
      setPeople(map)
    })
  }, [teamId])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=46.4983&longitude=11.3548&current=weather_code,temperature_2m&timezone=Europe/Rome')
      .then(r => r.json())
      .then(d => {
        const w = { code: d.current.weather_code, temp: Math.round(d.current.temperature_2m) }
        setWeather(w)
        localStorage.setItem('weatherCache', JSON.stringify(w))
      })
      .catch(() => {})
  }, [])

  const name = profile?.name?.split(' ')[0] || profile?.username || ''

  // Logica visibilità eventi per worker:
  // 1. "Da scaricare": data di FINE passata, qualcosa ancora caricato e non rientrato
  // 2. "Oggi": data di inizio = oggi
  // 3. "Prossimi": data di fine futura o oggi
  const effectiveEndDate = e => e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date

  const daScaricare = events.filter(e => {
    if (e.seriesId) return false  // gli eventi ricorrenti sono gestiti nella sezione "Ricorrenti"
    if (e.type === 'installation') {
      // Un rent/install resta caricato/non rientrato DI PROPOSITO finché è
      // ancora attivo, anche a lungo — ma una volta SCADUTO (fine contratto
      // prevista passata) è la stessa identica urgenza di un evento
      // dimenticato: va scaricato/richiuso, quindi qui ci entra a pieno
      // titolo invece di restare invisibile nella sua sezione collassata.
      return !e.archived && e.dateEnd && e.dateEnd < today
    }
    if (effectiveEndDate(e) >= today) return false
    const items = e.items || []
    return items.length > 0 && items.some(i => i.loaded && !i.returned)
  }).sort((a, b) => (a.type === 'installation') === (b.type === 'installation') ? 0 : a.type === 'installation' ? -1 : 1)

  const isActive = e => {
    if (effectiveEndDate(e) >= today) return true
    const items = e.items || []
    return items.length > 0 && items.some(i => i.loaded && !i.returned)
  }

  // Ricorrenti (solo il prossimo per serie)
  const recurringMap = {}
  events.forEach(ev => {
    if (ev.seriesId) {
      if (!recurringMap[ev.seriesId]) recurringMap[ev.seriesId] = []
      recurringMap[ev.seriesId].push(ev)
    }
  })
  const pinnedRecurring = Object.values(recurringMap).flatMap(series => {
    const sorted = [...series].sort((a,b) => a.date.localeCompare(b.date))
    const nextFuture = sorted.find(e => effectiveEndDate(e) >= today)
    // Tutte le occorrenze passate con articoli ancora non rientrati — mai nascoste
    // solo perché esiste già una prossima occorrenza futura da mostrare
    const pastUnfinished = sorted.filter(e => {
      if (effectiveEndDate(e) >= today) return false
      const items = e.items || []
      return items.length > 0 && items.some(i => i.loaded && !i.returned)
    })
    const result = [...pastUnfinished]
    if (nextFuture) result.push(nextFuture)
    else if (result.length === 0) result.push(sorted[sorted.length - 1])
    return result
  })

  // Un evento di OGGI il cui carico è già rientrato per intero (prova che
  // sia stato davvero eseguito, non solo "niente ancora caricato") sparisce
  // subito da qui, senza aspettare la mezzanotte — vedi anche Archive.jsx.
  const isWrappedToday = e => {
    if (effectiveEndDate(e) !== today) return false
    const items = e.items || []
    return items.some(i => i.returned) && !items.some(i => i.loaded && !i.returned)
  }

  // Sezione "Oggi": gli eventi di oggi (anche quelli cominciati prima e
  // ancora in corso; un rent solo se parte oggi) e le fasi di
  // montaggio/smontaggio con data di OGGI — queste anche se l'evento vero è
  // la settimana dopo (o già passato): è proprio quel giorno che la lista di
  // carico va preparata/caricata per andare a montare. Chi è già in "Da
  // scaricare" ha la sua sezione (lì basta il badge della fase). Quello che
  // entra qui non si ripete nelle altre sezioni.
  const daScaricareIds = new Set(daScaricare.map(e => e.id))
  const happeningToday = e => (e.type !== 'installation' && e.date <= today && effectiveEndDate(e) >= today && !isWrappedToday(e))
    || (e.type === 'installation' && e.date === today)
  const todayList = events.filter(e => !e.archived && !daScaricareIds.has(e.id) && (happeningToday(e) || phaseKeysToday(e, today).length > 0))
    .sort((a, b) => (happeningToday(b) ? 1 : 0) - (happeningToday(a) ? 1 : 0))
  const todayIds = new Set(todayList.map(e => e.id))
  // Le MIE attività libere di oggi (senza evento): con orario e nota, e — se
  // l'admin ci ha collegato una lista di carico — un tocco porta a quella
  // lista. Un'attività a cavallo di mezzanotte compare anche il giorno dopo.
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  // Le attività di oggi di TUTTA la squadra, con a chi sono assegnate: chi è assegnato può completarla.
  const todayTasks = activitiesForDay(groupActivities(teamBlocks, uid => people[uid]), today, yesterday)
    .sort((a, b) => (a.done - b.done) || (Number(isAssignedTo(b, user?.uid)) - Number(isAssignedTo(a, user?.uid))))
  const toggleActivity = async (act, done) => {
    try { await setActivityDone(act, done, { uid: user.uid, name: profile?.name || profile?.username || '' }) } catch { /* senza rete riprova al prossimo tocco */ }
  }
  const recurringShown = pinnedRecurring.filter(e => !todayIds.has(e.id))

  // Rent/Install (ex "installazioni") vanno in una sezione propria — restano
  // aperte anche a lungo, non hanno senso mescolate agli eventi "normali"
  // nei Prossimi, stessa separazione già usata in Events.jsx (lato admin).
  // Promosso in cima se comincia oggi — stessa idea di Events.jsx lato
  // admin: un rent può avere data di inizio molto lontana e restare comunque
  // attivo, quindi il semplice ordine per data non basta a farlo notare.
  const installations = events
    // Uno scaduto è già in "Da scaricare" sopra — non va ripetuto anche qui.
    .filter(e => e.type === 'installation' && !e.archived && !(e.dateEnd && e.dateEnd < today) && !todayIds.has(e.id))
    .sort((a, b) => (a.date === today) === (b.date === today) ? 0 : a.date === today ? -1 : 1)
  const singleEvents = events.filter(e => !e.seriesId && e.type !== 'installation')
  const upcomingSingle = singleEvents.filter(e => effectiveEndDate(e) >= today && !isWrappedToday(e) && !todayIds.has(e.id))
  const visibleSingle = upcomingSingle.slice(0, visibleCount)
  const hiddenCount = upcomingSingle.length - visibleSingle.length

  const searchResults = search.trim()
    ? events.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  const displayName = name || profile?.username || t('workerHome.defaultName')
  const initial = displayName.charAt(0).toUpperCase()
  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' }, i18n.language)

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom: isMobile ? 150 : 110 }}>
      {/* Header: stesso stile della Dashboard admin — bianco, saluto/nome/data/
          meteo a sinistra, avatar (con pallino se ci sono Novità) a destra che
          apre il profilo, da cui si esce. */}
      <div className="page-header rc-page-header" style={{ position:'relative', overflow:'hidden', ...(isMobile ? { padding:'calc(env(safe-area-inset-top) + 36px) 22px 24px' } : {}) }}>
        <SkyArc weather={weather} isMobile={isMobile} />
        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:12.5, color:'#9a9a9a', fontWeight:600, margin:0 }}>{t(greetingKey())},</p>
            <h1 style={{ fontSize: isMobile ? 28 : 26, margin:'4px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</h1>
            <p style={{ fontSize:12.5, color:'#9a9a9a', fontWeight:500, margin:'6px 0 0', textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{todayLabel}{weather ? ` · ${weather.temp}°C` : ''}</p>
          </div>
          <button onClick={() => setShowProfile(true)} aria-label={t('workerHome.openSettings')} className="btn-no-anim"
            style={{ position:'relative', flexShrink:0, width:46, height:46, borderRadius:'50%', background:'var(--c-surface)', color:'var(--c-ink)', border:'1px solid var(--c-line)', fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {initial}
            {hasUnseenWhatsNew() && <span aria-hidden="true" style={{ position:'absolute', top:-2, right:-2, width:13, height:13, borderRadius:'50%', background:'#e63946', border:'2px solid var(--c-surface)' }} />}
          </button>
        </div>
      </div>

      {/* Ricerca — stesso stile grigio di Eventi e Magazzino */}
      <div className="search-bar rc-inv-search" style={{ marginTop:14 }}>
        <div>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('events.searchPlaceholder')} aria-label={t('events.searchPlaceholder')} />
        </div>
      </div>

      <div style={{ padding:'18px 0 16px' }}>
        {search.trim() ? (
          <>
            <p style={{ padding:'0 16px 12px', color:'var(--text2)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>{t('events.resultsCount', { count: searchResults.length })}</p>
            {searchResults.length === 0
              ? <p style={{ padding:'20px 16px', color:'var(--text2)', textAlign:'center' }}>{t('events.noResultsFor', { search })}</p>
              : searchResults.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)
            }
          </>
        ) : (
        <>
        {/* DA SCARICARE — in evidenza, solo se il modulo liste di carico è attivo */}
        {loadListsOn && daScaricare.length > 0 && (
          <div id="sec-dascaricare" style={{ margin:'0 0 24px', scrollMarginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 20px 12px' }}>
              <p style={{ color:'#ea580c', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', display:'inline-flex', alignItems:'center', gap:6, margin:0 }}><Unload size={14} /> {t('workerHome.toUnload')}</p>
            </div>
            {daScaricare.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} forceState="daScaricare" loadListsOn={loadListsOn} />)}
          </div>
        )}

        {/* OGGI — eventi di oggi e montaggi/smontaggi di oggi (anche di
            eventi in un altro giorno): stessa evidenza rossa. */}
        {(todayList.length > 0 || todayTasks.length > 0) && (
          <div id="sec-today" style={{ margin:'0 0 24px', scrollMarginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 20px 12px' }}>
              <p style={{ color:'#9a9a9a', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', margin:0 }}>{t('workerHome.todoToday')}</p>
            </div>
            {todayTasks.map(act => <ActivityCard key={`${act.id}-${act.cont ? 'c' : 'o'}`} act={act} meId={user?.uid} onToggle={toggleActivity}
              linkedEventName={act.linkedEventId ? events.find(e => e.id === act.linkedEventId)?.name : ''}
              onOpenList={a => navigate(`/events/${a.linkedEventId}${a.linkedListId ? `?list=${a.linkedListId}` : ''}`)} />)}
            {todayList.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} forceState={happeningToday(ev) ? 'today' : 'phaseToday'} loadListsOn={loadListsOn} />)}
          </div>
        )}

        {/* "Niente da mostrare" va giudicato sulle sezioni che contano
            davvero (da scaricare/ricorrenti/prossimi/rent-install), non su
            events.length: una squadra con solo eventi passati o archiviati
            in events.length avrebbe superato questo controllo restando
            comunque a schermo vuoto, senza nessun placeholder — pagina
            "morta" senza motivo (stesso bug già corretto in Events.jsx). */}
        {(!loadListsOn || daScaricare.length === 0) && todayList.length === 0 && todayTasks.length === 0 && recurringShown.length === 0 && upcomingSingle.length === 0 && installations.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><Box size={46} /></p>
            <h3>{t('workerHome.emptyTitle')}</h3>
            <p>{t('workerHome.emptyDesc')}</p>
            <DailyQuip quips={t('workerHome.emptyQuips', { returnObjects:true })} />
          </div>
        ) : (
          <>
            {/* Ricorrenti — collassabile, come in Events.jsx */}
            {recurringShown.length > 0 && (
              <div id="sec-ricorrenti" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('recurring')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 20px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--blue)', display:'flex', transition:'transform 0.2s', transform: openSections.recurring ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'var(--blue)', fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', display:'inline-flex', alignItems:'center', gap:6 }}><Recurring size={13} /> {t('workerHome.recurring')}</span>
                  <span style={{ background:'rgba(79,195,247,0.15)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--blue)' }}>{recurringShown.length}</span>
                </button>
                {openSections.recurring && recurringShown.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
              </div>
            )}

            {/* Prossimi singoli — collassabile */}
            {upcomingSingle.length > 0 && (
              <div id="sec-prossimi" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('upcoming')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 20px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'var(--text2)', display:'flex', transition:'transform 0.2s', transform: openSections.upcoming ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'var(--text2)', fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('workerHome.upcoming')}</span>
                  <span style={{ background:'var(--card2)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'var(--text2)' }}>{upcomingSingle.length}</span>
                </button>
                {openSections.upcoming && (
                  <>
                    {visibleSingle.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
                    {hiddenCount > 0 && (
                      <div style={{ padding:'4px 16px 8px' }}>
                        <button onClick={() => setVisibleCount(c => c + EVENT_CAP)}
                          style={{ width:'100%', padding:'12px', borderRadius:14, background:'var(--card2)', border:'1.5px solid var(--border)', color:'var(--text2)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <Plus size={15} /> {t('events.moreEvents', { count: hiddenCount })}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* RENT/INSTALL — sezione a parte, stessa separazione già usata
                in Events.jsx lato admin: restano caricate/non rientrate a
                lungo apposta, non hanno senso mescolate ai Prossimi. */}
            {installations.length > 0 && (
              <div id="sec-installations" style={{ marginBottom:4, scrollMarginTop:16 }}>
                <button onClick={() => toggle('installations')} className="btn-section"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'4px 20px 12px', background:'transparent', border:'none', outline:'none' }}>
                  <span style={{ color:'#5b4fcf', display:'flex', transition:'transform 0.2s', transform: openSections.installations ? 'rotate(90deg)' : 'rotate(0deg)' }}><ChevronRight size={16} /></span>
                  <span className="section-label" style={{ color:'#5b4fcf', fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px' }}>{t('events.installations')}</span>
                  <span style={{ background:'var(--c-violet-bg)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700, color:'#5b4fcf' }}>{installations.length}</span>
                </button>
                {openSections.installations && installations.map(ev => <EventCard key={ev.id} ev={ev} today={today} navigate={navigate} uid={user?.uid} loadListsOn={loadListsOn} />)}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      {showProfile && <Profile onClose={() => setShowProfile(false)} showLogout />}

      {!showOverlay && <TutorialModal role="worker" />}

      {!showOverlay && <TodayReminderModal events={events} today={today} navigate={navigate} />}
    </div>
  )
}

// Chiavi delle fasi (montaggio/smontaggio) di un evento che cadono oggi.
function phaseKeysToday(ev, today) {
  return Object.entries(ev.phases || {}).filter(([k, d]) => d === today && (k === 'montaggio' || k === 'smontaggio')).map(([k]) => k)
}
const PHASE_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }

// Una mia attività di oggi (assegnata da "Assegna personale", senza evento):
// stessa forma delle card evento, con l'orario, la mia nota e — se collegata —
// la lista di carico da aprire (anche di un evento di un altro giorno).
function EventCard({ ev, today, navigate, uid, forceState, loadListsOn }) {
  const { t, i18n } = useTranslation()
  const phasesToday = phaseKeysToday(ev, today)
  const isPhaseToday = forceState === 'phaseToday'
  const items    = ev.items || []
  const loaded   = loadListsOn ? items.filter(i => i.loaded).length : 0
  const returned = loadListsOn ? items.filter(i => i.returned).length : 0
  const total    = loadListsOn ? items.length : 0
  const isToday  = ev.date === today || isPhaseToday || forceState === 'today'
  const daScaricare = loadListsOn && forceState === 'daScaricare'
  // Nella sezione "Da fare oggi" l'icona mostra OGGI (il giorno in cui c'è
  // da fare qualcosa), non la data dell'evento — quella sta nel sottotitolo.
  const iconDate = isPhaseToday ? today : ev.date
  // Assegnato personalmente (assignedWorkers) — dimensione indipendente
  // dalla fase/urgenza sopra: un bordo/badge a parte invece di toccare
  // iconGradient, che già comunica a colpo d'occhio lo stato del carico.
  const isMine = !!uid && (ev.assignedWorkers || []).includes(uid)

  let phase = 'prep'
  if (total > 0 && returned === total)  phase = 'done'
  else if (total > 0 && loaded === total) phase = 'out'
  else if (total > 0 && loaded > 0)     phase = 'partial'
  else if (total > 0)                   phase = 'ready'

  const phaseInfo = {
    prep:    { color:'var(--text2)',   label: t('workerHome.phasePrep') },
    ready:   { color:'var(--blue)',    label: t('workerHome.phaseReady', { count: total }) },
    partial: { color:'var(--accent2)', label: t('workerHome.phasePartial', { loaded, total }) },
    out:     { color:'#ea580c',        label: t('workerHome.phaseOut', { returned, total }) },
    done:    { color:'var(--green)',   label: t('workerHome.phaseDone') },
  }[phase]

  // Un rent/install che comincia oggi va preparato/caricato oggi come
  // qualunque evento — deve poter spiccare col rosso "urgente" anche lì
  // dentro, non restare per sempre violetto uguale a tutti gli altri nella
  // sezione Rent/Install (dove altrimenti si perde facilmente di vista).
  // Card di sola fase (montaggio/smontaggio di oggi, evento in un altro
  // giorno): data blu/arancione come i colori delle fasi, per distinguerla da
  // un evento vero di oggi (rosso).
  const phaseColor = isPhaseToday ? PHASE_COLORS[phasesToday[0]] : null
  const iconGradient = daScaricare
    ? '#ea580c'
    : phaseColor
    ? phaseColor
    : isToday
    ? (ev.type === 'installation' ? 'linear-gradient(135deg, #e63946 0%, #7c6fea 100%)' : '#e63946')
    : ev.type === 'installation'
    ? '#7c6fea'
    : (phase === 'partial' || phase === 'out')
    ? '#e63946'
    : 'var(--c-fill)'
  // Tessera chiara (grigia) = niente di urgente: testo scuro invece che bianco.
  const tileLight = iconGradient === 'var(--c-fill)'

  const cardBorder = daScaricare ? 'rgba(234,88,12,0.45)' : phaseColor ? `${phaseColor}66` : isToday && ev.type === 'installation' ? 'rgba(124,111,234,0.45)' : isToday ? 'rgba(230,57,70,0.4)' : isMine ? 'rgba(230,57,70,0.4)' : 'var(--c-line)'
  const dateStr = ev.date ? formatDate(ev.date+'T12:00:00', {day:'numeric',month:'short'}, i18n.language) : ''

  return (
    <div onClick={() => navigate(`/events/${ev.id}`)}
      style={{ margin:'0 18px 12px', background:'var(--c-surface)', border:`1px solid ${cardBorder}`, borderRadius:18, display:'flex', alignItems:'center', padding:'15px 16px', gap:14, cursor:'pointer' }}
    >
      {/* Icona gradiente con data */}
      <div style={{ position:'relative', width:50, height:50, flexShrink:0 }}>
        <div style={{ width:50, height:50, borderRadius:13, background:iconGradient, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color: tileLight ? 'var(--c-ink)' : '#fff', lineHeight:1.1 }}>
          <span style={{ fontSize:19, fontWeight:800 }}>{iconDate ? new Date(iconDate+'T12:00:00').getDate() : '?'}</span>
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.85 }}>
            {iconDate ? formatDate(iconDate+'T12:00:00', {month:'short'}, i18n.language) : ''}
          </span>
        </div>
        {ev.seriesId && (
          <span style={{ position:'absolute', bottom:-5, right:-5, background:'#2563eb', borderRadius:7, width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid var(--c-surface)' }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </span>
        )}
      </div>

      {/* Contenuto */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <p style={{ fontWeight:800, fontSize:15, color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0, margin:0 }}>
            {ev.name}
          </p>
        </div>
        {phasesToday.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:4 }}>
            {phasesToday.map(k => {
              const pt = ev.phaseTimes?.[k]
              const color = PHASE_COLORS[k]
              return (
                <span key={k} style={{ display:'inline-flex', alignItems:'center', gap:5, background:`${color}18`, color, border:`1px solid ${color}44`, borderRadius:8, padding:'2px 8px', fontSize:11, fontWeight:800 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />
                  {t('workerHome.phaseTodayBadge', { phase: t(k === 'montaggio' ? 'calendar.legendAssembly' : 'calendar.legendDisassembly') })}
                  {pt?.timeStart && pt?.timeEnd && <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>· {pt.timeStart}–{pt.timeEnd}</span>}
                </span>
              )
            })}
          </div>
        )}
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
          {isPhaseToday && <span style={{ fontWeight:700 }}>{t('workerHome.eventOn')} </span>}
          {ev.date ? formatDate(ev.date+'T12:00:00', {weekday:'long', day:'numeric', month:'long'}, i18n.language) : ''}
          {ev.dateEnd && ev.dateEnd !== ev.date ? ' — ' + formatDate(ev.dateEnd+'T12:00:00', {day:'numeric', month:'long'}, i18n.language) : ''}
        </p>
        {loadListsOn && total > 0 && <p style={{ fontSize:11.5, fontWeight:700, color:phaseInfo.color, marginTop:4 }}>{phaseInfo.label}</p>}
        {ev.location && <p style={{ fontSize:11.5, color:'var(--c-ink3)', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}><Pin size={12} /> {ev.location}</p>}
        {isMine && <p style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginTop:3, display:'flex', alignItems:'center', gap:4 }}><User size={12} /> {t('workerCalendar.assignedToYouInline')}</p>}
      </div>
    </div>
  )
}
