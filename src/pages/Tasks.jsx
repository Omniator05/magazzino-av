import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'

const PRIORITY_COLORS = {
  alta:   { bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.35)', color:'var(--red)',     label:'🔴 Alta' },
  media:  { bg:'rgba(245,166,35,0.12)',  border:'rgba(245,166,35,0.35)',  color:'var(--accent2)', label:'🟡 Media' },
  bassa:  { bg:'rgba(52,211,153,0.12)',  border:'rgba(52,211,153,0.35)',  color:'var(--green)',   label:'🟢 Bassa' },
}

export default function Tasks() {
  const { user, profile } = useAuth()
  const [tasks, setTasks]       = useState([])
  const [users, setUsers]       = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]         = useState({ title:'', notes:'', priority:'media', assignee:'all' })
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setTasks(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [])

  useEffect(() => {
    // Carica sempre i profili — servono per mostrare i nomi nelle task
    return onSnapshot(collection(db, 'profiles'), snap => {
      setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => u.active !== false))
    })
  }, [])

  // Pulizia automatica task completate: ogni lunedì (giorno dopo domenica)
  // si eliminano tutte le task completate prima di domenica scorsa
  useEffect(() => {
    if (!isAdmin) return
    const CLEANUP_KEY = 'tasks_cleanup_week'
    const now = new Date()
    const weekKey = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}-${now.getDay()}`
    if (now.getDay() !== 1) return // esegui solo di lunedì
    if (localStorage.getItem(CLEANUP_KEY) === weekKey) return // già fatto questa settimana

    // Elimina task completate
    const cleanupDone = async () => {
      const { getDocs, query: q2, where, collection: col } = await import('firebase/firestore')
      const snap = await getDocs(q2(col(db, 'tasks'), where('done', '==', true)))
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'tasks', d.id))))
      localStorage.setItem(CLEANUP_KEY, weekKey)
      console.log(`🧹 Pulizia task: rimosse ${snap.docs.length} task completate`)
    }
    cleanupDone().catch(console.error)
  }, [isAdmin])

  const myTasks = isAdmin
    ? tasks
    : tasks.filter(t => t.assignee === 'all' || t.assignee === user.uid)

  const openTasks = myTasks.filter(t => !t.done)
  const doneTasks = myTasks.filter(t => t.done)

  const createTask = async () => {
    if (!form.title.trim()) return
    await addDoc(collection(db, 'tasks'), {
      title: form.title.trim(),
      notes: form.notes.trim(),
      priority: form.priority,
      assignee: form.assignee,
      done: false,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
    setForm({ title:'', notes:'', priority:'media', assignee:'all' })
    setShowModal(false)
  }

  const toggleDone = async (task) => {
    await updateDoc(doc(db, 'tasks', task.id), {
      done: !task.done,
      doneAt: !task.done ? serverTimestamp() : null,
      doneBy: !task.done ? user.uid : null,
    })
  }

  const deleteTask = async (id) => {
    if (!window.confirm('Eliminare questa task?')) return
    await deleteDoc(doc(db, 'tasks', id))
  }

  const assigneeName = (assignee) => {
    if (assignee === 'all') return 'Tutti'
    const u = users.find(u => u.id === assignee)
    return u?.name || u?.username || 'Sconosciuto'
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1>Task</h1>
            <p>{openTasks.length} da fare{doneTasks.length > 0 ? ` · ${doneTasks.length} completate` : ''}</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ padding:'10px 16px', fontSize:14 }}>
              + Task
            </button>
          )}
        </div>
      </div>

      <div style={{ padding:'16px 0' }}>

        {/* Task aperte */}
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize:40 }}>✅</p>
            <h3>Nessuna task</h3>
            <p>{isAdmin ? 'Crea la prima task per i magazzinieri' : 'Non hai task assegnate'}</p>
          </div>
        ) : (
          <>
            {openTasks.length > 0 && (
              <div style={{ marginBottom:8 }}>
                {openTasks.map(task => (
                  <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                    onToggle={() => toggleDone(task)}
                    onDelete={() => deleteTask(task.id)}
                    assigneeName={assigneeName(task.assignee)}
                  />
                ))}
              </div>
            )}

            {/* Task completate — collassabili */}
            {doneTasks.length > 0 && (
              <details open style={{ marginTop:8 }}>
                <summary style={{ padding:'10px 16px', color:'var(--text2)', fontSize:13, fontWeight:600, cursor:'pointer', listStyle:'none', display:'flex', alignItems:'center', gap:6 }}>
                  <span>▾</span> {doneTasks.length} completate
                </summary>
                <div style={{ opacity:0.6 }}>
                  {doneTasks.map(task => (
                    <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                      onToggle={() => toggleDone(task)}
                      onDelete={() => deleteTask(task.id)}
                      assigneeName={assigneeName(task.assignee)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* Modal crea task */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ position:'relative' }}>
            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            <h2>Nuova task</h2>

            <div className="form-group">
              <label>Descrizione *</label>
              <input value={form.title} onChange={e => setForm({...form, title:e.target.value})}
                placeholder="es. Pulizia filtri Pointe, Controllo cavi..." autoFocus />
            </div>

            <div className="form-group">
              <label>Note (opzionale)</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}
                placeholder="Dettagli aggiuntivi..." rows={2} />
            </div>

            <div className="form-group">
              <label>Priorità</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(PRIORITY_COLORS).map(([key, val]) => (
                  <button key={key} onClick={() => setForm({...form, priority:key})}
                    style={{ flex:1, padding:'9px 6px', borderRadius:10, fontSize:13, fontWeight:700,
                      border: `2px solid ${form.priority === key ? val.border : 'var(--border)'}`,
                      background: form.priority === key ? val.bg : 'var(--card2)',
                      color: form.priority === key ? val.color : 'var(--text2)' }}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Assegna a</label>
              <select value={form.assignee} onChange={e => setForm({...form, assignee:e.target.value})}>
                <option value="all">Tutti i magazzinieri</option>
                {users.filter(u => u.role === 'worker').map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.username}</option>
                ))}
              </select>
            </div>

            <button onClick={createTask} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!form.title.trim()}>
              ✅ Crea task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, isAdmin, onToggle, onDelete, assigneeName }) {
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media

  return (
    <div style={{ margin:'0 16px 10px', background:'var(--card)', border:`1px solid ${task.done ? 'var(--border)' : p.border}`, borderRadius:'var(--radius)', overflow:'hidden' }}>
      {/* Striscia priorità */}
      {!task.done && <div style={{ height:3, background:p.color, opacity:0.6 }} />}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12 }}>
        {/* Checkbox */}
        <button onClick={onToggle}
          style={{ width:26, height:26, borderRadius:8, border:`2px solid ${task.done ? 'var(--green)' : p.color}`, background: task.done ? 'var(--green)' : 'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
          {task.done && <svg viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:15, textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--text2)' : 'var(--text)', marginBottom:3 }}>
            {task.title}
          </p>
          {task.notes && <p style={{ color:'var(--text2)', fontSize:13, marginBottom:4, lineHeight:1.5 }}>{task.notes}</p>}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {!task.done && (
              <span style={{ background:p.bg, color:p.color, border:`1px solid ${p.border}`, borderRadius:6, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                {p.label}
              </span>
            )}
            <span style={{ color:'var(--text2)', fontSize:12 }}>
              👤 {assigneeName}
            </span>
          </div>
        </div>
        {isAdmin && (
          <button onClick={onDelete}
            style={{ background:'transparent', color:'var(--text2)', fontSize:16, padding:'2px 4px', flexShrink:0, opacity:0.6 }}>
            🗑
          </button>
        )}
      </div>
    </div>
  )
}
