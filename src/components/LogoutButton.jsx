import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut } from './Icon'

/**
 * Bottone "Esci" con conferma (evita logout accidentali) + animazione di uscita.
 * Mantiene lo stile passato via `style`/`className`; `name` per il messaggio d'addio.
 */
export default function LogoutButton({ style, className, name }) {
  const { logout, team } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const first = (name || '').split(' ')[0]

  const doLogout = () => {
    setConfirm(false)
    setLeaving(true)
    setTimeout(() => logout(), 1300)
  }

  return (
    <>
      <button className={className} style={style} onClick={() => setConfirm(true)}>Esci</button>

      {confirm && createPortal(
        <div className="lo-confirm-bg" onClick={() => setConfirm(false)}>
          <div className="lo-confirm" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="lo-confirm-icon"><LogOut size={26} /></div>
            <h3 style={{ fontSize:19, fontWeight:800, color:'#111827', margin:'0 0 6px', letterSpacing:'-0.3px' }}>Vuoi uscire?</h3>
            <p style={{ fontSize:14, color:'#6b7280', margin:0, lineHeight:1.45 }}>Dovrai effettuare di nuovo l'accesso per rientrare.</p>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="lo-btn lo-cancel" onClick={() => setConfirm(false)}>Annulla</button>
              <button className="lo-btn lo-go" onClick={doLogout}>Esci</button>
            </div>
          </div>
        </div>, document.body)}

      {leaving && createPortal(
        <div className="lo-overlay">
          <div className="lo-orb lo-orb-a" />
          <div className="lo-orb lo-orb-b" />
          <img src={team?.logoUrl || '/logo.png'} alt={team?.name || 'The Service Group'} className="lo-logo" />
          <p className="lo-bye">A presto{first ? `, ${first}` : ''}!</p>
          <div className="lo-spinner" />
        </div>, document.body)}

      <style>{`
        @keyframes loFade { from{opacity:0} to{opacity:1} }
        @keyframes loPop  { from{opacity:0; transform:scale(0.9) translateY(10px)} to{opacity:1; transform:scale(1) translateY(0)} }
        @keyframes loSpin { to { transform: rotate(360deg); } }
        @keyframes loByeIn { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:translateY(0)} }
        @keyframes loOrbA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(28px,-40px) scale(1.08)} }
        @keyframes loOrbB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,26px) scale(0.92)} }

        .lo-confirm-bg {
          position: fixed; inset: 0; z-index: 10000;
          background: rgba(10,12,18,0.5);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: loFade 0.18s ease both;
        }
        .lo-confirm {
          background: #fff; border-radius: 24px; padding: 28px 24px 22px;
          width: 100%; max-width: 320px; text-align: center;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          animation: loPop 0.28s cubic-bezier(0.34,1.4,0.64,1) both;
        }
        .lo-confirm-icon {
          width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(230,57,70,0.12); color: #e63946;
        }
        .lo-btn {
          flex: 1; padding: 12px; border-radius: 13px; font-size: 14px; font-weight: 700;
          border: none; cursor: pointer;
        }
        .lo-cancel { background: #f3f4f6; color: #374151; }
        .lo-go { background: #e63946; color: #fff; box-shadow: 0 4px 16px rgba(230,57,70,0.35); }

        .lo-overlay {
          position: fixed; inset: 0; z-index: 10000; overflow: hidden;
          background: #07090f;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          animation: loFade 0.3s ease both;
        }
        .lo-orb { position: absolute; border-radius: 50%; pointer-events: none; }
        .lo-orb-a { top:-15%; left:-8%; width:60vmax; height:60vmax; background: radial-gradient(circle, rgba(230,57,70,.18) 0%, transparent 65%); animation: loOrbA 13s ease-in-out infinite; }
        .lo-orb-b { bottom:-18%; right:-10%; width:65vmax; height:65vmax; background: radial-gradient(circle, rgba(37,99,235,.12) 0%, transparent 65%); animation: loOrbB 17s ease-in-out infinite; }
        .lo-logo { width: 220px; max-width: 60vw; height: 124px; object-fit: contain; z-index: 1;
          filter: drop-shadow(0 0 26px rgba(230,57,70,0.35));
          animation: loPop 0.6s cubic-bezier(0.34,1.4,0.64,1) both;
        }
        .lo-bye { z-index: 1; margin-top: 26px; color: #fff; font-size: 24px; font-weight: 800;
          letter-spacing: -0.4px; animation: loByeIn 0.5s ease 0.25s both;
        }
        .lo-spinner { z-index: 1; margin-top: 30px; width: 24px; height: 24px;
          border: 2px solid rgba(255,255,255,0.18); border-top: 2px solid rgba(255,255,255,0.7);
          border-radius: 50%; animation: loSpin 0.9s linear infinite;
        }
        @media (prefers-reduced-motion:reduce){ .lo-orb{animation:none!important} }
      `}</style>
    </>
  )
}
