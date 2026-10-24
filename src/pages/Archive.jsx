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

// Testo "piatto" per la ricerca: minuscolo e senza accenti.
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

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
  const lastDocRef = useRef(null)
  const searchRef = useRef(null)
  const hasMoreRef = useRef(true)
  const loadingAllRef = useRef(false)
  const [searchingAll, setSearchingAll] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // Una "pagina" dell'archivio: legge `size` eventi dal più recente e tiene quelli già archiviati.
  // Si legge più di quanti se ne mostrano perché in testa (data decrescente) ci sono gli eventi
  // futuri o ancora aperti, che non vanno in archivio.
  const fetchBatch = useCallback(async (after, size) => {
    let q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'), limit(size))
    if (after) q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'), startAfter(after), limit(size))
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
    return { archived, last: snap.docs[snap.docs.length - 1] || null, more: snap.docs.length === size }
  }, [today, teamId])

  const mergeUnique = (prev, more) => {
    const seen = new Set(prev.map(e => e.id))
    return [...prev, ...more.filter(e => !seen.has(e.id))]
  }

  const loadEvents = useCallback(async (after = null) => {
    if (!teamId) return
    after ? setLoadingMore(true) : setLoading(true)
    try {
      const r = await fetchBatch(after, PAGE_SIZE * 3)
      // Tutti gli archiviati letti, non solo i primi PAGE_SIZE: prima gli altri andavano persi
      // (e "Carica altri" ripartiva dopo l'ultimo documento letto, saltandoli).
      after ? setEvents(prev => mergeUnique(prev, r.archived)) : setEvents(r.archived)
      lastDocRef.current = r.last
      hasMoreRef.current = r.more
      setLastDoc(r.last)
      setHasMore(r.more)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [fetchBatch, teamId])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Cercando, la ricerca deve valere su TUTTO l'archivio, non solo sulle pagine già caricate:
  // appena si scrive qualcosa si leggono in blocco tutti gli eventi rimasti (una volta sola).
  const loadAll = useCallback(async () => {
    if (loadingAllRef.current || !hasMoreRef.current) return
    loadingAllRef.current = true
    setSearchingAll(true)
    try {
      let after = lastDocRef.current, more = true
      const acc = []
      while (more) {
        const r = await fetchBatch(after, 300)
        acc.push(...r.archived)
        after = r.last
        more = r.more && !!r.last
      }
      setEvents(prev => mergeUnique(prev, acc))
      lastDocRef.current = after
      hasMoreRef.current = false
      setLastDoc(after)
      setHasMore(false)
    } finally {
      loadingAllRef.current = false
      setSearchingAll(false)
    }
  }, [fetchBatch])

  // Una parola sola di una o due lettere (es. "ga") darebbe troppi risultati per valere la lettura
  // di tutto l'archivio: si cerca solo tra gli eventi già caricati, finché non si scrive di più.
  const tooShort = terms => terms.length > 0 && terms.every(t => t.length <= 2)
  useEffect(() => {
    const terms = norm(search).split(/\s+/).filter(Boolean)
    if (terms.length === 0 || tooShort(terms) || !hasMore) return
    const id = setTimeout(loadAll, 300)
    return () => clearTimeout(id)
  }, [search, hasMore, loadAll])

  // Ricerca per nome o luogo: senza distinguere maiuscole/minuscole né accenti ("citta" trova
  // "Città"), e con più parole servono tutte, in qualunque ordine ("gala erba" trova "Erba — Gala").
  const terms = norm(search).split(/\s+/).filter(Boolean)
  const filtered = terms.length
    ? events.filter(e => {
        const hay = norm(`${e.name || ''} ${e.location || ''}`)
        return terms.every(t => hay.includes(t))
      })
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

  // Evidenzia nel testo le parole cercate (stessa regola della ricerca: niente maiuscole né accenti).
  const highlight = text => {
    if (!terms.length || !text) return text
    const flat = [], map = []
    let pos = 0
    for (const ch of text) {
      const n = norm(ch)
      for (let k = 0; k < n.length; k++) { flat.push(n[k]); map.push(pos) }
      pos += ch.length
    }
    const hay = flat.join('')
    const ranges = []
    terms.forEach(t => {
      let from = 0, at
      while ((at = hay.indexOf(t, from)) !== -1) {
        ranges.push([map[at], map[at + t.length - 1] + 1])
        from = at + t.length
      }
    })
    if (ranges.length === 0) return text
    ranges.sort((x, y) => x[0] - y[0])
    const merged = [ranges[0].slice()]
    ranges.slice(1).forEach(r => { const last = merged[merged.length - 1]; if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()) })
    const out = []
    let from = 0
    merged.forEach(([a, b]) => {
      if (a > from) out.push(text.slice(from, a))
      out.push(<mark key={a} style={{ background:'rgba(250,204,21,0.45)', color:'inherit', borderRadius:3, padding:'0 1px' }}>{text.slice(a, b)}</mark>)
      from = b
    })
    if (from < text.length) out.push(text.slice(from))
    return out
  }

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
        style={{ width:'calc(100% - 32px)', margin:'0 16px 10px', display:'flex', alignItems:'center', gap:13, padding:'12px 14px 12px 12px', background: isSel ? 'var(--c-t-red)' : 'var(--c-surface)', border:`1px solid ${isSel ? '#e63946' : 'var(--c-line)'}`, borderRadius:16, textAlign:'left', font:'inherit', color:'inherit', cursor:'pointer', transition:'border-color 0.15s ease, background-color 0.15s ease' }}>
        <span style={{ width:54, height:54, borderRadius:13, background: isSel ? '#e63946' : 'var(--c-fill)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:1.1, transition:'background-color 0.15s ease' }}>
          <span style={{ fontSize: dl.multi ? 16 : 21, fontWeight:800, color: isSel ? '#fff' : 'var(--c-ink)', fontVariantNumeric:'tabular-nums' }}>{dl.day}</span>
          <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.04em', color: isSel ? 'rgba(255,255,255,0.85)' : 'var(--c-ink2)', marginTop:2 }}>
            {dl.month}{dl.year !== thisYear ? ` ${String(dl.year).slice(2)}` : ''}
          </span>
        </span>
        <span style={{ flex:1, minWidth:0, display:'block' }}>
          <span style={{ display:'block', fontSize:15.5, fontWeight:800, color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{highlight(event.name)}</span>
          {event.location && (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color:'var(--c-ink2)', marginTop:3, minWidth:0 }}>
              <Pin size={13} />
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{highlight(event.location)}</span>
            </span>
          )}
          {loadListsOn && total > 0 && (
            <span style={{ display:'block', fontSize:12, fontWeight:700, marginTop:3, color: allBack ? 'var(--c-green)' : '#ea580c' }}>
              {t('archive.itemsCount', { count: total })} · {allBack ? t('archive.allReturned') : t('archive.partialReturned', { returned, total })}
            </span>
          )}
        </span>
        <span style={{ color:'var(--c-ink3)', display:'flex' }}><ChevronRight size={18} /></span>
      </button>
    )
  }

  const listColumn = (
    <div style={{ padding:'12px 0 0' }}>
      {loading ? (
        <div style={{ padding:'40px', textAlign:'center', color:'var(--text2)' }}>
          <div style={{ width:32, height:32, border:'3px solid var(--c-line)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p>{t('archive.loadingArchive')}</p>
        </div>
      ) : filtered.length === 0 && searchingAll ? (
        <div className="empty-state"><p>{t('archive.searchingAll')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? t('archive.noResults') : t('archive.noArchivedEvents')}</h3>
          <p>{search ? t('archive.noResultsFor', { search }) : t('archive.emptyDesc')}</p>
        </div>
      ) : (
        <>
          {terms.length > 0 && (
            <p role="status" style={{ margin:'0 16px 10px', fontSize:12.5, fontWeight:700, color:'var(--c-ink3)' }}>
              {t('archive.resultsCount', { count: filtered.length })}{searchingAll ? ` · ${t('archive.searchingAll')}` : hasMore ? (tooShort(terms) ? ` · ${t('archive.shortSearchHint')}` : '') : ` · ${t('archive.wholeArchive')}`}
            </p>
          )}
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
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('archive.searchPlaceholder')} aria-label={t('archive.searchPlaceholder')} style={{ paddingRight: 40 }} />
          {search && (
            <button type="button" className="btn-no-anim" aria-label={t('archive.clearSearch')} onClick={() => { setSearch(''); searchRef.current?.focus() }}
              style={{ position:'absolute', right:26, top:'50%', transform:'translateY(-50%)', width:26, height:26, borderRadius:'50%', background:'var(--c-line)', color:'var(--c-ink2)', fontSize:16, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          )}
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
        <div style={{ width:460, height:'100dvh', background:'var(--c-surface)', borderLeft:'1px solid var(--c-line)', display:'flex', flexDirection:'column' }}>
          {shown && (
            <div key={shown.id} className="rc-sidebar-swap" style={{ display:'flex', flexDirection:'column', minHeight:0, flex:1 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'24px 28px 8px' }}>
                <h2 style={{ margin:0, fontSize:20, fontWeight:800, letterSpacing:'-0.3px', color:'var(--c-ink)', overflowWrap:'anywhere' }}>{shown.name}</h2>
                <button onClick={() => setSelectedId(null)} aria-label={t('common.close')}
                  style={{ width:30, height:30, borderRadius:10, background:'var(--c-fill)', color:'var(--c-ink2)', fontSize:14, fontWeight:800, flexShrink:0 }}>✕</button>
              </div>
              <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'0 28px 20px' }}>
                <ArchiveEventDetail {...detailProps(shown)} />
              </div>
              <div style={{ padding:'14px 28px 20px', borderTop:'1px solid var(--c-line)', background:'var(--c-surface)' }}>{actionBar(shown)}</div>
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
        <div style={{ flexShrink:0, padding:'12px 22px calc(env(safe-area-inset-bottom, 0px) + 16px)', borderTop:'1px solid var(--c-line)', background:'var(--c-sheet)' }}>{footer}</div>
      </div>
    </div>
  )
}
