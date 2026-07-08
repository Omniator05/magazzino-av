import { useState, useEffect, useRef } from 'react'

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const pad = n => String(n).padStart(2, '0')
const toYMD = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayYMD = () => { const t = new Date(); return toYMD(t.getFullYear(), t.getMonth(), t.getDate()) }

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

export default function DateField({ value, onChange, min, placeholder = 'Seleziona data', clearable = false }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const init = value ? new Date(value + 'T12:00:00') : new Date()
  const [view, setView] = useState({ year: init.getFullYear(), month: init.getMonth() })

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const label = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : placeholder

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })

  const pick = (d) => {
    const ymd = toYMD(view.year, view.month, d)
    if (min && ymd < min) return
    onChange(ymd)
    setOpen(false)
  }

  const cells = monthGrid(view.year, view.month)
  const today = todayYMD()

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{`
        .df-trigger { transition: border-color 0.15s; }
        .df-trigger:hover { border-color: var(--text2) !important; filter: none !important; transform: none !important; box-shadow: none !important; }
        .df-trigger:active { transform: none !important; filter: none !important; }
        .df-day { transition: background 0.1s; }
        .df-day:not(:disabled):not(.df-sel):hover { background: var(--card2) !important; }
        .df-nav-btn:hover { opacity: 0.65; }
        .df-action:hover { opacity: 0.7; }
      `}</style>

      <button
        type="button"
        className="df-trigger"
        onClick={() => { if (value) { const dt = new Date(value + 'T12:00:00'); setView({ year: dt.getFullYear(), month: dt.getMonth() }) } setOpen(o => !o) }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '9px 12px', borderRadius: 10, background: 'var(--card2)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: value ? 'var(--text)' : 'var(--text3)', fontSize: 14, fontWeight: 600,
          textAlign: 'left', textTransform: 'capitalize',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 210, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '9px 9px 7px', boxShadow: '0 8px 28px rgba(0,0,0,0.14)', zIndex: 100 }}>
          {/* Navigazione mese */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="df-nav-btn" onClick={prevMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{MONTHS[view.month]} {view.year}</span>
            <button type="button" className="df-nav-btn" onClick={nextMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>›</button>
          </div>

          {/* Intestazione giorni */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 3 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)', padding: '2px 0' }}>{w}</div>
            ))}
          </div>

          {/* Griglia giorni */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />
              const ymd = toYMD(view.year, view.month, d)
              const isSel = value === ymd
              const isToday = today === ymd
              const disabled = min && ymd < min
              return (
                <button
                  key={i}
                  type="button"
                  className={`df-day${isSel ? ' df-sel' : ''}`}
                  disabled={disabled}
                  onClick={() => pick(d)}
                  style={{
                    aspectRatio: '1', borderRadius: 7, fontSize: 12,
                    fontWeight: isSel || isToday ? 800 : 500,
                    background: isSel ? 'var(--accent)' : 'transparent',
                    color: disabled ? 'var(--border)' : isSel ? '#fff' : isToday ? 'var(--accent)' : 'var(--text)',
                    border: isToday && !isSel ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>

          {/* Azioni rapide */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="df-action" onClick={() => { const t = today; if (!(min && t < min)) { onChange(t); setOpen(false) } }}
              disabled={min && today < min}
              style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 700, opacity: (min && today < min) ? 0.4 : 1 }}>
              Oggi
            </button>
            {clearable && value && (
              <button type="button" className="df-action" onClick={() => { onChange(''); setOpen(false) }}
                style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>
                Cancella
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
