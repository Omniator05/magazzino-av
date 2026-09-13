import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { Check, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import DeleteButton from '../components/DeleteButton'
import EditButton from '../components/EditButton'
import SaveButton from '../components/SaveButton'
import DateField from '../components/DateField'
import TimeField from '../components/TimeField'
import Picker from '../components/Picker'
import Toast from '../components/Toast'
import SegmentedControl from '../components/SegmentedControl'
import AbsenceTypeBadge, { absenceTypeOptions } from '../components/AbsenceTypeBadge'
import CapMeter from '../components/CapMeter'
import { formatDate, capitalize } from '../utils/formatDate'
import { timeStr, computeHours, fmtHours, monthKey, todayStr } from '../utils/workHours'

// Dettaglio di un singolo lavoratore, raggiunto dall'elenco in
// SettingsWorkHours.jsx: le sue voci ore (con un filtro periodo proprio,
// indipendente da quello della lista), le sue assenze, e — sola lettura,
// il tetto si imposta nella sua scheda in Impostazioni → Utenti — il
// conteggio ferie usate/disponibili.
export default function SettingsWorkHoursWorker() {
  const { workerId } = useParams()
  const { t, i18n } = useTranslation()
  const { user, profile: myProfile, teamId } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [worker, setWorker] = useState(null)
  const [workerLoaded, setWorkerLoaded] = useState(false)
  const [entries, setEntries] = useState([])
  const [absences, setAbsences] = useState([])
  const [events, setEvents] = useState([])
  const [periodKey, setPeriodKey] = useState(() => monthKey())
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '', eventId: '', notes: '' })
  const [formError, setFormError] = useState('')

  const [editingAbsence, setEditingAbsence] = useState(null)
  const [absenceForm, setAbsenceForm] = useState({ startDate: '', endDate: '', reason: '', type: 'ferie' })
  useModalScrollLock(showModal || !!editingAbsence)

  useEffect(() => {
    if (!workerId) return
    return onSnapshot(doc(db, 'profiles', workerId), snap => {
      setWorker(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setWorkerLoaded(true)
    })
  }, [workerId])

  useEffect(() => {
    if (!teamId || !workerId) return
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', teamId), where('workerId', '==', workerId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId, workerId])

  useEffect(() => {
    if (!teamId || !workerId) return
    const q = query(collection(db, 'unavailability'), where('teamId', '==', teamId), where('workerId', '==', workerId))
    return onSnapshot(q, snap => setAbsences(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId, workerId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  const workerName = worker?.name || worker?.username || t('common.noName')
  const allTimeTotal = useMemo(() => entries.reduce((sum, e) => sum + (e.hours || 0), 0), [entries])

  const isAllTime = periodKey === 'all'
  const filtered = useMemo(() => (
    isAllTime ? entries : entries.filter(e => e.date?.slice(0, 7) === periodKey)
  ), [entries, periodKey, isAllTime])
  const periodTotal = useMemo(() => filtered.reduce((sum, e) => sum + (e.hours || 0), 0), [filtered])

  const monthOptions = useMemo(() => {
    const keys = new Set(entries.map(e => e.date?.slice(0, 7)).filter(Boolean))
    const now = new Date()
    for (let i = 0; i < 12; i++) keys.add(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
    if (!isAllTime) keys.add(periodKey)
    return [...keys].sort().reverse()
  }, [entries, periodKey, isAllTime])

  const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number)
    return capitalize(formatDate(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' }, i18n.language))
  }
  const shiftMonth = (delta) => {
    if (isAllTime) return
    const [y, m] = periodKey.split('-').map(Number)
    setPeriodKey(monthKey(new Date(y, m - 1 + delta, 1)))
  }
  const canGoNext = !isAllTime && periodKey < monthKey()

  // Assenze non ancora del tutto passate — stesso criterio delle liste
  // equivalenti nel calendario, altrimenti resterebbero elencate a vita.
  const today = todayStr()
  const activeAbsences = useMemo(() => (
    absences.filter(u => u.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  ), [absences, today])

  // Ferie usate quest'anno: su TUTTE le assenze (anche passate, non solo
  // activeAbsences sopra) — una ferie già presa a marzo deve continuare a
  // scalare dal monte anche a dicembre.
  const currentYear = new Date().getFullYear()
  const usedVacationDays = useMemo(() => (
    absences
      .filter(u => u.type === 'ferie' && u.startDate?.slice(0, 4) === String(currentYear))
      .reduce((sum, u) => {
        const s = new Date(u.startDate + 'T12:00:00')
        const e = new Date(u.endDate + 'T12:00:00')
        return sum + Math.round((e - s) / 86400000) + 1
      }, 0)
  ), [absences, currentYear])

  const openEditEntry = (entry) => {
    setForm({
      date: entry.date,
      startTime: entry.clockIn ? timeStr(new Date(entry.clockIn)) : '',
      endTime: entry.clockOut ? timeStr(new Date(entry.clockOut)) : '',
      eventId: entry.eventId || '', notes: entry.notes || '',
    })
    setEditingEntry(entry); setFormError('')
    setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditingEntry(null); setFormError('') }

  const saveEntry = async () => {
    setFormError('')
    if (!form.startTime || !form.endTime) { setFormError(t('workHours.errorTimesRequired')); return false }
    const clockInISO = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const clockOutISO = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    const hours = computeHours(clockInISO, clockOutISO)
    if (hours <= 0) { setFormError(t('workHours.errorEndBeforeStart')); return false }
    const ev = events.find(e => e.id === form.eventId)
    await updateDoc(doc(db, 'timeEntries', editingEntry.id), {
      date: form.date, clockIn: clockInISO, clockOut: clockOutISO, hours,
      eventId: ev?.id || null, eventName: ev?.name || null,
      notes: form.notes.trim(), source: 'manual', updatedAt: serverTimestamp(),
    })
    return true
  }
  const submitForm = async () => { if (await saveEntry()) entryDrag.close() }
  const entryDrag = useModalDrag(closeModal, undefined, submitForm, showModal)

  // Ritorna true solo se ha davvero cancellato — DeleteButton mostra spinner
  // poi spunta solo in quel caso (se la conferma viene rifiutata il bottone
  // torna semplicemente cliccabile, nessuna animazione). `onEntryDeleted`
  // fa partire la dissolvenza della riga DOPO la spunta, invece di farla
  // sparire di scatto nello stesso istante in cui Firestore conferma.
  const deleteEntry = async (entry) => {
    if (!(await confirm({ title: t('workHours.confirmDeleteTitle'), message: t('workHours.confirmDeleteMessage'), confirmLabel: t('workHours.confirmDeleteLabel'), danger: true }))) return false
    await deleteDoc(doc(db, 'timeEntries', entry.id))
    return true
  }
  const [fadingEntries, setFadingEntries] = useState({})
  const onEntryDeleted = (entry) => {
    setFadingEntries(f => ({ ...f, [entry.id]: entry }))
    setTimeout(() => setFadingEntries(f => { const next = { ...f }; delete next[entry.id]; return next }), 260)
  }
  // Voci mostrate: quelle live del periodo selezionato, più — solo per la
  // durata della dissolvenza — quella appena cancellata, che altrimenti
  // sparirebbe dall'array (quindi dal rendering) nello stesso istante in cui
  // Firestore conferma, prima che l'occhio faccia in tempo a vedere la spunta.
  const displayEntries = useMemo(() => {
    const liveIds = new Set(filtered.map(e => e.id))
    return [...filtered, ...Object.values(fadingEntries).filter(e => !liveIds.has(e.id))]
  }, [filtered, fadingEntries])

  // ── Assenze: modifica e rimozione ──────────────────────────────
  // Un admin può correggere le date di un'assenza segnalata (non solo
  // cancellarla). Per equità verso chi l'ha segnalata: se le date cambiano
  // davvero e non è l'admin stesso a modificare la propria, il worker riceve
  // un avviso (vedi AbsenceEditedNotification.jsx) — nessuno può dire
  // "questo l'hai cambiato tu di nascosto".
  const openEditAbsence = (u) => {
    setEditingAbsence(u)
    setAbsenceForm({ startDate: u.startDate, endDate: u.endDate, reason: u.reason || '', type: u.type || 'altro' })
  }
  const closeAbsenceModal = () => setEditingAbsence(null)

  // Ritorna true solo se ha davvero salvato — SaveButton mostra spinner poi
  // spunta solo in quel caso, e chiude il modal con la sua dissolvenza
  // (absenceDrag.close, passato come onDone) invece di farlo sparire di
  // scatto come faceva prima con un setEditingAbsence(null) diretto.
  const saveAbsenceEdit = async () => {
    if (!editingAbsence || !absenceForm.startDate) return false
    const data = {
      startDate: absenceForm.startDate,
      endDate: absenceForm.endDate || absenceForm.startDate,
      reason: absenceForm.reason.trim(),
      type: absenceForm.type || 'altro',
    }
    await updateDoc(doc(db, 'unavailability', editingAbsence.id), data)
    const datesChanged = data.startDate !== editingAbsence.startDate || data.endDate !== editingAbsence.endDate
    if (datesChanged && editingAbsence.workerId !== user.uid) {
      await addDoc(collection(db, 'notifications'), {
        teamId, type: 'absence_edited', workerId: editingAbsence.workerId,
        editedByName: myProfile?.name || myProfile?.username || t('common.noName'),
        oldStartDate: editingAbsence.startDate, oldEndDate: editingAbsence.endDate,
        startDate: data.startDate, endDate: data.endDate,
        seenBy: [], createdAt: serverTimestamp(),
      })
    }
    return true
  }

  const removeAbsence = async (u) => {
    if (!(await confirm({ title: t('adminUsers.confirmRemoveUnavailTitle'), message: t('adminUsers.confirmRemoveUnavailMessage'), confirmLabel: t('adminUsers.confirmRemoveUnavailLabel'), danger: true }))) return false
    await deleteDoc(doc(db, 'unavailability', u.id))
    return true
  }
  const [fadingAbsences, setFadingAbsences] = useState({})
  const onAbsenceDeleted = (u) => {
    setFadingAbsences(f => ({ ...f, [u.id]: u }))
    setTimeout(() => setFadingAbsences(f => { const next = { ...f }; delete next[u.id]; return next }), 260)
  }
  // Stesso motivo di displayEntries sopra: tiene l'assenza appena cancellata
  // visibile per la sola durata della dissolvenza.
  const displayAbsences = useMemo(() => {
    const liveIds = new Set(activeAbsences.map(a => a.id))
    return [...activeAbsences, ...Object.values(fadingAbsences).filter(a => !liveIds.has(a.id))]
  }, [activeAbsences, fadingAbsences])

  const submitAbsenceForm = async () => {
    if (await saveAbsenceEdit()) { showToast(t('workHours.absenceSavedToast')); absenceDrag.close() }
  }
  const absenceDrag = useModalDrag(closeAbsenceModal, undefined, submitAbsenceForm, !!editingAbsence)

  if (workerLoaded && !worker) {
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BackHomeButton to="/admin/settings/work-hours" />
            <h1>{t('workHours.workerNotFoundTitle')}</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Toast message={toast} />
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <BackHomeButton to="/admin/settings/work-hours" />
          <h1 style={{ textAlign: 'right' }}>{workerName}</h1>
        </div>
      </div>

      {/* Ore complessive: totale su tutta la storia, indipendente dal
          filtro periodo qui sotto (che riguarda solo l'elenco voci). Il
          limite mensile invece è per natura legato a un mese preciso, quindi
          resta agganciato al periodo selezionato. */}
      <div style={{ margin: '0 16px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{t('workHours.overallTotalLabel')}</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{fmtHours(allTimeTotal)}</p>
        {!isAllTime && <CapMeter worker={{ total: periodTotal, maxMonthlyHours: worker?.maxMonthlyHours }} t={t} />}
      </div>

      {/* Periodo: stesso navigatore della pagina lista, ma indipendente —
          filtra solo l'elenco voci di questa persona, non tocca l'altra
          pagina. */}
      <div className="period-nav" style={{ margin: '0 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => shiftMonth(-1)} disabled={isAllTime} aria-label={t('workHours.prevMonthAria')} className="btn-no-anim period-arrow">
          <ChevronLeft size={17} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Picker
            value={periodKey}
            onChange={setPeriodKey}
            ariaLabel={t('workHours.periodAria')}
            options={[
              { value: 'all', label: t('workHours.periodAll') },
              ...monthOptions.map(k => ({ value: k, label: monthLabel(k) })),
            ]}
          />
        </div>
        <button onClick={() => shiftMonth(1)} disabled={!canGoNext} aria-label={t('workHours.nextMonthAria')} className="btn-no-anim period-arrow">
          <ChevronRight size={17} />
        </button>
      </div>
      <style>{`
        .period-arrow {
          width: 40px; height: 42px; flex-shrink: 0; border-radius: var(--radius-sm);
          border: 1px solid var(--border2); background: var(--card); color: var(--text);
          display: flex; align-items: center; justify-content: center;
        }
        .period-arrow:disabled { opacity: 0.35; }
        /* Stesso attenuamento del rimbalzo al click di SettingsWorkHours.jsx
           — un mouse desktop lo tiene visibile più a lungo di un tap ed è
           più marcato su un controllo largo come questo. */
        .period-nav button:not(:disabled):active {
          transform: scale(0.99);
          filter: none;
          box-shadow: none;
        }
      `}</style>

      {/* Voci del periodo selezionato — vista semplificata: data, orario o
          ore manuali, evento collegato. Tap per modificare. */}
      <div style={{ margin: '0 16px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <p style={{ padding: '14px 16px 4px', fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('workHours.entriesTitle')}</p>
        {filtered.length === 0 ? (
          <p style={{ padding: '4px 16px 16px', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>{t('workHours.reportEmptyDesc')}</p>
        ) : (
          <div>
            {displayEntries.map(entry => {
              const isLeaving = !!fadingEntries[entry.id] && !filtered.some(e => e.id === entry.id)
              return (
                <div key={entry.id} onClick={() => !isLeaving && openEditEntry(entry)} style={{
                  padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10,
                  cursor: isLeaving ? 'default' : 'pointer',
                  opacity: isLeaving ? 0 : 1, transform: isLeaving ? 'scale(0.97)' : 'scale(1)',
                  transition: 'opacity 0.25s ease, transform 0.25s ease', pointerEvents: isLeaving ? 'none' : 'auto',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                      {entry.clockIn && <span style={{ color: 'var(--text2)', fontWeight: 400 }}> · {timeStr(new Date(entry.clockIn))}{entry.clockOut ? `–${timeStr(new Date(entry.clockOut))}` : '…'}</span>}
                    </p>
                    {entry.eventName && (
                      <span style={{ color: 'var(--blue)', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <CalendarIcon size={10} /> {entry.eventName}
                      </span>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text2)', flexShrink: 0 }}>{fmtHours(entry.hours)}</span>
                  <DeleteButton onDelete={e => { e.stopPropagation(); return deleteEntry(entry) }} onDone={() => onEntryDeleted(entry)} size={28} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Assenze — modificabili (non solo cancellabili): vedi
          saveAbsenceEdit per l'avviso al worker quando le date cambiano
          davvero. Sempre visibili, indipendenti dal periodo qui sopra. */}
      {activeAbsences.length > 0 && (
        <div style={{ margin: '0 16px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{t('workHours.absencesTitle')}</p>
          {displayAbsences.map(u => {
            const isLeaving = !!fadingAbsences[u.id] && !activeAbsences.some(a => a.id === u.id)
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 10, padding: '9px 10px', marginBottom: 6,
                opacity: isLeaving ? 0 : 1, transform: isLeaving ? 'scale(0.97)' : 'scale(1)',
                transition: 'opacity 0.25s ease, transform 0.25s ease', pointerEvents: isLeaving ? 'none' : 'auto',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {u.startDate === u.endDate
                      ? formatDate(u.startDate + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }, i18n.language)
                      : `${formatDate(u.startDate + 'T12:00:00', { day: 'numeric', month: 'short' }, i18n.language)} → ${formatDate(u.endDate + 'T12:00:00', { day: 'numeric', month: 'short', year: 'numeric' }, i18n.language)}`}
                    <AbsenceTypeBadge type={u.type} />
                  </p>
                  {u.reason && <p style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{u.reason}</p>}
                </div>
                <EditButton onClick={() => openEditAbsence(u)} size={32} ariaLabel={t('common.edit')} />
                <DeleteButton onDelete={() => removeAbsence(u)} onDone={() => onAbsenceDeleted(u)} size={32} />
              </div>
            )
          })}
        </div>
      )}

      {/* Ferie — sola lettura: il monte annuale si imposta nella scheda
          utente in Impostazioni, non qui. */}
      {worker?.vacationDaysPerYear != null && (
        <div style={{ margin: '0 16px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('adminUsers.vacationSettingTitle')}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('adminUsers.vacationUsedLabel', { year: currentYear })}</span>
            <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: usedVacationDays > worker.vacationDaysPerYear ? 'var(--red)' : 'var(--text)' }}>
              {usedVacationDays} / {worker.vacationDaysPerYear}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--card2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.min(100, (usedVacationDays / worker.vacationDaysPerYear) * 100)}%`,
              background: usedVacationDays > worker.vacationDaysPerYear ? 'var(--red)' : 'var(--green)',
            }} />
          </div>
        </div>
      )}

      {showModal && (
        <div className={`modal-overlay${entryDrag.closing ? ' closing' : ''}`} onClick={entryDrag.onOverlayClick}>
          <div className={`modal${entryDrag.jiggling ? ' modal-jiggle' : ''}${entryDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...entryDrag.props}>
            <button className="close-btn" onClick={entryDrag.close}>✕</button>
            <h2>{t('workHours.editEntryTitle')}</h2>

            {formError && <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{formError}</p>}

            <div className="form-group">
              <label>{t('workHours.dateLabel')}</label>
              <DateField value={form.date} onChange={date => setForm({ ...form, date })} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>{t('workHours.startTimeLabel')}</label>
                <TimeField value={form.startTime} onChange={startTime => setForm({ ...form, startTime })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>{t('workHours.endTimeLabel')}</label>
                <TimeField value={form.endTime} onChange={endTime => setForm({ ...form, endTime })} />
              </div>
            </div>
            <div className="form-group">
              <label>{t('workHours.eventLabel')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <Picker
                value={form.eventId}
                onChange={eventId => setForm({ ...form, eventId })}
                ariaLabel={t('workHours.eventLabel')}
                searchable
                searchPlaceholder={t('workHours.eventSearchPlaceholder')}
                noResultsLabel={t('workHours.eventNoResults')}
                options={[
                  { value: '', label: t('workHours.noEventOption') },
                  ...events.map(ev => ({ value: ev.id, label: ev.name, icon: <CalendarIcon size={15} /> })),
                ]}
              />
            </div>
            <div className="form-group">
              <label>{t('workHours.notesLabel')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder={t('workHours.notesPlaceholder')} />
            </div>

            <SaveButton onSave={saveEntry} onDone={entryDrag.close} onError={entryDrag.triggerJiggle} className="btn btn-primary btn-full" style={{ marginTop: 8 }}>
              <Check size={16} /> {t('workHours.saveChanges')}
            </SaveButton>
          </div>
        </div>
      )}

      {editingAbsence && (
        <div className={`modal-overlay${absenceDrag.closing ? ' closing' : ''}`} onClick={absenceDrag.onOverlayClick}>
          <div className={`modal${absenceDrag.jiggling ? ' modal-jiggle' : ''}${absenceDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...absenceDrag.props}>
            <button className="close-btn" onClick={absenceDrag.close} aria-label={t('common.close')}>✕</button>
            <h2>{t('workHours.editAbsenceTitle')}</h2>
            <div className="form-group">
              <label>{t('calendar.firstDay')}</label>
              <DateField value={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate }))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.lastDay')}</label>
              <DateField value={absenceForm.endDate} min={absenceForm.startDate} onChange={v => setAbsenceForm(f => ({ ...f, endDate: v }))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.absenceTypeLabel')}</label>
              <SegmentedControl options={absenceTypeOptions(t)} value={absenceForm.type} onChange={v => setAbsenceForm(f => ({ ...f, type: v }))} />
            </div>
            <div className="form-group">
              <label>{t('calendar.reason')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <input value={absenceForm.reason} onChange={e => setAbsenceForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('calendar.reasonPlaceholder')} />
            </div>
            <SaveButton
              onSave={saveAbsenceEdit}
              onDone={() => { showToast(t('workHours.absenceSavedToast')); absenceDrag.close() }}
              onError={absenceDrag.triggerJiggle}
              className="btn btn-primary btn-full"
              style={{ marginTop: 8 }}
              disabled={!absenceForm.startDate}
            >
              <Check size={16} /> {t('common.save')}
            </SaveButton>
          </div>
        </div>
      )}
    </div>
  )
}
