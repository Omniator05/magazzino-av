import { useNavigate } from 'react-router-dom'

// Bottone per tornare indietro, sulle pagine raggiunte dagli "Strumenti"
// della Dashboard (Scanner, Task, Furgoni, Template) o da altre pagine senza
// un percorso di navigazione gerarchico ovvio (es. Archivio → Eventi). Cerchio
// con anello che si "scioglie" al hover invece della vecchia pillola testuale
// "← Indietro". Di default torna alla home; passa `to` per un'altra rotta.
export default function BackHomeButton({ to = '/' }) {
  const navigate = useNavigate()
  return (
    <>
      <button
        onClick={() => navigate(to)}
        className="back-home-btn"
        aria-label="Indietro"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      <style>{`
        .back-home-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          margin: 0;
          padding: 0;
          background: transparent;
          color: var(--text2);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .back-home-btn svg { position: relative; z-index: 1; transition: transform 0.3s ease; }
        .back-home-btn:before,
        .back-home-btn:after {
          content: '';
          position: absolute;
          inset: 2px;
          border-radius: 50%;
        }
        .back-home-btn:before {
          border: 1.5px solid var(--border2);
          transition: opacity 0.4s cubic-bezier(0.77,0,0.175,1) 80ms,
                      transform 0.5s cubic-bezier(0.455,0.03,0.515,0.955) 80ms;
        }
        .back-home-btn:after {
          border: 2px solid var(--accent);
          opacity: 0;
          transform: scale(1.3);
          transition: opacity 0.4s cubic-bezier(0.165,0.84,0.44,1),
                      transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94);
        }
        .back-home-btn:hover, .back-home-btn:focus-visible { color: var(--accent); }
        .back-home-btn:hover svg, .back-home-btn:focus-visible svg { transform: translateX(-2px); }
        .back-home-btn:hover:before, .back-home-btn:focus-visible:before {
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 0.4s cubic-bezier(0.165,0.84,0.44,1),
                      transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94);
        }
        .back-home-btn:hover:after, .back-home-btn:focus-visible:after {
          opacity: 1;
          transform: scale(1);
          transition: opacity 0.4s cubic-bezier(0.77,0,0.175,1) 80ms,
                      transform 0.5s cubic-bezier(0.455,0.03,0.515,0.955) 80ms;
        }
      `}</style>
    </>
  )
}
