import { useNavigate } from 'react-router-dom'
import AuthBackground from '../components/AuthBackground'
import { Box, Calendar, Truck, Camera } from '../components/Icon'

// Pagina pubblica mostrata a chi visita il sito SENZA essere loggato (vedi
// App.jsx → PrivateRoutes: solo il path "/" mostra questa invece del redirect
// a /login) — serve sia ai clienti che a chi deve verificare l'attività
// (es. Stripe), che altrimenti si troverebbero solo un form di accesso vuoto.
// Google Calendar volutamente non è tra i punti di forza mostrati qui: la
// sincronizzazione esiste ma va ancora rifinita prima di usarla come leva.
const FEATURES = [
  { icon: Box,      title: 'Magazzino', desc: 'Inventario attrezzatura audio/video/luci, disponibilità in tempo reale.' },
  { icon: Calendar, title: 'Eventi',    desc: 'Calendario eventi, liste di carico, assegnazione del personale.' },
  { icon: Truck,     title: 'Furgoni',   desc: 'Assegna ogni oggetto al furgone giusto per ogni evento.' },
  { icon: Camera,   title: 'Scanner',   desc: 'Carico/scarico attrezzatura da smartphone via QR/barcode.' },
]

// Ritardo dopo l'ultima card prima di far comparire prezzo/CTA/contatti —
// tiene la sequenza leggibile invece che farla sembrare tutta simultanea.
const REVEAL_STEP_MS = 70
const CARDS_START_MS = 160

export default function Landing() {
  const navigate = useNavigate()

  return (
    <AuthBackground>
      <style>{`
        @keyframes landingReveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .landing-reveal {
          opacity: 0;
          animation: landingReveal 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .landing-feature-card {
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        @media (hover: hover) and (pointer: fine) {
          .landing-feature-card:hover {
            border-color: rgba(230,57,70,0.35);
            background: rgba(255,255,255,0.09);
          }
          .landing-feature-card:hover .landing-feature-icon {
            transform: scale(1.08);
          }
        }
        .landing-feature-icon { transition: transform 0.2s ease; }
        @media (prefers-reduced-motion: reduce) {
          .landing-reveal { animation: none; opacity: 1; }
          .landing-feature-icon { transition: none; }
        }
      `}</style>

      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div className="landing-reveal" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 10, animationDelay:'0ms' }}>
          <img src="/pwa-512x512.png" alt="" width={44} height={44} style={{ borderRadius: 10, display: 'block' }} />
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            <span style={{ color: 'white' }}>ROAD</span><span style={{ color: '#e63946' }}>CASE</span>
          </h1>
        </div>
        <p className="landing-reveal" style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.6, marginBottom: 30, animationDelay:'70ms' }}>
          Il gestionale per aziende di noleggio audio/video/luci: magazzino, calendario eventi
          e personale in un'unica app.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 30, textAlign: 'left' }}>
          {FEATURES.map((f, i) => {
            const FeatureIcon = f.icon
            return (
              <div key={f.title} className="landing-reveal landing-feature-card" style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '16px',
                animationDelay: `${CARDS_START_MS + i * REVEAL_STEP_MS}ms`,
              }}>
                <div className="landing-feature-icon" style={{
                  width: 34, height: 34, borderRadius: 10, marginBottom: 10,
                  background: 'rgba(230,57,70,0.16)', color: '#ff6b76',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FeatureIcon size={17} />
                </div>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{f.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            )
          })}
        </div>

        <div className="landing-reveal" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '16px 20px', marginBottom: 24, animationDelay: `${CARDS_START_MS + FEATURES.length * REVEAL_STEP_MS}ms` }}>
          <p style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>35€<span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}> /mese, per azienda</span></p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 4 }}>30 giorni di prova gratuita, nessuna carta richiesta all'attivazione. Disdici quando vuoi.</p>
        </div>

        <button onClick={() => navigate('/signup')} className="auth-btn landing-reveal" style={{ animationDelay: `${CARDS_START_MS + FEATURES.length * REVEAL_STEP_MS + 70}ms` }}>
          Inizia l'esperienza
        </button>


        <p className="landing-reveal" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 30, animationDelay: `${CARDS_START_MS + FEATURES.length * REVEAL_STEP_MS + 140}ms` }}>
          Contatti: appmagazzinoav@gmail.com
        </p>
      </div>
    </AuthBackground>
  )
}
