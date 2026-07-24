import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import DeleteButton from '../components/DeleteButton'
import BackHomeButton from '../components/BackHomeButton'
import FabButton from '../components/FabButton'
import { Dot, Check, User } from '../components/Icon'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'

const PRIORITY_COLORS = {
  alta:   { bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.35)', color:'var(--red)',     dot:'#f87171', labelKey:'tasks.priorityHigh' },
  media:  { bg:'rgba(245,166,35,0.12)',  border:'rgba(245,166,35,0.35)',  color:'var(--accent2)', dot:'#f5a623', labelKey:'tasks.priorityMedium' },
  bassa:  { bg:'rgba(52,211,153,0.12)',  border:'rgba(52,211,153,0.35)',  color:'var(--green)',   dot:'#34d399', labelKey:'tasks.priorityLow' },
}

export default function Tasks() {
  const { t } = useTranslation()
  const { user, profile, teamId } = useAuth()
  const confirm = useConfirm()
  const [tasks, setTasks]       = useState([])
  const [users, setUsers]       = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [form, setForm]         = useState({ title:'', notes:'', priority:'media', assignee:'all' })
  const isAdmin = profile?.role === 'admin'
  useModalScrollLock(showModal)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'tasks'), where('teamId', '==', teamId), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setTasks(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    // Carica sempre i profili — servono per mostrare i nomi nelle task
    if (!teamId) return
    return onSnapshot(query(collection(db, 'profiles'), where('teamId', '==', teamId)), snap => {
      setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => u.active !== false))
    })
  }, [teamId])

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
      const { getDocs, query: q2, where: w2, collection: col } = await import('firebase/firestore')
      const snap = await getDocs(q2(col(db, 'tasks'), w2('teamId', '==', teamId), w2('done', '==', true)))
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'tasks', d.id))))
      localStorage.setItem(CLEANUP_KEY, weekKey)
      console.log(`🧹 Pulizia task: rimosse ${snap.docs.length} task completate`)
    }
    cleanupDone().catch(console.error)
  }, [isAdmin, teamId])

  const myTasks = isAdmin
    ? tasks
    : tasks.filter(task => task.assignee === 'all' || task.assignee === user.uid || task.createdBy === user.uid)

  const openTasks = myTasks.filter(t => !t.done)
  const doneTasks = myTasks.filter(t => t.done)

  const closeTaskModal = () => { setShowModal(false); setEditingTask(null) }

  const openCreateTask = () => {
    setForm({ title:'', notes:'', priority:'media', assignee:'all' })
    setEditingTask(null)
    setShowModal(true)
  }

  const openEditTask = (task) => {
    setForm({ title: task.title, notes: task.notes || '', priority: task.priority, assignee: task.assignee })
    setEditingTask(task)
    setShowModal(true)
  }

  const saveTask = async () => {
    if (!form.title.trim()) return
    if (editingTask) {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        title: form.title.trim(),
        notes: form.notes.trim(),
        priority: form.priority,
        assignee: form.assignee,
      })
    } else {
      await addDoc(collection(db, 'tasks'), {
        title: form.title.trim(),
        notes: form.notes.trim(),
        priority: form.priority,
        teamId,
        assignee: form.assignee,
        done: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile?.name || profile?.username || t('tasks.defaultCreatorName'),
        createdByRole: profile?.role || 'worker',
      })
    }
    setForm({ title:'', notes:'', priority:'media', assignee:'all' })
    setEditingTask(null)
    setShowModal(false)
  }

  const taskDrag = useModalDrag(closeTaskModal, undefined, saveTask, showModal)

  const toggleDone = async (task) => {
    await updateDoc(doc(db, 'tasks', task.id), {
      done: !task.done,
      doneAt: !task.done ? serverTimestamp() : null,
      doneBy: !task.done ? user.uid : null,
    })
  }

  const deleteTask = async (id) => {
    if (!(await confirm({ title: t('tasks.confirmDeleteTitle'), message: t('tasks.confirmDeleteMessage'), confirmLabel: t('tasks.confirmDeleteLabel'), danger: true }))) return
    await deleteDoc(doc(db, 'tasks', id))
  }

  const assigneeName = (assignee) => {
    if (assignee === 'all') return t('tasks.allAssignee')
    const u = users.find(u => u.id === assignee)
    return u?.name || u?.username || t('common.unknown')
  }

  return (
    <div className="page">
      {isAdmin ? (
        <div className="page-header">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <BackHomeButton />
            <h1>{t('tasks.title')}</h1>
          </div>
          <p style={{ marginTop:4, textAlign:'right' }}>{t('tasks.toDoCount', { count: openTasks.length })}{doneTasks.length > 0 ? t('tasks.doneSuffix', { count: doneTasks.length }) : ''}</p>
        </div>
      ) : (
        <div className="page-header">
          <h1>{t('tasks.title')}</h1>
          <p>{t('tasks.toDoCount', { count: openTasks.length })}{doneTasks.length > 0 ? t('tasks.doneSuffix', { count: doneTasks.length }) : ''}</p>
        </div>
      )}

      <div style={{ padding:'16px 0' }}>

        {/* Task aperte */}
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><Check size={40} /></p>
            <h3>{t('tasks.emptyTitle')}</h3>
            <p>{isAdmin ? t('tasks.emptyDescAdmin') : t('tasks.emptyDescWorker')}</p>
          </div>
        ) : (
          <>
            {openTasks.length > 0 && (
              <div style={{ marginBottom:8 }}>
                {openTasks.map(task => (
                  <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                    canEdit={isAdmin || task.createdBy === user.uid}
                    onToggle={() => toggleDone(task)}
                    onDelete={() => deleteTask(task.id)}
                    onEdit={() => openEditTask(task)}
                    assigneeName={assigneeName(task.assignee)}
                  />
                ))}
              </div>
            )}

            {/* Task completate — collassabili */}
            {doneTasks.length > 0 && (
              <details open style={{ marginTop:8 }}>
                <summary style={{ padding:'10px 16px', color:'var(--text2)', fontSize:13, fontWeight:600, cursor:'pointer', listStyle:'none', display:'flex', alignItems:'center', gap:6 }}>
                  <span>▾</span> {t('tasks.doneCount', { count: doneTasks.length })}
                </summary>
                <div style={{ opacity:0.6 }}>
                  {doneTasks.map(task => (
                    <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                      canEdit={isAdmin || task.createdBy === user.uid}
                      onToggle={() => toggleDone(task)}
                      onDelete={() => deleteTask(task.id)}
                      onEdit={() => openEditTask(task)}
                      assigneeName={assigneeName(task.assignee)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <FabButton onClick={openCreateTask} ariaLabel={t('tasks.newButton')} />

      {/* Modal crea/modifica task */}
      {showModal && (
        <div className={`modal-overlay${taskDrag.closing ? ' closing' : ''}`} onClick={taskDrag.onOverlayClick}>
          <div className={`modal${taskDrag.jiggling ? ' modal-jiggle' : ''}${taskDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...taskDrag.props}>
            <button className="close-btn" onClick={taskDrag.close}>✕</button>
            <h2>{editingTask ? t('tasks.editTaskTitle') : (isAdmin ? t('tasks.newTaskTitle') : t('tasks.addTaskTitle'))}</h2>

            <div className="form-group">
              <label>{t('tasks.descriptionLabel')}</label>
              <input value={form.title} onChange={e => setForm({...form, title:e.target.value})}
                placeholder={t('tasks.descriptionPlaceholder')} autoFocus />
            </div>

            <div className="form-group">
              <label>{t('tasks.notesOptional')}</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}
                placeholder={t('tasks.notesPlaceholder')} rows={2} />
            </div>

            <div className="form-group">
              <label>{t('tasks.priorityLabel')}</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(PRIORITY_COLORS).map(([key, val]) => (
                  <button key={key} onClick={() => setForm({...form, priority:key})}
                    style={{ flex:1, padding:'9px 6px', borderRadius:10, fontSize:13, fontWeight:700,
                      border: `2px solid ${form.priority === key ? val.border : 'var(--border)'}`,
                      background: form.priority === key ? val.bg : 'var(--card2)',
                      color: form.priority === key ? val.color : 'var(--text2)',
                      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <Dot size={8} color={val.dot} /> {t(val.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {isAdmin ? (
              <div className="form-group">
                <label>{t('tasks.assignToLabel')}</label>
                <select value={form.assignee} onChange={e => setForm({...form, assignee:e.target.value})}>
                  <option value="all">{t('tasks.allWorkers')}</option>
                  {users.filter(u => u.role === 'worker').map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.username}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>{t('tasks.visibleToLabel')}</label>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={() => setForm({...form, assignee:'all'})}
                    style={{ flex:1, padding:'9px 6px', borderRadius:10, fontSize:13, fontWeight:700,
                      border: `2px solid ${form.assignee === 'all' ? 'var(--accent)' : 'var(--border)'}`,
                      background: form.assignee === 'all' ? 'rgba(230,57,70,0.10)' : 'var(--card2)',
                      color: form.assignee === 'all' ? 'var(--accent)' : 'var(--text2)' }}>
                    {t('tasks.wholeTeam')}
                  </button>
                  <button type="button" onClick={() => setForm({...form, assignee:user.uid})}
                    style={{ flex:1, padding:'9px 6px', borderRadius:10, fontSize:13, fontWeight:700,
                      border: `2px solid ${form.assignee === user.uid ? 'var(--accent)' : 'var(--border)'}`,
                      background: form.assignee === user.uid ? 'rgba(230,57,70,0.10)' : 'var(--card2)',
                      color: form.assignee === user.uid ? 'var(--accent)' : 'var(--text2)' }}>
                    {t('tasks.onlyMe')}
                  </button>
                </div>
              </div>
            )}

            <button onClick={saveTask} className="btn btn-primary btn-full" style={{ marginTop:8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}
              disabled={!form.title.trim()}>
              <Check size={16} /> {editingTask ? t('tasks.saveChanges') : (isAdmin ? t('tasks.createTask') : t('tasks.addTask'))}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, isAdmin, canEdit, onToggle, onDelete, onEdit, assigneeName }) {
  const { t } = useTranslation()
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media

  return (
    <div
      onClick={canEdit ? onEdit : undefined}
      style={{ margin:'0 16px 10px', background:'var(--card)', border:`1px solid ${task.done ? 'var(--border)' : p.border}`, borderRadius:'var(--radius)', overflow:'hidden', cursor: canEdit ? 'pointer' : 'default' }}>
      {/* Striscia priorità */}
      {!task.done && <div style={{ height:3, background:p.color, opacity:0.6 }} />}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12 }}>
        {/* Checkbox */}
        <button onClick={e => { e.stopPropagation(); onToggle() }}
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
              <span style={{ background:p.bg, color:p.color, border:`1px solid ${p.border}`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:5 }}>
                <Dot size={7} color={p.dot} /> {t(p.labelKey)}
              </span>
            )}
            <span style={{ color:'var(--text2)', fontSize:12, display:'inline-flex', alignItems:'center', gap:4 }}>
              <User size={12} /> {assigneeName}
            </span>
            {task.createdByName && isAdmin && (task.createdByRole === 'worker' || task.assignee === task.createdBy) && (
              <span style={{ background:'rgba(79,195,247,0.1)', color:'var(--blue)', border:'1px solid rgba(79,195,247,0.2)', borderRadius:6, padding:'1px 7px', fontSize:11, fontWeight:600 }}>
                {t('tasks.createdBy', { name: task.createdByName })}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <DeleteButton onClick={e => { e.stopPropagation(); onDelete() }} size={32} />
        )}
      </div>
    </div>
  )
}
