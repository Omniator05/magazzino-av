import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const ConfirmContext = createContext(null)

const IconWarn = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)
const IconQuestion = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

export function ConfirmProvider({ children }) {
  const [state, setState]   = useState(null)   // opzioni del dialog attivo
  const [closing, setClosing] = useState(false)
  const resolver = useRef(null)

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolver.current = resolve
      setState(typeof options === 'string' ? { message: options } : (options || {}))
    })
  }, [])

  const finish = useCallback((result) => {
    setClosing(true)
    setTimeout(() => {
      setState(null)
      setClosing(false)
      if (resolver.current) { resolver.current(result); resolver.current = null }
    }, 150)
  }, [])

  // Tastiera: Invio conferma, Esc annulla
  useEffect(() => {
    if (!state) return
    const onKey = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); finish(true) }
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, finish])

  const o = state || {}
  const danger = !!o.danger
  const accent = danger ? '#dc2626' : 'var(--accent)'
  const tint   = danger ? 'rgba(220,38,38,0.12)' : 'rgba(230,57,70,0.10)'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && createPortal(
        <div
          onClick={() => finish(false)}
          style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: closing ? 'cfFadeOut 0.15s ease forwards' : 'cfFadeIn 0.15s ease' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ background:'#fff', borderRadius:24, padding:'26px 22px 20px', width:'100%', maxWidth:330, textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: closing ? 'cfPopOut 0.15s ease forwards' : 'cfPopIn 0.24s cubic-bezier(0.32,0.72,0,1)' }}
          >
            <div style={{ width:54, height:54, borderRadius:'50%', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:tint, color:accent }}>
              {danger ? <IconWarn /> : <IconQuestion />}
            </div>
            {o.title && <h3 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.3px' }}>{o.title}</h3>}
            {o.message && <p style={{ fontSize:14, color:'#6b7280', margin:0, lineHeight:1.45, whiteSpace:'pre-line' }}>{o.message}</p>}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => finish(false)} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:'#f3f4f6', color:'#374151', border:'none', cursor:'pointer' }}>
                {o.cancelLabel || 'Annulla'}
              </button>
              <button onClick={() => finish(true)} style={{ flex:1, padding:12, borderRadius:13, fontSize:14, fontWeight:700, background:accent, color:'#fff', border:'none', cursor:'pointer' }}>
                {o.confirmLabel || 'Conferma'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes cfFadeIn  { from{opacity:0} to{opacity:1} }
            @keyframes cfFadeOut { from{opacity:1} to{opacity:0} }
            @keyframes cfPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
            @keyframes cfPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
          `}</style>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
