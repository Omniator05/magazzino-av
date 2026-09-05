// Controllo a segmenti con la "pillola" bianca che scorre verso l'opzione
// scelta — stesso meccanismo della barra di navigazione in basso (TabBar):
// un elemento assoluto largo esattamente uno slot, spostato con translateX
// in percentuale del proprio indice, invece di un cambio di sfondo secco.
// Condiviso da ogni scelta a 2-3 opzioni dell'app (impostazioni squadra,
// profilo personale...) per restare visivamente coerenti.
export default function SegmentedControl({ options, value, onChange, disabled }) {
  const index = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className="seg-track" style={{ '--seg-count': options.length, '--seg-index': index, opacity: disabled ? 0.6 : 1 }}>
      <span className="seg-glider" />
      {options.map(o => (
        <button key={o.value}
          type="button"
          className="seg-btn"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          aria-pressed={value === o.value}
          style={{ color: value === o.value ? 'var(--text)' : 'var(--text2)' }}
        >
          {o.icon} {o.label}
        </button>
      ))}
      <style>{`
        .seg-track { position:relative; display:flex; background:var(--card2); border-radius:12px; padding:4px; }
        .seg-glider {
          position:absolute; top:4px; left:4px; bottom:4px;
          width:calc((100% - 8px) / var(--seg-count));
          border-radius:9px; background:var(--card);
          box-shadow:0 1px 4px rgba(0,0,0,0.12);
          transform:translateX(calc(var(--seg-index) * 100%));
          transition:transform 0.28s cubic-bezier(0.34,1.2,0.64,1);
        }
        .seg-btn {
          position:relative; z-index:1; flex:1;
          padding:9px 4px; border-radius:9px; font-weight:700; font-size:12.5px;
          display:flex; align-items:center; justify-content:center; gap:5px;
          background:transparent; border:none; transition:color 0.15s;
        }
      `}</style>
    </div>
  )
}
