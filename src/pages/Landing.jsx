import { useNavigate } from 'react-router-dom'
import AuthBackground from '../components/AuthBackground'

// Pagina pubblica mostrata a chi visita il sito SENZA essere loggato (vedi
// App.jsx → PrivateRoutes: solo il path "/" mostra questa invece del redirect
// a /login) — serve sia ai clienti che a chi deve verificare l'attività
// (es. Stripe), che altrimenti si troverebbero solo un form di accesso vuoto.
// Google Calendar volutamente non è tra i punti di forza mostrati qui: la
// sincronizzazione esiste ma va ancora rifinita prima di usarla come leva.
const FEATURES = [
  { icon: '📦', title: 'Magazzino', desc: 'Inventario attrezzatura audio/video/luci, disponibilità in tempo reale.' },
  { icon: '📅', title: 'Eventi', desc: 'Calendario eventi, liste di carico, assegnazione del personale.' },
  { icon: '🚐', title: 'Furgoni', desc: 'Assegna ogni oggetto al furgone giusto per ogni evento.' },
  { icon: '📱', title: 'Scanner', desc: 'Carico/scarico attrezzatura da smartphone via QR/barcode.' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <AuthBackground>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <img src="/pwa-512x512.png" alt="" width={44} height={44} style={{ borderRadius: 10, display: 'block' }} />
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            <span style={{ color: 'white' }}>ROAD</span><span style={{ color: '#e63946' }}>CASE</span>
          </h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.6, marginBottom: 30 }}>
          Il gestionale per aziende di noleggio audio/video/luci: magazzino, calendario eventi
          e personale in un'unica app.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 30, textAlign: 'left' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '14px 16px' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
              <p style={{ color: 'white', fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{f.title}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
          <p style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>35€<span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}> /mese, per azienda</span></p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 4 }}>30 giorni di prova gratuita, nessuna carta richiesta all'attivazione. Disdici quando vuoi.</p>
        </div>

        <button onClick={() => navigate('/signup')} className="auth-btn">
          Inizia l'esperienza
        </button>


        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 30 }}>
          Contatti: appmagazzinoav@gmail.com
        </p>
      </div>
    </AuthBackground>
  )
}
