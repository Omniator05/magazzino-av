import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useConfirm } from '../context/ConfirmProvider'
import { isWorkerUnavailable } from '../utils/workerAssignment'
import { formatDate, capitalize } from '../utils/formatDate'
import { personColor } from '../utils/assignmentBlocks'
import TimeField from './TimeField'
import SaveButton from './SaveButton'
import { Trash, Warn } from './Icon'

// Crea/modifica un blocco orario della timeline "Assegna personale" — stesso
// guscio modal (useModalDrag + SaveButton) usato nel resto dell'app, es.
// Inventory.jsx. Il giorno non è modificabile (resta quello della cella
// toccata): per spostare un blocco su un altro giorno si cancella e se ne
// crea uno nuovo, coerente con la scelta di evitare drag-to-move/resize su
// touch (i magazzinieri preferiscono bottoni precisi a gesti imprecisi).
export default function AssignmentBlockModal({ initial, isEdit, workers, events, externalWorkers, unavailability, onClose, onSubmit, onDelete }) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const initialName = initial.workerId
    ? (workers.find(w => w.id === initial.workerId)?.name || '')
    : (initial.externalWorkerName || '')
  const [query, setQuery] = useState(initialName)
  const [selected, setSelected] = useState(
    initial.workerId ? { id: initial.workerId, kind: 'worker', name: initialName }
      : (initial.externalWorkerId || initial.externalWorkerName) ? { id: initial.externalWorkerId, kind: 'external', name: initialName }
        : null
  )
  const [startTime, setStartTime] = useState(initial.startTime || '09:00')
  const [endTime, setEndTime] = useState(initial.endTime || '13:00')
  // Non più modificabile da qui (tolta la sezione "evento collegato"): un
  // blocco creato toccando un evento resta legato a quello, uno creato su
  // uno spazio vuoto resta un task libero — niente scelta a metà strada.
  const eventId = initial.eventId || ''
  const [label, setLabel] = useState(initial.label || '')
  const [description, setDescription] = useState(initial.description || '')
  const [error, setError] = useState('')

  const drag = useModalDrag(onClose, undefined, undefined, true)
  const close = drag.close
  useModalScrollLock(true)

  // Un'unica ricerca su magazzinieri + esterni: se il nome scritto combacia
  // con qualcuno già in anagrafica lo propone da scegliere, altrimenti al
  // salvataggio diventa un nuovo esterno con quel nome — stessa logica già
  // usata per il chip "Esterno" rapido nella griglia.
  const candidates = [
    ...workers.map(w => ({ id: w.id, kind: 'worker', name: w.name || t('common.noName') })),
    ...externalWorkers.map(w => ({ id: w.id, kind: 'external', name: w.name })),
  ]
  const trimmedQuery = query.trim()
  const suggestions = trimmedQuery
    ? candidates.filter(c => c.name.toLowerCase().includes(trimmedQuery.toLowerCase())).slice(0, 6)
    : []
  const exactMatch = candidates.find(c => c.name.toLowerCase() === trimmedQuery.toLowerCase())
  const target = selected && selected.name.toLowerCase() === trimmedQuery.toLowerCase() ? selected : exactMatch

  const unavailableWarning = target?.kind === 'worker'
    ? isWorkerUnavailable(target.id, { date: initial.date, dateEnd: initial.date }, unavailability)
    : false

  const handleSubmit = async () => {
    setError('')
    if (endTime <= startTime) { setError(t('staffTimeline.errorTimeRange')); return false }
    if (!trimmedQuery) { setError(t('staffTimeline.errorNoPerson')); return false }
    if (!eventId && !label.trim()) { setError(t('staffTimeline.errorNoLabel')); return false }

    if (unavailableWarning) {
      const ok = await confirm({
        title: t('calendar.confirmUnavailableTitle'),
        message: t('calendar.confirmUnavailableMessage', { name: target.name, event: label.trim() || events.find(e => e.id === eventId)?.name || '' }),
        confirmLabel: t('calendar.confirmUnavailableLabel'),
        danger: true,
      })
      if (!ok) return false
    }

    return onSubmit({
      personType: target?.kind === 'worker' ? 'worker' : 'external',
      workerId: target?.kind === 'worker' ? target.id : null,
      externalWorkerId: target?.kind === 'external' ? target.id : null,
      externalWorkerName: target?.kind === 'external' ? target.name : (!target ? trimmedQuery : null),
      startTime, endTime,
      eventId: eventId || null,
      label: eventId ? '' : label.trim(),
      description: eventId ? '' : description.trim(),
    })
  }

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...drag.props}>
        <button className="close-btn" onClick={close} aria-label={t('common.close')}>✕</button>
        <h2>{isEdit ? t('staffTimeline.editBlockTitle') : t('staffTimeline.newBlockTitle')}</h2>

        <p style={{ fontSize:13, fontWeight:700, color:'var(--text2)', marginBottom:14 }}>
          {capitalize(formatDate(initial.date + 'T12:00:00', { weekday:'long', day:'numeric', month:'long' }, i18n.language))}
        </p>

        {!eventId && (
          <div className="form-group">
            <label>{t('staffTimeline.taskNameLabel')}</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t('staffTimeline.taskNamePlaceholder')} autoFocus />
          </div>
        )}

        {!eventId && (
          <div className="form-group">
            <label>{t('staffTimeline.taskDescriptionLabel')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('staffTimeline.taskDescriptionPlaceholder')} rows={3} style={{ resize:'vertical' }} />
          </div>
        )}

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

        <div className="form-group">
          <label>{t('staffTimeline.assignLabel')}</label>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null) }}
            placeholder={t('staffTimeline.assignPlaceholder')}
          />
          {suggestions.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
              {suggestions.map(c => (
                <button key={`${c.kind}-${c.id}`} type="button" className="btn-no-anim"
                  onClick={() => { setQuery(c.name); setSelected(c) }}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 11px', borderRadius:16, background: target?.kind === c.kind && target?.id === c.id ? 'rgba(216,56,63,0.12)' : 'var(--card2)', border: `1px solid ${target?.kind === c.kind && target?.id === c.id ? 'var(--accent)' : 'var(--border)'}`, fontSize:12, fontWeight:700, color: target?.kind === c.kind && target?.id === c.id ? 'var(--accent)' : 'var(--text)' }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: personColor(c.id) }} />
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {trimmedQuery && !target && (
            <p style={{ fontSize:12, color:'var(--text2)', marginTop:6 }}>{t('staffTimeline.assignNewHint', { name: trimmedQuery })}</p>
          )}
          {unavailableWarning && (
            <p style={{ fontSize:12, fontWeight:700, color:'var(--red)', marginTop:6, display:'flex', alignItems:'center', gap:5 }}>
              <Warn size={13} /> {t('staffTimeline.unavailableInline', { name: target.name })}
            </p>
          )}
        </div>

        {error && <p style={{ fontSize:13, color:'var(--red)', fontWeight:600, marginBottom:8 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          {isEdit && (
            <button
              onClick={async () => {
                if (!(await confirm({ title:t('staffTimeline.confirmDeleteTitle'), message:t('staffTimeline.confirmDeleteMessage'), confirmLabel:t('common.delete'), danger:true }))) return
                close()
                await onDelete()
              }}
              className="btn btn-red" style={{ flex:1 }}
            >
              <Trash size={16} /> {t('common.delete')}
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
