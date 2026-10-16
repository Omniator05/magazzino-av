import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { useConfirm } from '../context/ConfirmProvider'
import { isWorkerUnavailable } from '../utils/workerAssignment'
import { createAssignmentBlock, updateAssignmentBlock, deleteAssignmentBlock } from '../utils/assignmentBlocks'
import { watchExternalWorkers, getOrCreateExternalWorker } from '../utils/externalWorkers'
import { eventTimeForDay, phaseTimeFor } from '../utils/assignmentTimes'
import { formatDate, capitalize } from '../utils/formatDate'
import StaffAssignPanel from './StaffAssignPanel'

const PHASE_COLORS = { montaggio: '#2563eb', smontaggio: '#ea580c' }
const PHASE_RANK = { montaggio: 0, event: 1, smontaggio: 2 }
const toStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// "Assegna personale" in versione telefono, dentro la lista di carico: su uno
// schermo piccolo una timeline settimanale di tutti gli eventi non serve —
// chi è su un evento vuole assegnare QUELL'evento (e il suo montaggio/
// smontaggio). Un foglio con i "bersagli" dell'evento (i suoi giorni + le
// fasi) e, per quello scelto, lo stesso pannello della versione desktop
// (StaffAssignPanel, in modalità incorporata): persone, orario preciso di
// ciascuna, nota "cosa deve fare". Le attività libere (non legate a un
// evento) restano della timeline desktop.
export default function EventAssignSheet({ event, blocks, workers, unavailability, teamId, user, onClose }) {
  const { t, i18n } = useTranslation()
  const confirm = useConfirm()
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)
  const [externalWorkers, setExternalWorkers] = useState([])
  useEffect(() => watchExternalWorkers(teamId, setExternalWorkers), [teamId])
  const activeWorkers = workers.filter(w => w.active !== false)
  const ctx = () => ({ eventsById: { [event.id]: event }, allBlocks: blocks })

  const phaseLabel = k => t(k === 'montaggio' ? 'calendar.legendAssembly' : 'calendar.legendDisassembly')
  const eventEnd = event.dateEnd && event.dateEnd >= event.date ? event.dateEnd : event.date
  const multiDay = eventEnd !== event.date

  // Bersagli: ogni giorno dell'evento (al massimo due settimane) + le fasi.
  const targets = []
  for (let d = new Date(event.date + 'T12:00:00'), n = 0; toStr(d) <= eventEnd && n < 14; d.setDate(d.getDate() + 1), n++) {
    const date = toStr(d)
    targets.push({
      key: `ev-${date}`, type: 'event', date, rank: PHASE_RANK.event,
      label: multiDay ? capitalize(formatDate(new Date(date + 'T12:00:00'), { weekday: 'short', day: 'numeric' }, i18n.language)) : t('calendar.genericEventTag'),
      color: '#e63946',
    })
  }
  Object.entries(event.phases || {}).forEach(([k, date]) => {
    if (!date || !PHASE_COLORS[k]) return
    targets.push({
      key: `ph-${k}`, type: 'phase', phaseKey: k, date, rank: PHASE_RANK[k],
      label: phaseLabel(k) + (date !== event.date ? ` · ${formatDate(new Date(date + 'T12:00:00'), { day: 'numeric', month: 'short' }, i18n.language)}` : ''),
      color: PHASE_COLORS[k],
    })
  })
  targets.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank)

  const today = toStr(new Date())
  const [targetKey, setTargetKey] = useState(() => (targets.find(x => x.date === today) || targets.find(x => x.type === 'event') || targets[0])?.key)
  const target = targets.find(x => x.key === targetKey) || targets[0]
  const dirtyRef = useRef(false)

  const switchTarget = async key => {
    if (key === targetKey) return
    if (dirtyRef.current) {
      const ok = await confirm({ title: t('staffTimeline.unsavedTitle'), message: t('staffTimeline.unsavedMessage'), confirmLabel: t('staffTimeline.unsavedDiscard'), danger: true })
      if (!ok) return
    }
    dirtyRef.current = false
    setTargetKey(key)
  }

  // Item nello stesso formato di quelli della timeline, quanto basta al pannello.
  let item = null
  if (target) {
    const eventOnDay = target.date >= event.date && target.date <= eventEnd
    if (target.type === 'event') {
      const [startTime, endTime] = eventTimeForDay(event, target.date)
      item = { key: target.key, type: 'event', event, date: target.date, startTime, endTime,
        assigned: blocks.filter(b => b.eventId === event.id && b.date === target.date && !b.phase) }
    } else {
      const [startTime, endTime] = phaseTimeFor(event, target.phaseKey, target.date)
      item = { key: target.key, type: 'phase', event, phaseKey: target.phaseKey, date: target.date, startTime, endTime,
        assigned: blocks.filter(b => b.eventId === event.id && b.date === target.date && (b.phase === target.phaseKey || (!b.phase && !eventOnDay))) }
    }
  }

  const personFields = p => ({
    workerId: p.kind === 'worker' ? p.id : null,
    externalWorkerId: p.kind === 'external' ? p.id : null,
    externalWorkerName: p.kind === 'external' ? p.name : null,
  })

  const addPerson = async (person, times) => {
    let p = person
    if (p.kind === 'external' && !p.id) {
      const id = await getOrCreateExternalWorker(teamId, p.name, user.uid, externalWorkers)
      if (!id) return
      p = { ...p, id }
    }
    if (p.kind === 'worker' && isWorkerUnavailable(p.id, { date: item.date, dateEnd: item.date }, unavailability)) {
      const ok = await confirm({
        title: t('calendar.confirmUnavailableTitle'),
        message: t('calendar.confirmUnavailableMessage', { name: p.name, event: event.name }),
        confirmLabel: t('calendar.confirmUnavailableLabel'),
        danger: true,
      })
      if (!ok) return
    }
    await createAssignmentBlock({
      teamId, date: item.date, startTime: times?.startTime || item.startTime, endTime: times?.endTime || item.endTime, ...personFields(p),
      eventId: event.id, label: '', ...(item.type === 'phase' ? { phase: item.phaseKey } : {}), createdBy: user.uid,
    }, ctx())
  }

  const save = async payload => {
    const apply = async (b, data) => {
      if (Object.entries(data).some(([k, v]) => (b[k] ?? '') !== v)) await updateAssignmentBlock(b.id, b, data, ctx())
    }
    for (const row of payload.rows) {
      const b = blocks.find(x => x.id === row.blockId)
      if (b) await apply(b, { startTime: row.startTime, endTime: row.endTime, note: row.note })
    }
    const timesChanged = payload.startTime !== item.startTime || payload.endTime !== item.endTime
    if (item.type === 'phase' && timesChanged) {
      await updateDoc(doc(db, 'events', event.id), { [`phaseTimes.${item.phaseKey}`]: { timeStart: payload.startTime, timeEnd: payload.endTime } })
    } else if (item.type === 'event' && multiDay && timesChanged) {
      await updateDoc(doc(db, 'events', event.id), { [`dayTimes.${item.date}`]: { timeStart: payload.startTime, timeEnd: payload.endTime } })
    }
  }

  const resetHours = () => updateDoc(doc(db, 'events', event.id), {
    [item.type === 'phase' ? `phaseTimes.${item.phaseKey}` : `dayTimes.${item.date}`]: deleteField(),
  })

  const hoursKey = item?.type === 'phase' ? !!event.phaseTimes?.[item.phaseKey] : !!event.dayTimes?.[item?.date]

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...drag.props}>
        <button className="close-btn" onClick={drag.close} aria-label={t('common.close')}>✕</button>
        <h2>{t('eventDetail.assignSheetTitle')}</h2>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', margin: '0 0 12px' }}>{event.name}</p>

        {targets.length > 1 && (
          <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
            {targets.map(x => {
              const active = x.key === target?.key
              return (
                <button key={x.key} role="tab" aria-selected={active} type="button" className="btn-no-anim" onClick={() => switchTarget(x.key)}
                  style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap',
                    background: active ? x.color : 'var(--c-surface)', color: active ? '#fff' : x.color, border: `1.5px solid ${x.color}${active ? '' : '66'}` }}>
                  {x.label}
                </button>
              )
            })}
          </div>
        )}

        {item && (
          <StaffAssignPanel
            key={`${target.key}-${hoursKey ? 'o' : 'n'}`}
            embedded
            item={item}
            date={item.date}
            isNew={false}
            activeWorkers={activeWorkers}
            externalWorkers={externalWorkers}
            unavailability={unavailability}
            onClose={drag.close}
            onAddPerson={addPerson}
            onRemoveBlock={b => deleteAssignmentBlock(b, ctx())}
            onSave={save}
            onResetDayHours={resetHours}
            onDirtyChange={d => { dirtyRef.current = d }}
          />
        )}
      </div>
    </div>
  )
}
