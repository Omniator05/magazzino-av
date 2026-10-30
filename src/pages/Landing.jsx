import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Box, Calendar, Truck, Camera, Kit, List, Clock, Recurring, Check, Unload } from '../components/Icon'

// Pagina pubblica mostrata a chi visita il sito SENZA essere loggato (vedi
// App.jsx → PrivateRoutes: solo il path "/" mostra questa invece del redirect
// a /login) — serve sia ai clienti che a chi deve verificare l'attività
// (es. Stripe), che altrimenti si troverebbero solo un form di accesso vuoto.
// Tema chiaro, stessi token dell'app (index.css → [data-theme="light"]).
// Google Calendar volutamente non è tra i punti di forza mostrati qui: la
// sincronizzazione esiste ma va ancora rifinita prima di usarla come leva.

// I testi stanno nei file delle lingue (it, en, pt, ar → chiave `landing`): qui restano solo icone e colori.
const PHASE_META = [
  { key: 'pronto', Icon: Check,  color: 'var(--blue)' },
  { key: 'load',   Icon: Truck,  color: 'var(--accent2)' },
  { key: 'return', Icon: Unload, color: 'var(--green)' },
]
const FEATURE_ICONS = [Box, Calendar, List, Camera, Kit, Recurring, Truck, Clock]
const PRICING_META = [{ highlight: false }, { highlight: true }, { highlight: false }]

// Pagine pubbliche, una per lingua: indirizzi distinti così i motori di ricerca le indicizzano separatamente (hreflang).
export const LANDING_LANGS = [
  { code: 'it', path: '/',   label: 'Italiano' },
  { code: 'en', path: '/en', label: 'English' },
  { code: 'pt', path: '/pt', label: 'Português' },
  { code: 'ar', path: '/ar', label: 'العربية' },
]
const SITE = 'https://www.roadcase.it'

