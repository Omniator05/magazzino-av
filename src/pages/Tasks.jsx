import { useState, useEffect, useRef } from 'react'
import { useOperator } from '../context/OperatorContext'
import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, serverTimestamp } from 'firebase/firestore'
import PageHeader from '../components/PageHeader'
import FabButton from '../components/FabButton'
import { Dot, Check, User } from '../components/Icon'
import { PersonAvatar } from '../components/AssigneeAvatars'
import { formatDate } from '../utils/formatDate'
import { useIsMobile } from '../hooks/useIsMobile'
import { doneFeedback } from '../utils/feedback'
import SaveButton from '../components/SaveButton'
import DailyQuip from '../components/DailyQuip'
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
  // Postazione magazzino: completare una task richiede il badge, e chi l'ha completata è l'operatore.
  const { operator, requireOperator } = useOperator()
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

  // Spuntando una task la card resta dov'è per un momento, così si vedono la spunta e la linea che si disegnano,
  // e solo dopo passa all'altra sezione (`hold` ricorda in quale sezione era prima del tocco).
  const [hold, setHold] = useState({})
  const inDone = t => (t.id in hold ? hold[t.id] : !!t.done)
  const openTasks = myTasks.filter(t => !inDone(t))
  const doneTasks = myTasks.filter(t => inDone(t))

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

  // Ritorna true solo se ha davvero salvato — SaveButton mostra la spunta e
  // chiude solo in quel caso (mai sul ramo che si ferma per titolo vuoto).
  const saveTask = async () => {
    if (!form.title.trim()) return false
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
    return true
  }

  // Invio da tastiera (Enter): stesso salvataggio, ma senza passare dal
  // bottone — chiude comunque con l'animazione invece che di scatto.
  const submitTaskForm = async () => {
    const ok = await saveTask()
    if (ok) { taskGuard.skip(); taskDrag.close() }
  }
  // Colonna con modulo: chiude col clic fuori solo se non è cambiato nulla, altrimenti chiede se salvare
  const taskBase = useRef('')
  const taskGuard = useUnsavedGuard(() => showModal && JSON.stringify(form) !== taskBase.current)
  const taskDrag = useModalDrag(closeTaskModal, taskGuard.guard, submitTaskForm, showModal)
  taskGuard.attach(taskDrag)
  useEffect(() => { if (showModal) taskBase.current = JSON.stringify(form) }, [showModal])   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDone = async (task) => {
    if (!requireOperator()) return
    setHold(h => ({ ...h, [task.id]: !!task.done }))
    if (!task.done) doneFeedback({ sound: !!profile?.isStation })
    setTimeout(() => setHold(h => { const n = { ...h }; delete n[task.id]; return n }), 1300)
    await updateDoc(doc(db, 'tasks', task.id), {
      done: !task.done,
      doneAt: !task.done ? serverTimestamp() : null,
      // Sempre chi l'ha completata (alla postazione l'operatore del badge), così si vede nella card.
      doneBy: !task.done ? (operator?.userId || user.uid) : null,
      doneByName: !task.done ? (operator?.name || profile?.name || profile?.username || '') : null,
    })
  }

  const deleteTask = async (id) => {
    if (!(await confirm({ title: t('tasks.confirmDeleteTitle'), message: t('tasks.confirmDeleteMessage'), confirmLabel: t('tasks.confirmDeleteLabel'), danger: true }))) return false
    await deleteDoc(doc(db, 'tasks', id))
    return true
  }

  // Chi l'ha completata: il nome salvato, oppure (per le vecchie) quello del profilo.
  const doneByName = (task) => task.doneByName || users.find(u => u.id === task.doneBy)?.name || ''

  const assigneeName = (assignee) => {
    if (assignee === 'all') return t('tasks.allAssignee')
    const u = users.find(u => u.id === assignee)
    return u?.name || u?.username || t('common.unknown')
  }

  return (
    <div className="page" style={{ background:'var(--surface)' }}>
      <PageHeader title={t('tasks.title')} backTo={isAdmin ? '/' : undefined}
        subtitle={`${t('tasks.toDoCount', { count: openTasks.length })}${doneTasks.length > 0 ? t('tasks.doneSuffix', { count: doneTasks.length }) : ''}`} />

      <div style={{ padding:'18px 0 110px' }}>

        {/* Task aperte */}
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <div className="empty-state">
            <p style={{ color:'var(--text3)', marginBottom:4 }}><Check size={40} /></p>
            <h3>{t('tasks.emptyTitle')}</h3>
            <p>{isAdmin ? t('tasks.emptyDescAdmin') : t('tasks.emptyDescWorker')}</p>
            <DailyQuip quips={t('tasks.emptyQuips', { returnObjects:true })} />
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
                    doneByName={doneByName(task)}
                  />
                ))}
              </div>
            )}

            {/* Task completate — collassabili */}
            {doneTasks.length > 0 && (
              <details open style={{ marginTop:8 }}>
                <summary style={{ padding:'10px 20px', color:'var(--c-ink3)', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', cursor:'pointer', listStyle:'none', display:'flex', alignItems:'center', gap:6 }}>
                  <span>▾</span> {t('tasks.doneCount', { count: doneTasks.length })}
                </summary>
                <div>
                  {doneTasks.map(task => (
                    <TaskCard key={task.id} task={task} isAdmin={isAdmin}
                      canEdit={isAdmin || task.createdBy === user.uid}
                      onToggle={() => toggleDone(task)}
                      onDelete={() => deleteTask(task.id)}
                      onEdit={() => openEditTask(task)}
                      assigneeName={assigneeName(task.assignee)}
                      doneByName={doneByName(task)}
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
        <div className={`modal-overlay rc-drawer-overlay${taskDrag.closing ? ' closing' : ''}`} onClick={e => { if (e.target === e.currentTarget) taskDrag.close() }}>
          <div className={`modal rc-sheet rc-drawer rc-drawer-narrow${taskDrag.jiggling ? ' modal-jiggle' : ''}${taskDrag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...taskDrag.props}>
            <div className="rc-drawer-head rc-dc"><div className="rc-drawer-titlebar rc-dc">
              <button className="close-btn" onClick={taskDrag.close}>✕</button>
              <h2>{editingTask ? t('tasks.editTaskTitle') : (isAdmin ? t('tasks.newTaskTitle') : t('tasks.addTaskTitle'))}</h2>
            </div></div>

            <div className="rc-drawer-body rc-dc">
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
                  {users.filter(u => u.role === 'worker' && !u.isStation).map(u => (
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

            </div>

            <div className="rc-drawer-foot rc-dc">
            <SaveButton onSave={saveTask} onDone={() => { taskGuard.skip(); taskDrag.close() }} onError={taskDrag.triggerJiggle} className="btn btn-primary btn-full" style={{ marginTop:8 }}
              disabled={!form.title.trim()}>
              <Check size={16} /> {editingTask ? t('tasks.saveChanges') : (isAdmin ? t('tasks.createTask') : t('tasks.addTask'))}
            </SaveButton>
            {editingTask && isAdmin && (
              <button type="button" className="btn btn-red btn-full" style={{ marginTop:10 }}
                onClick={async () => { const id = editingTask.id; if (await deleteTask(id)) { taskGuard.skip(); taskDrag.close() } }}>
                {t('tasks.menuDelete')}
              </button>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Riga compatta: casella per completare, titolo, a chi è assegnata, priorità (pallino) e menu "⋮" con Modifica /
// Elimina. Da completata resta una sola riga in più: "Completata da … · data e ora".
function TaskCard({ task, isAdmin, canEdit, onToggle, onDelete, onEdit, assigneeName, doneByName }) {
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media
  const everyone = task.assignee === 'all'
  const doneAt = task.doneAt?.toDate ? formatDate(task.doneAt.toDate(), { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }, i18n.language) : ''
  // Telefono: niente "⋮", si tocca la card (non la casella) per modificarla e, da admin, eliminarla.
  // Computer: solo il "⋮" apre Modifica / Elimina, un clic sulla card non fa nulla.
  const hasMenu = !isMobile && (canEdit || isAdmin)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const stop = e => e.stopPropagation()
  const item = { width:'100%', textAlign:'left', padding:'11px 14px', fontSize:14, fontWeight:600, background:'transparent', color:'var(--c-ink)', display:'block' }

  return (
    <div
      className="tk-row"
      onClick={isMobile && canEdit ? onEdit : undefined}
      style={{ position:'relative', margin:'0 18px 10px', background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:18, padding: isMobile ? '12px 14px' : '12px 10px 12px 14px', display:'flex', alignItems:'center', gap:12, cursor: isMobile && canEdit ? 'pointer' : 'default' }}>
      <button type="button" className="btn-no-anim tk-box" onClick={e => { stop(e); onToggle() }}
        aria-label={task.done ? t('activities.reopen') : t('activities.complete')} aria-pressed={!!task.done}
        style={{ width:26, height:26, borderRadius:8, flexShrink:0, border:`2px solid ${task.done ? '#2f9e5b' : 'var(--c-ink3)'}`, background: task.done ? '#2f9e5b' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
        {/* La spunta si disegna piano (da pathLength 1 a 0 di scarto) */}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path className="tk-check" d="M5 12.5l4.5 4.5L19 7" pathLength="1" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 1, strokeDashoffset: task.done ? 0 : 1, opacity: task.done ? 1 : 0 }} />
        </svg>
      </button>

      <div style={{ flex:'1 1 150px', minWidth:0 }}>
        <p style={{ margin:0, fontWeight:700, fontSize:15, overflowWrap:'anywhere' }}>
          <span className="tk-title" data-done={task.done ? 1 : 0} style={{ color: task.done ? 'var(--c-ink3)' : 'var(--c-ink)' }}>{task.title}</span>
        </p>
        {task.done ? (
          <p className="tk-fade" style={{ margin:'3px 0 0', fontSize:12, fontWeight:700, color:'#2f9e5b' }}>
            {t('activities.doneBy', { name: doneByName || t('common.unknown') })}{doneAt ? ` · ${doneAt}` : ''}
          </p>
        ) : task.notes ? (
          <p style={{ margin:'3px 0 0', fontSize:12.5, color:'var(--c-ink2)', lineHeight:1.4, whiteSpace:'pre-wrap' }}>{task.notes}</p>
        ) : null}
        {task.createdByName && isAdmin && !task.done && (task.createdByRole === 'worker' || task.assignee === task.createdBy) && (
          <p style={{ margin:'3px 0 0', fontSize:11.5, fontWeight:600, color:'var(--c-ink3)' }}>{t('tasks.createdBy', { name: task.createdByName })}</p>
        )}
      </div>

      {/* Telefono: solo il pallino con le iniziali (il nome sta nel titolo al tocco), così il titolo ha spazio */}
      <span title={assigneeName} style={{ display:'inline-flex', alignItems:'center', gap:6, flexShrink:0, maxWidth:132, ...(isMobile ? {} : { background:'var(--c-alt, var(--c-fill))', border:'1px solid var(--c-line)', borderRadius:20, padding: everyone ? '4px 10px' : '3px 10px 3px 4px' }), fontSize:12, fontWeight:700, color:'var(--c-ink)' }}>
        {everyone ? <User size={isMobile ? 16 : 12} /> : <PersonAvatar person={{ id: task.assignee, name: assigneeName }} size={isMobile ? 26 : 20} />}
        {!isMobile && <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{assigneeName}</span>}
      </span>

      {!task.done && (
        <span role="img" aria-label={t(p.labelKey)} title={t(p.labelKey)} style={{ width:11, height:11, borderRadius:'50%', background:p.dot, flexShrink:0 }} />
      )}

      {hasMenu && (
        <div style={{ position:'relative', flexShrink:0 }} onPointerDown={stop}>
          <button type="button" className="btn-no-anim" onClick={e => { stop(e); setMenuOpen(o => !o) }} aria-label={t('tasks.menuLabel')} aria-expanded={menuOpen}
            style={{ width:36, height:36, borderRadius:10, background:'transparent', color:'var(--c-ink2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
          </button>
          {menuOpen && (
            <div role="menu" onClick={stop} style={{ position:'absolute', top:'calc(100% + 4px)', right:0, minWidth:150, zIndex:30, background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.14)', overflow:'hidden' }}>
              {canEdit && <button role="menuitem" type="button" className="btn-no-anim" style={item} onClick={() => { setMenuOpen(false); onEdit() }}>{t('tasks.menuEdit')}</button>}
              {isAdmin && <button role="menuitem" type="button" className="btn-no-anim" style={{ ...item, color:'var(--red)', borderTop: canEdit ? '1px solid var(--c-line)' : 'none' }} onClick={() => { setMenuOpen(false); onDelete() }}>{t('tasks.menuDelete')}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
