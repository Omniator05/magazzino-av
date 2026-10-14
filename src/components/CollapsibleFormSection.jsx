// Sezione di form retraibile, chiusa di default quando è vuota — stesso
// pattern già usato per "Le mie assenze" in Calendar.jsx (bottone piatto +
// freccia che ruota), qui riusabile perché serve identico in più form
// (creazione/modifica evento): campi che si usano solo ogni tanto non
// devono restare sempre in vista, ma se contengono già un valore (modifica
// di un evento esistente) un puntino lo segnala anche da chiusa.
export default function CollapsibleFormSection({ label, open, onToggle, hasValue, children }) {
  return (
    <div className="form-group">
      <button type="button" onClick={onToggle} className="btn-no-anim" aria-expanded={open}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:6, background:'transparent', border:'none', padding:0, marginBottom: open ? 10 : 0 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{label}</span>
        {hasValue && !open && <span aria-hidden="true" style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} />}
        <span style={{ marginLeft:'auto', color:'var(--text2)', display:'flex', transition:'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </button>
      {open && children}
    </div>
  )
}
