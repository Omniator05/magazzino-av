import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { auth } from '../firebase'
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword as fbUpdatePassword } from 'firebase/auth'
import { useModalDrag } from '../hooks/useModalDrag'
import { useModalScrollLock } from '../hooks/useModalScrollLock'

const AVATARS = [
  // Espressioni — le più usate come avatar
  '😊','😎','😄','🤓','😏','🤠','🥳','😤',
  // Energia / personalità
  '💪','🔥','⚡','⭐','🏆','🎯','🚀','🌟',
  // Lavoro & settore AV
  '👷','🔧','🎚️','🔊','📦','🚛','🛠️','🎛️',
  // Due un po' giocosi + classici da avatar
  '🤖','🦄','🦁','🐻','🦊','☕','🎸','🎵',
]

const IconPencil = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
)

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

// Card modale (non più pagina a sé) aperta sopra Dashboard/WorkerHome tramite
// tap sull'avatar — evita i bordi vuoti laterali che una pagina "page-narrow"
// centrata avrebbe su desktop, dato che ora il contenuto è compatto.
export default function Profile({ onClose }) {
  const { t, i18n } = useTranslation()
  const { profile, user, updateProfileData } = useAuth()
  const [savingLang, setSavingLang] = useState(false)
  const drag = useModalDrag(onClose, undefined, undefined, true)
  useModalScrollLock(true)

  const [name, setName]           = useState(profile?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameOk, setNameOk]       = useState(false)

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiDrag = useModalDrag(() => setShowEmojiPicker(false))

  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [savingPwd,   setSavingPwd]   = useState(false)
  const [pwdError,    setPwdError]    = useState('')
  const [pwdOk,       setPwdOk]       = useState(false)
  const [pwdOpen,     setPwdOpen]     = useState(false)

  const avatar  = profile?.avatar || null
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

  const selectEmoji = async (emoji) => {
    await updateProfileData({ avatar: emoji })
    setShowEmojiPicker(false)
  }

  const removeEmoji = async () => {
    await updateProfileData({ avatar: null })
    setShowEmojiPicker(false)
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

  return (
    <div className={`modal-overlay${drag.closing ? ' closing' : ''}`} onClick={drag.onOverlayClick}>
      <div className={`modal${drag.jiggling ? ' modal-jiggle' : ''}${drag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...drag.props}>
        <button className="close-btn" onClick={drag.close}>✕</button>
        <h2>{t('profile.title')}</h2>

        {/* Riga identità — orizzontale, non più un hero centrato */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 0 20px' }}>
          <button
            onClick={() => setShowEmojiPicker(true)}
            aria-label={t('profile.chooseAvatar')}
            style={{
              position: 'relative', width: 60, height: 60, borderRadius: 18, flexShrink: 0,
              background: 'linear-gradient(135deg,#3b4a66 0%,#222c42 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: avatar ? 30 : 24, color: 'white', fontWeight: 800,
              boxShadow: '0 6px 18px rgba(34,44,66,0.28)', border: 'none', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {avatar || initial}
            <span style={{
              position: 'absolute', bottom: -3, right: -3,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--accent)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--bg)',
              boxShadow: '0 2px 6px rgba(230,57,70,0.4)',
            }}>
              <IconPencil />
            </span>
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.name || profile?.username}
            </p>
            <span style={{
              display: 'inline-block', marginTop: 5,
              background: profile?.role === 'admin' ? 'rgba(37,99,235,0.10)' : 'rgba(5,150,105,0.10)',
              color:      profile?.role === 'admin' ? '#2563eb' : '#059669',
              border:    `1px solid ${profile?.role === 'admin' ? 'rgba(37,99,235,0.22)' : 'rgba(5,150,105,0.22)'}`,
              borderRadius: 20, padding: '3px 12px', fontSize: 11.5, fontWeight: 700,
            }}>
              {role}
            </span>
          </div>
        </div>

        {/* Gruppo: Account (nome + lingua) */}
        <GroupCard label={t('profile.sectionInfo')}>
          <Row first>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={rowLabelStyle}>{t('profile.displayName')}</label>
              <input
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
                style={{ flexShrink: 0, background: 'rgba(230,57,70,0.10)', color: 'var(--accent)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {nameOk ? <><IconCheck /> {t('profile.saved')}</> : savingName ? t('profile.saving') : t('profile.saveName')}
              </button>
            )}
          </Row>
          <Row>
            <span style={rowLabelStyle}>{t('profile.sectionLanguage')}</span>
            <div style={{ display: 'flex', gap: 4, background: 'var(--card2)', borderRadius: 10, padding: 3, flexShrink: 0 }}>
              {[
                { code: 'it', label: t('profile.languageItalian') },
                { code: 'en', label: t('profile.languageEnglish') },
              ].map(l => (
                <button
                  key={l.code}
                  onClick={() => selectLanguage(l.code)}
                  disabled={savingLang}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: 'none',
                    background: (profile?.language || 'it') === l.code ? 'var(--accent)' : 'transparent',
                    color: (profile?.language || 'it') === l.code ? 'white' : 'var(--text2)',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Row>
        </GroupCard>

        {/* Gruppo: Sicurezza — cambio password a comparsa, chiuso di default */}
        <GroupCard label={t('profile.sectionSecurity')}>
          <button
            onClick={() => setPwdOpen(v => !v)}
            className="btn-no-anim"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', textAlign: 'left' }}
          >
            <span style={{ color: 'var(--text2)', flexShrink: 0, display: 'flex' }}><IconLock /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.changePassword')}</span>
            {pwdOk && <span style={{ color: 'var(--green)', display: 'flex' }}><IconCheck /></span>}
            <span style={{ color: 'var(--text3)', display: 'flex' }}><IconChevronDown open={pwdOpen} /></span>
          </button>
          {pwdOpen && (
            <div style={{ padding: '2px 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>{t('profile.currentPassword')}</label>
                <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label>{t('profile.newPassword')}</label>
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t('profile.newPasswordPlaceholder')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t('profile.confirmPassword')}</label>
                <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder={t('profile.confirmPasswordPlaceholder')} />
              </div>
              {pwdError && (
                <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>{pwdError}</p>
              )}
              <button
                onClick={changePassword}
                disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
                className="btn btn-primary btn-full"
                style={{ marginTop: 14, opacity: (savingPwd || !currentPwd || !newPwd || !confirmPwd) ? 0.45 : 1 }}
              >
                {pwdOk
                  ? <><IconCheck /> {t('profile.passwordChanged')}</>
                  : savingPwd ? t('profile.changingPassword') : t('profile.changePassword')}
              </button>
            </div>
          )}
        </GroupCard>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className={`modal-overlay${emojiDrag.closing ? ' closing' : ''}`} onClick={emojiDrag.onOverlayClick}>
            <div className={`modal${emojiDrag.jiggling ? ' modal-jiggle' : ''}${emojiDrag.closing ? ' closing' : ''}`} style={{ position: 'relative' }} {...emojiDrag.props}>
              <button className="close-btn" onClick={emojiDrag.close}>✕</button>
              <h2>{t('profile.chooseAvatar')}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: avatar ? 14 : 0 }}>
                {AVATARS.map(em => (
                  <button
                    key={em}
                    onClick={() => selectEmoji(em)}
                    style={{
                      fontSize: 26, padding: '6px 0', borderRadius: 10, cursor: 'pointer',
                      background: avatar === em ? 'rgba(230,57,70,0.10)' : 'var(--card2)',
                      border: avatar === em ? '2px solid var(--accent)' : '2px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              {avatar && (
                <button
                  onClick={removeEmoji}
                  style={{ width: '100%', marginTop: 4, padding: '10px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}
                >
                  {t('profile.removeAvatar')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const rowLabelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }
const nameInputStyle = { border: '1.5px solid var(--border)', background: 'var(--card2)', borderRadius: 10, padding: '9px 12px', fontSize: 15.5, fontWeight: 600, color: 'var(--text)', width: '100%' }

// Stile "lista raggruppata" (come le impostazioni di iOS/Android): un unico
// card per gruppo, righe separate da un filo invece di più card impilate —
// occupa meno spazio verticale e rende la pagina meno "centrale/a blocchi".
function GroupCard({ label, children }) {
  return (
    <div style={{ padding: '0 0 20px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>{label}</p>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
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
      borderTop: first ? 'none' : '1px solid var(--border)',
    }}>
      {children}
    </div>
  )
}
