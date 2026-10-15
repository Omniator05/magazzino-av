import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isWorkerUnavailable } from '../utils/workerAssignment'
import { formatDate, capitalize } from '../utils/formatDate'
import { personColor } from '../utils/assignmentBlocks'
import TimeField from './TimeField'
import DeleteButton from './DeleteButton'
import Picker from './Picker'
import { MAIN_LIST_ID, getEventLists, hasMultipleLists } from '../utils/eventLists'
import { Calendar, Clock, Pin, User, FileText, List, Wrench, Warn } from './Icon'

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const PANEL_MAX_HEIGHT = 'calc(100vh - 76px)'
const PHASE_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }

const rowFromBlock = b => ({ blockId: b.id, startTime: b.startTime, endTime: b.endTime, note: b.note || '', noteOpen: !!b.note })

// Colonna laterale di "Assegna personale" — sostituisce i vecchi modal
// (blocco orario, riepilogo evento, orario del giorno, nome dell'esterno)
// con lo stesso pannello a scorrimento da destra già
// usato dal Calendario (CalendarSidePanel). Si apre toccando una card
// (evento, fase o attività) o il nome di una persona sopra di essa, e serve
// per due cose: i dettagli dell'attività e, soprattutto, il personale
// assegnato con orario preciso e una nota "cosa deve fare" per ciascuno.
//
// Aggiungere/togliere una persona è immediato (come il drag sulla card:
// scrive subito su Firestore); orari, note e dati dell'attività sono invece
// una bozza locale finché non si preme Salva — `dirty` risale al
// chiamante, che chiede conferma prima di scartarla cambiando card.
export default function StaffAssignPanel({
  item, date, isNew, activeWorkers, externalWorkers, unavailability, events = [],
  focusAddToken, draggedPerson, onDropPerson, embedded = false, quickPeople,
  onClose, onAddPerson, onRemoveBlock, onSave, onDeleteTask, onResetDayHours, onOpenEvent, onDirtyChange,
}) {
  const { t, i18n } = useTranslation()
  const isTask = item.type === 'task'
  const event = item.event
  const isMultiDayEvent = item.type === 'event' && event.dateEnd && event.dateEnd !== event.date
  const isPhase = item.type === 'phase'
  // Orario indipendente impostabile da qui: un giorno di un evento su più
  // giorni, oppure una fase (montaggio/smontaggio).
  const hasOwnHours = isMultiDayEvent || isPhase
  const hasDayOverride = (isMultiDayEvent && !!event.dayTimes?.[date]) || (isPhase && !!event.phaseTimes?.[item.phaseKey])

  const [label, setLabel] = useState(isTask ? (item.block.label || '') : '')
  const [description, setDescription] = useState(isTask ? (item.block.description || '') : '')
  // Lista di carico collegata a un task (es. "prepara il furgone"): un evento
  // e, se ne ha più d'una, una sua lista. Il magazziniere vede il task in
  // "Oggi" e un tocco lo porta dritto a quella lista.
  const [linkedEventId, setLinkedEventId] = useState(isTask ? (item.linkedEventId || '') : '')
  const [linkedListId, setLinkedListId] = useState(isTask ? (item.linkedListId || '') : '')
  // Orario "condiviso": quello dell'attività (o, per un evento su più giorni,
  // di QUESTO giorno). Le persone che lo seguono (stesso valore) lo
  // ereditano al volo quando cambia; chi se ne è già scostato resta com'è.
  const [startTime, setStartTime] = useState(item.startTime)
  const [endTime, setEndTime] = useState(item.endTime)
  const [rows, setRows] = useState(() => item.assigned.map(rowFromBlock))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  const addInputRef = useRef(null)

  // Chi arriva/parte dal drag sulla card (o da un altro dispositivo) compare
  // qui da solo; le bozze delle righe già presenti restano intatte.
  const blockSig = item.assigned.map(b => b.id).join(',')
  useEffect(() => {
    setRows(prev => item.assigned.map(b => prev.find(r => r.blockId === b.id) || rowFromBlock(b)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSig])

  // Rilasciare il chip "Esterno" sulla card apre il pannello già con il
  // campo "aggiungi" attivo, pronto a ricevere il nome.
  useEffect(() => {
    if (focusAddToken) addInputRef.current?.focus()
  }, [focusAddToken])

  const blockOf = id => item.assigned.find(b => b.id === id)
  const rowDirty = r => {
    const b = blockOf(r.blockId)
    return !b || b.startTime !== r.startTime || b.endTime !== r.endTime || (b.note || '') !== r.note
  }
  const dirty = rows.some(rowDirty)
    || (isTask && (label !== (item.block.label || '') || description !== (item.block.description || '')
      || linkedEventId !== (item.linkedEventId || '') || linkedListId !== (item.linkedListId || '')
      || (rows.length === 0 && (startTime !== item.startTime || endTime !== item.endTime))))
    || (hasOwnHours && (startTime !== item.startTime || endTime !== item.endTime))
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const setShared = (field, value) => {
    const prevValue = field === 'startTime' ? startTime : endTime
    if (field === 'startTime') setStartTime(value); else setEndTime(value)
    // Cambiando l'orario generale lo seguono tutte le persone che avevano quello
    // di prima, oppure ancora l'orario "tutto il giorno" di partenza (00:00 / 23:59)
    // che non è una scelta di nessuno.
    const legacy = field === 'startTime' ? '00:00' : '23:59'
    setRows(prev => prev.map(r => (r[field] === prevValue || r[field] === legacy ? { ...r, [field]: value } : r)))
  }
  const updateRow = (blockId, patch) => setRows(prev => prev.map(r => (r.blockId === blockId ? { ...r, ...patch } : r)))

  const candidates = [
    ...activeWorkers.map(w => ({ id: w.id, kind: 'worker', name: w.name || t('common.noName') })),
    ...externalWorkers.map(w => ({ id: w.id, kind: 'external', name: w.name })),
  ]
  const isAssigned = c => item.assigned.some(b => (c.kind === 'worker' ? b.workerId === c.id : b.externalWorkerId === c.id))
  const q = query.trim()
  const suggestions = q ? candidates.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) && !isAssigned(c)).slice(0, 8) : []
  const exactMatch = candidates.find(c => c.name.toLowerCase() === q.toLowerCase())

  const add = async person => {
    // La persona nasce con l'orario generale che si vede ORA nel campo (anche se non
    // ancora salvato), non con quello vecchio della card.
    await onAddPerson(person, { startTime, endTime })
    setQuery('')
  }

  const submit = async () => {
    setError('')
    if (isTask && !label.trim()) { setError(t('staffTimeline.errorNoLabel')); return }
    // Un'attività libera può scavalcare la mezzanotte (fine ≤ inizio = giorno
    // dopo), basta che inizio e fine non coincidano; eventi e fasi no.
    const badRange = (s0, e0) => (isTask ? e0 === s0 : e0 <= s0)
    if (badRange(startTime, endTime) || rows.some(r => badRange(r.startTime, r.endTime))) {
      setError(t(isTask ? 'staffTimeline.errorTimeEqual' : 'staffTimeline.errorTimeRange'))
      return
    }
    setSaving(true)
    try {
      await onSave({ label: label.trim(), description: description.trim(), startTime, endTime, rows, linkedEventId: linkedEventId || null, linkedListId: linkedEventId ? (linkedListId || null) : null })
    } catch {
      setError(t('staffTimeline.saveError'))
    } finally { setSaving(false) }
  }

  const dateLabel = capitalize(formatDate(date + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long' }, i18n.language))
  const manager = event?.eventManager || {}
  const hasManager = manager.name || manager.phone || manager.email
  const phaseTag = item.type === 'phase'
    ? { color: PHASE_COLORS[item.phaseKey], label: t(item.phaseKey === 'montaggio' ? 'calendar.legendAssembly' : 'calendar.legendDisassembly') }
    : null

  const InfoRow = ({ icon, children }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#1a1a1a', lineHeight: 1.4 }}>
      <span style={{ flexShrink: 0, color: '#9a9a9a', display: 'flex', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )

  return (
    <div className={embedded ? undefined : 'rc-sidebar-swap'}
      style={embedded
        ? { display: 'flex', flexDirection: 'column', gap: 14 }
        : { width: 460, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: PANEL_MAX_HEIGHT, maxHeight: PANEL_MAX_HEIGHT, overflowY: 'auto' }}>
      {/* Incorporato (es. foglio nella lista di carico): titolo e chiusura
          li mette il contenitore. */}
      {!embedded && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {item.type === 'event' && event.type === 'installation' && <Wrench size={15} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isTask ? (isNew ? t('staffTimeline.newTaskTitle') : t('staffTimeline.editTaskTitle')) : event.name}
          </span>
        </h2>
        <button onClick={onClose} className="btn-no-anim" aria-label={t('common.close')}
          style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
      </div>}

      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#6b6b6b' }}>
        {dateLabel}
        {phaseTag && <span style={{ marginLeft: 8, color: phaseTag.color, background: `${phaseTag.color}18`, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 800 }}>{phaseTag.label}</span>}
      </p>

      {isTask ? (
        <>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="staff-task-name">{t('staffTimeline.taskNameLabel')}</label>
            <input id="staff-task-name" value={label} onChange={e => setLabel(e.target.value)} placeholder={t('staffTimeline.taskNamePlaceholder')} autoFocus={isNew} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="staff-task-desc">{t('staffTimeline.taskDescriptionLabel')}</label>
            <textarea id="staff-task-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('staffTimeline.taskDescriptionPlaceholder')} rows={2} style={{ resize: 'vertical' }} />
          </div>
          {/* Lista di carico collegata (facoltativa) */}
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0]
            const linkable = events
              .filter(e => e.date && !e.isDeadlineReminder && !e.archived && (e.id === linkedEventId || (e.dateEnd && e.dateEnd >= e.date ? e.dateEnd : e.date) >= todayStr))
              .sort((a, b) => a.date.localeCompare(b.date))
            const options = [
              { value: '', label: t('staffTimeline.noLinkedList') },
              ...linkable.map(e => ({ value: e.id, label: `${e.name} · ${formatDate(e.date + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}` })),
            ]
            const linkedEvent = events.find(e => e.id === linkedEventId)
            const lists = linkedEvent && hasMultipleLists(linkedEvent) ? getEventLists(linkedEvent) : []
            return (
              <div className="form-group" style={{ margin: 0 }}>
                <label>{t('staffTimeline.linkedListLabel')}</label>
                <Picker value={linkedEventId} onChange={v => { setLinkedEventId(v); setLinkedListId('') }} options={options}
                  searchable searchPlaceholder={t('staffTimeline.linkedListSearch')} noResultsLabel={t('staffTimeline.linkedListNoResults')}
                  ariaLabel={t('staffTimeline.linkedListLabel')} placeholder={t('staffTimeline.noLinkedList')} />
                {lists.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Picker value={linkedListId} onChange={setLinkedListId} ariaLabel={t('staffTimeline.linkedListWhich')}
                      options={[{ value: '', label: t('workerScanner.allLists') }, ...lists.map(l => ({ value: l.id, label: l.name || (l.id === MAIN_LIST_ID ? t('eventDetail.mainListName') : t('eventDetail.listUnnamed')) }))]} />
                  </div>
                )}
              </div>
            )
          })()}
        </>
      ) : embedded ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isMultiDayEvent && (
            <InfoRow icon={<Calendar size={14} />}>
              {`${formatDate(event.date + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)} → ${formatDate(event.dateEnd + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language)}`}
            </InfoRow>
          )}
          {!hasOwnHours && <InfoRow icon={<Clock size={14} />}>{item.startTime}–{item.endTime}</InfoRow>}
          {event.location && <InfoRow icon={<Pin size={14} />}>{event.location}</InfoRow>}
          {hasManager && (
            <InfoRow icon={<User size={14} />}>
              {[manager.name, manager.phone, manager.email].filter(Boolean).join(' · ')}
            </InfoRow>
          )}
          {event.notes && <InfoRow icon={<FileText size={14} />}><span style={{ whiteSpace: 'pre-wrap', color: '#6b6b6b' }}>{event.notes}</span></InfoRow>}
        </div>
      )}

      {(isTask || hasOwnHours) && (
        <div className="form-group" style={{ margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ marginBottom: 0 }}>{isMultiDayEvent ? t('staffTimeline.dayHoursTitle') : t('staffTimeline.timeLabel')}</label>
            {hasDayOverride && (
              <button type="button" className="btn-no-anim" onClick={onResetDayHours}
                style={{ fontSize: 11.5, fontWeight: 700, color: '#6b6b6b', padding: '3px 9px', borderRadius: 20, background: '#eceae6' }}>
                {t('staffTimeline.resetDayHours')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('staffTimeline.startLabel')}</label>
              <TimeField value={startTime} onChange={v => setShared('startTime', v)} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('staffTimeline.endLabel')}</label>
              <TimeField value={endTime} onChange={v => setShared('endTime', v)} />
            </div>
          </div>
          {isTask && endTime <= startTime && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, fontWeight: 700, color: '#0066cc' }}>{t('staffTimeline.endsNextDay')}</p>
          )}
        </div>
      )}

      {/* Personale assegnato — anche zona di rilascio per il drag di un chip
          dalla striscia sopra la griglia (oltre che sulla card stessa). */}
      <div
        onDragOver={e => { e.preventDefault(); setDropHover(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropHover(false) }}
        onDrop={e => { e.preventDefault(); setDropHover(false); if (draggedPerson) onDropPerson(draggedPerson) }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 12, outline: dropHover ? '2px dashed #e63946' : 'none', outlineOffset: 4 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('staffTimeline.assignedTitle')}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#6b6b6b', background: '#eceae6', borderRadius: 20, padding: '1px 8px' }}>{rows.length}</span>
        </div>

        <div>
          <input
            ref={addInputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !q) return
              e.preventDefault()
              if (exactMatch && !isAssigned(exactMatch)) add(exactMatch)
              else if (!exactMatch) add({ id: null, kind: 'external', name: q })
              else if (suggestions[0]) add(suggestions[0])
            }}
            placeholder={t('staffTimeline.assignPlaceholder')}
          />
          {(() => {
            // Senza testo scritto, le persone "rapide" (se il chiamante le dà):
            // un tap le aggiunge, utile da telefono dove scrivere è scomodo.
            const shown = q ? suggestions : (quickPeople || []).filter(c => !isAssigned(c)).slice(0, 8)
            if (shown.length === 0) return null
            return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {shown.map(c => (
                <button key={`${c.kind}-${c.id}`} type="button" className="btn-no-anim" onClick={() => add(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px 4px 4px', borderRadius: 20, background: '#fff', border: '1.5px solid #e0ddd6', fontSize: 12, fontWeight: 700, color: '#1a1a1a' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: personColor(c.id), color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(c.name)}</span>
                  {c.name}
                </button>
              ))}
            </div>
            )
          })()}
          {q && !exactMatch && (
            <button type="button" className="btn-no-anim" onClick={() => add({ id: null, kind: 'external', name: q })}
              style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 700, color: '#0066cc' }}>
              {t('staffTimeline.assignAddNew', { name: q })}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: '#9a9a9a', fontStyle: 'italic' }}>{t('staffTimeline.noPeopleYet')}</p>
        ) : (
          <div style={{ borderRadius: 12, border: '1px solid #e0ddd6', overflow: 'hidden' }}>
            {rows.map((r, i) => {
              const b = blockOf(r.blockId)
              if (!b) return null
              const isWorker = !!b.workerId
              const pid = b.workerId || b.externalWorkerId || b.id
              const name = (isWorker ? (activeWorkers.find(w => w.id === b.workerId)?.name) : b.externalWorkerName) || t('common.noName')
              const unavailable = isWorker && isWorkerUnavailable(b.workerId, { date, dateEnd: date }, unavailability)
              return (
                <div key={r.blockId} style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid #e0ddd6' : 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: personColor(pid), color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(name)}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {!isWorker && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#9a9a9a', background: '#eceae6', borderRadius: 5, padding: '1px 5px' }}>{t('staffTimeline.externalTag')}</span>}
                    <button type="button" className="btn-no-anim" onClick={() => onRemoveBlock(b)} aria-label={t('staffTimeline.removePersonAria', { name })}
                      style={{ width: 22, height: 22, borderRadius: 6, background: '#eceae6', color: '#6b6b6b', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}><TimeField compact value={r.startTime} onChange={v => updateRow(r.blockId, { startTime: v })} /></div>
                    <span style={{ color: '#9a9a9a', fontSize: 12, fontWeight: 700 }}>–</span>
                    <div style={{ flex: 1, minWidth: 0 }}><TimeField compact value={r.endTime} onChange={v => updateRow(r.blockId, { endTime: v })} /></div>
                  </div>
                  {r.noteOpen ? (
                    <textarea value={r.note} onChange={e => updateRow(r.blockId, { note: e.target.value })} rows={2}
                      placeholder={t('staffTimeline.personNotePlaceholder')} style={{ resize: 'vertical', fontSize: 13 }} />
                  ) : (
                    <button type="button" className="btn-no-anim" onClick={() => updateRow(r.blockId, { noteOpen: true })}
                      style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: '#6b6b6b', padding: '3px 9px', borderRadius: 20, background: '#eceae6' }}>
                      + {t('staffTimeline.personNoteAdd')}
                    </button>
                  )}
                  {unavailable && (
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#e63946', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Warn size={12} /> {t('staffTimeline.unavailableInline', { name })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: '#e63946', fontWeight: 600 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        {isTask ? (
          <DeleteButton onClick={onDeleteTask} size={44} ariaLabel={t('staffTimeline.deleteTaskAria')} />
        ) : embedded ? null : (
          <button type="button" onClick={onOpenEvent} className="btn btn-secondary" style={{ flexShrink: 0 }}>
            <List size={16} /> {t('eventSummary.goToLoadList')}
          </button>
        )}
        <button onClick={submit} className="btn btn-primary" style={{ flex: 1 }} disabled={saving || (!dirty && !isNew)}>
          {saving ? t('common.saving') : t('staffTimeline.saveBlock')}
        </button>
      </div>
    </div>
  )
}
