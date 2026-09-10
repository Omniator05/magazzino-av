import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import { db } from '../firebase'
import { collection, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { Clock, Check, Download, Calendar as CalendarIcon, Warn, ChevronLeft, ChevronRight } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import DeleteButton from '../components/DeleteButton'
import SaveButton from '../components/SaveButton'
import DateField from '../components/DateField'
import TimeField from '../components/TimeField'
import Picker from '../components/Picker'
import { formatDate, capitalize } from '../utils/formatDate'

const timeStr = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const computeHours = (startISO, endISO) => Math.max(0, Math.round(((new Date(endISO) - new Date(startISO)) / 3600000) * 100) / 100)
const fmtHours = (h) => (h == null ? '—' : `${h.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}h`)

// "YYYY-MM" dai componenti LOCALI della data, mai da toISOString(): a est di
// Greenwich il primo del mese alle 00:00 locali è ancora il mese precedente
// in UTC, e il filtro finiva sul mese sbagliato.
const monthKeyOf = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}`
const monthKey = (d = new Date()) => monthKeyOf(d.getFullYear(), d.getMonth())

// Stato del limite ore (contratto) — stessa scala good/warning/critical già
// usata nel resto dell'app (var(--green)/var(--accent2)/var(--red)), non
// colori nuovi inventati per l'occasione.
function capStatus(total, max) {
  if (!max) return null
  const ratio = total / max
  if (ratio >= 1) return 'over'
  if (ratio >= 0.85) return 'near'
  return 'ok'
}
const CAP_COLOR = { ok: 'var(--green)', near: 'var(--accent2)', over: 'var(--red)' }

// Barre orizzontali (nome a sinistra, ok su schermi stretti senza ruotare
// testo) — colore neutro di base, che scala verso il colore del limite solo
// per chi ha un tetto ore impostato e lo sta avvicinando/superando: non è
// un confronto categorico tra persone, è un unico valore (ore) con un
//'emphasis' su chi merita attenzione — vedi skill dataviz, "emphasis" invece
// di colorare ogni barra in modo diverso senza motivo.
//
// La transizione anima `width` (non `transform:scaleX`, di solito preferito
// per le performance): con un arrotondamento solo sull'estremità destra,
// uno scaleX distorcerebbe quel raggio in modo ellittico alle percentuali
// basse — su una barra di 14px non c'è comunque alcun impatto reale.
function HoursBarChart({ rows, maxScale }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map(r => {
        const status = capStatus(r.total, r.maxMonthlyHours)
        const barColor = status ? CAP_COLOR[status] : 'var(--blue)'
        const pct = maxScale > 0 ? Math.min(100, (r.total / maxScale) * 100) : 0
        const capPct = r.maxMonthlyHours ? Math.min(100, (r.maxMonthlyHours / maxScale) * 100) : null
        return (
          <div key={r.workerId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 84, flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.workerName}</span>
            <div style={{ flex: 1, height: 14, background: 'var(--card2)', borderRadius: 7, position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '0 6px 6px 0', transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
              {capPct !== null && (
                <div title={`${r.maxMonthlyHours}h`} style={{ position: 'absolute', top: -2, bottom: -2, left: `${capPct}%`, width: 2, background: 'var(--text3)' }} />
              )}
            </div>
            <span style={{ width: 46, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(r.total)}</span>
          </div>
        )
      })}
    </div>
  )
}

// Area chart giornaliera — una sola serie (ore totali della squadra per
// giorno), niente legenda (non serve, il titolo sopra dice cos'è). Coordinate
// logiche fisse + preserveAspectRatio="none": si adatta alla larghezza reale
// del contenitore senza dover ricalcolare nulla in JS al resize.
function HoursTrendChart({ days }) {
  const width = 600, height = 120, pad = 6
  const maxVal = Math.max(1, ...days.map(d => d.total))
  const stepX = days.length > 1 ? (width - pad * 2) / (days.length - 1) : 0
  const points = days.map((d, i) => [
    pad + i * stepX,
    height - pad - (d.total / maxVal) * (height - pad * 2),
  ])
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const first = points[0]
  const areaPath = first && last ? `${linePath} L${last[0].toFixed(1)},${height - pad} L${first[0].toFixed(1)},${height - pad} Z` : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 96, display: 'block' }} preserveAspectRatio="none">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--border)" strokeWidth="1" />
      {areaPath && <path d={areaPath} fill="var(--accent)" fillOpacity="0.10" />}
      {linePath && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      {last && <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />}
    </svg>
  )
}

// Meter del limite ore, sola lettura: il tetto si imposta dalla scheda
// dell'utente (Impostazioni → Utenti), perché è un dato del suo contratto —
// qui il resoconto lo legge soltanto. Chi non ha un limite non mostra
// nulla, invece di riempire la lista di inviti a impostarlo.
function CapMeter({ worker, t }) {
  if (!worker.maxMonthlyHours) return null

  const status = capStatus(worker.total, worker.maxMonthlyHours)
  const pct = Math.min(100, (worker.total / worker.maxMonthlyHours) * 100)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--card2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: CAP_COLOR[status], borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: CAP_COLOR[status], fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {fmtHours(worker.total)} / {worker.maxMonthlyHours}h
        </span>
      </div>
      {status === 'over' && (
        <p style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Warn size={11} /> {t('workHours.capExceededHint')}
        </p>
      )}
    </div>
  )
}

// Resoconto ore per tutta la squadra — solo admin. L'auto-registrazione
// (timbratura/inserimento manuale, proprie voci) resta in WorkHours.jsx,
// raggiunta anche dall'admin per sé stesso da una card in Dashboard; qui si
// vede e corregge il lavoro di tutti.
export default function SettingsWorkHours() {
  const { t, i18n } = useTranslation()
  const { teamId } = useAuth()
  const confirm = useConfirm()
  const [entries, setEntries] = useState([])
  const [events, setEvents] = useState([])
  const [workers, setWorkers] = useState([])
  // 'YYYY-MM' per un mese preciso, oppure 'all' per tutto lo storico.
  const [periodKey, setPeriodKey] = useState(() => monthKey())
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [form, setForm] = useState({ date: '', startTime: '', endTime: '', eventId: '', notes: '' })
  const [formError, setFormError] = useState('')
  useModalScrollLock(showModal)

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', teamId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'events'), where('teamId', '==', teamId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  // Serve la rosa completa (non solo chi ha già una voce ore) per due motivi:
  // mostrare il limite anche a chi non ha ancora timbrato nulla questo
  // periodo, e far notare — informazione utile di per sé — chi non ha
  // registrato ore affatto.
  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'profiles'), where('teamId', '==', teamId))
    return onSnapshot(q, snap => setWorkers(
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(p => (p.role === 'worker' || p.role === 'admin') && p.active !== false)
    ))
  }, [teamId])

  const isAllTime = periodKey === 'all'

  const filtered = useMemo(() => (
    isAllTime ? entries : entries.filter(e => e.date?.slice(0, 7) === periodKey)
  ), [entries, periodKey, isAllTime])

  // Mesi selezionabili: quelli che hanno davvero delle voci, più gli ultimi
  // 12 (così si può aprire anche un mese vuoto per verificarlo) — niente
  // elenco infinito di mesi che non esistono nei dati.
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

  // Frecce: scorrono di un mese senza passare dall'elenco. In "tutto lo
  // storico" non hanno senso e spariscono invece di restare lì inerti.
  const shiftMonth = (delta) => {
    if (isAllTime) return
    const [y, m] = periodKey.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setPeriodKey(monthKey(d))
  }
  const canGoNext = !isAllTime && periodKey < monthKey()

  // Un gruppo per lavoratore, ordinato per totale ore decrescente — chi ha
  // lavorato di più salta subito all'occhio nel resoconto. Parte dalla rosa
  // della squadra (non dalle sole voci) così anche chi è a zero ore compare.
  const byWorker = useMemo(() => {
    const map = new Map()
    for (const w of workers) {
      map.set(w.id, { workerId: w.id, workerName: w.name || w.username || t('common.noName'), total: 0, entries: [], maxMonthlyHours: w.maxMonthlyHours || null })
    }
    for (const e of filtered) {
      if (!map.has(e.workerId)) map.set(e.workerId, { workerId: e.workerId, workerName: e.workerName || t('common.noName'), total: 0, entries: [], maxMonthlyHours: null })
      const g = map.get(e.workerId)
      if (e.hours != null) g.total += e.hours
      g.entries.push(e)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered, workers, t])

  const grandTotal = byWorker.reduce((sum, g) => sum + g.total, 0)
  const activeWorkersCount = byWorker.filter(w => w.total > 0).length

  const chartMaxScale = useMemo(() => {
    const values = byWorker.flatMap(w => [w.total, w.maxMonthlyHours || 0])
    return Math.ceil(Math.max(1, ...values) * 1.1)
  }, [byWorker])

  // Il limite ore è un concetto mensile: confrontarlo con "tutto lo storico"
  // (che copre più mesi) non avrebbe senso, quindi meter e tacca del limite
  // compaiono solo su un mese preciso. Il grafico ad area per lo stesso
  // motivo, più perché lo storico può coprire anni — una curva a
  // granularità giornaliera diventerebbe illeggibile.
  const trendDays = useMemo(() => {
    if (isAllTime) return []
    const [y, m1] = periodKey.split('-').map(Number)
    const m = m1 - 1
    const now = new Date()
    const isCurrentMonth = periodKey === monthKey(now)
    const lastDay = isCurrentMonth ? now.getDate() : new Date(y, m + 1, 0).getDate()
    const totals = {}
    for (const e of filtered) { if (e.hours != null) totals[e.date] = (totals[e.date] || 0) + e.hours }
    return Array.from({ length: lastDay }, (_, i) => {
      const dateStr = `${monthKeyOf(y, m)}-${String(i + 1).padStart(2, '0')}`
      return { date: dateStr, total: totals[dateStr] || 0 }
    })
  }, [filtered, periodKey, isAllTime])

  const exportCSV = () => {
    if (filtered.length === 0) return
    const headers = [t('workHours.csv.worker'), t('workHours.csv.date'), t('workHours.csv.start'), t('workHours.csv.end'), t('workHours.csv.hours'), t('workHours.csv.event'), t('workHours.csv.notes')]
    const rows = filtered.map(e => [
      e.workerName || '',
      e.date || '',
      e.clockIn ? timeStr(new Date(e.clockIn)) : '',
      e.clockOut ? timeStr(new Date(e.clockOut)) : '',
      e.hours ?? '',
      e.eventName || '',
      (e.notes || '').replace(/,/g, ';'),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ore_lavoro_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

  const deleteEntry = async (id) => {
    if (!(await confirm({ title: t('workHours.confirmDeleteTitle'), message: t('workHours.confirmDeleteMessage'), confirmLabel: t('workHours.confirmDeleteLabel'), danger: true }))) return
    await deleteDoc(doc(db, 'timeEntries', id))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <BackHomeButton to="/admin/settings" />
          <h1 style={{ textAlign: 'right' }}>{t('workHours.reportTitle')}</h1>
        </div>
      </div>

      {/* Periodo: frecce per scorrere i mesi + elenco per saltare a uno
          preciso (o a tutto lo storico) senza premere la freccia dieci volte. */}
      <div style={{ margin: '0 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => shiftMonth(-1)} disabled={isAllTime} aria-label={t('workHours.prevMonthAria')}
          className="btn-no-anim period-arrow"
        >
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
        <button
          onClick={() => shiftMonth(1)} disabled={!canGoNext} aria-label={t('workHours.nextMonthAria')}
          className="btn-no-anim period-arrow"
        >
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
      `}</style>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p style={{ color: 'var(--text3)', marginBottom: 4 }}><Clock size={40} /></p>
          <h3>{t('workHours.reportEmptyTitle')}</h3>
          <p>{t('workHours.reportEmptyDesc')}</p>
        </div>
      ) : (
        <>
          {/* Panoramica: il totale è la didascalia del grafico, non una card
              a sé — il numero isolato in un cerchio con etichetta sotto è
              il default che si vuole evitare qui. */}
          <div style={{ margin: '0 16px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  {isAllTime ? t('workHours.periodAll') : monthLabel(periodKey)}
                </p>
                <p style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)' }}>
                  {fmtHours(grandTotal)} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{t('workHours.totalAcrossTeam', { count: activeWorkersCount })}</span>
                </p>
              </div>
              <button onClick={exportCSV} className="btn-no-anim" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text2)', padding: '4px 2px', background: 'transparent', border: 'none' }}>
                <Download size={14} /> CSV
              </button>
            </div>
            <HoursBarChart rows={byWorker} maxScale={chartMaxScale} />
          </div>

          {!isAllTime && trendDays.some(d => d.total > 0) && (
            <div style={{ margin: '0 16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 16px 10px' }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('workHours.trendTitle')}</p>
              <HoursTrendChart days={trendDays} />
            </div>
          )}

          {byWorker.map(g => (
            <div key={g.workerId} style={{ margin: '0 16px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <details>
                <summary style={{ padding: '14px 16px', cursor: 'pointer', listStyle: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)' }}>{g.workerName}</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtHours(g.total)}</span>
                  </div>
                  {!isAllTime && <CapMeter worker={g} t={t} />}
                </summary>
                {g.entries.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {g.entries.map(entry => (
                      <div key={entry.id} onClick={() => openEditEntry(entry)} style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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
                        <DeleteButton onClick={e => { e.stopPropagation(); deleteEntry(entry.id) }} size={28} />
                      </div>
                    ))}
                  </div>
                )}
              </details>
            </div>
          ))}
        </>
      )}

      {showModal && (
        <div className={`modal-overlay${entryDrag.closing ? ' closing' : ''}`} onClick={entryDrag.onOverlayClick}>
          <div className={`modal${entryDrag.jiggling ? ' modal-jiggle' : ''}${entryDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...entryDrag.props}>
            <button className="close-btn" onClick={entryDrag.close}>✕</button>
            <h2>{t('workHours.editEntryTitle')}</h2>
            {editingEntry && <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 14 }}>{editingEntry.workerName}</p>}

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
    </div>
  )
}
