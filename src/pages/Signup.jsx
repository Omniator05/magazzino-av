import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { db } from '../firebase'
import { deleteUser } from 'firebase/auth'
import { useFieldErrors, FieldError, PasswordInput } from '../components/AuthFields'
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { createSignupUser } from '../utils/authCleanup'

// Solo il flusso di registrazione: il guscio (sfondo + card divisa) è in
// Auth.jsx, che tiene login e signup montati nella stessa card così il
// pannello rosso può scivolare da un lato all'altro quando si cambia modalità.
export default function SignupFlow({ onSwitch }) {
  const { t } = useTranslation()
  const [step, setStep] = useState('choice') // 'choice' | 'create' | 'join'
  const navigate = useNavigate()

  return (
    <>
      {step === 'choice' && <ChoiceStep onChoose={setStep} />}
      {step === 'create'  && <CreateTeamStep onBack={() => setStep('choice')} />}
      {step === 'join'    && <JoinTeamStep onBack={() => setStep('choice')} onDone={() => navigate('/')} />}

      <p style={{ textAlign:'center', color:'rgba(var(--au-fg), calc(var(--au-k) * 0.2))', fontSize:12, marginTop:20, letterSpacing:'0.2px' }}>
        {t('signup.alreadyHaveAccount')}{' '}
        <button type="button" onClick={onSwitch}
          style={{ background:'none', border:'none', padding:0, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.5))', fontWeight:600, fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
          {t('signup.signIn')}
        </button>
      </p>
    </>
  )
}

function ChoiceStep({ onChoose }) {
  const { t } = useTranslation()
  return (
    <div className="auth-card">
      <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:6, letterSpacing:'-0.3px' }}>
        {t('signup.createAccountTitle')}
      </h2>
      <p style={{ fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))', marginBottom:26 }}>
        {t('signup.howToStart')}
      </p>

      <button
        className="auth-btn auth-btn-nudge"
        style={{ marginBottom:12, textAlign:'left' }}
        onClick={() => onChoose('create')}
      >
        <div style={{ fontSize:15, fontWeight:700 }}>{t('signup.createTeamOption')}</div>
        <div style={{ fontSize:12, fontWeight:500, opacity:0.85, marginTop:2 }}>{t('signup.createTeamOptionDesc')}</div>
      </button>

      <button
        className="auth-btn-secondary"
        style={{ textAlign:'left' }}
        onClick={() => onChoose('join')}
      >
        <div style={{ fontSize:15, fontWeight:700, color:'rgb(var(--au-fg))' }}>{t('signup.joinTeamOption')}</div>
        <div style={{ fontSize:12, fontWeight:500, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.45))', marginTop:2 }}>{t('signup.joinTeamOptionDesc')}</div>
      </button>
    </div>
  )
}

function useSignupForm() {
  const { t } = useTranslation()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Errori per campo (messaggio rosso sotto il campo + lampo rosso del campo).
  const fe = useFieldErrors()
  // Ritorna {campo: messaggio} per ogni campo mancante o sbagliato (vuoto = tutto ok).
  const validateCommon = () => {
    const e = {}
    if (!name.trim()) e.name = t('signup.errorNameRequired')
    if (!email.trim()) e.email = t('signup.errorEmailRequired')
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = t('signup.errorInvalidEmail')
    if (password.length < 6) e.password = t('signup.errorPasswordLength')
    if (!consent) e.consent = t('signup.errorConsentRequired')
    return e
  }
  // Un campo che si torna a modificare perde il suo errore.
  const edit = (field, setter) => v => { setter(v); fe.clear(field) }

  return {
    name, setName: edit('name', setName), email, setEmail: edit('email', setEmail), password, setPassword: edit('password', setPassword),
    consent, setConsent: edit('consent', setConsent), error, setError, loading, setLoading, validateCommon, fe,
  }
}

