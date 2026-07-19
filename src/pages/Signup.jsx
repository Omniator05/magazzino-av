import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { auth, db } from '../firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { collection, query, where, getDocs, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore'
import AuthShell from '../components/AuthShell'

export default function Signup() {
  const { t } = useTranslation()
  const [step, setStep] = useState('choice') // 'choice' | 'create' | 'join'
  const navigate = useNavigate()

  return (
    <AuthShell>
      {step === 'choice' && <ChoiceStep onChoose={setStep} />}
      {step === 'create'  && <CreateTeamStep onBack={() => setStep('choice')} onDone={() => navigate('/')} />}
      {step === 'join'    && <JoinTeamStep onBack={() => setStep('choice')} onDone={() => navigate('/')} />}

      <p style={{ textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:12, marginTop:20, letterSpacing:'0.2px' }}>
        {t('signup.alreadyHaveAccount')} <Link to="/login" style={{ color:'rgba(255,255,255,0.5)', fontWeight:600 }}>{t('signup.signIn')}</Link>
      </p>
    </AuthShell>
  )
}

function ChoiceStep({ onChoose }) {
  const { t } = useTranslation()
  return (
    <div className="auth-card">
      <h2 style={{ fontSize:22, fontWeight:700, color:'white', marginBottom:6, letterSpacing:'-0.3px' }}>
        {t('signup.createAccountTitle')}
      </h2>
      <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginBottom:26 }}>
        {t('signup.howToStart')}
      </p>

      <button
        className="auth-btn"
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
        <div style={{ fontSize:15, fontWeight:700, color:'white' }}>{t('signup.joinTeamOption')}</div>
        <div style={{ fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{t('signup.joinTeamOptionDesc')}</div>
      </button>
    </div>
  )
}

function useSignupForm() {
  const { t } = useTranslation()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const validateCommon = () => {
    if (!name.trim()) return t('signup.errorNameRequired')
    if (!email.trim()) return t('signup.errorEmailRequired')
    if (password.length < 6) return t('signup.errorPasswordLength')
    return ''
  }

  return { name, setName, email, setEmail, password, setPassword, error, setError, loading, setLoading, validateCommon }
}

function CreateTeamStep({ onBack, onDone }) {
  const { t } = useTranslation()
  const ERROR_MSGS = {
    'auth/email-already-in-use': t('signup.errorEmailInUse'),
    'auth/weak-password':        t('signup.errorWeakPassword'),
    'auth/invalid-email':        t('signup.errorInvalidEmail'),
  }
  const f = useSignupForm()
  const [companyName, setCompanyName] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    const commonErr = f.validateCommon()
    if (commonErr) { f.setError(commonErr); return }
    if (!companyName.trim()) { f.setError(t('signup.errorCompanyNameRequired')); return }

    f.setError(''); f.setLoading(true)
    const nameLower = companyName.trim().toLowerCase()

    try {
      // Blocca nomi azienda duplicati (case-insensitive) per evitare confusione
      // nel flusso "unisciti a squadra esistente".
      const dupQ = query(collection(db, 'teams'), where('nameLower', '==', nameLower))
      const dupSnap = await getDocs(dupQ)
      if (!dupSnap.empty) {
        f.setError(t('signup.errorCompanyExists'))
        f.setLoading(false)
        return
      }

      const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password)

      const teamRef = await addDoc(collection(db, 'teams'), {
        name: companyName.trim(),
        nameLower,
        createdAt: serverTimestamp(),
        createdByUid: cred.user.uid,
      })

      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        role: 'admin',
        teamId: teamRef.id,
        approved: true,
        active: true,
        createdAt: new Date().toISOString(),
      })

      onDone()
    } catch (err) {
      f.setError(ERROR_MSGS[err.code] || t('signup.errorSignupFailed'))
      f.setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-card">
        <BackButton onClick={onBack} />
        <h2 style={{ fontSize:22, fontWeight:700, color:'white', marginBottom:6, letterSpacing:'-0.3px' }}>
          {t('signup.newTeamTitle')}
        </h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginBottom:22 }}>
          {t('signup.newTeamDesc')}
        </p>

        <ErrorBox error={f.error} />

        <Field label={t('signup.companyNameLabel')}>
          <input className="auth-input" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t('signup.companyNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.yourNameLabel')}>
          <input className="auth-input" type="text" value={f.name} onChange={e => f.setName(e.target.value)} placeholder={t('signup.yourNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.emailLabel')}>
          <input className="auth-input" type="email" value={f.email} onChange={e => f.setEmail(e.target.value)} placeholder={t('signup.emailPlaceholder')} required autoComplete="email" />
        </Field>
        <Field label={t('signup.passwordLabel')} marginBottom={28}>
          <input className="auth-input" type="password" value={f.password} onChange={e => f.setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
        </Field>

        <button className="auth-btn" type="submit" disabled={f.loading}>
          {f.loading ? t('signup.creatingTeam') : t('signup.createTeam')}
        </button>
      </div>
    </form>
  )
}

