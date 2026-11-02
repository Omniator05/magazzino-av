import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

/**
 * Tour guidato sull'app vera, per chi ha appena creato la squadra (lo avvia Welcome.jsx scrivendo
 * `team.tour = { status: 'active', step: 0 }`): un'ombra scura con un'apertura sul bottone da usare e una card
 * che spiega il passo. Non blocca nulla (si può toccare tutto, anche il bottone evidenziato) ed è sempre
 * saltabile. Mentre si compila un modulo (un .modal-overlay aperto) il tour si nasconde e torna alla chiusura.
 * L'avanzamento sta sulla squadra, così vale su ogni dispositivo. I bottoni si agganciano con data-tour.
 */
const STEPS = [
  { id: 'users', path: '/admin/settings/users', target: '[data-tour="add-user"]' },
  { id: 'logo',  path: '/admin/settings/profile', target: '[data-tour="logo"]' },
  { id: 'item',  path: '/inventory', target: '[data-tour="add-item"]' },
  { id: 'event', path: '/events', target: '[data-tour="add-event"]' },
]
const PAD = 8
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

export default function GuidedTour() {
  const { t } = useTranslation()
  const { isAdmin, team, updateTeamData, onboardingReveal } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = isAdmin && team?.tour?.status === 'active' && !onboardingReveal
  const stepIdx = clamp(team?.tour?.step ?? 0, 0, STEPS.length - 1)
  const step = STEPS[stepIdx]
  const onPage = pathname === step.path

  const [rect, setRect] = useState(null)          // posizione del bottone evidenziato (null = non c'è)
  const [formOpen, setFormOpen] = useState(false)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const scrolledFor = useRef(-1)

  // All'inizio di un passo (una volta per sessione) si va alla sua pagina; se poi ci si sposta, si resta dove si è
  // e la card offre "Portami lì" invece di riportare indietro a forza.
  useEffect(() => {
    if (!active) return
    const key = `rcTourNav_${team.id}_${stepIdx}`
    let seen = false
    try { seen = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1') } catch { /* senza storage si naviga */ }
    if (!seen && pathname !== step.path) navigate(step.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx])

  useEffect(() => {
    if (!active) return
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  // Segue il bottone (può comparire dopo il cambio pagina, muoversi con lo scorrimento o con il layout).
  useEffect(() => {
    if (!active) return
    let last = ''
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
        if (scrolledFor.current !== stepIdx && (r.top < 70 || r.bottom > window.innerHeight - 150)) {
          scrolledFor.current = stepIdx
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
  }, [active, stepIdx, onPage, step.target])

  if (!active || formOpen) return null

  const saveTour = tour => Promise.resolve(updateTeamData({ tour })).catch(() => {})
  const next = () => {
    if (stepIdx >= STEPS.length - 1) { saveTour({ status: 'done' }); navigate('/'); return }
    const n = stepIdx + 1
    saveTour({ status: 'active', step: n })
    navigate(STEPS[n].path)
  }
  const skip = () => saveTour({ status: 'done', skipped: true })

  const W = Math.min(340, vp.w - 24)
  const placement = rect
    ? {
        left: clamp(rect.left + rect.width / 2 - W / 2, 12, vp.w - W - 12),
        ...(rect.top + rect.height / 2 < vp.h * 0.5
          ? { top: rect.top + rect.height + PAD + 14 }
          : { bottom: vp.h - rect.top + PAD + 14 }),
      }
    : { left: clamp((vp.w - W) / 2, 12, vp.w), bottom: 124 }
  const last = stepIdx === STEPS.length - 1
  const primary = { background: 'var(--accent)', color: '#fff', borderRadius: 13, padding: '11px 22px', fontSize: 14.5, fontWeight: 800, minHeight: 44 }

  return (
    <>
      {rect && (
        <div aria-hidden="true" className="gt-ring" style={{
          position: 'fixed', left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: rect.round ? '50%' : rect.radius + PAD, pointerEvents: 'none', zIndex: 60,
          boxShadow: '0 0 0 9999px rgba(8,10,16,0.6), 0 0 0 3px #e63946',
          transition: 'left .15s ease, top .15s ease, width .15s ease, height .15s ease, border-radius .15s ease',
        }} />
      )}
      <section role="region" aria-label={t('tour.aria')} className="gt-card" style={{
        position: 'fixed', zIndex: 120, width: W, boxSizing: 'border-box', ...placement,
        background: 'var(--c-surface)', color: 'var(--c-ink)', borderRadius: 20, padding: '18px 18px 14px',
        boxShadow: '0 18px 50px rgba(0,0,0,0.35)', border: '1px solid var(--c-line)',
      }}>
        <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#e63946' }}>
          {t('tour.progress', { current: stepIdx + 1, total: STEPS.length })}
        </p>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{t(`tour.${step.id}.title`)}</h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t(`tour.${step.id}.text`)}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button type="button" onClick={skip} className="btn-no-anim"
            style={{ background: 'transparent', color: 'var(--c-ink3)', fontSize: 13.5, fontWeight: 700, padding: '10px 6px', minHeight: 44 }}>
            {t('tour.skip')}
          </button>
          {onPage ? (
            <button type="button" onClick={next} className="btn-no-anim" style={primary}>{last ? t('tour.finish') : t('tour.next')}</button>
          ) : (
            <button type="button" onClick={() => navigate(step.path)} className="btn-no-anim" style={primary}>{t('tour.takeMe')}</button>
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