// Spunta obbligatoria di accettazione Termini/Privacy, identica nei due
// passi di registrazione (crea squadra / unisciti) — i link aprono in una
// nuova scheda apposta: perdere lo stato del form per andare a leggerli
// sarebbe un difetto, non solo un fastidio.
function ConsentCheckbox({ checked, onChange, error, flashClass }) {
  const { t } = useTranslation()
  return (
    <div style={{ marginBottom:20 }}>
      <label className="auth-check-row">
        <input className="auth-check-input" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className={`auth-check-box${flashClass ? ` ${flashClass}` : ''}`} aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
        </span>
        <span style={{ fontSize:12.5, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.45))', lineHeight:1.5 }}>
          {t('signup.consentPrefix')}{' '}
          <a href="/terms" target="_blank" rel="noreferrer" style={{ color:'rgba(var(--au-fg), calc(var(--au-k) * 0.75))', fontWeight:600 }}>{t('signup.consentTerms')}</a>
          {' '}{t('signup.consentAnd')}{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" style={{ color:'rgba(var(--au-fg), calc(var(--au-k) * 0.75))', fontWeight:600 }}>{t('signup.consentPrivacy')}</a>.
        </span>
      </label>
      <FieldError message={error} />
    </div>
  )
}

// Chiamata pubblica alle azioni di registrazione (vedi api/_signup.js): chi si registra non ha ancora un account.
async function signupApi(type, body) {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...data }
}

// "Controlla la tua email": dopo "Crea squadra" la squadra NON esiste ancora, nasce quando si clicca il link
// nell'email (che fa anche entrare). Qui si può rimandare il link o tornare indietro a correggere l'indirizzo.
function CheckEmailPanel({ email, onBack }) {
  const { t } = useTranslation()
  const [cooldown, setCooldown] = useState(60)
  const [state, setState] = useState('')   // '' | 'sending' | 'sent' | 'error'
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])
  const resend = async () => {
    setState('sending')
    try {
      const r = await signupApi('signupResend', { email })
      setState(r.ok ? 'sent' : 'error')
      if (r.ok) setCooldown(60)
    } catch { setState('error') }
  }
  const muted = 'rgba(var(--au-fg), calc(var(--au-k) * 0.45))'
  return (
    <div className="auth-card" role="status" aria-live="polite">
      <div aria-hidden="true" style={{ width:54, height:54, borderRadius:'50%', margin:'0 0 18px', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(230,57,70,0.14)', color:'#e63946' }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>
      </div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:8, letterSpacing:'-0.3px' }}>{t('signup.checkEmailTitle')}</h2>
      <p style={{ fontSize:14, lineHeight:1.55, color:muted, marginBottom:6 }}>{t('signup.checkEmailText')}</p>
      <p style={{ fontSize:15, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:14, overflowWrap:'anywhere' }}>{email}</p>
      <p style={{ fontSize:12.5, lineHeight:1.5, color:muted, marginBottom:22 }}>{t('signup.checkEmailHint')}</p>
      <button type="button" className="auth-btn" disabled={cooldown > 0 || state === 'sending'} onClick={resend} style={{ marginBottom:10 }}>
        {state === 'sending' ? t('signup.resending') : cooldown > 0 ? t('signup.resendIn', { seconds: cooldown }) : t('signup.resend')}
      </button>
      {state === 'sent' && <p role="status" style={{ fontSize:12.5, fontWeight:600, color:'#22c55e', margin:'0 0 10px' }}>{t('signup.resent')}</p>}
      {state === 'error' && <p role="alert" style={{ fontSize:12.5, fontWeight:600, color:'#e63946', margin:'0 0 10px' }}>{t('signup.errorSignupFailed')}</p>}
      <button type="button" className="auth-btn-secondary" onClick={onBack}>{t('signup.wrongEmail')}</button>
    </div>
  )
}

