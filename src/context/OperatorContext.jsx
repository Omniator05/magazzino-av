import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { useKeyboardWedgeScanner } from '../hooks/useKeyboardWedgeScanner'
import { badgeLogin, isBadgeCode, isPin } from '../utils/operatorBadge'

// "Operatore" della Postazione magazzino (account con isStation, vedi SettingsUsers.jsx):
// il PC fisso resta sempre collegato all'account della postazione, ma chi sta lavorando si
// "annuncia" passando il lettore USB sul proprio badge QR (Profilo, sul telefono). Da quel
// momento carico, rientro, rotto… portano il suo nome. Dopo IDLE_MS senza tastiera, mouse o
// scansioni l'operatore esce da solo. È solo attribuzione ("chi ha fatto cosa"), non un
// accesso: il PC non ha mai più permessi di quelli di un magazziniere.
//
// Fuori dalla postazione il contesto è "vuoto" (nessun operatore, isStation falso), quindi
// le pagine possono chiamare useOperator() ovunque senza controllare nulla.
const IDLE_MS = 20 * 60 * 1000

const EMPTY = { isStation: false, operator: null, login: async () => {}, logout: () => {}, loginError: '', getRemainingMs: () => 0, requireOperator: () => true }
const OperatorCtx = createContext(EMPTY)
export const useOperator = () => useContext(OperatorCtx)

export function OperatorProvider({ children }) {
  const { profile } = useAuth()
  const isStation = !!profile?.isStation
  const [operator, setOperator] = useState(null)       // { userId, name } | null
  const [loginError, setLoginError] = useState('')      // '' | 'invalid' | 'inactive'
  const [promptOpen, setPromptOpen] = useState(false)  // popup "scansiona il badge"
  const expiresRef = useRef(0)
  const operatorRef = useRef(null)
  operatorRef.current = operator

  const logout = useCallback(() => { setOperator(null); expiresRef.current = 0 }, [])
  const login = useCallback(async code => {
    try {
      const r = await badgeLogin(code)
      setOperator({ userId: r.userId, name: r.name })
      setPromptOpen(false)
      expiresRef.current = Date.now() + IDLE_MS
      setLoginError('')
    } catch (e) {
      setLoginError(e.code === 'inactive' ? 'inactive' : e.code === 'locked' ? 'locked' : 'invalid')
      setTimeout(() => setLoginError(''), 4000)
    }
  }, [])

  // I badge (e solo quelli) arrivano da qui, da qualunque pagina della postazione.
  useKeyboardWedgeScanner(login, { enabled: isStation, badges: true })

  // Codice personale a 4 cifre: senza operatore, chi digita 4 numeri (fuori dai campi di testo) entra
  // subito, senza premere altro. Le cifre "sparate" dal lettore di codici a barre (troppo veloci) non contano.
  useEffect(() => {
    if (!isStation || operator) return
    let digits = ''
    let last = 0
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
      if (!/^\d$/.test(e.key)) { digits = ''; return }
      const now = Date.now()
      const gap = now - last
      last = now
      if (gap < 35 || gap > 4000) digits = ''     // lettore (troppo veloce) o pausa lunga: si riparte
      if (gap < 35) return
      digits += e.key
      if (digits.length === 4) { const pin = digits; digits = ''; login(pin) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isStation, operator, login])

  useEffect(() => {
    if (!isStation) return
    // Ogni attività sposta in avanti la scadenza; un controllo al secondo fa uscire l'operatore.
    const bump = () => { if (operatorRef.current) expiresRef.current = Date.now() + IDLE_MS }
    const events = ['keydown', 'pointerdown', 'wheel', 'touchstart']
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }))
    const iv = setInterval(() => { if (operatorRef.current && Date.now() >= expiresRef.current) logout() }, 1000)
    return () => { events.forEach(ev => window.removeEventListener(ev, bump)); clearInterval(iv) }
  }, [isStation, logout])
  useEffect(() => { if (!isStation) logout() }, [isStation, logout])

  // Da chiamare prima di un'azione che deve avere un nome (segnare rotto, pronto, caricato…):
  // fuori dalla postazione o con un operatore attivo dà true; altrimenti apre il popup che
  // chiede di passare il badge e dà false. Guardare e cercare restano liberi.
  const requireOperator = useCallback(() => {
    if (!isStation || operatorRef.current) return true
    setPromptOpen(true)
    return false
  }, [isStation])

  const value = useMemo(() => ({
    isStation, operator, login, logout, loginError, requireOperator,
    getRemainingMs: () => Math.max(0, expiresRef.current - Date.now()),
  }), [isStation, operator, login, logout, loginError, requireOperator])

  return (
    <OperatorCtx.Provider value={value}>
      {children}
      {isStation && <OperatorBar />}
      {isStation && promptOpen && !operator && <BadgePrompt onClose={() => setPromptOpen(false)} />}
    </OperatorCtx.Provider>
  )
}

