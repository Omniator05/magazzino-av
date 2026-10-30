import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { auth } from '../firebase'
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword as fbUpdatePassword } from 'firebase/auth'
import { useCenteredModal } from '../hooks/useCenteredModal'
import { useModalScrollLock } from '../hooks/useModalScrollLock'
import SegmentedControl from '../components/SegmentedControl'
import Picker from '../components/Picker'
import LogoutButton from '../components/LogoutButton'
import { getThemePref, setThemePref } from '../utils/theme'
import { hasUnseenWhatsNew } from '../utils/whatsNew'
import { isProPlan } from '../utils/planLimits'
import { fetchMyBadge } from '../utils/operatorBadge'
import { generateQRDataURL } from '../utils/generateCode'
import { useConfirm } from '../context/ConfirmProvider'
import { isPushAvailable, isPushEnabled, enablePushNotifications, disablePushNotifications } from '../utils/pushNotifications'

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const IconChevronDown = ({ open }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const IconLock = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)

const IconBell = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

// Stesso pattern "pillola col pallino" di Switch in SettingsModules.jsx —
// duplicato qui (non estratto in un componente condiviso) perché per ora è
// l'unico altro punto che ne ha bisogno in tutta l'app.
function Switch({ enabled, onClick, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 46, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative',
        background: enabled ? '#e63946' : 'var(--c-dash)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: enabled ? 23 : 3,
        width: 20, height: 20, borderRadius: '50%', background: 'var(--c-surface)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s ease',
      }} />
    </button>
  )
}

