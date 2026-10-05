import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'
import { Calendar, Clock, Pin, User, Phone, Mail, FileText, List, Wrench } from './Icon'

// Riepilogo rapido di un evento già esistente — stesso richiamo sia dal
// calendario "normale" (tap su un evento nell'elenco del giorno) sia dalla
// timeline "Assegna personale" (tap su un blocco evento/fase). Solo lettura
// + lo shortcut per la lista di carico vera e propria: non duplica il form
// di modifica, che resta quello esistente (penna nell'elenco del giorno).
export default function EventSummaryModal({ event, workers, date, blocks, onClose, onAssign }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)

  // Il giorno che questa card rappresenta — può essere una data di fase,
  // diversa da event.date (vedi StaffTimeline.jsx/Calendar.jsx, stessa
  // convenzione di assignmentBlocks: b.eventId + b.date).
  const summaryDate = date || event.date
  // Se questo giorno è anche una data di montaggio/smontaggio dell'evento
  // (capita spesso con lo smontaggio lo stesso giorno) va segnalato: prima
  // questo modal non sapeva nulla delle fasi, quindi sul giorno coincidente
  // sembrava un evento "normale" senza nessun indizio dello smontaggio.
  const PHASE_META = {
    montaggio: { color: '#2563eb', label: t('calendar.legendAssembly') },
    smontaggio: { color: '#ea580c', label: t('calendar.legendDisassembly') },
  }
  const phasesToday = Object.entries(event.phases || {})
    .filter(([key, pdate]) => pdate === summaryDate && PHASE_META[key])
    .map(([key]) => PHASE_META[key])
  // Il tag "Evento" (oltre a quelli di fase) ha senso solo se l'evento vero
  // e proprio ricade DAVVERO su questo giorno — altrimenti (es. il montaggio
  // è il giorno prima dell'evento) qui c'è solo la fase, non l'evento.
  const eventSpanEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const eventHappensToday = summaryDate >= event.date && summaryDate <= eventSpanEnd
  // Orario "proprio" di QUESTO giorno: prima l'eventuale orario su misura
  // per questa data (event.dayTimes, impostato da StaffTimeline.jsx toccando
  // il titolo della card su un evento multi-giorno), altrimenti l'orario
  // generale dell'evento SOLO se questo è il suo giorno di riferimento
  // (event.date) — sugli altri giorni "di passaggio" senza orario su misura
  // non c'è un orario proprio da mostrare, resta "Tutto il giorno".
  const dayOverride = event.dayTimes?.[summaryDate]
  const eventOwnRange = dayOverride?.timeStart && dayOverride?.timeEnd
    ? [dayOverride.timeStart, dayOverride.timeEnd]
    : (summaryDate === event.date && event.allDay === false && event.timeStart && event.timeEnd) ? [event.timeStart, event.timeEnd] : null
  // Assegnazioni con orario proprio (timeline "Assegna personale",
  // collection assignmentBlocks) per QUESTO giorno — include anche gli
  // esterni, invisibili in assignedWorkers (solo profili interni, vedi
  // utils/assignmentBlocks.js). L'orario si mostra solo se diverso
  // dall'orario dichiarato dell'evento: se coincide è ridondante con la riga
  // "Orario" sopra.
  const dateBlocks = (blocks || []).filter(b => b.eventId === event.id && b.date === summaryDate)
  const blockWorkerIds = new Set(dateBlocks.filter(b => b.workerId).map(b => b.workerId))
  const peopleFromBlocks = dateBlocks.map(b => {
    const name = b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName
    if (!name) return null
    const isFullSpan = eventOwnRange && b.startTime === eventOwnRange[0] && b.endTime === eventOwnRange[1]
    return { key: b.id, name, hours: isFullSpan ? null : `${b.startTime}–${b.endTime}` }
  }).filter(Boolean)
  // Assegnazioni "semplici" (vecchio sistema, solo assignedWorkers, nessun
  // orario proprio) — un worker già coperto da un blocco per questo giorno
  // non va duplicato.
  const peopleLegacy = (event.assignedWorkers || [])
    .filter(wid => !blockWorkerIds.has(wid))
    .map(wid => workers.find(w => w.id === wid))
    .filter(Boolean)
    .map(w => ({ key: w.id, name: w.name, hours: null }))
  const assignedPeople = [...peopleFromBlocks, ...peopleLegacy]
  const manager = event.eventManager || {}
  const hasManager = manager.name || manager.phone || manager.email

  const dateLabel = event.dateEnd && event.dateEnd !== event.date
    ? `${formatDate(event.date + 'T12:00:00', { day:'numeric', month:'long' }, i18n.language)} → ${formatDate(event.dateEnd + 'T12:00:00', { day:'numeric', month:'long', year:'numeric' }, i18n.language)}`
    : capitalize(formatDate(event.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long', year:'numeric' }, i18n.language))
  const timeLabel = eventOwnRange ? `${eventOwnRange[0]} – ${eventOwnRange[1]}` : t('events.allDayLabel')

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
        <h2 style={{ display:'flex', alignItems:'center', gap:8 }}>
          {event.type === 'installation' && <Wrench size={17} />}{event.name}
        </h2>

        {phasesToday.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {/* Il titolo sopra è già il nome vero, ma da solo non dice che
                oggi è ANCHE la fase — un tag "Evento" accanto a quello della
                fase ("Smontaggio") rende esplicito che vanno fatti entrambi
                lo stesso giorno. Solo se l'evento ricade DAVVERO oggi: se
                questo giorno è solo una data di fase (es. montaggio il
                giorno prima), niente tag "Evento" — l'evento non è oggi. */}
            {eventHappensToday && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(230,57,70,0.12)', color:'var(--accent)', border:'1px solid rgba(230,57,70,0.35)', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)' }} /> {t('calendar.genericEventTag')}
              </span>
            )}
            {phasesToday.map(p => (
              <span key={p.label} style={{ display:'inline-flex', alignItems:'center', gap:5, background:p.color+'18', color:p.color, border:`1px solid ${p.color}44`, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:p.color }} /> {p.label}
              </span>
            ))}
          </div>
        )}

        <Row icon={<Calendar size={15} />} label={t('eventDetail.dateFieldLabel')}>
          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{dateLabel}</p>
        </Row>
        <Row icon={<Clock size={15} />} label={t('eventSummary.timeLabel')}>
          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{timeLabel}</p>
        </Row>
        {event.location && (
          <Row icon={<Pin size={15} />} label={t('calendar.locationLabel')}>
            <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{event.location}</p>
          </Row>
        )}
        {hasManager && (
          <Row icon={<User size={15} />} label={t('eventSummary.managerLabel')}>
            {manager.name && <p style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{manager.name}</p>}
            {manager.phone && <p style={{ fontSize:13, color:'var(--text2)', marginTop:2, display:'flex', alignItems:'center', gap:5 }}><Phone size={12} /> {manager.phone}</p>}
            {manager.email && <p style={{ fontSize:13, color:'var(--text2)', marginTop:2, display:'flex', alignItems:'center', gap:5 }}><Mail size={12} /> {manager.email}</p>}
          </Row>
        )}
        <Row icon={<User size={15} />} label={t('eventSummary.assignedLabel')}>
          {assignedPeople.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>{t('calendar.noneAssigned')}</p>
          ) : (
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {assignedPeople.map(p => (
                <span key={p.key} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(79,195,247,0.10)', border:'1px solid rgba(79,195,247,0.25)', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700, color:'var(--blue)' }}>
                  <User size={11} /> {p.name}{p.hours && <span style={{ fontWeight:600, opacity:0.8 }}>&nbsp;· {p.hours}</span>}
                </span>
              ))}
            </div>
          )}
        </Row>
        {event.notes && (
          <Row icon={<FileText size={15} />} label={t('calendar.notesLabel')}>
            <p style={{ fontSize:14, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.4 }}>{event.notes}</p>
          </Row>
        )}

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          {onAssign && (
            <button onClick={onAssign} className="btn btn-secondary" style={{ flex:1 }}>
              <User size={16} /> {t('eventSummary.assignSomeone')}
            </button>
          )}
          <button onClick={() => navigate(`/events/${event.id}`)} className="btn btn-primary" style={{ flex:1 }}>
            <List size={16} /> {t('eventSummary.goToLoadList')}
          </button>
        </div>
      </div>
    </div>
  )
}
