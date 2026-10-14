import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { formatDate, capitalize } from '../utils/formatDate'
import { personColor } from '../utils/assignmentBlocks'
import { pushEventToGoogle } from '../utils/googleCalendar'
import { notifyTeamPush } from '../utils/pushNotifications'
import { generateDates } from '../utils/recurrence'
import { rememberEventManager } from '../utils/eventManagers'
import { Warn, Phone, Mail, Check } from './Icon'
import TimeField from './TimeField'
import DateField from './DateField'
import MultiDateField from './MultiDateField'
import CollapsibleFormSection from './CollapsibleFormSection'
import Picker from './Picker'
import SegmentedControl from './SegmentedControl'
import { absenceTypeOptions } from './AbsenceTypeBadge'
import EventManagerField from './EventManagerField'
import DeleteButton from './DeleteButton'

const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

const blankQuickForm = (initialDate) => ({
  type: 'event', name: '',
  date: initialDate || '', dateEnd: '',
  allDay: true, timeStart: '', timeEnd: '',
  recurrence: 'never', endDate: '', customDates: [],
  phases: {},
  location: '', notes: '',
  quoteRef: '', managerName: '', managerPhone: '', managerEmail: '',
})
const PHASE_CONFIG = [
  { key: 'montaggio', labelKey: 'calendar.legendAssembly', color: '#2563eb', bg: '#dbeafe' },
  { key: 'smontaggio', labelKey: 'calendar.legendDisassembly', color: '#ea580c', bg: '#ffedd5' },
]
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
  absencesOnDate, todayStr, selectedDate, selectedDayEvents, selectedDayPhases = [], selectedDayTasks, user, isWorker, workers, teamId,
  onOpenTask, onAddAbsence, onEditEvent, creating, onCancelCreate, onEventCreated,
  reportMode, rangeStart, onCancelReportMode,
  absenceFormOpen, absenceForm, setAbsenceForm, onSubmitAbsence, savingAbsence, editingAbsenceId, onCloseAbsenceForm,
  editingEvent, editForm, setEditForm, onSaveEdit, saving, onCancelEdit, onDeleteEvent,
}) {
  const { t, i18n } = useTranslation()
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T12:00:00') : null
  const dayAbsences = selectedDate ? absencesOnDate(selectedDate) : []

  const [editExtraOpen, setEditExtraOpen] = useState(false)
  useEffect(() => { if (editingEvent) setEditExtraOpen(!!((editForm.quoteRef || '').trim() || (editForm.managerName || '').trim())) }, [editingEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  const [quickForm, setQuickForm] = useState(() => blankQuickForm(selectedDate))
  const [savingQuick, setSavingQuick] = useState(false)
  const [quickExtraOpen, setQuickExtraOpen] = useState(false)
  // Si ripopola solo quando SI APRE (creating passa a true), non a ogni
  // cambio di selectedDate — altrimenti riscrivere la data mentre il form è
  // aperto verrebbe ignorato appena si cambia giorno sulla griglia sotto.
  useEffect(() => { if (creating) { setQuickForm(blankQuickForm(selectedDate)); setQuickExtraOpen(false) } }, [creating]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().split('T')[0]
  const quickRecurrenceOptions = (quickForm.type === 'installation' ? ['never', 'custom'] : ['never', 'daily', 'weekly', 'monthly', 'yearly', 'custom'])
    .map(value => ({ value, label: t(`events.recurrence${value[0].toUpperCase()}${value.slice(1)}`) }))
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
      <div key="create" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{t('calendar.quickCreateTitle')}</h2>
          <button onClick={onCancelCreate} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, background: '#eceae6', borderRadius: 12, padding: 4 }}>
          <button type="button" onClick={() => setQuickForm(f => ({ ...f, type: 'event' }))} aria-pressed={quickForm.type !== 'installation'}
            style={{ flex: 1, padding: 8, borderRadius: 9, fontWeight: 700, fontSize: 12.5,
              background: quickForm.type !== 'installation' ? '#fff' : 'transparent',
              color: quickForm.type !== 'installation' ? '#1a1a1a' : '#6b6b6b', border: 'none' }}>
            {t('events.typeEvent')}
          </button>
          <button type="button" onClick={() => setQuickForm(f => ({ ...f, type: 'installation', recurrence: 'never', endDate: '', customDates: [] }))} aria-pressed={quickForm.type === 'installation'}
            style={{ flex: 1, padding: 8, borderRadius: 9, fontWeight: 700, fontSize: 12.5,
              background: quickForm.type === 'installation' ? '#ede9fe' : 'transparent',
              color: quickForm.type === 'installation' ? '#5b4fcf' : '#6b6b6b', border: 'none' }}>
            {t('events.typeInstallation')}
          </button>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-quick-name">{t('calendar.eventNameLabel')}</label>
          <input id="cal-quick-name" value={quickForm.name} onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))} placeholder={t('calendar.eventNamePlaceholder')} autoFocus />
        </div>

        {/* Inizio/fine evento sulla stessa riga — il nostro DateField
            invece del calendario nativo del browser, coerente col resto
            dell'app. Parte già sul giorno selezionato in griglia, ma resta
            modificabile; il doppio "«»" sopra il mese nel popup (vedi
            DateField.jsx) salta di un anno intero in un tap, per non dover
            spingere "mese successivo" dodici volte programmando lontano. */}
        <div className="form-group" style={{ margin: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="cal-quick-date">{t('calendar.eventStartLabel')}</label>
              <DateField value={quickForm.date}
                onChange={v => setQuickForm(f => ({ ...f, date: v, dateEnd: f.dateEnd && f.dateEnd < v ? '' : f.dateEnd }))} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="cal-quick-dateend">{t('calendar.eventEndLabel')}</label>
              <DateField value={quickForm.dateEnd} min={quickForm.date} clearable placeholder="—"
                onChange={v => setQuickForm(f => ({ ...f, dateEnd: v }))} />
            </div>
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ marginBottom: 0 }}>{t('calendar.scheduleLabel')}</label>
            <button type="button" onClick={() => setQuickForm(f => ({ ...f, allDay: !f.allDay }))} aria-pressed={quickForm.allDay}
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 20,
                background: quickForm.allDay ? 'var(--accent)' : '#eceae6', color: quickForm.allDay ? '#fff' : '#6b6b6b',
                border: 'none', fontSize: 12.5, fontWeight: 700 }}>
              {quickForm.allDay && <Check size={13} />} {t('events.allDayLabel')}
            </button>
          </div>
          {!quickForm.allDay && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="cal-quick-time-start" style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeStartLabel')}</label>
                <TimeField value={quickForm.timeStart} onChange={v => setQuickForm(f => ({ ...f, timeStart: v }))} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="cal-quick-time-end" style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeEndLabel')}</label>
                <TimeField value={quickForm.timeEnd} onChange={v => setQuickForm(f => ({ ...f, timeEnd: v }))} clearable />
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-quick-recurrence">{t('events.repeatLabel')}</label>
          <Picker value={quickForm.recurrence} options={quickRecurrenceOptions} ariaLabel={t('events.repeatLabel')}
            onChange={v => setQuickForm(f => ({ ...f, recurrence: v, endDate: '', customDates: [] }))} />
        </div>

        {quickForm.recurrence === 'custom' ? (
          <div className="form-group" style={{ margin: 0 }}>
            <label>{t('events.customDatesLabel')}</label>
            <MultiDateField dates={quickForm.customDates} anchorDate={quickForm.date} onChange={v => setQuickForm(f => ({ ...f, customDates: v }))} />
          </div>
        ) : quickForm.recurrence !== 'never' && (
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="cal-quick-repeatend">{t('events.repeatEndLabel')}</label>
            <DateField value={quickForm.endDate} min={quickForm.date || today}
              onChange={v => setQuickForm(f => ({ ...f, endDate: v }))} />
          </div>
        )}

        {quickFutureDates.length > 0 && (
          <div style={{ background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.2)', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 700 }}>{t('events.totalEventsCount', { count: quickFutureDates.length + 1 })}</p>
            <p style={{ color: '#6b6b6b', fontSize: 12, marginTop: 3 }}>
              {t('workerCalendar.dateRange', {
                start: formatDate([quickForm.date, ...quickFutureDates].sort().at(0) + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language),
                end: formatDate([quickForm.date, ...quickFutureDates].sort().at(-1) + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language),
              })}
            </p>
          </div>
        )}

        {quickForm.type !== 'installation' && (
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ marginBottom: 8, display: 'block' }}>{t('events.phasesEventLabel')}</label>
            {PHASE_CONFIG.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <span style={{ background: p.bg, color: p.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 800, minWidth: 82, textAlign: 'center', flexShrink: 0 }}>{t(p.labelKey)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DateField value={quickForm.phases?.[p.key] || ''} clearable placeholder="—"
                    onChange={v => setQuickForm(f => { const ph = { ...(f.phases || {}) }; if (v) ph[p.key] = v; else delete ph[p.key]; return { ...f, phases: ph } })} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-quick-location">{t('calendar.locationLabel')}</label>
          <input id="cal-quick-location" value={quickForm.location} onChange={e => setQuickForm(f => ({ ...f, location: e.target.value }))} placeholder={t('calendar.locationPlaceholder')} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-quick-notes">{t('calendar.notesLabel')}</label>
          <textarea id="cal-quick-notes" value={quickForm.notes} onChange={e => setQuickForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('events.notesPlaceholder')} rows={2} />
        </div>

        <CollapsibleFormSection label={t('events.extraDetailsLabel')} open={quickExtraOpen} onToggle={() => setQuickExtraOpen(o => !o)}
          hasValue={!!(quickForm.quoteRef.trim() || quickForm.managerName.trim())}>
          <div className="form-group">
            <label htmlFor="cal-quick-quote">{t('events.quoteRefLabel')}</label>
            <input id="cal-quick-quote" value={quickForm.quoteRef} onChange={e => setQuickForm(f => ({ ...f, quoteRef: e.target.value }))} placeholder={t('events.quoteRefPlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('events.eventManagerLabel')}</label>
            <EventManagerField teamId={teamId} name={quickForm.managerName} phone={quickForm.managerPhone} email={quickForm.managerEmail}
              onChange={v => setQuickForm(f => ({ ...f, managerName: v.name, managerPhone: v.phone, managerEmail: v.email }))} />
          </div>
        </CollapsibleFormSection>

        <button onClick={saveQuickEvent} className="btn btn-primary btn-full" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          disabled={savingQuick || !quickForm.name.trim() || !quickForm.date}>
          {savingQuick ? t('common.saving') : quickFutureDates.length > 0 ? t('events.createMultiple', { count: quickFutureDates.length + 1 }) : <><Check size={16} /> {t('calendar.createEvent')}</>}
        </button>
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
      <div key="absence-pick" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{t('calendar.absenceModalTitle')}</h2>
          <button onClick={onCancelReportMode} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ background: 'rgba(216,56,63,0.08)', border: '1px solid rgba(216,56,63,0.3)', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--accent)', fontWeight: 600, lineHeight: 1.4 }}>
            {!rangeStart ? t('calendar.tapFirstDay') : t('calendar.tapLastDay')}
          </p>
        </div>
        <p style={{ fontSize: 12, color: '#9a9a9a', margin: 0 }}>{t('calendar.absenceModalDesc')}</p>
      </div>
    )
  }

  // Fase 2: date scelte (dalla griglia o già esistenti in modifica) — qui il
  // resto dei dati, stesso form che prima viveva nel modal "Segna assenza"
  // (ancora usato così com'era su mobile, dove non c'è questa colonna).
  if (absenceFormOpen) {
    const singleDay = !absenceForm.endDate || absenceForm.endDate === absenceForm.startDate
    return (
      <div key="absence-form" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{editingAbsenceId ? t('calendar.absenceModalEditTitle') : t('calendar.absenceModalTitle')}</h2>
          <button onClick={onCloseAbsenceForm} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>{t('calendar.firstDay')}</label>
          <DateField value={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>{t('calendar.lastDay')} <span style={{ color: '#9a9a9a', fontWeight: 400, fontSize: 12 }}>{t('calendar.lastDayHint')}</span></label>
          <DateField value={absenceForm.endDate} min={absenceForm.startDate} clearable placeholder={t('calendar.singleDayPlaceholder')} onChange={v => setAbsenceForm(f => ({ ...f, endDate: v }))} />
        </div>

        {/* Solo per un giorno solo — "qualche ora" su più giorni non ha
            senso con un unico orario (stesso vincolo di addAbsence). */}
        {singleDay && (
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ marginBottom: 0 }}>{t('calendar.absenceHoursLabel')}</label>
              <button type="button" onClick={() => setAbsenceForm(f => ({ ...f, allDay: !f.allDay }))} aria-pressed={absenceForm.allDay}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 20,
                  background: absenceForm.allDay ? 'var(--accent)' : '#eceae6', color: absenceForm.allDay ? '#fff' : '#6b6b6b',
                  border: 'none', fontSize: 12.5, fontWeight: 700 }}>
                {t('events.allDayLabel')}
              </button>
            </div>
            {!absenceForm.allDay && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeStartLabel')}</label>
                  <TimeField value={absenceForm.startTime} onChange={v => setAbsenceForm(f => ({ ...f, startTime: v }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeEndLabel')}</label>
                  <TimeField value={absenceForm.endTime} onChange={v => setAbsenceForm(f => ({ ...f, endTime: v }))} clearable />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="form-group" style={{ margin: 0 }}>
          <label>{t('calendar.absenceTypeLabel')}</label>
          <SegmentedControl options={absenceTypeOptions(t)} value={absenceForm.type} onChange={v => setAbsenceForm(f => ({ ...f, type: v }))} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-absence-reason">{t('calendar.reason')} <span style={{ color: '#9a9a9a', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
          <input id="cal-absence-reason" value={absenceForm.reason} onChange={e => setAbsenceForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('calendar.reasonPlaceholder')} />
        </div>

        <button onClick={onSubmitAbsence} className="btn btn-primary btn-full" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          disabled={savingAbsence || !absenceForm.startDate}>
          {savingAbsence ? t('common.saving') : <><Check size={16} /> {editingAbsenceId ? t('common.save') : t('calendar.confirmAbsence')}</>}
        </button>
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
      <div key="edit-event" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{t('calendar.editEventTitle')}</h2>
          <button onClick={onCancelEdit} className="btn-no-anim" aria-label={t('common.cancel')}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#eceae6', color: '#6b6b6b', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-edit-name">{t('calendar.eventNameLabel')}</label>
          <input id="cal-edit-name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder={t('calendar.eventNamePlaceholder')} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>{t('calendar.startDateLabel')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DateField value={editForm.date} onChange={v => setEditForm(f => ({ ...f, date: v }))} />
            </div>
            <button type="button" onClick={() => setEditForm(f => ({ ...f, allDay: !f.allDay }))} aria-pressed={editForm.allDay}
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 20,
                background: editForm.allDay ? 'var(--accent)' : '#eceae6', color: editForm.allDay ? '#fff' : '#6b6b6b',
                border: 'none', fontSize: 12.5, fontWeight: 700 }}>
              {editForm.allDay && <Check size={13} />} {t('events.allDayLabel')}
            </button>
          </div>
          {!editForm.allDay && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="cal-edit-time-start" style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeStartLabel')}</label>
                <TimeField value={editForm.timeStart} onChange={v => setEditForm(f => ({ ...f, timeStart: v }))} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="cal-edit-time-end" style={{ fontSize: 11, color: '#6b6b6b', fontWeight: 700, display: 'block', marginBottom: 4 }}>{t('events.timeEndLabel')}</label>
                <TimeField value={editForm.timeEnd} onChange={v => setEditForm(f => ({ ...f, timeEnd: v }))} clearable />
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label>{t('calendar.endDateLabel')} <span style={{ color: '#9a9a9a', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
          <DateField value={editForm.dateEnd || ''} min={editForm.date} clearable placeholder={t('common.noneOption')} onChange={v => setEditForm(f => ({ ...f, dateEnd: v }))} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ marginBottom: 8, display: 'block' }}>{t('calendar.phasesLabel')}</label>
          {PHASE_CONFIG.map(p => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span style={{ background: p.bg, color: p.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 800, minWidth: 82, textAlign: 'center', flexShrink: 0 }}>{t(p.labelKey)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DateField value={editForm.phases?.[p.key] || ''} clearable placeholder="—"
                  onChange={v => setEditForm(f => { const ph = { ...(f.phases || {}) }; if (v) ph[p.key] = v; else delete ph[p.key]; return { ...f, phases: ph } })} />
              </div>
            </div>
          ))}
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-edit-location">{t('calendar.locationLabel')}</label>
          <input id="cal-edit-location" value={editForm.location || ''} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder={t('calendar.locationPlaceholder')} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="cal-edit-notes">{t('calendar.notesLabel')}</label>
          <textarea id="cal-edit-notes" value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>

        <CollapsibleFormSection label={t('events.extraDetailsLabel')} open={editExtraOpen} onToggle={() => setEditExtraOpen(o => !o)}
          hasValue={!!((editForm.quoteRef || '').trim() || (editForm.managerName || '').trim())}>
          <div className="form-group">
            <label htmlFor="cal-edit-quote">{t('events.quoteRefLabel')} <span style={{ color: '#9a9a9a', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
            <input id="cal-edit-quote" value={editForm.quoteRef || ''} onChange={e => setEditForm(f => ({ ...f, quoteRef: e.target.value }))} placeholder={t('events.quoteRefPlaceholder')} />
          </div>
          <div className="form-group">
            <label>{t('events.eventManagerLabel')} <span style={{ color: '#9a9a9a', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
            <EventManagerField teamId={teamId} name={editForm.managerName || ''} phone={editForm.managerPhone || ''} email={editForm.managerEmail || ''}
              onChange={v => setEditForm(f => ({ ...f, managerName: v.name, managerPhone: v.phone, managerEmail: v.email }))} />
          </div>
        </CollapsibleFormSection>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <DeleteButton onClick={onDeleteEvent} size={44} ariaLabel={t('events.deleteEventAria')} />
          <button onClick={onSaveEdit} className="btn btn-primary" style={{ flex: 1 }}
            disabled={saving || !editForm.name?.trim() || !editForm.date}>
            {saving ? t('common.saving') : t('calendar.saveChanges')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div key="browse" className="rc-sidebar-swap" style={{ width: 460, flexShrink: 0, background: '#fff', borderLeft: '1px solid #e0ddd6', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: SIDEBAR_MAX_HEIGHT, overflowY: 'auto' }}>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t('calendar.absences')}</h2>
          {dayAbsences.length > 0 && <span style={{ background: '#eceae6', color: '#6b6b6b', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 9 }}>{dayAbsences.length}</span>}
        </div>
        {dayAbsences.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9a9a9a' }}>{t('calendar.weekAbsencesEmpty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayAbsences.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid #e0ddd6', borderRadius: 12, padding: '9px 11px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.workerName}</div>
                  <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 1 }}>
                    {a.startDate === a.endDate
                      ? formatDate(a.startDate + 'T12:00:00', { day: 'numeric', month: 'long' }, i18n.language)
                      : `${formatDate(a.startDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} → ${formatDate(a.endDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)}`}
                    {a.allDay === false && (a.startTime || a.endTime) && (
                      <span style={{ fontWeight: 700, color: '#1a1a1a' }}> · {a.startTime || '?'}–{a.endTime || '?'}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onAddAbsence} className="btn-no-anim"
          style={{ width: '100%', marginTop: 10, padding: 9, borderRadius: 10, border: '1.5px dashed #e0ddd6', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
          + {t('calendar.reportAbsence')}
        </button>
      </div>

      <div style={{ height: 1, background: '#e0ddd6' }} />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {selectedDateObj ? capitalize(formatDate(selectedDateObj, { weekday: 'long', day: 'numeric', month: 'long' }, i18n.language)) : t('calendar.pickADay')}
          </h2>
          {selectedDate === todayStr && <span style={{ background: 'rgba(216,56,63,0.12)', color: 'var(--accent)', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 9 }}>{t('calendar.today').toUpperCase()}</span>}
        </div>

        {!selectedDate ? null : (selectedDayEvents.length === 0 && selectedDayPhases.length === 0 && selectedDayTasks.length === 0) ? (
          <p style={{ fontSize: 12, color: '#9a9a9a' }}>{t('calendar.dayEmpty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedDayEvents.map(ev => {
              const items = ev.items || []
              const total = items.length
              const prontoN = items.filter(it => it.pronto).length
              const loadedN = items.filter(it => it.loaded).length
              const returnedN = items.filter(it => it.returned).length
              const assignedIds = ev.assignedWorkers || []
              const assignedWorkers = assignedIds.map(id => workers.find(w => w.id === id)).filter(Boolean)
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
              else if (prontoN < total) status = { label: `${t('calendar.statusReady')} ${prontoN}/${total}`, bg: '#eceae6', color: '#6b6b6b' }
              else if (loadedN < total) status = { label: `${t('calendar.statusLoaded')} ${loadedN}/${total}`, bg: '#eceae6', color: '#6b6b6b' }
              else if (returnedN < total) status = { label: `${t('calendar.statusReturned')} ${returnedN}/${total}`, bg: '#eceae6', color: '#6b6b6b' }
              else status = { label: `${t('calendar.statusReturned')} ${returnedN}/${total}`, bg: 'rgba(5,150,105,0.12)', color: '#059669' }

              return (
                <div key={ev.id} style={{ position: 'relative', border: '1px solid #e0ddd6', borderRadius: 12, padding: 12, background: 'var(--card)' }}>
                  {/* Card divisa in due metà cliccabili invece di un unico
                      onClick: a sinistra (verso il nome) apre la modifica
                      rapida, a destra (verso "apri evento") va alla lista di
                      carico — stesso verso del contenuto che le persone
                      cercano in quella zona. Sotto al contenuto vero
                      (z-index 1 contro 2), che ha pointerEvents:none tranne
                      sui controlli specifici (telefono/email/avatar/link),
                      così il tap su un punto "vuoto" della card cade comunque
                      su una delle due zone. */}
                  <div onClick={e => onEditEvent(e, ev)} role="button" tabIndex={-1}
                    style={{ position: 'absolute', inset: '0 50% 0 0', cursor: 'pointer', zIndex: 1 }} />
                  <Link to={`/events/${ev.id}`} aria-label={t('calendar.openEventLink')}
                    style={{ position: 'absolute', inset: '0 0 0 50%', cursor: 'pointer', zIndex: 1 }} />

                  <div style={{ position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{ev.name}</span>
                      <span style={{ background: status.bg, color: status.color, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{status.label}</span>
                    </div>

                    <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 4 }}>
                      {durationLabel}{ev.location ? ` · ${ev.location}` : ''}
                    </div>

                    {mgr?.name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: '#6b6b6b' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mgr.name}</span>
                        {mgr.phone && (
                          <a href={`tel:${mgr.phone}`} aria-label={t('calendar.callManagerAria', { name: mgr.name })}
                            style={{ display: 'flex', color: '#6b6b6b', flexShrink: 0, pointerEvents: 'auto' }}><Phone size={12} /></a>
                        )}
                        {mgr.email && (
                          <a href={`mailto:${mgr.email}`} aria-label={t('calendar.emailManagerAria', { name: mgr.name })}
                            style={{ display: 'flex', color: '#6b6b6b', flexShrink: 0, pointerEvents: 'auto' }}><Mail size={12} /></a>
                        )}
                      </div>
                    )}

                    {isWorker && !isAssigned && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: '#9a9a9a', fontSize: 10.5 }}>
                        <Warn size={11} /> {t('calendar.notAssignedHint')}
                      </div>
                    )}

                    {/* Avatar assegnati e "apri evento" sulla stessa riga —
                        gli avatar mostrano nome+orario al passaggio del
                        mouse (l'orario è quello dell'evento: l'assegnazione
                        oggi non ha ancora un orario per-persona). */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {assignedWorkers.map(w => (
                          <span key={w.id} className="rc-cal-avatar" aria-label={`${w.name} · ${durationLabel}`}
                            style={{ position: 'relative', width: 24, height: 24, borderRadius: '50%', background: personColor(w.id), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, pointerEvents: 'auto' }}>
                            {initials(w.name)}
                            <span className="rc-cal-avatar-tooltip">
                              <strong>{w.name}</strong>
                              <span>{durationLabel}</span>
                            </span>
                          </span>
                        ))}
                      </div>
                      <Link to={`/events/${ev.id}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', pointerEvents: 'auto', flexShrink: 0 }}>
                        {t('calendar.openEventLink')}
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Montaggi/smontaggi del giorno — una card per fase, anche se
                l'evento vero è un altro giorno: tocca per aprire la lista di
                carico da preparare. */}
            {selectedDayPhases.map(ph => (
              <Link key={`${ph.event.id}-${ph.key}`} to={`/events/${ph.event.id}`}
                style={{ position: 'relative', display: 'block', textDecoration: 'none', border: '1px solid #e0ddd6', borderRadius: 12, padding: '12px 12px 12px 16px', background: 'var(--card)', overflow: 'hidden' }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, background: ph.color }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{ph.event.name}</span>
                  <span style={{ background: `${ph.color}18`, color: ph.color, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{ph.label}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 4 }}>
                  {ph.time || t('events.allDayLabel')}{ph.event.location ? ` · ${ph.event.location}` : ''}
                </div>
                {ph.assigned.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                    {ph.assigned.map(b => {
                      const name = (b.workerId ? workers.find(w => w.id === b.workerId)?.name : b.externalWorkerName) || '?'
                      return (
                        <span key={b.id} title={`${name} · ${b.startTime}–${b.endTime}`}
                          style={{ width: 24, height: 24, borderRadius: '50%', background: personColor(b.workerId || b.externalWorkerId || b.id), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {initials(name)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </Link>
            ))}
            {selectedDayTasks.map(tk => (
              <button key={tk.id} onClick={() => onOpenTask(tk)} className="btn-no-anim"
                style={{ textAlign: 'left', border: '1px solid #e0ddd6', borderRadius: 12, padding: 12, background: 'var(--card)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a1a' }}>{tk.label || t('staffTimeline.untitledTask')}</span>
                <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 4 }}>{tk.startTime}–{tk.endTime}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
