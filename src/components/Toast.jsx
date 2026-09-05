import { Check } from './Icon'

// Conferma "fatto, andato a buon fine" dopo un'azione (creare un oggetto, un
// magazziniere, un task, un furgone...) — prima il modal si limitava a
// sparire di scatto, senza nessun riscontro che il salvataggio fosse andato
// a buon fine. Le pagine già gestiscono testo e timer (showToast(msg) +
// setTimeout), questo componente pensa solo a COME mostrarlo: un fade + un
// leggero scivolamento verso il basso, decelerazione pulita (niente rimbalzo/
// elastico, si spegne semplicemente), non un pop/scompaio istantaneo.
export default function Toast({ message }) {
  if (!message) return null
  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity:0; transform:translate(-50%,-10px) scale(0.97); }
          to   { opacity:1; transform:translate(-50%,0) scale(1); }
        }
      `}</style>
      <div role="status" style={{
        position:'fixed', top:16, left:'50%', transform:'translate(-50%,0)', zIndex:999,
        background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
        padding:'10px 18px 10px 14px', boxShadow:'var(--shadow)',
        display:'flex', alignItems:'center', gap:8,
        fontSize:14, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap',
        animation:'toastIn 0.32s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <span style={{ color:'var(--green)', display:'flex', flexShrink:0 }}><Check size={16} /></span>
        {message}
      </div>
    </>
  )
}
