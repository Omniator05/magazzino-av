import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'

// Gli eventi sono in una collezione GLOBALE condivisa, non per utente
// In questo modo i magazzinieri possono vederli
export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name:'', date:'', location:'', notes:'' })
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.date >= today)
  const past = events.filter(e => e.date < today)

  const addEvent = async () => {
    if (!form.name.trim() || !form.date) return
    await addDoc(collection(db, 'events'), {
      ...form, items:[], createdAt: serverTimestamp(), createdBy: user.uid
    })
    setShowModal(false)
    setForm({ name:'', date:'', location:'', notes:'' })
  }

  const deleteEvent = async (e, id) => {
    e.stopPropagation()
    if (confirm('Eliminare questo evento e tutta la lista di carico?')) {
      await deleteDoc(doc(db, 'events', id))
    }
  }

  const EventCard = ({ event }) => {
    const items = event.items || []
    const loaded = items.filter(i => i.loaded).length
    const returned = items.filter(i => i.returned).length
    const total = items.length
    const isToday = event.date === today

    let statusColor = 'var(--text2)'
    let statusText = 'Lista vuota'
    if (total > 0) {
      if (returned === total) { statusColor = 'var(--green)'; statusText = '✅ Tutto rientrato' }
      else if (loaded === total) { statusColor = 'var(--accent2)'; statusText = `In evento · ${returned}/${total} rientrati` }
      else if (loaded > 0) { statusColor = 'var(--accent2)'; statusText = `Carico in corso · ${loaded}/${total}` }
      else { statusColor = 'var(--text2)'; statusText = `${total} articoli in lista` }
    }

    return (
      <div className="event-card" onClick={() => navigate(`/events/${event.id}`)} style={{ cursor:'pointer' }}>
        {isToday && (
          <div style={{ background:'rgba(233,69,96,0.15)', padding:'6px 16px', borderBottom:'1px solid rgba(233,69,96,0.2)' }}>
            <p style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>🔴 OGGI</p>
          </div>
        )}
        <div className="event-card-header">
          <div>
            <h3>{event.name}</h3>
            <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>
              📅 {new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
              {event.location && ` · 📍 ${event.location}`}
            </p>
          </div>
          <button onClick={e => deleteEvent(e, event.id)} style={{ background:'transparent', color:'var(--text2)', fontSize:18, padding:'4px 8px' }}>🗑</button>
        </div>
        <div style={{ padding:'10px 16px' }}>
          {total > 0 && (
            <div style={{ background:'var(--card2)', borderRadius:4, height:4, marginBottom:8 }}>
              <div style={{ background: returned === total ? 'var(--green)' : 'var(--accent2)', height:'100%', borderRadius:4, width:`${(Math.max(loaded, returned)/total)*100}%`, transition:'width 0.3s' }} />
            </div>
          )}
          <p style={{ color:statusColor, fontSize:13, fontWeight:600 }}>{statusText}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Eventi</h1><p>{upcoming.length} prossimi · {past.length} passati</p></div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Evento</button>
        </div>
      </div>

      <div style={{ padding:'16px 0 0' }}>
        {upcoming.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi</p>
            {upcoming.map(ev => <EventCard key={ev.id} event={ev} />)}
          </>
        )}
        {past.length > 0 && (
          <>
            <p style={{ padding:'16px 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Passati</p>
            {past.map(ev => <EventCard key={ev.id} event={ev} />)}
          </>
        )}
        {events.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            <h3>Nessun evento</h3>
            <p>Crea il primo evento per gestire i carichi</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>Nuovo evento</h2>
            <div className="form-group"><label>Nome evento *</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Matrimonio Rossi" /></div>
            <div className="form-group"><label>Data *</label><input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} /></div>
            <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="es. Villa Belvedere, Verona" /></div>
            <div className="form-group"><label>Note</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Dettagli evento..." rows={2} /></div>
            <button onClick={addEvent} className="btn btn-primary btn-full" style={{ marginTop:8 }}>✅ Crea evento</button>
          </div>
        </div>
      )}
    </div>
  )
}