// Card modale (non più pagina a sé) aperta sopra Dashboard/WorkerHome tramite
// tap sull'avatar — evita i bordi vuoti laterali che una pagina "page-narrow"
// centrata avrebbe su desktop, dato che ora il contenuto è compatto.
// Popup centrato (stile dialogo, come il tutorial o la conferma di logout)
// invece di bottom-sheet: le impostazioni non sono un'azione rapida da un
// contesto, meritano la stessa "finestra" delle altre schermate di sistema.
export default function Profile({ onClose, showLogout }) {
  const { t, i18n } = useTranslation()
  const { profile, user, team, updateProfileData } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  // Badge QR personale per lavorare a proprio nome alla Postazione magazzino (solo piani a
  // pagamento, e non per l'account della postazione stessa). Il codice sta sul server.
  const showBadge = isProPlan(team) && !profile?.isStation
  const [badgeOpen, setBadgeOpen] = useState(false)
  const [badgeQr, setBadgeQr] = useState('')
  const [badgePin, setBadgePin] = useState('')
  const [badgeBusy, setBadgeBusy] = useState(false)
  const [badgeError, setBadgeError] = useState('')
  const loadBadge = async (regenerate = false) => {
    setBadgeBusy(true); setBadgeError('')
    try {
      const { code, pin } = await fetchMyBadge(regenerate)
      setBadgePin(pin)
      setBadgeQr(await generateQRDataURL(code, 360))
    } catch { setBadgeError(t('badge.loadError')) } finally { setBadgeBusy(false) }
  }
  const openBadge = () => { setBadgeOpen(true); if (!badgeQr) loadBadge() }
  const regenerateBadge = async () => {
    const ok = await confirm({ title: t('badge.regenTitle'), message: t('badge.regenMessage'), confirmLabel: t('badge.regenConfirm'), danger: true })
    if (ok) loadBadge(true)
  }
  const [savingLang, setSavingLang] = useState(false)
  const modal = useCenteredModal(onClose)
  useModalScrollLock(true)

  const [themePref, setThemePrefState] = useState(getThemePref)
  const [name, setName]           = useState(profile?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameOk, setNameOk]       = useState(false)

  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [savingPwd,   setSavingPwd]   = useState(false)
  const [pwdError,    setPwdError]    = useState('')
  const [pwdOk,       setPwdOk]       = useState(false)
  const [pwdOpen,     setPwdOpen]     = useState(false)

  // null finché non si sa se il browser/dispositivo supporta le push (es. su
  // iPhone serve l'app installata in Home — vedi testo mostrato quando false).
  const [pushSupported, setPushSupported] = useState(null)
  const [pushEnabled,   setPushEnabled]   = useState(false)
  const [pushBusy,      setPushBusy]      = useState(false)
  const [pushError,     setPushError]     = useState('')
  useEffect(() => {
    isPushAvailable().then(setPushSupported)
    setPushEnabled(isPushEnabled())
  }, [])

  const togglePush = async () => {
    setPushError('')
    setPushBusy(true)
    try {
      if (pushEnabled) {
        await disablePushNotifications()
        setPushEnabled(false)
      } else {
        const ok = await enablePushNotifications()
        if (ok) setPushEnabled(true)
        else setPushError(t('profile.pushPermissionDenied'))
      }
    } catch {
      setPushError(t('profile.pushGenericError'))
    } finally {
      setPushBusy(false)
    }
  }

  const initial = (profile?.name || profile?.username || '?').charAt(0).toUpperCase()
  const role    = profile?.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleWorker')

  const saveName = async () => {
    if (!name.trim() || name.trim() === profile?.name) return
    setSavingName(true)
    try {
      await updateProfileData({ name: name.trim() })
      setNameOk(true)
      setTimeout(() => setNameOk(false), 2500)
    } finally { setSavingName(false) }
  }

  const changePassword = async () => {
    setPwdError('')
    if (!currentPwd)       { setPwdError(t('profile.errorCurrentPassword')); return }
    if (newPwd.length < 6) { setPwdError(t('profile.errorPasswordLength')); return }
    if (newPwd !== confirmPwd) { setPwdError(t('profile.errorPasswordMismatch')); return }

    setSavingPwd(true)
    try {
      const email = profile?.internalEmail ||
        `${(profile?.username || '').toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}@theservice.internal`
      const credential = EmailAuthProvider.credential(email, currentPwd)
      await reauthenticateWithCredential(user, credential)
      await fbUpdatePassword(user, newPwd)
      sessionStorage.setItem('__ap', newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setPwdOk(true)
      setTimeout(() => setPwdOk(false), 3000)
    } catch(e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setPwdError(t('profile.errorWrongPassword'))
      } else {
        setPwdError(t('profile.errorGeneric'))
      }
    } finally { setSavingPwd(false) }
  }

  const selectLanguage = async (lang) => {
    if (lang === (profile?.language || 'it')) return
    setSavingLang(true)
    try {
      await updateProfileData({ language: lang })
    } finally { setSavingLang(false) }
  }

  const srOnlyStyle = { position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', whiteSpace:'nowrap', border:0, clip:'rect(0,0,0,0)' }

  return (
    <div
      onClick={modal.close}
      style={{ position:'fixed', inset:0, zIndex:10050, background:'rgba(10,12,18,0.5)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24, animation: modal.closing ? 'profFadeOut 0.2s ease forwards' : 'profFadeIn 0.15s ease' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="rc-ev-form"
        style={{ position:'relative', background:'var(--c-sheet)', borderRadius:24, padding:'22px 20px 20px', width:'100%', maxWidth:400, maxHeight:'85dvh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,0.35)', animation: modal.closing ? 'profPopOut 0.2s ease forwards' : 'profPopIn 0.28s cubic-bezier(0.32,0.72,0,1)' }}
      >
        {/* Il nome/password salvati e l'errore di password sono solo visivi
            (testo del bottone che cambia, o un paragrafo rosso) — senza
            queste regioni chi usa uno screen reader non li sentirebbe mai. */}
        <div aria-live="polite" role="status" style={srOnlyStyle}>
          {nameOk ? t('profile.saved') : ''}{pwdOk ? ` ${t('profile.passwordChanged')}` : ''}
        </div>
        <div aria-live="assertive" role="alert" style={srOnlyStyle}>{pwdError}</div>
        <button onClick={modal.close} aria-label={t('common.close')} className="btn-no-anim"
          style={{ position:'absolute', top:16, right:16, width:32, height:32, borderRadius:10, background:'var(--c-fill2)', color:'var(--c-ink2)', fontSize:15, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>

        {/* Identità: iniziale in un cerchio, nome e ruolo */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'4px 40px 22px 0' }}>
          <div aria-hidden="true" style={{ width:58, height:58, borderRadius:'50%', flexShrink:0, background:'#e63946', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:800 }}>{initial}</div>
          <div style={{ minWidth:0, flex:1 }}>
            <h2 style={{ fontSize:19, fontWeight:800, margin:0, letterSpacing:'-0.3px', color:'var(--c-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.name || profile?.username}</h2>
            <span style={{ display:'inline-block', marginTop:5, background:'var(--c-fill2)', color:'var(--c-ink2)', borderRadius:20, padding:'3px 11px', fontSize:11.5, fontWeight:700 }}>{role}</span>
          </div>
        </div>

        {/* Gruppo: Nome */}
        <GroupCard label={t('profile.sectionName')}>
          <Row first>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="prof-name" style={rowLabelStyle}>{t('profile.displayName')}</label>
              <input
                id="prof-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('profile.namePlaceholder')}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                style={nameInputStyle}
              />
            </div>
            {(name.trim() && name.trim() !== profile?.name) && (
              <button
                onClick={saveName}
                disabled={savingName}
                className="btn-no-anim"
                style={{ flexShrink: 0, minHeight: 44, background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {nameOk ? <><IconCheck /> {t('profile.saved')}</> : savingName ? t('profile.saving') : t('profile.saveName')}
              </button>
            )}
          </Row>
        </GroupCard>

        {/* Gruppo: Lingua — stesso controllo a scorrimento usato in Impostazioni */}
        <GroupCard label={t('profile.sectionLanguage')} visible>
          <div style={{ padding: 14 }}>
            <Picker
              options={[
                { value: 'it', label: t('profile.languageItalian') },
                { value: 'en', label: t('profile.languageEnglish') },
                { value: 'pt', label: t('profile.languagePortuguese') },
                { value: 'ar', label: t('profile.languageArabic') },
              ]}
              value={profile?.language || 'it'}
              onChange={selectLanguage}
              ariaLabel={t('profile.sectionLanguage')}
            />
          </div>
        </GroupCard>

        {/* Gruppo: Aspetto — chiaro, scuro o automatico (segue il sistema) */}
        <GroupCard label={t('profile.sectionAppearance')}>
          <div style={{ padding: 14 }}>
            <SegmentedControl
              options={[
                { value: 'light', label: t('profile.themeLight') },
                { value: 'dark', label: t('profile.themeDark') },
                { value: 'auto', label: t('profile.themeAuto') },
              ]}
              value={themePref}
              onChange={v => { setThemePrefState(v); setThemePref(v) }}
            />
          </div>
        </GroupCard>

        {/* Gruppo: Novità — gli aggiornamenti più importanti dell'app */}
        <GroupCard label={t('profile.sectionWhatsNew')}>
          <button
            onClick={() => { onClose(); navigate('/novita') }}
            className="btn-no-anim"
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', textAlign: 'left' }}
          >
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.whatsNewRow')}</span>
            {hasUnseenWhatsNew() && (
              <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 7, padding: '2px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{t('whatsNew.badgeNew')}</span>
            )}
            <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
          </button>
        </GroupCard>

        {/* Gruppo: Badge per il magazzino — QR personale da passare sul lettore della postazione */}
        {showBadge && (
          <GroupCard label={t('badge.section')}>
            <button onClick={() => (badgeOpen ? setBadgeOpen(false) : openBadge())} className="btn-no-anim" aria-expanded={badgeOpen}
              style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', textAlign: 'left' }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--c-ink)' }}>{t('badge.row')}</span>
              <IconChevronDown open={badgeOpen} />
            </button>
            {badgeOpen && (
              <div style={{ padding: '4px 16px 18px', borderTop: '1px solid var(--c-line)', textAlign: 'center' }}>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--c-ink2)', margin: '12px 0 14px' }}>{t('badge.hint')}</p>
                {badgeError ? (
                  <p role="alert" style={{ fontSize: 13, color: '#e63946', fontWeight: 700, margin: '0 0 12px' }}>{badgeError}</p>
                ) : badgeQr ? (
                  <img src={badgeQr} alt={t('badge.qrAlt')} width={220} height={220}
                    style={{ width: 220, height: 220, borderRadius: 12, border: '1px solid var(--c-line)', background: '#fff', opacity: badgeBusy ? 0.4 : 1, transition: 'opacity .2s' }} />
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--c-ink3)', margin: '24px 0' }}>{t('badge.loading')}</p>
                )}
                {badgePin && !badgeError && (
                  <div style={{ margin: '18px 0 0' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-ink3)' }}>{t('badge.pinLabel')}</div>
                    <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 38, fontWeight: 800, letterSpacing: '0.32em', paddingLeft: '0.32em', color: 'var(--c-ink)', lineHeight: 1.15, opacity: badgeBusy ? 0.4 : 1, transition: 'opacity .2s' }}>{badgePin}</div>
                  </div>
                )}
                <p style={{ fontSize: 12, color: 'var(--c-ink3)', margin: '16px 0 12px' }}>{t('badge.privacy')}</p>
                <button type="button" onClick={badgeError ? () => loadBadge() : regenerateBadge} disabled={badgeBusy} className="btn btn-secondary btn-full" style={{ minHeight: 44 }}>
                  {badgeError ? t('badge.retry') : t('badge.regen')}
                </button>
              </div>
            )}
          </GroupCard>
        )}

        {/* Gruppo: Sicurezza — cambio password a comparsa, chiuso di default */}
        <GroupCard label={t('profile.sectionSecurity')}>
          <button
            onClick={() => setPwdOpen(v => !v)}
            className="btn-no-anim"
            aria-expanded={pwdOpen}
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', textAlign: 'left' }}
          >
            <span style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex' }}><IconLock /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.changePassword')}</span>
            {pwdOk && <span style={{ color: 'var(--green)', display: 'flex' }}><IconCheck /></span>}
            <span style={{ color: 'var(--text3)', display: 'flex' }}><IconChevronDown open={pwdOpen} /></span>
          </button>
          {/* Animazione apertura/chiusura via grid-template-rows (0fr↔1fr)
              invece di un mount/unmount secco: il contenuto resta nel DOM,
              solo l'altezza della riga della grid anima. */}
          <div style={{ display: 'grid', gridTemplateRows: pwdOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.32s cubic-bezier(0.32,0.72,0,1)' }}>
            <div style={{ overflow: 'hidden', minHeight: 0 }} aria-hidden={!pwdOpen}>
              <div style={{ padding: '2px 16px 16px', borderTop: '1px solid var(--border)' }}>
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label htmlFor="prof-pwd-current">{t('profile.currentPassword')}</label>
                  <input id="prof-pwd-current" type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••" tabIndex={pwdOpen ? 0 : -1} />
                </div>
                <div className="form-group">
                  <label htmlFor="prof-pwd-new">{t('profile.newPassword')}</label>
                  <input id="prof-pwd-new" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t('profile.newPasswordPlaceholder')} tabIndex={pwdOpen ? 0 : -1} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="prof-pwd-confirm">{t('profile.confirmPassword')}</label>
                  <input id="prof-pwd-confirm" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder={t('profile.confirmPasswordPlaceholder')} tabIndex={pwdOpen ? 0 : -1} />
                </div>
                {pwdError && (
                  <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>{pwdError}</p>
                )}
                <button
                  onClick={changePassword}
                  disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
                  className="btn btn-primary btn-full"
                  tabIndex={pwdOpen ? 0 : -1}
                  style={{ marginTop: 14, opacity: (savingPwd || !currentPwd || !newPwd || !confirmPwd) ? 0.45 : 1 }}
                >
                  {pwdOk
                    ? <><IconCheck /> {t('profile.passwordChanged')}</>
                    : savingPwd ? t('profile.changingPassword') : t('profile.changePassword')}
                </button>
              </div>
            </div>
          </div>
        </GroupCard>

        {/* Gruppo: Notifiche push — solo se il browser/dispositivo le supporta
            (richiede anche la chiave VAPID lato Firebase, vedi .env.example);
            altrimenti si spiega perché non sono disponibili invece di
            mostrare un toggle che non farebbe nulla. */}
        {pushSupported !== false && (
          <GroupCard label={t('profile.sectionNotifications')}>
            <Row first>
              <span style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex' }}><IconBell /></span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.pushToggleLabel')}</span>
              <Switch
                enabled={pushEnabled}
                onClick={togglePush}
                disabled={pushBusy || pushSupported === null}
                label={t('profile.pushToggleLabel')}
              />
            </Row>
            <p style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>
              {t('profile.pushToggleHint')}
            </p>
            {pushError && (
              <p style={{ padding: '0 16px 14px', fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, lineHeight: 1.4 }}>{pushError}</p>
            )}
          </GroupCard>
        )}
        {pushSupported === false && (
          <GroupCard label={t('profile.sectionNotifications')}>
            <p style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              {t('profile.pushUnavailableHint')}
            </p>
          </GroupCard>
        )}

        {/* Uscita: nella Dashboard non c'è più il pulsante in alto, sta qui in fondo. */}
        {showLogout && (
          <LogoutButton name={profile?.name} style={{ width: '100%', padding: '13px 16px', borderRadius: 13, background: 'var(--c-surface)', border: '1px solid var(--c-line)', color: 'var(--c-danger)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }} />
        )}

      </div>
      <style>{`
        @keyframes profFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes profFadeOut { from{opacity:1} to{opacity:0} }
        @keyframes profPopIn   { from{opacity:0; transform:translateY(12px) scale(0.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes profPopOut  { from{opacity:1; transform:scale(1)} to{opacity:0; transform:scale(0.97)} }
      `}</style>
    </div>
  )
}

const rowLabelStyle = { display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--c-ink2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }
const nameInputStyle = { width: '100%' }

// Stile "lista raggruppata" (come le impostazioni di iOS/Android): un unico
// card per gruppo, righe separate da un filo invece di più card impilate —
// occupa meno spazio verticale e rende la pagina meno "centrale/a blocchi".
// `visible`: il contenuto può uscire dal riquadro (es. un menu a tendina che si apre verso il basso)
function GroupCard({ label, children, visible }) {
  return (
    <div style={{ padding: '0 0 20px' }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 2px' }}>{label}</p>
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 16, overflow: visible ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children, first }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, minHeight: 48,
      padding: '12px 16px',
      borderTop: first ? 'none' : '1px solid var(--c-fill)',
    }}>
      {children}
    </div>
  )
}
