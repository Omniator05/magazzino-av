import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { Clock, Check, Calendar as CalendarIcon } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import DeleteButton from '../components/DeleteButton'
import SaveButton from '../components/SaveButton'
import DateField from '../components/DateField'
import TimeField from '../components/TimeField'
import Picker from '../components/Picker'
import ShiftClock from '../components/ShiftClock'

// Giorno "YYYY-MM-DD" dai componenti LOCALI, mai da toISOString(): in Italia
// una timbratura fatta tra mezzanotte e le 2 sarebbe finita nel giorno prima
// (turni notturni di montaggio: caso raro ma reale in questo mestiere).
const dateStrOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = () => dateStrOf(new Date())
const timeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// Ore lavorate tra due ISO string, arrotondate a 2 decimali — un solo
// percorso di calcolo condiviso da timbratura e inserimento manuale (vedi
// commento sul modello dati nel piano): entrambi finiscono per avere un
// clockIn/clockOut, cambia solo se orario "adesso" o digitato a mano.
const computeHours = (startISO, endISO) => {
  const ms = new Date(endISO) - new Date(startISO)
  return Math.max(0, Math.round((ms / 3600000) * 100) / 100)
}

const fmtHours = (h) => (h == null ? '—' : `${h.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}h`)

const LUNCH_BREAK_HOURS = 0.75 // 45 minuti

