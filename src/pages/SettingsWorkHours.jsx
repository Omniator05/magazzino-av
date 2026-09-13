import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { Clock, Download, ChevronLeft, ChevronRight } from '../components/Icon'
import BackHomeButton from '../components/BackHomeButton'
import Picker from '../components/Picker'
import { formatDate, capitalize } from '../utils/formatDate'
import { timeStr, fmtHours, monthKeyOf, monthKey, capStatus, CAP_COLOR } from '../utils/workHours'

// Barre orizzontali (nome a sinistra, ok su schermi stretti senza ruotare
// testo) — colore neutro di base, che scala verso il colore del limite solo
// per chi ha un tetto ore impostato e lo sta avvicinando/superando: non è un
// confronto categorico tra persone, è un unico valore (ore) con un
// 'emphasis' su chi merita attenzione — vedi skill dataviz. Include SOLO chi
// ha davvero registrato ore nel periodo: un roster intero di barre a zero
// non aggiunge informazione, la lista sotto copre già chiunque a zero ore.
//
// La transizione anima `width` (non `transform:scaleX`, di solito preferito
// per le performance): con un arrotondamento solo sull'estremità destra, uno
// scaleX distorcerebbe quel raggio in modo ellittico alle percentuali basse —
// su una barra di 14px non c'è comunque alcun impatto reale.
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

// Resoconto ore per tutta la squadra — solo admin. Pagina indice: panoramica
// del periodo + un elenco di tutte le persone, che porta al dettaglio del
// singolo (SettingsWorkHoursWorker.jsx) dove vivono le voci, le assenze e il
// contatore ferie di quella persona — questa pagina non modifica più nulla
// lei stessa, solo naviga.
export default function SettingsWorkHours() {
  const { t, i18n } = useTranslation()
  const { teamId } = useAuth()
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [workers, setWorkers] = useState([])
  // 'YYYY-MM' per un mese preciso, oppure 'all' per tutto lo storico.
  const [periodKey, setPeriodKey] = useState(() => monthKey())

  useEffect(() => {
    if (!teamId) return
    const q = query(collection(db, 'timeEntries'), where('teamId', '==', teamId), orderBy('date', 'desc'))
    return onSnapshot(q, snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [teamId])

  // Serve la rosa completa (non solo chi ha già una voce ore) per due motivi:
  // mostrare il limite anche a chi non ha ancora timbrato nulla questo
  // periodo, e poter elencare — utile di per sé — anche chi è a zero ore.
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
  // lavorato di più salta subito all'occhio. Parte dalla rosa della squadra
  // (non dalle sole voci) così anche chi è a zero ore compare nell'elenco
  // sotto (da cui si apre comunque il suo dettaglio).
  const byWorker = useMemo(() => {
    const map = new Map()
    for (const w of workers) {
      map.set(w.id, { workerId: w.id, workerName: w.name || w.username || t('common.noName'), total: 0, maxMonthlyHours: w.maxMonthlyHours || null })
    }
    for (const e of filtered) {
      if (!map.has(e.workerId)) map.set(e.workerId, { workerId: e.workerId, workerName: e.workerName || t('common.noName'), total: 0, maxMonthlyHours: null })
      const g = map.get(e.workerId)
      if (e.hours != null) g.total += e.hours
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered, workers, t])

  const activeWorkers = byWorker.filter(w => w.total > 0)
  const grandTotal = byWorker.reduce((sum, g) => sum + g.total, 0)

  const chartMaxScale = useMemo(() => {
    const values = activeWorkers.flatMap(w => [w.total, w.maxMonthlyHours || 0])
    return Math.ceil(Math.max(1, ...values) * 1.1)
  }, [activeWorkers])

  // Il limite ore è un concetto mensile: confrontarlo con "tutto lo storico"
  // (che copre più mesi) non avrebbe senso, quindi il grafico giornaliero
  // compare solo su un mese preciso — anche perché lo storico può coprire
  // anni, e una curva a granularità giornaliera diventerebbe illeggibile.
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
      <div className="period-nav" style={{ margin: '0 16px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
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
        .wh-worker-row:hover { background: var(--card2); }
        /* Il rimbalzo globale al click (scale + molla) su un mouse desktop
           resta visibile più a lungo che su un tap ed è più marcato su un
           controllo largo come questo — stesso identico problema già
           risolto altrove in .admin-user-modal, qui solo attenuato invece
           di eliminato del tutto (le frecce restano comunque cliccabili
           "a raffica" per scorrere i mesi). */
        .period-nav button:not(:disabled):active {
          transform: scale(0.99);
          filter: none;
          box-shadow: none;
        }
      `}</style>

      {workers.length === 0 ? (
        <div className="empty-state">
          <p style={{ color: 'var(--text3)', marginBottom: 4 }}><Clock size={40} /></p>
          <h3>{t('workHours.reportEmptyTitle')}</h3>
          <p>{t('workHours.reportEmptyDesc')}</p>
        </div>
      ) : (
        <>
          {/* Panoramica: il totale è la didascalia del grafico, non una card
              a sé — il numero isolato in un cerchio con etichetta sotto è il
              default che si vuole evitare qui. Il grafico compare solo se
              qualcuno ha davvero lavorato in questo periodo. */}
          <div style={{ margin: '0 16px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: activeWorkers.length > 0 ? 16 : 0 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  {isAllTime ? t('workHours.periodAll') : monthLabel(periodKey)}
                </p>
                <p style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)' }}>
                  {fmtHours(grandTotal)} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{t('workHours.totalAcrossTeam', { count: activeWorkers.length })}</span>
                </p>
              </div>
              {filtered.length > 0 && (
                <button onClick={exportCSV} className="btn-no-anim" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text2)', padding: '4px 2px', background: 'transparent', border: 'none' }}>
                  <Download size={14} /> CSV
                </button>
              )}
            </div>
            {activeWorkers.length > 0 && <HoursBarChart rows={activeWorkers} maxScale={chartMaxScale} />}
          </div>

          {!isAllTime && trendDays.some(d => d.total > 0) && (
            <div style={{ margin: '0 16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 16px 10px' }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('workHours.trendTitle')}</p>
              <HoursTrendChart days={trendDays} />
            </div>
          )}

          {/* Tutta la squadra, non solo chi ha lavorato — un tap apre il
              dettaglio della persona (voci, assenze, ferie), questa riga non
              fa altro che navigare lì. */}
          <div style={{ margin: '0 16px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {byWorker.map((g, i) => (
              <button
                key={g.workerId}
                onClick={() => navigate(`/admin/settings/work-hours/${g.workerId}`)}
                className="wh-worker-row"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '13px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  background: 'transparent', textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.workerName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, fontVariantNumeric: 'tabular-nums', color: g.total > 0 ? 'var(--accent)' : 'var(--text3)' }}>{fmtHours(g.total)}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 17 }}>›</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
