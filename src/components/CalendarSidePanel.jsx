import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { formatDate, capitalize } from '../utils/formatDate'
import { PersonDot } from './AssigneeAvatars'
import { assigneesOnDay } from '../utils/workerAssignment'
import { isRentLastDay } from '../utils/assignmentTimes'
import { pushEventToGoogle } from '../utils/googleCalendar'
import { notifyTeamPush } from '../utils/pushNotifications'
import { generateDates } from '../utils/recurrence'
import { rememberEventManager } from '../utils/eventManagers'
import { Warn, Phone, Mail, Check, ChevronRight } from './Icon'
import TimeField from './TimeField'
import DateField from './DateField'
import EventFormFields, { Switch, fieldLabel } from './EventFormFields'
import DateRangeField from './DateRangeField'
import Picker from './Picker'
import { TaskSummaryBody } from './TaskSummaryModal'
import ArchiveEventDetail from './ArchiveEventDetail'
import SegmentedControl from './SegmentedControl'
import AbsenceTypeBadge, { absenceTypeOptions } from './AbsenceTypeBadge'
import DeleteButton from './DeleteButton'


const blankQuickForm = (initialDate) => ({
  type: 'event', name: '',
  date: initialDate || '', dateEnd: '',
  allDay: true, timeStart: '', timeEnd: '',
  recurrence: 'never', endDate: '', customDates: [],
  phases: {},
  location: '', notes: '',
  quoteRef: '', managerName: '', managerPhone: '', managerEmail: '',
})
// Il bordo del header desktop (vedi Calendar.jsx) è alto circa 76px — la
// colonna non deve mai superare "viewport meno header", altrimenti
// allungherebbe la pagina intera invece di scorrere al suo interno.
const SIDEBAR_MAX_HEIGHT = 'calc(100vh - 76px)'

