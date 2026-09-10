import { useState, useEffect, useRef } from 'react'
import { Clock } from './Icon'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // passi da 5 minuti — abbastanza precisi per un orario di lavoro, senza 60 righe da scorrere
const pad = n => String(n).padStart(2, '0')

// Sostituto di <input type="time">, stesso spirito e stessa "famiglia
// visiva" di DateField.jsx (trigger + pannello ancorato sotto, azione
// rapida in fondo) — non lo stesso widget nativo del sistema operativo, che
// varia troppo da un telefono all'altro e non si può vestire con lo stile
// dell'app.
export default function TimeField({ value, onChange, placeholder = 'Seleziona ora' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const hourListRef = useRef(null)
  const minuteListRef = useRef(null)
  const [h, m] = value ? value.split(':').map(Number) : [null, null]

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Alla riapertura, porta subito in vista l'ora/i minuti già scelti invece
  // di far scorrere l'utente fino in fondo alla lista per trovarli.
  useEffect(() => {
    if (!open) return
    hourListRef.current?.querySelector('.tf-opt-sel')?.scrollIntoView({ block: 'center' })
    minuteListRef.current?.querySelector('.tf-opt-sel')?.scrollIntoView({ block: 'center' })
  }, [open])

  const pick = (nh, nm) => onChange(`${pad(nh)}:${pad(nm)}`)
  const pickNow = () => {
    const now = new Date()
    onChange(`${pad(now.getHours())}:${pad(Math.round(now.getMinutes() / 5) * 5 % 60)}`)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <style>{`
        .tf-trigger { transition: border-color 0.15s; }
        .tf-trigger:hover { border-color: var(--text2) !important; filter: none !important; transform: none !important; box-shadow: none !important; }
        .tf-trigger:active { transform: none !important; filter: none !important; }
        .tf-opt { transition: background 0.1s; }
        .tf-opt:not(.tf-opt-sel):hover { background: var(--card2) !important; }
        .tf-now:hover { opacity: 0.7; }
      `}</style>

      <button
        type="button"
        className="tf-trigger"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '9px 12px', borderRadius: 10, background: 'var(--card2)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: value ? 'var(--text)' : 'var(--text3)', fontSize: 14, fontWeight: 600,
          textAlign: 'left', fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{value || placeholder}</span>
        <span style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex' }}><Clock size={15} /></span>
      </button>

      {open && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', width: 150, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '9px 9px 7px', boxShadow: '0 8px 28px rgba(0,0,0,0.14)', zIndex: 100 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <div ref={hourListRef} style={{ flex: 1, height: 168, overflowY: 'auto' }}>
              {HOURS.map(opt => {
                const isSel = h === opt
                return (
                  <button
                    key={opt} type="button"
                    className={`tf-opt${isSel ? ' tf-opt-sel' : ''}`}
                    onClick={() => pick(opt, m ?? 0)}
                    style={{
                      width: '100%', padding: '7px 0', borderRadius: 7, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                      fontWeight: isSel ? 800 : 500,
                      background: isSel ? 'var(--accent)' : 'transparent',
                      color: isSel ? '#fff' : 'var(--text)',
                    }}
                  >
                    {pad(opt)}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text3)', fontWeight: 700 }}>:</div>
            <div ref={minuteListRef} style={{ flex: 1, height: 168, overflowY: 'auto' }}>
              {MINUTES.map(opt => {
                const isSel = m === opt
                return (
                  <button
                    key={opt} type="button"
                    className={`tf-opt${isSel ? ' tf-opt-sel' : ''}`}
                    onClick={() => pick(h ?? 0, opt)}
                    style={{
                      width: '100%', padding: '7px 0', borderRadius: 7, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                      fontWeight: isSel ? 800 : 500,
                      background: isSel ? 'var(--accent)' : 'transparent',
                      color: isSel ? '#fff' : 'var(--text)',
                    }}
                  >
                    {pad(opt)}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="tf-now" onClick={pickNow}
              style={{ width: '100%', padding: '6px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 700 }}>
              Adesso
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
