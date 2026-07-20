// Bottone "+" flottante in basso a destra, stesso stile di quello usato per
// creare un nuovo evento in Calendar.jsx — riusato per Task, Furgoni e Template
// al posto del vecchio bottone "+" nell'header pagina.
export default function FabButton({ onClick, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        position:'fixed', bottom:'calc(env(safe-area-inset-bottom) + 132px)', right:20, zIndex:50,
        width:56, height:56, borderRadius:'50%',
        background:'var(--accent)', color:'white',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 4px 16px rgba(216,56,63,0.4)',
        border:'none',
      }}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  )
}
