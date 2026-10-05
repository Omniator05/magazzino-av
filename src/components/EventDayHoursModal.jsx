import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { formatDate, capitalize } from '../utils/formatDate'
import TimeField from './TimeField'
import SaveButton from './SaveButton'
import { Trash } from './Icon'

// Orario di UN giorno di un evento multi-giorno, dentro "Assegna personale"
// (StaffTimeline.jsx) — un evento su più giorni non è impegnato dalle 7 alle
// 23 su OGNI giorno che tocca, tipicamente solo montaggio/spettacolo/
// smontaggio hanno orari diversi. Si apre toccando il titolo della card in
// quel giorno specifico. Scrive su event.dayTimes[date] (vedi
// StaffTimeline.jsx/EventSummaryModal.jsx/EventDetail.jsx, che lo leggono
// per mostrare l'orario giusto in calendario e nella lista di carico) —
// "Ripristina" lo toglie, tornando all'orario predefinito (quello
// dell'evento stesso, o l'intera fascia se non ne ha uno proprio).
export default function EventDayHoursModal({ event, date, hasOverride, initialStart, initialEnd, onClose, onSave, onReset }) {
  const { t, i18n } = useTranslation()
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(initialEnd)
  const [error, setError] = useState('')

  const drag = useModalDrag(onClose, undefined, undefined, true)
  const close = drag.close
  useModalScrollLock(true)

  const handleSubmit = async () => {
    setError('')
    if (endTime <= startTime) { setError(t('staffTimeline.errorTimeRange')); return false }
    return onSave(startTime, endTime)
  }

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position:'relative' }} {...drag.props}>
        <button className="close-btn" onClick={close} aria-label={t('common.close')}>✕</button>
        <h2>{t('staffTimeline.dayHoursTitle')}</h2>
        <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', marginBottom:14 }}>
          {event.name} · {capitalize(formatDate(date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long' }, i18n.language))}
        </p>

        <div style={{ display:'flex', gap:10 }}>
          <div className="form-group" style={{ flex:1 }}>
            <label>{t('staffTimeline.startLabel')}</label>
            <TimeField value={startTime} onChange={setStartTime} />
          </div>
          <div className="form-group" style={{ flex:1 }}>
            <label>{t('staffTimeline.endLabel')}</label>
            <TimeField value={endTime} onChange={setEndTime} />
          </div>
        </div>

        {error && <p style={{ fontSize:13, color:'var(--red)', fontWeight:600, marginBottom:8 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          {hasOverride && (
            <button
              onClick={async () => { close(); await onReset() }}
              className="btn btn-red" style={{ flex:1 }}
            >
              <Trash size={16} /> {t('staffTimeline.resetDayHours')}
            </button>
          )}
          <SaveButton onSave={handleSubmit} onDone={close} onError={drag.triggerJiggle} className="btn btn-primary" style={{ flex:2 }}>
            {t('staffTimeline.saveBlock')}
          </SaveButton>
        </div>
      </div>
    </div>
  )
}
