import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { auth, db } from '../firebase'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { useAuth, usernameToEmail } from '../context/AuthContext'
import { uploadTeamLogo, deleteTeamLogo, ACCEPT_LOGO_ATTR, ALLOWED_LOGO_TYPES } from '../utils/teamStorage'
import { Check, User } from '../components/Icon'
import AuthBackground from '../components/AuthBackground'

const STEPS = ['logo', 'worker', 'done']

// Prima schermata vista da chi ha appena creato una nuova squadra (non da chi
// si unisce a una esistente, quella finisce su PendingApproval). Sostituisce
// l'atterraggio a freddo sulla Dashboard vuota con due passaggi opzionali —
// logo squadra e primo magazziniere — sempre saltabili (mai un tour bloccato).
// Stesso sfondo animato scuro di login/signup (AuthBackground): il percorso
// guidato è ancora "fuori" dall'app vera e propria.
export default function Welcome() {
  const { t } = useTranslation()
  const { user, team, teamId, updateTeamData, setOnboardingReveal } = useAuth()
  const [step, setStep] = useState('logo')
  const stepIndex = STEPS.indexOf(step)
  const [mounted, setMounted] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  // ── Step logo ──
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !teamId) return
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) { setLogoError(t('adminUsers.errorLogoType')); return }
    if (file.size > 3 * 1024 * 1024) { setLogoError(t('adminUsers.errorLogoSize')); return }
    setLogoError(''); setLogoUploading(true)
    try {
      const oldPath = team?.logoPath
      const { url, path } = await uploadTeamLogo(file, teamId)
      await updateTeamData({ logoUrl: url, logoPath: path })
      if (oldPath) await deleteTeamLogo(oldPath)
    } catch {
      setLogoError(t('adminUsers.errorLogoUpload'))
    } finally { setLogoUploading(false) }
  }

  // ── Step primo worker ──
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [workerError, setWorkerError] = useState('')
  const [creatingWorker, setCreatingWorker] = useState(false)
  const [workerCreated, setWorkerCreated] = useState(false)

  const createFirstWorker = async () => {
    if (!form.name.trim() || !form.username.trim() || form.password.length < 6) {
      setWorkerError(t('welcome.errorFillFields')); return
    }
    setCreatingWorker(true); setWorkerError('')
    const username = form.username.toLowerCase().trim().replace(/\s+/g, '.')
    const internalEmail = usernameToEmail(username)
    const adminEmail = auth.currentUser.email
    const adminPassword = sessionStorage.getItem('__ap')

    try {
      // createUserWithEmailAndPassword switcha la sessione al nuovo utente:
      // rientriamo come admin subito dopo (stesso pattern di AdminUsers.jsx).
      const cred = await createUserWithEmailAndPassword(auth, internalEmail, form.password)
      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: form.name.trim(),
        username,
        internalEmail,
        role: 'worker',
        teamId,
        approved: true,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      })
      if (adminPassword) await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
      setWorkerCreated(true)
      setTimeout(() => setStep('done'), 900)
    } catch (err) {
      setWorkerError(err.code === 'auth/email-already-in-use' ? t('welcome.errorUsernameTaken') : t('welcome.errorGeneric'))
    } finally { setCreatingWorker(false) }
  }

  // Chiusura in due tempi: prima un piccolo anello che pulsa localmente
  // attorno al segno di spunta (l'anticipo), poi il testimone passa a
  // OnboardingReveal — un cerchio che si allarga fino a coprire tutto lo
  // schermo, cambia rotta verso la Dashboard SOLO a copertura totale (quindi
  // invisibile), e infine sfuma svelandola. Vive fuori da questo componente
  // (in App.jsx, sempre montato) apposta: se il cerchio fosse qui dentro,
  // smontare Welcome al cambio rotta lo farebbe sparire di scatto a metà
  // animazione, con la Dashboard che lampeggia per un istante prima del
  // ritorno dell'overlay — esattamente il difetto segnalato.
  const finish = () => {
    if (finishing) return
    setFinishing(true)
    updateTeamData({ onboarded: true })
    setTimeout(() => setOnboardingReveal(true), 550)
  }

  return (
    <AuthBackground>
      <style>{`
        @keyframes welcomeCardIn {
          from { opacity:0; transform:translateY(24px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes welcomeRingPulse {
          from { transform:scale(1); opacity:0.9; }
          to   { transform:scale(2.2); opacity:0; }
        }
        @keyframes welcomeRingPulse2 {
          from { transform:scale(1); opacity:0.6; }
          to   { transform:scale(1.7); opacity:0; }
        }
      `}</style>

      <div style={{
        position:'relative', zIndex:1, width:'100%', maxWidth:440,
        background:'var(--card)', borderRadius:26, padding:'40px 32px 36px',
        boxShadow:'0 24px 70px rgba(0,0,0,0.45)', boxSizing:'border-box',
        opacity: mounted ? 1 : 0,
        animation: mounted ? 'welcomeCardIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
      }}>

        {/* Progresso */}
        <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ width: i === stepIndex ? 22 : 8, height:8, borderRadius:4, background: i <= stepIndex ? 'var(--accent)' : 'var(--border)', transition:'all 0.3s ease' }} />
          ))}
        </div>

        {step === 'logo' && (
          <div style={{ textAlign:'center' }}>
            <h1 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>{t('welcome.logoTitle', { team: team?.name || '' })}</h1>
            <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.5, marginBottom:28 }}>{t('welcome.logoDesc')}</p>

            <div style={{ width:120, height:120, borderRadius:24, margin:'0 auto 20px', background:'var(--card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              <img src={team?.logoUrl || '/logo-default.svg'} alt="" style={{ width: team?.logoUrl ? '100%' : '55%', height: team?.logoUrl ? '100%' : '55%', objectFit:'contain', opacity: team?.logoUrl ? 1 : 0.4 }} />
            </div>

            {logoError && <p style={{ color:'var(--accent)', fontSize:13, marginBottom:12 }}>{logoError}</p>}

            <label className="btn btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:7, cursor: logoUploading ? 'default' : 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
              {logoUploading ? t('adminUsers.uploadingLogo') : (team?.logoUrl ? t('adminUsers.changeLogo') : t('welcome.uploadLogoButton'))}
              <input type="file" accept={ACCEPT_LOGO_ATTR} onChange={handleLogoChange} disabled={logoUploading} style={{ display:'none' }} />
            </label>

            <div style={{ display:'flex', gap:10, marginTop:32 }}>
              <button onClick={() => setStep('worker')} className="btn-no-anim" style={{ flex:1, padding:13, borderRadius:12, background:'transparent', color:'var(--text2)', fontWeight:700, fontSize:14 }}>
                {t('welcome.skip')}
              </button>
              <button onClick={() => setStep('worker')} className="btn btn-primary" style={{ flex:1 }}>
                {t('welcome.continue')}
              </button>
            </div>
          </div>
        )}

        {step === 'worker' && (
          <div>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <h1 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>{t('welcome.workerTitle')}</h1>
              <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.5 }}>{t('welcome.workerDesc')}</p>
            </div>

            {workerCreated ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(52,211,153,0.12)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                  <Check size={26} />
                </div>
                <p style={{ fontWeight:700, fontSize:15 }}>{t('welcome.workerCreatedToast', { name: form.name })}</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>{t('welcome.workerNameLabel')}</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('welcome.workerNamePlaceholder')} autoFocus />
                </div>
                <div className="form-group">
                  <label>{t('welcome.workerUsernameLabel')}</label>
                  <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="es. marco.rossi" autoCapitalize="none" autoCorrect="off" />
                </div>
                <div className="form-group">
                  <label>{t('welcome.workerPasswordLabel')}</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                </div>

                {workerError && <p style={{ color:'var(--accent)', fontSize:13, fontWeight:600, marginBottom:12 }}>{workerError}</p>}

                <div style={{ display:'flex', gap:10, marginTop:20 }}>
                  <button onClick={() => setStep('done')} className="btn-no-anim" style={{ flex:1, padding:13, borderRadius:12, background:'transparent', color:'var(--text2)', fontWeight:700, fontSize:14 }}>
                    {t('welcome.skip')}
                  </button>
                  <button onClick={createFirstWorker} disabled={creatingWorker} className="btn btn-primary" style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                    <User size={15} /> {creatingWorker ? t('welcome.creatingWorker') : t('welcome.createWorker')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign:'center' }}>
            <div style={{ position:'relative', width:64, height:64, margin:'0 auto 20px' }}>
              {finishing && (
                <>
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid var(--accent)', animation:'welcomeRingPulse 0.7s ease-out both' }} />
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid var(--accent)', animation:'welcomeRingPulse2 0.7s ease-out 0.12s both' }} />
                </>
              )}
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(230,57,70,0.10)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Check size={28} />
              </div>
            </div>
            <div style={{ opacity: finishing ? 0 : 1, transition:'opacity 0.3s ease' }}>
              <h1 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>{t('welcome.doneTitle')}</h1>
              <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.5, marginBottom:28 }}>{t('welcome.doneDesc')}</p>
            </div>
            <button onClick={finish} disabled={finishing} className="btn btn-primary btn-full" style={{ opacity: finishing ? 0.7 : 1 }}>
              {finishing ? t('welcome.launching') : t('welcome.goToDashboard')}
            </button>
          </div>
        )}
      </div>
    </AuthBackground>
  )
}
