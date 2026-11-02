import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

/**
 * Tour guidato sull'app vera, per chi ha appena creato la squadra. Prima si chiede se farlo (Welcome.jsx scrive
 * `team.tour = { status: 'ask' }`); con il sì diventa 'active' e un cerchio rosso con una leggera ombra indica
 * dove toccare, passo dopo passo, come farebbe una persona accanto a te: l'ingranaggio delle Impostazioni, la riga
 * Utenti, il "+"... Il tour NON naviga al posto tuo e non blocca nulla: capisce da solo quando hai fatto il gesto
 * (sei arrivato nella pagina giusta, oppure l'utente / il logo / l'oggetto / l'evento sono stati creati davvero) e
 * passa al passo dopo. Quattro capitoli: utente, logo e squadra, primo oggetto, primo evento. Sempre saltabile.
 * Mentre si compila un modulo (un .modal-overlay aperto) si nasconde. L'avanzamento sta sulla squadra, così vale su
 * ogni dispositivo. Gli elementi si agganciano con data-tour.
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

  // Segue l'elemento (può comparire dopo il cambio pagina, muoversi con lo scorrimento o con il layout).
  useEffect(() => {
    if (!active || step.final) { setRect(null); return }
    let last = ''
    let scrolled = false
    const tick = () => {
      const open = !!document.querySelector('.modal-overlay')
      setFormOpen(prev => (prev === open ? prev : open))
      const el = onPage ? document.querySelector(step.target) : null
      if (el) {
        const r = el.getBoundingClientRect()
        const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`
        if (key !== last) {
          last = key
          const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height, radius: br, round: br >= Math.min(r.width, r.height) / 2 - 1 })
        }
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
    return () => clearInterval(id)
  }, [active, stepIdx, onPage, step.target, step.final])

  const primary = { background: 'var(--accent)', color: '#fff', borderRadius: 13, padding: '11px 22px', fontSize: 14.5, fontWeight: 800, minHeight: 44 }
  const quiet = { background: 'transparent', color: 'var(--c-ink3)', fontSize: 13.5, fontWeight: 700, padding: '10px 6px', minHeight: 44 }

  // "Facciamo un tour?": prima di partire si chiede, senza imporre nulla.
  if (status === 'ask') {
    return (
      <div role="dialog" aria-modal="true" aria-label={t('tour.ask.title')}
        style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(10,12,18,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="gt-card" style={{ background: 'var(--c-surface)', color: 'var(--c-ink)', borderRadius: 24, padding: '26px 22px 18px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.35)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' }}>{t('tour.ask.title')}</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'var(--c-ink2)' }}>{t('tour.ask.text')}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-no-anim" onClick={() => saveTour({ status: 'done', skipped: true })}
              style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 700, background: 'var(--c-fill)', color: 'var(--c-ink2)' }}>{t('tour.ask.no')}</button>
            <button type="button" className="btn-no-anim" onClick={() => saveTour({ status: 'active', step: 0 })}
              style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 800, background: 'var(--accent)', color: '#fff' }}>{t('tour.ask.yes')}</button>
          </div>
        </div>
        <style>{`.gt-card { animation: gtIn 0.28s cubic-bezier(0.22,1,0.36,1) both; } @keyframes gtIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { .gt-card { animation: none; } }`}</style>
      </div>
    )
  }

  if (!active || formOpen) return null

  const W = Math.min(330, vp.w - 24)
  const placement = rect
    ? {
        left: clamp(rect.left + rect.width / 2 - W / 2, 12, vp.w - W - 12),
        ...(rect.top + rect.height / 2 < vp.h * 0.5
          ? { top: rect.top + rect.height + PAD + 14 }
          : { bottom: vp.h - rect.top + PAD + 14 }),
      }
    : { left: clamp((vp.w - W) / 2, 12, vp.w), bottom: 124 }

  return (
    <>
      {rect && (
        <div aria-hidden="true" className="gt-ring" style={{
          position: 'fixed', left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: rect.round ? '50%' : rect.radius + PAD, pointerEvents: 'none', zIndex: 110,
          boxShadow: '0 0 0 9999px rgba(8,10,16,0.42), 0 0 0 3px #e63946',
          transition: 'left .15s ease, top .15s ease, width .15s ease, height .15s ease, border-radius .15s ease',
        }} />
      )}
      <section role="region" aria-label={t('tour.aria')} className="gt-card" style={{
        position: 'fixed', zIndex: 120, width: W, boxSizing: 'border-box', ...placement,
        background: 'var(--c-surface)', color: 'var(--c-ink)', borderRadius: 20, padding: '16px 18px 10px',
        boxShadow: '0 18px 50px rgba(0,0,0,0.3)', border: '1px solid var(--c-line)',
      }}>
        <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#e63946' }}>
          {t('tour.progress', { current: step.chapter + 1, total: CHAPTERS })}
        </p>
        <h2 style={{ margin: '0 0 5px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px' }}>{t(`tour.steps.${step.id}.title`)}</h2>
        <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t(`tour.steps.${step.id}.text`)}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {step.final ? (
            <button type="button" onClick={() => saveTour({ status: 'done' })} className="btn-no-anim" style={{ ...primary, marginLeft: 'auto', marginBottom: 6 }}>{t('tour.finish')}</button>
          ) : (
            <>
              <button type="button" onClick={() => saveTour({ status: 'done', skipped: true })} className="btn-no-anim" style={quiet}>{t('tour.skip')}</button>
              {!onPage && step.go
                ? <button type="button" onClick={() => navigate(step.go)} className="btn-no-anim" style={{ ...quiet, color: 'var(--accent)' }}>{t('tour.takeMe')}</button>
                : <button type="button" onClick={advance} className="btn-no-anim" style={quiet}>{t('tour.skipStep')}</button>}
            </>
          )}
        </div>
      </section>
      <style>{`
        .gt-card { animation: gtIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes gtIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .gt-ring { animation: gtPulse 1.8s ease-in-out infinite; }
        @keyframes gtPulse { 0%, 100% { filter: none; } 50% { filter: drop-shadow(0 0 10px rgba(230,57,70,0.8)); } }
        @media (prefers-reduced-motion: reduce) { .gt-card, .gt-ring { animation: none; } }
      `}</style>
    </>
  )
}
