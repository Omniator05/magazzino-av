import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, orderBy, limit, startAfter, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 30

export default function Archive() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [events, setEvents]         = useState([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc]       = useState(null)
  const [hasMore, setHasMore]       = useState(true)
  const [copying, setCopying]       = useState(null)
  const [copied, setCopied]         = useState(null)

  const today = new Date().toISOString().split('T')[0]

  const loadEvents = useCallback(async (after = null) => {
    after ? setLoadingMore(true) : setLoading(true)
    try {
      let q = query(
        collection(db, 'events'),
        orderBy('date', 'desc'),
        limit(PAGE_SIZE)
      )
      if (after) q = query(collection(db, 'events'), orderBy('date', 'desc'), startAfter(after), limit(PAGE_SIZE))

      const snap = await getDocs(q)
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.date < today) // solo passati

      after ? setEvents(prev => [...prev, ...docs]) : setEvents(docs)
      setLastDoc(snap.docs[snap.docs.length - 1] || null)
      setHasMore(snap.docs.length === PAGE_SIZE)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [today])

  useEffect(() => { loadEvents() }, [loadEvents])

  const filtered = search.trim()
    ? events.filter(e =>
        e.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase())
      )
    : events

  const deleteArchiveEvent = async (event) => {
    if (!window.confirm(`Eliminare "${event.name}" dall'archivio? Questa azione è irreversibile.`)) return
    await deleteDoc(doc(db, 'events', event.id))
    setEvents(prev => prev.filter(e => e.id !== event.id))
  }

  const useAsTemplate = async (event) => {
    setCopying(event.id)
    try {
      const templateItems = (event.items || []).map(i => ({
        ...i,
        loaded: false,
        returned: false,
      }))
      const today = new Date().toISOString().split('T')[0]
      const ref = await addDoc(collection(db, 'events'), {
        name: event.name,
        location: event.location || '',
        notes: event.notes || '',
        date: today,
        items: templateItems,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        fromArchive: event.id,
        recurrence: 'never',
        seriesId: null,
      })
      setCopied(event.id)
      setTimeout(() => navigate(`/events/${ref.id}`), 600)
    } catch(e) {
      console.error('Template error:', e)
      alert('Errore nella creazione del template. Riprova.')
      setCopying(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
          <button onClick={() => navigate('/events')}
            style={{ background:'var(--card2)', color:'var(--text2)', borderRadius:10, padding:'6px 12px', fontSize:13 }}>
            ← Indietro
          </button>
          <h1>Archivio eventi</h1>
        </div>
        <p style={{ color:'var(--text2)', fontSize:14 }}>{events.length} eventi passati · premi "Usa come template" per riutilizzare una lista</p>
      </div>

      {/* Ricerca */}
      <div className="search-bar" style={{ position:'relative' }}>
        <svg className="search-icon" viewBox="0 0 24 24" fill="var(--text2)" width="16" height="16"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome o location..." />
      </div>

      <div style={{ padding:'12px 0 0' }}>
        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text2)' }}>
            <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <p>Caricamento archivio...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize:40 }}>📁</p>
            <h3>{search ? 'Nessun risultato' : 'Nessun evento passato'}</h3>
            <p>{search ? `Nessun evento trovato per "${search}"` : 'Gli eventi passati appariranno qui'}</p>
          </div>
        ) : (
          <>
            {filtered.map(event => {
              const items    = event.items || []
              const total    = items.length
              const returned = items.filter(i => i.returned).length
              const isCopied = copied === event.id
              const isCopying = copying === event.id

              return (
                <div key={event.id} style={{ margin:'0 16px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
                  <div style={{ padding:'14px 16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:700, fontSize:16, marginBottom:3 }}>{event.name}</p>
                        <p style={{ color:'var(--text2)', fontSize:13 }}>
                          📅 {new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'long', year:'numeric' })}{event.dateEnd && event.dateEnd !== event.date && ` → ${new Date(event.dateEnd + 'T12:00:00').toLocaleDateString('it-IT', { day:'numeric', month:'long' })}`}}
                          {event.location && ` · 📍 ${event.location}`}
                        </p>
                        {total > 0 && (
                          <p style={{ color:'var(--text2)', fontSize:12, marginTop:4 }}>
                            {total} articoli · {returned === total ? '✅ tutto rientrato' : `${returned}/${total} rientrati`}
                          </p>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                        <button
                          onClick={() => !isCopying && !isCopied && useAsTemplate(event)}
                          style={{
                            padding:'8px 12px', borderRadius:10, fontSize:12, fontWeight:700,
                            background: isCopied ? 'rgba(52,211,153,0.15)' : 'rgba(79,195,247,0.12)',
                            border: `1px solid ${isCopied ? 'rgba(52,211,153,0.4)' : 'rgba(79,195,247,0.3)'}`,
                            color: isCopied ? 'var(--green)' : 'var(--blue)',
                            opacity: isCopying ? 0.6 : 1,
                            minWidth: 110, textAlign:'center',
                          }}>
                          {isCopied ? '✅ Creato!' : isCopying ? '⏳ Copio...' : '📋 Usa template'}
                        </button>
                        <button
                          onClick={() => deleteArchiveEvent(event)}
                          style={{ padding:'8px 10px', borderRadius:10, fontSize:16, background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.25)', color:'var(--red)' }}>
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* Anteprima articoli */}
                    {total > 0 && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                        <p style={{ color:'var(--text2)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>Lista carico</p>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {items.slice(0, 8).map((item, i) => (
                            <span key={i} style={{ background:'var(--card2)', borderRadius:6, padding:'2px 8px', fontSize:12, color:'var(--text2)' }}>
                              {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                            </span>
                          ))}
                          {items.length > 8 && (
                            <span style={{ background:'var(--card2)', borderRadius:6, padding:'2px 8px', fontSize:12, color:'var(--text2)' }}>
                              +{items.length - 8} altri
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Carica altri — solo se non stiamo filtrando */}
            {!search && hasMore && (
              <div style={{ padding:'8px 16px 16px' }}>
                <button onClick={() => loadEvents(lastDoc)} disabled={loadingMore}
                  className="btn btn-secondary btn-full">
                  {loadingMore ? '⏳ Caricamento...' : 'Carica altri 30 eventi'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
