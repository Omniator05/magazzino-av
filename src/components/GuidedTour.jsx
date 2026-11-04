import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

/**
 * Tour guidato sull'app vera, per chi ha appena creato la squadra. Prima si chiede se farlo (Welcome.jsx scrive
 * `team.tour = { status: 'ask' }`); con il sì diventa 'active' e il tour fa da guida leggera: nessuna ombra sullo
 * schermo e nessun anello, solo il pulsante da toccare che si fa rosso e "respira" piano (stili in TOUR_CSS, agganciati
 * con l'attributo data-tour-on) e una piccola card che compare con un fade. Il tour NON naviga al posto tuo e non
 * blocca nulla: capisce da solo quando hai fatto il gesto (sei arrivato nella pagina giusta, oppure l'utente / il logo /
 * l'oggetto / l'evento sono stati creati davvero) e passa al passo dopo. Quattro capitoli: utente, logo e squadra,
 * primo oggetto, primo evento. Sempre saltabile. Mentre si compila un modulo (un .modal-overlay aperto) si nasconde.
 * L'avanzamento sta sulla squadra, così vale su ogni dispositivo. Gli elementi si agganciano con data-tour.
 */
const under = base => path => path === base || path.startsWith(base + '/')
const STEPS = [
  // 1) il primo utente
  { id: 'settings', chapter: 0, target: '[data-tour="tab-settings"]', done: c => under('/admin/settings')(c.path) },
  { id: 'usersRow', chapter: 0, target: '[data-tour="settings-users"]', page: p => p === '/admin/settings', go: '/admin/settings', done: c => c.path === '/admin/settings/users' },
  { id: 'addUser', chapter: 0, target: '[data-tour="add-user"]', page: p => p === '/admin/settings/users', go: '/admin/settings/users', watch: 'profiles', min: 2 },   // oltre a sé stessi
  // 2) logo e impostazioni della squadra
  { id: 'settingsAgain', chapter: 1, target: '[data-tour="tab-settings"]', done: c => c.path === '/admin/settings' },
  { id: 'profileRow', chapter: 1, target: '[data-tour="settings-profile"]', page: p => p === '/admin/settings', go: '/admin/settings', done: c => c.path === '/admin/settings/profile' },
  { id: 'logo', chapter: 1, target: '[data-tour="logo"]', page: p => p === '/admin/settings/profile', go: '/admin/settings/profile', done: c => !!c.team?.logoUrl },
  // 3) il primo oggetto
  { id: 'inventoryTab', chapter: 2, target: '[data-tour="tab-inventory"]', done: c => under('/inventory')(c.path) },
  { id: 'addItem', chapter: 2, target: '[data-tour="add-item"]', page: p => p === '/inventory', go: '/inventory', watch: 'items', min: 1 },
  // 4) il primo evento
  { id: 'eventsTab', chapter: 3, target: '[data-tour="tab-events"]', done: c => under('/events')(c.path) },
  { id: 'addEvent', chapter: 3, target: '[data-tour="add-event"]', page: p => p === '/events', go: '/events', watch: 'events', min: 1 },
  { id: 'finish', chapter: 3, final: true },
]
const CHAPTERS = 4
const PAD = 8
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