function CreateTeamStep({ onBack }) {
  const { t } = useTranslation()
  const f = useSignupForm()
  const [companyName, setCompanyName] = useState('')
  const [sentTo, setSentTo] = useState('')   // email a cui è partito il link: mostra "controlla la tua email"
  // Messaggi per i campi segnalati dal server (api/_signup.js).
  const FIELD_MSG = {
    company: t('signup.errorCompanyNameRequired'), name: t('signup.errorNameRequired'), email: t('signup.errorInvalidEmail'),
    password: t('signup.errorPasswordLength'), consent: t('signup.errorConsentRequired'),
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = f.validateCommon()
    if (!companyName.trim()) errs.company = t('signup.errorCompanyNameRequired')
    if (Object.keys(errs).length) { f.setError(''); f.fe.fail(errs); return }

    f.setError(''); f.setLoading(true)
    try {
      // Il server crea l'account e manda l'email di conferma; la squadra nasce solo quando si clicca il link.
      const r = await signupApi('signupStart', {
        companyName: companyName.trim(), name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password, consent: f.consent,
      })
      if (r.ok) { setSentTo(f.email.trim().toLowerCase()); return }
      if (r.error === 'company-exists') f.fe.fail({ company: t('signup.errorCompanyExists') })
      else if (r.error === 'email-in-use') f.fe.fail({ email: t('signup.errorEmailInUse') })
      else if (r.error === 'invalid' && FIELD_MSG[r.field]) f.fe.fail({ [r.field]: FIELD_MSG[r.field] })
      else if (r.error === 'rate-limit') f.setError(t('signup.errorRateLimit'))
      else if (r.error === 'email-failed') f.setError(t('signup.errorEmailNotSent'))
      else f.setError(t('signup.errorSignupFailed'))
    } catch {
      f.setError(t('signup.errorSignupFailed'))
    } finally {
      f.setLoading(false)
    }
  }

  if (sentTo) return <CheckEmailPanel email={sentTo} onBack={() => setSentTo('')} />

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="auth-card">
        <BackButton onClick={onBack} />
        <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:6, letterSpacing:'-0.3px' }}>
          {t('signup.newTeamTitle')}
        </h2>
        <p style={{ fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))', marginBottom:22 }}>
          {t('signup.newTeamDesc')}
        </p>

        <ErrorBox error={f.error} />

        <Field label={t('signup.companyNameLabel')} error={f.fe.errors.company}>
          <input className={f.fe.cls('company')} type="text" value={companyName} onChange={e => { setCompanyName(e.target.value); f.fe.clear('company') }} placeholder={t('signup.companyNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.yourNameLabel')} error={f.fe.errors.name}>
          <input className={f.fe.cls('name')} type="text" value={f.name} onChange={e => f.setName(e.target.value)} placeholder={t('signup.yourNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.emailLabel')} error={f.fe.errors.email}>
          <input className={f.fe.cls('email')} type="email" value={f.email} onChange={e => f.setEmail(e.target.value)} placeholder={t('signup.emailPlaceholder')} required autoComplete="email" />
        </Field>
        <Field label={t('signup.passwordLabel')} marginBottom={20} error={f.fe.errors.password}>
          <PasswordInput className={f.fe.cls('password')} value={f.password} onChange={e => f.setPassword(e.target.value)} required autoComplete="new-password" showStrength />
        </Field>

        <ConsentCheckbox checked={f.consent} onChange={f.setConsent} error={f.fe.errors.consent} flashClass={f.fe.cls('consent', '').trim()} />

        <button className="auth-btn" type="submit" disabled={f.loading}>
          {f.loading ? t('signup.creatingTeam') : t('signup.createTeam')}
        </button>
      </div>
    </form>
  )
}

