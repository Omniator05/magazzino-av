import { useState, useRef, useEffect } from 'react'
import { Check } from './Icon'

const ChevronDown = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

// Sostituto leggero del <select> nativo: il campo chiuso ha lo stesso
// ingombro/stile di un input, e la lista si apre ANCORATA subito sotto (come
// farebbe il menu nativo), non in un popup/dialogo a schermo intero — bianca
// e con il font dell'app, non quella del sistema operativo che il browser
// non lascia mai personalizzare per un <select> vero.
export default function Picker({ value, onChange, options, placeholder, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const onOutside = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position:'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="btn-no-anim"
        style={{
          display:'flex', alignItems:'center', gap:8, width:'100%',
          border:'1px solid var(--border2)', background:'var(--card)', color: selected ? 'var(--text)' : 'var(--text3)',
          borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:15, fontFamily:'inherit', textAlign:'left',
        }}
      >
        {selected?.icon && <span style={{ fontSize:17, flexShrink:0, display:'flex' }}>{selected.icon}</span>}
        <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {selected ? selected.label : (placeholder || '')}
        </span>
        <span style={{ color:'var(--text2)', flexShrink:0, display:'flex', transition:'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
          <ChevronDown />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:50,
            background:'var(--card)', border:'1px solid var(--border2)', borderRadius:'var(--radius-sm)',
            boxShadow:'0 12px 32px rgba(0,0,0,0.16)', maxHeight:260, overflowY:'auto', padding:6,
          }}
        >
          {options.map(o => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="btn-no-anim picker-option"
                style={{
                  display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
                  padding:'10px', borderRadius:8, fontFamily:'inherit',
                  background: isSelected ? 'rgba(230,57,70,0.08)' : undefined,
                  color: isSelected ? 'var(--accent)' : 'var(--text)',
                  fontWeight: isSelected ? 700 : 500, fontSize:14,
                }}
              >
                {o.icon && <span style={{ fontSize:17, flexShrink:0, display:'flex' }}>{o.icon}</span>}
                <span style={{ flex:1, minWidth:0 }}>{o.label}</span>
                {isSelected && <span style={{ flexShrink:0, display:'flex' }}><Check size={15} /></span>}
              </button>
            )
          })}
        </div>
      )}
      {/* L'hover di default dei bottoni (ombra+luce) sull'intera riga era
          eccessivo per una lista di opzioni — solo uno sfondo leggero. */}
      <style>{`
        .picker-option { background: transparent; }
        @media (hover: hover) and (pointer: fine) {
          .picker-option:hover { background: var(--card2); }
        }
      `}</style>
    </div>
  )
}