// Pillola fissa in basso a sinistra su tutte le pagine della postazione: chi sta lavorando
// (con il tempo che resta) oppure l'invito a scansionare il badge.
function OperatorBar() {
  const { t } = useTranslation()
  const { operator, logout, loginError, getRemainingMs } = useOperator()
  const [, tick] = useState(0)
  const [open, setOpen] = useState(false)
  // Animazioni: all'ingresso la pillola dell'operatore parte grande al centro dello schermo e
  // si sistema nell'angolo ('center' → 'fly' → 'idle'); all'uscita la pillola sfuma mentre
  // ricompare quella "scansiona il tuo badge" (`leaving`). `display` tiene l'operatore a
  // schermo anche mentre sta uscendo.
  const [display, setDisplay] = useState(operator)
  const [phase, setPhase] = useState('idle')
  const [leaving, setLeaving] = useState(false)
  const [offset, setOffset] = useState(null)
  const pillRef = useRef(null)
  const prevOp = useRef(operator)
  const lastTime = useRef('0:00')

  useEffect(() => {
    const was = prevOp.current
    prevOp.current = operator
    const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timers = []
    if (operator && !was) {
      setDisplay(operator); setLeaving(false); setOpen(false)
      if (!calm) {
        setOffset(null); setPhase('center')
        timers.push(setTimeout(() => setPhase('fly'), 1100), setTimeout(() => setPhase('idle'), 1800))
      }
    } else if (!operator && was) {
      if (calm) { setDisplay(null) } else {
        setLeaving(true); setPhase('idle')
        timers.push(setTimeout(() => { setDisplay(null); setLeaving(false) }, 500))
      }
    } else if (operator) setDisplay(operator)
    return () => timers.forEach(clearTimeout)
  }, [operator])

  // Misura dov'è la pillola e di quanto va spostata per stare al centro dello schermo.
  useLayoutEffect(() => {
    if (phase !== 'center' || !pillRef.current) return
    const r = pillRef.current.getBoundingClientRect()
    setOffset({ x: window.innerWidth / 2 - (r.left + r.width / 2), y: window.innerHeight / 2 - (r.top + r.height / 2) })
  }, [phase, display])

  useEffect(() => {
    if (!operator) return
    const iv = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(iv)
  }, [operator])

  if (operator) {
    const ms = getRemainingMs()
    lastTime.current = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  }
  const ms = operator ? getRemainingMs() : 0
  // Nell'ultimo minuto la pillola diventa rossa: sta per uscire.
  const warn = !!operator && ms < 60000
  const shownOp = display || operator

  const base = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px', borderRadius: 999, background: 'var(--c-surface)', border: '1px solid var(--c-line)', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', maxWidth: 'calc(100vw - 32px)' }
  const centered = phase === 'center'
  const opStyle = {
    ...base,
    ...(leaving ? { position: 'absolute', right: 0, top: 0, opacity: 0, transform: 'scale(0.9)', transformOrigin: 'right center', transition: 'opacity .4s ease, transform .4s ease', pointerEvents: 'none' } : {}),
    ...(!leaving && phase !== 'idle' ? {
      transformOrigin: 'center center',
      transform: centered ? (offset ? `translate(${offset.x}px, ${offset.y}px) scale(2.4)` : 'none') : 'none',
      opacity: centered && !offset ? 0 : 1,
      transition: centered ? 'none' : 'transform .7s cubic-bezier(.22,1,.36,1)',
    } : {}),
    ...(warn ? { border: '1px solid #e63946', animation: 'opWarnPulse 1.4s ease-in-out infinite' } : {}),
  }
  const showNone = !shownOp || leaving

  return (
    <div style={{ position: 'fixed', right: 16, top: 12, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {centered && offset && <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'rgba(28,28,26,0.22)', pointerEvents: 'none', animation: 'opScrimIn .3s ease-out' }} />}
      <div style={{ position: 'relative' }}>
        {showNone && (
          <button type="button" className="btn-no-anim" aria-expanded={open} onClick={() => setOpen(o => !o)}
            style={{ ...base, padding: '10px 16px', border: `1px dashed ${loginError ? '#e63946' : '#d97706'}`, background: 'rgba(255,247,230,0.97)', ...(leaving ? { animation: 'opNoneIn .45s ease-out' } : {}) }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: loginError ? '#e63946' : '#92400e' }}>
              {loginError ? t(`operator.${loginError}`) : t('operator.barNone')}
            </span>
          </button>
        )}
        {shownOp && (
          <div ref={pillRef} style={opStyle}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: warn ? '#e63946' : 'var(--c-green, #22c55e)', color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .4s' }}>
              {(shownOp.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--c-ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownOp.name}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: warn ? '#e63946' : 'var(--c-ink3)', fontVariantNumeric: 'tabular-nums' }}>{t('operator.expires', { time: lastTime.current })}</p>
            </div>
            <button type="button" className="btn-no-anim" onClick={logout}
              style={{ marginLeft: 4, padding: '6px 12px', borderRadius: 999, background: 'var(--c-fill)', color: 'var(--c-ink)', fontSize: 12.5, fontWeight: 800 }}>{t('operator.logout')}</button>
          </div>
        )}
      </div>
      {!shownOp && open && (
        <div style={{ width: 340, maxWidth: 'calc(100vw - 32px)', padding: 14, borderRadius: 16, background: 'var(--c-surface)', border: '1px solid var(--c-line)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--c-ink2)' }}>{t('operator.promptText')}</p>
          <BadgeEntry autoFocus />
        </div>
      )}
      <style>{`
        @keyframes opScrimIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes opNoneIn { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: none } }
        @keyframes opWarnPulse { 0%, 100% { box-shadow: 0 6px 20px rgba(0,0,0,0.14) } 50% { box-shadow: 0 0 0 4px rgba(230,57,70,0.22), 0 6px 20px rgba(0,0,0,0.14) } }
      `}</style>
    </div>
  )
}