function JoinTeamStep({ onBack, onDone }) {
  const { t } = useTranslation()
  const { setSignupInProgress } = useAuth()
  const ERROR_MSGS = {
    'auth/email-already-in-use': t('signup.errorEmailInUse'),
    'auth/weak-password':        t('signup.errorWeakPassword'),
    'auth/invalid-email':        t('signup.errorInvalidEmail'),
  }
  const f = useSignupForm()
  const FIELD_OF = { 'auth/email-already-in-use': 'email', 'auth/invalid-email': 'email', 'auth/weak-password': 'password' }
  const showAuthError = err => {
    const field = FIELD_OF[err.code]
    if (field) { f.setError(''); f.fe.fail({ [field]: ERROR_MSGS[err.code] }) } else f.setError(t('signup.errorSignupFailed'))
  }
  const [search, setSearch]     = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    // Confronto senza spazi: così "theservice" trova anche "The Service Group"
    const term = search.trim().toLowerCase().replace(/\s+/g, '')
    if (!term) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const snap = await getDocs(collection(db, 'teams'))
        const matches = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(team => (team.nameLower || '').replace(/\s+/g, '').includes(term))
        setResults(matches)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = f.validateCommon()
    if (!selected) errs.team = t('signup.errorSelectTeam')
    if (Object.keys(errs).length) { f.setError(''); f.fe.fail(errs); return }

    f.setError(''); f.setLoading(true)
    let cred = null
    try {
      // Vedi CreateTeamStep: evita il flash "errore con questo account"
      // nella finestra tra creazione utente Auth e scrittura del profilo.
      setSignupInProgress(true)
      cred = await createSignupUser(f.email.trim(), f.password)

      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        role: 'worker',
        teamId: selected.id,
        approved: false,
        active: true,
        createdAt: new Date().toISOString(),
        consentAcceptedAt: new Date().toISOString(),
        consentVersion: 'v1',
      })

      // Avvisa gli admin (email, push, popup in app) e ringrazia chi ha chiesto. Best-effort e senza attendere:
      // la richiesta è già salvata, un errore qui non deve fermare nessuno.
      cred.user.getIdToken().then(idToken => fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: 'joinRequest' }),
      })).catch(() => {})

      onDone()
    } catch (err) {
      if (cred) await deleteUser(cred.user).catch(() => {})
      showAuthError(err)
      f.setLoading(false)
    } finally {
      setSignupInProgress(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="auth-card">
        <BackButton onClick={onBack} />
        <h2 style={{ fontSize:22, fontWeight:700, color:'rgb(var(--au-fg))', marginBottom:6, letterSpacing:'-0.3px' }}>
          {t('signup.joinTeamTitle')}
        </h2>
        <p style={{ fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.35))', marginBottom:22 }}>
          {t('signup.joinTeamDesc')}
        </p>

        <ErrorBox error={f.error} />

        <Field label={t('signup.companyNameLabel')} error={f.fe.errors.team}>
          <input
            className={f.fe.cls('team')}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null); f.fe.clear('team') }}
            placeholder={t('signup.searchCompanyPlaceholder')}
            autoComplete="off"
          />
          {search.trim() && !selected && (
            <div style={{ marginTop:8, border:'1px solid rgba(var(--au-fg), calc(var(--au-k) * 0.1))', borderRadius:10, overflow:'hidden' }}>
              {searching && <div style={{ padding:'10px 14px', fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))' }}>{t('signup.searching')}</div>}
              {!searching && results.length === 0 && (
                <div style={{ padding:'10px 14px', fontSize:13, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))' }}>{t('signup.noTeamsFound')}</div>
              )}
              {!searching && results.map(team => (
                <button
                  type="button"
                  key={team.id}
                  onClick={() => { setSelected(team); setSearch(team.name) }}
                  style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:'rgba(var(--au-fg), calc(var(--au-k) * 0.04))', border:'none', borderTop:'1px solid rgba(var(--au-fg), calc(var(--au-k) * 0.06))', color:'rgb(var(--au-fg))', fontSize:14, cursor:'pointer' }}
                >
                  {team.name}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div style={{ marginTop:8, fontSize:12, color:'rgba(167,199,87,0.9)' }}>{t('signup.teamSelected', { name: selected.name })}</div>
          )}
        </Field>
        <Field label={t('signup.yourNameLabel')} error={f.fe.errors.name}>
          <input className={f.fe.cls('name')} type="text" value={f.name} onChange={e => f.setName(e.target.value)} placeholder={t('signup.yourNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.emailLabel')} error={f.fe.errors.email}>
          <input className={f.fe.cls('email')} type="email" value={f.email} onChange={e => f.setEmail(e.target.value)} placeholder={t('signup.emailPlaceholder')} required autoComplete="email" />
        </Field>
        <Field label={t('signup.passwordLabel')} marginBottom={20} error={f.fe.errors.password}>
          <PasswordInput className={f.fe.cls('password')} value={f.password} onChange={e => f.setPassword(e.target.value)} required autoComplete="new-password" showStrength />
        </Field>

        <ConsentCheckbox checked={f.consent} onChange={f.setConsent} error={f.fe.errors.consent} flashClass={f.fe.cls('consent', '').trim()} />

        <button className="auth-btn" type="submit" disabled={f.loading}>
          {f.loading ? t('signup.sendingRequest') : t('signup.requestAccess')}
        </button>
      </div>
    </form>
  )
}

function BackButton({ onClick }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background:'transparent', border:'none', color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))', fontSize:13, padding:0, marginBottom:16, cursor:'pointer' }}
    >
      ← {t('common.back')}
    </button>
  )
}

function ErrorBox({ error }) {
  if (!error) return null
  return (
    <div style={{
      background:'rgba(230,57,70,0.12)', border:'1px solid rgba(230,57,70,0.35)',
      color:'#ff9090', borderRadius:10, padding:'10px 14px',
      marginBottom:20, fontSize:13, lineHeight:1.4,
    }}>
      {error}
    </div>
  )
}

function Field({ label, children, marginBottom = 16, error }) {
  return (
    <div style={{ marginBottom }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(var(--au-fg), calc(var(--au-k) * 0.4))', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  )
}
