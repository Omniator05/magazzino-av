// Sfondo animato scuro condiviso da tutte le schermate "fuori dall'app"
// (login/signup, e ora anche il percorso guidato di benvenuto per una nuova
// azienda): griglia di punti pulsante + 3 orb fluttuanti. Estratto da
// AuthShell così la stessa identica identità visiva si può riusare altrove
// senza portarsi dietro la card divisa login/signup.
export default function AuthBackground({ children }) {
  return (
    <>
      <style>{`
        /* Tema delle pagine pubbliche: scuro di base, chiaro quando l'app è in tema chiaro
           (data-theme su <html>, vedi utils/theme.js: "auto" segue il dispositivo).
           --au-fg = colore del testo/dei filetti ("r,g,b"); --au-k amplifica le trasparenze
           nel chiaro, dove servono più contrasto per leggere lo stesso. */
        :root {
          --au-fg: 255,255,255; --au-k: 1;
          --au-bg: #07090f;
          --au-card: rgba(12,14,22,0.82);
          --au-card-shadow: 0 0 44px rgba(230,57,70,0.16), 0 32px 80px rgba(0,0,0,0.55);
          --au-dot: 0.07;
        }
        :root[data-theme="light"] {
          --au-fg: 26,26,26; --au-k: 1.7;
          --au-bg: #f5f5f3;
          --au-card: rgba(255,255,255,0.9);
          --au-card-shadow: 0 0 44px rgba(230,57,70,0.1), 0 24px 60px rgba(40,30,20,0.14);
          --au-dot: 0.06;
        }
        /* Errori dei form: messaggio rosso che compare in dissolvenza e lampo rosso sul campo. */
        :root { --au-err: #ff8f8f; }
        :root[data-theme="light"] { --au-err: #c81d2e; }
        .auth-field-error {
          color:var(--au-err);
          font-size:12.5px;
          line-height:1.4;
          margin:7px 0 0;
          animation:authErrIn 0.35s ease both;
        }
        @keyframes authErrIn { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }
        @keyframes authFlashA { 0%, 45% { border-color:#e63946; box-shadow:0 0 0 3px rgba(230,57,70,0.28); } }
        @keyframes authFlashB { 0%, 45% { border-color:#e63946; box-shadow:0 0 0 3px rgba(230,57,70,0.28); } }
        .auth-input-flash-a { animation:authFlashA 1.4s ease-out; }
        .auth-input-flash-b { animation:authFlashB 1.4s ease-out; }

        /* Password: occhiolino dentro il campo + indicatore di robustezza. */
        .auth-pw-wrap { position:relative; }
        .auth-pw-eye {
          position:absolute; right:6px; top:calc(50% - 18px);
          width:36px; height:36px; border-radius:9px;
          display:flex; align-items:center; justify-content:center;
          background:transparent; border:none; cursor:pointer;
          color:rgba(var(--au-fg), calc(var(--au-k) * 0.45));
          transition:color 0.15s, background 0.15s;
        }
        .auth-pw-eye:hover { color:rgb(var(--au-fg)); background:rgba(var(--au-fg), calc(var(--au-k) * 0.08)); }
        .auth-pw-eye:focus-visible { outline:2px solid rgba(230,57,70,0.7); outline-offset:1px; }
        .auth-pw-reveal {
          overflow:hidden; max-height:0; opacity:0; transform:translateY(-6px);
          transition:max-height 0.3s ease, opacity 0.25s ease, transform 0.3s ease;
        }
        .auth-pw-reveal.open { max-height:40px; opacity:1; transform:none; }
        .auth-pw-meter { display:flex; align-items:center; gap:10px; margin-top:9px; font-size:12px; font-weight:700; }
        .auth-pw-bars { display:flex; gap:4px; flex:1; }
        .auth-pw-bars span {
          flex:1; height:4px; border-radius:2px;
          background:rgba(var(--au-fg), calc(var(--au-k) * 0.12));
          transition:background 0.25s ease;
        }

        /* Casella di spunta: la "v" si scrive lentamente quando viene selezionata. */
        .auth-check-row { display:flex; align-items:flex-start; gap:10px; cursor:pointer; position:relative; }
        .auth-check-input { position:absolute; opacity:0; width:18px; height:18px; margin:0; cursor:pointer; }
        .auth-check-box {
          flex-shrink:0; width:18px; height:18px; margin-top:1px; border-radius:5px; box-sizing:border-box;
          border:1.5px solid rgba(var(--au-fg), calc(var(--au-k) * 0.3));
          display:flex; align-items:center; justify-content:center;
          transition:background 0.25s ease, border-color 0.25s ease;
        }
        .auth-check-box svg { width:14px; height:14px; }
        .auth-check-box path {
          fill:none; stroke:#fff; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
          stroke-dasharray:14; stroke-dashoffset:14;
          transition:stroke-dashoffset 0.15s ease;
        }
        .auth-check-input:checked + .auth-check-box { background:#e63946; border-color:#e63946; }
        .auth-check-input:checked + .auth-check-box path { stroke-dashoffset:0; transition:stroke-dashoffset 0.55s ease 0.12s; }
        .auth-check-input:focus-visible + .auth-check-box { outline:2px solid rgba(230,57,70,0.7); outline-offset:2px; }
        .auth-check-box.auth-input-flash-a, .auth-check-box.auth-input-flash-b { border-color:#e63946; }

        @keyframes orbFloat1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(40px,-60px) scale(1.06); }
          66%      { transform: translate(-30px,40px) scale(0.94); }
        }
        @keyframes orbFloat2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-50px,35px) scale(0.96); }
          66%      { transform: translate(30px,-50px) scale(1.08); }
        }
        @keyframes orbFloat3 {
          0%,100% { transform: translate(-50%,-50%) scale(1); }
          50%      { transform: translate(-50%,-50%) scale(1.15); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:0.25; }
          50%      { opacity:0.5; }
        }
        @media (prefers-reduced-motion:reduce) {
          .authbg-orb, .authbg-dots { animation:none!important; }
        }

        /* Stile card/input/bottoni condiviso da tutte le schermate "fuori
           dall'app" che usano questo sfondo — non solo dentro la card divisa
           di AuthShell (che rende .auth-card trasparente e usa questi stessi
           .auth-btn/.auth-input), ma anche standalone (es. Landing.jsx). */
        .auth-card {
          background:rgba(var(--au-fg), calc(var(--au-k) * 0.05));
          border:1px solid rgba(var(--au-fg), calc(var(--au-k) * 0.12));
          border-radius:20px;
          padding:26px 24px;
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
        }
        .auth-input {
          width:100%;
          background:rgba(var(--au-fg), calc(var(--au-k) * 0.06));
          border:1px solid rgba(var(--au-fg), calc(var(--au-k) * 0.12));
          border-radius:12px;
          padding:13px 16px;
          color:rgb(var(--au-fg));
          font-size:15px;
          transition:border-color 0.2s, box-shadow 0.2s;
          box-sizing:border-box;
        }
        .auth-input::placeholder { color:rgba(var(--au-fg), calc(var(--au-k) * 0.25)); }
        .auth-input:focus {
          outline:none;
          border-color:rgba(230,57,70,0.7);
          box-shadow:0 0 0 3px rgba(230,57,70,0.15);
        }
        .auth-btn {
          width:100%;
          padding:14px;
          border-radius:12px;
          background:linear-gradient(135deg,#e63946 0%,#c1121f 100%);
          color:white;
          font-size:15px;
          font-weight:700;
          border:none;
          cursor:pointer;
          box-shadow:0 4px 24px rgba(230,57,70,0.4);
          letter-spacing:0.3px;
          transition:transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s;
        }
        .auth-btn:hover:not(:disabled) {
          transform:translateY(-2px);
          box-shadow:0 8px 36px rgba(230,57,70,0.55);
        }
        .auth-btn:active:not(:disabled) { transform:translateY(0); }
        .auth-btn:disabled { opacity:0.6; cursor:not-allowed; }
        /* Piccolo "scossone" ogni 5 secondi per attirare l'occhio sul bottone principale (es. "Crea una
           nuova squadra"). Usa le proprietà singole translate/rotate così non confligge con
           il transform dell'hover; si ferma al passaggio del mouse/focus. */
        @keyframes authNudge {
          0%, 12%, 100% { translate: 0 0; rotate: 0deg; }
          2%  { translate: -4px 0; rotate: -1.4deg; }
          4%  { translate: 4px 0;  rotate: 1.2deg; }
          6%  { translate: -3px 0; rotate: -0.9deg; }
          8%  { translate: 2px 0;  rotate: 0.6deg; }
          10% { translate: -1px 0; rotate: -0.3deg; }
        }
        .auth-btn-nudge { animation: authNudge 5s ease-in-out 1.5s infinite; }
        .auth-btn-nudge:hover, .auth-btn-nudge:focus-visible { animation-play-state: paused; }
        .auth-btn-secondary {
          width:100%;
          padding:14px;
          border-radius:12px;
          background:rgba(var(--au-fg), calc(var(--au-k) * 0.06));
          border:1px solid rgba(var(--au-fg), calc(var(--au-k) * 0.14));
          color:rgb(var(--au-fg));
          font-size:15px;
          font-weight:700;
          cursor:pointer;
          letter-spacing:0.3px;
          transition:background 0.18s ease, border-color 0.18s ease;
        }
        .auth-btn-secondary:hover { background:rgba(var(--au-fg), calc(var(--au-k) * 0.1)); border-color:rgba(var(--au-fg), calc(var(--au-k) * 0.25)); }
      `}</style>

      <div style={{
        minHeight:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'20px', background:'var(--au-bg)',
        position:'relative', overflow:'hidden',
      }}>

        {/* Griglia di punti animata */}
        <div className="authbg-dots" style={{
          position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'radial-gradient(circle, rgba(var(--au-fg), calc(var(--au-k) * var(--au-dot))) 1px, transparent 1px)',
          backgroundSize:'28px 28px',
          animation:'dotPulse 5s ease-in-out infinite',
        }} />

        {/* Orb 1 — rosso in alto a sinistra */}
        <div className="authbg-orb" style={{
          position:'absolute', top:'-15%', left:'-8%',
          width:'65vmax', height:'65vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(230,57,70,0.22) 0%, transparent 65%)',
          animation:'orbFloat1 14s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {/* Orb 2 — blu in basso a destra */}
        <div className="authbg-orb" style={{
          position:'absolute', bottom:'-18%', right:'-10%',
          width:'70vmax', height:'70vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(37,99,235,0.16) 0%, transparent 65%)',
          animation:'orbFloat2 18s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {/* Orb 3 — centrale tenue verde */}
        <div className="authbg-orb" style={{
          position:'absolute', top:'50%', left:'50%',
          width:'40vmax', height:'40vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(167,199,87,0.07) 0%, transparent 70%)',
          animation:'orbFloat3 22s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {children}
      </div>
    </>
  )
}
