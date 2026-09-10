// Orologio del turno — sempre presente nella card di Ore di lavoro, cambia
// solo comportamento: fermo sulle 00:00 a riposo, lancette che partono a
// girare dalla STESSA posizione quando inizia il turno, e che si fermano
// ESATTAMENTE sulla stessa posizione (00:00) quando finisce — è lo stesso
// oggetto che parte e si ferma, non tre grafiche diverse che si sostituiscono.
//
// Le velocità NON sono reali (un giro di lancetta dei minuti in 2s): un
// orologio realistico sembrerebbe fermo, qui serve leggere a colpo d'occhio
// che il tempo sta correndo.
export default function ShiftClock({ state = 'idle', size = 58, color = 'var(--accent)' }) {
  return (
    <>
      <svg
        viewBox="0 0 100 100" width={size} height={size}
        className={`sc sc-${state}`} style={{ color, display: 'block' }}
        role="img" aria-hidden="true"
      >
        <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="5" opacity="0.22" />
        {[0, 90, 180, 270].map(a => (
          <line
            key={a} x1="50" y1="12" x2="50" y2="19"
            stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.35"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <line className="sc-hand sc-hour" x1="50" y1="50" x2="50" y2="32" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
        <line className="sc-hand sc-min" x1="50" y1="50" x2="50" y2="22" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="50" cy="50" r="4.5" fill="currentColor" />
      </svg>

      <style>{`
        .sc-hand { transform-box: view-box; transform-origin: 50px 50px; }

        /* A riposo: 00:00, entrambe le lancette dritte verso l'alto — lo
           stesso identico punto da cui partono a girare e in cui atterrano
           fermandosi, così l'occhio non vede mai un salto di posizione. */
        .sc-idle .sc-hour, .sc-idle .sc-min { transform: rotate(0deg); }

        /* In corso: giro continuo, lineare — il moto costante è il segnale.
           Riparte da rotate(0deg), la stessa posa di riposo. */
        .sc-running .sc-min  { animation: scSpin 2s linear infinite; }
        .sc-running .sc-hour { animation: scSpin 24s linear infinite; }
        @keyframes scSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Stop: non si bloccano di scatto, fanno ancora un paio di giri
           decelerando (ease-out esponenziale) e atterrano esattamente su un
           multiplo di 360° — cioè sulla STESSA posa di riposo (00:00) da cui
           erano partite, non su una posizione a caso. */
        .sc-stopping .sc-min  { animation: scSettleMin 1.1s cubic-bezier(0.16,1,0.3,1) both; }
        .sc-stopping .sc-hour { animation: scSettleHour 1.1s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes scSettleMin  { from { transform: rotate(0deg); } to { transform: rotate(1080deg); } }
        @keyframes scSettleHour { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sc-stopping { animation: scNudge 0.5s cubic-bezier(0.16,1,0.3,1) 0.95s both; }
        @keyframes scNudge {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .sc-running .sc-min, .sc-running .sc-hour,
          .sc-stopping .sc-min, .sc-stopping .sc-hour, .sc-stopping { animation: none; }
          .sc-running .sc-hour, .sc-stopping .sc-hour,
          .sc-running .sc-min,  .sc-stopping .sc-min  { transform: rotate(0deg); }
        }
      `}</style>
    </>
  )
}
