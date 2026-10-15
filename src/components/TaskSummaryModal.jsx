import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'
import { Calendar, Clock, User, FileText, List } from './Icon'

// Riepilogo di un task libero creato nella timeline "Assegna personale"
// (assignmentBlocks senza eventId) — stessa famiglia visiva di
// EventSummaryModal.jsx, ma niente location/responsabile (il task non li
// ha) e niente shortcut alla lista di carico (non è un evento Roadcase).
export default function TaskSummaryModal({ block, workers, onClose }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)

  // block.assigned: array dei blocchi dello stesso taskGroupId (vedi
  // tasksByDate in Calendar.jsx) — più persone collegate alla stessa
  // attività, non più un solo assegnato per forza.
  const assignedNames = (block.assigned || [])
    .map(b => b.workerId ? (workers.find(w => w.id === b.workerId)?.name || t('common.unknown')) : b.externalWorkerName)
    .filter(Boolean)

  const Row = ({ icon, label, children }) => (
    <div style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ flexShrink:0, color:'var(--text2)', display:'flex', marginTop:2 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:2 }}>{label}</p>
        {children}
      </div>
    </div>
  )

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...drag.props}>
        <button className="close-btn" onClick={drag.close} aria-label={t('common.close')}>✕</button>
        <h2>{block.label || t('staffTimeline.untitledTask')}</h2>

        <Row icon={<Calendar size={15} />} label={t('eventDetail.dateFieldLabel')}>
          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>
            {capitalize(formatDate(block.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long', year:'numeric' }, i18n.language))}
          </p>
        </Row>
        <Row icon={<Clock size={15} />} label={t('eventSummary.timeLabel')}>
          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{block.startTime} – {block.endTime}</p>
        </Row>
        <Row icon={<User size={15} />} label={t('eventSummary.assignedLabel')}>
          {assignedNames.length > 0 ? (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {assignedNames.map(name => (
                <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700, color:'var(--blue)' }}>
                  <User size={11} /> {name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>{t('calendar.noneAssigned')}</p>
          )}
        </Row>
        {block.note && (
          <Row icon={<FileText size={15} />} label={t('staffTimeline.personNoteLabel')}>
            <p style={{ fontSize:14, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{block.note}</p>
          </Row>
        )}
        {block.description && (
          <Row icon={<FileText size={15} />} label={t('staffTimeline.taskDescriptionLabel')}>
            <p style={{ fontSize:14, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{block.description}</p>
          </Row>
        )}
        {block.linkedEventId && (
          <button type="button" onClick={() => navigate(`/events/${block.linkedEventId}${block.linkedListId ? `?list=${block.linkedListId}` : ''}`)}
            className="btn btn-primary" style={{ width:'100%', marginTop:16, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <List size={16} /> {t('workerHome.openLinkedList')}
          </button>
        )}
      </div>
    </div>
  )
}