// Vista personale "Ore di lavoro" — timbratura + inserimento manuale +
// storico proprio. Montata sia per i lavoratori (tab dedicata) sia per gli
// admin (card "Strumenti" in Dashboard): ognuno vede e gestisce solo le
// proprie voci, il resoconto di tutta la squadra vive in
// SettingsWorkHours.jsx (solo admin).
export default function WorkHours() {
  const { t } = useTranslation()
  const { user, profile, teamId } = useAuth()
  const confirm = useConfirm()
  const [entries, setEntries] = useState([])
  const [events, setEvents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [form, setForm] = useState({ date: todayStr(), startTime: '', endTime: '', eventId: '', notes: '' })
  const [formError, setFormError] = useState('')
  const [justStopped, setJustStopped] = useState(null) // { id, hours } — turno appena chiuso, in revisione prima di confermare
  const [stopNotes, setStopNotes] = useState('')
  const [lunchBreak, setLunchBreak] = useState(false)
  const [closingReview, setClosingReview] = useState(false) // true durante l'animazione di chiusura della revisione
  const [now, setNow] = useState(Date.now()) // per il timer del turno in corso
  useModalScrollLock(showModal)

  useEffect(() => {
    if (!teamId || !user) return
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', teamId), where('workerId', '==', user.uid), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId, user?.uid])

  useEffect(() => {
    if (!teamId) return
    const todayS = todayStr()
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEvents(
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Eventi recenti o imminenti (finestra ragionevole): la voce ore va
        // quasi sempre registrata a ridosso di quando è successa.
        .filter(e => !e.archived && (e.dateEnd || e.date) >= dateStrOf(new Date(Date.now() - 30 * 86400000)))
        .filter(e => e.date <= dateStrOf(new Date(Date.now() + 60 * 86400000)))
    ))
  }, [teamId])

  // Timer del turno in corso: aggiorna ogni secondo solo se c'è una voce aperta.
  const openEntry = entries.find(e => e.workerId === user?.uid && !e.clockOut)
  useEffect(() => {
    if (!openEntry) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [!!openEntry])

  const workerName = profile?.name || profile?.username || t('common.noName')

  const clockIn = async () => {
    if (openEntry) return
    await addDoc(collection(db, 'timeEntries'), {
      teamId, workerId: user.uid, workerName,
      date: todayStr(),
      clockIn: new Date().toISOString(), clockOut: null, hours: null,
      source: 'clock', eventId: null, eventName: null, notes: '',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  }

  const clockOut = async () => {
    if (!openEntry) return
    const clockOutISO = new Date().toISOString()
    const hours = computeHours(openEntry.clockIn, clockOutISO)
    await updateDoc(doc(db, 'timeEntries', openEntry.id), {
      clockOut: clockOutISO, hours, updatedAt: serverTimestamp(),
    })
    // Stato di chiusura: l'orologio e il conteggio si bloccano sul risultato
    // vero, e restano lì finché non si conferma — non un messaggio che
    // sparisce da solo, la revisione (nota, pausa pranzo) resta a schermo
    // finché non si preme Salva o Nuovo turno.
    setStopNotes(''); setLunchBreak(false)
    setJustStopped({ id: openEntry.id, hours })
  }

  // Ore da salvare per il turno appena chiuso: quelle vere, meno la pausa
  // pranzo se la spunta è attiva — il clockIn/clockOut restano quelli reali,
  // cambia solo `hours` (quella che conta per i totali/resoconto).
  const stoppedFinalHours = justStopped ? Math.max(0, justStopped.hours - (lunchBreak ? LUNCH_BREAK_HOURS : 0)) : 0

  // Chiude la revisione con una dissolvenza invece di sparire di scatto: il
  // contenuto si anima per conto suo (classe CSS), lo stato vero si aggiorna
  // solo a fine animazione. `commit` distingue Salva (scrive nota/pausa) da
  // Nuovo turno (si limita a chiudere, il turno resta come già registrato).
  const closeReview = (commit) => {
    if (!justStopped || closingReview) return
    setClosingReview(true)
    setTimeout(async () => {
      if (commit) {
        await updateDoc(doc(db, 'timeEntries', justStopped.id), {
          notes: stopNotes.trim(), hours: stoppedFinalHours, updatedAt: serverTimestamp(),
        })
      }
      setJustStopped(null)
      setClosingReview(false)
    }, 320)
  }
  const saveStop = () => closeReview(true)
  const dismissStop = () => closeReview(false)

  const openCreateManual = () => {
    const n = new Date()
    setForm({ date: todayStr(), startTime: '09:00', endTime: timeStr(n), eventId: '', notes: '' })
    setEditingEntry(null); setFormError('')
    setShowModal(true)
  }

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

  // Ritorna true solo se ha davvero salvato — SaveButton chiude/spunta solo
  // in quel caso, mai sul ramo che si ferma per un errore di validazione.
  const saveEntry = async () => {
    setFormError('')
    if (!form.startTime || !form.endTime) { setFormError(t('workHours.errorTimesRequired')); return false }
    const clockInISO = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const clockOutISO = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    const hours = computeHours(clockInISO, clockOutISO)
    if (hours <= 0) { setFormError(t('workHours.errorEndBeforeStart')); return false }
    const ev = events.find(e => e.id === form.eventId)

    const data = {
      date: form.date, clockIn: clockInISO, clockOut: clockOutISO, hours,
      eventId: ev?.id || null, eventName: ev?.name || null,
      notes: form.notes.trim(), source: 'manual', updatedAt: serverTimestamp(),
    }
    if (editingEntry) {
      await updateDoc(doc(db, 'timeEntries', editingEntry.id), data)
    } else {
      await addDoc(collection(db, 'timeEntries'), {
        ...data, teamId, workerId: user.uid, workerName, createdAt: serverTimestamp(),
      })
    }
    return true
  }

  const submitForm = async () => { if (await saveEntry()) entryDrag.close() }
  const entryDrag = useModalDrag(closeModal, undefined, submitForm, showModal)

  const deleteEntry = async (id) => {
    if (!(await confirm({ title: t('workHours.confirmDeleteTitle'), message: t('workHours.confirmDeleteMessage'), confirmLabel: t('workHours.confirmDeleteLabel'), danger: true }))) return
    await deleteDoc(doc(db, 'timeEntries', id))
  }

  const monthTotal = entries
    .filter(e => e.hours != null && e.date?.slice(0, 7) === todayStr().slice(0, 7))
    .reduce((sum, e) => sum + e.hours, 0)

  const elapsed = openEntry ? Math.max(0, now - new Date(openEntry.clockIn).getTime()) : 0
  const elapsedStr = `${String(Math.floor(elapsed / 3600000)).padStart(2, '0')}:${String(Math.floor(elapsed / 60000) % 60).padStart(2, '0')}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`

  return (
    <div className="page">
      <style>{`
        @keyframes shiftPopIn {
          from { opacity: 0; transform: scale(0.92) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .shift-pop-in { animation: shiftPopIn 0.4s cubic-bezier(0.34,1.35,0.64,1) both; }
        /* Chiusura della revisione dopo Salva/Nuovo turno — un cassetto che
           si ritira, non uno scatto a vuoto. */
        .shift-review-closing {
          animation: shiftReviewClose 0.32s cubic-bezier(0.4,0,0.2,1) both;
          pointer-events: none;
        }
        @keyframes shiftReviewClose {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to   { opacity: 0; transform: scale(0.95) translateY(-8px); }
        }
        .lunch-check {
          width: 16px; height: 16px; flex-shrink: 0; border-radius: 5px;
          border: 1.5px solid currentColor; display: flex; align-items: center; justify-content: center;
        }
        .shift-clock-wrap { position: relative; display: inline-flex; }
        /* Onda che parte dall'orologio all'avvio del turno — una volta sola,
           non un alone perenne che distrae per tutto il turno. */
        .shift-ping {
          position: absolute; inset: -6px; border-radius: 50%;
          border: 2px solid var(--accent);
          animation: shiftPing 0.9s ease-out both;
          pointer-events: none;
        }
        @keyframes shiftPing {
          from { transform: scale(0.75); opacity: 0.55; }
          to   { transform: scale(1.5); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shift-pop-in { animation: none; }
          .shift-ping { animation: none; display: none; }
          .shift-review-closing { animation: none; opacity: 0; }
        }
      `}</style>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Il worker ci arriva dalla sua tab dedicata, non serve un modo per
              "tornare indietro" — c'è già la tab bar. L'admin invece ci
              arriva da una card in Dashboard, un livello più in profondità. */}
          {profile?.role !== 'worker' && <BackHomeButton />}
          <h1>{t('workHours.title')}</h1>
        </div>
      </div>

      {/* Turno in corso / bottone Inizia turno */}
      <div style={{
        margin: '0 16px 14px', borderRadius: 'var(--radius)', padding: '20px 18px', textAlign: 'center',
        background: openEntry ? 'rgba(230,57,70,0.08)' : justStopped ? 'rgba(52,211,153,0.10)' : 'var(--card)',
        border: `1px solid ${openEntry ? 'rgba(230,57,70,0.3)' : justStopped ? 'rgba(52,211,153,0.35)' : 'var(--border)'}`,
        transition: 'background 0.35s ease, border-color 0.35s ease',
      }}>
        {/* L'orologio resta lo stesso in tutti e tre gli stati: cambia solo
            cosa fa (fermo → gira → si posa), così l'occhio segue un oggetto
            solo invece di vedere tre grafiche che si sostituiscono. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div className="shift-clock-wrap">
            {openEntry && <span className="shift-ping" />}
            <ShiftClock
              state={openEntry ? 'running' : justStopped ? 'stopping' : 'idle'}
              color={openEntry ? 'var(--accent)' : justStopped ? 'var(--green)' : 'var(--text3)'}
            />
          </div>
        </div>

        {openEntry ? (
          // key sull'id della voce: un turno NUOVO (nuovo id) fa ripartire
          // l'animazione di comparsa da zero, invece di uno stato che si
          // limita a riapparire riaprendo la pagina sullo stesso turno.
          <div key={openEntry.id} className="shift-pop-in">
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              {t('workHours.shiftInProgress')}
            </p>
            <p style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', marginBottom: 16 }}>{elapsedStr}</p>
            <button onClick={clockOut} className="btn btn-primary btn-full" style={{ background: 'var(--accent)' }}>
              {t('workHours.clockOutButton')}
            </button>
          </div>
        ) : justStopped ? (
          <div className={`shift-pop-in${closingReview ? ' shift-review-closing' : ''}`} style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, textAlign: 'center' }}>
              {t('workHours.shiftEnded')}
            </p>
            <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginBottom: 4, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              +{fmtHours(stoppedFinalHours)}
            </p>
            {lunchBreak && (
              <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 14 }}>
                {t('workHours.lunchBreakApplied', { original: fmtHours(justStopped.hours) })}
              </p>
            )}

            <button
              type="button" onClick={() => setLunchBreak(v => !v)}
              className="btn-no-anim lunch-toggle"
              aria-pressed={lunchBreak}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
                padding: '10px', borderRadius: 'var(--radius-sm)', marginTop: lunchBreak ? 0 : 14, marginBottom: 14,
                background: lunchBreak ? 'rgba(52,211,153,0.12)' : 'var(--card2)',
                border: `1.5px solid ${lunchBreak ? 'rgba(52,211,153,0.4)' : 'var(--border2)'}`,
                color: lunchBreak ? 'var(--green)' : 'var(--text2)', fontWeight: 700, fontSize: 13.5,
              }}
            >
              <span className="lunch-check">{lunchBreak && <Check size={12} />}</span>
              {t('workHours.lunchBreakToggle')}
            </button>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>{t('workHours.notesLabel')} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>{t('common.optional')}</span></label>
              <textarea value={stopNotes} onChange={e => setStopNotes(e.target.value)} rows={2} placeholder={t('workHours.notesPlaceholder')} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={dismissStop} className="btn btn-secondary" style={{ flex: 1 }}>
                {t('workHours.newShiftButton')}
              </button>
              <button onClick={saveStop} className="btn btn-primary" style={{ flex: 1, background: 'var(--green)' }}>
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={clockIn} className="btn btn-primary btn-full">
            {t('workHours.clockInButton')}
          </button>
        )}
      </div>

      <button onClick={openCreateManual} className="btn-no-anim" style={{
        display: 'block', width: 'calc(100% - 32px)', margin: '0 16px 12px', padding: '11px', textAlign: 'center',
        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', fontWeight: 600, fontSize: 13.5,
      }}>
        {t('workHours.addManualButton')}
      </button>

      <p style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 13, fontWeight: 600, margin: '0 16px 20px' }}>
        {t('workHours.monthTotal', { hours: fmtHours(monthTotal) })}
      </p>

      {/* Storico personale */}
      <div style={{ padding: '0 0 16px' }}>
        {entries.length === 0 ? (
          <div className="empty-state">
            <p style={{ color: 'var(--text3)', marginBottom: 4 }}><Clock size={40} /></p>
            <h3>{t('workHours.emptyTitle')}</h3>
            <p>{t('workHours.emptyDesc')}</p>
          </div>
        ) : (
          entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} onEdit={() => openEditEntry(entry)} onDelete={() => deleteEntry(entry.id)} />
          ))
        )}
      </div>


      {showModal && (
        <div className={`modal-overlay${entryDrag.closing ? ' closing' : ''}`} onClick={entryDrag.onOverlayClick}>
          <div className={`modal${entryDrag.jiggling ? ' modal-jiggle' : ''}${entryDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...entryDrag.props}>
            <button className="close-btn" onClick={entryDrag.close}>✕</button>
            <h2>{editingEntry ? t('workHours.editEntryTitle') : t('workHours.addEntryTitle')}</h2>

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
              <Check size={16} /> {editingEntry ? t('workHours.saveChanges') : t('workHours.addEntry')}
            </SaveButton>
          </div>
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, onEdit, onDelete }) {
  const { t } = useTranslation()
  const isOpen = !entry.clockOut
  const timeRange = entry.clockIn
    ? `${timeStr(new Date(entry.clockIn))}${entry.clockOut ? ` – ${timeStr(new Date(entry.clockOut))}` : ''}`
    : null

  return (
    <div
      onClick={onEdit}
      style={{ margin: '0 16px 10px', background: 'var(--card)', border: `1px solid ${isOpen ? 'rgba(230,57,70,0.3)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
    >
      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
        {isOpen ? '…' : fmtHours(entry.hours)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)' }}>
          {new Date(entry.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
          {timeRange && <span style={{ color: 'var(--text2)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{timeRange}</span>}
          {entry.eventName && (
            <span style={{ background: 'rgba(79,195,247,0.12)', color: 'var(--blue)', borderRadius: 6, padding: '1px 7px', fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CalendarIcon size={11} /> {entry.eventName}
            </span>
          )}
          {isOpen && (
            <span style={{ color: 'var(--accent)', fontSize: 11.5, fontWeight: 700 }}>{t('workHours.shiftInProgress')}</span>
          )}
        </div>
        {entry.notes && <p style={{ color: 'var(--text2)', fontSize: 12.5, marginTop: 4, lineHeight: 1.4 }}>{entry.notes}</p>}
      </div>
      <DeleteButton onClick={e => { e.stopPropagation(); onDelete() }} size={32} />
    </div>
  )
}