// Colonna laterale del Calendario desktop — assenze DEL GIORNO SELEZIONATO
// + dettaglio del giorno, accanto alla griglia mensile in Calendar.jsx.
// `creating` la trasforma in un form di creazione rapida al posto del
// modal — PRIMA VERSIONE sperimentale (solo i campi essenziali: la
// ricorrenza/fasi/template/responsabile restano nel modal completo,
// raggiungibile comunque dopo creando l'evento e aprendolo).
export default function CalendarSidePanel({
  absencesOnDate, todayStr, selectedDate, selectedDayEvents, selectedDayPhases = [], selectedDayTasks, assignmentBlocks = [], user, isWorker, workers, teamId,
  readOnly, onOpenEvent, eventDetail, eventBlocks, onCloseEvent, onOpenEventPage,
  onOpenTask, onEditTask, taskDetail, onCloseTask, onAddAbsence, onEditEvent, creating, onCancelCreate, onEventCreated,
  reportMode, rangeStart, onCancelReportMode,
  absenceFormOpen, absenceForm, setAbsenceForm, onSubmitAbsence, savingAbsence, editingAbsenceId, onCloseAbsenceForm, isAdmin, onEditAbsence, onDeleteAbsence,
  editingEvent, editForm, setEditForm, onSaveEdit, saving, onCancelEdit, onDeleteEvent,
}) {
  const { t, i18n } = useTranslation()
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T12:00:00') : null
  const dayAbsences = selectedDate ? absencesOnDate(selectedDate) : []

  const [quickForm, setQuickForm] = useState(() => blankQuickForm(selectedDate))
  const [savingQuick, setSavingQuick] = useState(false)
  // Si ripopola solo quando SI APRE (creating passa a true), non a ogni
  // cambio di selectedDate — altrimenti riscrivere la data mentre il form è
  // aperto verrebbe ignorato appena si cambia giorno sulla griglia sotto.
  useEffect(() => { if (creating) { setQuickForm(blankQuickForm(selectedDate)) } }, [creating]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().split('T')[0]
  const quickFutureDates = quickForm.recurrence === 'custom'
    ? (quickForm.customDates || [])
    : (quickForm.recurrence !== 'never' && quickForm.date && quickForm.endDate
      ? generateDates(quickForm.date, quickForm.recurrence, quickForm.endDate) : [])

  const saveQuickEvent = async () => {
    if (!quickForm.name.trim() || !quickForm.date) return
    setSavingQuick(true)
    try {
      const seriesId = quickForm.recurrence !== 'never' && quickFutureDates.length > 0
        ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : null
      const base = {
        name: quickForm.name.trim(), location: quickForm.location.trim(), notes: quickForm.notes.trim(),
        dateEnd: quickForm.dateEnd || null,
        allDay: quickForm.allDay, timeStart: quickForm.allDay ? null : (quickForm.timeStart || null), timeEnd: quickForm.allDay ? null : (quickForm.timeEnd || null),
        items: [], lists: [], mainListName: '',
        teamId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid,
        recurrence: quickForm.recurrence, seriesId,
        type: quickForm.type || 'event',
        phases: quickForm.phases || {},
        quoteRef: quickForm.quoteRef.trim(),
        eventManager: { name: quickForm.managerName.trim(), phone: quickForm.managerPhone.trim(), email: quickForm.managerEmail.trim() },
      }
      const ref = await addDoc(collection(db, 'events'), { ...base, date: quickForm.date })
      pushEventToGoogle(ref.id)
      if (base.eventManager.name) rememberEventManager(teamId, user.uid, base.eventManager).catch(() => {})
      notifyTeamPush({ title: t('calendar.pushNewEventTitle'), body: base.name, url: `/events/${ref.id}`, audience: { type: 'admins' } })
      for (const date of quickFutureDates) {
        const r = await addDoc(collection(db, 'events'), { ...base, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        pushEventToGoogle(r.id)
      }
      onEventCreated?.(ref.id)
    } finally { setSavingQuick(false) }
  }

  if (creating) {
    return (
      <div key="create" className="rc-sidebar-swap rc-ev-form" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', height: SIDEBAR_MAX_HEIGHT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>{t('calendar.quickCreateTitle')}</h2>
          <button onClick={onCancelCreate} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EventFormFields form={quickForm} setForm={setQuickForm} idp="cal-quick" teamId={teamId} showType showRecurrence autoFocusName today={today} futureDates={quickFutureDates} />
        </div>
        <div className="rc-side-footer">
          <button onClick={saveQuickEvent} className="btn btn-primary btn-full" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            disabled={savingQuick || !quickForm.name.trim() || !quickForm.date}>
            {savingQuick ? t('common.saving') : quickFutureDates.length > 0 ? t('events.createMultiple', { count: quickFutureDates.length + 1 }) : <><Check size={16} /> {t('calendar.createEvent')}</>}
          </button>
        </div>
      </div>
    )
  }

  // Fase 1 di "Aggiungi assenza": la colonna mostra l'avviso di tap invece
  // del banner sotto l'header — tocca un giorno (o due, per un intervallo)
  // sulla griglia qui a fianco. Appena scelto il secondo giorno,
  // Calendar.jsx apre absenceFormOpen (fase 2, sotto) con le date già
  // precompilate.
  if (reportMode) {
    return (
      <div key="absence-pick" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: SIDEBAR_MAX_HEIGHT, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>{t('calendar.absenceModalTitle')}</h2>
          <button onClick={onCancelReportMode} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ background: 'rgba(216,56,63,0.08)', border: '1px solid rgba(216,56,63,0.3)', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--accent)', fontWeight: 600, lineHeight: 1.4 }}>
            {!rangeStart ? t('calendar.tapFirstDay') : t('calendar.tapLastDay')}
          </p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--c-ink3)', margin: 0 }}>{t('calendar.absenceModalDesc')}</p>
      </div>
    )
  }

  // Fase 2: date scelte (dalla griglia o già esistenti in modifica) — qui il
  // resto dei dati, stesso form che prima viveva nel modal "Segna assenza"
  // (ancora usato così com'era su mobile, dove non c'è questa colonna).
  if (absenceFormOpen) {
    const singleDay = !absenceForm.endDate || absenceForm.endDate === absenceForm.startDate
    const personOptions = workers.map(w => ({ value: w.id, label: w.name }))
    return (
      <div key="absence-form" className="rc-sidebar-swap rc-ev-form" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', height: SIDEBAR_MAX_HEIGHT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>{editingAbsenceId ? t('calendar.absenceModalEditTitle') : t('calendar.absenceModalTitle')}</h2>
          <button onClick={onCloseAbsenceForm} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Solo l'admin: per chi si registra l'assenza (di default se stesso). */}
          {isAdmin && (
            <div>
              <span style={fieldLabel}>{t('calendar.absenceWhoLabel')}</span>
              <Picker value={absenceForm.workerId || user?.uid} options={personOptions} ariaLabel={t('calendar.absenceWhoLabel')} searchable
                searchPlaceholder={t('staffTimeline.searchPlaceholder')}
                onChange={v => setAbsenceForm(f => ({ ...f, workerId: v }))} />
            </div>
          )}

          <div>
            <span style={fieldLabel}>{t('calendar.absenceTypeLabel')}</span>
            <SegmentedControl options={absenceTypeOptions(t)} value={absenceForm.type} onChange={v => setAbsenceForm(f => ({ ...f, type: v }))} />
          </div>

          <div>
            <span style={fieldLabel}>{t('calendar.whenLabel')}</span>
            <div style={{ border: '1px solid var(--c-line)', borderRadius: 14, background: 'var(--c-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DateField value={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({ ...f, startDate: v, endDate: f.endDate < v ? '' : f.endDate }))} />
                </div>
                <span aria-hidden="true" style={{ color: 'var(--c-ink3)', fontWeight: 700 }}>→</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DateRangeField endOnly start={absenceForm.startDate} end={absenceForm.endDate || absenceForm.startDate} placeholder={t('calendar.endPlaceholder')} singleDayLabel={t('calendar.singleDay')}
                    onChange={(st, en) => setAbsenceForm(f => ({ ...f, endDate: en === st ? '' : en }))} />
                </div>
              </div>
              {/* Le ore hanno senso solo su un giorno solo — "qualche ora" su più
                  giorni non avrebbe un unico orario (stesso vincolo di addAbsence). */}
              {singleDay && (
                <div style={{ borderTop: '1px solid var(--c-fill)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', flex: absenceForm.allDay !== false ? 1 : '0 0 auto' }}>{t('events.allDayLabel')}</span>
                  {absenceForm.allDay === false && (
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}><TimeField value={absenceForm.startTime} onChange={v => setAbsenceForm(f => ({ ...f, startTime: v }))} compact /></div>
                      <span aria-hidden="true" style={{ color: 'var(--c-ink3)' }}>–</span>
                      <div style={{ flex: 1, minWidth: 0 }}><TimeField value={absenceForm.endTime} onChange={v => setAbsenceForm(f => ({ ...f, endTime: v }))} clearable compact /></div>
                    </div>
                  )}
                  <Switch on={absenceForm.allDay !== false} label={t('events.allDayLabel')}
                    onChange={v => setAbsenceForm(f => ({ ...f, allDay: v, ...(!v && !f.startTime && !f.endTime ? { startTime: '09:00', endTime: '18:00' } : {}) }))} />
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="cal-absence-reason" style={fieldLabel}>{t('calendar.reason')} <span style={{ color: 'var(--c-ink3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{t('common.optional')}</span></label>
            <input id="cal-absence-reason" value={absenceForm.reason} onChange={e => setAbsenceForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('calendar.reasonPlaceholder')} />
          </div>
        </div>

        <div className="rc-side-footer" style={{ display: 'flex', gap: 8 }}>
          {editingAbsenceId && <DeleteButton onDelete={onDeleteAbsence} size={48} ariaLabel={t('calendar.confirmRemoveAbsenceLabel')} />}
          <button onClick={onSubmitAbsence} className="btn btn-primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            disabled={savingAbsence || !absenceForm.startDate}>
            {savingAbsence ? t('common.saving') : <><Check size={16} /> {editingAbsenceId ? t('common.save') : t('calendar.confirmAbsence')}</>}
          </button>
        </div>
      </div>
    )
  }

  // Modifica rapida di un evento esistente (tap su una card nella colonna
  // dettagli) — stessi campi del vecchio modal "Modifica evento", ora dentro
  // la colonna invece che in un popup: niente più modal per il Calendario,
  // vedi il commento su CreateEventFlow per perché qui non c'è il toggle
  // tipo/ricorrenza (resta solo nel flusso di creazione).
  if (editingEvent) {
    return (
      <div key="edit-event" className="rc-sidebar-swap rc-ev-form" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', height: SIDEBAR_MAX_HEIGHT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>{t('calendar.editEventTitle')}</h2>
          <button onClick={onCancelEdit} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EventFormFields form={editForm} setForm={setEditForm} idp="cal-edit" teamId={teamId} today={today} />
        </div>
        <div className="rc-side-footer" style={{ display: 'flex', gap: 8 }}>
          <DeleteButton onClick={onDeleteEvent} size={44} ariaLabel={t('events.deleteEventAria')} />
          <button onClick={onSaveEdit} className="btn btn-primary" style={{ flex: 1 }}
            disabled={saving || !editForm.name?.trim() || !editForm.date}>
            {saving ? t('common.saving') : t('calendar.saveChanges')}
          </button>
        </div>
      </div>
    )
  }

  // Magazziniere (sola lettura): dettagli completi dell'evento nella colonna, con la
  // lista di carico e il pulsante per aprirla.
  if (eventDetail) {
    return (
      <div key={`event-${eventDetail.id}`} className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', display: 'flex', flexDirection: 'column', height: SIDEBAR_MAX_HEIGHT }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 28px 8px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.3px', overflowWrap: 'anywhere' }}>{eventDetail.name}</h2>
          <button onClick={onCloseEvent} className="btn-no-anim" aria-label={t('common.close')}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 20px' }}>
          <ArchiveEventDetail event={eventDetail} workers={workers} blocks={eventBlocks || []} vehicles={[]} loadListsOn />
        </div>
        <div className="rc-side-footer">
          <button onClick={() => onOpenEventPage(eventDetail)} className="btn-no-anim"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 13, background: '#e63946', color: '#fff', fontSize: 15, fontWeight: 800 }}>
            {t('eventSummary.goToLoadList')}
          </button>
        </div>
      </div>
    )
  }

  // Dettaglio di un'attività (al posto del modal): stessa colonna, con ✕ per tornare al giorno.
  if (taskDetail) {
    return (
      <div key={`task-${taskDetail.id}`} className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', display: 'flex', flexDirection: 'column', height: SIDEBAR_MAX_HEIGHT }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 28px 8px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--c-ink)', letterSpacing: '-0.3px', overflowWrap: 'anywhere' }}>{taskDetail.label || t('staffTimeline.untitledTask')}</h2>
          <button onClick={onCloseTask} className="btn-no-anim" aria-label={t('common.close')}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 24px' }}>
          <TaskSummaryBody block={taskDetail} workers={workers} />
        </div>
      </div>
    )
  }

  return (
    <div key="browse" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-line)', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18, minHeight: SIDEBAR_MAX_HEIGHT, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--c-ink)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('calendar.absences')}</h2>
          {dayAbsences.length > 0 && <span style={{ background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 9 }}>{dayAbsences.length}</span>}
        </div>
        {dayAbsences.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--c-ink3)' }}>{t('calendar.weekAbsencesEmpty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayAbsences.map(a => {
              const canEdit = isAdmin || a.workerId === user?.uid
              const Wrapper = canEdit ? 'button' : 'div'
              return (
                <Wrapper key={a.id} {...(canEdit ? { type: 'button', onClick: () => onEditAbsence(a), 'aria-label': t('common.edit') + ' · ' + a.workerName, className: 'btn-no-anim' } : {})}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: 'var(--bg)', border: '1px solid var(--c-line)', borderRadius: 12, padding: '9px 11px', cursor: canEdit ? 'pointer' : 'default' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.workerName}</span>
                      <AbsenceTypeBadge type={a.type} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-ink2)', marginTop: 2 }}>
                      {a.startDate === a.endDate
                        ? formatDate(a.startDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)
                        : `${formatDate(a.startDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} → ${formatDate(a.endDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}`}
                      {a.allDay === false && (a.startTime || a.endTime) && (
                        <span style={{ fontWeight: 700, color: 'var(--c-ink)' }}> · {a.startTime || '?'}–{a.endTime || '?'}</span>
                      )}
                      {a.reason ? <span> · {a.reason}</span> : null}
                    </div>
                  </div>
                  {canEdit && <span style={{ color: 'var(--c-ink3)', display: 'flex', flexShrink: 0 }}><ChevronRight size={16} /></span>}
                </Wrapper>
              )
            })}
          </div>
        )}
        <button onClick={onAddAbsence} className="btn-no-anim"
          style={{ width: '100%', marginTop: 10, padding: 9, borderRadius: 10, border: '1.5px dashed var(--c-line)', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
          + {t('calendar.reportAbsence')}
        </button>
      </div>

      <div style={{ height: 1, background: 'var(--c-line)' }} />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--c-ink)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {selectedDateObj ? capitalize(formatDate(selectedDateObj, { weekday: 'long', day: 'numeric', month: 'long' }, i18n.language)) : t('calendar.pickADay')}
          </h2>
          {selectedDate === todayStr && <span style={{ background: 'rgba(216,56,63,0.12)', color: 'var(--accent)', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 9 }}>{t('calendar.today').toUpperCase()}</span>}
        </div>

        {!selectedDate ? null : (selectedDayEvents.length === 0 && selectedDayPhases.length === 0 && selectedDayTasks.length === 0) ? (
          <p style={{ fontSize: 12, color: 'var(--c-ink3)' }}>{t('calendar.dayEmpty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedDayEvents.map(ev => {
              const items = ev.items || []
              const total = items.length
              const prontoN = items.filter(it => it.pronto).length
              const loadedN = items.filter(it => it.loaded).length
              const returnedN = items.filter(it => it.returned).length
              const assignedIds = ev.assignedWorkers || []
              // Solo chi lavora su QUESTO giorno (vedi assigneesOnDay): in un evento
              // lungo, montaggio e giorni dopo hanno persone diverse.
              const dayPeople = assigneesOnDay(ev, selectedDate, assignmentBlocks).map(a => {
                const w = a.workerId ? workers.find(x => x.id === a.workerId) : null
                const name = w?.name || a.name
                return name ? { key: a.key, id: w?.id || a.key, name, hours: a.hours, external: !w } : null
              }).filter(Boolean)
              const isAssigned = assignedIds.includes(user?.uid)
              const mgr = ev.eventManager
              const durationLabel = ev.allDay === false && ev.timeStart ? `${ev.timeStart}–${ev.timeEnd || ''}` : t('events.allDayLabel')

              // Un solo tag alla volta, non tre insieme: segue la fase in
              // corso (il primo stadio non ancora completo), passa al
              // successivo appena quello attuale è a n/n — "Pronto 2/9" poi,
              // quando tutti pronti, "Carico 0/9", e così via fino a
              // "Rientrato n/n" (verde, l'unico stadio che resta finale).
              let status
              if (total === 0) status = { label: t('calendar.listEmpty'), bg: 'rgba(204,34,34,0.12)', color: 'var(--red)' }
              else if (prontoN < total) status = { label: `${t('calendar.statusReady')} ${prontoN}/${total}`, bg: 'var(--c-fill)', color: 'var(--c-ink2)' }
              else if (loadedN < total) status = { label: `${t('calendar.statusLoaded')} ${loadedN}/${total}`, bg: 'var(--c-fill)', color: 'var(--c-ink2)' }
              else if (returnedN < total) status = { label: `${t('calendar.statusReturned')} ${returnedN}/${total}`, bg: 'var(--c-fill)', color: 'var(--c-ink2)' }
              else status = { label: `${t('calendar.statusReturned')} ${returnedN}/${total}`, bg: 'rgba(5,150,105,0.12)', color: '#059669' }

              return (
                <div key={ev.id} className="rc-cal-card" style={{ position: 'relative', border: '1px solid var(--c-line)', borderRadius: 12, padding: 12, background: 'var(--card)' }}>
                  {/* Tutta la card apre la lista di carico (è quello che si fa più spesso).
                      Sotto al contenuto vero (z-index 1 contro 2), che ha pointerEvents:none
                      tranne sui controlli specifici (telefono/email/avatar/"Modifica"), così
                      il tap su un punto "vuoto" cade comunque qui. La modifica rapida
                      dell'evento sta nella sigla "Modifica" in basso a destra. */}
                  <Link to={`/events/${ev.id}`} aria-label={t('calendar.openEventLink')}
                    style={{ position: 'absolute', inset: 0, borderRadius: 12, cursor: 'pointer', zIndex: 1 }} />

                  <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-ink)' }}>{ev.name}</span>
                      <span style={{ background: status.bg, color: status.color, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{status.label}</span>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--c-ink2)', marginTop: 4 }}>
                      {durationLabel}{ev.location ? ` · ${ev.location}` : ''}
                    </div>
                    {isRentLastDay(ev, selectedDate) && (
                      <div style={{ marginTop: 6 }}>
                        <span style={{ display: 'inline-block', background: 'rgba(124,111,205,0.14)', color: '#5b4fcf', border: '1px solid rgba(124,111,205,0.35)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 800 }}>{t('calendar.rentLastDay')}</span>
                      </div>
                    )}

                    {mgr?.name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--c-ink2)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mgr.name}</span>
                        {mgr.phone && (
                          <a href={`tel:${mgr.phone}`} aria-label={t('calendar.callManagerAria', { name: mgr.name })}
                            style={{ display: 'flex', color: 'var(--c-ink2)', flexShrink: 0, pointerEvents: 'auto' }}><Phone size={12} /></a>
                        )}
                        {mgr.email && (
                          <a href={`mailto:${mgr.email}`} aria-label={t('calendar.emailManagerAria', { name: mgr.name })}
                            style={{ display: 'flex', color: 'var(--c-ink2)', flexShrink: 0, pointerEvents: 'auto' }}><Mail size={12} /></a>
                        )}
                      </div>
                    )}

                    {isWorker && !isAssigned && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--c-ink3)', fontSize: 10.5 }}>
                        <Warn size={11} /> {t('calendar.notAssignedHint')}
                      </div>
                    )}

                    {/* Avatar assegnati e "apri evento" sulla stessa riga —
                        gli avatar mostrano nome+orario al passaggio del
                        mouse (l'orario è quello dell'evento: l'assegnazione
                        oggi non ha ancora un orario per-persona). */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {dayPeople.map(w => (
                          <PersonDot key={w.key} person={{ ...w, hours: w.hours || durationLabel }} className="rc-cal-avatar" style={{ pointerEvents: 'auto' }} />
                        ))}
                      </div>
                      <button type="button" className="btn-no-anim" onClick={e => { e.stopPropagation(); readOnly ? onOpenEvent(ev) : onEditEvent(e, ev) }}
                        aria-label={`${readOnly ? t('calendar.detailsTag') : t('common.edit')} · ${ev.name}`}
                        style={{ pointerEvents: 'auto', flexShrink: 0, background: 'var(--c-fill)', color: 'var(--c-ink2)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
                        {readOnly ? t('calendar.detailsTag') : t('common.edit')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Montaggi/smontaggi del giorno — una card per fase, anche se
                l'evento vero è un altro giorno: tocca per aprire la lista di
                carico da preparare. */}
            {selectedDayPhases.map(ph => (
              <Link key={`${ph.event.id}-${ph.key}`} to={`/events/${ph.event.id}`} className="rc-cal-card"
                style={{ position: 'relative', display: 'block', textDecoration: 'none', border: '1px solid var(--c-line)', borderRadius: 12, padding: '12px 12px 12px 16px', background: 'var(--card)', overflow: 'hidden' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, background: ph.color }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-ink)' }}>{ph.event.name}</span>
                  <span style={{ background: `${ph.color}18`, color: ph.color, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{ph.label}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-ink2)', marginTop: 4 }}>
                  {ph.time || t('events.allDayLabel')}{ph.event.location ? ` · ${ph.event.location}` : ''}
                </div>
                {ph.assigned.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                    {ph.assigned.map(b => {
                      const name = (b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName) || '?'
                      return <PersonDot key={b.id} person={{ key: b.id, id: b.workerId || b.externalWorkerId || b.id, name, hours: `${b.startTime}–${b.endTime}` }} />
                    })}
                  </div>
                )}
              </Link>
            ))}
            {selectedDayTasks.map(tk => (
              <div key={tk.id} role="button" tabIndex={0} onClick={() => onOpenTask(tk)} onKeyDown={e => { if (e.key === 'Enter') onOpenTask(tk) }} className="rc-cal-card"
                style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--c-line)', borderRadius: 12, padding: 12, background: 'var(--card)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink)' }}>{tk.label || t('staffTimeline.untitledTask')}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--c-ink2)' }}>{tk.startTime}–{tk.endTime}</span>
                  {!readOnly && onEditTask && (
                    <button type="button" className="btn-no-anim" onClick={e => { e.stopPropagation(); onEditTask(tk) }} aria-label={`${t('common.edit')} · ${tk.label || t('staffTimeline.untitledTask')}`}
                      style={{ flexShrink: 0, background: 'var(--c-fill)', color: 'var(--c-ink2)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>{t('common.edit')}</button>
                  )}
                </div>
                {/* Chi è assegnato all'attività: stessi pallini delle card degli eventi. */}
                {(() => {
                  const seen = new Map()
                  ;(tk.assigned || []).forEach(b => {
                    const key = b.workerId || `ext:${b.externalWorkerId || b.externalWorkerName}`
                    const name = b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName
                    if (name && !seen.has(key)) seen.set(key, { key, id: b.workerId || b.externalWorkerId || key, name, hours: b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : null })
                  })
                  const people = [...seen.values()]
                  return people.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                      {people.map(p => <PersonDot key={p.key} person={p} className="rc-cal-avatar" />)}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
