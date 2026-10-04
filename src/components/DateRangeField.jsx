import { useState, useLayoutEffect, useEffect, useRef } from 'react'

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

const fmtShort = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
const fmtFull = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

// Selettore di intervallo a calendario unico, stile "booking": stessa logica
// di selezione già usata in Calendar.jsx/WorkerCalendar.jsx per il periodo
// d'assenza (rangeStart/hoverDate), qui adattata a un widget compatto
// ancorato a popup (stessa struttura trigger+popup di DateField.jsx) invece
// che al calendario a pagina intera. Sostituisce due DateField separati
// (Dal/Al): primo tap = giorno singolo (subito valido, controllato dal vivo);
// tap successivo su un giorno diverso = estende l'intervallo fino a lì, con
// le date intermedie leggermente colorate; tap successivo ancora riparte da
// zero con un nuovo giorno singolo.
export default function DateRangeField({ start, end, onChange, min, placeholder = 'Seleziona periodo' }) {
  const [open, setOpen] = useState(false)
  const [selecting, setSelecting] = useState(false) // true = primo giorno già scelto, in attesa del secondo tap
  const [hoverDate, setHoverDate] = useState(null)
  const containerRef = useRef(null)
  const [popupLeft, setPopupLeft] = useState(null)
  const [popupAbove, setPopupAbove] = useState(false)
  const init = start ? new Date(start + 'T12:00:00') : new Date()
  const [view, setView] = useState({ year: init.getFullYear(), month: init.getMonth() })

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Stesso clamp anti-overflow già applicato a DateField.jsx — qui il
  // popup è più largo (griglia più leggibile per un intervallo), quindi la
  // misura va rifatta con la sua larghezza reale. Stessa misura decide
  // anche se aprire sopra invece che sotto quando non c'è spazio sotto.
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return
    const POPUP_W = 252, POPUP_H = 340, MARGIN = 8
    const compute = () => {
      const rect = containerRef.current.getBoundingClientRect()
      let left = rect.width - POPUP_W
      if (rect.left + left < MARGIN) left = MARGIN - rect.left
      setPopupLeft(left)
      const spaceBelow = window.innerHeight - rect.bottom
      setPopupAbove(spaceBelow < POPUP_H && rect.top > spaceBelow)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [open])

  const openPopup = () => {
    const initDate = start ? new Date(start + 'T12:00:00') : new Date()
    setView({ year: initDate.getFullYear(), month: initDate.getMonth() })
    setSelecting(false)
    setHoverDate(null)
    setOpen(o => !o)
  }

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })

  const tapDay = (ymd) => {
    if (min && ymd < min) return
    if (!selecting) {
      onChange(ymd, ymd)
      setSelecting(true)
      setHoverDate(null)
    } else {
      const lo = ymd <= start ? ymd : start
      const hi = ymd <= start ? start : ymd
      onChange(lo, hi)
      setSelecting(false)
      setHoverDate(null)
      setOpen(false)
    }
  }

  const cells = monthGrid(view.year, view.month)
  const today = todayYMD()

  // Estremi da evidenziare: durante la selezione (secondo tap non ancora
  // dato) l'anteprima segue il giorno sotto al mouse, come in Calendar.jsx.
  const previewEnd = selecting ? (hoverDate || start) : end
  const lo = start && previewEnd ? (start <= previewEnd ? start : previewEnd) : start
  const hi = start && previewEnd ? (start <= previewEnd ? previewEnd : start) : start

  const label = start
    ? (!end || start === end ? fmtFull(start) : `${fmtShort(start)} – ${fmtFull(end)}`)
    : placeholder

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{`
        .drf-trigger { transition: border-color 0.15s; }
        .drf-trigger:hover { border-color: var(--text2) !important; filter: none !important; transform: none !important; box-shadow: none !important; }
        .drf-trigger:active { transform: none !important; filter: none !important; }
        .drf-day { transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
        .drf-day:not(:disabled):not(.drf-endpoint):hover { background: var(--card2) !important; }
        .drf-nav-btn:hover { opacity: 0.65; }
      `}</style>

      <button
        type="button"
        className="drf-trigger"
        onClick={openPopup}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 12px', borderRadius: 10, background: 'var(--card2)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: start ? 'var(--text)' : 'var(--text3)', fontSize: 14, fontWeight: 700,
          textAlign: 'left', textTransform: 'capitalize',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', ...(popupAbove ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), width: 252, ...(popupLeft != null ? { left: popupLeft } : { right: 0 }), background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '10px 10px 8px', boxShadow: '0 8px 28px rgba(0,0,0,0.14)', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="drf-nav-btn" onClick={prevMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{MONTHS[view.month]} {view.year}</span>
            <button type="button" className="drf-nav-btn" onClick={nextMonth} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>›</button>
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
              const isEndpoint = ymd === lo || ymd === hi
              const isInRange = lo && hi && ymd > lo && ymd < hi
              const isToday = today === ymd
              const disabled = min && ymd < min
              return (
                <button
                  key={i}
                  type="button"
                  className={`drf-day${isEndpoint ? ' drf-endpoint' : ''}`}
                  disabled={disabled}
                  onClick={() => tapDay(ymd)}
                  onMouseEnter={() => { if (selecting) setHoverDate(ymd) }}
                  style={{
                    aspectRatio: '1', borderRadius: isInRange ? 4 : 7, fontSize: 12,
                    fontWeight: isEndpoint || isToday ? 800 : 500,
                    background: isEndpoint ? 'var(--accent)' : isInRange ? 'rgba(230,57,70,0.12)' : 'transparent',
                    color: disabled ? 'var(--border)' : isEndpoint ? '#fff' : isToday ? 'var(--accent)' : 'var(--text)',
                    border: isToday && !isEndpoint ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              className="drf-nav-btn"
              onClick={() => { if (!(min && today < min)) { onChange(today, today); setSelecting(false); setHoverDate(null); setOpen(false) } }}
              disabled={min && today < min}
              style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 700, opacity: (min && today < min) ? 0.4 : 1 }}
            >
              Oggi
            </button>
            {selecting && (
              <button
                type="button"
                className="drf-nav-btn"
                onClick={() => { setSelecting(false); setHoverDate(null) }}
                style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}
              >
                Annulla
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
