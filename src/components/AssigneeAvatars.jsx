import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { personColor } from '../utils/assignmentBlocks'

export const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

// Solo il cerchio con le iniziali (senza fumetto): per i riepiloghi dove il nome è già scritto accanto.
export function PersonAvatar({ person, size = 22 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: personColor(person.id || person.key || person.name), color: '#fff', fontSize: Math.round(size * 0.42), fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {initials(person.name)}
    </span>
  )
}

// Pallino con le iniziali di una persona. Al passaggio del mouse (computer) o al tocco (telefono)
// mostra nome e orario in un fumetto. Il fumetto è `position: fixed` in un portale, non dentro la
// colonna: così nomi lunghi possono uscire dai bordi della colonna (o della card) senza essere
// tagliati, e restano comunque dentro lo schermo.
// person = { key, id?, name, hours? }
export function PersonDot({ person, size = 24, className, style, content, children }) {
  const dotRef = useRef(null)
  const tipRef = useRef(null)
  const [tip, setTip] = useState(null)   // { x, y } centro-alto del pallino
  const label = `${person.name}${person.hours ? ` · ${person.hours}` : ''}`

  const show = () => {
    const r = dotRef.current?.getBoundingClientRect()
    if (r) setTip({ x: r.left + r.width / 2, y: r.top, bottom: r.bottom })
  }

  // Tocco: chiude toccando altrove o scorrendo.
  useEffect(() => {
    if (!tip) return
    const off = e => { if (e.type === 'scroll' || !dotRef.current?.contains(e.target)) setTip(null) }
    document.addEventListener('pointerdown', off, true)
    window.addEventListener('scroll', off, true)
    return () => { document.removeEventListener('pointerdown', off, true); window.removeEventListener('scroll', off, true) }
  }, [tip])

  // Tiene il fumetto dentro lo schermo (sposta in orizzontale, o sotto il pallino se non c'è posto sopra).
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!tip || !el) return
    const w = el.offsetWidth, h = el.offsetHeight
    const left = Math.min(Math.max(tip.x - w / 2, 8), window.innerWidth - w - 8)
    const above = tip.y - h - 8 >= 8
    el.style.left = `${left}px`
    el.style.top = `${above ? tip.y - h - 8 : tip.bottom + 8}px`
    el.style.opacity = '1'
  }, [tip])

  return (
    <>
      <span ref={dotRef} className={className} role="img" aria-label={label}
        onMouseEnter={() => { if (canHover()) show() }}
        onMouseLeave={() => { if (canHover()) setTip(null) }}
        onClick={e => { if (canHover()) return; e.stopPropagation(); tip ? setTip(null) : show() }}
        style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: personColor(person.id || person.key), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'default', ...style }}>
        {content ?? initials(person.name)}
        {children}
      </span>
      {tip && createPortal(
        <div ref={tipRef} role="tooltip"
          style={{ position: 'fixed', left: tip.x, top: tip.y, opacity: 0, zIndex: 2000, pointerEvents: 'none', background: '#1a1a1a', color: '#fff', padding: '6px 10px', borderRadius: 8, width: 'max-content', maxWidth: 240, transition: 'opacity .12s ease' }}>
          <strong style={{ display: 'block', fontSize: 11.5, fontWeight: 700 }}>{person.name}</strong>
          {person.hours && <span style={{ display: 'block', color: '#c9c9c9', fontSize: 10, marginTop: 1 }}>{person.hours}</span>}
        </div>,
        document.body
      )}
    </>
  )
}

// Pallini con le iniziali di chi lavora su un evento/attività, come nelle card del Calendario
// degli admin (CalendarSidePanel). `people` = [{ key, id, name, hours? }]; il colore è stabile
// per persona (personColor).
export default function AssigneeAvatars({ people, max = 6, style }) {
  if (!people || people.length === 0) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', ...style }}>
      {shown.map(p => <PersonDot key={p.key} person={p} />)}
      {extra > 0 && (
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--c-fill)', color: 'var(--c-ink2)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+{extra}</span>
      )}
    </div>
  )
}
