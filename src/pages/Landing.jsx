/*
  THESIS: la home è un baule da trasporto (flight case) con la lista di carico attaccata col nastro: l'oggetto che
    il magazziniere conosce a memoria, non un "SaaS scuro con luci". Rifiuta hero con raggi di luce, contatori,
    etichette a spaziatura fissa, caratteri d'epoca, numeri di sezione e griglie di schede tutte uguali.
  OWN-WORLD: nero opaco dei bauli, bordi e angoli in alluminio, evidenziatore rosso e carta da lista; caratteri e
    arrotondamenti dell'app (sistema, 800, titoli stretti). Chiaro = magazzino di giorno (#f5f5f3, inchiostro scuro); scuro = scarico notturno (nero caldo, carta
    chiara); segue il dispositivo. Il rosso #e63946 è solo evidenziatore, bottoni e pagina finale.
  STORY: capisco in una riga cos'è, vedo la lista che si riempie scorrendo (Pronto → Carico → Rientro), spunto le
    funzioni come righe di una lista, provo gratis 30 giorni.
  FIRST VIEWPORT: a sinistra titolo con la seconda riga evidenziata di rosso, frase, bottoni; a destra il baule
    con la lista attaccata (schede Pronto/Carico/Rientro toccabili).
  FORM: pagina marketing a scorrimento; un solo momento animato forte (la lista si riempie mentre la sezione resta
    ferma), le funzioni si spuntano quando compaiono. Scelta pilotata dall'utente ("mix chiaro e scuro"): nessun
    sorteggio di direzione.
*/
import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { detectDeviceLanguage } from '../i18n'

// Pagina pubblica mostrata a chi visita il sito SENZA essere loggato (vedi
// App.jsx → PrivateRoutes: solo il path "/" mostra questa invece del redirect
// a /login) — serve sia ai clienti che a chi deve verificare l'attività
// (es. Stripe), che altrimenti si troverebbero solo un form di accesso vuoto.
// Ha un tema chiaro e uno scuro che segue quello del dispositivo: i colori stanno nelle variabili
// --lp-* del blocco CSS qui sotto, non nei token dell'app.
// Google Calendar volutamente non è tra i punti di forza mostrati qui: la
// sincronizzazione esiste ma va ancora rifinita prima di usarla come leva.

// I testi stanno nei file delle lingue (it, en, pt, ar → chiave `landing`): qui restano solo i colori e i numeri dimostrativi.
const PHASE_META = [
  { key: 'pronto', color: 'var(--lp-ph-pronto)' },
  { key: 'load',   color: 'var(--lp-ph-load)' },
  { key: 'return', color: 'var(--lp-ph-return)' },
]
const PRICING_META = [{ highlight: false }, { highlight: true }, { highlight: false }]

// Pagine pubbliche, una per lingua: indirizzi distinti così i motori di ricerca le indicizzano separatamente (hreflang).
export const LANDING_LANGS = [
  { code: 'it', path: '/',   label: 'Italiano' },
  { code: 'en', path: '/en', label: 'English' },
  { code: 'pt', path: '/pt', label: 'Português' },
  { code: 'ar', path: '/ar', label: 'العربية' },
]
const SITE = 'https://www.roadcase.it'

