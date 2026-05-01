import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name:'', date:'', location:'', notes:'' })
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.date >= today)
  const past = events.filter(e => e.date < today)

  const addEvent = async () => {
    if (!form.name.trim() || !form.date) return
    await addDoc(collection(db, 'users', user.uid, 'events'), { ...form, items:[], createdAt: serverTimestamp() })
    setShowModal(false)
    setForm({ name:'', date:'', location:'', notes:'' })
  }

  const deleteEvent = async (e, id) => {
    e.stopPropagation()
    if (confirm('Eliminare questo evento?')) await deleteDoc(doc(db, 'users', user.uid, 'events', id))
  }

  const EventCard = ({ event }) => {
    const done = event.items?.filter(i => i.checked).length || 0
    const total = event.items?.length || 0
    const isOut = event.items?.some(i => !i.checked) && total > 0
    const statusColor = total === 0 ? 'var(--text2)' : done === total ? 'var(--green)' : 'var(--accent2)'

    return (
      <div className="event-card" onClick={() => navigate(`/events/${event.id}`)} style={{ cursor:'pointer' }}>
        <div className="event-card-header">
          <div>
            <h3>{event.name}</h3>
            <p style={{ color:'var(--text2)', fontSize:13, marginTop:3 }}>
              📅 {new Date(event.date).toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
              {event.location && ` • 📍 ${event.location}`}
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {total > 0 && <span style={{ fontSize:12, color:statusColor, fontWeight:700 }}>{done}/{total}</span>}
            <button onClick={e => deleteEvent(e, event.id)} style={{ background:'transparent', color:'var(--text2)', fontSize:18, padding:'4px 8px' }}>🗑</button>
          </div>
        </div>
        {total > 0 && (
          <div style={{ padding:'10px 16px' }}>
            <div style={{ background:'var(--card2)', borderRadius:4, height:4 }}>
              <div style={{ background:statusColor, height:'100%', borderRadius:4, width:`${(done/total)*100}%`, transition:'width 0.3s' }} />
            </div>
            <p style={{ color:'var(--text2)', fontSize:12, marginTop:6 }}>{done === total ? '✅ Tutto rientrato' : `${total - done} articoli ancora fuori`}</p>
          </div>
        )}
        {total === 0 && <div style={{ padding:'10px 16px' }}><p style={{ color:'var(--text2)', fontSize:13 }}>Nessun articolo in lista · Tocca per gestire</p></div>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><h1>Eventi</h1><p>{upcoming.length} prossimi, {past.length} passati</p></div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>+ Evento</button>
        </div>
      </div>

      <div style={{ padding:'16px 0 0' }}>
        {upcoming.length > 0 && (
          <>
            <p style={{ padding:'0 16px 10px', color:'var(--text2)', fontSize:13, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Prossimi eventi</p>
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
            <div className="form-group"><label>Nome evento *</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="es. Matrimonio Rossi - Villa Belvedere" /></div>
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
