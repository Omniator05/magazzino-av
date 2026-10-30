import { useState } from 'react'

import { useTranslation } from 'react-i18next'
import { monthNames, weekdayInitials, localeFor } from '../utils/formatDate'

const pad = n => String(n).padStart(2, '0')
const toYMD = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

// Calendario sempre aperto (non un popup come DateField) a selezione
// multipla: per un rent con date sparse nel mese, senza un pattern
// settimanale/mensile regolare da esprimere con "Ripeti" — qui si clicca
// ogni giorno interessato uno per uno, anche su mesi diversi cambiando vista
// con le frecce, invece di dover creare un evento separato per ciascuno.
// `anchorDate` (la data principale già scelta più in alto nel form) viene
// mostrata ma non è selezionabile qui: conta già come prima occorrenza,
// aggiungerla anche alla lista creerebbe un doppione.
export default function MultiDateField({ dates, onChange, anchorDate }) {
  const { i18n } = useTranslation()
  const MONTHS = monthNames(i18n.language)
  const WEEKDAYS = weekdayInitials(i18n.language)
  const init = anchorDate ? new Date(anchorDate + 'T12:00:00') : new Date()
  const [view, setView] = useState({ year: init.getFullYear(), month: init.getMonth() })

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })

  const toggle = (ymd) => {
    if (ymd === anchorDate) return
    const next = dates.includes(ymd) ? dates.filter(d => d !== ymd) : [...dates, ymd]
    onChange(next.sort())
  }

  const cells = monthGrid(view.year, view.month)

  return (
    <div>
      <style>{`
        .mdf-day { transition: background 0.1s; }
        .mdf-day:not(:disabled):not(.mdf-sel):hover { background: var(--card2) !important; }
        .mdf-nav-btn:hover { opacity: 0.65; }
        .mdf-chip-x:hover { opacity: 0.7; }
      `}</style>

      {/* Larghezza fissa come il pannello a ghiera di DateField (210px) — qui
          non è un popup flottante ma inline nel form, quindi senza un limite
          esplicito si allarga a tutta la larghezza del modal: con 7 colonne
          e aspectRatio:1 ogni cella diventa enorme invece di restare un
          calendarietto compatto. */}
      <div style={{ width: 230, maxWidth: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 13, padding: '9px 9px 7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" className="mdf-nav-btn" onClick={prevMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{MONTHS[view.month]} {view.year}</span>
          <button type="button" className="mdf-nav-btn" onClick={nextMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 3 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '2px 0' }}>{w}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />
            const ymd = toYMD(view.year, view.month, d)
            const isAnchor = ymd === anchorDate
            const isSel = dates.includes(ymd)
            return (
              <button
                key={i}
                type="button"
                className={`mdf-day${isSel ? ' mdf-sel' : ''}`}
                disabled={isAnchor}
                onClick={() => toggle(ymd)}
                title={isAnchor ? 'Data principale dell\'evento' : undefined}
                style={{
                  aspectRatio: '1', borderRadius: 7, fontSize: 12,
                  fontWeight: isSel || isAnchor ? 800 : 500,
                  background: isSel ? 'var(--blue)' : 'transparent',
                  color: isAnchor ? 'var(--accent)' : isSel ? '#fff' : 'var(--text)',
                  border: isAnchor ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isAnchor ? 'default' : 'pointer',
                }}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {dates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {dates.map(ymd => {
            const d = new Date(ymd + 'T12:00:00')
            return (
              <span key={ymd} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 5px 4px 9px', borderRadius: 14, background: 'rgba(79,195,247,0.12)', border: '1px solid var(--blue)', fontSize: 11.5, fontWeight: 700, color: 'var(--blue)' }}>
                {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}
                <button type="button" className="mdf-chip-x" onClick={() => toggle(ymd)} aria-label={`Rimuovi ${ymd}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', background: 'rgba(79,195,247,0.18)', color: 'var(--blue)', fontSize: 9, fontWeight: 900, flexShrink: 0 }}>✕</button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