// Lingua scelta dal visitatore: ricordata per non richiedergliela e per riportarlo alla versione giusta da "/".
const LANG_PREF_KEY = 'rc-landing-lang'
const readPref = key => { try { return localStorage.getItem(key) } catch { return null } }
const savePref = (key, value) => { try { localStorage.setItem(key, value) } catch { /* modalità privata: si chiederà di nuovo */ } }
const saveLangPref = code => savePref(LANG_PREF_KEY, code)

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Tema: segue quello del dispositivo (anche se cambia mentre la pagina è aperta).
function useSystemTheme() {
  const query = () => typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null
  const [dark, setDark] = useState(() => !!query()?.matches)
  useEffect(() => {
    const mq = query()
    if (!mq) return undefined
    const on = e => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark ? 'dark' : 'light'
}

// Righe della finta lista di carico nell'anteprima: quanti pezzi risultano
// fatti in ciascuna fase (i numeri sono solo dimostrativi).
const DEMO_ROWS = [
  { qty: 8,  done: { pronto: 8,  load: 8,  return: 8 } },
  { qty: 1,  done: { pronto: 1,  load: 1,  return: 0 } },
  { qty: 12, done: { pronto: 12, load: 9,  return: 0 } },
  { qty: 20, done: { pronto: 20, load: 0,  return: 0 } },
]
const CASE_NO = 'RC-0417'

function Wordmark({ size = 22 }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.4px', lineHeight: 1 }}>
      ROAD<span style={{ color: 'var(--lp-red)' }}>CASE</span>
    </span>
  )
}

const Arrow = () => (
  <svg className="lp-arrow" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
const CheckIcon = ({ size = 13 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
function DemoRowState({ done, qty }) {
  if (done >= qty) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--lp-ph-return)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CheckIcon />
      </span>
    )
  }
  return (
    <span style={{ minWidth: 22, height: 22, borderRadius: 11, padding: done > 0 ? '0 7px' : 0, border: `2px solid ${done > 0 ? 'var(--lp-ph-load)' : 'var(--lp-paper-line)'}`, color: 'var(--lp-ph-load)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
      {done > 0 ? `${done}/${qty}` : ''}
    </span>
  )
}

// Lista di carico su carta (resta chiara in entrambi i temi, è un foglio stampato). Con `onPhase` le schede si toccano;
// senza, le schede mostrano soltanto la fase in corso (lo scorrimento della pagina decide quale).
function LoadSheet({ phase, values, onPhase, large }) {
  const { t } = useTranslation()
  const phaseTexts = t('landing.phases', { returnObjects: true })
  const demoNames = t('landing.demoRows', { returnObjects: true })
  const phases = PHASE_META.map((m, i) => ({ ...m, label: phaseTexts[i]?.label }))
  const current = phases.find(p => p.key === phase)
  const totalQty = DEMO_ROWS.reduce((s, r) => s + r.qty, 0)
  const totalDone = values.reduce((s, v) => s + v, 0)
  const tabStyle = p => ({ background: phase === p.key ? p.color : 'transparent', color: phase === p.key ? '#fff' : 'var(--lp-paper-ink2)' })

  return (
    <div className={`lp-sheet${large ? ' lp-sheet-lg' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-paper-ink2)' }}>{t('landing.previewLabel')}</p>
          <p className="lp-display" style={{ fontSize: large ? 24 : 20, lineHeight: 1.15 }}>{t('landing.previewName')}</p>
        </div>
        <span className="lp-chip">{t('landing.previewDay')}</span>
      </div>

      {onPhase ? (
        <div role="tablist" aria-label={t('landing.previewTabs')} className="lp-tabs">
          {phases.map(p => (
            <button key={p.key} role="tab" aria-selected={phase === p.key} onClick={() => onPhase(p.key)} className="btn-no-anim" style={tabStyle(p)}>{p.label}</button>
          ))}
        </div>
      ) : (
        <div className="lp-tabs" aria-hidden="true">
          {phases.map(p => <span key={p.key} style={tabStyle(p)}>{p.label}</span>)}
        </div>
      )}

      <div>
        {DEMO_ROWS.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: large ? '14px 2px' : '11px 2px', borderTop: i > 0 ? '1px solid var(--lp-paper-line)' : 'none' }}>
            <DemoRowState done={values[i]} qty={r.qty} />
            <span style={{ flex: 1, fontSize: large ? 17 : 15, fontWeight: 600 }}>{demoNames[i]}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--lp-paper-ink2)', fontVariantNumeric: 'tabular-nums' }}>×{r.qty}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--lp-paper-line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginBottom: 7 }}>
          <span style={{ color: 'var(--lp-paper-ink2)' }}>{current.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalDone}/{totalQty}</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--lp-paper-line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', borderRadius: 4, background: current.color, transformOrigin: 'left', transform: `scaleX(${totalDone / totalQty})`, transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), background 0.25s ease' }} />
        </div>
      </div>
    </div>
  )
}

// Il baule: telaio in alluminio con angoli sferici e chiusure, scritta stampigliata e la lista attaccata col nastro.
function FlightCase({ children }) {
  return (
    <div className="lp-case">
      <i className="lp-corner" style={{ top: -9, insetInlineStart: -9 }} /><i className="lp-corner" style={{ top: -9, insetInlineEnd: -9 }} />
      <i className="lp-corner" style={{ bottom: -9, insetInlineStart: -9 }} /><i className="lp-corner" style={{ bottom: -9, insetInlineEnd: -9 }} />
      <i className="lp-latch" style={{ insetInlineStart: '16%' }} /><i className="lp-latch" style={{ insetInlineEnd: '16%' }} />
      <div className="lp-case-label" aria-hidden="true">
        <Wordmark size={24} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', opacity: 0.75 }}>{CASE_NO}</span>
      </div>
      <div className="lp-taped">{children}</div>
    </div>
  )
}

function HeroSheet() {
  const [phase, setPhase] = useState('load')
  return <FlightCase><LoadSheet phase={phase} values={DEMO_ROWS.map(r => r.done[phase])} onPhase={setPhase} /></FlightCase>
}

// Lo scorrimento della pagina riempie la lista: la sezione resta ferma mentre Pronto, Carico e Rientro si completano
// uno dopo l'altro. Con "meno animazioni" la sezione non si blocca e le fasi si scelgono con le schede.
const ease = x => 1 - Math.pow(1 - x, 3)
function ScrollStory() {
  const { t } = useTranslation()
  const sectionRef = useRef(null)
  const [reduced] = useState(prefersReducedMotion)
  const [p, setP] = useState(0)
  const [manual, setManual] = useState('load')

  useEffect(() => {
    if (reduced) return undefined
    let raf = 0
    const measure = () => {
      raf = 0
      const el = sectionRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const travel = el.offsetHeight - (window.innerHeight - 64)
      setP(Math.round(Math.min(1, Math.max(0, (64 - top) / travel)) * 200) / 200)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [reduced])

  const phaseTexts = t('landing.phases', { returnObjects: true })
  const idx = reduced ? PHASE_META.findIndex(m => m.key === manual) : Math.min(PHASE_META.length - 1, Math.floor(p * PHASE_META.length))
  const phase = PHASE_META[idx].key
  const local = reduced ? 1 : ease(Math.min(1, (p * PHASE_META.length - idx) * 1.3))
  const prevKey = idx > 0 ? PHASE_META[idx - 1].key : null
  const values = DEMO_ROWS.map(r => { const from = prevKey ? r.done[prevKey] : 0; return Math.round(from + (r.done[phase] - from) * local) })

  return (
    <section ref={sectionRef} className={`lp-story${reduced ? '' : ' lp-pinned'}`}>
      <div className="lp-story-sticky">
        <div className="lp-wrap lp-story-grid">
          <div>
            <h2 className="lp-display lp-h2">{t('landing.stepsTitle')}</h2>
            <p className="lp-lead lp-story-lead">{t('landing.stepsText')}</p>
            <ol className="lp-rail">
              {!reduced && <span className="lp-rail-fill" style={{ height: `${p * 100}%` }} aria-hidden="true" />}
              {PHASE_META.map((m, i) => (
                <li key={m.key} className={i === idx ? 'on' : i < idx ? 'past' : ''}>
                  <span className="lp-dot" style={{ '--c': m.color }} aria-hidden="true">{i < idx && <CheckIcon size={10} />}</span>
                  <div>
                    <h3 className="lp-display">{phaseTexts[i]?.label}</h3>
                    <p>{phaseTexts[i]?.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-story-sheet">
            <LoadSheet large phase={phase} values={values} onPhase={reduced ? setManual : undefined} />
          </div>
        </div>
      </div>
    </section>
  )
}

// Una funzione = una riga della lista: la casella si spunta quando la riga entra nello schermo.
function TickRow({ title, desc }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setOn(true); io.disconnect() } }, { rootMargin: '0px 0px -16% 0px', threshold: 0.5 })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return (
    <li ref={ref} className={`lp-tick${on ? ' on' : ''}`}>
      <span className="lp-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" /></svg>
      </span>
      <div>
        <h3 className="lp-display">{title}</h3>
        <p>{desc}</p>
      </div>
    </li>
  )
}

// Finestra che chiede la lingua alla prima visita: stessa frase in tutte le lingue, così la capisce chiunque.
const PICK_LINES = [
  { code: 'it', text: 'Scegli la lingua' },
  { code: 'en', text: 'Choose your language' },
  { code: 'pt', text: 'Escolha o idioma' },
  { code: 'ar', text: 'اختر لغتك' },
]
function LangPrompt({ suggested, closeLabel, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const buttons = () => Array.from(ref.current?.querySelectorAll('button') || [])
    ;(buttons().find(b => b.dataset.code === suggested) || buttons()[0])?.focus()
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const list = buttons()
      if (!list.length) return
      const first = list[0], last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey) }
  }, [suggested, onClose])
  return (
    <div className="lp-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className="lp-modal" role="dialog" aria-modal="true" aria-label="Scegli la lingua / Choose your language">
        <button type="button" className="btn-no-anim lp-iconbtn lp-modal-x" onClick={onClose} aria-label={closeLabel}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {PICK_LINES.map((l, i) => (
            <p key={l.code} lang={l.code} dir={l.code === 'ar' ? 'rtl' : 'ltr'} className={i === 0 ? 'lp-display' : ''} style={i === 0 ? { fontSize: 26, marginBottom: 8, lineHeight: 1.15 } : { fontSize: 14.5, color: 'var(--lp-ink2)', lineHeight: 1.7 }}>{l.text}</p>
          ))}
        </div>
        <div className="lp-modal-grid">
          {LANDING_LANGS.map(l => (
            <button key={l.code} type="button" data-code={l.code} className="btn-no-anim lp-modal-opt" lang={l.code} onClick={() => onPick(l)}
              style={l.code === suggested ? { borderColor: 'var(--lp-red)', boxShadow: '0 0 0 1px var(--lp-red)' } : undefined}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--lp-red-ink)', letterSpacing: '0.06em' }}>{l.code.toUpperCase()}</span>
              <span style={{ fontSize: 15.5, fontWeight: 600 }}>{l.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Titolo, descrizione, indirizzo canonico e anteprima social di ogni versione linguistica (i motori di ricerca
// eseguono lo script, quindi leggono questi valori). Le domande frequenti vanno anche come dati strutturati.
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

    const faq = t('landing.faq', { returnObjects: true })
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.id = 'lp-faq-ld'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
      mainEntity: (Array.isArray(faq) ? faq : []).map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    })
    document.head.appendChild(ld)
    return () => {
      // uscendo dalla pagina pubblica si torna ai valori di base (italiano) di index.html
      document.title = 'Roadcase'
      ld.remove()
    }
  }, [lang, t])
}

const LANDING_CSS = `
  /* Tema chiaro: il magazzino di giorno */
  .lp {
    --lp-bg: #f5f5f3; --lp-bg2: #ebeae6; --lp-surface: #ffffff;
    --lp-ink: #16161a; --lp-ink2: #54545c; --lp-ink3: #6b6b73;
    --lp-line: rgba(22,22,26,0.12); --lp-line2: rgba(22,22,26,0.24); --lp-dot: rgba(22,22,26,0.2); --lp-wash: rgba(230,57,70,0.13);
    --lp-red: #e63946; --lp-red-btn: #d9303e; --lp-red-ink: #c4283a;
    --lp-inv-bg: #16161a; --lp-inv-fg: #f5f5f3; --lp-inv-fg2: #b9b9c0;
    --lp-tick: #1a7f4b; --lp-header-bg: #f5f5f3;
    --lp-case: #1c1c1b; --lp-alu-1: #dcdee1; --lp-alu-2: #a3a6ab; --lp-alu-3: #8a8d92;
    --lp-paper: #fbf9f4; --lp-paper-ink: #19191b; --lp-paper-ink2: #5a5a60; --lp-paper-line: rgba(25,25,27,0.14);
    --lp-ph-pronto: #2f6fd6; --lp-ph-load: #b46d00; --lp-ph-return: #1a7f4b;
    --lp-spot: transparent;
    --lp-body: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
    --lp-display: var(--lp-body);
    min-height: 100dvh; background: var(--lp-bg); color: var(--lp-ink); font-family: var(--lp-body); color-scheme: light; overflow-x: clip;
  }
  /* Tema scuro: lo scarico di notte */
  .lp[data-theme="dark"] {
    --lp-bg: #121211; --lp-bg2: #191918; --lp-surface: #1d1d1c;
    --lp-ink: #f3f1ec; --lp-ink2: #bab7b0; --lp-ink3: #8f8c86;
    --lp-line: rgba(243,241,236,0.12); --lp-line2: rgba(243,241,236,0.24); --lp-dot: rgba(243,241,236,0.2); --lp-wash: rgba(230,57,70,0.16);
    --lp-red-ink: #ff6b75;
    --lp-inv-bg: #f3f1ec; --lp-inv-fg: #121211; --lp-inv-fg2: #55534e;
    --lp-tick: #34c77b; --lp-header-bg: #121211;
    --lp-case: #0b0b0b;
    --lp-ph-pronto: #3f7fe6;
    --lp-spot: rgba(243,241,236,0.09);
    color-scheme: dark;
  }
  .lp a { color: inherit; }
  .lp :where(h1, h2, h3, p, ol, ul) { margin: 0; padding: 0; }
  .lp-display { font-family: var(--lp-display); font-weight: 800; letter-spacing: -0.035em; }
  .lp-ar .lp-display { letter-spacing: 0; }
  .lp-ar .lp-arrow { transform: scaleX(-1); }
  .lp-wrap { max-width: 1160px; margin: 0 auto; padding: 0 20px; position: relative; }
  .lp [id] { scroll-margin-top: 80px; }
  .lp-h2 { font-size: clamp(30px, 4.8vw, 46px); line-height: 1.06; margin-bottom: 14px; text-wrap: balance; }
  .lp-ar .lp-h2 { line-height: 1.3; }
  .lp-lead { font-size: 17px; line-height: 1.65; color: var(--lp-ink2); max-width: 540px; }
  .lp-section { padding: 80px 0; }

  /* Barra in alto */
  .lp-header { position: sticky; top: 0; z-index: 20; background: var(--lp-header-bg); border-bottom: 1px solid var(--lp-line); }
  .lp-header-in { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 12px; }
  .lp-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
  .lp-brand img { border-radius: 8px; display: block; }
  .lp-nav { display: flex; align-items: center; gap: 6px; }
  .lp-links { display: none; align-items: center; gap: 2px; margin-inline-end: 14px; }
  .lp-navlink, .lp-link { font-size: 14.5px; font-weight: 600; color: var(--lp-ink2); text-decoration: none; padding: 10px 12px; white-space: nowrap; transition: color 0.15s ease; }
  .lp-iconbtn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 40px; height: 40px; padding: 0 10px; border-radius: 10px; background: transparent; border: 1px solid var(--lp-line2); color: var(--lp-ink); }

  /* Pulsanti */
  .lp-btn { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 15px 26px; border-radius: 12px; font-family: var(--lp-body); font-size: 16px; font-weight: 700; text-decoration: none; transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease; }
  .lp-btn-primary { background: var(--lp-red-btn); color: #fff; box-shadow: 0 8px 14px -8px rgba(160,20,34,0.7); }
  .lp-btn-ghost { background: transparent; color: var(--lp-ink); border: 1.5px solid var(--lp-line2); }
  .lp-btn-sm { padding: 10px 16px; font-size: 14.5px; box-shadow: none; }
  .lp-btn:focus-visible, .lp-link:focus-visible, .lp-navlink:focus-visible, .lp-iconbtn:focus-visible, .lp-modal-opt:focus-visible, .lp summary:focus-visible, .lp-tabs button:focus-visible { outline: 2px solid var(--lp-red-ink); outline-offset: 2px; }
  @media (hover: hover) and (pointer: fine) {
    .lp-btn-primary:hover { transform: translateY(-1px); background: #e63946; }
    .lp-btn-ghost:hover { border-color: var(--lp-ink2); }
    .lp-link:hover, .lp-navlink:hover { color: var(--lp-ink); }
    .lp-iconbtn:hover { border-color: var(--lp-ink2); }
    .lp-modal-opt:hover { border-color: var(--lp-red); }
  }

  /* Sfondo della prima schermata: punti che scivolano piano e una macchia rossa che respira */
  .lp-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .lp-bg-dots { position: absolute; inset: -56px; background-image: radial-gradient(circle, var(--lp-dot) 1.2px, transparent 1.6px); background-size: 28px 28px; animation: lp-drift 48s linear infinite; -webkit-mask-image: radial-gradient(ellipse 75% 85% at 62% 42%, #000 15%, transparent 78%); mask-image: radial-gradient(ellipse 75% 85% at 62% 42%, #000 15%, transparent 78%); }
  .lp-bg-wash { position: absolute; top: -220px; inset-inline-end: -180px; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(closest-side, var(--lp-wash), transparent); animation: lp-breathe 14s ease-in-out infinite alternate; }
  @keyframes lp-drift { from { transform: translate(0, 0); } to { transform: translate(56px, 56px); } }
  @keyframes lp-breathe { from { opacity: 0.55; transform: translate(0, 0) scale(1); } to { opacity: 1; transform: translate(-40px, 30px) scale(1.12); } }

  /* Prima schermata */
  .lp-hero { position: relative; overflow: hidden; }
  .lp-hero-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr; gap: 48px; align-items: center; padding: 44px 0 72px; }
  .lp-h1 { font-size: clamp(38px, 8.6vw, 66px); line-height: 1.1; margin-bottom: 26px; }
  .lp-h1 > span { display: block; }
  .lp-h1 > span:first-child { margin-bottom: 0.16em; }
  .lp-ar .lp-h1 { line-height: 1.3; }
  .lp-tape { display: inline !important; line-height: 1.34; padding: 0 0.24em 0.04em; background: var(--lp-red); color: #fff; border-radius: 0.2em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .lp-hero-lead { font-size: 18px; line-height: 1.6; color: var(--lp-ink2); max-width: 520px; margin-bottom: 30px; }
  .lp-hero-lead strong { display: block; color: var(--lp-ink); font-weight: 700; margin-bottom: 6px; }
  .lp-cta { display: flex; flex-wrap: wrap; gap: 10px; }
  .lp-cta .lp-btn { flex: 1 1 100%; }
  .lp-note { font-size: 14px; color: var(--lp-ink3); margin-top: 18px; }
  .lp-stage { position: relative; }
  .lp-stage::before { content: ''; position: absolute; inset: -12% -10%; background: radial-gradient(closest-side, var(--lp-spot), transparent); pointer-events: none; }

  /* Baule da trasporto */
  .lp-case { position: relative; max-width: 430px; margin: 0 auto; background: var(--lp-case); border: 5px solid; border-color: var(--lp-alu-1) var(--lp-alu-2) var(--lp-alu-3) var(--lp-alu-2); border-radius: 18px; padding: 20px 18px 24px; box-shadow: 0 0 0 1px rgba(0,0,0,0.45), 0 34px 40px -26px rgba(0,0,0,0.6); }
  .lp-corner { position: absolute; width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 34% 30%, #f1f2f3, #9a9da2 58%, #5e6166); box-shadow: 0 1px 2px rgba(0,0,0,0.5); z-index: 2; }
  .lp-latch { position: absolute; top: -12px; width: 50px; height: 20px; border-radius: 4px; background: linear-gradient(#e2e4e6, #9a9da2); box-shadow: 0 1px 2px rgba(0,0,0,0.5); z-index: 2; }
  .lp-latch::after { content: ''; position: absolute; inset: 6px 10px; border-radius: 2px; background: #2a2a2b; }
  .lp-case-label { display: flex; align-items: center; justify-content: space-between; color: #f3f1ec; padding-bottom: 14px; margin-bottom: 16px; border-bottom: 2px solid rgba(243,241,236,0.18); direction: ltr; }
  .lp-taped { position: relative; }
  .lp-taped::before, .lp-taped::after { content: ''; position: absolute; top: -11px; width: 72px; height: 22px; background: rgba(226,212,176,0.92); box-shadow: 0 1px 2px rgba(0,0,0,0.3); z-index: 1; }
  .lp-taped::before { inset-inline-start: 18px; transform: rotate(-5deg); }
  .lp-taped::after { inset-inline-end: 18px; transform: rotate(4deg); }
  .lp-sheet { background: var(--lp-paper); color: var(--lp-paper-ink); border-radius: 14px; padding: 22px 16px 16px; box-shadow: 0 14px 18px -12px rgba(0,0,0,0.55); }
  .lp-sheet-lg { padding: 26px 22px 20px; max-width: 480px; margin: 0 auto; border-radius: 20px; box-shadow: 0 1px 0 var(--lp-line), 0 22px 36px -22px rgba(0,0,0,0.45); }
  .lp-chip { flex-shrink: 0; background: var(--lp-red); color: #fff; font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
  .lp-tabs { display: flex; gap: 3px; padding: 3px; margin-bottom: 12px; background: rgba(25,25,27,0.07); border-radius: 12px; }
  .lp-tabs > * { flex: 1; padding: 9px 4px; border-radius: 9px; font-size: 13.5px; font-weight: 700; text-align: center; transition: background 0.25s ease, color 0.25s ease; }

  /* Sezione che si riempie scorrendo */
  .lp-story { position: relative; }
  .lp-pinned { height: 320svh; }
  .lp-story-sticky { position: sticky; top: 64px; min-height: calc(100svh - 64px); display: flex; align-items: center; }
  .lp-story:not(.lp-pinned) .lp-story-sticky { position: static; padding: 80px 0; }
  .lp-story-grid { display: grid; grid-template-columns: 1fr; gap: 20px; width: 100%; }
  .lp-story-lead { display: none; }
  .lp-rail { position: relative; list-style: none; display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-inline-start: 34px; }
  .lp-rail::before { content: ''; position: absolute; inset-block: 10px; inset-inline-start: 9px; width: 2px; background: var(--lp-line2); }
  .lp-rail-fill { position: absolute; inset-inline-start: 9px; top: 10px; width: 2px; max-height: calc(100% - 20px); background: var(--lp-red); }
  .lp-rail li { position: relative; padding: 4px 0; opacity: 0.5; transition: opacity 0.3s ease; }
  .lp-rail li.on, .lp-rail li.past { opacity: 1; }
  .lp-rail li h3 { font-size: 21px; line-height: 1.2; }
  .lp-rail li p { font-size: 15px; line-height: 1.55; color: var(--lp-ink2); max-width: 420px; margin-top: 4px; }
  .lp-rail li:not(.on) p { display: none; }
  .lp-dot { position: absolute; inset-inline-start: -34px; top: 8px; width: 20px; height: 20px; border-radius: 50%; background: var(--lp-bg); border: 2px solid var(--lp-line2); display: flex; align-items: center; justify-content: center; color: #fff; transition: background 0.25s ease, border-color 0.25s ease; z-index: 1; }
  .lp-rail li.on .lp-dot { border-color: var(--c); background: var(--c); box-shadow: 0 0 0 4px var(--lp-bg), 0 0 0 5.5px var(--c); }
  .lp-rail li.past .lp-dot { border-color: var(--c); background: var(--c); }
  .lp-story:not(.lp-pinned) .lp-rail li { opacity: 1; }
  .lp-story:not(.lp-pinned) .lp-rail li:not(.on) p { display: block; }

  /* Funzioni come righe di una lista */
  .lp-ticks { list-style: none; display: grid; grid-template-columns: 1fr; gap: 0; margin-top: 40px; border-top: 1px solid var(--lp-line2); }
  .lp-tick { display: flex; gap: 18px; align-items: flex-start; padding: 24px 0; border-bottom: 1px solid var(--lp-line2); }
  .lp-tick h3 { font-size: 21px; line-height: 1.2; margin-bottom: 6px; }
  .lp-tick p { font-size: 15.5px; line-height: 1.6; color: var(--lp-ink2); max-width: 460px; }
  .lp-box { flex-shrink: 0; width: 30px; height: 30px; margin-top: 2px; border-radius: 8px; border: 2px solid var(--lp-line2); display: flex; align-items: center; justify-content: center; color: #fff; transition: background 0.25s ease, border-color 0.25s ease; }
  .lp-box path { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 0.4s cubic-bezier(0.22,1,0.36,1) 0.12s; }
  .lp-tick.on .lp-box { background: var(--lp-tick); border-color: var(--lp-tick); }
  .lp[data-theme="dark"] .lp-tick.on .lp-box { color: #0b2a18; }
  .lp-tick.on .lp-box path { stroke-dashoffset: 0; }

  /* Punti di forza */
  .lp-band { background: var(--lp-bg2); border-block: 1px solid var(--lp-line); }
  .lp-strengths { display: grid; grid-template-columns: 1fr; gap: 36px; }
  .lp-strengths h3 { font-size: 21px; line-height: 1.2; margin: 0 0 10px; }
  .lp-strengths h3::before { content: ''; display: block; width: 40px; height: 5px; border-radius: 3px; background: var(--lp-red); margin-bottom: 16px; }
  .lp-strengths p { font-size: 15.5px; line-height: 1.65; color: var(--lp-ink2); }

  /* Prezzi */
  .lp-pricing { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; margin-top: 36px; }
  .lp-plan { position: relative; display: flex; flex-direction: column; gap: 20px; padding: 28px 24px; background: var(--lp-surface); border: 1px solid var(--lp-line); border-radius: 22px; }
  .lp-plan.hl { background: var(--lp-inv-bg); color: var(--lp-inv-fg); border-color: var(--lp-inv-bg); box-shadow: 0 26px 34px -24px rgba(0,0,0,0.55); }
  .lp-plan.hl .lp-plan-sub, .lp-plan.hl li, .lp-plan.hl .lp-per { color: var(--lp-inv-fg2); }
  .lp-plan-sub { font-size: 15px; color: var(--lp-ink2); margin-top: 4px; }
  .lp-plan ul { list-style: none; display: flex; flex-direction: column; gap: 11px; flex: 1; }
  .lp-plan li { display: flex; align-items: flex-start; gap: 10px; font-size: 15.5px; color: var(--lp-ink2); line-height: 1.45; }
  .lp-plan li svg { color: var(--lp-red-ink); flex-shrink: 0; margin-top: 3px; }
  .lp-plan.hl li svg { color: var(--lp-red); }
  .lp-plan.hl .lp-btn-primary { box-shadow: none; }
  .lp-plan:not(.hl) .lp-btn-ghost { color: var(--lp-ink); }
  .lp-badge { position: absolute; top: -13px; inset-inline-start: 22px; background: var(--lp-red); color: #fff; padding: 4px 12px; font-size: 13px; font-weight: 700; border-radius: 8px; }
  .lp-beta { background: var(--lp-red); color: #fff; padding: 5px 11px; font-size: 13px; font-weight: 700; border-radius: 8px; }

  /* Domande frequenti */
  .lp-faq-grid { display: grid; grid-template-columns: 1fr; gap: 28px; }
  .lp details { border-top: 1px solid var(--lp-line2); }
  .lp details:last-child { border-bottom: 1px solid var(--lp-line2); }
  .lp summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 0; cursor: pointer; list-style: none; font-size: 17.5px; font-weight: 600; }
  .lp summary::-webkit-details-marker { display: none; }
  .lp-plus { flex-shrink: 0; color: var(--lp-red-ink); transition: transform 0.2s ease; }
  .lp details[open] .lp-plus { transform: rotate(45deg); }
  .lp details p { padding: 0 0 22px; color: var(--lp-ink2); line-height: 1.7; font-size: 16px; max-width: 640px; }

  /* Invito finale: pagina intera di nastro rosso */
  .lp-final { background: var(--lp-red-btn); color: #fff; text-align: center; padding: 96px 0; }
  .lp-final .lp-h2 { font-size: clamp(32px, 6vw, 56px); max-width: 820px; margin: 0 auto 30px; line-height: 1.05; }
  .lp-ar .lp-final .lp-h2 { line-height: 1.3; }
  .lp-btn-dark { background: #16161a; color: #fff; }
  .lp-btn-dark:hover { background: #000; }


  /* Scelta lingua */
  .lp-modal-back { position: fixed; inset: 0; z-index: 100; background: rgba(10,10,10,0.6); display: flex; align-items: center; justify-content: center; padding: 20px; animation: lp-fade 0.25s ease both; }
  .lp-modal { position: relative; width: 100%; max-width: 420px; background: var(--lp-surface); color: var(--lp-ink); border: 1px solid var(--lp-line2); border-radius: 22px; padding: 34px 24px 24px; box-shadow: 0 30px 40px -24px rgba(0,0,0,0.6); animation: lp-pop 0.3s cubic-bezier(0.22,1,0.36,1) both; }
  .lp-modal-x { position: absolute; top: 10px; inset-inline-end: 10px; border: 0; width: 38px; padding: 0; color: var(--lp-ink2); }
  .lp-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lp-modal-opt { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 8px; border-radius: 12px; background: var(--lp-bg); border: 1px solid var(--lp-line2); color: var(--lp-ink); transition: border-color 0.15s ease; }
  @keyframes lp-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lp-pop { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }

  /* Entrata della prima schermata: una sola sequenza, dall'alto in basso; il baule si posa per ultimo */
  .lp-rise { opacity: 0; animation: lp-rise 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
  @keyframes lp-rise { from { opacity: 0; transform: translateY(0.35em); } to { opacity: 1; transform: none; } }
  .lp-settle { opacity: 0; animation: lp-settle 1s cubic-bezier(0.16,1,0.3,1) 0.25s forwards; }
  @keyframes lp-settle { from { opacity: 0; transform: translateY(26px) rotate(2.5deg); } to { opacity: 1; transform: none; } }

  /* Piè di pagina: due colonne anche da telefono */
  .lp-footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px 24px; align-items: start; padding: 28px 20px 40px; }
  .lp-footer-col { display: flex; flex-direction: column; gap: 12px; }
  .lp-footer p { font-size: 14px; color: var(--lp-ink2); display: flex; flex-wrap: wrap; gap: 4px 14px; }

  @media (min-width: 640px) {
    .lp-cta .lp-btn { flex: 0 0 auto; }
    .lp-pricing { grid-template-columns: repeat(3, 1fr); }
    .lp-ticks { grid-template-columns: 1fr 1fr; column-gap: 56px; }
    .lp-footer { display: flex; justify-content: space-between; align-items: center; }
    .lp-footer-col { flex-direction: row; align-items: center; gap: 24px; }
  }
  @media (min-width: 900px) {
    .lp-links { display: flex; }
    .lp-section { padding: 112px 0; }
    .lp-hero-grid { grid-template-columns: 1.15fr 0.85fr; gap: 56px; padding: 72px 0 104px; }
    .lp-strengths { grid-template-columns: repeat(4, 1fr); gap: 32px; }
    .lp-faq-grid { grid-template-columns: 0.8fr 1.2fr; gap: 64px; }
    .lp-story-grid { grid-template-columns: 1fr 1fr; gap: 72px; align-items: center; }
    .lp-story-lead { display: block; margin-bottom: 26px; }
    .lp-rail li { padding: 8px 0; }
    .lp-rail li h3 { font-size: 26px; }
  }
  /* Telefono stretto: la barra in alto (accesso e prova) deve stare su una riga in ogni lingua */
  @media (max-width: 520px) {
    .lp-brand img { display: none; }
    .lp-nav { gap: 6px; }
    .lp-btn-sm { padding: 10px 12px; font-size: 14px; }
    .lp-wrap { padding: 0 16px; }
    .lp-footer { padding-inline: 16px; }
    .lp-story-sheet .lp-sheet-lg { padding: 20px 16px 16px; }
    .lp-rail li h3 { font-size: 19px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lp-rise, .lp-settle, .lp-modal-back, .lp-modal { animation: none; opacity: 1; }
    .lp-bg-dots, .lp-bg-wash { animation: none; }
    .lp-btn, .lp-box, .lp-box path, .lp-plus, .lp-rail li, .lp-dot { transition: none; }
  }
`

// I crawler non vedono mai la finestra di scelta lingua: il contenuto della pagina resta lo stesso, cambia solo l'avviso.
const looksLikeBot = () => typeof navigator !== 'undefined' && /bot|crawl|spider|lighthouse|headless/i.test(navigator.userAgent || '')

export default function Landing({ lang = 'it' }) {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [askLang, setAskLang] = useState(false)
  const theme = useSystemTheme()
  // La lingua della pagina è quella dell'indirizzo (/, /en, /pt, /ar): chi arriva da un link in portoghese la vede in portoghese.
  useEffect(() => { if (i18n.language !== lang) i18n.changeLanguage(lang) }, [lang, i18n])
  useLandingSeo(lang, t)

  // Da "/" : chi ha già scelto una lingua viene portato alla sua versione; chi arriva per la prima volta la sceglie.
  useEffect(() => {
    if (pathname !== '/') return
    const saved = readPref(LANG_PREF_KEY)
    if (!saved) { if (!looksLikeBot()) setAskLang(true); return }
    const target = LANDING_LANGS.find(l => l.code === saved)
    if (target && target.path !== '/') navigate(target.path, { replace: true })
  }, [pathname, navigate])

  const pickLang = l => { saveLangPref(l.code); setAskLang(false); if (l.path !== pathname) navigate(l.path) }
  const closeLangPrompt = () => { saveLangPref(lang); setAskLang(false) }

  const featureTexts = t('landing.features', { returnObjects: true })
  const strengths = t('landing.strengths', { returnObjects: true })
  const plans = t('landing.plans', { returnObjects: true })
  const faq = t('landing.faq', { returnObjects: true })
  const perMonth = t('landing.perMonth')
  const delay = ms => ({ animationDelay: `${ms}ms` })

  return (
    <div className={`lp${lang === 'ar' ? ' lp-ar' : ''}`} data-theme={theme}>
      <style>{LANDING_CSS}</style>

      <header className="lp-header">
        <div className="lp-wrap lp-header-in">
          <Link to={lang === 'it' ? '/' : `/${lang}`} className="lp-brand" aria-label="Roadcase">
            <img src="/pwa-192x192.png" alt="" width={32} height={32} />
            <Wordmark size={24} />
          </Link>
          <nav className="lp-nav">
            <span className="lp-links">
              <a href="#funzioni" className="lp-navlink">{t('landing.navFeatures')}</a>
              <a href="#prezzi" className="lp-navlink">{t('landing.navPricing')}</a>
              <a href="#faq" className="lp-navlink">{t('landing.navFaq')}</a>
            </span>
            <Link to="/login" className="lp-link">{t('landing.login')}</Link>
            <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-sm">{t('landing.tryFree')}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Prima schermata */}
        <section className="lp-hero">
          <div className="lp-bg" aria-hidden="true"><div className="lp-bg-dots" /><div className="lp-bg-wash" /></div>
          <div className="lp-wrap lp-hero-grid">
            <div>
              <h1 className="lp-display lp-h1">
                <span className="lp-rise">{t('landing.heroA')}</span>
                <span className="lp-tape lp-rise" style={delay(90)}>{t('landing.heroB')}</span>
              </h1>
              <p className="lp-hero-lead lp-rise" style={delay(200)}><strong>{t('landing.eyebrow')}</strong>{t('landing.text')}</p>
              <div className="lp-cta lp-rise" style={delay(290)}>
                <Link to="/signup" className="lp-btn lp-btn-primary">{t('landing.ctaStart')} <Arrow /></Link>
                <Link to="/login" className="lp-btn lp-btn-ghost">{t('landing.ctaLogin')}</Link>
              </div>
              <p className="lp-note lp-rise" style={delay(360)}>{t('landing.heroNote')}</p>
            </div>
            <div className="lp-stage lp-settle">
              <HeroSheet />
            </div>
          </div>
        </section>

        {/* Le tre fasi: la lista si riempie scorrendo */}
        <ScrollStory />

        {/* Funzioni */}
        <section id="funzioni" className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-display lp-h2" style={{ maxWidth: 780 }}>{t('landing.featuresTitle')}</h2>
            <p className="lp-lead">{t('landing.featuresText')}</p>
            <ul className="lp-ticks">
              {featureTexts.map(f => <TickRow key={f.title} title={f.title} desc={f.desc} />)}
            </ul>
          </div>
        </section>

        {/* Punti di forza */}
        <section className="lp-band">
          <div className="lp-wrap lp-section" style={{ paddingInline: 20 }}>
            <h2 className="lp-display lp-h2" style={{ maxWidth: 720, marginBottom: 44 }}>{t('landing.strengthsTitle')}</h2>
            <div className="lp-strengths">
              {strengths.map(s => (
                <div key={s.title}>
                  <h3 className="lp-display">{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Prezzi */}
        <section id="prezzi" className="lp-section">
          <div className="lp-wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              <h2 className="lp-display lp-h2" style={{ margin: 0 }}>{t('landing.trialTitle')}</h2>
              <span className="lp-beta">{t('landing.betaBadge')}</span>
            </div>
            <p className="lp-lead" style={{ maxWidth: 640 }}>{t('landing.trialText')}</p>

            <div className="lp-pricing">
              {plans.map((plan, pi) => ({ ...plan, highlight: PRICING_META[pi].highlight, period: pi > 0 ? perMonth : null })).map(plan => (
                <div key={plan.name} className={`lp-plan${plan.highlight ? ' hl' : ''}`}>
                  {plan.badge && <span className="lp-badge">{plan.badge}</span>}
                  <div>
                    <p className="lp-display" style={{ fontSize: 22 }}>{plan.name}</p>
                    <p className="lp-plan-sub">{plan.tagline}</p>
                  </div>
                  <p style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="lp-display" style={{ fontSize: 46, lineHeight: 1 }}>{plan.price}</span>
                    {plan.period && <span className="lp-per" style={{ fontSize: 15, color: 'var(--lp-ink2)' }}>{plan.period}</span>}
                  </p>
                  <ul>
                    {plan.features.map(f => (
                      <li key={f}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/signup" className={`lp-btn ${plan.highlight ? 'lp-btn-primary' : 'lp-btn-ghost'}`} style={{ width: '100%' }}>{plan.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Domande frequenti */}
        <section id="faq" className="lp-section" style={{ paddingTop: 0 }}>
          <div className="lp-wrap lp-faq-grid">
            <h2 className="lp-display lp-h2">{t('landing.faqTitle')}</h2>
            <div>
              {(Array.isArray(faq) ? faq : []).map(f => (
                <details key={f.q}>
                  <summary>
                    <span>{f.q}</span>
                    <svg className="lp-plus" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Invito finale */}
        <section className="lp-final">
          <div className="lp-wrap">
            <h2 className="lp-display lp-h2">{t('landing.ctaFinal')}</h2>
            <div className="lp-cta" style={{ justifyContent: 'center' }}>
              <Link to="/signup" className="lp-btn lp-btn-dark">{t('landing.ctaStart')} <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--lp-line)' }}>
        {/* Due colonne anche da telefono: a sinistra il marchio e le lingue, a destra contatti e note legali */}
        <div className="lp-wrap lp-footer">
          <div className="lp-footer-col">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/pwa-192x192.png" alt="" width={24} height={24} style={{ borderRadius: 6, display: 'block' }} />
              <Wordmark size={20} />
            </div>
            <p>
              {LANDING_LANGS.map(l => <Link key={l.code} to={l.path} hrefLang={l.code} lang={l.code} onClick={() => saveLangPref(l.code)} aria-current={lang === l.code ? 'true' : undefined} style={{ fontWeight: lang === l.code ? 700 : 500, textDecoration: 'none', color: lang === l.code ? 'var(--lp-ink)' : undefined }}>{l.label}</Link>)}
            </p>
          </div>
          <div className="lp-footer-col">
            <p>{t('landing.contact')} <a href="mailto:info@roadcase.it">info@roadcase.it</a></p>
            <p>
              <Link to="/privacy">{t('landing.privacy')}</Link>
              <Link to="/terms">{t('landing.terms')}</Link>
              <Link to="/cookie-policy">{t('landing.cookies')}</Link>
            </p>
          </div>
        </div>
      </footer>

      {askLang && <LangPrompt suggested={detectDeviceLanguage()} closeLabel={t('landing.langPickClose')} onPick={pickLang} onClose={closeLangPrompt} />}
    </div>
  )
}
