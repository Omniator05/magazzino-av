import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { collection, query, orderBy, limit, startAfter, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import PendingButton from '../components/PendingButton'
import DeleteButton from '../components/DeleteButton'
import ArchiveEventDetail from '../components/ArchiveEventDetail'
import { Pin, ChevronRight } from '../components/Icon'
import { useIsMobile } from '../hooks/useIsMobile'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { isModuleEnabled } from '../utils/modules'
import { freshRowsFromEvent } from '../utils/eventLists'
import { formatDate } from '../utils/formatDate'
import { deleteEventWithInventoryCheck } from '../utils/kitInventory'

const PAGE_SIZE = 30

export default function Archive() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, team, teamId } = useAuth()
  const loadListsOn = isModuleEnabled(team, 'loadLists')
  const confirm = useConfirm()
  const [events, setEvents]           = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc]         = useState(null)
  const [hasMore, setHasMore]         = useState(true)
  const [copying, setCopying]         = useState(null)
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId]   = useState(null)
  // Dati extra del dettaglio (persone, furgoni, assegnazioni): si caricano
  // solo alla prima apertura di un evento, non per tutto l'archivio.
  const [workers, setWorkers]         = useState([])
  const [vehicles, setVehicles]       = useState([])
  const [blocksByEvent, setBlocksByEvent] = useState({})
  const extrasLoaded = useRef(false)

  const today = new Date().toISOString().split('T')[0]

  const loadEvents = useCallback(async (after = null) => {
    if (!teamId) return
    after ? setLoadingMore(true) : setLoading(true)
    try {
      let q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'), limit(PAGE_SIZE * 3))
      if (after) q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'), startAfter(after), limit(PAGE_SIZE * 3))

      const snap = await getDocs(q)
      // isDeadlineReminder: promemoria scadenze auto-generati (vedi utils/deadlines.js),
      // items sempre vuoto e data spesso passata — finirebbero in archivio
      // senza esserci mai stati, compaiono solo in Calendario.
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.isDeadlineReminder)

      // Un evento va in archivio se:
      // 1. La data è passata, E lista vuota (nessun articolo) OPPURE tutti gli
      //    articoli caricati sono rientrati; OPPURE
      // 2. È di OGGI ma il carico è già rientrato per intero — serve la prova
      //    che sia stato davvero eseguito (almeno un rientro), non solo "non
      //    ancora iniziato": un evento mattutino il cui materiale torna in
      //    giornata non deve aspettare la mezzanotte per liberare spazio.
      const archived = allDocs.filter(e => {
        const items = e.items || []
        // Rent/install: in archivio solo quando chiusi (flag archived), come
        // in Eventi — finché sono aperti (anche scaduti) restano là.
        if (e.type === 'installation') return !!e.archived
        // Un evento su più giorni ancora in corso non è passato: conta la
        // data di FINE, non quella d'inizio.
        const end = e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date
        if (end < today) {
          if (items.length === 0) return true
          return !items.some(i => i.loaded && !i.returned)
        }
        if (end === today) {
          return items.some(i => i.returned) && !items.some(i => i.loaded && !i.returned)
        }
        return false
      })

      const docs = archived.slice(0, PAGE_SIZE)
      after ? setEvents(prev => [...prev, ...docs]) : setEvents(docs)
      setLastDoc(snap.docs[snap.docs.length - 1] || null)
      setHasMore(snap.docs.length === PAGE_SIZE * 3)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [today, teamId])

  useEffect(() => { loadEvents() }, [loadEvents])

  const filtered = search.trim()
    ? events.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase()) ||
        (e.items || []).some(i => i.name?.toLowerCase().includes(search.toLowerCase()))
      )
    : events

  const useAsTemplate = async (event) => {
    setCopying(event.id)
    try {
      // Stato di avanzamento azzerato: il nuovo evento parte da capo
      const templateItems = freshRowsFromEvent(event.items)
      // Naviga alla pagina eventi con gli articoli pre-caricati
      navigate('/events', { state: {
        templateItems,
        templateName: event.name,
        templateLists: event.lists || [],
        templateMainListName: event.mainListName || '',
      }})
    } catch(e) {
      console.error('Template error:', e)
      setCopying(null)
    }
  }

  const deleteArchiveEvent = async (event) => {
    if (!(await confirm({ title: t('archive.confirmDeleteTitle'), message: t('archive.confirmDeleteMessage', { name: event.name }), confirmLabel: t('archive.confirmDeleteLabel'), danger: true }))) return
    await deleteEventWithInventoryCheck({ event, confirm, t })
    setEvents(prev => prev.filter(e => e.id !== event.id))
    setSelectedId(cur => (cur === event.id ? null : cur))
    return true
  }

  useEffect(() => {
    if (!selectedId || !teamId) return
    if (!extrasLoaded.current) {
      extrasLoaded.current = true
      getDocs(query(collection(db, 'profiles'), where('teamId', '==', teamId)))
        .then(snap => setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => { extrasLoaded.current = false })
      getDocs(query(collection(db, 'vehicles'), where('teamId', '==', teamId)))
        .then(snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => {})
    }
    if (blocksByEvent[selectedId] === undefined) {
      const id = selectedId
      getDocs(query(collection(db, 'assignmentBlocks'), where('teamId', '==', teamId), where('eventId', '==', id)))
        .then(snap => setBlocksByEvent(p => ({ ...p, [id]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })))
        .catch(() => setBlocksByEvent(p => ({ ...p, [id]: [] })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, teamId])

  const dayLabel = (event) => {
    const end = event.dateEnd && event.dateEnd > event.date ? event.dateEnd : null
    const dd = d => new Date(d + 'T12:00:00')
    return {
      day: end ? `${dd(event.date).getDate()}–${dd(end).getDate()}` : String(dd(event.date).getDate()),
      month: formatDate(dd(event.date), { month: 'short' }, i18n.language).replace('.', ''),
      year: dd(event.date).getFullYear(),
      multi: !!end,
    }
  }
  const thisYear = new Date().getFullYear()
  const selected = events.find(e => e.id === selectedId) || null
  const detailProps = ev => ({ event: ev, workers, blocks: blocksByEvent[ev.id] || [], vehicles, loadListsOn })

  // Pulsanti fissi in fondo alla colonna / al foglio: stessa coppia ovunque.
  const actionBar = ev => (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      <DeleteButton onDelete={async () => (await deleteArchiveEvent(ev)) === true} size={48} ariaLabel={t('archive.deleteEventAria', { name: ev.name })} />
      <button onClick={() => copying !== ev.id && useAsTemplate(ev)} disabled={copying === ev.id} className="btn-no-anim"
        style={{ flex:1, padding:'14px 16px', borderRadius:13, background:'#e63946', color:'#fff', fontSize:15, fontWeight:800, opacity: copying === ev.id ? 0.6 : 1 }}>
        {copying === ev.id ? t('archive.copying') : t('archive.useTemplateAction')}
      </button>
    </div>
  )

  const eventCard = event => {
    const items    = event.items || []
    const total    = items.length
    const returned = items.filter(i => i.returned).length
    const allBack  = returned === total
    const isSel = selectedId === event.id
    const dl = dayLabel(event)
    return (
      <button key={event.id} type="button" onClick={() => setSelectedId(cur => (!isMobile && cur === event.id ? null : event.id))}
        aria-pressed={!isMobile ? isSel : undefined} aria-label={t('archive.openEventAria', { name: event.name })}
        style={{ width:'calc(100% - 32px)', margin:'0 16px 10px', display:'flex', alignItems:'center', gap:13, padding:'12px 14px 12px 12px', background: isSel ? '#fff7f7' : '#fff', border:`1px solid ${isSel ? '#e63946' : '#e0ddd6'}`, borderRadius:16, textAlign:'left', font:'inherit', color:'inherit', cursor:'pointer', transition:'border-color 0.15s ease, background-color 0.15s ease' }}>
        <span style={{ width:54, height:54, borderRadius:13, background: isSel ? '#e63946' : '#eceae6', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:1.1, transition:'background-color 0.15s ease' }}>
          <span style={{ fontSize: dl.multi ? 16 : 21, fontWeight:800, color: isSel ? '#fff' : '#1a1a1a', fontVariantNumeric:'tabular-nums' }}>{dl.day}</span>
          <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.04em', color: isSel ? 'rgba(255,255,255,0.85)' : '#6b6b6b', marginTop:2 }}>
            {dl.month}{dl.year !== thisYear ? ` ${String(dl.year).slice(2)}` : ''}
          </span>
        </span>
        <span style={{ flex:1, minWidth:0, display:'block' }}>
          <span style={{ display:'block', fontSize:15.5, fontWeight:800, color:'#1a1a1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.name}</span>
          {event.location && (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'#6b6b6b', marginTop:3, minWidth:0 }}>
              <Pin size={13} />
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.location}</span>
            </span>
          )}
          {loadListsOn && total > 0 && (
            <span style={{ display:'block', fontSize:12, fontWeight:700, marginTop:3, color: allBack ? '#15803d' : '#ea580c' }}>
              {t('archive.itemsCount', { count: total })} · {allBack ? t('archive.allReturned') : t('archive.partialReturned', { returned, total })}
            </span>
          )}
        </span>
        <span style={{ color:'#9a9a9a', display:'flex' }}><ChevronRight size={18} /></span>
      </button>
    )
  }

  const listColumn = (
    <div style={{ padding:'12px 0 0' }}>
      {loading ? (
        <div style={{ padding:'40px', textAlign:'center', color:'var(--text2)' }}>
          <div style={{ width:32, height:32, border:'3px solid #e0ddd6', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p>{t('archive.loadingArchive')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? t('archive.noResults') : t('archive.noArchivedEvents')}</h3>
          <p>{search ? t('archive.noResultsFor', { search }) : t('archive.emptyDesc')}</p>
        </div>
      ) : (
        <>
          {filtered.map(eventCard)}
          {!search && hasMore && (
            <div style={{ padding:'8px 16px 16px' }}>
              <PendingButton onClick={() => loadEvents(lastDoc)} disabled={loadingMore}
                className="rc-pill-btn" style={{ width:'100%', padding:'13px 16px', fontSize:14 }}>
                {t('archive.loadMore')}
              </PendingButton>
            </div>
          )}
        </>
      )}
    </div>
  )

  // Contenuto della colonna: resta quello dell'ultimo evento scelto mentre si
  // richiude (altrimenti il testo sparirebbe prima che finisca lo scorrimento).
  const lastShown = useRef(null)
  if (selected) lastShown.current = selected
  const shown = selected || lastShown.current

  const pageHead = (
    <>
      <div className="page-header rc-page-header" style={isMobile ? { padding:'52px 20px 16px' } : undefined}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <button onClick={() => navigate('/events')} aria-label={t('common.back')} className="rc-pill-btn" style={{ padding:'8px 14px', fontSize:13, flexShrink:0 }}>
            ← {t('common.back')}
          </button>
          <div style={{ textAlign:'right', minWidth:0 }}>
            <h1 style={{ fontSize:24 }}>{t('archive.title')}</h1>
            <p style={{ fontSize:13, marginTop:2 }}>{t('archive.subtitle', { count: events.length })}</p>
          </div>
        </div>
      </div>

      <div className="search-bar rc-inv-search" style={{ marginTop:14 }}>
        <div>
          <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('archive.searchPlaceholder')} aria-label={t('archive.searchPlaceholder')} />
        </div>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <div style={{ background:'var(--surface)', minHeight:'100dvh', paddingBottom:140 }}>
        {pageHead}
        {listColumn}
        {selected && (
          <ArchiveSheet event={selected} onClose={() => setSelectedId(null)} footer={actionBar(selected)}>
            <ArchiveEventDetail {...detailProps(selected)} />
          </ArchiveSheet>
        )}
      </div>
    )
  }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', display:'flex', alignItems:'flex-start' }}>
      <div style={{ flex:1, minWidth:0, paddingBottom:140 }}>
        {pageHead}
        {listColumn}
      </div>
      {/* Colonna laterale: non c'è finché non si sceglie un evento, poi entra
          scivolando da destra e occupa tutta l'altezza dello schermo (dal bordo
          alto, accanto all'header) — così titolo, dettagli e i due pulsanti
          fissi in fondo stanno sempre in vista senza scorrere la pagina. */}
      <aside className={`rc-aside-slide${selected ? ' open' : ''}`} aria-hidden={!selected}>
        <div style={{ width:460, height:'100dvh', background:'#fff', borderLeft:'1px solid #e0ddd6', display:'flex', flexDirection:'column' }}>
          {shown && (
            <div key={shown.id} className="rc-sidebar-swap" style={{ display:'flex', flexDirection:'column', minHeight:0, flex:1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'24px 28px 8px' }}>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800, letterSpacing:'-0.3px', color:'#1a1a1a', overflowWrap:'anywhere' }}>{shown.name}</h2>
                <button onClick={() => setSelectedId(null)} aria-label={t('common.close')}
                  style={{ width:30, height:30, borderRadius:10, background:'#eceae6', color:'#6b6b6b', fontSize:14, fontWeight:800, flexShrink:0 }}>✕</button>
              </div>
              <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'0 28px 20px' }}>
                <ArchiveEventDetail {...detailProps(shown)} />
              </div>
              <div style={{ padding:'14px 28px 20px', borderTop:'1px solid #e0ddd6', background:'#fff' }}>{actionBar(shown)}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

// Foglio telefono: titolo e ✕ in alto, dettagli + lista che scorrono nel
// mezzo, pulsanti fissi in fondo (non scorrono via con la lista).
function ArchiveSheet({ event, onClose, footer, children }) {
  const { t } = useTranslation()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)
  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal rc-sheet${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`}
        style={{ position:'relative', display:'flex', flexDirection:'column', overflow:'hidden', padding:'8px 0 0', height:'90dvh' }} {...drag.props}>
        <button className="close-btn" onClick={drag.close} aria-label={t('common.close')}>✕</button>
        <h2 style={{ padding:'0 66px 0 22px', marginBottom:6, flexShrink:0, overflowWrap:'anywhere' }}>{event.name}</h2>
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'0 22px 20px', WebkitOverflowScrolling:'touch' }}>{children}</div>
        <div style={{ flexShrink:0, padding:'12px 22px calc(env(safe-area-inset-bottom, 0px) + 16px)', borderTop:'1px solid #e0ddd6', background:'#f4f3ef' }}>{footer}</div>
      </div>
    </div>
  )
}
