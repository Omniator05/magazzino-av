// Sfondo animato scuro condiviso da tutte le schermate "fuori dall'app"
// (login/signup, e ora anche il percorso guidato di benvenuto per una nuova
// azienda): griglia di punti pulsante + 3 orb fluttuanti. Estratto da
// AuthShell così la stessa identica identità visiva si può riusare altrove
// senza portarsi dietro la card divisa login/signup.
export default function AuthBackground({ children }) {
  return (
    <>
      <style>{`
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
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.12);
          border-radius:20px;
          padding:26px 24px;
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
        }
        .auth-input {
          width:100%;
          background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.12);
          border-radius:12px;
          padding:13px 16px;
          color:white;
          font-size:15px;
          transition:border-color 0.2s, box-shadow 0.2s;
          box-sizing:border-box;
        }
        .auth-input::placeholder { color:rgba(255,255,255,0.25); }
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
        .auth-btn-secondary {
          width:100%;
          padding:14px;
          border-radius:12px;
          background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.14);
          color:white;
          font-size:15px;
          font-weight:700;
          cursor:pointer;
          letter-spacing:0.3px;
          transition:background 0.18s ease, border-color 0.18s ease;
        }
        .auth-btn-secondary:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.25); }
      `}</style>

      <div style={{
        minHeight:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'20px', background:'#07090f',
        position:'relative', overflow:'hidden',
      }}>

        {/* Griglia di punti animata */}
        <div className="authbg-dots" style={{
          position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
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
