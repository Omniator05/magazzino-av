import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Calendar, Truck, Camera, Kit, List, Clock, Recurring, Check, Unload } from '../components/Icon'

// Pagina pubblica mostrata a chi visita il sito SENZA essere loggato (vedi
// App.jsx → PrivateRoutes: solo il path "/" mostra questa invece del redirect
// a /login) — serve sia ai clienti che a chi deve verificare l'attività
// (es. Stripe), che altrimenti si troverebbero solo un form di accesso vuoto.
// Tema chiaro, stessi token dell'app (index.css → [data-theme="light"]).
// Google Calendar volutamente non è tra i punti di forza mostrati qui: la
// sincronizzazione esiste ma va ancora rifinita prima di usarla come leva.

const PHASES = [
  { key: 'pronto', label: 'Pronto',  desc: 'Il magazziniere prepara l\'attrezzatura e la segna pronta, oggetto per oggetto.', Icon: Check,  color: 'var(--blue)' },
  { key: 'load',   label: 'Carico',  desc: 'Ogni pezzo scansionato sul furgone risulta caricato e scala la giacenza.',          Icon: Truck,  color: 'var(--accent2)' },
  { key: 'return', label: 'Rientro', desc: 'A fine evento si scansiona al rientro: la giacenza torna piena e vedi cosa manca.', Icon: Unload, color: 'var(--green)' },
]

const FEATURES = [
  { icon: Box,       title: 'Magazzino',         desc: 'Inventario di audio, video e luci con disponibilità in tempo reale, pezzi rotti e scorta minima dei consumabili.' },
  { icon: Calendar,  title: 'Calendario eventi', desc: 'Eventi, noleggi e installazioni in un unico calendario, con controllo della disponibilità per qualsiasi periodo.' },
  { icon: List,      title: 'Liste di carico',   desc: 'Anche più liste per evento (un tendone, una lista). Rientro parziale e documento di trasporto in PDF.' },
  { icon: Camera,    title: 'Scanner',           desc: 'Carico e scarico con la fotocamera dello smartphone o con un lettore Bluetooth, via QR e codice a barre.' },
  { icon: Kit,       title: 'Kit e bauli',       desc: 'Sai quale baule fisico è finito su quale evento e quali componenti mancano dentro ciascuno.' },
  { icon: Recurring, title: 'Oggetti collegati', desc: 'Aggiungi una pedana e arrivano le sue 4 gambe. La bolla, invece, una sola volta per evento.' },
  { icon: Truck,     title: 'Furgoni',           desc: 'Assegni ogni oggetto al furgone giusto e ti avvisa se lo stesso mezzo è già impegnato.' },
  { icon: Clock,     title: 'Personale e ore',   desc: 'Assegni i magazzinieri agli eventi e tieni traccia delle ore di lavoro.' },
]

// I 3 piani — stessa fonte di verità del resto dell'app: Free/Team hanno un
// tetto di admin, magazzinieri E oggetti in magazzino (src/utils/planLimits.js
// → FREE_LIMITS/TEAM_LIMITS), Business no. Solo le liste di carico restano
// sempre illimitate su Team e Business — il vantaggio rispetto a chi fa
// pagare per persona.
const PRICING_PLANS = [
  {
    name: 'Free', price: '0€', period: null, tagline: 'Per iniziare da soli.',
    features: ['1 amministratore', 'Fino a 3 magazzinieri', 'Fino a 50 oggetti in magazzino', 'Liste di carico fino a 20 oggetti'],
    ctaLabel: 'Inizia gratis', highlight: false,
  },
  {
    name: 'Team', price: '45€', period: '/mese', tagline: 'Per una squadra vera.', badge: 'Consigliato',
    features: ['Fino a 5 amministratori', 'Fino a 10 magazzinieri', 'Fino a 300 oggetti in magazzino', 'Scanner, kit e liste multiple'],
    ctaLabel: '30 giorni di prova gratuita', highlight: true,
  },
  {
    name: 'Business', price: '129€', period: '/mese', tagline: 'Per aziende più strutturate.',
    features: ['Amministratori illimitati', 'Magazzinieri illimitati', 'Magazzino e liste senza limiti', 'Tutto quello che c\'è in Team'],
    ctaLabel: '30 giorni di prova gratuita', highlight: false,
  },
]

