import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, doc, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { eventRowIncludesItem, itemCommittedElsewhere } from '../utils/kitInventory'
import { ensureInstanceList, reconcileInstanceNumbers } from '../utils/kitInstances'
import { formatDate } from '../utils/formatDate'
import { todayStr } from '../utils/workHours'
import BackHomeButton from '../components/BackHomeButton'
import DateField from '../components/DateField'
import CreateEventFlow from '../components/CreateEventFlow'
import { Plus, Check, Warn } from '../components/Icon'

const ACTIVITY_COLORS = {
  added:'var(--blue)', removed:'var(--red)',
  pronto:'#059669', unpronto:'var(--text3)',
  loaded:'var(--accent2)', unloaded:'var(--text3)',
  returned:'var(--green)', unreturned:'var(--text3)',
  missing:'#ea580c', unmissing:'var(--text3)',
}

// Pagina dedicata a un singolo oggetto: storico completo (senza il limite di
// 5 voci del vecchio popup in Inventory.jsx) più, in aggiunta, un controllo
// di disponibilità libero — scegli un intervallo di date qualsiasi e scopri
// subito se l'oggetto è impegnato, senza dover creare un evento finto solo
// per verificarlo. Riusa la stessa logica di sovrapposizione già scritta per
// l'avviso "disponibilità insufficiente" in EventDetail.jsx (itemCommittedElsewhere).
export default function InventoryItemHistory() {
  const { itemId } = useParams()
  const { t, i18n } = useTranslation()
  const { teamId } = useAuth()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [itemLoaded, setItemLoaded] = useState(false)
  const [allItems, setAllItems] = useState([])
  const [events, setEvents] = useState([])
  const [itemActivityLog, setItemActivityLog] = useState([])
  const [historyInstanceFilter, setHistoryInstanceFilter] = useState(null)
  const [historyTab, setHistoryTab] = useState('events') // 'events' | 'activity'
  const [showEventActivity, setShowEventActivity] = useState(null) // { id, name } | null
  const [checkStart, setCheckStart] = useState(() => todayStr())
  const [checkEnd, setCheckEnd] = useState(() => todayStr())
  const [showCreateFlow, setShowCreateFlow] = useState(false)

  useEffect(() => {
    if (!itemId) return
    return onSnapshot(doc(db, 'items', itemId), snap => {
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setItemLoaded(true)
    })
  }, [itemId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'items'), where('teamId', '==', teamId), orderBy('name'))
    return onSnapshot(q, snap => setAllItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!itemId) { setItemActivityLog([]); return }
    const q = query(collection(db, 'itemActivity'), where('catalogItemId', '==', itemId), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setItemActivityLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [itemId])

  const matchesItem = i => {
    if (!eventRowIncludesItem(i, itemId, allItems)) return false
    if (historyInstanceFilter == null) return true
    if (i.id !== itemId && i.itemRef !== itemId) return true
    return (i.instanceNumbers || []).includes(historyInstanceFilter)
  }

  // A differenza del vecchio popup, qui la cronologia non è tagliata a 5 —
  // è l'intero motivo per cui questa è diventata una pagina a sé. Ordine:
  // prima l'evento per cui l'oggetto è ATTUALMENTE fuori (se c'è — è
  // l'informazione più urgente, a prescindere da quanto lontana sia la sua
  // data, es. non deve finire sotto un evento futuro solo perché prenotato
  // più avanti), poi gli altri per data decrescente.
  const isOutForEvent = ev => {
    const itm = (ev.items || []).find(matchesItem)
    return !!(itm?.loaded && !itm?.returned)
  }
  const detailEventHistory = events
    .filter(ev => (ev.items || []).some(matchesItem))
    .sort((a, b) => {
      const aOut = isOutForEvent(a), bOut = isOutForEvent(b)
      if (aOut !== bOut) return aOut ? -1 : 1
      return b.date.localeCompare(a.date)
    })

  // Controllo disponibilità: NON legato a un evento reale (id:null non
  // corrisponde mai a un evento vero), stesso conteggio quantità-consapevole
  // già usato per l'avviso in EventDetail.jsx.
  const maxAvail = item ? Math.max(0, (item.totalQty || 0) - (item.brokenQty || 0)) : 0
  const checkRangeValid = !!(checkStart && checkEnd && checkEnd >= checkStart)
  const { qty: committedQty, events: committedEvents } = (item && checkRangeValid)
    ? itemCommittedElsewhere(item.id, { id: null, date: checkStart, dateEnd: checkEnd }, events)
    : { qty: 0, events: [] }
  const freeQty = Math.max(0, maxAvail - committedQty)

  // Riga pronta per un evento nuovo, stessa forma di rowsToAdd in
  // EventDetail.jsx/confirmCart — per i kit assegna già i bauli fisici
  // (preferendo quelli senza componenti mancanti), non solo nome/categoria.
  const newListItem = item ? {
    id: item.id, name: item.name, category: item.category, qty: 1, loaded: false, returned: false,
    isKit: item.isKit || false, kitSize: item.kitSize || null,
    isBundle: item.isBundle || false, components: item.components || null,
    ...(item.isBundle ? { instanceNumbers: reconcileInstanceNumbers(ensureInstanceList(item.instances, item.totalQty ?? 1), [], 1) } : {}),
  } : null

  if (itemLoaded && !item) {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <BackHomeButton to="/inventory" />
            <h1>{t('inventory.historyItemNotFoundTitle')}</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <BackHomeButton to="/inventory" />
          {/* Titolo fisso, non il nome dell'oggetto — così sta sempre su una
              riga sola su mobile, senza bisogno di troncare/andare a capo
              qualunque sia la lunghezza del nome. Il nome vero e proprio si
              legge subito sotto, nella prima card. */}
          <h1 style={{ textAlign:'right' }}>{t('inventory.historyPageTitle')}</h1>
        </div>
      </div>


      {/* Scheda base — stessa lettura "un rigo per campo" del modal di
          dettaglio in Inventory.jsx, qui di sola consultazione. Il nome è
          il primo rigo: l'header sopra ora è un titolo fisso ("Dettagli"),
          quindi questa è la prima cosa che dice di quale oggetto si sta
          parlando — attaccato al resto, non in una card a parte. */}
      {item && (
        <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', gap:14 }}>
            <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.nameFieldLabel')}</span>
            <span style={{ fontWeight:700, fontSize:14, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{item.name}</span>
          </div>
          {(item.brand || item.model) && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:14 }}>
              <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.brandModelLabel')}</span>
              <span style={{ fontWeight:600, fontSize:13, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{[item.brand, item.model].filter(Boolean).join(' ')}</span>
            </div>
          )}
          {item.location && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:14 }}>
              <span style={{ color:'var(--text2)', fontSize:13, flexShrink:0 }}>{t('inventory.warehousePosition')}</span>
              <span style={{ fontWeight:600, fontSize:13, textAlign:'right', minWidth:0, overflowWrap:'break-word' }}>{item.location}</span>
            </div>
          )}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ color:'var(--text2)', fontSize:13 }}>{t('inventory.detailAvailable')}</span>
              <span style={{ fontWeight:800, fontSize:15 }}>{item.availableQty}/{item.totalQty}</span>
            </div>
            <div style={{ background:'var(--card2)', borderRadius:4, height:7, overflow:'hidden', display:'flex' }}>
              <div style={{ background:'var(--green)', width:`${((item.availableQty||0)/(item.totalQty||1))*100}%` }} />
              {(item.brokenQty||0) > 0 && <div style={{ background:'var(--red)', width:`${((item.brokenQty||0)/(item.totalQty||1))*100}%` }} />}
            </div>
          </div>
        </div>
      )}

      {/* Controllo disponibilità libero — la ragione d'essere di questa
          pagina: sapere se l'oggetto è impegnato in un certo periodo senza
          dover creare un evento (nemmeno provvisorio) solo per scoprirlo. */}
      {item && (
        <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
          <p style={{ fontSize:12.5, fontWeight:700, color:'var(--text)', marginBottom:10 }}>{t('inventory.availabilityCheckTitle')}</p>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <DateField value={checkStart} onChange={v => { setCheckStart(v); if (checkEnd < v) setCheckEnd(v) }} placeholder={t('inventory.availabilityCheckFrom')} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <DateField value={checkEnd} onChange={setCheckEnd} min={checkStart} placeholder={t('inventory.availabilityCheckTo')} />
            </div>
          </div>
          {checkRangeValid && maxAvail > 0 && (() => {
            const state = committedQty === 0 ? 'free' : freeQty > 0 ? 'partial' : 'none'
            const color = state === 'free' ? 'var(--green)' : state === 'partial' ? 'var(--accent2)' : 'var(--red)'
            const bg = state === 'free' ? 'rgba(52,211,153,0.10)' : state === 'partial' ? 'rgba(245,166,35,0.10)' : 'rgba(248,113,113,0.10)'
            const border = state === 'free' ? 'rgba(52,211,153,0.3)' : state === 'partial' ? 'rgba(245,166,35,0.3)' : 'rgba(248,113,113,0.3)'
            return (
              <div style={{ marginTop:12, display:'flex', alignItems:'flex-start', gap:9, borderRadius:10, padding:'10px 12px', background:bg, border:`1px solid ${border}` }}>
                <span style={{ color, flexShrink:0, marginTop:1 }}>{state === 'free' ? <Check size={14} /> : <Warn size={14} />}</span>
                <p style={{ fontSize:13, fontWeight:700, color, lineHeight:1.4 }}>
                  {state === 'free'
                    ? t('inventory.availabilityCheckFree', { free: maxAvail, total: maxAvail })
                    : t(state === 'partial' ? 'inventory.availabilityCheckPartial' : 'inventory.availabilityCheckNone', {
                        free: freeQty, total: maxAvail, committed: committedQty,
                        eventName: committedEvents[0]?.name || '',
                        extra: committedEvents.length > 1 ? t('eventDetail.availabilityConflictMore', { count: committedEvents.length - 1 }) : '',
                      })
                  }
                </p>
              </div>
            )
          })()}
          {maxAvail === 0 && (
            <p style={{ marginTop:10, fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>{t('inventory.availabilityCheckNoStock')}</p>
          )}
          <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <button
              onClick={() => setShowCreateFlow(true)}
              className="btn btn-primary btn-full"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}
            >
              <Plus size={15} /> {t('inventory.createListWithItem')}
            </button>
          </div>
        </div>
      )}

      {/* Crea evento saltando dritto al form, con questa riga già in lista —
          stesso "skipChoice: { name, items }" già usato da Archive.jsx per
          "Usa come template": non serve nessuna logica nuova in
          CreateEventFlow, solo passargli la riga giusta. */}
      {newListItem && (
        <CreateEventFlow
          open={showCreateFlow}
          onClose={() => setShowCreateFlow(false)}
          skipChoice={{ name: '', items: [newListItem] }}
          onCreated={eventId => navigate(`/events/${eventId}`)}
        />
      )}

      {/* Cronologia dell'oggetto: due viste sullo stesso oggetto — dove è
          stato/andrà (eventi) e chi ha toccato cosa (attività) — raccolte
          in un unico blocco con un selettore invece di due card identiche
          impilate una sopra l'altra, che davano lo stesso peso visivo a
          due sezioni di importanza diversa. */}
      <div style={{ margin:'0 16px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
          <button
            onClick={() => setHistoryTab('events')}
            className="chip-no-press"
            aria-pressed={historyTab === 'events'}
            style={{
              flex:1, padding:'13px 8px', fontSize:12.5, fontWeight:800, textAlign:'center', background:'transparent',
              color: historyTab === 'events' ? 'var(--accent)' : 'var(--text2)',
              borderBottom: historyTab === 'events' ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:-1,
            }}
          >
            {t('inventory.tabEvents', { count: detailEventHistory.length })}
          </button>
          <button
            onClick={() => setHistoryTab('activity')}
            className="chip-no-press"
            aria-pressed={historyTab === 'activity'}
            style={{
              flex:1, padding:'13px 8px', fontSize:12.5, fontWeight:800, textAlign:'center', background:'transparent',
              color: historyTab === 'activity' ? 'var(--accent)' : 'var(--text2)',
              borderBottom: historyTab === 'activity' ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:-1,
            }}
          >
            {t('inventory.tabActivity', { count: itemActivityLog.length })}
          </button>
        </div>

        <div style={{ padding:'14px 16px' }}>
          {historyTab === 'events' ? (
            <>
              {/* Filtro per baule — solo per i kit: lo storico aggregato del
                  kit intero non dice quale ESEMPLARE fisico è stato dove. */}
              {item?.isBundle && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  <button
                    onClick={() => setHistoryInstanceFilter(null)}
                    className="btn-no-anim"
                    aria-pressed={historyInstanceFilter === null}
                    style={{
                      padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:700,
                      background: historyInstanceFilter === null ? 'var(--accent)' : 'var(--card2)',
                      color: historyInstanceFilter === null ? '#fff' : 'var(--text2)',
                      border: `1px solid ${historyInstanceFilter === null ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {t('inventory.allInstancesFilter')}
                  </button>
                  {ensureInstanceList(item.instances, item.totalQty).map(inst => (
                    <button
                      key={inst.number}
                      onClick={() => setHistoryInstanceFilter(n => n === inst.number ? null : inst.number)}
                      className="btn-no-anim"
                      aria-pressed={historyInstanceFilter === inst.number}
                      style={{
                        padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:700,
                        background: historyInstanceFilter === inst.number ? 'var(--accent)' : 'var(--card2)',
                        color: historyInstanceFilter === inst.number ? '#fff' : ((inst.brokenComponents||[]).length > 0 ? 'var(--red)' : 'var(--text2)'),
                        border: `1px solid ${historyInstanceFilter === inst.number ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      {t('inventory.kitInstanceLabel', { number: inst.number })}
                    </button>
                  ))}
                </div>
              )}

              {detailEventHistory.length === 0 ? (
                <p style={{ color:'var(--text3)', fontSize:13, fontStyle:'italic' }}>{t('inventory.noHistoryAvailable')}</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {detailEventHistory.map(ev => {
                    const itm = (ev.items || []).find(matchesItem)
                    const stillOut = itm?.loaded && !itm?.returned
                    return (
                      <button
                        key={ev.id}
                        onClick={() => navigate(`/events/${ev.id}`)}
                        style={{ display:'flex', alignItems:'center', gap:12, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'left' }}
                      >
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <p style={{ fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</p>
                            {item?.isBundle && (itm?.instanceNumbers||[]).length > 0 && (
                              <span style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:800, flexShrink:0 }}>{t('eventDetail.kitInstancesBadge', { numbers: itm.instanceNumbers.join(', ') })}</span>
                            )}
                          </div>
                          <p style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                            {formatDate(ev.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long', year:'numeric' }, i18n.language)}
                            {ev.location ? ` · ${ev.location}` : ''}
                          </p>
                        </div>
                        {stillOut && (
                          <span className="badge" style={{ background:'rgba(245,166,35,0.15)', color:'var(--accent2)', fontSize:11, flexShrink:0 }}>{t('inventory.out')}</span>
                        )}
                        <span style={{ color:'var(--text2)' }}>→</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            /* Cronologia "chi ha fatto cosa" — attraverso TUTTI gli eventi,
               anche quelli che nel frattempo hanno rimosso l'oggetto dalla
               propria lista o sono stati archiviati/eliminati. */
            itemActivityLog.length === 0 ? (
              <p style={{ color:'var(--text3)', fontSize:13, fontStyle:'italic' }}>{t('inventory.noActivityAvailable')}</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:320, overflowY:'auto' }}>
                {itemActivityLog.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    className="btn-no-anim"
                    disabled={!entry.eventId}
                    onClick={() => entry.eventId && setShowEventActivity({ id: entry.eventId, name: entry.eventName })}
                    style={{ display:'flex', alignItems:'flex-start', gap:9, width:'100%', textAlign:'left', background:'transparent', padding:'6px 4px', borderRadius:8, cursor: entry.eventId ? 'pointer' : 'default' }}
                  >
                    <span style={{ width:8, height:8, borderRadius:'50%', background: ACTIVITY_COLORS[entry.action] || 'var(--text3)', flexShrink:0, marginTop:6 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:600 }}>
                        {t(`eventDetail.activity_${entry.action}`, { name: entry.userName || t('eventDetail.unknownUser') })}
                      </p>
                      <p style={{ fontSize:11, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {entry.eventName && (
                          <span style={{ color: entry.eventId ? 'var(--blue)' : 'var(--text2)', fontWeight:600 }}>{entry.eventName}</span>
                        )}
                        <span style={{ color:'var(--text2)' }}>
                          {entry.eventName ? ' · ' : ''}
                          {entry.createdAt?.toDate ? formatDate(entry.createdAt.toDate(), { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }, i18n.language) : t('eventDetail.historyJustNow')}
                        </span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Cronologia di un singolo evento, dalla sezione sopra — filtra
          itemActivityLog già in memoria, nessuna nuova query. */}
      {showEventActivity && (
        <div
          onClick={() => setShowEventActivity(null)}
          style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position:'relative', width:'100%', maxWidth:360, maxHeight:'80vh', display:'flex', flexDirection:'column', background:'var(--card)', borderRadius:16, padding:20, boxShadow:'0 12px 40px rgba(0,0,0,0.3)' }}
          >
            <button
              onClick={() => setShowEventActivity(null)}
              aria-label={t('common.close')}
              style={{ position:'absolute', top:10, right:10, background:'transparent', color:'var(--text2)', fontSize:16, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}
            >
              ✕
            </button>
            <h2 style={{ marginBottom:2, fontSize:17, paddingRight:36 }}>{showEventActivity.name || t('inventory.activityTitle')}</h2>
            <p style={{ color:'var(--text2)', fontSize:12, marginBottom:16 }}>{item?.name}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:12, overflowY:'auto' }}>
              {itemActivityLog.filter(entry => entry.eventId === showEventActivity.id).map(entry => (
                <div key={entry.id} style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: ACTIVITY_COLORS[entry.action] || 'var(--text3)', flexShrink:0, marginTop:6 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:600 }}>
                      {t(`eventDetail.activity_${entry.action}`, { name: entry.userName || t('eventDetail.unknownUser') })}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>
                      {entry.createdAt?.toDate ? formatDate(entry.createdAt.toDate(), { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }, i18n.language) : t('eventDetail.historyJustNow')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
