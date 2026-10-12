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
//
// Creazione e modifica condividono la STESSA interfaccia multi-persona: in
// modifica, `initial.people` arriva già popolato con tutti i membri attuali
// del gruppo (vedi buildEditInitial in StaffTimeline.jsx) — così si possono
// aggiungere, togliere o spostare d'orario più persone in un colpo solo,
// senza riaprire il modal per ciascuna. Ogni persona porta con sé un
// `blockId` (null per chi viene aggiunto ora): è StaffTimeline.jsx a capire,
// confrontando i blockId tornati indietro con quelli di partenza, chi va
// creato, aggiornato o cancellato.
export default function AssignmentBlockModal({ initial, isEdit, workers, events, externalWorkers, unavailability, onClose, onSubmit, onDelete }) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const defaultStart = initial.startTime || '09:00'
  const defaultEnd = initial.endTime || '13:00'
  const [startTime, setStartTime] = useState(defaultStart)
  const [endTime, setEndTime] = useState(defaultEnd)
  // Una persona è "personalizzata" (customTime valorizzato) se il suo orario
  // non coincide con quello condiviso dell'attività al momento dell'apertura
  // — chi lo condivide resta mostrato come badge compatto, chi se ne scosta
  // appare già espanso sui suoi due campi.
  const [selectedPeople, setSelectedPeople] = useState(() => (initial.people || []).map(p => ({
    id: p.id, kind: p.kind, name: p.name, blockId: p.blockId || null,
    customTime: (p.startTime === defaultStart && p.endTime === defaultEnd) ? null : { startTime: p.startTime, endTime: p.endTime },
  })))
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
  const isAlreadySelected = c => selectedPeople.some(p => p.kind === c.kind && (c.id ? p.id === c.id : p.name.toLowerCase() === c.name.toLowerCase()))

  const suggestions = trimmedQuery
    ? candidates.filter(c => c.name.toLowerCase().includes(trimmedQuery.toLowerCase()) && !isAlreadySelected(c)).slice(0, 6)
    : []
  const exactMatch = candidates.find(c => c.name.toLowerCase() === trimmedQuery.toLowerCase() && !isAlreadySelected(c))

  const checkAvailability = async (person) => {
    if (person.kind !== 'worker' || !isWorkerUnavailable(person.id, { date: initial.date, dateEnd: initial.date }, unavailability)) return true
    return confirm({
      title: t('calendar.confirmUnavailableTitle'),
      message: t('calendar.confirmUnavailableMessage', { name: person.name, event: label.trim() || events.find(e => e.id === eventId)?.name || '' }),
      confirmLabel: t('calendar.confirmUnavailableLabel'),
      danger: true,
    })
  }

  const addPerson = async (person) => {
    if (!(await checkAvailability(person))) return
    // customTime: null = usa l'orario condiviso dell'attività (i due campi
    // in cima) — ogni persona può però scostarsene (vedi riga sotto la
    // barra di ricerca), utile per chi su una stessa attività entra/esce
    // prima o dopo gli altri. blockId: null = non esiste ancora un blocco
    // per questa persona, verrà creato al salvataggio.
    setSelectedPeople(prev => [...prev, { ...person, blockId: null, customTime: null }])
    setQuery('')
  }
  const removePerson = (idx) => setSelectedPeople(prev => prev.filter((_, i) => i !== idx))
  const setPersonCustomTime = (idx) => setSelectedPeople(prev => prev.map((p, i) => i === idx ? { ...p, customTime: { startTime, endTime } } : p))
  const clearPersonCustomTime = (idx) => setSelectedPeople(prev => prev.map((p, i) => i === idx ? { ...p, customTime: null } : p))
  const updatePersonTime = (idx, field, value) => setSelectedPeople(prev => prev.map((p, i) => i === idx ? { ...p, customTime: { ...p.customTime, [field]: value } } : p))

  const toPersonFields = p => ({
    personType: p.kind === 'worker' ? 'worker' : 'external',
    workerId: p.kind === 'worker' ? p.id : null,
    externalWorkerId: p.kind === 'external' ? p.id : null,
    externalWorkerName: p.kind === 'external' ? p.name : null,
    blockId: p.blockId || null,
    startTime: p.customTime?.startTime || startTime,
    endTime: p.customTime?.endTime || endTime,
  })

  const handleSubmit = async () => {
    setError('')
    if (endTime <= startTime) { setError(t('staffTimeline.errorTimeRange')); return false }
    if (!eventId && !label.trim()) { setError(t('staffTimeline.errorNoLabel')); return false }

    // La persona ancora scritta ma non "aggiunta" col click conta comunque
    // (altrimenti scrivere un nome e premere subito Salva non farebbe
    // nulla).
    let people = selectedPeople
    if (trimmedQuery && !isAlreadySelected({ kind: exactMatch?.kind || 'external', id: exactMatch?.id, name: trimmedQuery })) {
      const extra = exactMatch || { id: null, kind: 'external', name: trimmedQuery }
      if (!(await checkAvailability(extra))) return false
      people = [...people, { ...extra, blockId: null, customTime: null }]
    }
    if (people.length === 0) { setError(t('staffTimeline.errorNoPerson')); return false }
    const badCustom = people.find(p => p.customTime && p.customTime.endTime <= p.customTime.startTime)
    if (badCustom) { setError(t('staffTimeline.errorTimeRange')); return false }

    return onSubmit({
      people: people.map(toPersonFields),
      startTime, endTime, eventId: eventId || null,
      label: eventId ? '' : label.trim(), description: eventId ? '' : description.trim(),
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
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t('staffTimeline.taskNamePlaceholder')} autoFocus={isEdit} />
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
            onChange={e => setQuery(e.target.value)}
            placeholder={t('staffTimeline.assignPlaceholder')}
          />

          {suggestions.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
              {suggestions.map(c => (
                <button key={`${c.kind}-${c.id}`} type="button" className="btn-no-anim" onClick={() => addPerson(c)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 11px', borderRadius:16, background:'var(--card2)', border:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: personColor(c.id) }} />
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {trimmedQuery && !exactMatch && (
            <button type="button" className="btn-no-anim" onClick={() => addPerson({ id: null, kind: 'external', name: trimmedQuery })}
              style={{ display:'block', marginTop:8, fontSize:12, fontWeight:700, color:'var(--blue)' }}>
              {t('staffTimeline.assignAddNew', { name: trimmedQuery })}
            </button>
          )}

          {selectedPeople.length > 0 && (
            <div style={{ marginTop:10, borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
              {selectedPeople.map((p, i) => {
                const isCustom = !!p.customTime
                const isUnavailable = p.kind === 'worker' && isWorkerUnavailable(p.id, { date: initial.date, dateEnd: initial.date }, unavailability)
                return (
                  <div key={`${p.kind}-${p.id || p.name}-${i}`}>
                    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--card2)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <button type="button" onClick={() => removePerson(i)} aria-label={t('staffTimeline.removePersonAria', { name: p.name })}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', background:'rgba(216,56,63,0.14)', color:'var(--accent)', fontSize:11, fontWeight:900, flexShrink:0 }}>✕</button>
                      <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: personColor(p.id || p.name) }} />
                      <span style={{ flex:1, minWidth:60, fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                      {isCustom ? (
                        <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                          <div style={{ width:84 }}><TimeField compact value={p.customTime.startTime} onChange={v => updatePersonTime(i, 'startTime', v)} /></div>
                          <span style={{ color:'var(--text3)', fontSize:11, fontWeight:700 }}>–</span>
                          <div style={{ width:84 }}><TimeField compact value={p.customTime.endTime} onChange={v => updatePersonTime(i, 'endTime', v)} /></div>
                          <button type="button" onClick={() => clearPersonCustomTime(i)} aria-label={t('staffTimeline.useSharedTimeAria')}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:'50%', background:'var(--card3)', color:'var(--text2)', fontSize:13, flexShrink:0 }}>↺</button>
                        </div>
                      ) : (
                        <button type="button" className="btn-no-anim" onClick={() => setPersonCustomTime(i)}
                          title={t('staffTimeline.useSharedTimeBtn')}
                          style={{ flexShrink:0, fontSize:11, fontWeight:700, color:'var(--text2)', padding:'5px 9px', borderRadius:10, background:'var(--card3)', fontVariantNumeric:'tabular-nums' }}>
                          {startTime}–{endTime}
                        </button>
                      )}
                    </div>
                    {isUnavailable && (
                      <p style={{ fontSize:11.5, fontWeight:700, color:'var(--red)', padding:'0 10px 8px', margin:0, background:'var(--card2)', display:'flex', alignItems:'center', gap:5 }}>
                        <Warn size={12} /> {t('staffTimeline.unavailableInline', { name: p.name })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
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