function JoinTeamStep({ onBack, onDone }) {
  const { t } = useTranslation()
  const ERROR_MSGS = {
    'auth/email-already-in-use': t('signup.errorEmailInUse'),
    'auth/weak-password':        t('signup.errorWeakPassword'),
    'auth/invalid-email':        t('signup.errorInvalidEmail'),
  }
  const f = useSignupForm()
  const [search, setSearch]     = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const term = search.trim().toLowerCase()
    if (!term) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const q = query(
          collection(db, 'teams'),
          where('nameLower', '>=', term),
          where('nameLower', '<=', term + ''),
        )
        const snap = await getDocs(q)
        setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const handleSubmit = async e => {
    e.preventDefault()
    const commonErr = f.validateCommon()
    if (commonErr) { f.setError(commonErr); return }
    if (!selected) { f.setError(t('signup.errorSelectTeam')); return }

    f.setError(''); f.setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password)

      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        role: 'worker',
        teamId: selected.id,
        approved: false,
        active: true,
        createdAt: new Date().toISOString(),
      })

      onDone()
    } catch (err) {
      f.setError(ERROR_MSGS[err.code] || t('signup.errorSignupFailed'))
      f.setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-card">
        <BackButton onClick={onBack} />
        <h2 style={{ fontSize:22, fontWeight:700, color:'white', marginBottom:6, letterSpacing:'-0.3px' }}>
          {t('signup.joinTeamTitle')}
        </h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginBottom:22 }}>
          {t('signup.joinTeamDesc')}
        </p>

        <ErrorBox error={f.error} />

        <Field label={t('signup.companyNameLabel')}>
          <input
            className="auth-input"
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null) }}
            placeholder={t('signup.searchCompanyPlaceholder')}
            autoComplete="off"
          />
          {search.trim() && !selected && (
            <div style={{ marginTop:8, border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, overflow:'hidden' }}>
              {searching && <div style={{ padding:'10px 14px', fontSize:13, color:'rgba(255,255,255,0.4)' }}>{t('signup.searching')}</div>}
              {!searching && results.length === 0 && (
                <div style={{ padding:'10px 14px', fontSize:13, color:'rgba(255,255,255,0.4)' }}>{t('signup.noTeamsFound')}</div>
              )}
              {!searching && results.map(team => (
                <button
                  type="button"
                  key={team.id}
                  onClick={() => { setSelected(team); setSearch(team.name) }}
                  style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:'rgba(255,255,255,0.04)', border:'none', borderTop:'1px solid rgba(255,255,255,0.06)', color:'white', fontSize:14, cursor:'pointer' }}
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
        <Field label={t('signup.yourNameLabel')}>
          <input className="auth-input" type="text" value={f.name} onChange={e => f.setName(e.target.value)} placeholder={t('signup.yourNamePlaceholder')} required />
        </Field>
        <Field label={t('signup.emailLabel')}>
          <input className="auth-input" type="email" value={f.email} onChange={e => f.setEmail(e.target.value)} placeholder={t('signup.emailPlaceholder')} required autoComplete="email" />
        </Field>
        <Field label={t('signup.passwordLabel')} marginBottom={28}>
          <input className="auth-input" type="password" value={f.password} onChange={e => f.setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
        </Field>

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
      style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:13, padding:0, marginBottom:16, cursor:'pointer' }}
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

function Field({ label, children, marginBottom = 16 }) {
  return (
    <div style={{ marginBottom }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
