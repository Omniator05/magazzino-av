import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

// Pezzi condivisi dai form di accesso e registrazione (Login.jsx, Signup.jsx):
// errori per campo con dissolvenza, lampo rosso sul campo sbagliato, password con "occhiolino" e
// indicatore di robustezza. Gli stili (.auth-input-flash-*, .auth-field-error, .auth-pw-*) stanno
// in AuthBackground.jsx insieme agli altri stili delle pagine pubbliche.

// Errori per campo: `fail({campo: messaggio})` mostra i messaggi e fa lampeggiare i campi;
// `clear(campo)` li toglie quando l'utente torna a modificare; `cls(campo)` dà la classe del campo.
export function useFieldErrors() {
  const [errors, setErrors] = useState({})
  const [flash, setFlash] = useState({})
  const toggle = useRef(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const fail = useCallback(map => {
    setErrors(map)
    // a/b alternati: la classe cambia a ogni errore, così il lampo riparte anche sullo stesso campo
    toggle.current = !toggle.current
    const f = {}
    Object.keys(map).forEach(k => { if (map[k]) f[k] = toggle.current ? 'a' : 'b' })
    setFlash(f)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash({}), 1500)
  }, [])
  const clear = useCallback(k => setErrors(e => (e[k] ? { ...e, [k]: '' } : e)), [])
  const reset = useCallback(() => setErrors({}), [])
  const cls = (k, base = 'auth-input') => (flash[k] ? `${base} auth-input-flash-${flash[k]}` : base)
  return { errors, fail, clear, reset, cls }
}

// Messaggio rosso sotto un campo, con dissolvenza.
export function FieldError({ message }) {
  if (!message) return null
  return <p className="auth-field-error" role="alert">{message}</p>
}

const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
)

// Robustezza: 0 = troppo corta (sotto il minimo di 6), poi 1..4. Solo un suggerimento: il
// requisito vero resta la lunghezza minima.
export function passwordStrength(pw) {
  if (!pw) return { level: -1, bars: 0 }
  if (pw.length < 6) return { level: 0, bars: 1 }
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length >= 12 && score >= 2) score = Math.min(4, score + 1)
  const level = score <= 1 ? 1 : score === 2 ? 2 : score === 3 ? 3 : 4
  return { level, bars: level }
}

const STRENGTH_KEY = ['pwTooShort', 'pwWeak', 'pwFair', 'pwGood', 'pwStrong']
const STRENGTH_COLOR = ['#e63946', '#e63946', '#e8a317', '#7bb33a', '#2f9e5b']

// Campo password con occhiolino per mostrare/nascondere ed eventuale indicatore di robustezza.
export function PasswordInput({ value, onChange, className = 'auth-input', placeholder = '••••••••', autoComplete, required, showStrength, id }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const s = showStrength ? passwordStrength(value) : null
  // La striscia si apre e si chiude dall'alto verso il basso; il contenuto resta quello
  // dell'ultimo valore valido mentre si richiude, così il testo non sparisce di colpo.
  const lastStrength = useRef(null)
  if (s && s.level >= 0) lastStrength.current = s
  const shownStrength = lastStrength.current
  const open = !!s && s.level >= 0
  return (
    <>
      <div className="auth-pw-wrap">
        <input id={id} className={className} type={shown ? 'text' : 'password'} value={value} onChange={onChange}
          placeholder={placeholder} required={required} autoComplete={autoComplete} style={{ paddingRight: 46 }} />
        <button type="button" className="auth-pw-eye btn-no-anim" onClick={() => setShown(v => !v)}
          aria-label={shown ? t('signup.hidePassword') : t('signup.showPassword')} aria-pressed={shown}>
          <EyeIcon off={shown} />
        </button>
      </div>
      {showStrength && shownStrength && (
        <div className={`auth-pw-reveal${open ? ' open' : ''}`} aria-hidden={!open}>
          <div className="auth-pw-meter" aria-live="polite">
            <div className="auth-pw-bars">
              {[1, 2, 3, 4].map(i => (
                <span key={i} style={{ background: i <= shownStrength.bars ? STRENGTH_COLOR[shownStrength.level] : undefined }} />
              ))}
            </div>
            <span style={{ color: STRENGTH_COLOR[shownStrength.level] }}>{t(`signup.${STRENGTH_KEY[shownStrength.level]}`)}</span>
          </div>
        </div>
      )}
    </>
  )
}