export default function GuidedTour() {
  const { t } = useTranslation()
  const { isAdmin, team, teamId, updateTeamData, onboardingReveal } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const status = isAdmin && !onboardingReveal ? team?.tour?.status : null
  const active = status === 'active'
  const stepIdx = clamp(team?.tour?.step ?? 0, 0, STEPS.length - 1)
  const step = STEPS[stepIdx]
  const onPage = step.page ? step.page(pathname) : true

  const [rect, setRect] = useState(null)          // posizione dell'elemento evidenziato (null = non c'è)
  const [formOpen, setFormOpen] = useState(false)
  const [count, setCount] = useState(null)        // quanti documenti ci sono, per i passi "crea qualcosa"
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  const saveTour = tour => Promise.resolve(updateTeamData({ tour })).catch(() => {})
  const advance = () => saveTour({ status: 'active', step: Math.min(stepIdx + 1, STEPS.length - 1) })

  useEffect(() => {
    if (!active) return
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    onResize()   // la finestra può essere cambiata (rotazione, ridimensionamento) dall'ultima volta che si è guardato
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  // Passi "crea qualcosa": si ascolta la raccolta e si capisce da soli quando è stato creato.
  useEffect(() => {
    setCount(null)
    if (!active || !step.watch || !teamId) return
    return onSnapshot(query(collection(db, step.watch), where('teamId', '==', teamId)), snap => setCount(snap.size), () => setCount(null))
  }, [active, step.watch, teamId])

  const doneNow = active && !step.final && (step.watch ? count != null && count >= step.min : !!step.done({ path: pathname, team }))
  useEffect(() => {
    if (!doneNow) return
    // Un attimo di pausa dopo "crea": il tempo di vedere che l'app l'ha registrato.
    const id = setTimeout(advance, step.watch ? 700 : 200)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneNow, stepIdx])

  // Segue l'elemento (può comparire dopo il cambio pagina, muoversi con lo scorrimento o con il layout) e lo
  // contrassegna: è il pulsante stesso a farsi rosso e a respirare piano, non un'ombra sopra la pagina.
  useEffect(() => {
    if (!active || step.final) { setRect(null); return }
    let last = ''
    let scrolled = false
    let marked = null
    const mark = el => {
      if (marked === el) return
      marked?.removeAttribute('data-tour-on')
      marked = el
      el?.setAttribute('data-tour-on', '1')
    }
    const tick = () => {
      const open = !!document.querySelector('.modal-overlay')
      setFormOpen(prev => (prev === open ? prev : open))
      const el = onPage && !open ? document.querySelector(step.target) : null
      mark(el)
      if (el) {
        const r = el.getBoundingClientRect()
        const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`
        if (key !== last) { last = key; setRect({ left: r.left, top: r.top, width: r.width, height: r.height }) }
        // Se è fuori vista (o sotto la barra delle schede) lo porta al centro, una sola volta per passo.
        if (!scrolled && (r.top < 70 || r.bottom > window.innerHeight - 150) && !el.closest('nav')) {
          scrolled = true
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } else if (last !== 'none') {
        last = 'none'
        setRect(null)
      }
    }
    tick()
    const id = setInterval(tick, 100)   // basta a seguire lo scorrimento e leggero (niente lavoro a ogni fotogramma)
    return () => { clearInterval(id); mark(null) }
  }, [active, stepIdx, onPage, step.target, step.final])

  const primary = { background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 700, minHeight: 44 }
  const quiet = { background: 'transparent', color: 'var(--c-ink3)', fontSize: 13, fontWeight: 600, padding: '10px 6px', minHeight: 44 }

  // "Facciamo un tour?": prima di partire si chiede, senza imporre nulla.
  if (status === 'ask') {
    return (
      <div role="dialog" aria-modal="true" aria-label={t('tour.ask.title')} className="gt-fade"
        style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(20,20,18,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="gt-card" style={{ background: 'var(--c-surface)', color: 'var(--c-ink)', borderRadius: 20, padding: '24px 22px 16px', width: '100%', maxWidth: 330, textAlign: 'center', border: '1px solid var(--c-line)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.2px' }}>{t('tour.ask.title')}</h2>
          <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: 'var(--c-ink2)' }}>{t('tour.ask.text')}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-no-anim" onClick={() => saveTour({ status: 'done', skipped: true })}
              style={{ flex: 1, padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--c-fill)', color: 'var(--c-ink2)' }}>{t('tour.ask.no')}</button>
            <button type="button" className="btn-no-anim" onClick={() => saveTour({ status: 'active', step: 0 })}
              style={{ flex: 1, padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff' }}>{t('tour.ask.yes')}</button>
          </div>
        </div>
        <style>{TOUR_CSS}</style>
      </div>
    )
  }

  if (!active || formOpen) return null

  const W = Math.min(300, vp.w - 24)
  const GAP = 16
  const placement = rect
    ? {
        left: clamp(rect.left + rect.width / 2 - W / 2, 12, vp.w - W - 12),
        ...(rect.top + rect.height / 2 < vp.h * 0.5
          ? { top: rect.top + rect.height + GAP }
          : { bottom: vp.h - rect.top + GAP }),
      }
    : { left: clamp((vp.w - W) / 2, 12, vp.w), bottom: 136 }

  return (
    <>
      {/* key: a ogni passo la card si rifà e rientra con un fade */}
      <section key={step.id} role="region" aria-label={t('tour.aria')} className="gt-card" style={{
        position: 'fixed', zIndex: 120, width: W, boxSizing: 'border-box', ...placement,
        background: 'var(--c-surface)', color: 'var(--c-ink)', borderRadius: 18, padding: '14px 16px 8px',
        border: '1px solid var(--c-line)', boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.2px' }}>{t(`tour.steps.${step.id}.title`)}</h2>
        <p style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t(`tour.steps.${step.id}.text`)}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {step.final ? (
            <button type="button" onClick={() => saveTour({ status: 'done' })} className="btn-no-anim" style={{ ...primary, marginLeft: 'auto', marginBottom: 6 }}>{t('tour.finish')}</button>
          ) : (
            <>
              <button type="button" onClick={() => saveTour({ status: 'done', skipped: true })} className="btn-no-anim" style={quiet}>{t('tour.skip')}</button>
              <span role="img" aria-label={t('tour.progress', { current: step.chapter + 1, total: CHAPTERS })} style={{ display: 'flex', gap: 5 }}>
                {Array.from({ length: CHAPTERS }, (_, i) => (
                  <i key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= step.chapter ? 'var(--accent)' : 'var(--c-ink3)', opacity: i < step.chapter ? 0.45 : i === step.chapter ? 1 : 0.28, transition: 'background .3s ease, opacity .3s ease' }} />
                ))}
              </span>
              {!onPage && step.go
                ? <button type="button" onClick={() => navigate(step.go)} className="btn-no-anim" style={{ ...quiet, color: 'var(--accent)' }}>{t('tour.takeMe')}</button>
                : <button type="button" onClick={advance} className="btn-no-anim" style={quiet}>{t('tour.skipStep')}</button>}
            </>
          )}
        </div>
      </section>
      <style>{TOUR_CSS}</style>
    </>
  )
}

// Stili del tour. Il pulsante da toccare (contrassegnato da GuidedTour con data-tour-on) diventa rosso e "respira"
// piano: un alone che si allarga e svanisce, tutto dentro il pulsante e senza toccare il resto della pagina.
const TOUR_CSS = `
  .gt-card { animation: gtIn 0.35s cubic-bezier(0.25, 1, 0.5, 1) both; }
  .gt-fade { animation: gtFade 0.3s ease-out both; }
  @keyframes gtIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes gtFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes gtBreathe { 0% { box-shadow: 0 4px 16px rgba(216,56,63,0.4), 0 0 0 0 rgba(230,57,70,0.38); } 70%, 100% { box-shadow: 0 4px 16px rgba(216,56,63,0.4), 0 0 0 12px rgba(230,57,70,0); } }

  /* "+" e pulsanti rossi: già rossi, si limitano a respirare */
  [data-tour-on][data-tour^="add-"], label[data-tour-on][data-tour="logo"] { animation: gtBreathe 2.4s ease-out infinite; }
  /* Righe delle Impostazioni: un velo rosso leggero e il titolo rosso */
  button[data-tour-on][data-tour^="settings-"] { background: rgba(230,57,70,0.07) !important; transition: background .3s ease; }
  button[data-tour-on][data-tour^="settings-"] p:first-child { color: var(--accent); }
  /* Tab della barra in basso: l'icona diventa rossa con un cerchio morbido dietro */
  .ftab-btn[data-tour-on] .ftab-ico { color: var(--accent) !important; }
  .ftab-btn[data-tour-on] .ftab-ico::before { content: ''; position: absolute; inset: -10px; border-radius: 50%; background: rgba(230,57,70,0.13); z-index: -1; animation: gtSoft 2.4s ease-in-out infinite; }
  @keyframes gtSoft { 0%, 100% { transform: scale(0.85); opacity: 0.55; } 50% { transform: scale(1.08); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .gt-card, .gt-fade { animation: none; }
    [data-tour-on], .ftab-btn[data-tour-on] .ftab-ico::before { animation: none !important; }
    .ftab-btn[data-tour-on] .ftab-ico::before { transform: none; opacity: 1; }
  }
`
