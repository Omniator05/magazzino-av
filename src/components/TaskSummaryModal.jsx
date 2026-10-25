import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'
import { Calendar, Clock, User, FileText, List, Check } from './Icon'
import { PersonAvatar } from './AssigneeAvatars'
import { useAuth } from '../context/AuthContext'

// Riepilogo di un task libero creato nella timeline "Assegna personale"
// (assignmentBlocks senza eventId) — stessa famiglia visiva di
// EventSummaryModal.jsx, ma niente location/responsabile (il task non li
// ha) e niente shortcut alla lista di carico (non è un evento Roadcase).
// Righe di dettaglio di un'attività: usate sia dal modal (telefono) sia dalla
// colonna laterale del Calendario (desktop).
export function TaskSummaryBody({ block, workers }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  // block.assigned: array dei blocchi dello stesso taskGroupId (vedi
  // tasksByDate in Calendar.jsx) — più persone collegate alla stessa
  // attività, non più un solo assegnato per forza.
  const assignedPeople = []
  ;(block.assigned || []).forEach(b => {
    const name = b.workerId ? (workers.find(w => w.id === b.workerId)?.name || t('common.unknown')) : b.externalWorkerName
    const id = b.workerId || b.externalWorkerId || name
    if (name && !assignedPeople.some(p => p.id === id)) assignedPeople.push({ id, name, me: !!b.workerId && b.workerId === user?.uid })
  })
  // Chi guarda sta in cima, con il tag "Tu".
  assignedPeople.sort((a, b) => Number(b.me) - Number(a.me))

  const Row = ({ icon, label, children }) => (
    <div style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--c-line)' }}>
      <span style={{ flexShrink:0, color:'var(--c-ink3)', display:'flex', marginTop:2 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:11, fontWeight:800, color:'var(--c-ink3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>{label}</p>
        {children}
      </div>
    </div>
  )

  return (
    <>
      <Row icon={<Calendar size={15} />} label={t('eventDetail.dateFieldLabel')}>
        <p style={{ fontSize:14, fontWeight:600, color:'var(--c-ink)' }}>
          {capitalize(formatDate(block.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long', year:'numeric' }, i18n.language))}
        </p>
      </Row>
      <Row icon={<Clock size={15} />} label={t('eventSummary.timeLabel')}>
        <p style={{ fontSize:14, fontWeight:600, color:'var(--c-ink)' }}>{block.startTime} – {block.endTime}</p>
      </Row>
      <Row icon={<User size={15} />} label={t('eventSummary.assignedLabel')}>
        {assignedPeople.length > 0 ? (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {assignedPeople.map(p => (
              <span key={p.id} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'var(--c-surface)', border:'1px solid var(--c-line)', borderRadius:20, padding:'3px 10px 3px 4px', fontSize:12, fontWeight:700, color:'var(--c-ink)' }}>
                <PersonAvatar person={p} size={20} /> {p.name} {p.me && <span style={{ fontSize:10, fontWeight:800, color:'var(--accent)', background:'rgba(230,57,70,0.12)', borderRadius:6, padding:'1px 6px' }}>{t('eventSummary.you')}</span>}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize:13, color:'var(--c-ink3)', fontStyle:'italic' }}>{t('calendar.noneAssigned')}</p>
        )}
      </Row>
      {(block.assigned || []).some(b => b.done) && (() => {
        const d = block.assigned.find(b => b.done)
        const at = d.doneAt?.toDate ? formatDate(d.doneAt.toDate(), { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }, i18n.language) : ''
        return (
          <Row icon={<Check size={15} />} label={t('activities.doneTag')}>
            <p style={{ fontSize:14, fontWeight:700, color:'#2f9e5b' }}>{t('activities.doneBy', { name: d.doneByName || t('common.unknown') })}{at ? ` · ${at}` : ''}</p>
          </Row>
        )
      })()}
      {block.note && (
        <Row icon={<FileText size={15} />} label={t('staffTimeline.personNoteLabel')}>
          <p style={{ fontSize:14, color:'var(--c-ink)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{block.note}</p>
        </Row>
      )}
      {block.description && (
        <Row icon={<FileText size={15} />} label={t('staffTimeline.taskDescriptionLabel')}>
          <p style={{ fontSize:14, color:'var(--c-ink)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{block.description}</p>
        </Row>
      )}
      {block.linkedEventId && (
        <button type="button" onClick={() => navigate(`/events/${block.linkedEventId}${block.linkedListId ? `?list=${block.linkedListId}` : ''}`)}
          className="btn-no-anim" style={{ width:'100%', marginTop:20, padding:'14px 12px', borderRadius:13, background:'#e63946', color:'#fff', fontSize:14.5, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <List size={16} /> {t('workerHome.openLinkedList')}
        </button>
      )}
    </>
  )
}

export default function TaskSummaryModal({ block, workers, onClose }) {
  const { t } = useTranslation()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal rc-sheet${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...drag.props}>
        <button className="close-btn" onClick={drag.close} aria-label={t('common.close')}>✕</button>
        <h2>{block.label || t('staffTimeline.untitledTask')}</h2>

        <TaskSummaryBody block={block} workers={workers} />
      </div>
    </div>
  )
}