const STRENGTHS = [
  { title: 'Pensata per il magazzino', text: 'Wi‑Fi debole e mani occupate sono la norma. Ogni salvataggio viene confermato e, se non va a buon fine, l\'app te lo dice invece di far finta di niente.' },
  { title: 'Si installa come un\'app', text: 'Aggiungila alla schermata Home di iPhone o Android: si apre a schermo intero, senza passare dallo store.' },
  { title: 'Ognuno vede ciò che gli serve', text: 'Admin, magazziniere e organizzatore hanno accessi diversi. Attivi solo i moduli che usi davvero.' },
]

// Righe della finta lista di carico nell'anteprima: quanti pezzi risultano
// fatti in ciascuna fase (i numeri sono solo dimostrativi).
const DEMO_ROWS = [
  { name: 'Line array',     qty: 8,  done: { pronto: 8,  load: 8,  return: 8 } },
  { name: 'Mixer digitale', qty: 1,  done: { pronto: 1,  load: 1,  return: 0 } },
  { name: 'Teste mobili',   qty: 12, done: { pronto: 12, load: 9,  return: 0 } },
  { name: 'Cavi XLR',       qty: 20, done: { pronto: 20, load: 0,  return: 0 } },
]

const wrap = { maxWidth: 1080, margin: '0 auto', padding: '0 20px' }

function Wordmark({ size = 22 }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--text)' }}>
      ROAD<span style={{ color: 'var(--accent)' }}>CASE</span>
    </span>
  )
}

