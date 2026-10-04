import { useState, useEffect, useRef } from 'react'
import { Clock } from './Icon'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // passi da 5 minuti — abbastanza precisi per un orario di lavoro, senza 60 righe da scorrere
const pad = n => String(n).padStart(2, '0')

// Interpreta quello che è stato digitato a mano, non solo scelto dal
// pannello — "9:30" (due punti già scritti), "930"/"1430" (senza due punti,
// 3 cifre = H+MM, 4 cifre = HH+MM) o anche solo "14" (ora, minuti a 00).
// Serve perché il pannello sotto può restare parzialmente coperto quando il
// campo è dentro un modal scorrevole — scrivere l'orario a tastiera deve
// funzionare comunque, senza dover per forza vedere/toccare il pannello.
function parseTypedTime(raw) {
  const colonMatch = raw.match(/^(\d{1,2}):(\d{1,2})$/)
  if (colonMatch) {
    return `${pad(Math.min(parseInt(colonMatch[1], 10), 23))}:${pad(Math.min(parseInt(colonMatch[2], 10), 59))}`
  }
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  let hh, mm
  if (digits.length <= 2) { hh = parseInt(digits, 10); mm = 0 }
  else if (digits.length === 3) { hh = parseInt(digits.slice(0, 1), 10); mm = parseInt(digits.slice(1), 10) }
  else { hh = parseInt(digits.slice(0, 2), 10); mm = parseInt(digits.slice(2, 4), 10) }
  return `${pad(Math.min(Math.max(hh, 0), 23))}:${pad(Math.min(Math.max(mm, 0), 59))}`
}

// Sostituto di <input type="time">, stesso spirito e stessa "famiglia
// visiva" di DateField.jsx (trigger + pannello ancorato sotto, azione
// rapida in fondo) — non lo stesso widget nativo del sistema operativo, che
// varia troppo da un telefono all'altro e non si può vestire con lo stile
// dell'app. Il trigger è un vero <input>: digitare l'orario funziona sempre
// (conferma a Invio/uscita dal campo), il pannello sotto resta disponibile
// per chi preferisce scorrere invece di scrivere.
export default function TimeField({ value, onChange, placeholder = 'Seleziona ora', clearable = false }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(value || '')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const hourListRef = useRef(null)
  const minuteListRef = useRef(null)
  const [h, m] = value ? value.split(':').map(Number) : [null, null]

  // Segue il valore esterno (scelto dal pannello, "Adesso", ecc.) quando
  // cambia da fuori — ma non mentre si sta scrivendo, altrimenti ogni
  // sincronizzazione cancellerebbe quello che si sta ancora battendo.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setTyped(value || '')
  }, [value])

  const commitTyped = () => {
    const trimmed = typed.trim()
    if (!trimmed) { if (clearable) onChange(''); else setTyped(value || ''); return }
    const parsed = parseTypedTime(trimmed)
    if (parsed) onChange(parsed)
    else setTyped(value || '') // non interpretabile: torna al valore precedente
  }

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Sempre ancorato sotto (mai sopra): dentro un modal scorrevole, aprirsi
  // verso l'alto rischiava di uscire dal bordo del modal stesso e venire
  // tagliato a metà, senza modo di scorrere per rivederlo. Verso il basso,
  // il modal scorre normalmente e il pannello resta sempre raggiungibile.
  //
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
        .tf-input:focus { box-shadow: none !important; }
        .tf-opt { transition: background 0.1s; }
        .tf-opt:not(.tf-opt-sel):hover { background: var(--card2) !important; }
        .tf-now:hover { opacity: 0.7; }
      `}</style>

      <div
        className="tf-trigger"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '9px 12px', borderRadius: 10, background: 'var(--card2)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={5}
          className="tf-input"
          value={typed}
          onFocus={() => setOpen(true)}
          onChange={e => setTyped(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={e => {
            if (e.key === 'Enter') { commitTyped(); setOpen(false); e.currentTarget.blur() }
            if (e.key === 'Escape') { setTyped(value || ''); setOpen(false); e.currentTarget.blur() }
          }}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0, width: '100%', background: 'transparent', border: 'none', padding: 0,
            color: value ? 'var(--text)' : 'var(--text3)', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span
          onClick={() => { inputRef.current?.focus(); setOpen(o => !o) }}
          style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex', cursor: 'pointer' }}
        >
          <Clock size={15} />
        </span>
      </div>

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
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="tf-now" onClick={pickNow}
              style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 700 }}>
              Adesso
            </button>
            {clearable && value && (
              <button type="button" className="tf-now" onClick={() => { onChange(''); setOpen(false) }}
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