// Righe della finta lista di carico nell'anteprima: quanti pezzi risultano
// fatti in ciascuna fase (i numeri sono solo dimostrativi).
const DEMO_ROWS = [
  { qty: 8,  done: { pronto: 8,  load: 8,  return: 8 } },
  { qty: 1,  done: { pronto: 1,  load: 1,  return: 0 } },
  { qty: 12, done: { pronto: 12, load: 9,  return: 0 } },
  { qty: 20, done: { pronto: 20, load: 0,  return: 0 } },
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
  const { t } = useTranslation()
  const [phase, setPhase] = useState('load')
  const phaseTexts = t('landing.phases', { returnObjects: true })
  const phases = PHASE_META.map((m, i) => ({ ...m, label: phaseTexts[i]?.label, desc: phaseTexts[i]?.desc }))
  const demoNames = t('landing.demoRows', { returnObjects: true })
  const current = phases.find(p => p.key === phase)
  const totalQty = DEMO_ROWS.reduce((s, r) => s + r.qty, 0)
  const totalDone = DEMO_ROWS.reduce((s, r) => s + r.done[phase], 0)

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: '0 24px 60px rgba(17,24,39,0.10), 0 2px 6px rgba(17,24,39,0.04)', padding: 16, maxWidth: 380, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('landing.previewLabel')}</p>
          <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.2px' }}>{t('landing.previewName')}</p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'rgba(230,57,70,0.10)', borderRadius: 8, padding: '4px 9px' }}>{t('landing.previewDay')}</span>
      </div>

      <div role="tablist" aria-label={t('landing.previewTabs')} style={{ display: 'flex', background: 'var(--card3)', borderRadius: 12, padding: 3, gap: 3, marginBottom: 14 }}>
        {phases.map(p => (
          <button key={p.key} role="tab" aria-selected={phase === p.key} onClick={() => setPhase(p.key)} className="btn-no-anim"
            style={{ flex: 1, padding: '8px 4px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: phase === p.key ? p.color : 'transparent', color: phase === p.key ? '#fff' : 'var(--text2)', transition: 'background 0.2s ease, color 0.2s ease' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {DEMO_ROWS.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <DemoRowState done={r.done[phase]} qty={r.qty} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{demoNames[i]}</span>
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

// Menu delle lingue: un pulsante col nome della lingua attuale che apre l'elenco (invece di quattro voci in fila).
function LangMenu({ lang, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const current = LANDING_LANGS.find(l => l.code === lang) || LANDING_LANGS[0]
  return (
    <div ref={ref} style={{ position: 'relative', marginInlineEnd: 4 }}>
      <button type="button" className="btn-no-anim" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${current.label}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: open ? 'var(--card3)' : 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 700 }}>
        <svg className="lp-globe" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
        <span style={{ textTransform: 'uppercase' }}>{current.code}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0, minWidth: 160, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(17,24,39,0.14)', padding: 6, zIndex: 30 }}>
          {LANDING_LANGS.map(l => (
            <Link key={l.code} to={l.path} hrefLang={l.code} lang={l.code} role="menuitem" onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: lang === l.code ? 800 : 600, color: lang === l.code ? 'var(--accent)' : 'var(--text)', background: lang === l.code ? 'rgba(230,57,70,0.08)' : 'transparent' }}>
              <span>{l.label}</span>
              {lang === l.code && <Check size={14} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Titolo, descrizione, indirizzo canonico e anteprima social di ogni versione linguistica (i motori di ricerca
// eseguono lo script, quindi leggono questi valori).
function useLandingSeo(lang, t) {
  useEffect(() => {
    const entry = LANDING_LANGS.find(l => l.code === lang) || LANDING_LANGS[0]
    const url = SITE + (entry.path === '/' ? '/' : entry.path)
    const title = t('landing.seoTitle'), desc = t('landing.seoDescription')
    const set = (selector, attr, value, make) => {
      let el = document.head.querySelector(selector)
      if (!el) { el = document.createElement(make.tag); Object.entries(make.attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el) }
      el.setAttribute(attr, value)
    }
    document.title = title
    set('meta[name="description"]', 'content', desc, { tag: 'meta', attrs: { name: 'description' } })
    set('meta[property="og:title"]', 'content', title, { tag: 'meta', attrs: { property: 'og:title' } })
    set('meta[property="og:description"]', 'content', desc, { tag: 'meta', attrs: { property: 'og:description' } })
    set('meta[property="og:url"]', 'content', url, { tag: 'meta', attrs: { property: 'og:url' } })
    set('link[rel="canonical"]', 'href', url, { tag: 'link', attrs: { rel: 'canonical' } })
    return () => {
      // uscendo dalla pagina pubblica si torna ai valori di base (italiano) di index.html
      document.title = 'Roadcase'
    }
  }, [lang, t])
}

export default function Landing({ lang = 'it' }) {
  const { t, i18n } = useTranslation()
  // La lingua della pagina è quella dell'indirizzo (/, /en, /pt, /ar): chi arriva da un link in portoghese la vede in portoghese.
  useEffect(() => { if (i18n.language !== lang) i18n.changeLanguage(lang) }, [lang, i18n])
  useLandingSeo(lang, t)
  const phaseTexts = t('landing.phases', { returnObjects: true })
  const phases = PHASE_META.map((m, i) => ({ ...m, label: phaseTexts[i]?.label, desc: phaseTexts[i]?.desc }))
  const featureTexts = t('landing.features', { returnObjects: true })
  const strengths = t('landing.strengths', { returnObjects: true })
  const plans = t('landing.plans', { returnObjects: true })
  const perMonth = t('landing.perMonth')
  return (
    <div data-theme="light" style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>
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
          .lp-strengths { grid-template-columns: repeat(4, 1fr); gap: 28px; }
          .lp-pricing { grid-template-columns: repeat(3, 1fr); gap: 20px; }
        }
        /* Telefono stretto: la barra in alto (lingua, accesso, prova) deve stare su una riga in ogni lingua */
        @media (max-width: 480px) {
          .lp-brand-mark { display: none !important; }
          .lp-globe { display: none; }
          .lp-nav { gap: 0 !important; }
          .lp-nav .lp-link { padding: 8px 4px; font-size: 13px; white-space: nowrap; }
          .lp-nav .lp-btn { padding: 8px 12px !important; font-size: 13px !important; }
        }
        .lp-footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px 24px; align-items: start; }
        .lp-footer-col { display: flex; flex-direction: column; gap: 12px; }
        @media (min-width: 640px) {
          .lp-footer { display: flex; justify-content: space-between; align-items: center; }
          .lp-footer-col { flex-direction: row; align-items: center; gap: 24px; }
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
            <img className="lp-brand-mark" src="/pwa-192x192.png" alt="" width={32} height={32} style={{ borderRadius: 8, display: 'block' }} />
            <Wordmark />
          </div>
          <nav className="lp-nav" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <LangMenu lang={lang} label={t('landing.langLabel')} />
            <Link to="/login" className="lp-link">{t('landing.login')}</Link>
            <Link to="/signup" className="lp-btn lp-btn-primary" style={{ padding: '9px 16px', fontSize: 13.5, boxShadow: 'none' }}>{t('landing.tryFree')}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section style={wrap}>
          <div className="lp-hero">
            <div>
              <p className="lp-reveal" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
                {t('landing.eyebrow')}
              </p>
              <h1 className="lp-h1 lp-reveal" style={{ animationDelay: '60ms' }}>
                {t('landing.title')}
              </h1>
              <p className="lp-reveal" style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text2)', maxWidth: 520, marginBottom: 28, animationDelay: '120ms' }}>
                {t('landing.text')}
              </p>
              <div className="lp-reveal lp-cta" style={{ animationDelay: '180ms' }}>
                <Link to="/signup" className="lp-btn lp-btn-primary">{t('landing.ctaStart')}</Link>
                <Link to="/login" className="lp-btn lp-btn-secondary">{t('landing.ctaLogin')}</Link>
              </div>
              <p className="lp-reveal" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 14, animationDelay: '220ms' }}>
                {t('landing.heroNote')}
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
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>{t('landing.stepsTitle')}</h2>
            <p style={{ fontSize: 16, color: 'var(--text2)', maxWidth: 560, marginBottom: 32, lineHeight: 1.55 }}>
              {t('landing.stepsText')}
            </p>
            <div className="lp-steps">
              {phases.map((p, i) => (
                <div key={p.key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p.Icon size={18} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text3)', letterSpacing: '0.6px' }}>{t('landing.step', { n: i + 1 })}</span>
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
          <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>{t('landing.featuresTitle')}</h2>
          <p style={{ fontSize: 16, color: 'var(--text2)', maxWidth: 560, marginBottom: 32, lineHeight: 1.55 }}>
            {t('landing.featuresText')}
          </p>
          <div className="lp-features">
            {featureTexts.map((f, fi) => (
              <div key={f.title} className="lp-card" style={{ padding: 20 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  {(() => { const Ic = FEATURE_ICONS[fi]; return <Ic size={19} /> })()}
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
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 32, maxWidth: 620 }}>{t('landing.strengthsTitle')}</h2>
            <div className="lp-strengths">
              {strengths.map(s => (
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
            <h2 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em' }}>{t('landing.trialTitle')}</h2>
            <span style={{ background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{t('landing.betaBadge')}</span>
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text2)', maxWidth: 620, marginBottom: 32 }}>
            {t('landing.trialText')}
          </p>

          <div className="lp-pricing">
            {plans.map((plan, pi) => ({ ...plan, highlight: PRICING_META[pi].highlight, period: pi > 0 ? perMonth : null })).map(plan => (
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
                <Link to="/signup" className={`lp-btn ${plan.highlight ? 'lp-btn-primary' : 'lp-btn-secondary'}`} style={{ width: '100%' }}>{plan.cta}</Link>
              </div>
            ))}
          </div>

        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)' }}>
        {/* Due colonne anche da telefono: a sinistra il marchio e le lingue, a destra contatti e note legali */}
        <div className="lp-footer" style={{ ...wrap, padding: '28px 20px 40px' }}>
          <div className="lp-footer-col">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/pwa-192x192.png" alt="" width={24} height={24} style={{ borderRadius: 6, display: 'block' }} />
              <Wordmark size={16} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: '4px 10px', flexWrap: 'wrap' }}>
              {LANDING_LANGS.map(l => <Link key={l.code} to={l.path} hrefLang={l.code} lang={l.code} aria-current={lang === l.code ? 'true' : undefined} style={{ color: 'inherit', fontWeight: lang === l.code ? 800 : 500, textDecoration: 'none' }}>{l.label}</Link>)}
            </p>
          </div>
          <div className="lp-footer-col">
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>{t('landing.contact')} <a href="mailto:info@roadcase.it" style={{ color: 'inherit' }}>info@roadcase.it</a></p>
            <p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: '4px 10px', flexWrap: 'wrap' }}>
              <Link to="/privacy" style={{ color: 'inherit' }}>{t('landing.privacy')}</Link>
              <Link to="/terms" style={{ color: 'inherit' }}>{t('landing.terms')}</Link>
              <Link to="/cookie-policy" style={{ color: 'inherit' }}>{t('landing.cookies')}</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
