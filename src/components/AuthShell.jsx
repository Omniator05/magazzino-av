import { useState, useEffect } from 'react'

// Guscio visivo condiviso dalle pagine pubbliche di autenticazione
// (Login, Signup, PendingApproval): sfondo animato, logo, contenitore form.
export default function AuthShell({ children, subtitle = 'Gestione Magazzino', maxWidth = 390 }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

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
        @keyframes logoGlow {
          0%,100% { filter: drop-shadow(0 0 18px rgba(230,57,70,0.25)) drop-shadow(0 0 40px rgba(230,57,70,0.1)); }
          50%      { filter: drop-shadow(0 0 30px rgba(230,57,70,0.55)) drop-shadow(0 0 80px rgba(230,57,70,0.2)); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:0.25; }
          50%      { opacity:0.5; }
        }
        @keyframes borderShimmer {
          0%   { border-color: rgba(255,255,255,0.08); }
          50%  { border-color: rgba(230,57,70,0.35); }
          100% { border-color: rgba(255,255,255,0.08); }
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
        .auth-card {
          background:rgba(255,255,255,0.035);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:24px;
          padding:32px 28px;
          backdrop-filter:blur(28px);
          -webkit-backdrop-filter:blur(28px);
          box-shadow:0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07);
          box-sizing:border-box;
        }
        @media (prefers-reduced-motion:reduce) {
          *,*::before,*::after { animation:none!important; transition:none!important; }
        }
      `}</style>

      <div style={{
        minHeight:'100dvh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'20px', background:'#07090f',
        position:'relative', overflow:'hidden',
      }}>

        {/* Griglia di punti animata */}
        <div style={{
          position:'absolute', inset:0, zIndex:0, pointerEvents:'none',
          backgroundImage:'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize:'28px 28px',
          animation:'dotPulse 5s ease-in-out infinite',
        }} />

        {/* Orb 1 — rosso in alto a sinistra */}
        <div style={{
          position:'absolute', top:'-15%', left:'-8%',
          width:'65vmax', height:'65vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(230,57,70,0.22) 0%, transparent 65%)',
          animation:'orbFloat1 14s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {/* Orb 2 — blu in basso a destra */}
        <div style={{
          position:'absolute', bottom:'-18%', right:'-10%',
          width:'70vmax', height:'70vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(37,99,235,0.16) 0%, transparent 65%)',
          animation:'orbFloat2 18s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {/* Orb 3 — centrale tenue verde */}
        <div style={{
          position:'absolute', top:'50%', left:'50%',
          width:'40vmax', height:'40vmax', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(167,199,87,0.07) 0%, transparent 70%)',
          animation:'orbFloat3 22s ease-in-out infinite',
          pointerEvents:'none',
        }} />

        {/* Logo */}
        <div style={{
          textAlign:'center', marginBottom:52, zIndex:1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(-24px) scale(0.94)',
          transition:'opacity 0.8s ease, transform 0.8s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <div style={{ display:'inline-block', animation:'logoGlow 3.5s ease-in-out infinite' }}>
            <img
              src="/logo.png"
              alt="The Service Group"
              style={{ width:340, maxWidth:'78vw', height:'auto', objectFit:'contain' }}
            />
          </div>
          <p style={{
            color:'rgba(255,255,255,0.3)', fontSize:11,
            letterSpacing:'4px', textTransform:'uppercase',
            fontWeight:600, marginTop:14,
          }}>
            {subtitle}
          </p>
        </div>

        {/* Contenuto */}
        <div style={{
          width:'100%', maxWidth, zIndex:1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(32px)',
          transition:'opacity 0.7s ease 0.22s, transform 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.22s',
        }}>
          {children}
        </div>
      </div>
    </>
  )
}