function DemoRowState({ done, qty }) {
  if (done >= qty) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Check size={13} />
      </span>
    )
  }
  return (
    <span style={{ minWidth: 22, height: 22, borderRadius: 11, padding: done > 0 ? '0 7px' : 0, border: `2px solid ${done > 0 ? 'var(--accent2)' : 'var(--border2)'}`, color: 'var(--accent2)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
      {done > 0 ? `${done}/${qty}` : ''}
    </span>
  )
}

// Anteprima (illustrativa) della lista di carico con le tre fasi: toccando
// Pronto/Carico/Rientro cambia lo stato delle righe, come nello scanner vero.
function LoadListPreview() {
  const [phase, setPhase] = useState('load')
  const current = PHASES.find(p => p.key === phase)
  const totalQty = DEMO_ROWS.reduce((s, r) => s + r.qty, 0)
  const totalDone = DEMO_ROWS.reduce((s, r) => s + r.done[phase], 0)

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: '0 24px 60px rgba(17,24,39,0.10), 0 2px 6px rgba(17,24,39,0.04)', padding: 16, maxWidth: 380, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Lista di carico</p>
          <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.2px' }}>Concerto in piazza</p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'rgba(230,57,70,0.10)', borderRadius: 8, padding: '4px 9px' }}>Sabato</span>
      </div>

      <div role="tablist" aria-label="Fase della lista di carico" style={{ display: 'flex', background: 'var(--card3)', borderRadius: 12, padding: 3, gap: 3, marginBottom: 14 }}>
        {PHASES.map(p => (
          <button key={p.key} role="tab" aria-selected={phase === p.key} onClick={() => setPhase(p.key)} className="btn-no-anim"
            style={{ flex: 1, padding: '8px 4px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: phase === p.key ? p.color : 'transparent', color: phase === p.key ? '#fff' : 'var(--text2)', transition: 'background 0.2s ease, color 0.2s ease' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {DEMO_ROWS.map((r, i) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <DemoRowState done={r.done[phase]} qty={r.qty} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>×{r.qty}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: 'var(--text2)' }}>{current.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalDone}/{totalQty}</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: 'var(--card3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', borderRadius: 4, background: current.color, transformOrigin: 'left', transform: `scaleX(${totalDone / totalQty})`, transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), background 0.2s ease' }} />
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        @keyframes landingReveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lp-reveal { opacity: 0; animation: landingReveal 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
        .lp-hero { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; padding: 44px 0 64px; }
        .lp-h1 { font-size: clamp(34px, 8vw, 56px); font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; margin: 0 0 18px; }
        .lp-features { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .lp-steps { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .lp-strengths { display: grid; grid-template-columns: 1fr; gap: 24px; }
        .lp-pricing { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; }
        .lp-btn { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; padding: 14px 24px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease; }
        .lp-btn-primary { background: var(--accent); color: #fff; box-shadow: 0 6px 20px rgba(230,57,70,0.28); }
        .lp-btn-secondary { background: var(--card); color: var(--text); border: 1px solid var(--border2); }
        .lp-link { color: var(--text2); text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 8px; }
        .lp-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        @media (hover: hover) and (pointer: fine) {
          .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(230,57,70,0.34); }
          .lp-btn-secondary:hover { border-color: var(--text3); }
          .lp-link:hover { color: var(--text); }
          .lp-card:hover { border-color: rgba(230,57,70,0.35); box-shadow: 0 8px 24px rgba(17,24,39,0.06); }
        }
        .lp-btn:focus-visible, .lp-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-cta { display: flex; flex-wrap: wrap; gap: 10px; }
        .lp-cta .lp-btn { flex: 1 1 100%; }
        @media (min-width: 640px) {
          .lp-cta .lp-btn { flex: 0 0 auto; }
          .lp-features { grid-template-columns: 1fr 1fr; }
          .lp-steps { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 900px) {
          .lp-hero { grid-template-columns: 1.1fr 0.9fr; gap: 56px; padding: 72px 0 96px; }
          .lp-features { grid-template-columns: repeat(4, 1fr); }
          .lp-strengths { grid-template-columns: repeat(3, 1fr); gap: 32px; }
          .lp-pricing { grid-template-columns: repeat(3, 1fr); gap: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-reveal { animation: none; opacity: 1; }
          .lp-btn, .lp-card { transition: none; }
        }
      `}</style>

      {/* Barra superiore */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(245,245,243,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/pwa-192x192.png" alt="" width={32} height={32} style={{ borderRadius: 8, display: 'block' }} />
            <Wordmark />
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link to="/login" className="lp-link">Accedi</Link>
            <Link to="/signup" className="lp-btn lp-btn-primary" style={{ padding: '9px 16px', fontSize: 13.5, boxShadow: 'none' }}>Prova gratis</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section style={wrap}>
          <div className="lp-hero">
            <div>
              <p className="lp-reveal" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
                Per aziende di noleggio audio, video e luci
              </p>
              <h1 className="lp-h1 lp-reveal" style={{ animationDelay: '60ms' }}>
                Dal magazzino al furgone, senza dimenticare niente.
              </h1>
              <p className="lp-reveal" style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text2)', maxWidth: 520, marginBottom: 28, animationDelay: '120ms' }}>
                Roadcase tiene insieme inventario, calendario eventi e liste di carico. Il magazziniere scansiona, l'app segna cosa è pronto, caricato e rientrato.
              </p>
              <div className="lp-reveal lp-cta" style={{ animationDelay: '180ms' }}>
                <Link to="/signup" className="lp-btn lp-btn-primary">Inizia gratis per 30 giorni</Link>
                <Link to="/login" className="lp-btn lp-btn-secondary">Accedi</Link>
              </div>
              <p className="lp-reveal" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 14, animationDelay: '220ms' }}>
                Nessuna carta richiesta. Da 45 € al mese per azienda.
              </p>
            </div>
            <div className="lp-reveal" style={{ animationDelay: '200ms' }}>
              <LoadListPreview />
            </div>
          </div>
        </section>

        {/* Le tre fasi */}
        <section style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ ...wrap, padding: '64px 20px' }}>
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>Ogni carico in tre passaggi</h2>
            <p style={{ fontSize: 16, color: 'var(--text2)', maxWidth: 560, marginBottom: 32, lineHeight: 1.55 }}>
              Chiunque apra l'evento vede a che punto è il lavoro, anche se a cominciarlo è stato un collega.
            </p>
            <div className="lp-steps">
              {PHASES.map((p, i) => (
                <div key={p.key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p.Icon size={18} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text3)', letterSpacing: '0.6px' }}>PASSO {i + 1}</span>
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>{p.label}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text2)' }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Funzioni */}
        <section id="funzioni" style={{ ...wrap, padding: '72px 20px' }}>
          <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>Tutto quello che serve a un magazzino di noleggio</h2>
          <p style={{ fontSize: 16, color: 'var(--text2)', maxWidth: 560, marginBottom: 32, lineHeight: 1.55 }}>
            Dalla gestione dell'attrezzatura all'organizzazione della squadra, in un'unica app.
          </p>
          <div className="lp-features">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-card" style={{ padding: 20 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <f.icon size={19} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text2)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Punti di forza */}
        <section style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ ...wrap, padding: '64px 20px' }}>
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 32, maxWidth: 620 }}>Costruita per chi lavora davvero in magazzino</h2>
            <div className="lp-strengths">
              {STRENGTHS.map(s => (
                <div key={s.title} style={{ borderTop: '2px solid var(--accent)', paddingTop: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--text2)' }}>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Prezzo e invito finale */}
        <section id="prezzo" style={{ ...wrap, padding: '72px 20px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em' }}>30 giorni di prova gratuita</h2>
            <span style={{ background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Prezzo beta</span>
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text2)', maxWidth: 620, marginBottom: 32 }}>
            Nessuna carta richiesta all'attivazione. Un unico limite tra i piani a pagamento: quanti amministratori — magazzinieri, oggetti e liste di carico restano sempre senza tetto. Disdici quando vuoi.
          </p>

          <div className="lp-pricing">
            {PRICING_PLANS.map(plan => (
              <div key={plan.name} className="lp-card" style={{
                padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 18,
                borderColor: plan.highlight ? 'var(--accent)' : 'var(--border)',
                boxShadow: plan.highlight ? '0 12px 32px rgba(230,57,70,0.14)' : 'none',
                position: 'relative',
              }}>
                {plan.badge && (
                  <span style={{ position: 'absolute', top: -12, left: 24, background: 'var(--accent)', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{plan.badge}</span>
                )}
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800 }}>{plan.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{plan.tagline}</p>
                </div>
                <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {plan.price}{plan.period && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{plan.period}</span>}
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className={`lp-btn ${plan.highlight ? 'lp-btn-primary' : 'lp-btn-secondary'}`} style={{ width: '100%' }}>{plan.ctaLabel}</Link>
              </div>
            ))}
          </div>

          <div className="lp-cta" style={{ marginTop: 28 }}>
            <Link to="/login" className="lp-btn lp-btn-secondary">Ho già un account</Link>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ ...wrap, padding: '28px 20px 40px', display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/pwa-192x192.png" alt="" width={24} height={24} style={{ borderRadius: 6, display: 'block' }} />
            <Wordmark size={16} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Contatti: <a href="mailto:appmagazzinoav@gmail.com" style={{ color: 'inherit' }}>appmagazzinoav@gmail.com</a></p>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
            {' · '}
            <Link to="/terms" style={{ color: 'inherit' }}>Termini</Link>
            {' · '}
            <Link to="/cookie-policy" style={{ color: 'inherit' }}>Cookie</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
