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