// Popup "scansiona prima il tuo badge": compare quando si prova a segnare qualcosa senza
// operatore (vedi requireOperator) e si chiude da solo appena il badge viene riconosciuto.
function BadgePrompt({ onClose }) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={t('operator.lockTitle')} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 960, background: 'rgba(17,17,32,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: 'var(--c-surface)', borderRadius: 20, padding: '26px 24px 22px', textAlign: 'center', boxShadow: '0 16px 50px rgba(0,0,0,0.3)' }}>
        <div aria-hidden="true" style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 16, background: 'rgba(217,119,6,0.14)', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.8-2 2.3-3 4-3s3.2 1 4 3"/></svg>
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 800, color: 'var(--c-ink)' }}>{t('operator.needBadge')}</h2>
        <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--c-ink2)' }}>{t('operator.promptText')}</p>
        <BadgeEntry autoFocus />
        <button type="button" className="btn btn-secondary btn-full" onClick={onClose} style={{ minHeight: 44, marginTop: 12 }}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}

// Campo per scrivere a mano il codice del proprio badge (se il lettore non riesce a leggerlo
// o il telefono è scarico: il codice in lettere si legge dal Profilo). Usato dal pannello
// che si apre dalla pillola in alto a destra.
export function BadgeEntry({ autoFocus }) {
  const { t } = useTranslation()
  const { login, loginError } = useOperator()
  const [code, setCode] = useState('')
  const valid = isBadgeCode(code) || isPin(code)
  const submit = async e => { e.preventDefault(); if (!valid) return; await login(code); setCode('') }
  // Il codice a 4 cifre entra da solo appena è completo, senza premere altro.
  const change = async v => {
    setCode(v)
    if (isPin(v)) { await login(v.trim()); setCode('') }
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={code} onChange={e => change(e.target.value)} autoFocus={autoFocus} autoComplete="off" spellCheck={false} inputMode="text"
          placeholder={t('operator.codePlaceholder')} aria-label={t('operator.codePlaceholder')}
          style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 14, textTransform: 'uppercase', letterSpacing: isPin(code) ? '0.3em' : 0 }} />
        <button type="submit" className="btn btn-secondary" disabled={!valid} style={{ flexShrink: 0 }}>{t('operator.codeGo')}</button>
      </div>
      {loginError && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e63946' }}>{t(`operator.${loginError}`)}</p>}
    </form>
  )
}
