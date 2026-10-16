import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PendingButton from './PendingButton'

// Popup semplice per chiedere il nome di una lista di carico (nuova,
// rinominata, o creata spostandoci le righe non caricate). Stessa grafica del
// popup di conferma dell'app (card centrale piccola, niente ✕).
export default function ListNameModal({ open, title, message, initialName = '', confirmLabel, cancelLabel, placeholder, onConfirm, onCancel }) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    const id = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const trimmed = name.trim()
  // onConfirm può ritornare una promessa: il bottone mostra lo spinner finché finisce.
  const submit = () => (trimmed ? onConfirm(trimmed) : undefined)

  return createPortal(
    <div onClick={onCancel} style={{ position:'fixed', inset:0, zIndex:10002, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ background:'var(--c-surface)', borderRadius:24, padding:'24px 22px 20px', width:'100%', maxWidth:330, boxShadow:'0 24px 70px rgba(0,0,0,0.35)' }}>
        <h3 style={{ fontSize:18, fontWeight:800, color:'var(--c-ink)', margin:'0 0 6px', letterSpacing:'-0.3px', textAlign:'center' }}>{title}</h3>
        {message && <p style={{ fontSize:14, color:'var(--c-ink2)', margin:'0 0 14px', lineHeight:1.45, textAlign:'center' }}>{message}</p>}
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder}
          maxLength={40}
          style={{ width:'100%', padding:'11px 12px', borderRadius:12, border:'1.5px solid var(--c-line)', background:'var(--c-alt)', color:'var(--c-ink)', fontSize:15, marginTop: message ? 0 : 10 }}
        />
        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          <button onClick={onCancel} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'var(--c-fill)', color:'var(--c-ink2)', border:'none' }}>{cancelLabel}</button>
          <PendingButton onClick={submit} disabled={!trimmed} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'var(--accent)', color:'#fff', border:'none', opacity: trimmed ? 1 : 0.5 }}>{confirmLabel}</PendingButton>
        </div>
      </div>
    </div>,
    document.body
  )
}
