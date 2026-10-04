import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'
import { Calendar, Clock, User, FileText } from './Icon'

// Riepilogo di un task libero creato nella timeline "Assegna personale"
// (assignmentBlocks senza eventId) — stessa famiglia visiva di
// EventSummaryModal.jsx, ma niente location/responsabile (il task non li
// ha) e niente shortcut alla lista di carico (non è un evento Roadcase).
export default function TaskSummaryModal({ block, workers, onClose }) {
  const { t, i18n } = useTranslation()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)

  const assignedName = block.workerId
    ? (workers.find(w => w.id === block.workerId)?.name || t('common.unknown'))
    : block.externalWorkerName

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
          {assignedName ? (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700, color:'var(--blue)' }}>
              <User size={11} /> {assignedName}
            </span>
          ) : (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>{t('calendar.noneAssigned')}</p>
          )}
        </Row>
        {block.description && (
          <Row icon={<FileText size={15} />} label={t('staffTimeline.taskDescriptionLabel')}>
            <p style={{ fontSize:14, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{block.description}</p>
          </Row>
        )}
      </div>
    </div>
  )
}
